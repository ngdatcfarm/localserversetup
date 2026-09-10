-- 058_inverter_runtime.sql
-- Luxpower SNA 6.5k inverter telemetry (Phase 1 — read-only monitoring)
-- - 1 row per 5-second poll sample
-- - TimescaleDB hypertable with 90-day retention
-- - Hourly continuous aggregate for fast dashboard chart queries
-- - Falls back to a plain table if TimescaleDB extension is not installed
--
-- Indexes:
--   (ts DESC)        — most common query pattern (latest first)
--   (soc)            — for low-battery alarm queries
--   raw (JSONB)      — keeps the original uint16 block for re-derivation
--                      if the register map is corrected in a later firmware

-- (1) Base table
CREATE TABLE IF NOT EXISTS inverter_runtime (
    ts     TIMESTAMPTZ      NOT NULL,
    ppv1   DOUBLE PRECISION NOT NULL DEFAULT 0,
    ppv2   DOUBLE PRECISION NOT NULL DEFAULT 0,
    p_grid DOUBLE PRECISION NOT NULL DEFAULT 0,  -- + export, − import
    p_eps  DOUBLE PRECISION NOT NULL DEFAULT 0,  -- load / EPS draw
    p_bat  DOUBLE PRECISION NOT NULL DEFAULT 0,  -- + charge, − discharge
    soc    DOUBLE PRECISION NOT NULL DEFAULT 0,  -- 0..100 %
    v_bat  DOUBLE PRECISION NOT NULL DEFAULT 0,  -- volts
    raw    JSONB                                  -- raw uint16 register block
);

-- (2) Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inverter_runtime_ts
    ON inverter_runtime (ts DESC);
CREATE INDEX IF NOT EXISTS idx_inverter_runtime_soc
    ON inverter_runtime (soc)
    WHERE soc < 20;  -- only index "low battery" rows; btree on narrow range

-- (3) Hypertable (with safe fallback if TimescaleDB isn't installed)
DO $$ BEGIN
    PERFORM create_hypertable(
        'inverter_runtime', 'ts',
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists => TRUE
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'inverter_runtime: not a hypertable (%)', SQLERRM;
END $$;

-- (4) 90-day retention policy (matches sensor_data)
DO $$ BEGIN
    PERFORM add_retention_policy(
        'inverter_runtime', INTERVAL '90 days'
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'inverter_runtime: retention policy skipped (%)', SQLERRM;
END $$;

-- (5) Hourly continuous aggregate for fast dashboard chart queries
DO $$ BEGIN
    EXECUTE $SQL$
        CREATE MATERIALIZED VIEW inverter_runtime_hourly
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(INTERVAL '1 hour', ts) AS bucket,
            AVG(ppv1)          AS ppv1_avg,
            AVG(ppv2)          AS ppv2_avg,
            MIN(ppv1 + ppv2)   AS ppv_min,
            MAX(ppv1 + ppv2)   AS ppv_max,
            AVG(p_grid)        AS p_grid_avg,
            AVG(p_eps)         AS p_eps_avg,
            AVG(p_bat)         AS p_bat_avg,
            AVG(soc)           AS soc_avg,
            MIN(soc)           AS soc_min,
            MAX(soc)           AS soc_max,
            AVG(v_bat)         AS v_bat_avg,
            COUNT(*)           AS sample_count
        FROM inverter_runtime
        GROUP BY bucket
        WITH NO DATA;
    $SQL$;

    -- Refresh the last 7 days every hour; backfill the last day every 15 min.
    PERFORM add_continuous_aggregate_policy(
        'inverter_runtime_hourly',
        start_offset      => INTERVAL '7 days',
        end_offset        => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour'
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'inverter_runtime_hourly: continuous aggregate unavailable (%)', SQLERRM;
END $$;
