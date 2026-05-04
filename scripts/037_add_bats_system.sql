-- =====================================================
-- Bats System - For controlling barn curtains/ventilation
-- Each barn has 4 default bats: left_top, left_bottom, right_top, right_bottom
-- =====================================================

-- Bats table - stores bat configuration per barn
-- Note: barn_id is VARCHAR(50) to match barns.id type
CREATE TABLE IF NOT EXISTS bats (
    id SERIAL PRIMARY KEY,
    barn_id VARCHAR(50) NOT NULL REFERENCES barns(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,  -- left_top, left_bottom, right_top, right_bottom
    name VARCHAR(100) NOT NULL,  -- UI display name: Bạt trái trên, etc.
    device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,  -- relay 8ch device
    up_relay_channel INTEGER NOT NULL CHECK (up_relay_channel BETWEEN 1 AND 8),
    down_relay_channel INTEGER NOT NULL CHECK (down_relay_channel BETWEEN 1 AND 8),
    auto_enabled BOOLEAN DEFAULT FALSE,  -- user can enable ML-based auto control
    timeout_seconds INTEGER DEFAULT 210,  -- 3.5 minutes
    position VARCHAR(20) DEFAULT 'stopped',  -- up, down, stopped
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(barn_id, code)
);

-- Bat logs table - history of bat movements
CREATE TABLE IF NOT EXISTS bat_logs (
    id SERIAL PRIMARY KEY,
    bat_id INTEGER NOT NULL REFERENCES bats(id) ON DELETE CASCADE,
    cycle_id INTEGER REFERENCES cycles(id) ON DELETE SET NULL,  -- NULL if no active cycle
    action VARCHAR(20) NOT NULL,  -- up, down, stop
    duration_seconds INTEGER,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying bat logs
CREATE INDEX IF NOT EXISTS idx_bat_logs_bat_id ON bat_logs(bat_id);
CREATE INDEX IF NOT EXISTS idx_bat_logs_started_at ON bat_logs(started_at DESC);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_bat_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trg_bats_updated_at ON bats;
CREATE TRIGGER trg_bats_updated_at
    BEFORE UPDATE ON bats
    FOR EACH ROW
    EXECUTE FUNCTION update_bat_timestamp();

-- Insert default bats for existing barns (if not already exists)
INSERT INTO bats (barn_id, code, name, up_relay_channel, down_relay_channel)
SELECT id, 'left_top', 'Bạt trái trên', 1, 2 FROM barns b
WHERE NOT EXISTS (SELECT 1 FROM bats WHERE barn_id = b.id AND code = 'left_top');

INSERT INTO bats (barn_id, code, name, up_relay_channel, down_relay_channel)
SELECT id, 'left_bottom', 'Bạt trái dưới', 3, 4 FROM barns b
WHERE NOT EXISTS (SELECT 1 FROM bats WHERE barn_id = b.id AND code = 'left_bottom');

INSERT INTO bats (barn_id, code, name, up_relay_channel, down_relay_channel)
SELECT id, 'right_top', 'Bạt phải trên', 5, 6 FROM barns b
WHERE NOT EXISTS (SELECT 1 FROM bats WHERE barn_id = b.id AND code = 'right_top');

INSERT INTO bats (barn_id, code, name, up_relay_channel, down_relay_channel)
SELECT id, 'right_bottom', 'Bạt phải dưới', 7, 8 FROM barns b
WHERE NOT EXISTS (SELECT 1 FROM bats WHERE barn_id = b.id AND code = 'right_bottom');
