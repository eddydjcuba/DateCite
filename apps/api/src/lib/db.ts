import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { config } from "../config.js";
import { seedDatabase } from "./seed.js";

let database: DatabaseSync | null = null;

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureNotificationsKindConstraint(db: DatabaseSync) {
  const row = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'notifications'
  `).get() as { sql?: string } | undefined;

  if (!row?.sql || row.sql.includes("direct_message_received")) {
    return;
  }

  db.exec(`
    PRAGMA foreign_keys = OFF;

    ALTER TABLE notifications RENAME TO notifications_legacy;

    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('like_received', 'match_created', 'message_received', 'direct_message_received')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      read_at TEXT
    );

    INSERT INTO notifications (id, user_id, actor_user_id, kind, title, body, match_id, is_read, created_at, read_at)
    SELECT
      id,
      user_id,
      actor_user_id,
      CASE
        WHEN kind IN ('like_received', 'match_created', 'message_received', 'direct_message_received') THEN kind
        ELSE 'like_received'
      END,
      title,
      body,
      match_id,
      is_read,
      created_at,
      read_at
    FROM notifications_legacy;

    DROP TABLE notifications_legacy;

    PRAGMA foreign_keys = ON;
  `);
}

function ensureSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      birth_date TEXT NOT NULL,
      age INTEGER NOT NULL,
      city TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL,
      intention TEXT NOT NULL DEFAULT 'relacion-seria',
      interests_json TEXT NOT NULL DEFAULT '[]',
      photos_json TEXT NOT NULL DEFAULT '[]',
      prompts_json TEXT NOT NULL DEFAULT '[]',
      values_json TEXT NOT NULL DEFAULT '[]',
      lifestyle_json TEXT NOT NULL DEFAULT '[]',
      zodiac_sign TEXT NOT NULL DEFAULT '',
      gender_identity TEXT NOT NULL DEFAULT '',
      seeking_json TEXT NOT NULL DEFAULT '[]',
      is_verified INTEGER NOT NULL DEFAULT 0,
      verification_status TEXT NOT NULL DEFAULT 'required',
      verification_selfie_uri TEXT NOT NULL DEFAULT '',
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK(action IN ('like', 'pass')),
      created_at TEXT NOT NULL,
      UNIQUE(actor_user_id, target_user_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      match_kind TEXT NOT NULL DEFAULT 'mutual_like',
      created_at TEXT NOT NULL,
      UNIQUE(user_a_id, user_b_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      sender_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      media_uri TEXT NOT NULL DEFAULT '',
      media_mime_type TEXT NOT NULL DEFAULT '',
      media_duration_ms INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS direct_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, blocked_user_id)
    );

    CREATE TABLE IF NOT EXISTS waitlist_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      city TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profile_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      viewed_at TEXT NOT NULL,
      UNIQUE(actor_user_id, target_user_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('like_received', 'match_created', 'message_received', 'direct_message_received')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      read_at TEXT
    );

    CREATE TABLE IF NOT EXISTS device_push_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expo_push_token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'unknown',
      device_name TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_error TEXT NOT NULL DEFAULT '',
      last_sent_at TEXT
    );
  `);

  ensureColumn(db, "profiles", "zodiac_sign", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "profiles", "gender_identity", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "profiles", "seeking_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "profiles", "verification_status", "TEXT NOT NULL DEFAULT 'required'");
  ensureColumn(db, "profiles", "verification_selfie_uri", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "messages", "message_type", "TEXT NOT NULL DEFAULT 'text'");
  ensureColumn(db, "messages", "media_uri", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "messages", "media_mime_type", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "messages", "media_duration_ms", "INTEGER");
  ensureNotificationsKindConstraint(db);
}

export function getDb() {
  if (!database) {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    database = new DatabaseSync(config.dbPath);
    ensureSchema(database);
    seedDatabase(database);
  }

  return database;
}
