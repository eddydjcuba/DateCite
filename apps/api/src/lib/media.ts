import fs from "node:fs";
import path from "node:path";

import { config } from "../config.js";

export function ensureUploadsRoot() {
  fs.mkdirSync(config.uploadsPath, { recursive: true });
}

export function getUserMediaDir(userId: number) {
  return path.join(config.uploadsPath, `user-${userId}`);
}

export function toStoredMediaPath(filePath: string) {
  const relative = path.relative(config.uploadsPath, filePath).replace(/\\/g, "/");
  return `/media/${relative}`;
}

export function toPublicMediaUrl(value: string) {
  if (!value) {
    return value;
  }

  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")) {
    return value;
  }

  if (value.startsWith("/media/")) {
    return `${config.publicApiUrl}${value}`;
  }

  return value;
}

export function mapPublicMediaList(values: string[]) {
  return values.map((value) => toPublicMediaUrl(value));
}

export function deleteUserMedia(userId: number) {
  fs.rmSync(getUserMediaDir(userId), {
    recursive: true,
    force: true,
  });
}
