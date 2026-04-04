# Data Completion Checklist

> **Tracking**: Tasks to align Local + Cloud schemas (Local is primary, Cloud reset OK)
> **Last Updated**: 2026-04-04 - Sync Infrastructure redesigned: 6 issues fixed, 38 missing handlers, retry/priority/lock/version system

---

## Status Summary

**Legend**: ✅ = done | 🔨 = in progress | ⬜ = pending

| Section | Design | Script | Run | Priority |
|---------|--------|--------|-----|----------|
| Farm entity | ✅ | 🔨 015 | ⬜ | HIGH |
| Barn dimensions | ✅ | 🔨 013 | ⬜ | HIGH |
| Barn CapEx | ✅ | 🔨 014 | ⬜ | HIGH |
| Equipment (new) | ✅ | 🔨 016 | ⬜ | MEDIUM |
| Cycle + fields | ✅ | 🔨 017 | ⬜ | HIGH |
| Care gaps (death/med) | ✅ | 🔨 022, 023 | ⬜ | MEDIUM |
| Weight samples | ✅ | 🔨 018 | ⬜ | LOW |
| Care expenses | ✅ | 🔨 019 | ⬜ | LOW |
| Care litters | ✅ | 🔨 020 | ⬜ | LOW |
| SensorData (7 tables) | ✅ | 🔨 021 | ⬜ | HIGH |
| Reference Data fixes | ✅ | 🔨 024-029 | ⬜ | MEDIUM |
| Sync Infrastructure (schema) | ✅ | 🔨 030, 031 | ⬜ | HIGH |
| Sync handlers (38 new) | ⬜ | ⬜ | ⬜ | HIGH |
| Sync code fixes (retry/lock/priority) | ⬜ | ⬜ | ⬜ | HIGH |
| Cloud reset SQL | ✅ Script ready | cloud_reset.sql | ⬜ TODO | HIGH |
| Sync loop verify | - | - | ⬜ | HIGH |

**Tổng: 29 migration scripts cần tạo (015-029) + 14 sync handlers + cloud reset**

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

## [ ] 3. SensorData Merge + New Tables

**Priority**: HIGH

**Problem**: Cloud has separate `env_readings` and `env_weather` tables. Local has single `sensor_data`.

**Solution**: Cloud drops both, creates single `sensor_data` matching Local.

### 3.1 Existing sensor_data (already in Local)

**sensor_type values** (from env_readings + env_weather):
- `temperature`, `humidity`, `nh3`, `co2`, `heat_index`
- `wind_speed`, `wind_direction`, `is_raining`, `rainfall`, `outdoor_temp`

### 3.2 New Tables to Create in Local

**Local migration script**: `scripts/021_add_sensor_tables.sql`

| Table | Purpose | SQL Status |
|-------|---------|------------|
| `sensor_types` | Danh mục loại sensor (temp, humidity, NH3...) | TODO |
| `sensors` | Physical sensors deployed with calibration | TODO |
| `sensor_alerts` | Cảnh báo ngưỡng | TODO |
| `sensor_daily_summary` | Tổng hợp avg/min/max theo ngày | TODO |
| `sensor_threshold_configs` | Cấu hình ngưỡng cho từng sensor | TODO |
| `sensor_calibrations` | Lịch sử hiệu chuẩn | TODO |
| `sensor_maintenance_log` | Bảo trì (vệ sinh, thay thế) | TODO |

**sensor_types**:
```sql
CREATE TABLE sensor_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    unit VARCHAR(20),
    data_type VARCHAR(20),  -- 'numeric' | 'boolean' | 'categorical'
    typical_range JSONB,  -- {"min": -40, "max": 80}
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**sensors** (physical sensors deployed):
```sql
CREATE TABLE sensors (
    id SERIAL PRIMARY KEY,
    sensor_type_id INT REFERENCES sensor_types(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    device_id VARCHAR(50) REFERENCES devices(id),  -- optional: link to IoT device
    name VARCHAR(200) NOT NULL,
    location VARCHAR(100),  -- 'inside', 'outside', 'north_corner'...
    calibration_date DATE,
    reading_interval_seconds INT DEFAULT 60,
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**sensor_alerts**:
```sql
CREATE TABLE sensor_alerts (
    id SERIAL PRIMARY KEY,
    sensor_id INT REFERENCES sensors(id),
    alert_type VARCHAR(50) NOT NULL,  -- 'high' | 'low' | 'offline' | 'spike'
    threshold_value DECIMAL(10,2),
    actual_value DECIMAL(10,2),
    duration_seconds INT,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**sensor_daily_summary**:
```sql
CREATE TABLE sensor_daily_summary (
    id SERIAL PRIMARY KEY,
    sensor_id INT REFERENCES sensors(id),
    date DATE NOT NULL,
    avg_value DECIMAL(10,2),
    min_value DECIMAL(10,2),
    max_value DECIMAL(10,2),
    percentile_10 DECIMAL(10,2),
    percentile_90 DECIMAL(10,2),
    reading_count INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**sensor_threshold_configs**:
```sql
CREATE TABLE sensor_threshold_configs (
    id SERIAL PRIMARY KEY,
    sensor_id INT REFERENCES sensors(id),
    alert_type VARCHAR(20) NOT NULL,  -- 'high' | 'low'
    threshold_value DECIMAL(10,2),
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**sensor_calibrations**:
```sql
CREATE TABLE sensor_calibrations (
    id SERIAL PRIMARY KEY,
    sensor_id INT REFERENCES sensors(id),
    calibration_date DATE NOT NULL,
    reference_value DECIMAL(10,2),
    measured_value DECIMAL(10,2),
    offset DECIMAL(10,2),
    technician VARCHAR(100),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**sensor_maintenance_log**:
```sql
CREATE TABLE sensor_maintenance_log (
    id SERIAL PRIMARY KEY,
    sensor_id INT REFERENCES sensors(id),
    maintenance_type VARCHAR(50) NOT NULL,  -- 'cleaning' | 'repair' | 'replacement' | ' relocation'
    performed_date DATE NOT NULL,
    description TEXT,
    performed_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 Cloud Reset

Cloud drops `env_readings`, `env_weather`, creates matching Local tables.

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

## [ ] 7. Reference Data Sync (EXPANDED - FIX 6 issues)

**Priority**: MEDIUM

### 7.1 Design Issues Fixed

| Issue | Fix |
|-------|-----|
| Reference ↔ Inventory tách rời | `products` là central catalog, `inventory` FK → `products` |
| feed_types không link inventory | `feed_types.product_id` → `products(id)` → `inventory` |
| vaccine không link medication | `vaccine_program_items.product_id` → `medications(id)` |
| suppliers quá simple | Thêm: email, tax_id, bank info, categories, lead_time |
| device_types không mô tả protocol | Thêm `mqtt_protocol` JSONB field |
| No cascade protection | Thêm `ON DELETE CASCADE/SET NULL` constraints |

### 7.2 Schema Changes

**products** (EXPANDED - central catalog):
```sql
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    product_type VARCHAR(20) NOT NULL,  -- 'feed' | 'medication' | 'equipment' | 'consumable'
    unit VARCHAR(20) DEFAULT 'kg',
    supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
    price_per_unit DECIMAL(12,2),
    min_stock_alert DECIMAL(12,2) DEFAULT 0,
    reorder_point DECIMAL(12,2) DEFAULT 0,
    barcode VARCHAR(100),
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**suppliers** (EXPANDED):
```sql
CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    contact_name VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    city VARCHAR(100),
    tax_id VARCHAR(50),              -- Mã số thuế
    bank_name VARCHAR(100),
    bank_account VARCHAR(50),
    bank_account_holder VARCHAR(200),
    categories TEXT[],               -- ARRAY['feed', 'medication', 'equipment']
    lead_time_days INT DEFAULT 7,
    payment_terms VARCHAR(50),
    note TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**feed_brands** (ADD product_id FK):
```sql
ALTER TABLE feed_brands ADD COLUMN product_id INT REFERENCES products(id) ON DELETE CASCADE;
```

**feed_types** (ADD product_id FK):
```sql
ALTER TABLE feed_types ADD COLUMN product_id INT REFERENCES products(id) ON DELETE CASCADE;
```

**medications** (ADD product_id FK):
```sql
ALTER TABLE medications ADD COLUMN product_id INT REFERENCES products(id) ON DELETE CASCADE;
```

**vaccine_program_items** (ADD product_id FK):
```sql
ALTER TABLE vaccine_program_items ADD COLUMN product_id INT REFERENCES medications(id) ON DELETE SET NULL;
```

**device_types** (ADD mqtt_protocol JSONB):
```sql
ALTER TABLE device_types ADD COLUMN mqtt_protocol JSONB;
ALTER TABLE device_types ADD COLUMN device_class VARCHAR(20);
ALTER TABLE device_types ADD COLUMN firmware_version VARCHAR(50);
ALTER TABLE device_types ADD COLUMN firmware_url VARCHAR(500);
```

**equipment_types** (NEW):
```sql
CREATE TABLE equipment_types (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id) ON DELETE SET NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    power_watts INT,
    voltage_v INT,
    current_amp DECIMAL(5,2),
    mqtt_protocol JSONB,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.3 Sync Direction

| Table | Sync Direction | Status |
|-------|---------------|--------|
| `products` | Cloud→Local | ⬜ TODO: verify handler exists |
| `suppliers` | Cloud→Local | ⬜ TODO: verify handler (was bidirectional) |
| `feed_brands` | Cloud→Local | ✅ Pull handler exists |
| `feed_types` | Cloud→Local | ✅ Pull handler exists |
| `medications` | Cloud→Local | ✅ Pull handler exists |
| `vaccine_programs` | Cloud→Local | ✅ Pull handler exists |
| `vaccine_program_items` | Cloud→Local | ✅ Pull handler exists |
| `equipment_types` | Cloud→Local | ⬜ TODO: verify handler |
| `device_types` | Seed data | Seed data |

### 7.4 Migration Scripts

- `scripts/024_expand_products.sql` — add supplier_id, min_stock_alert, reorder_point, barcode
- `scripts/025_expand_suppliers.sql` — add all new fields
- `scripts/026_add_feed_med_product_fk.sql` — product_id FK for feed_brands, feed_types, medications
- `scripts/027_add_vaccine_product_fk.sql` — product_id FK for vaccine_program_items
- `scripts/028_expand_device_types.sql` — mqtt_protocol JSONB, device_class, firmware fields
- `scripts/029_create_equipment_types.sql` — equipment_types table

---

## [ ] 8. Sync Infrastructure (FIX ALL 6 ISSUES)

**Priority**: HIGH

### 8.1 Schema Changes

**Migration script**: `scripts/030_expand_sync_queue.sql`

```sql
-- Add columns to existing sync_queue
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS priority INT DEFAULT 5;
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 5;
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS local_version INT DEFAULT 1;
ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS synced_version INT DEFAULT 0;

-- Create retry index
CREATE INDEX IF NOT EXISTS idx_sync_retry ON sync_queue (next_retry_at, retry_count)
    WHERE NOT synced AND retry_count > 0;

-- Create sync_lock table
CREATE TABLE IF NOT EXISTS sync_lock (
    lock_name VARCHAR(50) PRIMARY KEY,
    locked_by VARCHAR(100),
    locked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

-- Add _version to all synced tables
ALTER TABLE farms ADD COLUMN IF NOT EXISTS _version INT DEFAULT 1;
ALTER TABLE barns ADD COLUMN IF NOT EXISTS _version INT DEFAULT 1;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS _version INT DEFAULT 1;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS _version INT DEFAULT 1;
-- ... add to all major tables
```

### 8.2 Missing Pull Handlers (18 new)

| Handler | Table | Priority |
|---------|-------|----------|
| `_sync_farms` | farms | HIGH |
| `_sync_warehouses` | warehouses | HIGH |
| `_sync_warehouse_zones` | warehouse_zones | MEDIUM |
| `_sync_products` | products | HIGH |
| `_sync_inventory` | inventory | HIGH |
| `_sync_inventory_transactions` | inventory_transactions | HIGH |
| `_sync_inventory_alerts` | inventory_alerts | MEDIUM |
| `_sync_inventory_snapshots` | inventory_snapshots | LOW |
| `_sync_stock_valuation` | stock_valuation | LOW |
| `_sync_purchase_orders` | purchase_orders | MEDIUM |
| `_sync_purchase_order_items` | purchase_order_items | MEDIUM |
| `_sync_equipment` | equipment | HIGH |
| `_sync_equipment_parts` | equipment_parts | MEDIUM |
| `_sync_equipment_readings` | equipment_readings | MEDIUM |
| `_sync_equipment_performance` | equipment_performance | MEDIUM |
| `_sync_sensors` | sensors | HIGH |
| `_sync_sensor_alerts` | sensor_alerts | MEDIUM |
| `_sync_sensor_daily_summary` | sensor_daily_summary | LOW |
| `_sync_sensor_threshold_configs` | sensor_threshold_configs | LOW |
| `_sync_sensor_calibrations` | sensor_calibrations | LOW |
| `_sync_sensor_maintenance_log` | sensor_maintenance_log | LOW |
| `_sync_weight_reminders` | weight_reminders | MEDIUM |
| `_sync_care_expenses` | care_expenses | MEDIUM |
| `_sync_care_litters` | care_litters | MEDIUM |
| `_sync_feed_trough_checks` | feed_trough_checks | MEDIUM |
| `_sync_cycle_feed_programs` | cycle_feed_programs | MEDIUM |
| `_sync_cycle_feed_program_items` | cycle_feed_program_items | MEDIUM |
| `_sync_cycle_feed_stages` | cycle_feed_stages | MEDIUM |
| `_sync_device_channels` | device_channels | HIGH |
| `_sync_device_states` | device_states | HIGH |
| `_sync_device_state_log` | device_state_log | MEDIUM |
| `_sync_device_commands` | device_commands | HIGH |
| `_sync_device_telemetry` | device_telemetry | LOW |
| `_sync_device_alerts` | device_alerts | MEDIUM |
| `_sync_device_config_versions` | device_config_versions | MEDIUM |
| `_sync_equipment_assignment_log` | equipment_assignment_log | MEDIUM |
| `_sync_equipment_command_log` | equipment_command_log | MEDIUM |
| `_sync_curtain_configs` | curtain_configs | MEDIUM |
| `_sync_sensor_types` | sensor_types | MEDIUM |

**Script files to create**: `src/sync/handlers/`

### 8.3 FieldMapper (Centralize mapping)

**New file**: `src/sync/field_mapper.py`

```python
class FieldMapper:
    """Centralized Local ↔ Cloud field name mapping."""

    MAPS = {
        "care_feeds": {"session": "meal", "bags": "bags", ...},
        "care_deaths": {"quantity": "count", "reason": "cause", ...},
        "care_sales": {"quantity": "count", "weight_kg": "total_weight", ...},
        "cycles": {"initial_quantity": "initial_count", ...},
        # ... all mappings
    }

    @classmethod
    def to_cloud(cls, table, payload): ...
    @classmethod
    def to_local(cls, table, payload): ...
```

### 8.4 Retry Mechanism

**File**: Modify `sync_service.py` - `get_retry_queue()`, `_schedule_retry()`

```python
# Replace get_pending_queue with get_retry_queue
# Add exponential backoff: 1min, 2min, 4min, 8min, 16min
# Max retries: 5
```

### 8.5 ConflictResolver

**New file**: `src/sync/conflict_resolver.py`

```python
class ConflictResolver:
    """Version-based conflict resolution."""
    @classmethod
    def resolve(cls, table, local_payload, cloud_payload): ...
```

### 8.6 SyncLock

**Modify**: `sync_service.py` - `_acquire_lock()`, `_release_lock()`

```python
# Add distributed lock using sync_lock table
# TTL: 30 seconds
```

### 8.7 Priority Queue

**Modify**: `queue_change()` - add priority based on table

```python
PRIORITY_MAP = {
    "device_commands": 10,
    "care_feeds": 10, "care_deaths": 10, "care_medications": 10, "care_sales": 10,
    "cycles": 5, "farms": 5, "barns": 5, "warehouses": 5,
    "sensor_data": 1, "sensor_alerts": 1,
}
```

### 8.8 Sensor Sync Integration

**Modify**: `_sync_loop()` and `push_to_cloud()`

- Remove separate `sensor_sync.push_sensor_summary()` call every 5 cycles
- Integrate sensor batch into push_to_cloud() as priority=1 item
- `sensor_sync.py` becomes: just prepare batch, let push_to_cloud() handle it

### 8.9 Migration Scripts

- `scripts/030_expand_sync_queue.sql` — add priority, retry, version, sync_lock
- `scripts/031_add_version_columns.sql` — add _version to all synced tables

### 8.10 Sync Infrastructure Status

| Item | Status | Priority |
|------|--------|----------|
| Expand sync_queue schema | ⬜ TODO | HIGH |
| Create sync_lock table | ⬜ TODO | HIGH |
| Add _version to all tables | ⬜ TODO | HIGH |
| FieldMapper (centralized) | ⬜ TODO | MEDIUM |
| Retry mechanism | ⬜ TODO | HIGH |
| ConflictResolver | ⬜ TODO | MEDIUM |
| SyncLock | ⬜ TODO | HIGH |
| Priority queue in queue_change | ⬜ TODO | MEDIUM |
| Integrate sensor_sync into push loop | ⬜ TODO | MEDIUM |
| Add 38 missing pull handlers | ⬜ TODO | HIGH |
| Test sync loop (60s) | ⬜ TODO | HIGH |

---

## Migration Order

```
## LOCAL SCHEMA (run in order)
1.  scripts/015_add_farms_table.sql       -- farms + barns.farm_id
2.  scripts/013_add_barn_dimensions.sql  -- number, length_m, width_m, height_m
3.  scripts/014_add_barn_capex.sql       -- construction_cost, year, lifespan, type
4.  scripts/016_add_equipment.sql        -- equipment table + children (parts, readings, performance)
5.  scripts/017_add_cycle_gender_finance.sql -- cycle: gender/finance/stage fields + renames
6.  scripts/018_add_weight_samples.sql   -- weight_samples table
7.  scripts/019_add_care_expenses.sql    -- care_expenses table
8.  scripts/020_add_care_litters.sql     -- care_litters table
9.  scripts/021_add_sensor_tables.sql    -- sensor_types, sensors, sensor_alerts, etc.
10. scripts/022_add_care_death_med_gaps.sql -- care_deaths: death_category, image_path
11. scripts/023_add_care_med_gaps.sql    -- care_medications: dosage, unit

## REFERENCE DATA FIXES (run after existing schema)
12. scripts/024_expand_products.sql     -- add supplier_id, min_stock_alert, barcode, etc.
13. scripts/025_expand_suppliers.sql    -- add all EXPANDED fields
14. scripts/026_add_feed_med_product_fk.sql -- product_id FK for feed_brands, feed_types, medications
15. scripts/027_add_vaccine_product_fk.sql -- product_id FK for vaccine_program_items
16. scripts/028_expand_device_types.sql  -- mqtt_protocol JSONB, device_class, firmware
17. scripts/029_create_equipment_types.sql -- equipment_types table

## CLOUD RESET (drop + recreate matching Local)
18. Drop: env_readings, env_weather, inventory_stock, inventory_consumable_assets
19. Create: farms, warehouses, inventory, inventory_transactions, equipment
20. Create: sensor_data (single table), sensor_types, sensors, sensor_alerts, etc.
21. Create: weight_samples, care_expenses, care_litters, feed_trough_checks
22. Create: cycle_feed_programs, cycle_feed_program_items, cycle_feed_stages, cycle_splits
23. Add barn_id FK to Cloud care tables

## SYNC HANDLERS
24. Add: _sync_farms, _sync_warehouses, _sync_products
25. Add: _sync_weight_reminders, _sync_health_notes
26. Add: _sync_care_expenses, _sync_care_litters, _sync_weight_samples
27. Add: _sync_cycle_feed_programs, _sync_cycle_feed_program_items
28. Add: _sync_cycle_feed_stages, _sync_cycle_splits
29. Add: _sync_sensor_types, _sync_sensors, _sync_sensor_alerts
30. Add: _sync_sensor_daily_summary, _sync_sensor_threshold_configs
31. Add: _sync_sensor_calibrations, _sync_sensor_maintenance_log
32. Add: inventory_transactions PULL handler

## VERIFY
33. Verify sync loop (every 60s)
34. Run initial sync
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