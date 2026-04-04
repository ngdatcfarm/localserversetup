-- ============================================
-- Add Weight Samples Table
-- Date: 2026-04-04
-- Purpose: Create weight_samples table for individual bird weight tracking
-- ============================================

CREATE TABLE IF NOT EXISTS weight_samples (
    id BIGSERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    weight_g INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create FK to care_weights (session_id references care_weights.id)
DO $$ BEGIN
    ALTER TABLE weight_samples ADD CONSTRAINT fk_weight_samples_session
        FOREIGN KEY (session_id) REFERENCES care_weights(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_weight_samples_session ON weight_samples (session_id);
CREATE INDEX IF NOT EXISTS idx_weight_samples_created ON weight_samples (created_at);

DO $$ BEGIN
    RAISE NOTICE '=== Script 018: weight_samples table created successfully ===';
END $$;
