-- AI Logic Tables: multi-step automation rules
-- AI Logic Rules: top-level rule definition
CREATE TABLE ai_logic_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    trigger_type VARCHAR(50) NOT NULL,  -- 'schedule', 'manual'
    cron_expression VARCHAR(100),       -- for schedule trigger
    cooldown_seconds INTEGER DEFAULT 60,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Logic Steps: individual steps within a rule
CREATE TABLE ai_logic_steps (
    id SERIAL PRIMARY KEY,
    rule_id INTEGER REFERENCES ai_logic_rules(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    action_type VARCHAR(50) NOT NULL,  -- 'goto_preset', 'record_video', 'record_snapshot', 'wait', 'stop_recording'
    camera_id VARCHAR(100),
    preset_id INTEGER,                  -- for goto_preset
    duration_seconds INTEGER DEFAULT 0, -- for record_video, wait
    config JSONB DEFAULT '{}',          -- extra config (count for snapshots, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_logic_steps_rule_id ON ai_logic_steps(rule_id);
CREATE INDEX idx_ai_logic_steps_order ON ai_logic_steps(rule_id, step_order);