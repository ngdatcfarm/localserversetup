# CFarm Data Hierarchy Tree

## Root Level

### 🏠 FARM (`farms`)
> Top-level entity. All other entities belong to a farm.

```
farms
├── id (PK): string (e.g., "farm-01")
├── name: string
├── address: string
├── contact_name, contact_phone, contact_email: string
├── notes: string
├── active: boolean
└── created_at, updated_at: timestamp
```

**Children:**
- Barns
- Warehouses (optional, can also belong directly to Barn)

**No parent.** This is a root entity.

---

## Level 1 - Primary Children of Farm

### 🏠 BARN (`barns`)
> A physical barn/poultry house. Belongs to one Farm.

```
barns
├── id (PK): string (e.g., "barn-01")
├── name: string
├── farm_id (FK): → farms.id
├── capacity: integer (max birds)
├── area_sqm: float
├── description: string
├── active: boolean
└── created_at, updated_at: timestamp
```

**Children:**
- Cycles
- Devices
- Bats
- Equipment
- Sensors
- Warehouses (optional, can also belong to Farm)

**Parent:** Farm

---

### 📦 WAREHOUSE (`warehouses`)
> Storage location for feed, medicine, equipment. Can belong to Farm or Barn.

```
warehouses
├── id (PK): integer (auto)
├── code: string (e.g., "WH-FEED-01")
├── name: string
├── warehouse_type: enum (feed, medication, equipment, consumable, mixed)
├── barn_id (FK, nullable): → barns.id
├── farm_id (FK, nullable): → farms.id
├── is_central: boolean
├── address: string
├── length_m, width_m, height_m: float
├── capacity_kg: float
├── status: string (active/inactive)
└── created_at, updated_at: timestamp
```

**Children:**
- Inventory
- Warehouse Zones

**Parent:** Farm OR Barn (optional)

---

## Level 2 - Children of Barn

### 🔄 CYCLE (`cycles`)
> A batch of birds raised in a barn. The core operational unit.

```
cycles
├── id (PK): integer (auto)
├── barn_id (FK): → barns.id
├── name: string (e.g., "Đợt 2026-05")
├── breed: string
├── gender: enum (male, female, mixed)
├── initial_count: integer
├── current_count: integer (decreases with death/sale)
├── start_date: date
├── expected_end_date: date
├── actual_end_date: date (nullable)
├── status: enum (active, paused, closed)
├── total_cost: decimal
├── profit: decimal
├── roi_pct: decimal
├── fcr: decimal
├── feed_cost: decimal
├── medicine_cost: decimal
├── other_cost: decimal
└── created_at, updated_at: timestamp
```

**Children:**
- Care Feed Logs (`care_feeds`)
- Care Death Logs (`care_deaths`)
- Care Medication Logs (`care_medications`)
- Care Weight Logs (`care_weights`)
- Care Sale Logs (`care_sales`)
- Care Water Logs (`care_water_logs`)
- Health Notes (`health_notes`)
- Vaccine Schedules (`vaccine_schedules`)
- Weight Reminders (`weight_reminders`) - 1:1
- Cycle Daily Snapshots (`cycle_daily_snapshots`)
- Care Dismissals (`care_dismissals`)

**Parent:** Barn

---

### 📡 DEVICE (`devices`)
> ESP32 physical device installed in a barn.

```
devices
├── id (PK): integer (auto)
├── device_code (UK): string (e.g., "ESP-001")
├── name: string
├── device_type_id (FK): → device_types.id
├── barn_id (FK): → barns.id
├── mqtt_topic: string
├── is_online: boolean
├── last_heartbeat_at: timestamp
├── wifi_rssi: integer
├── firmware_version: string
├── lat: float, lng: float
└── created_at, updated_at: timestamp
```

**Children:**
- Device Channels (`device_channels`)
- Device States (`device_states`)
- Sensors (`sensors`)

**Parent:** Barn

**Sibling:** Bats, Equipment (same level, same parent)

---

### 🪟 BAT (`bats`)
> Ventilation curtain/motor. 4 bats per barn (left_top, left_bottom, right_top, right_bottom).

```
bats
├── id (PK): integer (auto)
├── barn_id (FK): → barns.id
├── name: string (e.g., "Left Top")
├── bat_position: enum (left_top, left_bottom, right_top, right_bottom)
├── device_id (FK, nullable): → devices.id
├── channel_up: integer (relay channel for UP)
├── channel_down: integer (relay channel for DOWN)
├── position: integer (0-100%, 0=closed, 100=fully open)
├── auto_enabled: boolean
├── max_runtime_seconds: integer
├── current_state: enum (stopped, up, down)
└── created_at, updated_at: timestamp
```

**Children:**
- Bat Logs (`bat_logs`)

**Parent:** Barn

---

### ⚙️ EQUIPMENT (`equipment`)
> Farm equipment (feeder, heater, fan, light) assigned to a barn.

```
equipment
├── id (PK): integer (auto)
├── name: string
├── equipment_type_id (FK): → equipment_types.id
├── barn_id (FK): → barns.id
├── device_id (FK, nullable): → devices.id
├── channel_number: integer (nullable)
├── status: enum (active, inactive, maintenance)
├── runtime_hours: decimal
└── created_at, updated_at: timestamp
```

**Children:**
- Equipment Readings (`equipment_readings`)
- Equipment Performance (`equipment_performance`)
- Equipment Command Log (`equipment_command_log`)

**Parent:** Barn

---

### 🌡️ SENSOR (`sensors`)
> Physical sensor connected to a device or barn.

```
sensors
├── id (PK): integer (auto)
├── sensor_type_id (FK): → sensor_types.id
├── barn_id (FK): → barns.id
├── device_id (FK, nullable): → devices.id
├── name: string
├── calibration_date: date
├── calibration_offset: float
├── is_active: boolean
└── created_at, updated_at: timestamp
```

**Children:**
- Sensor Threshold Configs (`sensor_threshold_configs`)
- Sensor Calibrations (`sensor_calibrations`)
- Sensor Maintenance Logs (`sensor_maintenance_log`)
- Sensor Data (`sensor_data`) - TimescaleDB hypertable

**Parent:** Barn or Device

---

## Level 1 - Standalone / Cross-Cutting Entities

### 📦 PRODUCT (`products`)
> Items stored in warehouses (feed, medicine, equipment).

```
products
├── id (PK): integer (auto)
├── code: string (unique)
├── name: string
├── product_type: enum (feed, medicine, equipment, consumable)
├── unit: string (kg, g, ml, piece)
├── supplier_id (FK, nullable): → suppliers.id
├── price_per_unit: decimal
├── min_stock_alert: decimal
├── reorder_point: decimal
├── barcode: string
└── created_at, updated_at: timestamp
```

**Used by:**
- Inventory (via product_id)
- Inventory Transactions (via product_id)
- Care Feed Logs (via product_id)
- Care Medication Logs (via product_id)

**Parent:** Supplier (optional)

---

### 🏭 SUPPLIER (`suppliers`)
> Vendor that provides products.

```
suppliers
├── id (PK): integer (auto)
├── name: string
├── phone: string
├── address: string
├── note: string
├── status: string (active/inactive)
└── created_at, updated_at: timestamp
```

**Children:** Products

---

### 🧪 DEVICE TYPE (`device_types`)
> Template/definition for ESP32 devices.

```
device_types
├── id (PK): integer (auto)
├── code: string (e.g., "relay_4ch", "sensor_mix")
├── name: string (e.g., "4-Channel Relay", "Sensor Mix")
├── channel_count: integer
├── mother_firmware_folder: string (path)
└── created_at, updated_at: timestamp
```

**Children:** Devices

---

### 🔌 SENSOR TYPE (`sensor_types`)
> Template/definition for sensor types.

```
sensor_types
├── id (PK): integer (auto)
├── code: string (e.g., "temperature", "humidity", "mq135")
├── name: string
├── unit: string (e.g., "°C", "%", "ppm")
├── typical_min: float
├── typical_max: float
└── created_at, timestamp
```

**Children:** Sensors

---

### ⚡ EQUIPMENT TYPE (`equipment_types`)
> Template/definition for equipment.

```
equipment_types
├── id (PK): integer (auto)
├── code: string (e.g., "FEEDER_AUTO", "FAN_150W")
├── name: string
├── description: string
├── typical_power_watts: float
└── created_at, timestamp
```

**Children:** Equipment

---

## Level 2 - Children of Warehouse

### 📊 INVENTORY (`inventory`)
> Current stock levels in a warehouse.

```
inventory
├── id (PK): integer (auto)
├── warehouse_id (FK): → warehouses.id
├── product_id (FK): → products.id
├── quantity: decimal
├── last_updated: timestamp
└── (unique constraint on warehouse_id + product_id)
```

**Parent:** Warehouse

**References:** Product

**No direct children**, but generates:
- Inventory Transactions

---

### 🗺️ WAREHOUSE ZONE (`warehouse_zones`)
> Subdivision within a warehouse.

```
warehouse_zones
├── id (PK): integer (auto)
├── warehouse_id (FK): → warehouses.id
├── name: string
├── zone_type: string (e.g., "shelf_a", "floor")
└── created_at, timestamp
```

**Parent:** Warehouse

---

## Level 3 - Children of Cycle (Care Operations)

### 🌾 CARE FEED (`care_feeds`)
> Feed consumption logging.

```
care_feeds
├── id (PK): integer (auto)
├── cycle_id (FK): → cycles.id
├── barn_id (FK): → barns.id
├── feed_date: date
├── meal: enum (sang, trua, chieu, toi, all_day)
├── product_id (FK, nullable): → products.id
├── quantity: decimal (kg)
├── remaining: decimal (nullable)
├── warehouse_id (FK, nullable): → warehouses.id
├── bag_count: integer (nullable)
├── notes: string
└── recorded_at: timestamp
```

**Side Effect:** Decrements inventory when warehouse_id provided.

**Parent:** Cycle

---

### 💀 CARE DEATH (`care_deaths`)
> Mortality logging.

```
care_deaths
├── id (PK): integer (auto)
├── cycle_id (FK): → cycles.id
├── barn_id (FK): → barns.id
├── death_date: date
├── count: integer
├── cause: enum (disease, predator, heat, cold, other)
├── symptoms: string
├── shift: enum (sang, chieu)
├── notes: string
├── image_path: string (nullable)
├── health_note_id (FK, nullable): → health_notes.id
└── recorded_at: timestamp
```

**Side Effect:** Decrements cycles.current_count.

**Parent:** Cycle

---

### 💊 CARE MEDICATION (`care_medications`)
> Medication/vaccine administration logging.

```
care_medications
├── id (PK): integer (auto)
├── cycle_id (FK): → cycles.id
├── barn_id (FK): → barns.id
├── med_date: date
├── med_type: enum (vaccine, medicine, antibiotic, vitamin, probiotic)
├── product_id (FK, nullable): → products.id
├── custom_name: string (nullable)
├── quantity: decimal
├── unit: string
├── method: string (water, injection, spray)
├── warehouse_id (FK, nullable): → warehouses.id
├── purpose: string
├── shift: enum (sang, chieu)
├── notes: string
└── recorded_at: timestamp
```

**Side Effect:** Decrements inventory when warehouse_id provided.

**Parent:** Cycle

---

### ⚖️ CARE WEIGHT (`care_weights`)
> Weight sampling records.

```
care_weights
├── id (PK): integer (auto)
├── cycle_id (FK): → cycles.id
├── barn_id (FK): → barns.id
├── weigh_date: date
├── sample_count: integer
├── total_weight: decimal (kg)
├── avg_weight: decimal (computed g/bird)
├── min_weight: decimal
├── max_weight: decimal
├── uniformity: decimal
├── day_age: integer
└── recorded_at: timestamp
```

**Parent:** Cycle

---

### 💰 CARE SALE (`care_sales`)
> Bird sales logging.

```
care_sales
├── id (PK): integer (auto)
├── cycle_id (FK): → cycles.id
├── barn_id (FK): → barns.id
├── sale_date: date
├── count: integer
├── total_weight: decimal
├── avg_weight: decimal
├── unit_price: decimal
├── total_amount: decimal
├── buyer: string
├── sale_type: enum (sale, cull)
└── recorded_at: timestamp
```

**Side Effect:** Decrements cycles.current_count.

**Parent:** Cycle

---

### 💧 CARE WATER (`care_water_logs`)
> Water consumption logging.

```
care_water_logs
├── id (PK): integer (auto)
├── cycle_id (FK): → cycles.id
├── barn_id (FK): → barns.id
├── water_date: date
├── consumption_liters: decimal
├── medicated: boolean
├── shift: enum (sang, chieu)
├── notes: string
└── recorded_at: timestamp
```

**Parent:** Cycle

---

### 🩺 HEALTH NOTE (`health_notes`)
> Health observation notes.

```
health_notes
├── id (PK): integer (auto)
├── cycle_id (FK): → cycles.id
├── barn_id (FK): → barns.id
├── recorded_at: timestamp
├── day_age: integer
├── severity: enum (normal, mild, severe)
├── symptoms: string
├── health_flags: string[] (cough, diarrhea, lethargy, respiratory)
├── notes: string
└── resolved: boolean
```

**Parent:** Cycle

---

### 💉 VACCINE SCHEDULE (`vaccine_schedules`)
> Scheduled vaccination for a cycle.

```
vaccine_schedules
├── id (PK): integer (auto)
├── cycle_id (FK): → cycles.id
├── vaccine_name: string
├── scheduled_date: date
├── day_age_target: integer
├── method: string
├── dosage: string
├── program_item_id (FK, nullable): → vaccine_program_items.id
├── vaccine_brand_id (FK, nullable): → feed_brands.id (reuse)
├── done: boolean
├── done_at: timestamp (nullable)
├── skipped: boolean
├── skipped_reason: string (nullable)
├── notified_at: timestamp (nullable)
├── remind_days: integer
└── created_at: timestamp
```

**Parent:** Cycle

---

### 📅 WEIGHT REMINDER (`weight_reminders`)
> Periodic weight reminder settings. 1:1 with Cycle.

```
weight_reminders
├── cycle_id (PK): → cycles.id
├── interval_days: integer (default 7)
├── enabled: boolean
├── last_reminder: timestamp
├── next_reminder: timestamp
└── created_at, updated_at: timestamp
```

**Parent:** Cycle (1:1)

---

### 📊 CYCLE DAILY SNAPSHOT (`cycle_daily_snapshots`)
> Daily aggregated data for a cycle.

```
cycle_daily_snapshots
├── id (PK): integer (auto)
├── cycle_id (FK): → cycles.id
├── snapshot_date: date
├── day_age: integer
├── alive_count: integer
├── sensor_data: jsonb (avg temp, humidity, gas)
├── care_summary: jsonb (feed_kg, death_count, med_count)
├── weight_data: jsonb (avg_weight, sample_count)
├── alerts: jsonb (any triggered alerts)
└── created_at: timestamp
```

**Parent:** Cycle

---

## Level 2 - Children of Device

### 🔌 DEVICE CHANNEL (`device_channels`)
> Relay channel configuration on a device.

```
device_channels
├── device_id (PK, FK): → devices.id
├── channel_number (PK): integer
├── function: string (e.g., "feed_motor", "water_valve")
├── name: string
├── gpio_pin: integer
└── created_at, updated_at: timestamp
```

**Parent:** Device (composite PK)

---

### 📊 DEVICE STATE (`device_states`)
> Current ON/OFF state of each channel.

```
device_states
├── device_id (PK, FK): → devices.id
├── channel (PK): integer
├── state: enum (on, off)
├── last_changed: timestamp
└── updated_at: timestamp
```

**Parent:** Device (composite PK)

---

### 📈 SENSOR DATA (`sensor_data`) - TimescaleDB
> Time-series sensor readings.

```
sensor_data (hypertable)
├── time (PK): timestamp
├── device_id (PK): → devices.id
├── sensor_type (PK): string
├── value: decimal
├── unit: string
├── barn_id (FK): → barns.id
├── cycle_id (FK, nullable): → cycles.id
├── quality: string (good/suspect/bad)
└── INDEX: (device_id, sensor_type, time DESC)
```

**Parent:** Device (via device_id)

**Note:** TimescaleDB hypertable with continuous aggregate `sensor_hourly`.

---

## Level 2 - Children of Vaccine Program

### 📋 VACCINE PROGRAM ITEM (`vaccine_program_items`)
> Individual vaccine step in a program.

```
vaccine_program_items
├── id (PK): integer (auto)
├── program_id (FK): → vaccine_programs.id
├── vaccine_name: string
├── day_age: integer (target day age)
├── method: string (eye_drop, injection, drinking_water)
├── vaccine_brand_id (FK, nullable): → feed_brands (reused)
├── remind_days: integer
├── sort_order: integer
└── created_at, updated_at: timestamp
```

**Parent:** Vaccine Program

---

## Level 2 - Children of Feed Brand (reused as vaccine brand)

### 🌾 FEED TYPE (`feed_types`)
> Types of feed under a brand.

```
feed_types
├── id (PK): integer (auto)
├── feed_brand_id (FK): → feed_brands.id
├── code: string
├── name: string
├── price_per_bag: decimal
├── suggested_stage: string (starter, grower, finisher)
├── status: string (active/inactive)
└── created_at, timestamp
```

**Parent:** Feed Brand

---

## Cross-Cutting Entities (No tree parent, or shared)

### 🔔 ALERT (`alerts`)
> Triggered alerts from sensor threshold violations.

```
alerts
├── id (PK): integer (auto)
├── barn_id (FK): → barns.id
├── sensor_id (FK): → sensors.id
├── rule_id (FK): → alert_rules.id
├── severity: enum (info, warning, danger)
├── message: string
├── value: decimal (the reading that triggered)
├── threshold: decimal (the threshold crossed)
├── acknowledged: boolean
├── acknowledged_by: string
├── acknowledged_at: timestamp
└── created_at: timestamp
```

**Parent:** Barn (via barn_id)

---

### ⚡ AUTOMATION RULE (`automation_rules`)
> Schedule or condition-based relay automation.

```
automation_rules
├── id (PK): integer (auto)
├── name: string
├── device_id (FK): → devices.id
├── channel_number: integer
├── rule_type: enum (schedule, condition)
├── cron_expression: string
├── conditions: jsonb
├── enabled: boolean
├── last_triggered: timestamp
└── created_at, updated_at: timestamp
```

**Parent:** Device

---

### 🔧 ALERT RULE (`alert_rules`)
> Threshold configuration for alerts.

```
alert_rules
├── id (PK): integer (auto)
├── sensor_id (FK): → sensors.id
├── name: string
├── min_value: decimal
├── max_value: decimal
├── severity: enum (info, warning, danger)
├── cooldown_minutes: integer
├── enabled: boolean
└── created_at, updated_at: timestamp
```

**Parent:** Sensor

---

### 🤖 AI LOGIC RULE (`ai_logic_rules`)
> Multi-step automation with schedule trigger.

```
ai_logic_rules
├── id (PK): integer (auto)
├── name: string
├── trigger_type: enum (schedule, event)
├── trigger_config: jsonb
├── enabled: boolean
├── last_run: timestamp
└── created_at, updated_at: timestamp
```

**Children:** AI Logic Steps

---

### 📝 AI LOGIC STEP (`ai_logic_steps`)
> Individual step in an AI logic rule.

```
ai_logic_steps
├── id (PK): integer (auto)
├── rule_id (FK): → ai_logic_rules.id
├── step_order: integer
├── action_type: enum (goto_preset, record_video, record_snapshot, wait, stop_recording)
├── config: jsonb (preset_number, duration_seconds, etc.)
└── created_at, timestamp
```

**Parent:** AI Logic Rule

---

## System Entities (No tree structure)

### 🔔 NOTIFICATION (`notification_settings`, `push_subscriptions`, `notification_history`)
> Push notification infrastructure.

```
notification_settings
└── key (PK): string, value: string

push_subscriptions
├── id (PK): integer (auto)
├── endpoint: string (unique)
├── keys_p256dh: string
├── keys_auth: string
├── created_at: timestamp
└── updated_at: timestamp

notification_history
├── id (PK): integer (auto)
├── title: string
├── body: string
├── created_at: timestamp
├── read_at: timestamp (nullable)
```

---

### ☁️ SYNC (`sync_queue`)
> Pending changes for cloud sync.

```
sync_queue
├── id (PK): integer (auto)
├── table_name: string
├── record_id: integer
├── action: enum (insert, update, delete)
├── payload: jsonb
├── synced: boolean
├── created_at: timestamp
```

---

### 🖼️ ML DATASET (`ml_dataset_images`, `ml_dataset_labels`)
> Image dataset for ML training.

```
ml_dataset_images
├── id (PK): integer (auto)
├── camera_id (FK): → cameras.id
├── filepath: string
├── label_status: enum (unlabeled, labeled, verified)
├── captured_at: timestamp
└── created_at: timestamp

ml_dataset_labels
├── id (PK): integer (auto)
├── image_id (FK): → ml_dataset_images.id
├── label: string
├── x_center: decimal
├── y_center: decimal
├── width: decimal
├── height: decimal
└── created_at: timestamp
```

---

## Data Tree Summary

```
FARM (root)
├── BARN
│   ├── CYCLE
│   │   ├── care_feeds
│   │   ├── care_deaths
│   │   ├── care_medications
│   │   ├── care_weights
│   │   ├── care_sales
│   │   ├── care_water_logs
│   │   ├── health_notes
│   │   ├── vaccine_schedules
│   │   ├── weight_reminders (1:1)
│   │   ├── cycle_daily_snapshots
│   │   └── care_dismissals
│   ├── DEVICE
│   │   ├── device_channels
│   │   ├── device_states
│   │   └── sensors
│   │       └── sensor_data (TimescaleDB)
│   ├── BAT
│   │   └── bat_logs
│   ├── EQUIPMENT
│   │   ├── equipment_readings
│   │   ├── equipment_performance
│   │   └── equipment_command_log
│   └── WAREHOUSE (optional)
│       ├── inventory
│       │   └── inventory_transactions
│       └── warehouse_zones
│
├── WAREHOUSE (if central/standalone)
│   ├── inventory
│   │   └── inventory_transactions
│   └── warehouse_zones
│
├── SUPPLIER (standalone)
│   └── products
│
├── DEVICE TYPE (template)
│   └── devices
│
├── SENSOR TYPE (template)
│   └── sensors
│
└── EQUIPMENT TYPE (template)
    └── equipment

ALERT (cross-cutting)
├── alert_rules
│   └── alerts
└── alerts

AUTOMATION (cross-cutting)
└── automation_rules

AI LOGIC (standalone)
└── ai_logic_steps

SYSTEM (standalone)
├── notification_settings
├── push_subscriptions
├── notification_history
├── sync_queue
└── ml_dataset_images
    └── ml_dataset_labels
```

---

## Key Data Dependencies

| Parent Entity | Child Entity | Relationship | Cascade Delete? |
|---------------|--------------|--------------|----------------|
| Farm | Barn | 1:N | Yes |
| Farm | Warehouse (central) | 1:N | Yes |
| Barn | Warehouse | 1:N | Yes |
| Barn | Cycle | 1:N | Yes |
| Barn | Device | 1:N | Yes |
| Barn | Bat | 1:N | Yes |
| Barn | Equipment | 1:N | Yes |
| Barn | Alert | 1:N | No (just FK null) |
| Cycle | Care operations | 1:N | Yes |
| Cycle | Vaccine Schedules | 1:N | Yes |
| Cycle | Weight Reminder | 1:1 | Yes (cascade) |
| Device | Device Channels | 1:N | Yes |
| Device | Device States | 1:N | Yes |
| Device | Sensors | 1:N | Yes |
| Warehouse | Inventory | 1:N | Yes |
| Warehouse | Warehouse Zone | 1:N | Yes |
| Product | Inventory | 1:N | No (FK set null) |
| Supplier | Products | 1:N | No (FK set null) |
| Device Type | Devices | 1:N | No (prevent delete) |
| Equipment Type | Equipment | 1:N | No (prevent delete) |
| Vaccine Program | Program Items | 1:N | Yes |
| Vaccine Program | Vaccine Schedules (applied) | 1:N | No (FK set null) |
| Feed Brand | Feed Types | 1:N | No (prevent delete) |
| AI Logic Rule | AI Logic Steps | 1:N | Yes |

---

## Base Data (Must Exist First)

For system to work, these must be created in order:

### Level 0 - Base Entities (No dependencies)
1. **Farm** - always first
2. **Device Type** - for registering devices
3. **Sensor Type** - for sensor definitions
4. **Equipment Type** - for equipment definitions
5. **Feed Brand** - for feed catalog
6. **Supplier** - for product suppliers

### Level 1 - Requires Base Entities
7. **Barn** - requires Farm
8. **Product** - requires Supplier (optional)
9. **Feed Type** - requires Feed Brand

### Level 2 - Requires Level 1
10. **Warehouse** - requires Farm or Barn
11. **Device** - requires Barn and Device Type
12. **Cycle** - requires Barn

### Level 3 - Operational Data
13. **Inventory** - requires Warehouse and Product
14. **Vaccine Program** - standalone, but needs Vaccine Schedules to apply to Cycle
15. **Sensor** - requires Barn and Sensor Type

### Level 4 - Runtime Data (can be created anytime after Level 2)
- Care operations (feed, death, med, weight, sale, water, health)
- Alerts
- Automation rules
- AI logic rules