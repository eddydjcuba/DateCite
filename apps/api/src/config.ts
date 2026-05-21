import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const rootDataPath = path.resolve(process.cwd(), "data", "datecite.db");
const workspacePath = process.cwd();

function loadEnvFiles() {
  for (const fileName of [".env.local", ".env"]) {
    const fullPath = path.resolve(workspacePath, fileName);
    if (fs.existsSync(fullPath)) {
      process.loadEnvFile(fullPath);
    }
  }
}

function parseCorsOrigins(value: string | undefined) {
  const normalized = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (normalized?.length) {
    return normalized;
  }

  return ["http://localhost:5180", "http://127.0.0.1:5180"];
}

loadEnvFiles();

const configuredJwtSecret = process.env.JWT_SECRET?.trim();
const configuredAdminToken = process.env.ADMIN_TOKEN?.trim();
const configuredPort = Number(process.env.PORT ?? 4000);

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: configuredPort,
  jwtSecret: configuredJwtSecret || crypto.randomBytes(32).toString("hex"),
  adminToken: configuredAdminToken ?? "",
  dbPath: process.env.SQLITE_PATH ? path.resolve(process.cwd(), process.env.SQLITE_PATH) : rootDataPath,
  uploadsPath: process.env.UPLOADS_PATH
    ? path.resolve(process.cwd(), process.env.UPLOADS_PATH)
    : path.resolve(process.cwd(), "data", "uploads"),
  publicApiUrl: (process.env.PUBLIC_API_URL?.trim() || `http://localhost:${configuredPort}`).replace(/\/+$/, ""),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN),
  usingGeneratedJwtSecret: !configuredJwtSecret,
  adminEnabled: Boolean(configuredAdminToken),
};
