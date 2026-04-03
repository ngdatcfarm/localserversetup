# Data Completion Checklist

> **Tracking**: Tasks to align Local + Cloud schemas (Local is primary, Cloud reset OK)
> **Last Updated**: 2026-04-03 - Clean restructure based on data_dependency_map.md

---

## Status Summary

| Section | Status | Priority |
|---------|--------|----------|
| Farm entity | ⬜ TODO | HIGH |
| Barn schema | ⬜ TODO | HIGH |
| Cycle entity | ⬜ TODO | HIGH |
| Device entity | ⬜ TODO | HIGH |
| Warehouse + Inventory | ⬜ TODO | HIGH |
| Equipment (new) | ⬜ TODO | MEDIUM |
| SensorData (merged) | ⬜ TODO | HIGH |
| Care operations (feed/death/med/sale/weight) | ⬜ TODO | HIGH |
| Reference data sync | ⬜ TODO | MEDIUM |
| Sync handlers | ⬜ TODO | HIGH |

---

## [ ] 0. Farm Entity

**Priority**: HIGH — top-level, prerequisite

| Item | Status | Notes |
|------|--------|-------|
| Create `farms` table in Local | ✅ Script ready | scripts/015_add_farms_table.sql |
| Create `farms` table in Cloud | ⬜ TODO | Drop old, create new matching Local |
| Add `farm_id` to `barns` table | ⬜ TODO | Default = 'farm-01' |
| Create `_sync_farms` handler | ⬜ TODO | Bidirectional |
| Verify sync works | ⬜ TODO | |

**Cloud SQL** (reset ready):
```sql
DROP TABLE IF EXISTS barns CASCADE;  -- reset
CREATE TABLE farms (...);  -- matching Local
CREATE TABLE barns (...);  -- with farm_id FK
```

---

## [ ] 1. Barn Schema Alignment

**Priority**: HIGH

| Field | Local Status | Cloud Status | Action |
|-------|--------------|-------------|--------|
| `number` | ❌ Missing | ✅ Exists | Add to Local |
| `length_m` | ❌ Missing | ✅ Exists | Add to Local |
| `width_m` | ❌ Missing | ✅ Exists | Add to Local |
| `height_m` | ❌ Missing | ✅ Exists | Add to Local |
| `capacity` | ✅ Exists | ❌ Missing | Add to Cloud |
| `construction_cost` | ❌ Missing | ❌ Missing | Add to both |
| `construction_year` | ❌ Missing | ❌ Missing | Add to both |
| `expected_lifespan_years` | ❌ Missing | ❌ Missing | Add to both |
| `construction_type` | ❌ Missing | ❌ Missing | Add to both |

**Local migration scripts:**
- `scripts/013_add_barn_dimensions.sql` — number, length_m, width_m, height_m
- `scripts/014_add_barn_capex.sql` — construction_cost, construction_year, lifespan, type

**Cloud**: Reset barns table to match Local schema exactly.

---

## [ ] 2. Equipment Table (NEW)

**Priority**: MEDIUM

**Local**: Create `equipment` table (scripts/016_add_equipment.sql)
```sql
CREATE TABLE equipment (
    id SERIAL PRIMARY KEY,
    barn_id VARCHAR(50) REFERENCES barns(id),
    name VARCHAR(200) NOT NULL,
    equipment_type VARCHAR(50),
    model VARCHAR(100),
    serial_no VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    install_date DATE,
    warranty_until DATE,
    purchase_price DECIMAL(12,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Cloud**: Drop `inventory_consumable_assets`, recreate as `equipment`.

---

## [ ] 3. SensorData Merge (Cloud → Local Model)

**Priority**: HIGH

**Problem**: Cloud has separate `env_readings` and `env_weather` tables. Local has single `sensor_data`.

**Solution**: Cloud drops both, creates single `sensor_data` matching Local.

**sensor_type values** (from env_readings + env_weather):
- `temperature`
- `humidity`
- `nh3`
- `co2`
- `heat_index`
- `wind_speed`
- `wind_direction`
- `is_raining`
- `rainfall`
- `outdoor_temp`

---

## [ ] 4. Cycle + Care Operations

**Priority**: HIGH

### 4.1 Cycle Schema (Local needs these fields from Cloud)

| Field | Type | Local Status | Cloud Status | Action |
|-------|------|--------------|-------------|--------|
| `male_quantity` | INT | ❌ Missing | ✅ | Add to Local |
| `female_quantity` | INT | ❌ Missing | ✅ | Add to Local |
| `purchase_price` | DECIMAL(12,2) | ❌ Missing | ✅ | Add to Local |
| `stage` | VARCHAR(20) | ❌ Missing | ✅ | Add to Local (chick/grower/adult) |
| `flock_source` | VARCHAR(20) | ❌ Missing | ✅ | Add to Local (local/imported/hatchery) |
| `parent_cycle_id` | INT FK | ❌ Missing | ✅ | Add to Local (cycle splitting) |
| `split_date` | DATE | ❌ Missing | ✅ | Add to Local |
| `barn_id` | FK | ✅ | ❌ Missing | Add to Cloud (critical!) |
| `season` | VARCHAR(20) | ❌ Missing | ✅ | Add to Local (spring/summer/autumn/winter) |
| `vaccine_program_id` | INT FK | ❌ Missing | ✅ | Add to Local |
| `final_quantity` | INT | ❌ Missing | ✅ | Add to Local |
| `total_sold_weight_kg` | DECIMAL(10,2) | ❌ Missing | ✅ | Add to Local |
| `total_revenue` | DECIMAL(15,2) | ❌ Missing | ✅ | Add to Local |
| `close_reason` | VARCHAR(20) | ❌ Missing | ✅ | Add to Local (sold/mortality/other) |
| `code` | VARCHAR(50) | ❌ Missing | ✅ | Add to Local (cycle code) |

**Rename existing fields for consistency**:
- `initial_count` → `initial_quantity` (match Cloud)
- `current_count` → `current_quantity` (match Cloud)
- `actual_end_date` → `end_date` (match Cloud)

**Migration script** (`scripts/017_add_cycle_gender_finance.sql`):
```sql
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS male_quantity INT DEFAULT 0;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS female_quantity INT DEFAULT 0;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(12,2);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS stage VARCHAR(20) DEFAULT 'chick';
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS flock_source VARCHAR(20);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS parent_cycle_id INT REFERENCES cycles(id);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS split_date DATE;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS season VARCHAR(20);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS vaccine_program_id INT REFERENCES vaccine_programs(id);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS final_quantity INT;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS total_sold_weight_kg DECIMAL(10,2);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(15,2);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS close_reason VARCHAR(20);
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS code VARCHAR(50);
-- Rename for Cloud consistency
ALTER TABLE cycles RENAME COLUMN initial_count TO initial_quantity;
ALTER TABLE cycles RENAME COLUMN current_count TO current_quantity;
ALTER TABLE cycles RENAME COLUMN actual_end_date TO end_date;
```

### 4.2 Care Tables Schema Gaps

**care_deaths** - Add from Cloud:
| Field | Type | Local Status | Cloud Status |
|-------|------|--------------|-------------|
| `death_category` | VARCHAR(20) | ❌ Missing | ✅ disease/accident/weak/unknown |
| `image_path` | VARCHAR(500) | ❌ Missing | ✅ |

**care_medications** - Add from Cloud:
| Field | Type | Local Status | Cloud Status |
|-------|------|--------------|-------------|
| `dosage` | DECIMAL(10,2) | ❌ Missing | ✅ |
| `unit` | VARCHAR(50) | ❌ Missing | ✅ |

**care_sales** - Add from Cloud:
| Field | Type | Local Status | Cloud Status |
|-------|------|--------------|-------------|
| `gender` | VARCHAR(20) | ✅ Exists | ✅ male/female/mixed |

### 4.3 New Tables Missing in Local

| Table | Cloud Status | Local Status | Action |
|-------|-------------|--------------|--------|
| `weight_samples` | ✅ | ❌ Missing | Create (per bird weight data) |
| `care_expenses` | ✅ | ❌ Missing | Create (feed/medicine cost tracking) |
| `care_litters` | ✅ | ❌ Missing | Create (litter management) |
| `feed_trough_checks` | ✅ | ❌ Missing | Create (kiểm tra máng ăn sau bữa ăn) |
| `cycle_feed_programs` | ✅ | ❌ Missing | Create (assign feed_brand to cycle) |
| `cycle_feed_program_items` | ✅ | ❌ Missing | Create (items trong chương trình) |
| `cycle_feed_stages` | ✅ | ❌ Missing | Create (stage + primary/mix feed) |
| `cycle_splits` | ✅ | ❌ Missing | Create (lịch sử tách cycle) |

**weight_samples** (cloud has, local doesn't):
```sql
-- Each row = one bird's weight in a session
CREATE TABLE weight_samples (
    id SERIAL PRIMARY KEY,
    session_id INT REFERENCES weight_sessions(id),
    weight_g INT NOT NULL,  -- grams
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**care_expenses** (cloud has, local doesn't):
```sql
CREATE TABLE care_expenses (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    expense_date DATE NOT NULL,
    expense_type VARCHAR(50) NOT NULL,  -- 'feed' | 'medication' | 'labor' | 'utility' | 'other'
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**care_litters** (cloud has, local doesn't):
```sql
CREATE TABLE care_litters (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    litter_date DATE NOT NULL,
    litter_type VARCHAR(20) NOT NULL,  -- 'new' | 'top_up' | 'change'
    product_id INT REFERENCES products(id),  -- vật liệu lót (rơm, mùn cưa...)
    quantity_kg DECIMAL(10,2),         -- kg vật liệu tiêu hao
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Side-effect: khi ghi litter → trừ inventory_transactions (use_litter)
```

**feed_trough_checks** (cloud has, local doesn't) — kiểm tra máng ăn sau bữa ăn:
```sql
-- Ghi nhận thủ công, KHÔNG phải từ sensor
CREATE TABLE feed_trough_checks (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    ref_feed_id INT REFERENCES care_feeds(id),  -- bữa ăn được kiểm tra
    remaining_pct INT NOT NULL,  -- % còn lại (0-100)
    checked_at TIMESTAMPTZ NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- NOTE: care_feeds.remaining_pct = ước lượng lúc cho, feed_trough_checks = ghi sau
```

**cycle_feed_programs** (cloud has, local doesn't) — gán feed_brand cho cycle:
```sql
CREATE TABLE cycle_feed_programs (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    feed_brand_id INT REFERENCES feed_brands(id),
    start_date DATE NOT NULL,
    end_date DATE,  -- NULL = đang dùng
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**cycle_feed_program_items** (cloud has, local doesn't) — items trong chương trình:
```sql
CREATE TABLE cycle_feed_program_items (
    id SERIAL PRIMARY KEY,
    cycle_feed_program_id INT REFERENCES cycle_feed_programs(id),
    inventory_item_id INT REFERENCES products(id),
    stage VARCHAR(20) NOT NULL,  -- 'chick' | 'grower' | 'adult'
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**cycle_feed_stages** (cloud has, local doesn't) — stage feed chính + mix:
```sql
CREATE TABLE cycle_feed_stages (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    stage VARCHAR(20) NOT NULL,  -- 'chick' | 'grower' | 'adult'
    primary_feed_type_id INT REFERENCES feed_types(id),
    mix_feed_type_id INT REFERENCES feed_types(id),  -- NULL nếu không mix
    mix_ratio INT,  -- % của feed mới (10, 25, 50...)
    effective_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**cycle_splits** (cloud has, local doesn't) — lịch sử tách cycle:
```sql
CREATE TABLE cycle_splits (
    id SERIAL PRIMARY KEY,
    from_cycle_id INT REFERENCES cycles(id),  -- cycle gốc
    to_cycle_id INT REFERENCES cycles(id),   -- cycle mới được tách vào
    quantity INT NOT NULL,  -- số con tách
    split_date DATE NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.4 Sync Handlers to Add

| Handler | Status | Notes |
|---------|--------|-------|
| `_sync_weight_reminders` | ⬜ TODO | Push weight_reminders to cloud |
| `_sync_health_notes` | ⬜ TODO | Push health_notes to cloud |
| `_sync_care_expenses` | ⬜ TODO | Push care_expenses to cloud |
| `_sync_care_litters` | ⬜ TODO | Push care_litters to cloud |
| `_sync_weight_samples` | ⬜ TODO | Push weight_samples to cloud |
| `_sync_cycle_feed_programs` | ⬜ TODO | Push cycle_feed_programs to cloud |
| `_sync_cycle_feed_program_items` | ⬜ TODO | Push cycle_feed_program_items to cloud |
| `_sync_cycle_feed_stages` | ⬜ TODO | Push cycle_feed_stages to cloud |
| `_sync_cycle_splits` | ⬜ TODO | Push cycle_splits to cloud |

### 4.5 Full Cycle Children Summary

| Table | Local | Cloud | Sync | Priority |
|-------|-------|-------|------|----------|
| `cycles` | ✅ (gap) | ⬜ Reset | ✅ Handler exists | HIGH |
| `care_feeds` | ✅ | ⬜ Reset | ✅ Queue added | HIGH |
| `care_deaths` | ✅ (gap) | ⬜ Reset | ✅ Queue added | MEDIUM |
| `care_medications` | ✅ (gap) | ⬜ Reset | ✅ Queue added | MEDIUM |
| `care_sales` | ✅ | ⬜ Reset | ✅ Queue added | HIGH |
| `care_weights` | ✅ | ⬜ Reset | ✅ Queue added | HIGH |
| `weight_reminders` | ✅ | ⬜ Reset | ⬜ Need handler | MEDIUM |
| `weight_samples` | ❌ | ✅ | ⬜ TODO | LOW |
| `cycle_daily_snapshots` | ✅ | ⬜ Reset | ❌ Not synced | LOW |
| `vaccine_schedules` | ✅ | ⬜ Reset | ✅ Pull handler exists | MEDIUM |
| `health_notes` | ✅ | ⬜ Reset | ⬜ Need handler | MEDIUM |
| `care_expenses` | ❌ | ✅ | ⬜ TODO | LOW |
| `care_litters` | ❌ | ✅ | ⬜ TODO | LOW |
| `cycle_feed_programs` | ❌ | ✅ | ⬜ TODO | LOW |
| `cycle_feed_program_items` | ❌ | ✅ | ⬜ TODO | LOW |
| `cycle_feed_stages` | ❌ | ✅ | ⬜ TODO | LOW |
| `cycle_splits` | ❌ | ✅ | ⬜ TODO | LOW |

---

## [ ] 5. Device + Channels

**Priority**: HIGH

Verify sync handlers for:
- `devices` ✅
- `device_channels` ✅
- `device_states` ✅
- `device_commands` ✅
- `device_state_log` ✅

---

## [ ] 6. Warehouse + Inventory (Local Model)

**Priority**: HIGH

**Problem**: Cloud has `inventory_stock` per barn_id. Local has `inventory` per warehouse_id.

**Solution**: Cloud drops `inventory_stock`, creates `warehouses` + `inventory` + `inventory_transactions` matching Local.

**Tables to create in Cloud**:
- `warehouses`
- `inventory`
- `inventory_transactions`

**Sync handlers needed**:
- [ ] `warehouses` push/pull
- [ ] `inventory` push/pull
- [ ] `inventory_transactions` push ✅ (already added), pull ⬜ TODO

---

## [ ] 7. Reference Data Sync

**Priority**: MEDIUM

Cloud is master for: feed_brands, feed_types, medications, vaccine_programs, vaccine_program_items

| Table | Sync Direction | Status |
|-------|---------------|--------|
| `feed_brands` | Cloud→Local | ✅ Pull handler exists |
| `feed_types` | Cloud→Local | ✅ Pull handler exists |
| `medications` | Cloud→Local | ✅ Pull handler exists |
| `suppliers` | Bidirectional | Need verify |
| `vaccine_programs` | Cloud→Local | ✅ Pull handler exists |
| `vaccine_program_items` | Cloud→Local | ✅ Pull handler exists |
| `products` | Bidirectional? | Need verify |

---

## [ ] 8. Sync Infrastructure

**Priority**: HIGH

| Item | Status | Notes |
|------|--------|-------|
| `sync_queue` table | ✅ Exists | |
| `_sync_farms` handler | ⬜ TODO | New entity |
| `inventory_transactions` pull handler | ⬜ TODO | Currently only push |
| `weight_reminders` push handler | ⬜ TODO | |
| `health_notes` push handler | ⬜ TODO | |
| Sync loop working | Need verify | Every 60s push/pull |

---

## Migration Order

```
1. Farm entity (scripts/015)
2. Barn dimensions (scripts/013)
3. Barn CapEx (scripts/014)
4. Equipment (scripts/016)
5. Reset Cloud DB (drop non-matching tables, create new)
6. Verify all sync handlers
7. Run initial sync
```

---

## Quick Commands

### Local: Check all farm tables
```sql
\d barns
\d cycles
\d devices
\d warehouses
\d equipment
\d sensor_data
```

### Local: Check sync handlers
```bash
grep -n "_sync_" src/sync/sync_service.py | head -40
```

### Cloud: Drop and recreate (reset OK)
```sql
-- DROP old tables
DROP TABLE IF EXISTS env_readings;
DROP TABLE IF EXISTS env_weather;
DROP TABLE IF EXISTS inventory_stock;
DROP TABLE IF EXISTS inventory_consumable_assets;
-- Create matching Local schema
```

### Verify sensor_data types in Local
```sql
SELECT DISTINCT sensor_type FROM sensor_data;
```