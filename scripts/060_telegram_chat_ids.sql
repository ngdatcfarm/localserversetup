-- 060_telegram_chat_ids.sql
-- Track which Telegram chat_ids have been bound via the Cloudflare Worker relay.
-- The Worker is the source of truth (D1 channels table); this local table is
-- an audit log + last-known mapping for the CFarm admin UI.
--
-- The Worker calls /admin/issue-token with HMAC, then on /register?token=...&chat_id=...
-- it inserts into its own D1. We mirror here on a periodic best-effort basis
-- (or by manual admin "Sync from Worker" button in future).

CREATE TABLE IF NOT EXISTS telegram_chat_ids (
    id SERIAL PRIMARY KEY,
    user_label TEXT,
    chat_id TEXT NOT NULL UNIQUE,
    bind_token TEXT,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_telegram_chat_ids_active
    ON telegram_chat_ids (chat_id);

COMMENT ON TABLE telegram_chat_ids IS
    'Mirror of D1 channels table on Cloudflare Worker. Worker is source of truth; this table is a local audit log + last-known mapping.';