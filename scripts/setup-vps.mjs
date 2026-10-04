import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const inputOrigin = process.argv[2]?.trim();

if (!inputOrigin) {
  console.error("Uso: npm run setup:vps -- http://TU_IP_PUBLICA");
  process.exit(1);
}

const normalizedOrigin = inputOrigin.replace(/\/+$/, "");

if (!/^https?:\/\/[^/\s]+$/i.test(normalizedOrigin)) {
  console.error("Debes pasar un origen valido. Ejemplo: http://203.0.113.10 o https://app.tudominio.com");
  process.exit(1);
}

const deployDir = path.join(rootDir, "deploy");
const envPath = path.join(deployDir, ".env.production");

function readEnvFile(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return {};
  }

  const content = fs.readFileSync(targetPath, "utf8");
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    result[key] = value;
  }

  return result;
}

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

const current = readEnvFile(envPath);

const content = [
  "HOST=0.0.0.0",
  "PORT=4000",
  `JWT_SECRET=${current.JWT_SECRET || randomSecret(32)}`,
  `ADMIN_TOKEN=${current.ADMIN_TOKEN || randomSecret(24)}`,
  "SQLITE_PATH=./data/datecite.db",
  "UPLOADS_PATH=./data/uploads",
  `PUBLIC_API_URL=${normalizedOrigin}`,
  `CORS_ORIGIN=${normalizedOrigin}`,
  `FIREBASE_WEB_API_KEY=${current.FIREBASE_WEB_API_KEY || ""}`,
].join("\n");

fs.mkdirSync(deployDir, { recursive: true });
fs.writeFileSync(envPath, `${content}\n`, "utf8");

console.log(`Origen publico configurado: ${normalizedOrigin}`);
console.log(`Escribi ${path.relative(rootDir, envPath)}`);
