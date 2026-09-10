-- cfarm-relay D1 schema (Cloudflare Worker SQLite)
-- Run via:  npx wrangler d1 execute cfarm-relay-db --file=./schema.sql --remote

CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_label TEXT,
    telegram_chat_id TEXT UNIQUE NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_verified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_channels_active ON channels(active);

CREATE TABLE IF NOT EXISTS delivery_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    alert_type TEXT,
    success INTEGER NOT NULL,
    error_msg TEXT,
    delivered_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_delivery_log_delivered_at ON delivery_log(delivered_at);

-- One-time bind tokens issued by CFarm admin UI. Worker consumes them when
-- the user opens /register?token=... and either accepts or rejects based on
-- chat_id presence.
CREATE TABLE IF NOT EXISTS bind_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    user_label TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_bind_tokens_token ON bind_tokens(token);

-- Auto-prune delivery_log older than 7 days (run as cron trigger or manually).
-- Trigger is added in src/index.js as a scheduled handler if desired.