# Data Dependency Map - Local Server

> **Created**: 2026-04-03
> **Updated**: 2026-04-03 - Clean restructure: Local is primary, Cloud aligns
> **Purpose**: Entity relationships and data flow for hybrid sync (RESET CLOUD OK)

---

## Design Principles

1. **Local is primary** — Local PostgreSQL drives schema design
2. **Cloud aligns** — Cloud MySQL must reshape to match Local (reset OK, no production data)
3. **Single source of truth** — Each entity has one home (no duplication)
4. **Hierarchical** — Farm → Barn → [Cycle, Device, Warehouse, Equipment, SensorData]

---

## Entity Hierarchy

```
Farm (1) ─────< Barn (N)
              └── farm_id FK

Barn (1) ─────< Cycle (N)
Barn (1) ─────< Device (N)
Barn (1) ─────< Warehouse (N)  -- nullable barn_id (central warehouse)
Barn (1) ─────< Equipment (N)
Barn (1) ─────< SensorData (N)

Cycle (1) ────< care_feeds ────────────────→ inventory_transactions (side-effect)
Cycle (1) ────< care_deaths
Cycle (1) ────< care_medications ──────────→ inventory_transactions (side-effect)
Cycle (1) ────< care_sales
Cycle (1) ────< care_weights
Cycle (1) ────< care_litters ──────────────→ inventory_transactions (side-effect) [NEW]
Cycle (1) ────< care_expenses              [NEW]
Cycle (1) ────< feed_trough_checks          [NEW] - kiểm tra máng ăn
Cycle (1) ────< weight_reminders
Cycle (1) ────< weight_samples             [NEW]
Cycle (1) ────< cycle_daily_snapshots
Cycle (1) ────< vaccine_schedules
Cycle (1) ────< health_notes
Cycle (1) ────< cycle_feed_programs       [NEW]
Cycle (1) ────< cycle_feed_stages         [NEW]
Cycle (1) ────< cycle_splits              [NEW]

Device (1) ───< device_channels
Device (1) ───< device_states
Device (1) ───< device_state_log
Device (1) ───< device_commands ─────────── lên bạt/xuống bạt, bật quạt...

Warehouse (1) ─< inventory
Warehouse (1) ─< inventory_transactions ←── care_feeds, care_medications, care_litters

SensorData: indexed by device_id + time (TimescaleDB hypertable)
```

**Cross-Domain Pattern (Fact Table):**
Care tables (Cycle domain) tạo inventory transactions (Warehouse domain) như side-effect.
Dùng `reference_id` FK để track: `care_feeds.id` → `inventory_transactions.ref_care_feed_id`

---

## Complete Dependency Tree

```
Farm
└── Barn
    ├── Cycle
    │   ├── care_feeds ────────────→ inventory_transactions
    │   ├── care_deaths
    │   ├── care_medications ───────→ inventory_transactions
    │   ├── care_sales
    │   ├── care_weights
    │   │   └── weight_samples (1 con trong 1 phiên cân)
    │   ├── care_litters ───────────→ inventory_transactions [NEW]
    │   ├── care_expenses [NEW]
    │   ├── feed_trough_checks [NEW] - kiểm tra máng ăn sau bữa ăn
    │   ├── weight_reminders
    │   ├── cycle_daily_snapshots
    │   ├── vaccine_schedules
    │   ├── health_notes
    │   ├── cycle_feed_programs [NEW] - gán feed_brand cho cycle
    │   │   └── cycle_feed_program_items [NEW]
    │   ├── cycle_feed_stages [NEW] - stage + primary/mix feed
    │   └── cycle_splits [NEW] - lịch sử tách cycle
    │
    ├── Device
    │   ├── device_channels ──────── curtain_up, curtain_down, fan, light, water...
    │   ├── device_states
    │   ├── device_state_log
    │   └── device_commands ──────── điều khiển lên bạt/xuống bạt, bật quạt...
    │
    ├── Warehouse
    │   ├── inventory
    │   └── inventory_transactions ←── care_feeds, care_medications, care_litters
    │
    ├── Equipment [NEW]
    └── SensorData

Reference Data (independent, Cloud→Local sync):
├── feed_brands
├── feed_types
├── medications
├── suppliers
├── vaccine_programs
└── vaccine_program_items

Sync Infrastructure:
├── sync_queue
├── sync_log
└── sync_config
```

---

## Entity Definitions

### 1. Farm (top-level)

```sql
CREATE TABLE farms (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    address TEXT,
    contact_name VARCHAR(100),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(100),
    notes TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 2. Barn

```sql
CREATE TABLE barns (
    id VARCHAR(50) PRIMARY KEY,
    farm_id VARCHAR(50) DEFAULT 'farm-01',  -- multi-farm ready
    name VARCHAR(200) NOT NULL,
    number INT,                     -- 1-9, from cloud
    capacity INT,                   -- max birds
    length_m DECIMAL(5,2),         -- meters
    width_m DECIMAL(5,2),
    height_m DECIMAL(5,2),
    construction_cost DECIMAL(12,2),
    construction_year INT,
    expected_lifespan_years INT DEFAULT 15,
    construction_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    note TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Computed at query time:
-- volume_m3 = length_m × width_m × height_m
-- floor_area_sqm = length_m × width_m
-- annual_depreciation = construction_cost / expected_lifespan_years
```

---

### 3. Cycle

```sql
CREATE TABLE cycles (
    id SERIAL PRIMARY KEY,
    barn_id VARCHAR(50) REFERENCES barns(id),
    name VARCHAR(200) NOT NULL,
    breed VARCHAR(100),

    -- Gender split (from cloud)
    male_quantity INT DEFAULT 0,
    female_quantity INT DEFAULT 0,

    -- Counts
    initial_count INT NOT NULL,
    current_count INT,

    -- Financial
    purchase_price DECIMAL(12,2),  -- cost of chicks

    -- Stage
    stage VARCHAR(20) DEFAULT 'chick',  -- 'chick' | 'grower' | 'adult'

    -- Source
    flock_source VARCHAR(20),  -- 'local' | 'imported' | 'hatchery'

    -- Dates
    start_date DATE NOT NULL,
    expected_end_date DATE,
    actual_end_date DATE,

    -- Cycle splitting (from cloud)
    parent_cycle_id INT REFERENCES cycles(id),
    split_date DATE,

    -- Status
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Only ONE active cycle per barn at a time
```

**Additional tables under Cycle**:

```sql
-- Weight samples (individual bird weights)
CREATE TABLE weight_samples (
    id SERIAL PRIMARY KEY,
    session_id INT REFERENCES care_weights(id),
    weight_g INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Care expenses (feed, medication, labor, utilities)
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

-- Litter management
CREATE TABLE care_litters (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    litter_date DATE NOT NULL,
    litter_type VARCHAR(50),  -- 'new' | 'top_up' | 'change'
    quantity_kg DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 4. Device (IoT Controller)

**Định nghĩa:** Device là **controller** - thiết bị IoT điều khiển từ xa qua MQTT.
**Device điều khiển Equipment** - Device ra lệnh bật/tắt/quay cho thiết bị vật lý.

```sql
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    device_code VARCHAR(100) UNIQUE NOT NULL,
    device_type_id INT REFERENCES device_types(id),
    barn_id VARCHAR(50) REFERENCES barns(id),  -- nullable (unassigned)
    mqtt_topic VARCHAR(200) NOT NULL,
    name VARCHAR(200),
    is_online BOOLEAN DEFAULT FALSE,
    last_heartbeat_at TIMESTAMPTZ,
    wifi_rssi INT,
    ip_address VARCHAR(45),
    firmware_version VARCHAR(50),
    alert_offline BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Device channels: các relay/output channels của Device (ESP32)
-- Mỗi channel có thể điều khiển 1 Equipment
CREATE TABLE device_channels (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    channel_number INT NOT NULL,
    function VARCHAR(50),
    name VARCHAR(100),
    gpio_pin INT,
    UNIQUE(device_id, channel_number)
);

CREATE TABLE device_states (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    channel_number INT NOT NULL,
    state VARCHAR(20) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_id, channel_number)
);

CREATE TABLE device_state_log (
    time TIMESTAMPTZ NOT NULL,
    device_id INT NOT NULL,
    channel_number INT NOT NULL,
    state VARCHAR(20) NOT NULL,
    source VARCHAR(50)
);

CREATE TABLE device_commands (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id),
    command_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    source VARCHAR(50) DEFAULT 'manual',
    status VARCHAR(20) DEFAULT 'sent',
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);
```

---

### 5. Warehouse

```sql
CREATE TABLE warehouses (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    warehouse_type VARCHAR(20) NOT NULL,  -- 'feed' | 'medication' | 'general'
    barn_id VARCHAR(50) REFERENCES barns(id),  -- nullable (central warehouse)
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    warehouse_id INT REFERENCES warehouses(id),
    product_id INT REFERENCES products(id),
    quantity DOUBLE PRECISION DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(warehouse_id, product_id)
);

CREATE TABLE inventory_transactions (
    id SERIAL PRIMARY KEY,
    warehouse_id INT REFERENCES warehouses(id),
    product_id INT REFERENCES products(id),
    transaction_type VARCHAR(20) NOT NULL,  -- 'import' | 'export' | 'transfer'
    -- Cross-domain references (fact table pattern):
    -- reference_type = 'care_feed'     → reference_id = care_feeds.id
    -- reference_type = 'care_med'      → reference_id = care_medications.id
    -- reference_type = 'care_litter'   → reference_id = care_litters.id
    -- reference_type = 'transfer'      → reference_id = self (for transfer pairs)
    reference_type VARCHAR(50),
    reference_id INT,
    from_warehouse_id INT REFERENCES warehouses(id),
    supplier VARCHAR(200),
    unit_price DECIMAL(12,2),
    batch_number VARCHAR(100),
    expiry_date DATE,
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Cross-Domain Pattern:**
inventory_transactions là "fact table" - nó được tạo như **side-effect** từ các care operations.
Dùng `reference_type` + `reference_id` để track nguồn gốc.

---

### 6. Equipment (Fixed Assets)

**Định nghĩa:** Equipment là **vật thể vật lý** - thiết bị cố định trong barn (quạt, sưởi, đèn...).
**Equipment được điều khiển bởi Device** - thông qua device_channel.

**Quy tắc:**
- Device → điều khiển Equipment (1 Device có nhiều channels điều khiển nhiều Equipment)
- Equipment → có thể có Device điều khiển nó (nullable, vì Equipment có thể là "stock" chưa lắp)

```sql
CREATE TABLE equipment (
    id SERIAL PRIMARY KEY,
    barn_id VARCHAR(50) REFERENCES barns(id),
    name VARCHAR(200) NOT NULL,
    equipment_type VARCHAR(50),     -- 'fan' | 'heater' | 'light' | 'sensor' | etc.
    model VARCHAR(100),
    serial_no VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',  -- 'stock' | 'installed' | 'broken' | 'disposed'
    install_date DATE,
    warranty_until DATE,
    purchase_price DECIMAL(12,2),
    -- Device linkage: Device điều khiển Equipment này
    device_id INT REFERENCES devices(id),  -- nullable (chưa lắp thì không có)
    device_channel INT,                  -- channel nào trên Device điều khiển
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 7. SensorData (Time-Series)

```sql
CREATE TABLE sensor_data (
    time TIMESTAMPTZ NOT NULL,
    device_id INT NOT NULL,
    barn_id VARCHAR(50),           -- denormalized for fast query
    cycle_id INT,
    sensor_type VARCHAR(50) NOT NULL,  -- 'temperature' | 'humidity' | 'nh3' | 'co2' | 'wind_speed' | 'wind_direction' | 'rainfall' | 'outdoor_temp' | etc.
    value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- TimescaleDB hypertable on 'time'
-- Index: (device_id, time DESC), (barn_id, time DESC), (sensor_type, time DESC)
```

---

### 8. Cycle Children (Care Operations)

```sql
-- Feed logs
-- NOTE: When syncing to Cloud, 'meal' maps to Cloud's 'session' field
CREATE TABLE care_feeds (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    feed_date DATE NOT NULL,
    meal VARCHAR(20),              -- 'morning' | 'afternoon' | 'evening' | 'all_day'
    product_id INT REFERENCES products(id),
    quantity DOUBLE PRECISION NOT NULL,  -- kg
    bags DOUBLE PRECISION,
    kg_actual DOUBLE PRECISION,
    remaining_pct DOUBLE PRECISION,  -- ước lượng lúc cho ăn (feed_trough_checks ghi sau)
    remaining DOUBLE PRECISION,
    warehouse_id INT REFERENCES warehouses(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mortality
CREATE TABLE care_deaths (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    death_date DATE NOT NULL,
    count INT NOT NULL,
    cause VARCHAR(200),            -- sync to cloud: cause→reason
    death_category VARCHAR(20),    -- 'disease' | 'accident' | 'weak' | 'unknown' (from cloud)
    image_path VARCHAR(500),       -- path to death image (from cloud)
    symptoms TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Medication
CREATE TABLE care_medications (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    med_date DATE NOT NULL,
    med_type VARCHAR(20) NOT NULL,  -- 'vaccine' | 'medication' | 'supplement'
    product_id INT REFERENCES products(id),
    quantity DOUBLE PRECISION,
    dosage DOUBLE PRECISION,
    unit VARCHAR(20),
    method VARCHAR(50),
    warehouse_id INT REFERENCES warehouses(id),
    purpose TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sales
CREATE TABLE care_sales (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    sale_date DATE NOT NULL,
    count INT NOT NULL,            -- sync to cloud: count→quantity
    total_weight DOUBLE PRECISION, -- sync: total_weight→weight_kg
    avg_weight DOUBLE PRECISION,
    unit_price DOUBLE PRECISION,   -- sync: unit_price→price_per_kg
    total_amount DOUBLE PRECISION,
    gender VARCHAR(20),           -- 'male' | 'female' | 'mixed'
    buyer VARCHAR(200),
    sale_type VARCHAR(20) DEFAULT 'sale',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weight measurements
CREATE TABLE care_weights (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    weigh_date DATE NOT NULL,
    sample_count INT NOT NULL,
    total_weight DOUBLE PRECISION NOT NULL,
    avg_weight DOUBLE PRECISION GENERATED ALWAYS AS (total_weight / NULLIF(sample_count, 0)) STORED,
    min_weight DOUBLE PRECISION,
    max_weight DOUBLE PRECISION,
    uniformity DOUBLE PRECISION,
    day_age INT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feed trough checks (kiểm tra máng ăn sau bữa ăn) [NEW]
-- Ghi nhận thủ công, KHÔNG phải từ sensor
-- ref_feed_id FK về care_feeds để biết bữa ăn nào
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

-- Litter management (lên bạt/xuống bạt) [NEW]
-- product_id = vật liệu lót (rơm, mùn cưa, trấu)
-- Side-effect: trừ inventory_transactions (use_litter)
CREATE TABLE care_litters (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    litter_date DATE NOT NULL,
    litter_type VARCHAR(20) NOT NULL,  -- 'new' | 'top_up' | 'change'
    product_id INT REFERENCES products(id),  -- vật liệu lót
    quantity_kg DECIMAL(10,2),         -- kg vật liệu tiêu hao
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Care expenses (chi phí hàng ngày) [NEW]
-- expense_type: 'feed' | 'medication' | 'labor' | 'utility' | 'litter' | 'other'
CREATE TABLE care_expenses (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    expense_date DATE NOT NULL,
    expense_type VARCHAR(50) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    product_id INT REFERENCES products(id),  -- có thể null cho labor/utility
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weight samples (từng con một trong 1 phiên cân) [NEW]
CREATE TABLE weight_samples (
    id SERIAL PRIMARY KEY,
    session_id INT REFERENCES care_weights(id),  -- FK về phiên cân
    weight_g INT NOT NULL,  -- gram
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weight reminders
CREATE TABLE weight_reminders (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    remind_every_days INT DEFAULT 7,
    next_remind_date DATE,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily snapshots
CREATE TABLE cycle_daily_snapshots (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    snapshot_date DATE NOT NULL,
    day_age INT NOT NULL,
    alive_count INT,
    total_deaths INT,
    daily_deaths INT,
    mortality_rate DOUBLE PRECISION,
    daily_feed_kg DOUBLE PRECISION,
    cumulative_feed_kg DOUBLE PRECISION,
    avg_weight DOUBLE PRECISION,
    fcr DOUBLE PRECISION,
    feed_per_bird DOUBLE PRECISION,
    avg_temperature DOUBLE PRECISION,
    avg_humidity DOUBLE PRECISION,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cycle_id, snapshot_date)
);

-- Vaccine schedules
CREATE TABLE vaccine_schedules (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    program_item_id INT REFERENCES vaccine_program_items(id),
    vaccine_name VARCHAR(200) NOT NULL,
    day_age_target INT,
    scheduled_date DATE,
    method VARCHAR(50),
    done BOOLEAN DEFAULT FALSE,
    done_at TIMESTAMPTZ,
    skipped BOOLEAN DEFAULT FALSE,
    skip_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Health notes
CREATE TABLE health_notes (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    day_age INT,
    recorded_at TIMESTAMPTZ,
    symptoms TEXT,
    severity VARCHAR(20),
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    image_path VARCHAR(500),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cycle feed programs (gán feed_brand cho cycle) [NEW]
CREATE TABLE cycle_feed_programs (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    feed_brand_id INT REFERENCES feed_brands(id),
    start_date DATE NOT NULL,
    end_date DATE,  -- NULL = đang dùng
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cycle feed program items (items trong chương trình) [NEW]
CREATE TABLE cycle_feed_program_items (
    id SERIAL PRIMARY KEY,
    cycle_feed_program_id INT REFERENCES cycle_feed_programs(id),
    product_id INT REFERENCES products(id),  -- inventory_item_id trong cloud
    stage VARCHAR(20) NOT NULL,  -- 'chick' | 'grower' | 'adult'
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cycle feed stages (stage feed chính + mix) [NEW]
CREATE TABLE cycle_feed_stages (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    stage VARCHAR(20) NOT NULL,  -- 'chick' | 'grower' | 'adult'
    primary_feed_type_id INT REFERENCES feed_types(id),  -- cám chính
    mix_feed_type_id INT REFERENCES feed_types(id),    -- cám mix (NULL nếu không mix)
    mix_ratio INT,  -- % của feed mới (10, 25, 50...)
    effective_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cycle splits (lịch sử tách cycle) [NEW]
-- Khi tách 1 cycle thành 2 (tách đàn, tách theo giới tính)
CREATE TABLE cycle_splits (
    id SERIAL PRIMARY KEY,
    from_cycle_id INT REFERENCES cycles(id),  -- cycle gốc
    to_cycle_id INT REFERENCES cycles(id),    -- cycle mới được tách vào
    quantity INT NOT NULL,  -- số con tách
    split_date DATE NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Reference Data (Independent)

```sql
CREATE TABLE feed_brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    kg_per_bag DECIMAL(5,2),
    note TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE feed_types (
    id SERIAL PRIMARY KEY,
    feed_brand_id INT REFERENCES feed_brands(id),
    code VARCHAR(50),
    name VARCHAR(200),
    price_per_bag DECIMAL(10,2),
    suggested_stage VARCHAR(50),  -- 'starter' | 'grower' | 'finisher'
    note TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE medications (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    unit VARCHAR(20),
    category VARCHAR(50),
    manufacturer VARCHAR(200),
    price_per_unit DECIMAL(10,2),
    recommended_dose TEXT,
    note TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    note TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    product_type VARCHAR(20) NOT NULL,  -- 'feed' | 'medication' | 'equipment' | 'consumable'
    unit VARCHAR(20) DEFAULT 'kg',
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vaccine_programs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    note TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vaccine_program_items (
    id SERIAL PRIMARY KEY,
    program_id INT REFERENCES vaccine_programs(id),
    vaccine_name VARCHAR(200) NOT NULL,
    day_age INT NOT NULL,
    method VARCHAR(50),
    remind_days INT DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE device_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    channel_count INT DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE curtain_configs (
    id SERIAL PRIMARY KEY,
    curtain_code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    barn_id VARCHAR(50) REFERENCES barns(id),
    device_id INT REFERENCES devices(id),
    up_channel INT NOT NULL,
    down_channel INT NOT NULL,
    full_up_seconds FLOAT DEFAULT 60,
    full_down_seconds FLOAT DEFAULT 60,
    current_position INT DEFAULT 0 CHECK (current_position BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Sync Infrastructure

```sql
CREATE TABLE sync_queue (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    action VARCHAR(20) NOT NULL,  -- 'insert' | 'update' | 'delete'
    payload JSONB NOT NULL,
    synced BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);
CREATE INDEX idx_sync_pending ON sync_queue (synced, created_at) WHERE NOT synced;

CREATE TABLE sync_log (
    id SERIAL PRIMARY KEY,
    direction VARCHAR(10) NOT NULL,  -- 'push' | 'pull'
    items_count INT,
    status VARCHAR(20) NOT NULL,  -- 'ok' | 'error' | 'partial'
    error_msg TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sync_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Sync Direction Summary

| Entity | Local → Cloud | Cloud → Local | Notes |
|--------|---------------|---------------|-------|
| farms | ✅ Push | ✅ Pull | New entity |
| barns | ✅ Push | ✅ Pull | Full field sync |
| cycles | ✅ Push | ✅ Pull | |
| devices | ✅ Push (heartbeat) | ✅ Pull | Auto-create from heartbeat |
| device_channels | ✅ Push | ✅ Pull | |
| device_states | ✅ Push | ✅ Pull | |
| device_commands | ✅ Push | ✅ Pull | |
| warehouses | ✅ Push | ✅ Pull | |
| inventory | ✅ Push | ✅ Pull | |
| inventory_transactions | ✅ Push | ✅ Pull | Side-effect from care ops |
| equipment | ✅ Push | ✅ Pull | New entity |
| sensor_data | ✅ Push | ✅ Pull | All sensor types |
| care_feeds | ✅ Push | ✅ Pull | meal→session mapping |
| care_deaths | ✅ Push | ✅ Pull | count→quantity, cause→reason |
| care_medications | ✅ Push | ✅ Pull | product_id→medication_id |
| care_sales | ✅ Push | ✅ Pull | count→quantity, total_weight→weight_kg |
| care_weights | ✅ Push | ✅ Pull | |
| care_litters | ✅ Push | ✅ Pull | [NEW] product_id→use_litter |
| care_expenses | ✅ Push | ✅ Pull | [NEW] |
| feed_trough_checks | ✅ Push | ✅ Pull | [NEW] ref_feed_id |
| weight_samples | ✅ Push | ✅ Pull | [NEW] |
| weight_reminders | ✅ Push | ✅ Pull | |
| cycle_daily_snapshots | ❌ Not synced | ❌ Not needed | Computed locally |
| vaccine_schedules | ✅ Push | ✅ Pull | |
| health_notes | ✅ Push | ✅ Pull | |
| cycle_feed_programs | ✅ Push | ✅ Pull | [NEW] |
| cycle_feed_program_items | ✅ Push | ✅ Pull | [NEW] |
| cycle_feed_stages | ✅ Push | ✅ Pull | [NEW] |
| cycle_splits | ✅ Push | ✅ Pull | [NEW] |
| feed_brands | ❌ (cloud master) | ✅ Pull | Cloud is source |
| feed_types | ❌ (cloud master) | ✅ Pull | |
| medications | ❌ (cloud master) | ✅ Pull | |
| suppliers | ✅ Push | ✅ Pull | Bidirectional |
| vaccine_programs | ❌ (cloud master) | ✅ Pull | |
| vaccine_program_items | ❌ (cloud master) | ✅ Pull | |
| device_types | Seed data | Seed data | |
| curtain_configs | ✅ Push | ✅ Pull | [NEW] |

---

## Field Naming Reference (Local ↔ Cloud)

### care_feeds
| Local Field | Cloud Field | Note |
|-------------|-------------|------|
| `meal` | `session` | Map on sync |
| `quantity` | `quantity` | Same |
| `bags` | `bags` | Same |
| `kg_actual` | `kg_actual` | Same |
| `remaining_pct` | `remaining_pct` | Same |

### care_deaths
| Local Field | Cloud Field | Note |
|-------------|-------------|------|
| `count` | `quantity` | Map on sync |
| `cause` | `reason` | Map on sync |

### care_sales
| Local Field | Cloud Field | Note |
|-------------|-------------|------|
| `count` | `quantity` | Map on sync |
| `total_weight` | `weight_kg` | Map on sync |
| `unit_price` | `price_per_kg` | Map on sync |
| `gender` | `gender` | Same |

### care_medications
| Local Field | Cloud Field | Note |
|-------------|-------------|------|
| `product_id` | `medication_id` | Map on sync |
| `quantity` | `quantity` | Same |
| `unit` | `unit` | Same |

### sensor_data (merged)
| Old Cloud Table | New sensor_type | Notes |
|-----------------|----------------|-------|
| `env_readings.temperature` | `temperature` | |
| `env_readings.humidity` | `humidity` | |
| `env_readings.nh3_ppm` | `nh3` | |
| `env_readings.co2_ppm` | `co2` | |
| `env_readings.heat_index` | `heat_index` | |
| `env_weather.wind_speed_ms` | `wind_speed` | |
| `env_weather.wind_direction_deg` | `wind_direction` | |
| `env_weather.is_raining` | `is_raining` | |
| `env_weather.rainfall_mm` | `rainfall` | |
| `env_weather.outdoor_temp` | `outdoor_temp` | |

---

## Migration Plan (Cloud Reset)

Since Cloud can be reset, migrations are straightforward:

1. **Drop cloud tables** that don't fit new model
2. **Create new cloud tables** matching Local schema exactly
3. **Run sync** to populate Cloud from Local

No data migration needed — clean slate for Cloud.