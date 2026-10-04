import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const runtimeDir = path.join(rootDir, ".runtime", "smoke-selfhost");
const port = Number(process.env.SMOKE_PORT ?? 4517);
const baseUrl = `http://127.0.0.1:${port}`;
const keepRuntime = process.argv.includes("--keep");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

async function readJson(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.message ?? `${response.status} ${response.statusText}`);
  }

  return payload;
}

async function waitForHealth() {
  const deadline = Date.now() + 12000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      const payload = await readJson(response);
      if (payload.ok) {
        return payload;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw lastError ?? new Error("API did not become healthy");
}

async function api(pathname, options = {}) {
  const headers = new Headers(options.headers ?? {});

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body !== undefined && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return readJson(
    await fetch(`${baseUrl}${pathname}`, {
      ...options,
      headers,
      body: options.body === undefined || isFormData ? options.body : JSON.stringify(options.body),
    }),
  );
}

function cleanup() {
  if (keepRuntime) {
    return;
  }

  removeRuntimeDir();
}

function removeRuntimeDir() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(runtimeDir, {
        recursive: true,
        force: true,
      });
      return;
    } catch (error) {
      if (attempt === 7 || error?.code !== "EBUSY") {
        throw error;
      }

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 350);
    }
  }
}

removeRuntimeDir();
fs.mkdirSync(runtimeDir, { recursive: true });

console.log("Building API...");
run("npm", ["run", "build", "-w", "apps/api"]);

const env = {
  ...process.env,
  HOST: "127.0.0.1",
  PORT: String(port),
  JWT_SECRET: "smoke-secret-smoke-secret-smoke-secret",
  ADMIN_TOKEN: "smoke-admin",
  SQLITE_PATH: path.relative(rootDir, path.join(runtimeDir, "datecite.db")).replace(/\\/g, "/"),
  UPLOADS_PATH: path.relative(rootDir, path.join(runtimeDir, "uploads")).replace(/\\/g, "/"),
  PUBLIC_API_URL: baseUrl,
  CORS_ORIGIN: baseUrl,
};
delete env.FIREBASE_WEB_API_KEY;

const apiProcess = spawn("node", ["apps/api/dist/index.js"], {
  cwd: rootDir,
  env,
  shell: false,
  stdio: ["ignore", "pipe", "pipe"],
});

apiProcess.stdout.on("data", (chunk) => process.stdout.write(`[api] ${chunk}`));
apiProcess.stderr.on("data", (chunk) => process.stderr.write(`[api] ${chunk}`));

function stopApiProcess() {
  if (apiProcess.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      apiProcess.kill("SIGKILL");
    }, 5000);

    apiProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    apiProcess.kill();
  });
}

try {
  await waitForHealth();
  console.log("Health OK");

  await api("/api/launch-config");
  console.log("Launch config OK");

  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `smoke-${suffix}@contigo.local`;
  const password = "SmokePass123!";

  const registered = await api("/api/auth/register", {
    method: "POST",
    body: {
      email,
      password,
      fullName: "Smoke Tester",
      displayName: "Smoke",
      birthDate: "1995-01-01",
      city: "Local",
    },
  });

  if (!registered.token || registered.user.email !== email) {
    throw new Error("Register did not return a valid session");
  }
  console.log("Register OK");

  const loggedIn = await api("/api/auth/login", {
    method: "POST",
    body: {
      email,
      password,
    },
  });

  if (!loggedIn.token || loggedIn.user.email !== email) {
    throw new Error("Login did not return a valid session");
  }
  console.log("Login OK");

  const form = new FormData();
  form.append("file", new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), "smoke.jpg");
  const upload = await api("/api/uploads", {
    method: "POST",
    token: loggedIn.token,
    body: form,
  });

  if (!upload.path?.startsWith("/media/")) {
    throw new Error("Upload did not return a media path");
  }

  const storedFile = path.join(runtimeDir, "uploads", upload.path.replace(/^\/media\//, "").replace(/\//g, path.sep));
  if (!fs.existsSync(storedFile)) {
    throw new Error(`Uploaded file missing on disk: ${storedFile}`);
  }
  console.log("Local upload OK");

  const metrics = await api("/api/admin/metrics", {
    headers: {
      "x-admin-token": "smoke-admin",
    },
  });

  if (metrics.totals.users < 1 || !("manualPayments" in metrics.totals)) {
    throw new Error("Admin metrics missing expected totals");
  }
  console.log("Admin metrics OK");

  console.log("Self-host smoke test passed.");
} finally {
  await stopApiProcess();
  cleanup();
}
