# Data Dependency Map - Local Server

> **Created**: 2026-04-03
> **Updated**: 2026-04-04 - Sync Infrastructure redesigned: 6 issues fixed, 38 missing handlers, retry/priority/lock/version system
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

Device (1) ───< device_types
Device (1) ───< device_channels ───────────→ Equipment (nullable FK)
Device (1) ───< device_states
Device (1) ───< device_state_log
Device (1) ───< device_commands
Device (1) ───< device_telemetry
Device (1) ───< device_alerts
Device (1) ───< device_config_versions
Device (1) ───< equipment_assignment_log
Device (1) ───< equipment_command_log

Equipment (1) ───< equipment_parts
Equipment (1) ───< equipment_readings
Equipment (1) ───< equipment_performance

Warehouse
├── warehouses ───────────────────── kho (central hoặc barn-specific)
├── warehouse_zones ─────────────── vùng trong kho (receiving, storage, quarantine)
├── products ─────────────────────── danh mục sản phẩm (feed, medication, equipment, consumable)
├── inventory ─────────────────────── tồn kho hiện tại
├── inventory_transactions ─────────── lịch sử xuất/nhập ←── care_feeds, care_medications, care_litters
├── inventory_snapshots ───────────── snapshot tồn kho định kỳ
├── inventory_alerts ───────────────── cảnh báo tồn kho
├── suppliers ─────────────────────── nhà cung cấp
├── purchase_orders ───────────────── đơn đặt hàng
├── purchase_order_items ─────────── chi tiết đơn hàng
└── stock_valuation ───────────────── định giá tồn kho

SensorData
├── sensor_types ───────────────────── danh mục loại sensor (temp, humidity, NH3...)
├── sensors ───────────────────────── sensor vật lý được deploy
├── sensor_data ───────────────────── TimescaleDB hypertable (time-series)
├── sensor_alerts ─────────────────── cảnh báo ngưỡng
├── sensor_daily_summary ───────────── tổng hợp theo ngày (avg/min/max)
├── sensor_threshold_configs ───────── cấu hình ngưỡng cho từng sensor
├── sensor_calibrations ─────────────── lịch sử hiệu chuẩn
└── sensor_maintenance_log ─────────── bảo trì (vệ sinh, thay thế)
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
    │   ├── device_types ──────────── loại thiết bị (relay/sensor/mixed)
    │   ├── device_channels ──────────── → Equipment (nullable FK)
    │   │       └── 8 channels có thể gán vào 4 tấm bạt (lên+xuống)
    │   ├── device_states ─────────── trạng thái HIỆN TẠI của channel
    │   ├── device_state_log ───────── lịch sử bật/tắt channel
    │   ├── device_commands ─────────── lệnh gửi đến Device
    │   ├── device_telemetry ───────── raw telemetry từ sensor
    │   ├── device_alerts ─────────── cảnh báo (offline, low signal...)
    │   ├── device_config_versions ─── firmware/parameter versions
    │   ├── equipment_assignment_log ←── lịch sử gán channel→Equipment
    │   └── equipment_command_log ←── lịch sử bật/tắt Equipment
    │
    ├── Warehouse
    │   ├── warehouses ─────────────── kho (central/barn-specific)
    │   │       ├── central warehouse ─── kho tổng (thuốc, equipment tiêu hao)
    │   │       └── barn warehouses ──── kho theo barn (cám)
    │   ├── warehouse_zones ─────────── vùng (receiving, storage, quarantine)
    │   ├── inventory ─────────────────── tồn kho → products(id)
    │   ├── inventory_transactions ─────── xuất/nhập (side-effect từ care)
    │   ├── inventory_snapshots ────────── snapshot định kỳ
    │   ├── inventory_alerts ─────────── cảnh báo (low stock, expiry)
    │   ├── purchase_orders ───────────── đơn đặt hàng → suppliers
    │   ├── purchase_order_items ───────── chi tiết đơn hàng → products
    │   └── stock_valuation ───────────── định giá tồn kho
    │
    ├── Equipment
    │   ├── equipment_parts ─────────── linh kiện thay thế (bạc, dây curoa...)
    │   ├── equipment_readings ───────── sensor readings từ equipment
    │   └── equipment_performance ─────── snapshot hiệu suất định kỳ
    │
    └── SensorData
        ├── sensor_types ─────────────── danh mục loại sensor
        ├── sensors ─────────────────── sensor vật lý được deploy
        ├── sensor_data ─────────────── TimescaleDB hypertable
        ├── sensor_alerts ───────────── cảnh báo ngưỡng
        ├── sensor_daily_summary ─────── tổng hợp theo ngày
        ├── sensor_threshold_configs ── cấu hình ngưỡng
        ├── sensor_calibrations ─────── lịch sử hiệu chuẩn
        └── sensor_maintenance_log ──── bảo trì sensor

Reference Data (independent, Cloud→Local sync):
├── products ─────────────────────── central catalog (ALL items: feed/med/equipment/consumable)
├── suppliers ─────────────────────── nhà cung cấp (EXPANDED)
├── feed_brands ──────────────────── hãng thức ăn → products
├── feed_types ───────────────────── loại thức ăn → feed_brands + products
├── medications ───────────────────── thuốc → products
├── vaccine_programs ───────────────── chương trình vaccine
├── vaccine_program_items ──────────── → medications(id) → products(id)
├── equipment_types ───────────────── loại thiết bị IoT (power, MQTT protocol JSONB)
├── device_types ──────────────────── loại thiết bị IoT (MQTT protocol JSONB)
└── curtain_configs ────────────────── cấu hình bạt

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

### 4. Device (IoT)

**Định nghĩa:** Device là thiết bị IoT - có thể là **controller** (điều khiển), **sensor** (thu thập dữ liệu), hoặc **mixed** (cả hai).
**Device điều khiển Equipment** qua các channels.

**Use Cases:**
1. **Relay Control** — điều khiển bạt, quạt, đèn, sưởi
2. **Sensor Collection** — thu thập nhiệt độ, độ ẩm, NH3, CO2
3. **Equipment Management** — gán channel → Equipment, track assignment
4. **Monitoring** — online status, signal, uptime, alerts
5. **Maintenance** — firmware, warranty, troubleshooting

```sql
-- ============================================
-- 4.1 Device Types
-- ============================================
-- Phân loại thiết bị: ESP32 Relay 8CH, DHT22 Sensor, ENV Sensor...
CREATE TABLE device_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,  -- 'esp32-relay-8ch', 'esp32-dht22', 'esp32-env-mixed'
    name VARCHAR(100) NOT NULL,
    device_class VARCHAR(20) NOT NULL,  -- 'relay' | 'sensor' | 'mixed'
    channel_count INT DEFAULT 0,
    channel_types JSONB,  -- [{ch: 1, type: 'relay'}, {ch: 2, type: 'relay'}, ...]
    mqtt_protocol JSONB,  -- protocol config: topics, intervals, payload format
    spec_sheet_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4.2 Devices
-- ============================================
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    device_code VARCHAR(100) UNIQUE NOT NULL,  -- 'esp-barn1-relay-01'
    device_type_id INT REFERENCES device_types(id),
    barn_id VARCHAR(50) REFERENCES barns(id),  -- nullable (unassigned)

    -- Identity & Location
    name VARCHAR(200),
    location_description VARCHAR(200),  -- 'Cửa ra vào, tầng 2'

    -- MQTT
    mqtt_topic VARCHAR(200) NOT NULL,
    mqtt_protocol JSONB,  -- override protocol config per device

    -- Hardware
    hardware_version VARCHAR(50),
    firmware_version VARCHAR(50),
    mac_address VARCHAR(17),
    chip_id VARCHAR(50),  -- ESP32 chip ID

    -- Connectivity
    is_online BOOLEAN DEFAULT FALSE,
    last_heartbeat_at TIMESTAMPTZ,
    wifi_rssi INT,
    wifi_ssid VARCHAR(100),
    ip_address VARCHAR(45),

    -- Health & Diagnostics
    uptime_seconds BIGINT,
    free_heap_bytes INT,
    cpu_temperature DECIMAL(5,2),  -- CPU temperature
    power_voltage DECIMAL(5,2),  -- Supply voltage

    -- Config
    telemetry_interval_seconds INT DEFAULT 300,  -- sensor read interval
    heartbeat_interval_seconds INT DEFAULT 30,

    -- Alerting
    alert_offline BOOLEAN DEFAULT TRUE,
    alert_low_signal BOOLEAN DEFAULT FALSE,
    alert_high_temp BOOLEAN DEFAULT FALSE,
    last_offline_alert_at TIMESTAMPTZ,

    -- Maintenance
    install_date DATE,
    warranty_until DATE,
    last_maintenance_at TIMESTAMPTZ,
    next_maintenance_at DATE,

    -- Deployment
    status VARCHAR(20) DEFAULT 'active',  -- 'active' | 'inactive' | 'maintenance' | 'retired'
    assigned_to VARCHAR(100),
    notes TEXT,
    metadata JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4.3 Device Channels
-- ============================================
-- Các kênh I/O của Device (relay 1-8, sensor inputs, analog inputs...)
-- Mỗi channel có thể gán đến 1 Equipment (nullable)
CREATE TABLE device_channels (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    channel_number INT NOT NULL,  -- 1-8 for relay, 1-N for sensor

    -- Classification
    channel_type VARCHAR(20) NOT NULL,  -- 'relay' | 'pwm' | 'digital_input' | 'analog_input' | 'onewire' | 'i2c'
    io_type VARCHAR(20) DEFAULT 'output',  -- 'input' | 'output' | 'bidirectional'

    -- Function assignment
    function VARCHAR(50),  -- 'curtain_up' | 'curtain_down' | 'fan' | 'light' | 'heater' | 'water_valve'
    function_mode VARCHAR(20),  -- 'onoff' | 'toggle' | 'pwm' | 'step'

    -- Hardware
    gpio_pin INT,
    hardware_address VARCHAR(50),  -- I2C address, SPI chip select

    -- Equipment linkage
    equipment_id INT REFERENCES equipment(id),  -- nullable: chưa gán thì NULL
    equipment_function VARCHAR(20),  -- 'primary' | 'secondary' | 'backup'

    -- Relay-specific
    relay_type VARCHAR(10),  -- 'no' | 'nc' (normally open / normally closed)
    max_load_amps DECIMAL(5,2),

    -- PWM-specific
    pwm_frequency_hz INT DEFAULT 1000,
    pwm_resolution_bits INT DEFAULT 8,

    -- Sensor-specific
    sensor_model VARCHAR(100),
    sensor_calibration JSONB,
    reading_unit VARCHAR(20),
    calibration_date DATE,

    -- Config
    config JSONB,  -- channel-specific config
    min_value DECIMAL(10,2),
    max_value DECIMAL(10,2),
    default_state VARCHAR(20),  -- default on boot
    safe_state VARCHAR(20),  -- safe state on disconnect (e.g., 'off')

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    UNIQUE(device_id, channel_number)
);

-- ============================================
-- 4.4 Device State (Current)
-- ============================================
-- Trạng thái HIỆN TẠI của mỗi channel
CREATE TABLE device_states (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id) ON DELETE CASCADE,
    channel_number INT NOT NULL,
    state VARCHAR(20) NOT NULL,  -- 'on' | 'off' | 'auto' | 'error'
    state_value DECIMAL(10,2),  -- analog/PWM value
    state_quality VARCHAR(20),  -- 'good' | 'bad' | 'uncertain'
    last_command_id INT,  -- last command that changed this
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_id, channel_number)
);

-- ============================================
-- 4.5 Device Commands
-- ============================================
-- Lệnh điều khiển gửi đến Device
CREATE TABLE device_commands (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id),
    channel_number INT,  -- nullable for device-wide commands

    command_type VARCHAR(50) NOT NULL,  -- 'relay_on' | 'relay_off' | 'set_pwm' | 'configure' | 'reboot'
    command_action VARCHAR(50) NOT NULL,

    payload JSONB NOT NULL,  -- {"state": "on", "duration": 30, "position": 50}

    -- Source & Priority
    source VARCHAR(50) NOT NULL,  -- 'manual' | 'schedule' | 'auto_rule' | 'cloud' | 'api'
    triggered_by VARCHAR(100),  -- user_id or system rule name
    priority VARCHAR(20) DEFAULT 'normal',  -- 'low' | 'normal' | 'high' | 'critical'

    -- Response & Status
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending' | 'sent' | 'delivered' | 'executed' | 'timeout' | 'failed'
    response_payload JSONB,
    error_code VARCHAR(20),
    error_message TEXT,

    -- Timing
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ  -- command expires at this time if not executed
);

-- ============================================
-- 4.6 Device State Log (History)
-- ============================================
-- Lịch sử thay đổi trạng thái channel
CREATE TABLE device_state_log (
    id SERIAL PRIMARY KEY,
    device_id INT NOT NULL,
    channel_number INT NOT NULL,
    previous_state VARCHAR(20),
    new_state VARCHAR(20) NOT NULL,
    state_value DECIMAL(10,2),
    state_quality VARCHAR(20),
    source VARCHAR(50),
    trigger_command_id INT,  -- FK to device_commands if triggered by command
    logged_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4.7 Equipment Assignment Log
-- ============================================
-- Lịch sử gán/unassign/reassign channel → Equipment
CREATE TABLE equipment_assignment_log (
    id SERIAL PRIMARY KEY,
    equipment_id INT REFERENCES equipment(id),
    device_id INT REFERENCES devices(id),
    channel_number INT NOT NULL,
    action VARCHAR(20) NOT NULL,  -- 'assigned' | 'unassigned' | 'reassigned' | 'function_changed'
    previous_equipment_id INT,
    previous_function VARCHAR(50),
    new_function VARCHAR(50),
    reason TEXT,
    verified_by VARCHAR(100),
    verified_at TIMESTAMPTZ,
    changed_by VARCHAR(100),
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4.8 Equipment Command Log
-- ============================================
-- Lịch sử bật/tắt Equipment (để trace "Quạt #1 bật lúc nào?")
CREATE TABLE equipment_command_log (
    id SERIAL PRIMARY KEY,
    equipment_id INT REFERENCES equipment(id),
    device_id INT REFERENCES devices(id),
    channel_number INT NOT NULL,
    command VARCHAR(20) NOT NULL,  -- 'on' | 'off' | 'set_position' | 'toggle'
    command_payload JSONB,  -- {"position": 50, "duration": 3600}
    source VARCHAR(50),  -- 'manual' | 'schedule' | 'auto' | 'cloud'
    triggered_by VARCHAR(100),
    status VARCHAR(20),  -- 'success' | 'failed' | 'timeout'
    error_message TEXT,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4.9 Device Telemetry (for sensor devices)
-- ============================================
-- Raw telemetry data from sensor devices (before processing into sensor_data)
CREATE TABLE device_telemetry (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id),
    telemetry_type VARCHAR(50) NOT NULL,  -- 'environment' | 'power' | 'performance' | 'gps'
    payload JSONB NOT NULL,  -- raw payload from device
    received_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ  -- when parsed into sensor_data
);

-- ============================================
-- 4.10 Device Alerts
-- ============================================
CREATE TABLE device_alerts (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id),
    alert_type VARCHAR(50) NOT NULL,  -- 'offline' | 'low_signal' | 'high_temp' | 'command_failed' | 'heap_low'
    severity VARCHAR(20) NOT NULL,  -- 'info' | 'warning' | 'critical'
    message TEXT,
    payload JSONB,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4.11 Device Config Versions
-- ============================================
-- Track firmware/parameter versions for each device
CREATE TABLE device_config_versions (
    id SERIAL PRIMARY KEY,
    device_id INT REFERENCES devices(id),
    config_type VARCHAR(50) NOT NULL,  -- 'firmware' | 'parameters' | 'schedule' | 'mqtt'
    version VARCHAR(50) NOT NULL,
    config_payload JSONB NOT NULL,
    changelog TEXT,
    is_deployed BOOLEAN DEFAULT FALSE,
    deployed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Query: "Quạt hút #1 bật những lúc nào?"**
```sql
SELECT ecl.executed_at, ecl.command, ecl.source, ecl.triggered_by
FROM equipment_command_log ecl
WHERE ecl.equipment_id = (SELECT id FROM equipment WHERE name = 'Quạt hút #1')
ORDER BY ecl.executed_at DESC;
```

**Query: "Device esp-barn1-relay-01 đã offline bao nhiêu lần?"**
```sql
SELECT created_at, message
FROM device_alerts
WHERE device_id = (SELECT id FROM devices WHERE device_code = 'esp-barn1-relay-01')
  AND alert_type = 'offline'
ORDER BY created_at DESC;
```

**Query: "Tất cả channel của Device đang điều khiển Equipment nào?"**
```sql
SELECT d.name as device, dc.channel_number, dc.function, e.name as equipment, e.equipment_type
FROM device_channels dc
JOIN devices d ON dc.device_id = d.id
LEFT JOIN equipment e ON dc.equipment_id = e.id
WHERE d.device_code = 'esp-barn1-relay-01'
ORDER BY dc.channel_number;
```

---

### 5. Warehouse

**Định nghĩa:** Warehouse là nơi lưu trữ nguyên vật liệu, thuốc, thiết bị tiêu hao.
Có 2 loại: **Barn Warehouse** (mỗi barn có kho cám riêng) và **Central Warehouse** (kho tổng chung).

**Phân loại:**
- **feed_warehouse** — kho cám cho từng barn
- **medication_warehouse** — kho thuốc (tập trung hoặc theo barn)
- **general_warehouse** — kho tổng chứa equipment tiêu hao, phụ tùng

**Cross-Domain Pattern:**
inventory_transactions là "fact table" - được tạo như **side-effect** từ các care operations.

```sql
-- ============================================
-- 5.1 Warehouses
-- ============================================
CREATE TABLE warehouses (
    id SERIAL PRIMARY KEY,
    warehouse_code VARCHAR(50) UNIQUE NOT NULL,  -- 'WH-CENTRAL', 'WH-BARN01-FEED'
    name VARCHAR(200) NOT NULL,

    -- Classification
    warehouse_type VARCHAR(20) NOT NULL,  -- 'feed' | 'medication' | 'general' | 'central'
    is_central BOOLEAN DEFAULT FALSE,   -- TRUE = kho tổng

    -- Location
    barn_id VARCHAR(50) REFERENCES barns(id),  -- NULL for central warehouse
    address TEXT,
    zone VARCHAR(50),                      -- 'zone_A' | 'storage' | 'receiving'
    location_description VARCHAR(200),

    -- Physical
    length_m DECIMAL(6,2),
    width_m DECIMAL(6,2),
    height_m DECIMAL(6,2),
    floor_area_sqm DECIMAL(10,2),         -- computed: length * width
    volume_cbm DECIMAL(10,2),             -- computed: length * width * height
    storage_capacity_units INT,           -- số tấn có thể lưu trữ

    -- Environment
    has_ventilation BOOLEAN DEFAULT FALSE,
    has_humidifier BOOLEAN DEFAULT FALSE,
    has_dehumidifier BOOLEAN DEFAULT FALSE,
    has_temperature_control BOOLEAN DEFAULT FALSE,
    temperature_range_min DECIMAL(5,2),
    temperature_range_max DECIMAL(5,2),

    -- Contact
    manager_name VARCHAR(100),
    manager_phone VARCHAR(20),
    manager_email VARCHAR(100),

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    operational_status VARCHAR(20) DEFAULT 'operational',  -- 'operational' | 'full' | 'maintenance' | 'closed'

    -- Cost
    rental_cost_monthly DECIMAL(12,2),
    electricity_cost_monthly DECIMAL(12,2),

    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5.2 Warehouse Zones
-- ============================================
-- Vùng trong kho: khu vực nhận hàng, khu vực lưu trữ, khu vực cách ly
CREATE TABLE warehouse_zones (
    id SERIAL PRIMARY KEY,
    warehouse_id INT REFERENCES warehouses(id) ON DELETE CASCADE,
    zone_code VARCHAR(20) NOT NULL,     -- 'RECEIVING' | 'STORAGE' | 'QUARANTINE' | 'EXPIRED' | 'RETURNS'
    zone_name VARCHAR(100) NOT NULL,
    zone_type VARCHAR(30),               -- 'receiving' | 'storage' | 'cold_storage' | 'quarantine' | 'expired' | 'returns'
    floor INT DEFAULT 1,
    shelf_count INT,                    -- số kệ trong vùng
    bin_count INT,                      -- số ngăn trong kệ

    -- Storage specs
    max_capacity_units DECIMAL(10,2),
    current_capacity_units DECIMAL(10,2),  -- computed from inventory

    -- Environment requirements
    required_temp_min DECIMAL(5,2),
    required_temp_max DECIMAL(5,2),
    required_humidity_min DECIMAL(5,2),
    required_humidity_max DECIMAL(5,2),

    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5.3 Products (Danh mục sản phẩm)
-- ============================================
-- Tất cả sản phẩm có thể lưu trữ: cám, thuốc, equipment tiêu hao
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    product_code VARCHAR(50) UNIQUE NOT NULL,
    barcode VARCHAR(50),

    -- Classification
    product_type VARCHAR(20) NOT NULL,  -- 'feed' | 'medication' | 'equipment' | 'consumable' | ' spare_part' | 'vaccine'
    category VARCHAR(50),               -- 'starter_feed' | 'grower_feed' | 'finisher_feed'
    sub_category VARCHAR(50),
    product_name VARCHAR(200) NOT NULL,
    brand_name VARCHAR(100),

    -- Unit
    unit VARCHAR(20) NOT NULL,         -- 'kg' | 'bag' | 'liter' | 'piece' | 'box'
    unit_size DECIMAL(10,2),           -- kích thước đóng gói: 25kg/bag, 50kg/bag
    conversion_factor DECIMAL(10,2),    -- số kg per unit: 1 bag = 25kg

    -- Pricing
    unit_price DECIMAL(12,2),
    currency VARCHAR(10) DEFAULT 'VND',
    last_purchase_price DECIMAL(12,2),

    -- Stock alerts
    min_stock_level DECIMAL(10,2),    -- mức tồn kho tối thiểu
    max_stock_level DECIMAL(10,2),     -- mức tồn kho tối đa
    reorder_point DECIMAL(10,2),        -- điểm đặt hàng lại
    lead_time_days INT DEFAULT 3,       -- ngày chờ từ khi đặt đến khi nhận

    -- Shelf life
    default_shelf_life_days INT,
    requires_expiry_tracking BOOLEAN DEFAULT FALSE,

    -- Storage
    requires_cold_storage BOOLEAN DEFAULT FALSE,
    storage_temp_min DECIMAL(5,2),
    storage_temp_max DECIMAL(5,2),

    -- Suppliers
    preferred_supplier_id INT REFERENCES suppliers(id),
    supplier_product_code VARCHAR(100),  -- mã sản phẩm của nhà cung cấp

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_tracked BOOLEAN DEFAULT TRUE,   -- có tracking tồn kho không

    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5.4 Inventory (Tồn kho hiện tại)
-- ============================================
CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    warehouse_id INT REFERENCES warehouses(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    zone_id INT REFERENCES warehouse_zones(id),  -- vùng lưu trữ

    -- Quantity
    quantity DECIMAL(10,2) DEFAULT 0,
    reserved_quantity DECIMAL(10,2) DEFAULT 0,  -- đã đặt nhưng chưa xuất
    available_quantity DECIMAL(10,2) DEFAULT 0, -- quantity - reserved_quantity

    -- Batch
    batch_number VARCHAR(100),
    manufacturing_date DATE,
    expiry_date DATE,

    -- Cost
    unit_cost DECIMAL(12,2),           -- chi phí hiện tại
    total_value DECIMAL(12,2),         -- computed: quantity * unit_cost

    -- Status
    stock_status VARCHAR(20) DEFAULT 'available',  -- 'available' | 'reserved' | 'quarantine' | 'expired' | 'damaged'
    quality_status VARCHAR(20) DEFAULT 'good',      -- 'good' | 'damaged' | 'contaminated'

    -- Location
    shelf VARCHAR(20),                 -- 'A1', 'B2'
    bin VARCHAR(20),

    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(warehouse_id, product_id, batch_number)
);

-- ============================================
-- 5.5 Inventory Transactions
-- ============================================
CREATE TABLE inventory_transactions (
    id SERIAL PRIMARY KEY,
    transaction_code VARCHAR(50) UNIQUE NOT NULL,  -- 'IN-2026-0001'

    warehouse_id INT REFERENCES warehouses(id),
    product_id INT REFERENCES products(id),
    zone_id INT REFERENCES warehouse_zones(id),

    -- Transaction type
    transaction_type VARCHAR(20) NOT NULL,  -- 'import' | 'export' | 'transfer' | 'adjust' | 'damage' | 'dispose'
    transaction_reason VARCHAR(100),

    -- Quantity
    quantity DECIMAL(10,2) NOT NULL,        -- âm cho export
    unit_cost DECIMAL(12,2),
    total_value DECIMAL(12,2),

    -- Reference to source (cross-domain)
    -- reference_type = 'care_feed'     → reference_id = care_feeds.id
    -- reference_type = 'care_med'      → reference_id = care_medications.id
    -- reference_type = 'care_litter'   → reference_id = care_litters.id
    -- reference_type = 'purchase'      → reference_id = purchase_orders.id
    -- reference_type = 'transfer'      → reference_id = self (for paired transfer)
    reference_type VARCHAR(50),
    reference_id INT,

    -- For transfers
    from_warehouse_id INT REFERENCES warehouses(id),
    to_warehouse_id INT REFERENCES warehouses(id),

    -- Supplier
    supplier_id INT REFERENCES suppliers(id),
    supplier_name VARCHAR(200),

    -- Batch & Expiry
    batch_number VARCHAR(100),
    manufacturing_date DATE,
    expiry_date DATE,

    -- Cost breakdown
    unit_price DECIMAL(12,2),
    discount_pct DECIMAL(5,2),
    tax_pct DECIMAL(5,2),
    shipping_cost DECIMAL(12,2),

    -- Documentation
    invoice_no VARCHAR(100),
    delivery_note_no VARCHAR(100),

    -- User
    performed_by VARCHAR(100),

    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5.6 Inventory Snapshots
-- ============================================
-- Snapshot tồn kho định kỳ cho báo cáo
CREATE TABLE inventory_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE NOT NULL,
    warehouse_id INT REFERENCES warehouses(id),
    product_id INT REFERENCES products(id),

    -- Quantities at snapshot time
    opening_quantity DECIMAL(10,2),
    received_quantity DECIMAL(10,2),
    delivered_quantity DECIMAL(10,2),
    closing_quantity DECIMAL(10,2),
    reserved_quantity DECIMAL(10,2),

    -- Value
    opening_value DECIMAL(12,2),
    received_value DECIMAL(12,2),
    delivered_value DECIMAL(12,2),
    closing_value DECIMAL(12,2),

    -- Metrics
    stock_turnover_days INT,
    avg_daily_consumption DECIMAL(10,2),
    days_of_stock_remaining INT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(snapshot_date, warehouse_id, product_id)
);

-- ============================================
-- 5.7 Inventory Alerts
-- ============================================
CREATE TABLE inventory_alerts (
    id SERIAL PRIMARY KEY,
    warehouse_id INT REFERENCES warehouses(id),
    product_id INT REFERENCES products(id),

    alert_type VARCHAR(30) NOT NULL,  -- 'low_stock' | 'out_of_stock' | 'expiry_warning' | 'expiry_critical' | 'overstock' | 'damage'
    severity VARCHAR(20) NOT NULL,    -- 'info' | 'warning' | 'critical'

    message TEXT NOT NULL,
    current_quantity DECIMAL(10,2),
    threshold_value DECIMAL(10,2),

    suggested_action TEXT,
    suggested_order_quantity DECIMAL(10,2),

    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,

    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5.8 Suppliers
-- ============================================
CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    supplier_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,

    contact_name VARCHAR(100),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(100),
    contact_position VARCHAR(100),

    address TEXT,
    tax_code VARCHAR(50),
    website VARCHAR(200),

    -- Business info
    payment_terms VARCHAR(100),       -- 'net30' | 'cod' | 'prepaid'
    credit_limit DECIMAL(12,2),
    rating INT DEFAULT 3,             -- 1-5 stars

    -- Categories they supply
    supplies_product_types VARCHAR(100)[],  -- ARRAY['feed', 'medication', 'equipment']

    bank_name VARCHAR(100),
    bank_account VARCHAR(50),

    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5.9 Purchase Orders
-- ============================================
CREATE TABLE purchase_orders (
    id SERIAL PRIMARY KEY,
    order_code VARCHAR(50) UNIQUE NOT NULL,  -- 'PO-2026-0001'

    supplier_id INT REFERENCES suppliers(id),

    -- Order details
    order_date DATE NOT NULL,
    expected_delivery_date DATE,
    actual_delivery_date DATE,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- 'draft' | 'submitted' | 'confirmed' | 'partial' | 'received' | 'cancelled'
    fulfillment_status VARCHAR(20),  -- 'not_received' | 'partial' | 'complete'

    -- Financial
    subtotal DECIMAL(12,2),
    discount_pct DECIMAL(5,2),
    discount_amount DECIMAL(12,2),
    tax_pct DECIMAL(5,2),
    tax_amount DECIMAL(12,2),
    total_amount DECIMAL(12,2),
    paid_amount DECIMAL(12,2),
    currency VARCHAR(10) DEFAULT 'VND',

    -- Delivery
    delivery_address TEXT,
    delivery_contact VARCHAR(100),
    delivery_phone VARCHAR(20),

    -- Notes
    internal_notes TEXT,
    supplier_notes TEXT,

    prepared_by VARCHAR(100),
    approved_by VARCHAR(100),
    received_by VARCHAR(100),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5.10 Purchase Order Items
-- ============================================
CREATE TABLE purchase_order_items (
    id SERIAL PRIMARY KEY,
    purchase_order_id INT REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id),

    -- Quantity
    ordered_quantity DECIMAL(10,2) NOT NULL,
    received_quantity DECIMAL(10,2) DEFAULT 0,
    rejected_quantity DECIMAL(10,2) DEFAULT 0,

    -- Pricing
    unit_price DECIMAL(12,2) NOT NULL,
    discount_pct DECIMAL(5,2),
    line_total DECIMAL(12,2),

    -- Delivery
    expected_delivery_date DATE,

    -- Status
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending' | 'partial' | 'complete' | 'cancelled'

    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5.11 Stock Valuation
-- ============================================
-- Định giá tồn kho theo các phương pháp
CREATE TABLE stock_valuation (
    id SERIAL PRIMARY KEY,
    valuation_date DATE NOT NULL,

    warehouse_id INT REFERENCES warehouses(id),
    product_id INT REFERENCES products(id),

    -- Valuation methods
    quantity_on_hand DECIMAL(10,2),
    unit_cost DECIMAL(12,2),

    -- FIFO
    fifo_unit_cost DECIMAL(12,2),
    fifo_total_value DECIMAL(12,2),

    -- Average
    avg_unit_cost DECIMAL(12,2),
    avg_total_value DECIMAL(12,2),

    -- Latest
    latest_unit_cost DECIMAL(12,2),
    latest_total_value DECIMAL(12,2),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(valuation_date, warehouse_id, product_id)
);
```

**Query: "Kho tổng còn bao nhiêu thuốc?"**
```sql
SELECT p.product_name, p.unit, SUM(i.quantity) as total_stock, w.name as warehouse
FROM inventory i
JOIN products p ON i.product_id = p.id
JOIN warehouses w ON i.warehouse_id = w.id
WHERE p.product_type = 'medication'
  AND w.is_central = TRUE
GROUP BY p.id, w.id;
```

**Query: "Cảnh báo sắp hết thuốc?"**
```sql
SELECT p.product_name, i.quantity, p.min_stock_level, p.reorder_point
FROM inventory i
JOIN products p ON i.product_id = p.id
WHERE i.quantity <= p.reorder_point
  AND p.is_active = TRUE
ORDER BY i.quantity ASC;
```

**Query: "Tổng giá trị tồn kho kho tổng?"**
```sql
SELECT SUM(i.quantity * i.unit_cost) as total_value
FROM inventory i
JOIN warehouses w ON i.warehouse_id = w.id
WHERE w.is_central = TRUE;
```

---

### 6. Equipment (Fixed Assets)

**Định nghĩa:** Equipment là **vật thể vật lý** - thiết bị cố định trong barn (quạt, sưởi, đèn, bạt, sensor...).
**Equipment được điều khiển bởi Device** - thông qua device_channel.

**Quy tắc:**
- Equipment → được điều khiển bởi Device qua `device_channels.equipment_id` (reverse FK)
- Equipment có thể có Device điều khiển hoặc không (status = 'stock')
- Equipment có thể gắn sensor tích hợp

**Equipment Types:**
- **Active** (tiêu tốn năng lượng): quạt, sưởi, đèn, bơm nước, bạt
- **Passive** (không tiêu tốn): khung, máng ăn, máng nước
- **Sensor** (thu thập dữ liệu): cảm biến nhiệt, cảm biến khí
- **Infrastructure** (kết cấu): bạt, tường, cửa

```sql
-- ============================================
-- 6.1 Equipment
-- ============================================
CREATE TABLE equipment (
    id SERIAL PRIMARY KEY,
    equipment_code VARCHAR(50) UNIQUE NOT NULL,  -- 'EQ-FAN-001'

    -- Classification
    equipment_type VARCHAR(50) NOT NULL,  -- 'fan' | 'heater' | 'light' | 'curtain' | 'sensor' | 'pump' | 'feeder' | 'drinker'
    subtype VARCHAR(50),                    -- 'exhaust_fan' | 'circulation_fan' | 'pad_cooling'
    manufacturer VARCHAR(100),              -- 'VinaFan' | 'Delta' | 'Sanyo'
    model VARCHAR(100),
    series VARCHAR(50),

    -- Identity
    name VARCHAR(200) NOT NULL,
    description TEXT,
    serial_no VARCHAR(100),
    manufacturing_date DATE,

    -- Location
    barn_id VARCHAR(50) REFERENCES barns(id),
    zone VARCHAR(50),                      -- 'zone_A' | 'zone_B'
    location_description VARCHAR(200),     -- 'Cửa ra vào, tầng 2'
    floor INT DEFAULT 1,

    -- Physical
    weight_kg DECIMAL(8,2),
    dimensions_lwh_cm VARCHAR(50),         -- '100x60x150' cm
    color VARCHAR(30),
    material VARCHAR(50),                  -- 'metal' | 'plastic' | 'aluminum'

    -- Electrical
    voltage_v INT,                          -- 220V, 380V
    phase INT DEFAULT 1,                   -- 1 phase, 3 phase
    frequency_hz INT DEFAULT 50,
    power_watts INT,                       -- công suất danh nghĩa
    amperage_amps DECIMAL(6,2),
    power_factor DECIMAL(4,2),

    -- Performance
    capacity_spec VARCHAR(100),            -- '5000 CFM' | '15000 BTU'
    efficiency_rating VARCHAR(20),         -- 'A+' | 'B' | 'IP55'
    speed_levels INT DEFAULT 1,             -- số cấp tốc độ
    airflow_cmh INT,                        -- luồng không khí m3/h

    -- Financial
    purchase_date DATE,
    purchase_price DECIMAL(12,2),
    currency VARCHAR(10) DEFAULT 'VND',
    vendor VARCHAR(200),
    invoice_no VARCHAR(100),
    depreciation_years INT DEFAULT 5,
    depreciation_method VARCHAR(20) DEFAULT 'straight_line',  -- 'straight_line' | 'declining'
    residual_value DECIMAL(12,2) DEFAULT 0,

    -- Status & Deployment
    status VARCHAR(20) DEFAULT 'active',  -- 'stock' | 'installed' | 'running' | 'idle' | 'broken' | 'disposed' | 'retired'
    install_date DATE,
    commissioning_date DATE,              -- ngày bắt đầu vận hành
    operation_start_date DATE,            -- ngày bắt đầu sử dụng thực tế

    -- Warranty & Maintenance
    warranty_until DATE,
    maintenance_interval_days INT,         -- khoảng cách bảo trì định kỳ (ngày)
    last_maintenance_at TIMESTAMPTZ,
    next_maintenance_at DATE,
    maintenance_cost DECIMAL(12,2),

    -- Performance Tracking
    runtime_hours DECIMAL(12,2) DEFAULT 0,           -- giờ chạy hiện tại
    total_runtime_hours DECIMAL(12,2) DEFAULT 0,     -- tổng giờ chạy
    energy_consumption_kwh DECIMAL(10,2) DEFAULT 0,  -- kWh tiêu thụ hiện tại
    total_energy_kwh DECIMAL(12,2) DEFAULT 0,       -- tổng kWh tiêu thụ
    on_off_cycles INT DEFAULT 0,            -- số lần bật/tắt
    avg_daily_runtime_hours DECIMAL(6,2),  -- tính tự động

    -- Cost Tracking
    electricity_cost DECIMAL(12,2),       -- chi phí điện
    repair_count INT DEFAULT 0,
    total_repair_cost DECIMAL(12,2),

    -- Current Device Assignment
    -- (query via device_channels WHERE equipment_id = this.id)
    -- Equipment không có device_id - đó là reverse FK

    -- Documentation
    manual_url VARCHAR(500),
    warranty_card_url VARCHAR(500),
    photos JSONB,                         -- ['url1', 'url2']

    -- Extra
    notes TEXT,
    metadata JSONB,
    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6.2 Equipment Parts (linh kiện thay thế)
-- ============================================
-- Các parts/components của Equipment (bạc lót, dây curoa, cánh quạt...)
CREATE TABLE equipment_parts (
    id SERIAL PRIMARY KEY,
    equipment_id INT REFERENCES equipment(id) ON DELETE CASCADE,
    part_code VARCHAR(50),
    part_name VARCHAR(200) NOT NULL,
    part_type VARCHAR(50),               -- 'bearing' | 'belt' | 'blade' | 'motor' | 'capacitor' | 'filter'
    serial_no VARCHAR(100),
    quantity INT DEFAULT 1,
    unit VARCHAR(20),

    -- Replacement
    install_date DATE,
    replace_after_hours DECIMAL(10,2),   -- thay sau X giờ
    replace_after_cycles INT,
    last_replaced_at TIMESTAMPTZ,
    next_replacement_at DATE,

    -- Cost
    unit_cost DECIMAL(10,2),
    supplier VARCHAR(200),

    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6.3 Equipment Readings (sensor readings từ equipment)
-- ============================================
-- Equipment có sensor tích hợp (VD: biến tần đo công suất, motor có temperature sensor)
CREATE TABLE equipment_readings (
    id SERIAL PRIMARY KEY,
    equipment_id INT REFERENCES equipment(id) ON DELETE CASCADE,
    reading_type VARCHAR(50) NOT NULL,  -- 'temperature' | 'vibration' | 'current' | 'voltage' | 'rpm' | 'pressure'
    reading_value DECIMAL(12,4) NOT NULL,
    reading_unit VARCHAR(20),
    reading_quality VARCHAR(20),         -- 'good' | 'warning' | 'critical'
    threshold_min DECIMAL(12,4),
    threshold_max DECIMAL(12,4),
    reading_at TIMESTAMPTZ NOT NULL,
    source VARCHAR(50),                  -- 'internal_sensor' | 'external_sensor' | 'manual'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6.4 Equipment Performance Summary (snapshot)
-- ============================================
-- Tổng hợp hiệu suất định kỳ (ngày/tuần/tháng)
CREATE TABLE equipment_performance (
    id SERIAL PRIMARY KEY,
    equipment_id INT REFERENCES equipment(id) ON DELETE CASCADE,
    period_type VARCHAR(10) NOT NULL,   -- 'daily' | 'weekly' | 'monthly'
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Runtime
    total_runtime_hours DECIMAL(8,2),
    total_off_hours DECIMAL(8,2),
    on_off_cycles INT,

    -- Energy
    total_energy_kwh DECIMAL(10,2),
    avg_power_kw DECIMAL(8,2),
    energy_cost DECIMAL(10,2),

    -- Performance
    avg_efficiency DECIMAL(5,2),        -- % hiệu suất trung bình
    max_load_pct DECIMAL(5,2),         -- % tải tối đa
    idle_time_pct DECIMAL(5,2),         -- % thời gian idle

    -- Alerts
    alert_count INT DEFAULT 0,
    critical_alerts INT DEFAULT 0,

    -- Cost
    maintenance_cost DECIMAL(10,2),
    electricity_cost DECIMAL(10,2),
    total_operating_cost DECIMAL(12,2),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(equipment_id, period_type, period_start)
);

-- ============================================
-- 6.5 Equipment Assignment Log (already defined above)
-- ============================================
-- Lịch sử gán channel → Equipment
-- Defined in Device section as equipment_assignment_log

-- ============================================
-- 6.6 Equipment Command Log (already defined above)
-- ============================================
-- Lịch sử bật/tắt Equipment
-- Defined in Device section as equipment_command_log
```

**Query: "Tổng chi phí vận hành của quạt trong tháng?"**
```sql
SELECT
    e.name,
    e.power_watts,
    SUM(ep.total_energy_kwh) as total_kwh,
    SUM(ep.electricity_cost) as total_electricity,
    SUM(ep.maintenance_cost) as total_maintenance
FROM equipment e
JOIN equipment_performance ep ON e.id = ep.equipment_id
WHERE e.equipment_type = 'fan'
  AND ep.period_start >= '2026-04-01'
GROUP BY e.id;
```

**Query: "Quạt nào cần bảo trì?"**
```sql
SELECT e.name, e.next_maintenance_at, e.runtime_hours
FROM equipment e
WHERE e.next_maintenance_at <= CURRENT_DATE
   OR e.runtime_hours >= e.maintenance_interval_days * 24  -- approximate
ORDER BY e.next_maintenance_at;
```

---

### 7. SensorData (Time-Series)

**Định nghĩa:** SensorData là dữ liệu cảm biến môi trường trong barn — nhiệt độ, độ ẩm, khí độc...
**Thu thập TỰ ĐỘNG** từ ESP32 Sensor gửi về qua MQTT.
**Dùng cho:** giám sát môi trường, cảnh báo, phân tích FCR, AI insights.

**SensorData đứng một mình vì:**
- Là time-series data (TimescaleDB hypertable) — khác storage pattern
- Thu thập TỰ ĐỘNG — không phải con người nhập
- Mô tả MÔI TRƯỜNG — không phải trạng thái thiết bị
- Thuộc BARN/CYCLE — dùng để monitor môi trường chuồng nuôi

**Phân loại Sensor:**
- **Environment** — nhiệt độ, độ ẩm, khí (NH3, CO2, H2S)
- **Weather** — ngoài trời, gió, mưa
- **Equipment** — sensor tích hợp trong equipment
- **Energy** — công suất, điện áp

```sql
-- ============================================
-- 7.1 Sensor Types (Reference)
-- ============================================
-- Danh mục các loại sensor có thể đo
CREATE TABLE sensor_types (
    id SERIAL PRIMARY KEY,
    sensor_code VARCHAR(50) UNIQUE NOT NULL,  -- 'temp' | 'humidity' | 'nh3'
    sensor_name VARCHAR(100) NOT NULL,

    -- Classification
    category VARCHAR(30) NOT NULL,  -- 'environment' | 'weather' | 'equipment' | 'energy'
    measurement_type VARCHAR(30) NOT NULL,  -- 'temperature' | 'humidity' | 'gas' | 'light' | 'wind'

    -- Unit
    default_unit VARCHAR(20) NOT NULL,
    display_unit VARCHAR(20),

    -- Range
    min_value DECIMAL(10,4),
    max_value DECIMAL(10,4),

    -- Accuracy
    accuracy DECIMAL(10,4),
    resolution DECIMAL(10,4),

    -- Thresholds (defaults)
    warning_low DECIMAL(10,4),
    warning_high DECIMAL(10,4),
    critical_low DECIMAL(10,4),
    critical_high DECIMAL(10,4),

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7.2 Sensors (Physical sensors deployed)
-- ============================================
-- Mỗi sensor vật lý được lắp đặt
CREATE TABLE sensors (
    id SERIAL PRIMARY KEY,
    sensor_code VARCHAR(50) UNIQUE NOT NULL,  -- 'SENSOR-BARN01-TEMP-01'
    sensor_type_id INT REFERENCES sensor_types(id),

    -- Location
    barn_id VARCHAR(50) REFERENCES barns(id),
    device_id INT REFERENCES devices(id),  -- ESP32 nào đọc sensor này
    channel_number INT,                    -- channel nào trên device

    -- Physical
    name VARCHAR(200) NOT NULL,
    location_description VARCHAR(200),     -- 'Góc trái, độ cao 2m'
    installation_height_m DECIMAL(5,2),   -- độ cao lắp đặt
    position_x DECIMAL(8,2),              -- vị trí tương đối trong barn
    position_y DECIMAL(8,2),

    -- Model
    manufacturer VARCHAR(100),
    model VARCHAR(100),
    serial_no VARCHAR(100),
    firmware_version VARCHAR(50),

    -- Calibration
    calibration_date DATE,
    calibration_interval_days INT DEFAULT 90,
    next_calibration_date DATE,
    calibration_certificate_url VARCHAR(500),

    -- Config
    reading_interval_seconds INT DEFAULT 60,  -- tần suất đọc
    aggregation_interval_seconds INT DEFAULT 300,  -- gửi mỗi 5 phút
    reading_count_per_aggregation INT DEFAULT 5,  -- số đọc trước khi gửi

    -- Offset (để hiệu chỉnh)
    offset_value DECIMAL(10,4) DEFAULT 0,
    multiplier DECIMAL(10,4) DEFAULT 1,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    operational_status VARCHAR(20) DEFAULT 'active',  -- 'active' | 'maintenance' | 'faulty' | 'discontinued'
    last_reading_at TIMESTAMPTZ,
    last_communication_at TIMESTAMPTZ,

    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7.3 Sensor Data (Time-Series - TimescaleDB)
-- ============================================
-- Raw data từ sensor — bảng chính cho analytics
CREATE TABLE sensor_data (
    id BIGSERIAL,

    -- Time (required for TimescaleDB)
    time TIMESTAMPTZ NOT NULL,

    -- Links
    sensor_id INT REFERENCES sensors(id),
    device_id INT REFERENCES devices(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    cycle_id INT REFERENCES cycles(id),

    -- Sensor type (denormalized for fast query)
    sensor_type VARCHAR(50) NOT NULL,  -- 'temperature' | 'humidity' | 'nh3' | 'co2'

    -- Value
    value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(20),

    -- Quality
    quality VARCHAR(20) DEFAULT 'good',  -- 'good' | 'suspect' | 'bad' | 'missing'
    raw_value DOUBLE PRECISION,             -- giá trị chưa offset
    aggregation_type VARCHAR(20),            -- 'raw' | 'avg' | 'min' | 'max' | 'sum'

    -- Context
    reading_count INT,                      -- số readings trước aggregation
    min_value_in_aggregation DOUBLE PRECISION,
    max_value_in_aggregation DOUBLE PRECISION,
    std_deviation DOUBLE PRECISION,

    -- Location at reading time
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TimescaleDB hypertable
-- Indexes: (time DESC), (sensor_id, time DESC), (barn_id, time DESC), (sensor_type, time DESC)

-- ============================================
-- 7.4 Sensor Alerts
-- ============================================
-- Cảnh báo khi sensor vượt ngưỡng
CREATE TABLE sensor_alerts (
    id SERIAL PRIMARY KEY,
    sensor_id INT REFERENCES sensors(id),
    device_id INT REFERENCES devices(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    cycle_id INT REFERENCES cycles(id),

    -- Alert details
    alert_type VARCHAR(30) NOT NULL,  -- 'threshold_warning' | 'threshold_critical' | 'sensor_faulty' | 'no_data' | 'drift_detected'
    severity VARCHAR(20) NOT NULL,    -- 'info' | 'warning' | 'critical'

    -- Threshold that was breached
    sensor_type VARCHAR(50),
    threshold_type VARCHAR(20),      -- 'warning_low' | 'warning_high' | 'critical_low' | 'critical_high'
    threshold_value DECIMAL(10,4),
    actual_value DECIMAL(10,4),

    -- Duration
    started_at TIMESTAMPTZ NOT NULL,
    duration_seconds INT,
    ended_at TIMESTAMPTZ,

    -- Acknowledgment
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMPTZ,
    resolution_notes TEXT,

    -- Related
    triggered_by VARCHAR(100),         -- 'system' | 'user' | 'auto_rule'
    rule_id INT,                       -- nếu triggered by automation rule

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7.5 Sensor Daily Summary
-- ============================================
-- Tổng hợp ngày cho mỗi sensor
CREATE TABLE sensor_daily_summary (
    id SERIAL PRIMARY KEY,
    sensor_id INT REFERENCES sensors(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    sensor_type VARCHAR(50) NOT NULL,
    summary_date DATE NOT NULL,

    -- Count
    reading_count INT,
    valid_reading_count INT,
    missing_reading_count INT,
    data_quality_pct DECIMAL(5,2),  -- valid/total * 100

    -- Temperature/Humidity stats
    avg_value DECIMAL(10,4),
    min_value DECIMAL(10,4),
    max_value DECIMAL(10,4),
    std_deviation DECIMAL(10,4),
    median_value DECIMAL(10,4),

    -- For gas sensors (NH3, CO2)
    percentile_10 DECIMAL(10,4),
    percentile_25 DECIMAL(10,4),
    percentile_75 DECIMAL(10,4),
    percentile_90 DECIMAL(10,4),
    percentile_95 DECIMAL(10,4),

    -- Duration in ranges
    duration_below_warning_low_minutes INT,
    duration_in_good_range_minutes INT,
    duration_above_warning_high_minutes INT,
    duration_above_critical_minutes INT,

    -- Target comparison (nếu có target cho cycle)
    target_value DECIMAL(10,4),
    deviation_from_target DECIMAL(10,4),
    deviation_pct DECIMAL(5,2),

    -- Time
    first_reading_at TIMESTAMPTZ,
    last_reading_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sensor_id, summary_date)
);

-- ============================================
-- 7.6 Sensor Threshold Configs
-- ============================================
-- Cấu hình ngưỡng cảnh báo cho từng sensor/sensor_type
CREATE TABLE sensor_threshold_configs (
    id SERIAL PRIMARY KEY,
    sensor_id INT REFERENCES sensors(id),   -- NULL = apply to all sensors of this type
    sensor_type VARCHAR(50) NOT NULL,       -- 'temperature' | 'humidity' | 'nh3'
    barn_id VARCHAR(50) REFERENCES barns(id),  -- NULL = apply to all barns

    -- Thresholds
    warning_low DECIMAL(10,4),
    warning_high DECIMAL(10,4),
    critical_low DECIMAL(10,4),
    critical_high DECIMAL(10,4),

    -- Duration before alert (prevent flapping)
    min_duration_seconds INT DEFAULT 60,  -- phải vượt ngưỡng trong X giây mới báo

    -- Alert settings
    alert_enabled BOOLEAN DEFAULT TRUE,
    send_sms BOOLEAN DEFAULT FALSE,
    send_email BOOLEAN DEFAULT FALSE,
    alert_recipients VARCHAR(500)[],      -- array of emails/phones

    -- Auto-actions
    auto_action_rule_id INT,            -- trigger automation rule when exceeded

    -- Priority
    priority VARCHAR(20) DEFAULT 'normal',  -- 'low' | 'normal' | 'high' | 'critical'

    is_active BOOLEAN DEFAULT TRUE,
    effective_from DATE,
    effective_to DATE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7.7 Sensor Calibrations
-- ============================================
-- Lịch sử hiệu chuẩn sensor
CREATE TABLE sensor_calibrations (
    id SERIAL PRIMARY KEY,
    sensor_id INT REFERENCES sensors(id),

    calibration_date DATE NOT NULL,
    next_calibration_date DATE,

    -- Reference values
    reference_value DECIMAL(10,4),
    measured_value_before DECIMAL(10,4),
    measured_value_after DECIMAL(10,4),

    -- Adjustment
    offset_adjustment DECIMAL(10,4),
    multiplier_adjustment DECIMAL(10,4),

    -- Who
    calibrated_by VARCHAR(100),
    calibration_method VARCHAR(100),
    certificate_no VARCHAR(100),
    certificate_url VARCHAR(500),

    -- Result
    calibration_result VARCHAR(20),      -- 'pass' | 'fail'
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7.8 Sensor Maintenance Log
-- ============================================
CREATE TABLE sensor_maintenance_log (
    id SERIAL PRIMARY KEY,
    sensor_id INT REFERENCES sensors(id),

    maintenance_type VARCHAR(50) NOT NULL,  -- 'cleaning' | 'calibration' | 'repair' | 'replacement' | 'inspection'
    maintenance_date DATE NOT NULL,

    -- Details
    description TEXT,
    performed_by VARCHAR(100),
    cost DECIMAL(10,2),

    -- Parts used
    parts_replaced VARCHAR(200),
    parts_cost DECIMAL(10,2),

    -- Result
    result VARCHAR(20),                  -- 'completed' | 'pending' | 'failed'
    next_maintenance_date DATE,

    photos JSONB,                          -- ['url1', 'url2']

    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Query: "Báo cáo nhiệt độ trung bình barn-01 trong tháng?"**
```sql
SELECT
    summary_date,
    AVG(avg_value) as avg_temp,
    MIN(min_value) as min_temp,
    MAX(max_value) as max_temp
FROM sensor_daily_summary
WHERE barn_id = 'barn-01'
  AND sensor_type = 'temperature'
  AND summary_date BETWEEN '2026-04-01' AND '2026-04-30'
GROUP BY summary_date
ORDER BY summary_date;
```

**Query: "NH3 cao bất thường trong tuần?"**
```sql
SELECT time, value, sensor_id
FROM sensor_data
WHERE sensor_type = 'nh3'
  AND value > (SELECT threshold_value FROM sensor_threshold_configs WHERE sensor_type = 'nh3' AND threshold_type = 'critical_high')
  AND time > NOW() - INTERVAL '7 days'
ORDER BY time DESC;
```

**Query: "Sensor nào cần hiệu chuẩn?"**
```sql
SELECT s.name, s.sensor_code, s.next_calibration_date, st.sensor_name
FROM sensors s
JOIN sensor_types st ON s.sensor_type_id = st.id
WHERE s.next_calibration_date <= CURRENT_DATE
  AND s.is_active = TRUE;
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

**Thiết kế mới — FIX 6 vấn đề:**

### Design Principles
1. **products là central catalog** — TẤT CẢ vật tư (feed/medication/equipment/consumable) đều có bản ghi trong `products`
2. **Type-specific tables bổ sung metadata** — `feed_brands`, `medications`, `equipment` link về `products(id)` để lấy thông tin chung
3. **inventory chỉ cần product_id** — không cần biết type gì, chỉ cần FK → products
4. **vaccine_program_items → product_id** — vaccine là medication, link được vào inventory
5. **Cascade protection** — FK constraints ngăn orphan data
6. **device_types mô tả protocol** — JSONB cho MQTT command/telemetry structure

### Schema

```sql
-- ============================================
-- products: CENTRAL CATALOG for ALL physical items
-- Every feed/medication/equipment/consumable has ONE record here.
-- inventory, inventory_transactions, care_medications all reference this.
-- ============================================
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    product_type VARCHAR(20) NOT NULL,  -- 'feed' | 'medication' | 'equipment' | 'consumable'
    unit VARCHAR(20) DEFAULT 'kg',

    -- Supplier link
    supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,

    -- Pricing
    price_per_unit DECIMAL(12,2),

    -- Stock alerts
    min_stock_alert DECIMAL(12,2) DEFAULT 0,
    reorder_point DECIMAL(12,2) DEFAULT 0,

    -- Barcode for scanning
    barcode VARCHAR(100),

    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- suppliers: nhà cung cấp (EXPANDED)
-- ============================================
CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,

    -- Contact
    contact_name VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    website VARCHAR(200),

    -- Address
    address TEXT,
    city VARCHAR(100),
    tax_id VARCHAR(50),          -- Mã số thuế

    -- Bank info
    bank_name VARCHAR(100),
    bank_account VARCHAR(50),
    bank_account_holder VARCHAR(200),

    -- Business
    categories TEXT[],           -- ARRAY['feed', 'medication', 'equipment']
    lead_time_days INT DEFAULT 7,
    payment_terms VARCHAR(50),   -- 'net30', 'cod', 'prepaid'

    note TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- feed_brands: hãng thức ăn (links to products)
-- FIX: product_id → products (central catalog)
-- ============================================
CREATE TABLE feed_brands (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,  -- FIX: link to products
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    kg_per_bag DECIMAL(5,2),
    manufacturer VARCHAR(200),
    country_of_origin VARCHAR(100),
    note TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- feed_types: loại thức ăn (links to feed_brand + products)
-- FIX: product_id links to inventory, warehouse_id knows which warehouse
-- ============================================
CREATE TABLE feed_types (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,  -- central catalog item
    feed_brand_id INT REFERENCES feed_brands(id) ON DELETE SET NULL,

    code VARCHAR(50),
    name VARCHAR(200) NOT NULL,

    -- Pricing (can differ from product price if repackaged)
    price_per_bag DECIMAL(10,2),

    -- Nutritional info
    protein_pct DECIMAL(5,2),
    energy_kcal_kg DECIMAL(10,2),

    -- Stage
    suggested_stage VARCHAR(20),  -- 'starter' | 'grower' | 'finisher'
    bird_type VARCHAR(50),        -- 'broiler' | 'layer' | 'breeder'

    -- Packaging
    bag_size_kg DECIMAL(5,2),

    -- Storage
    shelf_life_months INT,
    storage_requirements TEXT,

    note TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- medications: danh mục thuốc (links to products)
-- FIX: product_id → products (central catalog)
-- ============================================
CREATE TABLE medications (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,  -- FIX: link to products

    code VARCHAR(50) UNIQUE,
    name VARCHAR(200) NOT NULL,

    -- Classification
    medication_type VARCHAR(50),  -- 'antibiotic' | 'vaccine' | 'vitamin' | 'disinfectant'
    category VARCHAR(50),
    active_ingredient VARCHAR(200),
    manufacturer VARCHAR(200),
    country_of_origin VARCHAR(100),

    -- Dosage
    unit VARCHAR(20),             -- 'ml', 'g', 'tablet', 'dose'
    concentration VARCHAR(50),    -- '500mg/ml', '10%'

    -- Usage
    recommended_dose TEXT,
    route_of_administration VARCHAR(50),  -- 'oral' | 'injection' | ' Drinking water'
    withdrawal_days INT,         -- Ngày ngừng thuốc trước giết mổ

    -- Storage
    storage_conditions TEXT,
    shelf_life_months INT,

    -- Cost
    price_per_unit DECIMAL(12,2),

    note TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- vaccine_programs: chương trình tiêm vaccine
-- ============================================
CREATE TABLE vaccine_programs (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,

    bird_type VARCHAR(50),        -- 'broiler' | 'layer' | 'breeder'
    description TEXT,
    note TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- vaccine_program_items: chi tiết từng mũi tiêm
-- FIX: product_id → medications(id) → products(id) → inventory
-- FIX: cascade protection
-- ============================================
CREATE TABLE vaccine_program_items (
    id SERIAL PRIMARY KEY,
    program_id INT REFERENCES vaccine_programs(id) ON DELETE CASCADE,

    product_id INT REFERENCES medications(id) ON DELETE SET NULL,  -- FIX: link to medication

    vaccine_name VARCHAR(200) NOT NULL,
    day_age INT NOT NULL,
    method VARCHAR(50),           -- 'injection' | 'eye_drop' | 'drinking_water' | 'spray'
    route VARCHAR(50),           -- 'subcutaneous' | 'intramuscular' | 'oral'

    dose_per_bird VARCHAR(50),
    dilution TEXT,

    remind_days INT DEFAULT 1,
    sort_order INT DEFAULT 0,

    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- equipment_types: loại thiết bị (for IoT equipment, NOT consumable equipment)
-- NOTE: Consumable equipment (rakes, sprayers) → products table
-- FIX: mqtt_protocol JSONB describes command/telemetry structure
-- ============================================
CREATE TABLE equipment_types (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id) ON DELETE SET NULL,  -- optional: if it's also a purchasable item

    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,

    -- Physical specs
    power_watts INT,
    voltage_v INT,
    current_amp DECIMAL(5,2),

    -- MQTT Protocol Definition (FIX: describe command/telemetry structure)
    mqtt_protocol JSONB,  -- {
                            --   "command_topic": "cfarm/{code}/cmd",
                            --   "telemetry_topic": "cfarm/{code}/telemetry",
                            --   "command_format": {"relay": [0-7], "pwm": {"ch": 0-7, "val": 0-255}},
                            --   "telemetry_format": {"temp": "float", "humidity": "float"},
                            --   "heartbeat_topic": "cfarm/{code}/heartbeat",
                            --   "heartbeat_interval_sec": 30
                            -- }

    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- device_types: loại thiết bị IoT (ESP32, PLC, Sensor hub...)
-- FIX: mqtt_protocol JSONB for device communication
-- ============================================
CREATE TABLE device_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,

    device_class VARCHAR(20),     -- 'relay' | 'sensor' | 'mixed' | 'gateway'
    channel_count INT DEFAULT 0,

    -- MQTT Protocol Definition (FIX: describes how to communicate)
    mqtt_protocol JSONB,  -- {
                            --   "broker_host": "string",
                            --   "broker_port": 1883,
                            --   "username": "string",
                            --   "command_topic": "cfarm/{code}/cmd",
                            --   "telemetry_topic": "cfarm/{code}/telemetry",
                            --   "heartbeat_topic": "cfarm/{code}/heartbeat",
                            --   "command_format": {"relay": {"ch": 0-7, "val": 0|1}, "pwm": {"ch": 0-7, "val": 0-255}},
                            --   "telemetry_format": {"temperature": "float", "humidity": "float", "nh3": "float"},
                            --   "heartbeat_interval_sec": 30,
                            --   "ping_fail_threshold": 3
                            -- }

    -- Firmware
    firmware_version VARCHAR(50),
    firmware_url VARCHAR(500),

    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- curtain_configs: cấu hình bạt cuốn
-- ============================================
CREATE TABLE curtain_configs (
    id SERIAL PRIMARY KEY,
    curtain_code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    barn_id VARCHAR(50) REFERENCES barns(id) ON DELETE SET NULL,

    -- Physical
    width_m DECIMAL(5,2),
    height_m DECIMAL(5,2),
    fabric_type VARCHAR(50),       -- 'mesh' | 'solid' | 'polyethylene'

    -- Motor control
    motor_power_watts INT,
    device_id INT REFERENCES devices(id) ON DELETE SET NULL,
    up_channel INT NOT NULL,
    down_channel INT NOT NULL,

    -- Timing
    full_up_seconds FLOAT DEFAULT 60,
    full_down_seconds FLOAT DEFAULT 60,

    -- Position
    current_position INT DEFAULT 0 CHECK (current_position BETWEEN 0 AND 100),

    -- Auto control
    auto_control_enabled BOOLEAN DEFAULT FALSE,
    min_position INT DEFAULT 0,
    max_position INT DEFAULT 100,
    wind_speed_max_kmh DECIMAL(5,2),  -- auto cuốn lên khi gió quá mạnh

    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CASCADE PROTECTION: Add FK constraints to protect orphan data
-- ============================================

-- feed_brands.product_id already has ON DELETE CASCADE
-- feed_types.product_id already has ON DELETE CASCADE
-- medications.product_id already has ON DELETE CASCADE

-- Additional FK protections:
-- inventory.product_id has FK → products (via products FK)
-- inventory_transactions.product_id has FK → products (via products FK)
-- care_medications.product_id has FK → medications (→ products)
-- care_feeds.feed_type_id has FK → feed_types (→ products)
-- inventory_transactions.feed_type_id has FK → feed_types (→ products)
```

---

## Sync Infrastructure

### Current State (Issues)

| Issue | Severity | Description |
|-------|----------|-------------|
| Missing 18 pull handlers | 🔴 HIGH | farms, warehouses, products, equipment, sensor tables, care tables |
| Field mapping scattered | 🟡 MEDIUM | Each handler manually maps Local↔Cloud fields |
| No retry mechanism | 🔴 HIGH | Failed push items stay synced=FALSE forever |
| No conflict resolution | 🟡 MEDIUM | Last-write-wins, no version checking |
| Sensor sync separate loop | 🟡 MEDIUM | Runs every 5 cycles, not integrated with push_to_cloud |
| No locking | 🔴 HIGH | Concurrent syncs can corrupt queue |
| No priority queue | 🟡 MEDIUM | Care records should sync before sensor data |

### Redesigned Sync Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SYNC LAYER                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  queue_change() ──→ sync_queue ──→ _sync_loop()            │
│       │                   │               │                 │
│       │            priority queue        ├── push_to_cloud()│
│       │            retry_count          ├── pull_from_cloud │
│       │            version/lock          └── sensor_sync()  │
│                                                             │
│  FieldMapper: centralized Local ↔ Cloud field name mapping  │
│  ConflictResolver: version-based last-write-wins           │
│  RetryQueue: exponential backoff for failed items          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Redesigned sync_queue (FIX issues)

```sql
CREATE TABLE sync_queue (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    action VARCHAR(20) NOT NULL,  -- 'insert' | 'update' | 'delete'
    payload JSONB NOT NULL,

    -- Priority (higher = pushed first)
    priority INT DEFAULT 5,  -- 1=low(sensor), 5=normal, 10=high(care/command)

    -- Retry mechanism
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 5,
    last_error TEXT,
    next_retry_at TIMESTAMPTZ,

    -- Version for conflict resolution
    local_version INT DEFAULT 1,
    synced_version INT DEFAULT 0,

    -- Status
    synced BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

-- Pending items with retry logic
CREATE INDEX idx_sync_pending ON sync_queue (synced, priority DESC, created_at)
    WHERE NOT synced;

-- Items ready for retry (backoff elapsed)
CREATE INDEX idx_sync_retry ON sync_queue (next_retry_at, retry_count)
    WHERE NOT synced AND retry_count > 0;

-- Prevent concurrent sync processes
CREATE TABLE sync_lock (
    lock_name VARCHAR(50) PRIMARY KEY,
    locked_by VARCHAR(100),
    locked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);
```

### Sync Direction: ALL 65 Tables

#### PULL Handlers (Cloud → Local) — 18 existing + 18 missing = 36

**EXISTING (18):**
```
_sync_barns, _sync_cycles, _sync_cycle_splits,
_sync_feed_brands, _sync_feed_types, _sync_medications,
_sync_suppliers, _sync_vaccine_programs, _sync_vaccine_program_items,
_sync_vaccine_schedules,
_sync_care_feeds, _sync_care_deaths, _sync_care_medications,
_sync_weight_sessions, _sync_care_sales, _sync_health_notes,
_sync_devices, _sync_firmwares, _sync_notification_rules
```

**MISSING PULL (18) — Add:**
```
_sync_farms                    -- farms table
_sync_warehouses               -- warehouses table
_sync_warehouse_zones          -- warehouse_zones
_sync_products                 -- products central catalog
_sync_inventory                -- inventory
_sync_inventory_transactions   -- inventory_transactions
_sync_inventory_alerts         -- inventory_alerts
_sync_inventory_snapshots      -- inventory_snapshots
_sync_stock_valuation          -- stock_valuation
_sync_purchase_orders           -- purchase_orders
_sync_purchase_order_items      -- purchase_order_items
_sync_equipment                -- equipment (IoT equipment)
_sync_equipment_parts           -- equipment_parts
_sync_equipment_readings       -- equipment_readings
_sync_equipment_performance     -- equipment_performance
_sync_sensors                  -- sensors
_sync_sensor_alerts            -- sensor_alerts
_sync_sensor_daily_summary     -- sensor_daily_summary
_sync_sensor_threshold_configs -- sensor_threshold_configs
_sync_sensor_calibrations      -- sensor_calibrations
_sync_sensor_maintenance_log   -- sensor_maintenance_log
_sync_weight_reminders         -- weight_reminders
_sync_care_expenses            -- care_expenses
_sync_care_litters             -- care_litters
_sync_feed_trough_checks      -- feed_trough_checks
_sync_cycle_feed_programs      -- cycle_feed_programs
_sync_cycle_feed_program_items -- cycle_feed_program_items
_sync_cycle_feed_stages       -- cycle_feed_stages
_sync_device_channels         -- device_channels
_sync_device_states           -- device_states
_sync_device_state_log        -- device_state_log
_sync_device_commands         -- device_commands
_sync_device_telemetry        -- device_telemetry
_sync_device_alerts           -- device_alerts
_sync_device_config_versions  -- device_config_versions
_sync_equipment_assignment_log -- equipment_assignment_log
_sync_equipment_command_log   -- equipment_command_log
_sync_curtain_configs         -- curtain_configs
_sync_sensor_types            -- sensor_types
```

#### PUSH Handlers (Local → Cloud) — Queue only, handled by generic push_to_cloud()

All tables that queue changes use `queue_change()` which pushes via generic handler.
No separate push handler needed — cloud `/api/sync/receive` dispatches by table_name.

**Tables that queue changes (PUSH):**
- Care operations: care_feeds, care_deaths, care_medications, care_sales, care_weights
- Cycle changes: cycles, cycle_splits, cycle_feed_programs, cycle_feed_stages
- Device: devices, device_states, device_state_log, device_commands, device_channels
- Inventory: inventory_transactions, warehouses
- Farm: farms, barns
- Sensor: sensor_data (via batch), sensors, sensor_alerts

### Field Mapping System (FIX: centralized)

```python
class FieldMapper:
    """Centralized Local ↔ Cloud field name mapping."""

    # Format: cloud_field: local_field
    MAPS = {
        "care_feeds": {
            "session": "meal",
            "bags": "bags",
            "kg_actual": "kg_actual",
            "remaining_pct": "remaining_pct",
        },
        "care_deaths": {
            "quantity": "count",
            "reason": "cause",
        },
        "care_medications": {
            "medication_id": "product_id",
        },
        "care_sales": {
            "quantity": "count",
            "weight_kg": "total_weight",
            "price_per_kg": "unit_price",
        },
        "cycles": {
            "initial_quantity": "initial_count",
            "current_quantity": "current_count",
            "end_date": "actual_end_date",
        },
        # Add all mappings here
    }

    @classmethod
    def to_cloud(cls, table: str, payload: dict) -> dict:
        """Convert Local → Cloud field names."""
        mapping = cls.MAPS.get(table, {})
        result = {}
        for k, v in payload.items():
            # Find cloud name (reverse mapping)
            cloud_name = next((ck for ck, cl in mapping.items() if cl == k), k)
            result[cloud_name] = v
        return result

    @classmethod
    def to_local(cls, table: str, payload: dict) -> dict:
        """Convert Cloud → Local field names."""
        mapping = cls.MAPS.get(table, {})
        result = {}
        for k, v in payload.items():
            local_name = mapping.get(k, k)
            result[local_name] = v
        return result
```

### Retry Mechanism (FIX: no retry)

```python
async def push_to_cloud(self):
    """Push with retry and exponential backoff."""
    # 1. Acquire lock to prevent concurrent pushes
    if not await self._acquire_lock("push", ttl=30):
        logger.warning("Push already in progress, skipping")
        return 0

    try:
        # 2. Get items: retry-ready first, then oldest pending
        items = await self.get_retry_queue(self.config["push_batch_size"])
        if not items:
            return 0

        # 3. Group by table for batching
        batches = self._batch_by_table(items)

        # 4. Push with retry logic
        for batch in batches:
            try:
                await self._push_batch(batch)
            except Exception as e:
                # Mark retry with backoff
                await self._schedule_retry(batch, error=str(e))

        await self.mark_synced([i["id"] for i in items])
        return len(items)
    finally:
        await self._release_lock("push")

async def get_retry_queue(self, limit: int) -> list[dict]:
    """Get items ready for retry (backoff elapsed) OR new items."""
    rows = await db.fetch("""
        SELECT * FROM sync_queue
        WHERE synced = FALSE
        AND (
            retry_count = 0  -- never tried
            OR (retry_count > 0 AND next_retry_at <= NOW())  -- backoff elapsed
        )
        ORDER BY priority DESC, created_at ASC
        LIMIT $1
    """, limit)
    return [dict(r) for r in rows]

async def _schedule_retry(self, items: list, error: str):
    """Schedule retry with exponential backoff."""
    for item in items:
        retry_count = item["retry_count"] + 1
        # Exponential backoff: 1min, 2min, 4min, 8min, 16min
        backoff_seconds = 60 * (2 ** retry_count)
        await db.execute("""
            UPDATE sync_queue SET
                retry_count = $1,
                last_error = $2,
                next_retry_at = NOW() + (interval '1 second' * $3)
            WHERE id = $4
        """, retry_count, error, backoff_seconds, item["id"])
```

### Conflict Resolution (FIX: last-write-wins)

```python
class ConflictResolver:
    """Version-based conflict resolution for sync."""

    @classmethod
    async def resolve(cls, table: str, record_id: str,
                      local_payload: dict, cloud_payload: dict) -> dict:
        """
        Compare versions, return winning payload.
        Strategy: highest version wins.
        If equal version: newest created_at wins.
        """
        local_ver = local_payload.get("_version", 1)
        cloud_ver = cloud_payload.get("_version", 0)

        if cloud_ver > local_ver:
            return cloud_payload  # Cloud wins
        elif local_ver > cloud_ver:
            return local_payload   # Local wins
        else:
            # Equal version: newest timestamp wins
            local_ts = local_payload.get("updated_at", "1970-01-01")
            cloud_ts = cloud_payload.get("updated_at", "1970-01-01")
            return local_payload if local_ts > cloud_ts else cloud_payload
```

Every table gets `_version` field (auto-increment on update):
```sql
ALTER TABLE {table} ADD COLUMN _version INT DEFAULT 1;
CREATE TRIGGER trg_version
    BEFORE UPDATE ON {table}
    FOR EACH ROW EXECUTE FUNCTION increment_version();
```

### Sync Lock (FIX: no locking)

```python
async def _acquire_lock(self, lock_name: str, ttl: int = 30) -> bool:
    """Acquire distributed sync lock."""
    try:
        result = await db.execute("""
            INSERT INTO sync_lock (lock_name, locked_by, locked_at, expires_at)
            VALUES ($1, $2, NOW(), NOW() + (interval '1 second' * $3))
            ON CONFLICT (lock_name) DO UPDATE
            SET locked_by = EXCLUDED.locked_by,
                locked_at = EXCLUDED.locked_at,
                expires_at = EXCLUDED.expires_at
            WHERE sync_lock.expires_at <= NOW()
                OR sync_lock.locked_by = EXCLUDED.locked_by
        """, lock_name, self._process_id, ttl)
        return "INSERT" in result or "UPDATE" in result
    except Exception:
        return False

async def _release_lock(self, lock_name: str):
    """Release sync lock."""
    await db.execute("""
        DELETE FROM sync_lock
        WHERE lock_name = $1 AND locked_by = $2
    """, lock_name, self._process_id)
```

### Priority Queue (FIX: no priority)

| Priority | Tables |
|----------|--------|
| 10 (HIGH) | device_commands, care_feeds, care_deaths, care_medications, care_sales |
| 5 (NORMAL) | cycles, farms, barns, warehouses, equipment |
| 1 (LOW) | sensor_data, sensor_alerts, device_telemetry |

```python
PRIORITY_MAP = {
    "device_commands": 10,
    "care_feeds": 10, "care_deaths": 10, "care_medications": 10, "care_sales": 10,
    "cycles": 5, "farms": 5, "barns": 5, "warehouses": 5, "equipment": 5,
    "devices": 5, "device_states": 5,
    "sensor_data": 1, "sensor_alerts": 1, "device_telemetry": 1,
}
```

### Sensor Sync Integration (FIX: separate loop)

```python
# REMOVE separate sensor_sync.push_sensor_summary() call
# INTEGRATE into push_to_cloud() as a batch item:

async def push_to_cloud(self):
    # ... existing queue push ...

    # Also push sensor batch as LOW priority item
    sensor_batch = await self._get_sensor_batch()
    if sensor_batch:
        await self.cloud_request("POST", "/api/sync/receive", {
            "source": "local",
            "items": sensor_batch,
            "priority": 1,
        })

# _sync_loop: Remove special case for sensor sync
async def _sync_loop(self):
    while self._running:
        await self.push_to_cloud()      # includes sensor batch now
        await self.pull_from_cloud()
        await asyncio.sleep(self.config["sync_interval"])
```

---

## Sync Direction Summary

| Entity | Local → Cloud | Cloud → Local | Notes |
|--------|---------------|---------------|-------|
| farms | ✅ Push | ✅ Pull | New entity |
| barns | ✅ Push | ✅ Pull | Full field sync |
| cycles | ✅ Push | ✅ Pull | |
| device_types | ✅ Push | ✅ Pull | Seed data |
| devices | ✅ Push (heartbeat) | ✅ Pull | Auto-create from heartbeat |
| device_channels | ✅ Push | ✅ Pull | → Equipment FK |
| device_states | ✅ Push | ✅ Pull | |
| device_state_log | ✅ Push | ✅ Pull | |
| device_commands | ✅ Push | ✅ Pull | |
| device_telemetry | ✅ Push | ✅ Pull | [NEW] |
| device_alerts | ✅ Push | ✅ Pull | [NEW] |
| device_config_versions | ✅ Push | ✅ Pull | [NEW] |
| equipment_assignment_log | ✅ Push | ✅ Pull | |
| equipment_command_log | ✅ Push | ✅ Pull | |
| warehouses | ✅ Push | ✅ Pull | Central + barn-specific |
| warehouse_zones | ✅ Push | ✅ Pull | [NEW] |
| products | ✅ Push | ✅ Pull | [NEW] |
| inventory | ✅ Push | ✅ Pull | |
| inventory_transactions | ✅ Push | ✅ Pull | Side-effect from care ops |
| inventory_snapshots | ✅ Push | ✅ Pull | [NEW] |
| inventory_alerts | ✅ Push | ✅ Pull | [NEW] |
| suppliers | ✅ Push | ✅ Pull | Bidirectional |
| purchase_orders | ✅ Push | ✅ Pull | [NEW] |
| purchase_order_items | ✅ Push | ✅ Pull | [NEW] |
| stock_valuation | ✅ Push | ✅ Pull | [NEW] |
| equipment | ✅ Push | ✅ Pull | |
| equipment_parts | ✅ Push | ✅ Pull | [NEW] |
| equipment_readings | ✅ Push | ✅ Pull | [NEW] |
| equipment_performance | ✅ Push | ✅ Pull | [NEW] |
| sensor_data | ✅ Push | ✅ Pull | All sensor types |
| sensor_types | ✅ Push | ✅ Pull | [NEW] |
| sensors | ✅ Push | ✅ Pull | [NEW] Physical sensors |
| sensor_alerts | ✅ Push | ✅ Pull | [NEW] |
| sensor_daily_summary | ✅ Push | ✅ Pull | [NEW] |
| sensor_threshold_configs | ✅ Push | ✅ Pull | [NEW] |
| sensor_calibrations | ✅ Push | ✅ Pull | [NEW] |
| sensor_maintenance_log | ✅ Push | ✅ Pull | [NEW] |
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
| feed_brands | ❌ (cloud master) | ✅ Pull | Cloud source → product_id FK |
| feed_types | ❌ (cloud master) | ✅ Pull | Cloud source → product_id FK |
| medications | ❌ (cloud master) | ✅ Pull | Cloud source → product_id FK |
| suppliers | ❌ (cloud master) | ✅ Pull | Cloud source, EXPANDED fields |
| products | ❌ (cloud master) | ✅ Pull | Cloud source, central catalog |
| vaccine_programs | ❌ (cloud master) | ✅ Pull | Cloud source |
| vaccine_program_items | ❌ (cloud master) | ✅ Pull | Cloud source → product_id FK |
| equipment_types | ❌ (cloud master) | ✅ Pull | Cloud source, [NEW] MQTT JSONB |
| device_types | Seed data | Seed data | MQTT protocol JSONB |
| curtain_configs | ✅ Push | ✅ Pull | |

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