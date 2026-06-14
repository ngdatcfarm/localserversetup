-- 054_users.sql
-- User accounts for webapp authentication.
-- - Username + bcrypt password hash
-- - Role: 'admin' (full access) | 'worker' (read + limited write — enforced in app layer later)
-- - must_change_password: forces first-login password reset
-- - Idempotent.

CREATE TABLE IF NOT EXISTS users (
    id                  SERIAL PRIMARY KEY,
    username            VARCHAR(64)  UNIQUE NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,
    role                VARCHAR(16)  NOT NULL DEFAULT 'worker'
        CHECK (role IN ('admin', 'worker')),
    active              BOOLEAN      NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN     NOT NULL DEFAULT FALSE,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_active   ON users (active) WHERE active = TRUE;

-- Default admin account: username=admin, password=admin (force change on first login).
-- The bcrypt hash below is for the literal string "admin" (cost factor 12).
-- Rotated via POST /api/auth/change-password after first login.
INSERT INTO users (username, password_hash, role, active, must_change_password)
VALUES (
    'admin',
    '$2b$12$2Igifhgr6NzuavAFd.eEsONlAQcRTg3LZyjbbYtuTAiAHhnoyobmu',
    'admin',
    TRUE,
    TRUE
)
ON CONFLICT (username) DO NOTHING;
