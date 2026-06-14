-- 053_mq_tare.sql
-- MQ135/MQ137 R0 baseline calibration (Tare)
-- - Adds first_heartbeat_at column on devices (24h gate)
-- - mq_calibrations: 1 row per tare attempt
-- - mq_ratio_samples: hypertable, 1 row per reading after R0 known
-- - mq_ratio_5min: continuous aggregate, 5-min bucket
-- Idempotent, with fallback for non-TimescaleDB.

-- (1) Add first_heartbeat_at column (24h gate for tare)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS first_heartbeat_at TIMESTAMPTZ;
UPDATE devices SET first_heartbeat_at = created_at WHERE first_heartbeat_at IS NULL;

-- (2) mq_calibrations — 1 row / tare attempt
CREATE TABLE IF NOT EXISTS mq_calibrations (
    id BIGSERIAL PRIMARY KEY,
    device_id BIGINT NOT NULL,
    sensor_type VARCHAR(32) NOT NULL CHECK (sensor_type IN ('mq135_raw','mq137_raw')),
    status VARCHAR(16) NOT NULL DEFAULT 'collecting'
        CHECK (status IN ('collecting','completed','failed','cancelled')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    sample_count INTEGER NOT NULL DEFAULT 0,
    r0_ohms DOUBLE PRECISION,
    r0_stddev DOUBLE PRECISION,
    load_resistor DOUBLE PRECISION NOT NULL DEFAULT 10000,
    adc_max INTEGER NOT NULL DEFAULT 4095,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mq_cal_device_sensor
    ON mq_calibrations (device_id, sensor_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_mq_cal_collecting
    ON mq_calibrations (status) WHERE status = 'collecting';

-- (3) mq_ratio_samples — hypertable, 1 row / reading sau khi có R0
CREATE TABLE IF NOT EXISTS mq_ratio_samples (
    time TIMESTAMPTZ NOT NULL,
    device_id BIGINT NOT NULL,
    sensor_type VARCHAR(32) NOT NULL,
    raw_adc INTEGER NOT NULL,
    rs_ohms DOUBLE PRECISION NOT NULL,
    r0_ohms DOUBLE PRECISION NOT NULL,
    rs_r0_ratio DOUBLE PRECISION NOT NULL,
    calibration_id BIGINT
);
CREATE INDEX IF NOT EXISTS idx_mq_ratio_dev_time
    ON mq_ratio_samples (device_id, sensor_type, time DESC);

-- Hypertable (fallback plain table)
DO $$ BEGIN
    PERFORM create_hypertable('mq_ratio_samples','time',chunk_time_interval=>INTERVAL '1 day',if_not_exists=>TRUE);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'mq_ratio_samples: not a hypertable (%)', SQLERRM;
END $$;

-- (4) mq_ratio_5min — continuous aggregate, auto-refresh 5 phút
DO $$ BEGIN
    EXECUTE $SQL$
        CREATE MATERIALIZED VIEW mq_ratio_5min
        WITH (timescaledb.continuous) AS
        SELECT time_bucket(INTERVAL '5 minutes', time) AS bucket,
               device_id, sensor_type,
               AVG(rs_r0_ratio) AS ratio_avg,
               MIN(rs_r0_ratio) AS ratio_min,
               MAX(rs_r0_ratio) AS ratio_max,
               COUNT(*)         AS sample_count
          FROM mq_ratio_samples
         GROUP BY bucket, device_id, sensor_type
        WITH NO DATA;
    $SQL$;
    PERFORM add_continuous_aggregate_policy('mq_ratio_5min',
        start_offset => INTERVAL '1 hour',
        end_offset   => INTERVAL '5 minutes',
        schedule_interval => INTERVAL '5 minutes');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'mq_ratio_5min: continuous aggregate unavailable (%)', SQLERRM;
END $$;

-- (5) Retention policy 90 ngày (match sensor_data)
DO $$ BEGIN
    PERFORM add_retention_policy('mq_ratio_samples', INTERVAL '90 days');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'retention policy skipped (%)', SQLERRM;
END $$;
