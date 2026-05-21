import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { config } from "../config.js";
import type { AuthUserPayload } from "../types.js";

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

export function comparePassword(password: string, hash: string) {
  return bcrypt.compareSync(password, hash);
}

export function createToken(user: AuthUserPayload) {
  return jwt.sign({ sub: user.id, plan: user.plan, admin: user.isAdmin }, config.jwtSecret, {
    expiresIn: "7d",
  });
}

export function verifyToken(token: string) {
  const payload = jwt.verify(token, config.jwtSecret);
  if (typeof payload === "string") {
    throw new Error("Invalid token payload");
  }

  const typedPayload = payload as JwtPayload & {
    plan?: string;
    admin?: boolean;
  };

  return {
    sub: Number(typedPayload.sub),
    plan: String(typedPayload.plan ?? "free"),
    admin: Boolean(typedPayload.admin),
  };
}
