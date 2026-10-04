import type { DatabaseSync } from "node:sqlite";

import { FREE_DAILY_DIRECT_MESSAGES, FREE_DAILY_LIKES } from "../constants/launchConfig.js";
import { deleteUserMedia, mapPublicMediaList, toPublicMediaUrl } from "./media.js";
import { queuePushNotification } from "./push.js";
import type {
  ActivityItem,
  ActivityPayload,
  AuthUserPayload,
  DatingPlan,
  GenderIdentity,
  InteractionAction,
  MatchMessage,
  MatchSummary,
  MessageKind,
  NotificationItem,
  NotificationKind,
  NotificationsPayload,
  PublicProfile,
  SessionPayload,
  VerificationStatus,
} from "../types.js";

function parseStringArray(input: unknown) {
  if (!input || typeof input !== "string") {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function normalizeList(list: unknown, max = 8) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, max);
}

function countDefinedItems(list: string[]) {
  return list.filter(Boolean).length;
}

function normalizeMessageKind(input: unknown): MessageKind {
  const value = String(input ?? "").trim().toLowerCase();
  return value === "image" || value === "voice" ? value : "text";
}

function buildMessagePreview(message: {
  content: string;
  messageType: MessageKind;
}) {
  if (message.messageType === "image") {
    return "Foto";
  }

  if (message.messageType === "voice") {
    return "Audio";
  }

  return message.content.trim();
}

const genderIdentityOptions = ["mujer", "hombre", "no-binaria", "otra"] as const satisfies readonly GenderIdentity[];
const validGenderIdentitySet = new Set<GenderIdentity>(genderIdentityOptions);

function normalizeGenderIdentity(input: unknown): GenderIdentity | "" {
  const value = String(input ?? "").trim().toLowerCase() as GenderIdentity | "";
  return validGenderIdentitySet.has(value as GenderIdentity) ? (value as GenderIdentity) : "";
}

function normalizeSeeking(input: unknown) {
  const list = normalizeList(input, genderIdentityOptions.length)
    .map((item) => normalizeGenderIdentity(item))
    .filter((item): item is GenderIdentity => Boolean(item));

  return [...new Set(list)];
}

export function ageFromBirthDate(birthDate: string) {
  const today = new Date();
  const birth = new Date(birthDate);

  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
  const dayDiff = today.getUTCDate() - birth.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
}

export function birthDateFromAge(age: number) {
  const currentYear = new Date().getUTCFullYear();
  return `${currentYear - age}-01-01`;
}

export function isAdult(birthDate: string) {
  return ageFromBirthDate(birthDate) >= 18;
}

export function getIsoNow() {
  return new Date().toISOString();
}

function createNotification(
  db: DatabaseSync,
  input: {
    userId: number;
    actorUserId: number | null;
    kind: NotificationKind;
    title: string;
    body: string;
    matchId?: number | null;
    isRead?: boolean;
  },
) {
  db.prepare(`
    INSERT INTO notifications (user_id, actor_user_id, kind, title, body, match_id, is_read, created_at, read_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.userId,
    input.actorUserId,
    input.kind,
    input.title.trim(),
    input.body.trim(),
    input.matchId ?? null,
    input.isRead ? 1 : 0,
    getIsoNow(),
    input.isRead ? getIsoNow() : null,
  );

  if (!input.isRead) {
    queuePushNotification(db, {
      userId: input.userId,
      kind: input.kind,
      title: input.title.trim(),
      body: input.body.trim(),
      matchId: input.matchId ?? null,
    });
  }
}

type UserRow = {
  id: number;
  email: string;
  firebase_uid?: string | null;
  password_hash: string;
  full_name: string;
  age: number;
  city: string;
  plan: DatingPlan;
  is_admin: number;
};

type ProfileRow = {
  user_id: number;
  display_name: string;
  bio: string;
  city: string;
  intention: string;
  interests_json: string;
  photos_json: string;
  prompts_json: string;
  values_json: string;
  lifestyle_json: string;
  zodiac_sign: string;
  gender_identity: GenderIdentity | "";
  seeking_json: string;
  is_verified: number;
  verification_status: VerificationStatus;
  verification_selfie_uri: string;
  onboarding_completed: number;
};

type ActivityRow = {
  user_id: number;
  display_name: string;
  city: string;
  photos_json: string;
  created_at: string;
};

type NotificationRow = {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  is_read: number;
  created_at: string;
  match_id: number | null;
  actor_user_id: number | null;
  display_name: string | null;
  city: string | null;
  photos_json: string | null;
};

export function toAuthUser(row: UserRow): AuthUserPayload {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    age: row.age,
    city: row.city,
    plan: row.plan,
    isAdmin: Boolean(row.is_admin),
  };
}

export function buildSession(db: DatabaseSync, userId: number): SessionPayload {
  const userRow = db.prepare(`
    SELECT id, email, password_hash, full_name, age, city, plan, is_admin
    FROM users
    WHERE id = ?
  `).get(userId) as UserRow | undefined;

  if (!userRow) {
    throw new Error("Usuario no encontrado");
  }

  const profileRow = db.prepare(`
    SELECT user_id, display_name, bio, city, intention, interests_json, photos_json,
           prompts_json, values_json, lifestyle_json, zodiac_sign, gender_identity, seeking_json, is_verified,
           verification_status, verification_selfie_uri, onboarding_completed
    FROM profiles
    WHERE user_id = ?
  `).get(userId) as ProfileRow | undefined;

  if (!profileRow) {
    throw new Error("Perfil no encontrado");
  }

  return {
    user: toAuthUser(userRow),
    profile: {
      displayName: profileRow.display_name,
      bio: profileRow.bio,
      city: profileRow.city,
      intention: profileRow.intention,
      interests: parseStringArray(profileRow.interests_json),
      photos: mapPublicMediaList(parseStringArray(profileRow.photos_json)),
      prompts: parseStringArray(profileRow.prompts_json),
      values: parseStringArray(profileRow.values_json),
      lifestyle: parseStringArray(profileRow.lifestyle_json),
      zodiacSign: profileRow.zodiac_sign,
      genderIdentity: normalizeGenderIdentity(profileRow.gender_identity),
      seeking: normalizeSeeking(parseStringArray(profileRow.seeking_json)),
      isVerified: Boolean(profileRow.is_verified),
      verificationStatus: profileRow.verification_status,
      verificationSelfieUri: toPublicMediaUrl(profileRow.verification_selfie_uri),
      onboardingCompleted: Boolean(profileRow.onboarding_completed),
    },
  };
}

export function getUserByEmail(db: DatabaseSync, email: string) {
  return db.prepare(`
    SELECT id, email, password_hash, full_name, age, city, plan, is_admin
    FROM users
    WHERE lower(email) = lower(?)
  `).get(email) as UserRow | undefined;
}

export function getUserByFirebaseUid(db: DatabaseSync, firebaseUid: string) {
  return db.prepare(`
    SELECT id, email, firebase_uid, password_hash, full_name, age, city, plan, is_admin
    FROM users
    WHERE firebase_uid = ?
  `).get(firebaseUid) as UserRow | undefined;
}

export function linkFirebaseUidToUser(db: DatabaseSync, userId: number, firebaseUid: string) {
  db.prepare(`
    UPDATE users
    SET firebase_uid = ?
    WHERE id = ?
  `).run(firebaseUid, userId);
}

export function registerUser(
  db: DatabaseSync,
  input: {
    email: string;
    passwordHash: string;
    fullName: string;
    displayName: string;
    birthDate: string;
    city: string;
    firebaseUid?: string;
  },
) {
  const age = ageFromBirthDate(input.birthDate);

  db.exec("BEGIN");

  try {
    const userResult = db.prepare(`
      INSERT INTO users (email, password_hash, full_name, birth_date, age, city, plan, is_admin)
      VALUES (?, ?, ?, ?, ?, ?, 'free', 0)
    `).run(input.email, input.passwordHash, input.fullName, input.birthDate, age, input.city);

    const userId = Number(userResult.lastInsertRowid);
    if (input.firebaseUid) {
      linkFirebaseUidToUser(db, userId, input.firebaseUid);
    }
    db.prepare(`
      INSERT INTO profiles (
        user_id, display_name, bio, city, intention, interests_json, photos_json,
        prompts_json, values_json, lifestyle_json, zodiac_sign, gender_identity, seeking_json, is_verified,
        verification_status, verification_selfie_uri, onboarding_completed
      )
      VALUES (?, ?, '', ?, 'relacion-seria', '[]', '[]', '[]', '[]', '[]', '', '', '[]', 0, 'required', '', 0)
    `).run(userId, input.displayName, input.city);

    db.exec("COMMIT");
    return buildSession(db, userId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function updateProfile(
  db: DatabaseSync,
  userId: number,
  payload: {
    displayName?: string;
    bio?: string;
    city?: string;
    age?: unknown;
    intention?: string;
    interests?: unknown;
    photos?: unknown;
    prompts?: unknown;
    values?: unknown;
    lifestyle?: unknown;
    zodiacSign?: string;
    genderIdentity?: unknown;
    seeking?: unknown;
  },
) {
  const current = buildSession(db, userId);
  const nextProfile = {
    displayName: payload.displayName?.trim() || current.profile.displayName || current.user.fullName,
    bio: payload.bio?.trim() ?? current.profile.bio,
    city: payload.city?.trim() || current.profile.city,
    intention: payload.intention?.trim() || current.profile.intention,
    interests: payload.interests ? normalizeList(payload.interests) : current.profile.interests,
    photos: payload.photos ? normalizeList(payload.photos, 4) : current.profile.photos,
    prompts: payload.prompts ? normalizeList(payload.prompts, 4) : current.profile.prompts,
    values: payload.values ? normalizeList(payload.values, 6) : current.profile.values,
    lifestyle: payload.lifestyle ? normalizeList(payload.lifestyle, 6) : current.profile.lifestyle,
    zodiacSign: payload.zodiacSign?.trim() || current.profile.zodiacSign,
    genderIdentity:
      payload.genderIdentity !== undefined ? normalizeGenderIdentity(payload.genderIdentity) : current.profile.genderIdentity,
    seeking: payload.seeking !== undefined ? normalizeSeeking(payload.seeking) : current.profile.seeking,
  };
  const normalizedAge = Number(payload.age);
  const nextAge = Number.isFinite(normalizedAge) && normalizedAge > 0 ? normalizedAge : current.user.age;

  if (!Number.isFinite(nextAge) || nextAge < 18) {
    throw new Error("Conexia solo admite mayores de 18 anos.");
  }

  const onboardingCompleted = Number(
    Boolean(
      nextProfile.displayName &&
      nextProfile.city &&
      nextProfile.bio &&
      nextProfile.zodiacSign &&
      nextProfile.genderIdentity &&
      nextProfile.seeking.length >= 1 &&
      nextProfile.interests.length >= 1 &&
      countDefinedItems(nextProfile.photos) >= 2,
    ),
  );

  db.prepare(`
    UPDATE users SET birth_date = ?, age = ?, city = ? WHERE id = ?
  `).run(birthDateFromAge(nextAge), nextAge, nextProfile.city, userId);

  db.prepare(`
    UPDATE profiles
    SET display_name = ?, bio = ?, city = ?, intention = ?, interests_json = ?, photos_json = ?,
        prompts_json = ?, values_json = ?, lifestyle_json = ?, zodiac_sign = ?, gender_identity = ?, seeking_json = ?,
        onboarding_completed = ?, updated_at = ?
    WHERE user_id = ?
  `).run(
    nextProfile.displayName,
    nextProfile.bio,
    nextProfile.city,
    nextProfile.intention,
    JSON.stringify(nextProfile.interests),
    JSON.stringify(nextProfile.photos),
    JSON.stringify(nextProfile.prompts),
    JSON.stringify(nextProfile.values),
    JSON.stringify(nextProfile.lifestyle),
    nextProfile.zodiacSign,
    nextProfile.genderIdentity,
    JSON.stringify(nextProfile.seeking),
    onboardingCompleted,
    getIsoNow(),
    userId,
  );

  return buildSession(db, userId);
}

function computeCompatibility(
  current: SessionPayload["profile"],
  candidate: Omit<PublicProfile, "compatibilityScore" | "compatibilityReasons">,
) {
  let score = 48;
  const reasons: string[] = [];
  const overlap = candidate.interests.filter((interest) => current.interests.includes(interest));
  const currentIdentity = current.genderIdentity;
  const candidateIdentity = candidate.genderIdentity;

  if (currentIdentity && candidateIdentity && current.seeking.includes(candidateIdentity) && candidate.seeking.includes(currentIdentity)) {
    score += 16;
    reasons.push("Encaja con lo que ambos buscan");
  }

  if (current.city && current.city.toLowerCase() === candidate.city.toLowerCase()) {
    score += 18;
    reasons.push("Viven en la misma ciudad");
  }

  if (current.intention && current.intention === candidate.intention) {
    score += 16;
    reasons.push("Buscan el mismo tipo de relacion");
  }

  if (current.zodiacSign && candidate.zodiacSign && current.zodiacSign === candidate.zodiacSign) {
    score += 8;
    reasons.push(`Comparten signo ${candidate.zodiacSign}`);
  }

  if (overlap.length > 0) {
    score += Math.min(18, overlap.length * 6);
    reasons.push(`Comparten ${overlap.slice(0, 2).join(" y ")}`);
  }

  if (candidate.isVerified) {
    score += 6;
    reasons.push("Perfil verificado");
  }

  return {
    compatibilityScore: Math.min(98, score),
    compatibilityReasons: reasons.slice(0, 3),
  };
}

function toPublicProfile(
  row: UserRow & ProfileRow,
  currentProfile: SessionPayload["profile"],
): PublicProfile {
  const base = {
    userId: row.id,
    displayName: row.display_name,
    age: row.age,
    city: row.city,
    bio: row.bio,
    intention: row.intention,
    interests: parseStringArray(row.interests_json),
    photos: mapPublicMediaList(parseStringArray(row.photos_json)),
    prompts: parseStringArray(row.prompts_json),
    values: parseStringArray(row.values_json),
    lifestyle: parseStringArray(row.lifestyle_json),
    zodiacSign: row.zodiac_sign,
    genderIdentity: normalizeGenderIdentity(row.gender_identity),
    seeking: normalizeSeeking(parseStringArray(row.seeking_json)),
    isVerified: Boolean(row.is_verified),
  };

  return {
    ...base,
    ...computeCompatibility(currentProfile, base),
  };
}

function isPreferenceCompatible(
  current: Pick<SessionPayload["profile"], "genderIdentity" | "seeking">,
  candidate: { genderIdentity: GenderIdentity | ""; seeking: GenderIdentity[] },
) {
  const currentIdentity = current.genderIdentity;
  const candidateIdentity = candidate.genderIdentity;

  if (!currentIdentity || !candidateIdentity) {
    return false;
  }

  if (current.seeking.length === 0 || candidate.seeking.length === 0) {
    return false;
  }

  return current.seeking.includes(candidateIdentity) && candidate.seeking.includes(currentIdentity);
}

export function getDailyLikeUsage(db: DatabaseSync, userId: number) {
  const row = db.prepare(`
    SELECT COUNT(*) as total
    FROM interactions
    WHERE actor_user_id = ?
      AND action = 'like'
      AND substr(created_at, 1, 10) = substr(?, 1, 10)
  `).get(userId, getIsoNow()) as { total: number };

  return row.total;
}

export function getDailyDirectMessageUsage(db: DatabaseSync, userId: number) {
  const row = db.prepare(`
    SELECT COUNT(*) as total
    FROM direct_messages
    WHERE sender_user_id = ?
      AND substr(created_at, 1, 10) = substr(?, 1, 10)
  `).get(userId, getIsoNow()) as { total: number };

  return row.total;
}

function recordProfileVisit(db: DatabaseSync, actorUserId: number, targetUserId: number) {
  db.prepare(`
    INSERT INTO profile_visits (actor_user_id, target_user_id, viewed_at)
    VALUES (?, ?, ?)
    ON CONFLICT(actor_user_id, target_user_id)
    DO UPDATE SET viewed_at = excluded.viewed_at
  `).run(actorUserId, targetUserId, getIsoNow());
}

export function getDiscoverFeed(db: DatabaseSync, userId: number) {
  const current = buildSession(db, userId);
  const rows = db.prepare(`
    SELECT
      u.id,
      u.email,
      u.password_hash,
      u.full_name,
      u.age,
      u.city,
      u.plan,
      u.is_admin,
      p.user_id,
      p.display_name,
      p.bio,
      p.city as profile_city,
      p.intention,
      p.interests_json,
      p.photos_json,
      p.prompts_json,
      p.values_json,
      p.lifestyle_json,
      p.zodiac_sign,
      p.gender_identity,
      p.seeking_json,
      p.is_verified,
      p.verification_status,
      p.verification_selfie_uri,
      p.onboarding_completed
    FROM users u
    JOIN profiles p ON p.user_id = u.id
    WHERE u.id != ?
      AND u.status = 'active'
      AND p.is_verified = 1
      AND NOT EXISTS (
        SELECT 1 FROM interactions i
        WHERE i.actor_user_id = ? AND i.target_user_id = u.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.user_id = ? AND b.blocked_user_id = u.id)
           OR (b.user_id = u.id AND b.blocked_user_id = ?)
      )
    ORDER BY p.is_verified DESC, u.created_at DESC
    LIMIT 24
  `).all(userId, userId, userId, userId) as Array<
    UserRow &
      ProfileRow & {
        profile_city: string;
      }
  >;

  const profiles = rows
    .map((row) =>
      toPublicProfile(
        {
          ...row,
          city: row.profile_city,
        },
        current.profile,
      ),
    )
    .filter((profile) => isPreferenceCompatible(current.profile, profile))
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
    .slice(0, 10);

  if (profiles[0]) {
    recordProfileVisit(db, userId, profiles[0].userId);
  }

  const likesUsed = getDailyLikeUsage(db, userId);
  const likesRemaining = current.user.plan === "plus" ? null : Math.max(0, FREE_DAILY_LIKES - likesUsed);
  const directMessagesUsed = getDailyDirectMessageUsage(db, userId);
  const directMessagesRemaining =
    current.user.plan === "plus" ? null : Math.max(0, FREE_DAILY_DIRECT_MESSAGES - directMessagesUsed);

  return {
    profiles,
    likesUsed,
    likesRemaining,
    directMessagesRemaining,
    isLimitReached: likesRemaining === null ? false : likesRemaining <= 0,
  };
}

function areBlocked(db: DatabaseSync, userA: number, userB: number) {
  const row = db.prepare(`
    SELECT 1 as blocked
    FROM blocks
    WHERE (user_id = ? AND blocked_user_id = ?)
       OR (user_id = ? AND blocked_user_id = ?)
    LIMIT 1
  `).get(userA, userB, userB, userA) as { blocked: number } | undefined;

  return Boolean(row?.blocked);
}

function getMatchId(db: DatabaseSync, userA: number, userB: number) {
  const ordered = [Math.min(userA, userB), Math.max(userA, userB)];
  const row = db.prepare(`
    SELECT id
    FROM matches
    WHERE user_a_id = ? AND user_b_id = ?
  `).get(ordered[0], ordered[1]) as { id: number } | undefined;

  return row?.id ?? null;
}

export function recordInteraction(
  db: DatabaseSync,
  actorUserId: number,
  targetUserId: number,
  action: InteractionAction,
) {
  if (actorUserId === targetUserId) {
    throw new Error("No puedes interactuar con tu propio perfil.");
  }

  if (areBlocked(db, actorUserId, targetUserId)) {
    throw new Error("No puedes interactuar con este perfil.");
  }

  const actor = buildSession(db, actorUserId);
  const target = buildSession(db, targetUserId);

  if (!isPreferenceCompatible(actor.profile, target.profile)) {
    throw new Error("Ese perfil no encaja con lo que buscas ahora mismo.");
  }

  const existing = db.prepare(`
    SELECT action
    FROM interactions
    WHERE actor_user_id = ? AND target_user_id = ?
  `).get(actorUserId, targetUserId) as { action: InteractionAction } | undefined;

  if (actor.user.plan === "free" && action === "like" && existing?.action !== "like") {
    const likesRemaining = Math.max(0, FREE_DAILY_LIKES - getDailyLikeUsage(db, actorUserId));
    if (likesRemaining <= 0) {
      return {
        likesRemaining: 0,
        newMatch: false,
        matchId: null,
        blockedByLimit: true,
      };
    }
  }

  db.prepare(`
    INSERT INTO interactions (actor_user_id, target_user_id, action, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(actor_user_id, target_user_id)
    DO UPDATE SET action = excluded.action, created_at = excluded.created_at
  `).run(actorUserId, targetUserId, action, getIsoNow());

  let newMatch = false;
  let matchId: number | null = null;

  if (action === "like") {
    if (existing?.action !== "like") {
      createNotification(db, {
        userId: targetUserId,
        actorUserId,
        kind: "like_received",
        title: `${actor.profile.displayName || actor.user.fullName} te dio like`,
        body: `Te vio en ${actor.profile.city || actor.user.city} y quiere conocerte mejor.`,
      });
    }

    const reciprocal = db.prepare(`
      SELECT action
      FROM interactions
      WHERE actor_user_id = ? AND target_user_id = ?
    `).get(targetUserId, actorUserId) as { action: InteractionAction } | undefined;

    if (reciprocal?.action === "like") {
      const ordered = [Math.min(actorUserId, targetUserId), Math.max(actorUserId, targetUserId)];
      const before = getMatchId(db, ordered[0], ordered[1]);

      db.prepare(`
        INSERT OR IGNORE INTO matches (user_a_id, user_b_id, created_at)
        VALUES (?, ?, ?)
      `).run(ordered[0], ordered[1], getIsoNow());

      matchId = getMatchId(db, ordered[0], ordered[1]);
      newMatch = before === null && matchId !== null;

      if (newMatch && matchId !== null) {
        createNotification(db, {
          userId: actorUserId,
          actorUserId: targetUserId,
          kind: "match_created",
          title: `Hiciste match con ${target.profile.displayName || target.user.fullName}`,
          body: "El chat ya esta abierto para ustedes dos.",
          matchId,
        });
        createNotification(db, {
          userId: targetUserId,
          actorUserId,
          kind: "match_created",
          title: `Hiciste match con ${actor.profile.displayName || actor.user.fullName}`,
          body: "El chat ya esta abierto para ustedes dos.",
          matchId,
        });
      }
    }
  }

  const likesRemaining =
    actor.user.plan === "plus" ? null : Math.max(0, FREE_DAILY_LIKES - getDailyLikeUsage(db, actorUserId));

  return {
    likesRemaining,
    newMatch,
    matchId,
    blockedByLimit: false,
  };
}

export function sendDirectMessageRequest(
  db: DatabaseSync,
  senderUserId: number,
  targetUserId: number,
  rawContent: string,
) {
  if (senderUserId === targetUserId) {
    throw new Error("No puedes enviarte un mensaje inicial a ti mismo.");
  }

  if (areBlocked(db, senderUserId, targetUserId)) {
    throw new Error("No puedes contactar con este perfil.");
  }

  const existingMatchId = getMatchId(db, senderUserId, targetUserId);
  if (existingMatchId) {
    throw new Error("Ese chat ya existe. Habla desde Mensajes.");
  }

  const sender = buildSession(db, senderUserId);
  const target = buildSession(db, targetUserId);

  if (!isPreferenceCompatible(sender.profile, target.profile)) {
    throw new Error("Ese perfil no encaja con lo que buscas ahora mismo.");
  }

  const trimmed = rawContent.trim();
  if (trimmed.length < 6) {
    throw new Error("Tu mensaje inicial debe tener al menos 6 caracteres.");
  }

  if (trimmed.length > 240) {
    throw new Error("Tu mensaje inicial no puede pasar de 240 caracteres.");
  }

  const alreadySentToday = db.prepare(`
    SELECT 1 as sent
    FROM direct_messages
    WHERE sender_user_id = ?
      AND target_user_id = ?
      AND substr(created_at, 1, 10) = substr(?, 1, 10)
    LIMIT 1
  `).get(senderUserId, targetUserId, getIsoNow()) as { sent: number } | undefined;

  if (alreadySentToday?.sent) {
    throw new Error("Ya le enviaste un mensaje inicial hoy a este perfil.");
  }

  if (sender.user.plan === "free") {
    const remaining = Math.max(0, FREE_DAILY_DIRECT_MESSAGES - getDailyDirectMessageUsage(db, senderUserId));
    if (remaining <= 0) {
      return {
        directMessagesRemaining: 0,
        blockedByLimit: true,
      };
    }
  }

  db.prepare(`
    INSERT INTO direct_messages (sender_user_id, target_user_id, content, created_at)
    VALUES (?, ?, ?, ?)
  `).run(senderUserId, targetUserId, trimmed, getIsoNow());

  createNotification(db, {
    userId: targetUserId,
    actorUserId: senderUserId,
    kind: "direct_message_received",
    title: `Mensaje inicial de ${sender.profile.displayName || sender.user.fullName}`,
    body: trimmed,
    matchId: null,
  });

  const directMessagesRemaining =
    sender.user.plan === "plus"
      ? null
      : Math.max(0, FREE_DAILY_DIRECT_MESSAGES - getDailyDirectMessageUsage(db, senderUserId));

  return {
    directMessagesRemaining,
    blockedByLimit: false,
  };
}

export function listMatches(db: DatabaseSync, userId: number): MatchSummary[] {
  const current = buildSession(db, userId);
  const rows = db.prepare(`
    SELECT
      m.id,
      m.created_at,
      CASE WHEN m.user_a_id = ? THEN m.user_b_id ELSE m.user_a_id END as other_user_id,
      (
        SELECT content
        FROM messages ms
        WHERE ms.match_id = m.id
        ORDER BY ms.id DESC
        LIMIT 1
      ) as last_message,
      (
        SELECT message_type
        FROM messages ms
        WHERE ms.match_id = m.id
        ORDER BY ms.id DESC
        LIMIT 1
      ) as last_message_type,
      (
        SELECT created_at
        FROM messages ms
        WHERE ms.match_id = m.id
        ORDER BY ms.id DESC
        LIMIT 1
      ) as last_message_at
    FROM matches m
    WHERE (m.user_a_id = ? OR m.user_b_id = ?)
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.user_id = ? AND b.blocked_user_id = CASE WHEN m.user_a_id = ? THEN m.user_b_id ELSE m.user_a_id END)
           OR (b.user_id = CASE WHEN m.user_a_id = ? THEN m.user_b_id ELSE m.user_a_id END AND b.blocked_user_id = ?)
      )
    ORDER BY COALESCE(last_message_at, m.created_at) DESC
  `).all(userId, userId, userId, userId, userId, userId, userId) as Array<{
    id: number;
    created_at: string;
    other_user_id: number;
    last_message: string | null;
    last_message_type: MessageKind | null;
    last_message_at: string | null;
  }>;

  return rows.map((row) => {
    const other = db.prepare(`
      SELECT
        u.id,
        u.email,
        u.password_hash,
        u.full_name,
        u.age,
        u.city,
        u.plan,
        u.is_admin,
        p.user_id,
        p.display_name,
        p.bio,
        p.city as profile_city,
        p.intention,
        p.interests_json,
        p.photos_json,
        p.prompts_json,
        p.values_json,
        p.lifestyle_json,
        p.zodiac_sign,
        p.gender_identity,
        p.seeking_json,
        p.is_verified,
        p.verification_status,
        p.verification_selfie_uri,
        p.onboarding_completed
      FROM users u
      JOIN profiles p ON p.user_id = u.id
      WHERE u.id = ?
    `).get(row.other_user_id) as UserRow & ProfileRow & { profile_city: string };

    return {
      id: row.id,
      createdAt: row.created_at,
      otherUser: toPublicProfile(
        {
          ...other,
          city: other.profile_city,
        },
        current.profile,
      ),
      lastMessage:
        row.last_message !== null
          ? buildMessagePreview({
              content: row.last_message,
              messageType: normalizeMessageKind(row.last_message_type),
            })
          : null,
      lastMessageAt: row.last_message_at,
    };
  });
}

export function getMessagesForMatch(db: DatabaseSync, userId: number, matchId: number) {
  const match = db.prepare(`
    SELECT user_a_id, user_b_id
    FROM matches
    WHERE id = ?
  `).get(matchId) as { user_a_id: number; user_b_id: number } | undefined;

  if (!match || (match.user_a_id !== userId && match.user_b_id !== userId) || areBlocked(db, match.user_a_id, match.user_b_id)) {
    throw new Error("No tienes acceso a esta conversacion.");
  }

  const rows = db.prepare(`
    SELECT id, sender_user_id, content, created_at, message_type, media_uri, media_mime_type, media_duration_ms
    FROM messages
    WHERE match_id = ?
    ORDER BY id ASC
  `).all(matchId) as Array<{
    id: number;
    sender_user_id: number;
    content: string;
    created_at: string;
    message_type: MessageKind;
    media_uri: string;
    media_mime_type: string;
    media_duration_ms: number | null;
  }>;

  const messages = rows.map((row) => ({
    ...row,
    message_type: normalizeMessageKind(row.message_type),
    media_uri: toPublicMediaUrl(row.media_uri),
    media_mime_type: row.media_mime_type ?? "",
    media_duration_ms: typeof row.media_duration_ms === "number" ? row.media_duration_ms : null,
  })) satisfies MatchMessage[];

  return messages;
}

export function createMessage(
  db: DatabaseSync,
  userId: number,
  matchId: number,
  input: {
    content?: string;
    messageType?: MessageKind;
    mediaUri?: string;
    mediaMimeType?: string;
    mediaDurationMs?: number | null;
  },
) {
  const messageType = normalizeMessageKind(input.messageType);
  const trimmed = String(input.content ?? "").trim();
  const mediaUri = String(input.mediaUri ?? "").trim();
  const mediaMimeType = String(input.mediaMimeType ?? "").trim();
  const mediaDurationMs =
    typeof input.mediaDurationMs === "number" && Number.isFinite(input.mediaDurationMs)
      ? Math.max(0, Math.round(input.mediaDurationMs))
      : null;

  if (messageType === "text" && !trimmed) {
    throw new Error("El mensaje no puede estar vacio.");
  }

  if ((messageType === "image" || messageType === "voice") && !mediaUri) {
    throw new Error(messageType === "image" ? "Debes adjuntar una foto." : "Debes adjuntar un audio.");
  }

  getMessagesForMatch(db, userId, matchId);
  const match = db.prepare(`
    SELECT user_a_id, user_b_id
    FROM matches
    WHERE id = ?
  `).get(matchId) as { user_a_id: number; user_b_id: number } | undefined;

  if (!match) {
    throw new Error("No encontramos ese match.");
  }

  const otherUserId = match.user_a_id === userId ? match.user_b_id : match.user_a_id;
  const sender = buildSession(db, userId);

  db.prepare(`
    INSERT INTO messages (match_id, sender_user_id, content, message_type, media_uri, media_mime_type, media_duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(matchId, userId, trimmed, messageType, mediaUri, mediaMimeType, mediaDurationMs, getIsoNow());

  const preview = buildMessagePreview({
    content: trimmed,
    messageType,
  });

  createNotification(db, {
    userId: otherUserId,
    actorUserId: userId,
    kind: "message_received",
    title: `Nuevo mensaje de ${sender.profile.displayName || sender.user.fullName}`,
    body: preview.slice(0, 120),
    matchId,
  });

  return getMessagesForMatch(db, userId, matchId);
}

export function createReport(
  db: DatabaseSync,
  reporterUserId: number,
  targetUserId: number,
  reason: string,
  details: string,
) {
  db.prepare(`
    INSERT INTO reports (reporter_user_id, target_user_id, reason, details, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(reporterUserId, targetUserId, reason.trim(), details.trim(), getIsoNow());
}

export function createBlock(db: DatabaseSync, userId: number, targetUserId: number) {
  db.prepare(`
    INSERT OR IGNORE INTO blocks (user_id, blocked_user_id, created_at)
    VALUES (?, ?, ?)
  `).run(userId, targetUserId, getIsoNow());
}

export function completeVerification(db: DatabaseSync, userId: number, selfieUri: string) {
  const current = buildSession(db, userId);
  const normalizedSelfieUri = selfieUri.trim();

  if (!current.profile.onboardingCompleted) {
    throw new Error("Completa tu perfil antes de verificar la cuenta.");
  }

  if (!normalizedSelfieUri) {
    throw new Error("Debes enviar la selfie de verificacion.");
  }

  db.prepare(`
    UPDATE profiles
    SET is_verified = 1,
        verification_status = 'verified',
        verification_selfie_uri = ?,
        updated_at = ?
    WHERE user_id = ?
  `).run(normalizedSelfieUri, getIsoNow(), userId);

  return buildSession(db, userId);
}

function mapActivityRows(rows: ActivityRow[]): ActivityItem[] {
  return rows.map((row) => {
    const photos = parseStringArray(row.photos_json);

    return {
      userId: row.user_id,
      displayName: row.display_name,
      city: row.city,
      primaryPhoto: toPublicMediaUrl(photos[0] ?? ""),
      createdAt: row.created_at,
    };
  });
}

export function getActivity(db: DatabaseSync, userId: number): ActivityPayload {
  const viewsReceived = db.prepare(`
    SELECT
      actor.id as user_id,
      actor_profile.display_name,
      actor_profile.city,
      actor_profile.photos_json,
      pv.viewed_at as created_at
    FROM profile_visits pv
    JOIN users actor ON actor.id = pv.actor_user_id
    JOIN profiles actor_profile ON actor_profile.user_id = actor.id
    WHERE pv.target_user_id = ?
    ORDER BY pv.viewed_at DESC
    LIMIT 20
  `).all(userId) as ActivityRow[];

  const viewsSent = db.prepare(`
    SELECT
      target.id as user_id,
      target_profile.display_name,
      target_profile.city,
      target_profile.photos_json,
      pv.viewed_at as created_at
    FROM profile_visits pv
    JOIN users target ON target.id = pv.target_user_id
    JOIN profiles target_profile ON target_profile.user_id = target.id
    WHERE pv.actor_user_id = ?
    ORDER BY pv.viewed_at DESC
    LIMIT 20
  `).all(userId) as ActivityRow[];

  const likesReceived = db.prepare(`
    SELECT
      actor.id as user_id,
      actor_profile.display_name,
      actor_profile.city,
      actor_profile.photos_json,
      interactions.created_at
    FROM interactions
    JOIN users actor ON actor.id = interactions.actor_user_id
    JOIN profiles actor_profile ON actor_profile.user_id = actor.id
    WHERE interactions.target_user_id = ?
      AND interactions.action = 'like'
    ORDER BY interactions.created_at DESC
    LIMIT 20
  `).all(userId) as ActivityRow[];

  return {
    viewsReceived: mapActivityRows(viewsReceived),
    viewsSent: mapActivityRows(viewsSent),
    likesReceived: mapActivityRows(likesReceived),
  };
}

function mapNotificationRows(rows: NotificationRow[]): NotificationItem[] {
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    matchId: row.match_id,
    actor:
      row.actor_user_id && row.display_name && row.city
        ? {
            userId: row.actor_user_id,
            displayName: row.display_name,
            city: row.city,
            primaryPhoto: toPublicMediaUrl(parseStringArray(row.photos_json ?? "")[0] ?? ""),
            createdAt: row.created_at,
          }
        : null,
  }));
}

export function getNotifications(db: DatabaseSync, userId: number): NotificationsPayload {
  const rows = db.prepare(`
    SELECT
      n.id,
      n.kind,
      n.title,
      n.body,
      n.is_read,
      n.created_at,
      n.match_id,
      n.actor_user_id,
      p.display_name,
      p.city,
      p.photos_json
    FROM notifications n
    LEFT JOIN profiles p ON p.user_id = n.actor_user_id
    WHERE n.user_id = ?
    ORDER BY n.id DESC
    LIMIT 40
  `).all(userId) as NotificationRow[];

  const unreadRows = db.prepare(`
    SELECT kind, COUNT(*) as total
    FROM notifications
    WHERE user_id = ? AND is_read = 0
    GROUP BY kind
  `).all(userId) as Array<{ kind: NotificationKind; total: number }>;

  const unreadByKind: Record<NotificationKind, number> = {
    like_received: 0,
    match_created: 0,
    message_received: 0,
    direct_message_received: 0,
  };

  for (const row of unreadRows) {
    unreadByKind[row.kind] = row.total;
  }

  return {
    notifications: mapNotificationRows(rows),
    unreadCount:
      unreadByKind.like_received +
      unreadByKind.match_created +
      unreadByKind.message_received +
      unreadByKind.direct_message_received,
    unreadByKind,
  };
}

export function markNotificationsRead(
  db: DatabaseSync,
  userId: number,
  input?: {
    ids?: number[];
    matchId?: number;
  },
) {
  const now = getIsoNow();

  if (input?.ids && input.ids.length > 0) {
    const placeholders = input.ids.map(() => "?").join(", ");
    db.prepare(`
      UPDATE notifications
      SET is_read = 1, read_at = ?
      WHERE user_id = ?
        AND is_read = 0
        AND id IN (${placeholders})
    `).run(now, userId, ...input.ids);
    return;
  }

  if (input?.matchId) {
    db.prepare(`
      UPDATE notifications
      SET is_read = 1, read_at = ?
      WHERE user_id = ?
        AND is_read = 0
        AND match_id = ?
    `).run(now, userId, input.matchId);
    return;
  }

  db.prepare(`
    UPDATE notifications
    SET is_read = 1, read_at = ?
    WHERE user_id = ?
      AND is_read = 0
  `).run(now, userId);
}

export function createWaitlistLead(
  db: DatabaseSync,
  input: {
    name: string;
    email: string;
    city?: string;
    note?: string;
  },
) {
  db.prepare(`
    INSERT INTO waitlist_leads (name, email, city, note, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(email)
    DO UPDATE SET name = excluded.name, city = excluded.city, note = excluded.note
  `).run(input.name.trim(), input.email.trim().toLowerCase(), input.city?.trim() ?? "", input.note?.trim() ?? "", getIsoNow());
}

export function createManualPaymentRequest(
  db: DatabaseSync,
  userId: number,
  input: {
    plan?: DatingPlan;
    amount?: string;
    reference?: string;
    note?: string;
  },
) {
  const plan = input.plan === "plus" ? "plus" : "free";
  if (plan !== "plus") {
    throw new Error("Solo se aceptan solicitudes manuales para Plus.");
  }

  db.prepare(`
    INSERT INTO manual_payments (user_id, plan, amount, reference, note, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    userId,
    plan,
    input.amount?.trim() ?? "",
    input.reference?.trim() ?? "",
    input.note?.trim() ?? "",
    getIsoNow(),
  );
}

export function setUserPlan(db: DatabaseSync, userId: number, plan: DatingPlan) {
  if (plan !== "free" && plan !== "plus") {
    throw new Error("Plan invalido.");
  }

  db.prepare(`
    UPDATE users
    SET plan = ?
    WHERE id = ?
  `).run(plan, userId);

  return buildSession(db, userId);
}

export function deleteAccount(db: DatabaseSync, userId: number) {
  db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
  deleteUserMedia(userId);
}

export function getAdminMetrics(db: DatabaseSync) {
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) as total FROM ${table}`).get() as { total: number }).total;

  const recentReports = db.prepare(`
    SELECT r.reason, r.details, r.created_at, reporter.full_name as reporter_name, target.full_name as target_name
    FROM reports r
    JOIN users reporter ON reporter.id = r.reporter_user_id
    JOIN users target ON target.id = r.target_user_id
    ORDER BY r.id DESC
    LIMIT 5
  `).all() as Array<{
    reason: string;
    details: string;
    created_at: string;
    reporter_name: string;
    target_name: string;
  }>;

  const recentLeads = db.prepare(`
    SELECT name, email, city, note, created_at
    FROM waitlist_leads
    ORDER BY id DESC
    LIMIT 5
  `).all() as Array<{
    name: string;
    email: string;
    city: string;
    note: string;
    created_at: string;
  }>;

  const recentManualPayments = db.prepare(`
    SELECT mp.id, mp.plan, mp.amount, mp.reference, mp.note, mp.status, mp.created_at,
           u.id as user_id, u.email, u.full_name
    FROM manual_payments mp
    JOIN users u ON u.id = mp.user_id
    ORDER BY mp.id DESC
    LIMIT 10
  `).all() as Array<{
    id: number;
    plan: DatingPlan;
    amount: string;
    reference: string;
    note: string;
    status: string;
    created_at: string;
    user_id: number;
    email: string;
    full_name: string;
  }>;

  return {
    totals: {
      users: count("users"),
      profiles: count("profiles"),
      matches: count("matches"),
      messages: count("messages"),
      likes: count("interactions"),
      reports: count("reports"),
      waitlist: count("waitlist_leads"),
      blocks: count("blocks"),
      visits: count("profile_visits"),
      notifications: count("notifications"),
      devicePushTokens: count("device_push_tokens"),
      manualPayments: count("manual_payments"),
    },
    recentReports,
    recentLeads,
    recentManualPayments,
  };
}
