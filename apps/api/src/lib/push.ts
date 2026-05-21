import type { DatabaseSync } from "node:sqlite";

import type { NotificationKind } from "../types.js";

type ExpoPushTicket = {
  status?: "ok" | "error";
  message?: string;
  details?: {
    error?: string;
  };
};

function getIsoNow() {
  return new Date().toISOString();
}

function isExpoPushToken(value: string) {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(value.trim());
}

function groupTokensByError(tickets: Array<{ token: string; error: string }>) {
  const grouped = new Map<string, string[]>();

  for (const ticket of tickets) {
    const current = grouped.get(ticket.error) ?? [];
    current.push(ticket.token);
    grouped.set(ticket.error, current);
  }

  return grouped;
}

function markPushTokensSent(db: DatabaseSync, tokens: string[]) {
  if (tokens.length === 0) {
    return;
  }

  const placeholders = tokens.map(() => "?").join(", ");
  const now = getIsoNow();

  db.prepare(`
    UPDATE device_push_tokens
    SET last_sent_at = ?, updated_at = ?, last_error = ''
    WHERE expo_push_token IN (${placeholders})
  `).run(now, now, ...tokens);
}

function markPushTokensError(db: DatabaseSync, tokens: string[], error: string, disable = false) {
  if (tokens.length === 0) {
    return;
  }

  const placeholders = tokens.map(() => "?").join(", ");
  const now = getIsoNow();

  db.prepare(`
    UPDATE device_push_tokens
    SET is_active = ?,
        last_error = ?,
        updated_at = ?
    WHERE expo_push_token IN (${placeholders})
  `).run(disable ? 0 : 1, error.slice(0, 240), now, ...tokens);
}

async function deliverPushNotifications(
  db: DatabaseSync,
  tokens: string[],
  input: {
    kind: NotificationKind;
    title: string;
    body: string;
    matchId: number | null;
  },
) {
  const messages = tokens.map((token) => ({
    to: token,
    sound: "default",
    title: input.title,
    body: input.body,
    priority: "high",
    channelId: "default",
    data: {
      kind: input.kind,
      matchId: input.matchId,
    },
  }));

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(7000),
  });

  let payload: { data?: ExpoPushTicket[] } | null = null;

  try {
    payload = (await response.json()) as { data?: ExpoPushTicket[] };
  } catch {
    payload = null;
  }

  if (!response.ok) {
    markPushTokensError(db, tokens, `expo_http_${response.status}`);
    return;
  }

  const tickets = Array.isArray(payload?.data) ? payload.data : [];
  const okTokens: string[] = [];
  const disableTokens: string[] = [];
  const failedTokens: Array<{ token: string; error: string }> = [];

  for (const [index, token] of tokens.entries()) {
    const ticket = tickets[index];

    if (!ticket || ticket.status === "ok") {
      okTokens.push(token);
      continue;
    }

    const ticketError = ticket.details?.error || ticket.message || "expo_push_error";

    if (ticketError === "DeviceNotRegistered") {
      disableTokens.push(token);
      continue;
    }

    failedTokens.push({
      token,
      error: ticketError,
    });
  }

  markPushTokensSent(db, okTokens);
  markPushTokensError(db, disableTokens, "DeviceNotRegistered", true);

  for (const [error, errorTokens] of groupTokensByError(failedTokens)) {
    markPushTokensError(db, errorTokens, error);
  }
}

export function saveDevicePushToken(
  db: DatabaseSync,
  userId: number,
  input: {
    expoPushToken: string;
    platform?: string;
    deviceName?: string;
  },
) {
  const expoPushToken = input.expoPushToken.trim();

  if (!isExpoPushToken(expoPushToken)) {
    throw new Error("Expo push token invalido.");
  }

  const now = getIsoNow();

  db.prepare(`
    INSERT INTO device_push_tokens (
      user_id,
      expo_push_token,
      platform,
      device_name,
      is_active,
      created_at,
      updated_at,
      last_error
    )
    VALUES (?, ?, ?, ?, 1, ?, ?, '')
    ON CONFLICT(expo_push_token)
    DO UPDATE SET
      user_id = excluded.user_id,
      platform = excluded.platform,
      device_name = excluded.device_name,
      is_active = 1,
      updated_at = excluded.updated_at,
      last_error = ''
  `).run(userId, expoPushToken, input.platform?.trim() || "unknown", input.deviceName?.trim() || "", now, now);
}

export function queuePushNotification(
  db: DatabaseSync,
  input: {
    userId: number;
    kind: NotificationKind;
    title: string;
    body: string;
    matchId: number | null;
  },
) {
  const rows = db.prepare(`
    SELECT expo_push_token
    FROM device_push_tokens
    WHERE user_id = ?
      AND is_active = 1
    ORDER BY updated_at DESC
    LIMIT 6
  `).all(input.userId) as Array<{ expo_push_token: string }>;

  const tokens = rows.map((row) => row.expo_push_token).filter(isExpoPushToken);
  if (tokens.length === 0) {
    return;
  }

  void deliverPushNotifications(db, tokens, {
    kind: input.kind,
    title: input.title,
    body: input.body,
    matchId: input.matchId,
  }).catch((error) => {
    const reason = error instanceof Error ? error.message : "push_delivery_failed";
    markPushTokensError(db, tokens, reason);
  });
}
