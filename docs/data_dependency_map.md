# Data Dependency Map - Local Server

> **Created**: 2026-04-03
> **Updated**: 2026-04-03 - Added Farm as top-level entity
> **Purpose**: Document entity relationships and data flow for hybrid sync planning

---

## Top-Level Entity: `Farm`

**Definition**: The overall farm operation — a single physical farm with multiple barns.

### Farm Table Fields
| Field | Type | Description | Purpose |
|-------|------|-------------|---------|
| `id` | VARCHAR(50) | Primary key (e.g., "farm-01") | Unique identifier |
| `name` | VARCHAR(200) | Farm name (e.g., "Trang trại Vĩnh Thanh") | Human-readable |
| `address` | TEXT | Full address | Location |
| `contact_name` | VARCHAR(100) | Owner/manager name | Contact |
| `contact_phone` | VARCHAR(20) | Phone number | Contact |
| `contact_email` | VARCHAR(100) | Email | Contact |
| `notes` | TEXT | Notes | |
| `active` | BOOLEAN | Farm active status | Soft delete |
| `created_at` | TIMESTAMPTZ | Creation timestamp | Audit |

> **Note**: In current system, Farm entity may not exist as a separate table. Single-farm assumption currently in place. Consider adding `farm_id` to `barns` for multi-farm support.

---

## Entity Above Barn: `Farm` (Parent)

```
Farm (1) ─────< Barn (N)
              └── farm_id FK (implicit — all barns belong to one farm)
```

**Barn is child of Farm** — in current single-farm model, all barns belong to the same farm. For future multi-farm: add `farm_id` column to `barns` table.

---

## Top-Level Entity: `Barn` (under Farm)

**Definition**: A physical chicken coop/housing structure.

### Barn Table Fields
| Field | Type | Description | Purpose |
|-------|------|-------------|---------|
| `id` | VARCHAR(50) | Primary key (e.g., "barn-01") | Unique identifier |
| `name` | VARCHAR(200) | Display name (e.g., "Chuồng 1") | Human-readable label |
| `number` | INT | Ordinal number (1-9) | Sorting/order |
| `capacity` | INT | **Số gà tối đa** có thể chứa (con) | Stocking density |
| `length_m` | DECIMAL(5,2) | Chiều dài (m) | Volume calc, ventilation |
| `width_m` | DECIMAL(5,2) | Chiều rộng (m) | Volume calc, ventilation |
| `height_m` | DECIMAL(5,2) | Chiều cao tường (m) | Volume calc, ventilation |
| `status` | ENUM | 'active' / 'inactive' | Active state |
| `note` | TEXT | Ghi chú | Notes |
| `active` | BOOLEAN | Có đang sử dụng không | Soft delete |
| `created_at` | TIMESTAMPTZ | Creation timestamp | Audit |

### Construction / Investment (CapEx)
| Field | Type | Description | Purpose |
|-------|------|-------------|---------|
| `construction_cost` | DECIMAL(12,2) | Chi phí xây dựng (VND) | Asset valuation, ROI |
| `construction_year` | INT | Năm xây dựng | Depreciation calc |
| `expected_lifespan_years` | INT | Tuổi thọ dự kiến (năm) | Depreciation schedule |
| `construction_type` | VARCHAR(50) | Loại công trình (bê tông/kim loại/gỗ...) | Asset classification |

### Computed Fields (for finance + ventilation)
| Field | Formula | Description |
|-------|---------|-------------|
| `volume_m3` | `length_m × width_m × height_m` | Thể tích barn (m³) |
| `floor_area_sqm` | `length_m × width_m` | Diện tích sàn (m²) |
| `birds_per_m3` | `capacity / volume_m3` | Mật độ nuôi (con/m³) |
| `annual_depreciation` | `construction_cost / expected_lifespan_years` | Khấu hao hàng năm (VND) |
| `depreciation_per_day` | `annual_depreciation / 365` | Khấu hao theo ngày |
| `construction_cost_per_bird` | `construction_cost / capacity` | Chi phí xây/gà |
| `breakeven_cycles` | `construction_cost / avg_profit_per_cycle` | Số chu kỳ hòa vốn |

> **Note**: `barn_id` in `sensor_data` table links sensor readings to the correct barn.

### Current Schema Gap (Local vs Cloud)

| Field | Cloud (MySQL) | Local (PostgreSQL - 003_farm_management.sql) | Sync Status |
|-------|---------------|----------------------------------------------|-------------|
| `number` | ✅ tinyint | ❌ Missing | Cloud→Local sync handles |
| `length_m` | ✅ decimal(5,2) | ❌ Missing | Cloud→Local sync handles |
| `width_m` | ✅ decimal(5,2) | ❌ Missing | Cloud→Local sync handles |
| `height_m` | ✅ decimal(5,2) | ❌ Missing | Cloud→Local sync handles |
| `capacity` | ❌ Not in cloud | ✅ int | Missing (should sync to cloud) |
| `construction_cost` | ❌ Not in cloud | ❌ Missing | **TODO: add to both** |
| `construction_year` | ❌ Not in cloud | ❌ Missing | **TODO: add to both** |
| `expected_lifespan_years` | ❌ Not in cloud | ❌ Missing | **TODO: add to both** |
| `construction_type` | ❌ Not in cloud | ❌ Missing | **TODO: add to both** |
| `area_sqm` | ❌ Not in cloud | ✅ float | Can compute from length×width |
| `description` | ❌ (note exists) | ✅ text | Mapped |

> **Action needed**: Update local `barns` table to include `number`, `length_m`, `width_m`, `height_m` from cloud. Add `construction_cost`, `construction_year`, `lifespan_years` to both schemas.

### Barn Field Groups Summary

| Group | Fields | Purpose |
|-------|--------|---------|
| **Identity** | `id`, `name`, `number` | Basic identification |
| **Physical/Dimension** | `length_m`, `width_m`, `height_m`, `floor_area_sqm`, `volume_m3` | Ventilation, environment calc |
| **Capacity** | `capacity`, `birds_per_m3` | Stocking density |
| **Finance/CapEx** | `construction_cost`, `construction_year`, `expected_lifespan_years`, `construction_type`, `annual_depreciation`, `depreciation_per_day` | Asset tracking, ROI |
| **Status** | `status`, `active`, `note`, `created_at` | Operational state |

---

## Direct Children of Barn

### 1. Cycle (`cycles` table)
- **FK**: `barn_id` → `barns.id`
- **Relationship**: 1 Barn has many Cycles (historical + active)
- **Cardinality**: 1:N (one barn can have multiple cycles over time, but only one `status='active'` at a time)

```
Barn (1) ─────< Cycle (N)
            └── barn_id FK
```

### 2. Device (`devices` table)
- **FK**: `barn_id` → `barns.id`
- **Relationship**: 1 Barn has many Devices (relay controllers, sensors)
- **Cardinality**: 1:N

```
Barn (1) ─────< Device (N)
            └── barn_id FK
```

### 3. Warehouse (`warehouses` table)
- **FK**: `barn_id` → `barns.id` (nullable, barn-level or central warehouse)
- **Relationship**: 1 Barn has many Warehouses (feed仓库, medication仓库)
- **Cardinality**: 1:N (or 0:N if barn_id can be NULL for central warehouses)

```
Barn (1) ─────< Warehouse (N)
            └── barn_id FK (nullable)
```

---

## Children of Cycle

Once a Cycle exists, it becomes the parent for all daily farming operations:

```
Barn ──── Cycle (active) ────< care_feeds
 │                           └── care_deaths
 │                           └── care_medications
 │                           └── care_sales
 │                           └── care_weights (weight_sessions)
 │                           └── weight_reminders
 │                           └── cycle_daily_snapshots
 │                           └── vaccine_schedules
 │                           └── health_notes
```

### Detail: Cycle Children

| Table | FK to Cycle | Description |
|-------|-------------|-------------|
| `care_feeds` | `cycle_id` | Feed log entries (who feeds, how much, when) |
| `care_deaths` | `cycle_id` | Mortality records (count, cause, date) |
| `care_medications` | `cycle_id` | Medication/vaccine administration records |
| `care_sales` | `cycle_id` | Sales records (count sold, weight, price) |
| `care_weights` | `cycle_id` | Weight measurement sessions |
| `weight_reminders` | `cycle_id` | Scheduled weight measurement reminders |
| `cycle_daily_snapshots` | `cycle_id` | Pre-computed daily statistics (alive count, FCR, etc.) |
| `vaccine_schedules` | `cycle_id` | Scheduled vaccine events for this cycle |
| `health_notes` | `cycle_id` | Health observations and notes |

---

## Children of Warehouse

```
Warehouse ────< Inventory (stock levels)
           └──< Inventory_Transactions (all in/out movements)
```

| Table | FK to Warehouse | Description |
|-------|-----------------|-------------|
| `inventory` | `warehouse_id` | Current stock quantity per product |
| `inventory_transactions` | `warehouse_id` | Import/export/transfer history |

---

## Children of Device

```
Device ────< Device_Channels (relay channels)
         └──< Device_States (current on/off state)
         └──< Device_State_Log (state change history)
         └──< Device_Commands (command history)
```

| Table | FK to Device | Description |
|-------|--------------|-------------|
| `device_channels` | `device_id` | Channel configuration (GPIO, function, name) |
| `device_states` | `device_id` | Current state per channel |
| `device_state_log` | `device_id` | State change history (TimescaleDB) |
| `device_commands` | `device_id` | Commands sent to device |

---

## IoT/Sensor Hierarchy (Separate from Barn)

```
Device ────< Sensor_Data (time-series readings)
          └──< Curtain_Configs (if device controls curtains)
```

| Table | FK to Device | Description |
|-------|--------------|-------------|
| `sensor_data` | `device_id` | Time-series sensor readings (TimescaleDB hypertable) |
| `curtain_configs` | `device_id` | Curtain position and timing config |

---

## Reference Data (Independent — not under Farm)

These are master data / lookup tables, not children of Farm/Barn:

| Table | Description | Sync |
|-------|-------------|------|
| `feed_brands` | Feed manufacturers (CP, GreenFeed, etc.) | Cloud→Local (master) |
| `feed_types` | Feed product types per brand (starter, grower, finisher) | Cloud→Local |
| `medications` | Medication/vaccine catalog | Cloud→Local |
| `suppliers` | Feed/medicine vendors | Bidirectional |
| `vaccine_programs` | Program templates (e.g., "Chương trình 1") | Cloud→Local |
| `vaccine_program_items` | Vaccine schedule lines per program | Cloud→Local |
| `device_types` | Device categories (relay_4ch, relay_8ch, sensor) | Seed data |

---

## Sync-Related Tables (Independent)

These tables manage sync state and are not children of any farm entity:

| Table | Purpose |
|-------|---------|
| `sync_queue` | Pending changes to push to cloud |
| `sync_log` | History of sync operations |
| `sync_config` | Sync configuration settings |

---

## Complete Dependency Tree

```
Farm
└── Barn
    ├── Cycle (barn_id)
    │   ├── care_feeds (cycle_id)
    │   ├── care_deaths (cycle_id)
    │   ├── care_medications (cycle_id)
    │   ├── care_sales (cycle_id)
    │   ├── care_weights (cycle_id)
    │   ├── weight_reminders (cycle_id)
    │   ├── cycle_daily_snapshots (cycle_id)
    │   ├── vaccine_schedules (cycle_id)
    │   └── health_notes (cycle_id)
    ├── Device (barn_id)
    │   ├── device_channels (device_id)
    │   ├── device_states (device_id)
    │   ├── device_state_log (device_id)
    │   ├── device_commands (device_id)
    │   ├── sensor_data (device_id)
    │   └── curtain_configs (device_id)
    └── Warehouse (barn_id, nullable)
        ├── inventory (warehouse_id)
        └── inventory_transactions (warehouse_id)

Reference Data (independent, not under Farm):
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

## Field Naming Reference

### care_feeds
| Local Field | Cloud Field | Note |
|-------------|-------------|------|
| `meal` | `session` | Meal time (morning/afternoon/evening/all_day) |
| `quantity` | `quantity` (kg) | Amount in kg |
| `bags` | `bags` | Number of feed bags |
| `kg_actual` | `kg_actual` | Actual kg dispensed |
| `remaining_pct` | `remaining_pct` | % remaining in trough |

### care_deaths
| Local Field | Cloud Field | Note |
|-------------|-------------|------|
| `count` | `quantity` | Number of deaths |
| `cause` | `reason` | Cause of death |

### care_sales
| Local Field | Cloud Field | Note |
|-------------|-------------|------|
| `count` | `quantity` | Number sold |
| `total_weight` | `weight_kg` | Total weight in kg |
| `unit_price` | `price_per_kg` | Price per kg |
| `gender` | `gender` | Male/Female (MISSING in local) |

### care_medications
| Local Field | Cloud Field | Note |
|-------------|-------------|------|
| `product_id` | `medication_id` | Product/medication reference |
| `quantity` | `quantity` | Dosage amount |
| `unit` | `unit` | Unit of measurement (MISSING in local) |

### weight_sessions / care_weights
| Local Field | Cloud Field | Note |
|-------------|-------------|------|
| `weigh_date` | `weighed_at` | Date of weighing |
| `total_weight` | — | Sum of all samples |
| `sample_count` | `sample_count` | Number of birds weighed |
| `avg_weight` | `avg_weight_g` | Average weight in grams |

---

## Sync Direction Summary

| Entity | Local → Cloud | Cloud → Local | Notes |
|--------|----------------|----------------|-------|
| `barns` | ✅ Push on create/update | ✅ Pull on sync | |
| `cycles` | ✅ Push on create/update | ✅ Pull on sync | |
| `devices` | ✅ Push heartbeat states | ✅ Pull on sync | Auto-create from heartbeat |
| `warehouses` | ❌ Not queued | ❌ Not handled | TODO |
| `care_feeds` | ✅ Push via queue_change | ✅ Pull | Field mapping: meal→session |
| `care_deaths` | ✅ Push via queue_change | ✅ Pull | Field mapping: count→quantity, cause→reason |
| `care_medications` | ✅ Push via queue_change | ✅ Pull | Field mapping: product_id→medication_id |
| `care_sales` | ✅ Push via queue_change | ✅ Pull | Field mapping: count→quantity, total_weight→weight_kg, unit_price→price_per_kg |
| `care_weights` | ✅ Push via queue_change | ✅ Pull | |
| `inventory_transactions` | ✅ Push via queue_change | ❌ Not handled | TODO: pull handler needed |
| `cycle_daily_snapshots` | ❌ Not synced | ❌ Not handled | Computed locally, not needed |
| `vaccine_schedules` | ❌ Not queued | ✅ Pull | Created by cloud based on program |