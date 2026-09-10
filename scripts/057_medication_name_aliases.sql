-- 057: Medication Name Aliases — maps user free-text names to canonical catalog drugs.
-- Populated by admin via AI suggestion tool on /medications page.
-- Idempotent: uses IF NOT EXISTS

CREATE TABLE IF NOT EXISTS medication_name_aliases (
    id SERIAL PRIMARY KEY,
    alias_name VARCHAR(200) NOT NULL,           -- user free-text name
    canonical_medication_id INT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    approved_by INT REFERENCES users(id),       -- NULL = pending / not yet approved
    auto_generated BOOLEAN DEFAULT TRUE,        -- suggested by AI tool
    usage_count INT DEFAULT 0,                  -- snapshot from suggestion time
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (alias_name)
);

CREATE INDEX IF NOT EXISTS idx_med_aliases_canonical
    ON medication_name_aliases (canonical_medication_id);
CREATE INDEX IF NOT EXISTS idx_med_aliases_alias_name
    ON medication_name_aliases (alias_name);
