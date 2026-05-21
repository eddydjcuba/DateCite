import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();

function isPrivateIPv4(address) {
  return (
    address.startsWith("10.") ||
    address.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  );
}

function detectLanIPv4() {
  const networks = os.networkInterfaces();
  const candidates = [];

  for (const values of Object.values(networks)) {
    for (const value of values ?? []) {
      if (value.family === "IPv4" && !value.internal) {
        candidates.push(value.address);
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  return candidates.find(isPrivateIPv4) ?? candidates[0];
}

function writeEnvFile(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${content}\n`, "utf8");
}

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

const ip = detectLanIPv4();

if (!ip) {
  console.error("No LAN IPv4 address was found. Set the env files manually.");
  process.exit(1);
}

const apiUrl = `http://${ip}:4000`;

const apiEnvPath = path.join(rootDir, "apps", "api", ".env.local");
const webEnvPath = path.join(rootDir, "apps", "web", ".env.local");
const mobileEnvPath = path.join(rootDir, "apps", "mobile", ".env.local");
const existingApiEnv = readEnvFile(apiEnvPath);
const existingMobileEnv = readEnvFile(mobileEnvPath);
const corsOrigins = [
  `http://localhost:5180`,
  `http://127.0.0.1:5180`,
  `http://${ip}:5180`,
  `http://localhost:8081`,
  `http://127.0.0.1:8081`,
  `http://${ip}:8081`,
].join(",");

writeEnvFile(
  apiEnvPath,
  [
    "HOST=0.0.0.0",
    "PORT=4000",
    `JWT_SECRET=${existingApiEnv.JWT_SECRET || randomSecret(32)}`,
    `ADMIN_TOKEN=${existingApiEnv.ADMIN_TOKEN || randomSecret(24)}`,
    "SQLITE_PATH=./data/datecite.db",
    "UPLOADS_PATH=./data/uploads",
    `PUBLIC_API_URL=${apiUrl}`,
    `CORS_ORIGIN=${corsOrigins}`,
  ].join("\n"),
);
writeEnvFile(webEnvPath, `VITE_API_URL=${apiUrl}`);
writeEnvFile(
  mobileEnvPath,
  [
    `EXPO_PUBLIC_API_URL=${apiUrl}`,
    existingMobileEnv.EXPO_PUBLIC_EAS_PROJECT_ID
      ? `EXPO_PUBLIC_EAS_PROJECT_ID=${existingMobileEnv.EXPO_PUBLIC_EAS_PROJECT_ID}`
      : "",
  ]
    .filter(Boolean)
    .join("\n"),
);

console.log(`LAN IP detected: ${ip}`);
console.log(`API URL for devices: ${apiUrl}`);
console.log(`Wrote ${path.relative(rootDir, apiEnvPath)}`);
console.log(`Wrote ${path.relative(rootDir, webEnvPath)}`);
console.log(`Wrote ${path.relative(rootDir, mobileEnvPath)}`);
