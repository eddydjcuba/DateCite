import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import express from "express";
import cors from "cors";
import multer from "multer";

import { config } from "./config.js";
import { launchConfig } from "./constants/launchConfig.js";
import { comparePassword, createToken, hashPassword, verifyToken } from "./lib/auth.js";
import { getDb } from "./lib/db.js";
import { createFirebaseEmailUser, loginFirebaseEmailUser } from "./lib/firebaseAuth.js";
import { ensureUploadsRoot, getUserMediaDir, toStoredMediaPath } from "./lib/media.js";
import { saveDevicePushToken } from "./lib/push.js";
import {
  ageFromBirthDate,
  birthDateFromAge,
  buildSession,
  completeVerification,
  createBlock,
  createManualPaymentRequest,
  createMessage,
  createReport,
  createWaitlistLead,
  deleteAccount,
  getActivity,
  getAdminMetrics,
  getDiscoverFeed,
  getMessagesForMatch,
  getNotifications,
  getUserByEmail,
  getUserByFirebaseUid,
  isAdult,
  linkFirebaseUidToUser,
  listMatches,
  markNotificationsRead,
  recordInteraction,
  registerUser,
  sendDirectMessageRequest,
  setUserPlan,
  updateProfile,
} from "./lib/store.js";
import type { DatingPlan } from "./types.js";
import type { InteractionAction } from "./types.js";

const db = getDb();
const app = express();

ensureUploadsRoot();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (config.corsOrigins.includes("*") || config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
  }),
);
app.use(express.json({ limit: "15mb" }));
app.use("/media", express.static(config.uploadsPath));

type AuthedRequest = express.Request & {
  authUserId?: number;
};

function extensionForMime(mimeType: string) {
  if (mimeType === "audio/webm") {
    return ".webm";
  }

  if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a" || mimeType === "audio/aac") {
    return ".m4a";
  }

  if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") {
    return ".mp3";
  }

  if (mimeType === "audio/ogg") {
    return ".ogg";
  }

  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") {
    return ".wav";
  }

  if (mimeType === "image/png") {
    return ".png";
  }

  if (mimeType === "image/webp") {
    return ".webp";
  }

  if (mimeType === "image/heic") {
    return ".heic";
  }

  if (mimeType === "image/heif") {
    return ".heif";
  }

  return ".jpg";
}

const upload = multer({
  storage: multer.diskStorage({
    destination(req, _file, callback) {
      const userId = Number((req as AuthedRequest).authUserId);
      const userDir = getUserMediaDir(userId);
      ensureUploadsRoot();
      fs.mkdirSync(userDir, { recursive: true });
      callback(null, userDir);
    },
    filename(_req, file, callback) {
      const incomingExt = path.extname(file.originalname || "").toLowerCase();
      const ext = incomingExt || extensionForMime(file.mimetype);
      callback(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
  fileFilter(_req, file, callback) {
    if (!file.mimetype.startsWith("image/") && !file.mimetype.startsWith("audio/")) {
      return callback(new Error("Solo se permiten imagenes o audios."));
    }

    return callback(null, true);
  },
});

const uploadSingleMedia = upload.single("file");

function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Necesitas iniciar sesion." });
  }

  try {
    const payload = verifyToken(token);
    req.authUserId = Number(payload.sub);
    return next();
  } catch {
    return res.status(401).json({ message: "Tu sesion ya no es valida." });
  }
}

function requireVerified(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  try {
    const session = buildSession(db, req.authUserId!);
    if (!session.profile.isVerified) {
      return res.status(403).json({
        message: "Debes verificar tu cuenta para usar esta parte de DateCite.",
      });
    }
    return next();
  } catch {
    return res.status(401).json({ message: "No pudimos validar tu sesion." });
  }
}

function requireAdminToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!config.adminEnabled) {
    return res.status(503).json({ message: "Admin token no configurado." });
  }

  const adminToken = req.headers["x-admin-token"];
  if (typeof adminToken !== "string" || adminToken !== config.adminToken) {
    return res.status(401).json({ message: "Admin token invalido." });
  }
  return next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "datecite-api" });
});

app.get("/api/launch-config", (_req, res) => {
  res.json(launchConfig);
});

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

app.post("/api/auth/register", async (req, res) => {
  const { email, password, fullName, displayName, birthDate, age, city } = req.body ?? {};

  if (!email || !password || !fullName || !city) {
    return res.status(400).json({ message: "Faltan campos obligatorios." });
  }

  if (!isValidEmail(String(email))) {
    return res.status(400).json({ message: "Debes usar un correo valido." });
  }

  if (String(fullName).trim().length < 2) {
    return res.status(400).json({ message: "Debes indicar tu nombre." });
  }

  const normalizedAge = Number(age);
  const normalizedBirthDate =
    birthDate && String(birthDate).trim()
      ? String(birthDate)
      : Number.isFinite(normalizedAge) && normalizedAge > 0
        ? birthDateFromAge(normalizedAge)
        : null;

  if (!normalizedBirthDate) {
    return res.status(400).json({ message: "Debes indicar edad o fecha de nacimiento." });
  }

  const resolvedAge = birthDate ? ageFromBirthDate(normalizedBirthDate) : normalizedAge;
  if (!Number.isFinite(resolvedAge) || resolvedAge < 18 || !isAdult(normalizedBirthDate)) {
    return res.status(403).json({ message: "DateCite es solo para mayores de 18 anos." });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ message: "La contrasena debe tener al menos 8 caracteres." });
  }

  if (getUserByEmail(db, String(email))) {
    return res.status(409).json({ message: "Ese correo ya existe." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    let firebaseUid: string | undefined;
    let firebaseIdToken: string | undefined;

    if (config.firebaseAuthEnabled) {
      const firebaseUser = await createFirebaseEmailUser({
        email: normalizedEmail,
        password: String(password),
      });
      firebaseUid = firebaseUser.firebaseUid;
      firebaseIdToken = firebaseUser.idToken;
    }

    const session = registerUser(db, {
      email: normalizedEmail,
      passwordHash: hashPassword(String(password)),
      fullName: String(fullName).trim(),
      displayName: String(displayName ?? fullName).trim(),
      birthDate: normalizedBirthDate,
      city: String(city).trim(),
      firebaseUid,
    });

    return res.status(201).json({
      token: createToken(session.user),
      firebaseIdToken,
      ...session,
    });
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : "No pudimos crear la cuenta.",
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ message: "Correo y contrasena son obligatorios." });
  }

  let firebaseIdToken: string | undefined;
  let user = getUserByEmail(db, String(email));

  if (config.firebaseAuthEnabled) {
    try {
      const firebaseUser = await loginFirebaseEmailUser({
        email: String(email).trim().toLowerCase(),
        password: String(password),
      });
      firebaseIdToken = firebaseUser.idToken;
      user = getUserByFirebaseUid(db, firebaseUser.firebaseUid) ?? getUserByEmail(db, firebaseUser.email);

      if (user && !user.firebase_uid) {
        linkFirebaseUidToUser(db, user.id, firebaseUser.firebaseUid);
      }
    } catch {
      return res.status(401).json({ message: "Credenciales Firebase invalidas." });
    }
  } else if (!user || !comparePassword(String(password), user.password_hash)) {
    return res.status(401).json({ message: "Credenciales invalidas." });
  }

  if (!user) {
    return res.status(409).json({
      message: "Firebase valido el correo, pero falta crear el perfil local. Usa registro primero.",
      requiresLocalProfile: true,
    });
  }

  const session = buildSession(db, user.id);
  return res.json({
    token: createToken(session.user),
    firebaseIdToken,
    ...session,
  });
});

app.post("/api/auth/firebase/register", async (req, res) => {
  const { email, password, fullName, displayName, birthDate, age, city } = req.body ?? {};

  if (!email || !password || !fullName || !city) {
    return res.status(400).json({ message: "Faltan campos obligatorios." });
  }

  if (!isValidEmail(String(email))) {
    return res.status(400).json({ message: "Debes usar un correo valido." });
  }

  const normalizedAge = Number(age);
  const normalizedBirthDate =
    birthDate && String(birthDate).trim()
      ? String(birthDate)
      : Number.isFinite(normalizedAge) && normalizedAge > 0
        ? birthDateFromAge(normalizedAge)
        : null;

  if (!normalizedBirthDate) {
    return res.status(400).json({ message: "Debes indicar edad o fecha de nacimiento." });
  }

  const resolvedAge = birthDate ? ageFromBirthDate(normalizedBirthDate) : normalizedAge;
  if (!Number.isFinite(resolvedAge) || resolvedAge < 18 || !isAdult(normalizedBirthDate)) {
    return res.status(403).json({ message: "DateCite es solo para mayores de 18 anos." });
  }

  if (getUserByEmail(db, String(email))) {
    return res.status(409).json({ message: "Ese correo ya existe." });
  }

  try {
    const firebaseUser = await createFirebaseEmailUser({
      email: String(email).trim().toLowerCase(),
      password: String(password),
    });
    const session = registerUser(db, {
      email: firebaseUser.email,
      passwordHash: hashPassword(`firebase:${crypto.randomUUID()}`),
      fullName: String(fullName).trim(),
      displayName: String(displayName ?? fullName).trim(),
      birthDate: normalizedBirthDate,
      city: String(city).trim(),
      firebaseUid: firebaseUser.firebaseUid,
    });

    return res.status(201).json({
      token: createToken(session.user),
      firebaseIdToken: firebaseUser.idToken,
      ...session,
    });
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "No pudimos crear la cuenta en Firebase.",
    });
  }
});

app.post("/api/auth/firebase/login", async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ message: "Correo y contrasena son obligatorios." });
  }

  try {
    const firebaseUser = await loginFirebaseEmailUser({
      email: String(email).trim().toLowerCase(),
      password: String(password),
    });
    let user = getUserByFirebaseUid(db, firebaseUser.firebaseUid);

    if (!user) {
      user = getUserByEmail(db, firebaseUser.email);
      if (user) {
        linkFirebaseUidToUser(db, user.id, firebaseUser.firebaseUid);
      }
    }

    if (!user) {
      return res.status(409).json({
        message: "Firebase valido el correo, pero falta crear el perfil local. Usa /api/auth/firebase/register.",
        requiresLocalProfile: true,
      });
    }

    const session = buildSession(db, user.id);
    return res.json({
      token: createToken(session.user),
      firebaseIdToken: firebaseUser.idToken,
      ...session,
    });
  } catch (error) {
    return res.status(401).json({
      message: error instanceof Error ? error.message : "Credenciales Firebase invalidas.",
    });
  }
});

app.get("/api/auth/me", requireAuth, (req: AuthedRequest, res) => {
  return res.json(buildSession(db, req.authUserId!));
});

app.post("/api/devices/push-token", requireAuth, (req: AuthedRequest, res) => {
  const { expoPushToken, platform, deviceName } = req.body ?? {};

  if (!expoPushToken) {
    return res.status(400).json({ message: "Debes enviar el expoPushToken del dispositivo." });
  }

  try {
    saveDevicePushToken(db, req.authUserId!, {
      expoPushToken: String(expoPushToken),
      platform: typeof platform === "string" ? platform : "unknown",
      deviceName: typeof deviceName === "string" ? deviceName : "",
    });

    return res.status(201).json({ ok: true });
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "No se pudo registrar el dispositivo.",
    });
  }
});

app.post("/api/uploads", requireAuth, (req: AuthedRequest, res) => {
  uploadSingleMedia(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "No se pudo subir el archivo.",
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Debes adjuntar un archivo." });
    }

    const storedPath = toStoredMediaPath(req.file.path);
    return res.status(201).json({
      path: storedPath,
      url: `${config.publicApiUrl}${storedPath}`,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  });
});

app.put("/api/profile", requireAuth, (req: AuthedRequest, res) => {
  try {
    const session = updateProfile(db, req.authUserId!, req.body ?? {});
    return res.json(session);
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "No se pudo actualizar el perfil.",
    });
  }
});

app.post("/api/verification/complete", requireAuth, (req: AuthedRequest, res) => {
  const { selfieUri } = req.body ?? {};

  if (!selfieUri) {
    return res.status(400).json({ message: "Debes enviar la selfie de verificacion." });
  }

  try {
    const session = completeVerification(db, req.authUserId!, String(selfieUri));
    return res.json(session);
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "No se pudo completar la verificacion.",
    });
  }
});

app.get("/api/discover", requireAuth, requireVerified, (req: AuthedRequest, res) => {
  return res.json(getDiscoverFeed(db, req.authUserId!));
});

app.get("/api/activity", requireAuth, requireVerified, (req: AuthedRequest, res) => {
  return res.json(getActivity(db, req.authUserId!));
});

app.get("/api/notifications", requireAuth, requireVerified, (req: AuthedRequest, res) => {
  return res.json(getNotifications(db, req.authUserId!));
});

app.post("/api/notifications/read", requireAuth, requireVerified, (req: AuthedRequest, res) => {
  const { ids, matchId } = req.body ?? {};

  markNotificationsRead(db, req.authUserId!, {
    ids: Array.isArray(ids) ? ids.map((value) => Number(value)).filter(Number.isFinite) : undefined,
    matchId: matchId ? Number(matchId) : undefined,
  });

  return res.json(getNotifications(db, req.authUserId!));
});

app.post("/api/interactions", requireAuth, requireVerified, (req: AuthedRequest, res) => {
  const { targetProfileId, action } = req.body ?? {};

  if (!targetProfileId || !["like", "pass"].includes(action)) {
    return res.status(400).json({ message: "Debes enviar targetProfileId y action validos." });
  }

  try {
    const result = recordInteraction(db, req.authUserId!, Number(targetProfileId), action as InteractionAction);
    if (result.blockedByLimit) {
      return res.status(429).json({
        message: "Ya usaste tus likes de hoy. Tus chats y matches siguen abiertos.",
        ...result,
      });
    }

    return res.json(result);
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "No se pudo registrar la interaccion.",
    });
  }
});

app.post("/api/direct-messages", requireAuth, requireVerified, (req: AuthedRequest, res) => {
  const { targetUserId, content } = req.body ?? {};

  if (!targetUserId || !content) {
    return res.status(400).json({ message: "Debes indicar targetUserId y content." });
  }

  try {
    const result = sendDirectMessageRequest(db, req.authUserId!, Number(targetUserId), String(content));
    if (result.blockedByLimit) {
      return res.status(429).json({
        message: "Ya usaste tus mensajes directos gratis de hoy.",
        ...result,
      });
    }

    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "No se pudo enviar el mensaje inicial.",
    });
  }
});

app.get("/api/matches", requireAuth, requireVerified, (req: AuthedRequest, res) => {
  return res.json({ matches: listMatches(db, req.authUserId!) });
});

app.get("/api/matches/:id/messages", requireAuth, requireVerified, (req: AuthedRequest, res) => {
  try {
    const messages = getMessagesForMatch(db, req.authUserId!, Number(req.params.id));
    return res.json({ messages });
  } catch (error) {
    return res.status(403).json({
      message: error instanceof Error ? error.message : "No se pudo cargar la conversacion.",
    });
  }
});

app.post("/api/matches/:id/messages", requireAuth, requireVerified, (req: AuthedRequest, res) => {
  try {
    const messages = createMessage(db, req.authUserId!, Number(req.params.id), {
      content: typeof req.body?.content === "string" ? req.body.content : "",
      messageType: req.body?.messageType,
      mediaUri: req.body?.mediaUri,
      mediaMimeType: req.body?.mediaMimeType,
      mediaDurationMs: req.body?.mediaDurationMs,
    });
    return res.status(201).json({ messages });
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "No se pudo enviar el mensaje.",
    });
  }
});

app.post("/api/reports", requireAuth, (req: AuthedRequest, res) => {
  const { targetUserId, reason, details } = req.body ?? {};

  if (!targetUserId || !reason) {
    return res.status(400).json({ message: "Debes indicar targetUserId y reason." });
  }

  createReport(db, req.authUserId!, Number(targetUserId), String(reason), String(details ?? ""));
  return res.status(201).json({ ok: true });
});

app.post("/api/blocks", requireAuth, (req: AuthedRequest, res) => {
  const { targetUserId } = req.body ?? {};

  if (!targetUserId) {
    return res.status(400).json({ message: "Debes indicar targetUserId." });
  }

  createBlock(db, req.authUserId!, Number(targetUserId));
  return res.status(201).json({ ok: true });
});

app.delete("/api/account", requireAuth, (req: AuthedRequest, res) => {
  deleteAccount(db, req.authUserId!);
  return res.json({ ok: true });
});

app.post("/api/waitlist", (req, res) => {
  const { name, email, city, note } = req.body ?? {};

  if (!name || !email) {
    return res.status(400).json({ message: "Nombre y correo son obligatorios." });
  }

  createWaitlistLead(db, {
    name: String(name),
    email: String(email),
    city: String(city ?? ""),
    note: String(note ?? ""),
  });

  return res.status(201).json({ ok: true });
});

app.post("/api/billing/manual-payments", requireAuth, (req: AuthedRequest, res) => {
  try {
    createManualPaymentRequest(db, req.authUserId!, {
      plan: req.body?.plan,
      amount: req.body?.amount,
      reference: req.body?.reference,
      note: req.body?.note,
    });

    return res.status(201).json({ ok: true });
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "No se pudo registrar el pago manual.",
    });
  }
});

app.get("/api/admin/metrics", requireAdminToken, (_req, res) => {
  return res.json(getAdminMetrics(db));
});

app.put("/api/admin/users/:id/plan", requireAdminToken, (req, res) => {
  const plan = String(req.body?.plan ?? "") as DatingPlan;

  try {
    return res.json(setUserPlan(db, Number(req.params.id), plan));
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "No se pudo actualizar el plan.",
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({ message: "Ruta no encontrada." });
});

app.listen(config.port, config.host, () => {
  console.log(`DateCite API listening on ${config.host}:${config.port} (localhost:${config.port})`);

  if (config.usingGeneratedJwtSecret) {
    console.warn("JWT_SECRET no configurado. Se genero un secreto temporal para esta sesion.");
  }

  if (!config.adminEnabled) {
    console.warn("ADMIN_TOKEN no configurado. /api/admin/metrics queda deshabilitado hasta definirlo.");
  }
});
