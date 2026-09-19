-- 071_seed_hill_chicken_standard.sql
-- Date: 2026-09-18
-- Purpose: Seed the hill_chicken_standard profile (Vietnamese free-range
--          tropical chickens). 6 stages from the user's reference schedule.
--          Idempotent: each INSERT guards on NOT EXISTS so re-running the
--          migration is a no-op.
--
-- IMPORTANT NOTE on day_range_start=1, heater_zone_limit=35.5:
--   This exceeds firmware EMERGENCY_LATCH_C = 35.1°C. The seed keeps the
--   user's intended value as a grandfathered data point. The API validator
--   rejects any NEW edit above 35.1, but the seed is allowed to land it.
--   The detail page UI surfaces a warning chip ("Giới hạn heater vượt
--   firmware cap (35.1°C)") so admins know the heater-zone limit is
--   advisory only — the firmware will still clamp at 35.1°C.
--
-- Run via: python run_all_new_migrations.py (added to SCRIPTS list).

BEGIN;

-- Create the profile row first (idempotent on code).
INSERT INTO brooder_profiles (
    code, name, species, description,
    emergency_cutoff_temp, emergency_release_temp,
    min_ambient_temp, temperature_unit, is_active
)
SELECT
    'hill_chicken_standard',
    'Gà thả vườn tiêu chuẩn',
    'Gà ta (free-range)',
    'Lịch sưởi chuẩn cho gà thả vườn Việt Nam. 6 giai đoạn, Day 1-3 → 33.5°C, giảm dần về 22°C ở tuần thứ 5+. Ban đêm (≥18h-<6h) tăng +0.5°C ở 4 tuần đầu.',
    35.1, 34.6, 5.0, 'celsius', TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM brooder_profiles WHERE code = 'hill_chicken_standard'
);

-- Now seed the 6 stages. Each INSERT is gated on the (profile_id, stage_order)
-- unique constraint — if a row already exists for that stage, the insert is a
-- no-op. Re-running 071 does NOT clobber admin edits.

INSERT INTO brooder_profile_schedules (
    profile_id, stage_order, day_range_start, day_range_end,
    setpoint_target, heater_zone_limit,
    humidity_min_pct, humidity_max_pct,
    night_boost_offset, notes
)
SELECT id, 1, 1, 3, 33.5, 35.5, 60.0, 70.0, 0.5,
       'Ngày 1-3: úm kín, đèn 24/7, theo dõi từng giờ.'
FROM brooder_profiles WHERE code = 'hill_chicken_standard'
AND NOT EXISTS (
    SELECT 1 FROM brooder_profile_schedules
    WHERE profile_id = (SELECT id FROM brooder_profiles WHERE code = 'hill_chicken_standard')
      AND stage_order = 1
);

INSERT INTO brooder_profile_schedules (
    profile_id, stage_order, day_range_start, day_range_end,
    setpoint_target, heater_zone_limit,
    humidity_min_pct, humidity_max_pct,
    night_boost_offset, notes
)
SELECT id, 2, 4, 7, 32.0, 34.0, 60.0, 65.0, 0.5,
       'Tuần 1: bắt đầu mở rèm ban ngày, giữ ấm ban đêm.'
FROM brooder_profiles WHERE code = 'hill_chicken_standard'
AND NOT EXISTS (
    SELECT 1 FROM brooder_profile_schedules
    WHERE profile_id = (SELECT id FROM brooder_profiles WHERE code = 'hill_chicken_standard')
      AND stage_order = 2
);

INSERT INTO brooder_profile_schedules (
    profile_id, stage_order, day_range_start, day_range_end,
    setpoint_target, heater_zone_limit,
    humidity_min_pct, humidity_max_pct,
    night_boost_offset, notes
)
SELECT id, 3, 8, 14, 29.5, 31.5, 55.0, 65.0, 0.5,
       'Tuần 2: cho ra chuồng rộng hơn, giảm dần nhiệt.'
FROM brooder_profiles WHERE code = 'hill_chicken_standard'
AND NOT EXISTS (
    SELECT 1 FROM brooder_profile_schedules
    WHERE profile_id = (SELECT id FROM brooder_profiles WHERE code = 'hill_chicken_standard')
      AND stage_order = 3
);

INSERT INTO brooder_profile_schedules (
    profile_id, stage_order, day_range_start, day_range_end,
    setpoint_target, heater_zone_limit,
    humidity_min_pct, humidity_max_pct,
    night_boost_offset, notes
)
SELECT id, 4, 15, 21, 27.0, 29.0, 55.0, 65.0, 0.5,
       'Tuần 3: chuyển sang chế độ "gà tơ", tăng đề kháng.'
FROM brooder_profiles WHERE code = 'hill_chicken_standard'
AND NOT EXISTS (
    SELECT 1 FROM brooder_profile_schedules
    WHERE profile_id = (SELECT id FROM brooder_profiles WHERE code = 'hill_chicken_standard')
      AND stage_order = 4
);

INSERT INTO brooder_profile_schedules (
    profile_id, stage_order, day_range_start, day_range_end,
    setpoint_target, heater_zone_limit,
    humidity_min_pct, humidity_max_pct,
    night_boost_offset, notes
)
SELECT id, 5, 22, 28, 25.0, 26.5, 55.0, 60.0, 0.0,
       'Tuần 4: tắt boost đêm, gà đã đủ lông.'
FROM brooder_profiles WHERE code = 'hill_chicken_standard'
AND NOT EXISTS (
    SELECT 1 FROM brooder_profile_schedules
    WHERE profile_id = (SELECT id FROM brooder_profiles WHERE code = 'hill_chicken_standard')
      AND stage_order = 5
);

INSERT INTO brooder_profile_schedules (
    profile_id, stage_order, day_range_start, day_range_end,
    setpoint_target, heater_zone_limit,
    humidity_min_pct, humidity_max_pct,
    night_boost_offset, notes
)
SELECT id, 6, 29, 999, 22.0, 24.0, 55.0, 60.0, 0.0,
       'Tuần 5+: gà trưởng thành, sưởi nhẹ chỉ khi trời rét.'
FROM brooder_profiles WHERE code = 'hill_chicken_standard'
AND NOT EXISTS (
    SELECT 1 FROM brooder_profile_schedules
    WHERE profile_id = (SELECT id FROM brooder_profiles WHERE code = 'hill_chicken_standard')
      AND stage_order = 6
);

DO $$ BEGIN
    RAISE NOTICE '=== Script 071: hill_chicken_standard seeded (6 stages) ===';
END $$;

COMMIT;