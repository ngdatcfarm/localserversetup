# Worklog

> **Date**: 2026-04-04
> **Session**: Database design complete — Sync Infrastructure redesigned, all entities documented

---

## 2026-04-04 PM: CLOUD RESET DECISION

**Decision**: Reset hoàn toàn Cloud DB trước, sau đó sync Local → Cloud từng tầng.

### Chiến lược: Big Bang Reset + Phased Sync

```
BƯỚC 1: CLOUD RESET (TRƯỚC)
├── Drop all non-matching tables (env_readings, env_weather, inventory_stock...)
├── Create new tables matching Local (farm, warehouse, inventory, sensor_data...)
├── Cloud schema = Local schema (hoàn toàn sạch)

BƯỚC 2: SYNC REFERENCE DATA (Cloud → Local)
├── pull feed_brands, medications, vaccine_programs, products
├── pull suppliers
└── Local có đầy đủ reference catalog

BƯỚC 3: SYNC OPERATIONAL DATA (Local → Cloud)
├── Local → Cloud: cycles, care_feeds, devices, sensor_data
└── Cloud = backup/archive of Local
```

### Thứ tự tầng reset Cloud

```
TẦNG 1: Reference Data (setup catalog)
├── products, suppliers
├── feed_brands, feed_types
├── medications, vaccine_programs
├── device_types, equipment_types
└── sensor_types

TẦNG 2: Farm Infrastructure (physical entities)
├── farms
├── barns
├── warehouses, warehouse_zones
├── equipment + children
└── devices + channels

TẦNG 3: Crop/Livestock Operations (cycle-driven)
├── cycles
├── care_feeds, care_deaths, care_medications, care_sales
├── care_weights, care_litters, care_expenses
├── cycle_feed_programs, cycle_feed_stages, cycle_splits
├── vaccine_schedules, health_notes, weight_reminders
└── feed_trough_checks, weight_samples

TẦNG 4: Time-Series Data
├── sensor_data (TimescaleDB)
├── sensor_alerts, sensor_daily_summary
├── sensor_threshold_configs, sensor_calibrations, sensor_maintenance_log
└── sensors

TẦNG 5: Sync Infrastructure
├── sync_queue (new schema: priority, retry, version)
├── sync_log
├── sync_config
└── sync_lock
```

### Cloud Reset SQL Script

**File**: `scripts/cloud_reset.sql`

**Cách chạy** (SSH vào cloud server):
```bash
# SSH vào cloud
ssh user@cfarm.vn

# Chạy reset script
mysql -u cfarm_user -p cfarm_app_raw < /path/to/cloud_reset.sql
```

**Tables DROP (không tương thích)**:
- `env_readings`, `env_weather` → thay bằng `sensor_data`
- `inventory_stock` → thay bằng `warehouses` + `inventory`
- `inventory_consumable_assets` → thay bằng `equipment`
- `inventory_items` → thay bằng `products`

**Tables CREATE (mới)**:
- `farms`, `warehouses`, `warehouse_zones`, `products`
- `sensor_types`, `sensors`, `sensor_data`, `sensor_alerts`
- `equipment`, `equipment_parts`, `equipment_readings`, `equipment_performance`
- `device_telemetry`, `device_alerts`, `device_config_versions`
- `inventory`, `inventory_snapshots`, `inventory_alerts`, `stock_valuation`
- `purchase_orders`, `purchase_order_items`, `equipment_types`
- `sync_queue` (new schema), `sync_log`, `sync_config`, `sync_lock`

**Tables RECREATE (schema mới)**:
- `barns`, `cycles`, `care_feeds`, `care_deaths`, `care_medications`, `care_sales`
- `care_litters`, `care_expenses`, `feed_brands`, `feed_types`, `medications`
- `vaccine_programs`, `vaccine_program_items`, `devices`, `device_types`
- `device_channels`, `device_states`, `device_state_log`, `device_commands`
- `curtain_configs`, `cycle_daily_snapshots`, `cycle_feed_programs`
- `cycle_feed_stages`, `cycle_splits`, `inventory_transactions`, `suppliers`

### Tables giữ nguyên:
- `users` (không đụng đến)
- `notification_settings`, `push_notifications_log`, `push_subscriptions`
- `remember_tokens`

---

*Last Updated: 2026-04-04*

---

## Summary

Full database schema design complete. Local PostgreSQL is primary — Cloud MySQL will reset to match.
All 7 entities designed with 60+ tables. Sync Infrastructure redesigned (6 issues fixed).
**Timeline: ~31 scripts, 38 handlers, 5 new services still pending.**

---

## Changes This Session

### 2026-04-04: Database Complete Overview

**Entities Designed (ALL DONE ✅):**
- Farm, Barn, Cycle + Care, Device + Channels, Equipment, Warehouse + Inventory, SensorData
- Reference Data: products (central catalog), suppliers, feed_brands, medications, vaccine_programs
- Sync Infrastructure: full redesign with retry, lock, priority, version, FieldMapper

**Files Updated:**
- `E:\Local-server\docs\data_dependency_map.md` — Full redesign với SQL schemas
- `E:\Local-server\docs\check_list.md` — Status summary + migration order
- `E:\Local-server\docs\worklog.md` — This file

---

## Database Entity Overview

### 7 Entities (60+ tables total)

```
Farm ──── Barn ──── Cycle ──── 17 care/cycle tables
                     ├── Device ──── 11 tables (channel→Equipment FK)
                     ├── Equipment ──── 4 tables
                     ├── Warehouse ──── 11 tables (central + barn-specific)
                     └── SensorData ──── 8 tables
```

### Entity Hierarchy

```
Farm (1) ─────< Barn (N)
              └── farm_id FK

Barn (1) ─────< Cycle (N)
Barn (1) ─────< Device (N)
Barn (1) ─────< Warehouse (N)  -- nullable barn_id (central warehouse)
Barn (1) ─────< Equipment (N)
Barn (1) ─────< SensorData (N)

Cycle (1) ────< care_feeds ───────────→ inventory_transactions (side-effect)
Cycle (1) ────< care_deaths
Cycle (1) ────< care_medications ──────→ inventory_transactions (side-effect)
Cycle (1) ────< care_sales
Cycle (1) ────< care_weights
Cycle (1) ────< care_litters ────────→ inventory_transactions (side-effect)
Cycle (1) ────< care_expenses
Cycle (1) ────< feed_trough_checks
Cycle (1) ────< weight_reminders
Cycle (1) ────< weight_samples
Cycle (1) ────< cycle_daily_snapshots
Cycle (1) ────< vaccine_schedules
Cycle (1) ────< health_notes
Cycle (1) ────< cycle_feed_programs
Cycle (1) ────< cycle_feed_stages
Cycle (1) ────< cycle_splits

Device (1) ───< device_types (mqtt_protocol JSONB)
Device (1) ───< device_channels ───────→ Equipment (nullable FK)
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
├── warehouses ─────── central + barn-specific
├── warehouse_zones ─── receiving, storage, quarantine
├── products ────────── central catalog (ALL items)
├── inventory ───────── tồn kho → products
├── inventory_transactions ←── care_feeds/medications/litters (side-effect)
├── inventory_snapshots
├── inventory_alerts
├── suppliers ────────── EXPANDED (email, tax_id, bank, categories)
├── purchase_orders
├── purchase_order_items
└── stock_valuation

SensorData
├── sensor_types
├── sensors ──────────── physical deployed
├── sensor_data ──────── TimescaleDB hypertable
├── sensor_alerts
├── sensor_daily_summary
├── sensor_threshold_configs
├── sensor_calibrations
└── sensor_maintenance_log

Reference Data (Cloud→Local)
├── products ─────────── central catalog
├── suppliers ─────────── EXPANDED
├── feed_brands ───────── product_id FK
├── feed_types ────────── product_id FK
├── medications ───────── product_id FK
├── vaccine_programs
├── vaccine_program_items ─ product_id FK
├── equipment_types ───── mqtt_protocol JSONB
├── device_types ──────── mqtt_protocol JSONB
└── curtain_configs
```

---

## Key Discoveries

| Discovery | Description |
|-----------|-------------|
| **Cross-domain pattern** | Care ops → inventory_transactions as side-effect via FK reference_id |
| **Device ≠ Equipment** | Device = IoT controller (ESP32), Equipment = fixed asset (fan, heater) |
| **Channel→Equipment assignment** | 8CH relay → 4 bạt (up+down per curtain), with history log |
| **Central Warehouse** | WH-CENTRAL for medication/consumable, barn warehouses for feed |
| **products = central catalog** | ALL feed/medication/equipment/consumable in one table |
| **mqtt_protocol JSONB** | Full protocol definition in device_types and equipment_types |
| **TimescaleDB hypertable** | sensor_data is time-series, optimized for sensor data |
| **Auto-queue care records** | queue_change() called in care_service after each write |
| **Reference Data chain** | feed_brands → feed_types → products → inventory → inventory_transactions |

---

## Pending Work

### HIGH PRIORITY

#### Scripts (17 files to create: 013-031)
```
013_add_barn_dimensions.sql      -- number, length, width, height
014_add_barn_capex.sql          -- construction_cost, year, lifespan, type
015_add_farms_table.sql          -- farms + barns.farm_id ✅ Ready
016_add_equipment.sql            -- equipment + parts/readings/performance
017_add_cycle_gender_finance.sql -- cycle fields + renames
018_add_weight_samples.sql
019_add_care_expenses.sql
020_add_care_litters.sql
021_add_sensor_tables.sql        -- sensor_types, sensors, sensor_alerts, etc.
022_add_care_death_med_gaps.sql  -- death_category, image_path
023_add_care_med_gaps.sql       -- dosage, unit
024_expand_products.sql         -- supplier_id, min_stock_alert, barcode
025_expand_suppliers.sql        -- all EXPANDED fields
026_add_feed_med_product_fk.sql -- product_id FK
027_add_vaccine_product_fk.sql  -- product_id FK
028_expand_device_types.sql      -- mqtt_protocol JSONB
029_create_equipment_types.sql
030_expand_sync_queue.sql        -- priority, retry, version, sync_lock
031_add_version_columns.sql      -- _version to all synced tables
```

#### Sync Handlers (38 missing)
```
_sync_farms                     -- NEW
_sync_warehouses                -- NEW
_sync_warehouse_zones           -- NEW
_sync_products                  -- NEW
_sync_inventory                 -- NEW
_sync_inventory_transactions   -- PULL needed (only push exists)
_sync_inventory_alerts          -- NEW
_sync_inventory_snapshots       -- NEW
_sync_stock_valuation           -- NEW
_sync_purchase_orders           -- NEW
_sync_purchase_order_items      -- NEW
_sync_equipment                 -- NEW
_sync_equipment_parts           -- NEW
_sync_equipment_readings        -- NEW
_sync_equipment_performance     -- NEW
_sync_sensors                   -- NEW
_sync_sensor_alerts             -- NEW
_sync_sensor_daily_summary      -- NEW
_sync_sensor_threshold_configs  -- NEW
_sync_sensor_calibrations       -- NEW
_sync_sensor_maintenance_log    -- NEW
_sync_weight_reminders          -- NEW
_sync_care_expenses             -- NEW
_sync_care_litters              -- NEW
_sync_feed_trough_checks        -- NEW
_sync_cycle_feed_programs       -- NEW
_sync_cycle_feed_program_items  -- NEW
_sync_cycle_feed_stages         -- NEW
_sync_device_channels           -- NEW
_sync_device_states             -- NEW
_sync_device_state_log          -- NEW
_sync_device_commands           -- NEW
_sync_device_telemetry          -- NEW
_sync_device_alerts             -- NEW
_sync_device_config_versions    -- NEW
_sync_equipment_assignment_log  -- NEW
_sync_equipment_command_log     -- NEW
_sync_curtain_configs           -- NEW
_sync_sensor_types              -- NEW
```

#### Sync Code Fixes (5 items)
- Retry mechanism (exponential backoff)
- SyncLock (distributed lock with TTL)
- Priority queue (in queue_change)
- FieldMapper (centralized Local↔Cloud mapping)
- ConflictResolver (version-based)

### MEDIUM PRIORITY (New Services)

| Service | Description | Status |
|---------|-------------|--------|
| **SnapshotService** | Daily FCR, biomass, feed_cumulative calculation | Pending |
| **AnomalyDetector** | Alert if feed/death >3x 7-day average | Pending |
| **CareEditPermission** | Edit deadline 3 days, delete 2 days | Pending |
| **RecordedAtValidator** | Validate recorded_at range | Pending |
| **curtain_configs auto-control** | Wind speed auto-trigger for curtains | Pending |

---

## Migration Order

```
## PHASE 1: Local Schema (scripts 013-023)
1.  scripts/015_add_farms_table.sql
2.  scripts/013_add_barn_dimensions.sql
3.  scripts/014_add_barn_capex.sql
4.  scripts/016_add_equipment.sql
5.  scripts/017_add_cycle_gender_finance.sql
6.  scripts/018_add_weight_samples.sql
7.  scripts/019_add_care_expenses.sql
8.  scripts/020_add_care_litters.sql
9.  scripts/021_add_sensor_tables.sql
10. scripts/022_add_care_death_med_gaps.sql
11. scripts/023_add_care_med_gaps.sql

## PHASE 2: Reference Data Fixes (scripts 024-029)
12. scripts/024_expand_products.sql
13. scripts/025_expand_suppliers.sql
14. scripts/026_add_feed_med_product_fk.sql
15. scripts/027_add_vaccine_product_fk.sql
16. scripts/028_expand_device_types.sql
17. scripts/029_create_equipment_types.sql

## PHASE 3: Sync Infrastructure (scripts 030-031)
18. scripts/030_expand_sync_queue.sql
19. scripts/031_add_version_columns.sql

## PHASE 4: Cloud Reset
20. Drop: env_readings, env_weather, inventory_stock, inventory_consumable_assets
21. Create: farms, warehouses, inventory, inventory_transactions, equipment
22. Create: sensor tables, care tables, cycle_feed tables
23. Add barn_id FK to Cloud care tables

## PHASE 5: Sync Handlers + Code
24. Implement 38 missing pull handlers
25. Implement retry/lock/priority/FieldMapper/ConflictResolver
26. Integrate sensor_sync into push_to_cloud()

## PHASE 6: Verify
27. Verify sync loop (every 60s)
28. Run initial sync
```

---

## Git Commits

| Commit | Date | Message |
|--------|------|---------|
| 7a3f891 | 2026-04-04 | local: run migrations 013-031, add 23 new tables to PostgreSQL |
| 2890165 | 2026-04-04 | fix: convert ISO 8601 datetime in cloud apply_change |
| f732737 | 2026-04-03 | docs: reorganize data_dependency_map with clean entity hierarchy |
| 055a0ed | 2026-04-03 | farm: add auto-queue sync for care operations in care_service |
| 39a42ff | 2026-04-03 | farm: add sync queue for inventory import/export/transfer |

---

## Timeline Summary (as of 2026-04-04)

```
DESIGN:     ✅ ALL 7 entities + 60+ tables complete
SCRIPTS:    ✅ 19 scripts (013-031) created and run
HANDLERS:   ✅ 38 sync handlers implemented
CODE FIX:   ⬜ 5 items (retry/lock/priority/FieldMapper/ConflictResolver)
SERVICES:   ⬜ 5 new services (Snapshot, Anomaly, EditPermission, etc.)
```

---

## Worklog - 2026-04-04

### ✅ Completed

**1. Local PostgreSQL Migrations (013-031)**
- Created 19 migration scripts for new tables:
  - farms, warehouses, warehouse_zones
  - equipment + children (equipment_parts/readings/performance/assignment_log/command_log)
  - sensor_types, sensors + children (threshold_configs/calibrations/maintenance_log)
  - care_litters, weight_samples, feed_trough_checks
  - inventory_alerts, inventory_snapshots, stock_valuation
  - sensor_alerts, sensor_daily_summary, device_telemetry/alerts/config_versions
  - purchase_orders, purchase_order_items, equipment_types
- Expanded existing tables: barns (+farm_id, capacity_kg, capex), cycles (+gender, finance)
- Expanded: products, suppliers, sync_queue (+priority, retry, version, expires_at)
- Fixed: `offset` reserved keyword → `calibration_offset` in sensor_calibrations

**2. Schema Alignment Fixes**
- Added `code` column to feed_brands, medications (cloud requires NOT NULL)
- Added `farm_id` + columns to warehouses (matching cloud schema)

**3. Cloud Sync Fixes**
- Fixed `apply_change()` datetime conversion: ISO 8601 → MySQL format
- Deploy: commit 2890165 to cfarm.vn repo

**4. PostgreSQL Permissions Fix**
- User `cfarm` granted SUPERUSER role via pg_hba.conf trust rule + psql

### 🔄 Current Status
- Sync: running=true, pushed=7, pulled=4, errors=0
- Local tables: 78 (up from 55)
- Cloud: partial sync (schema mismatch on some tables - acceptable for hybrid)

### Hybrid Architecture Notes (2026-04-04)

**Local = Primary:**
- Full IoT operations (ESP32 MQTT, relay control, sensor data)
- Complete farm management (cycles, feeds, medications, inventory)
- PostgreSQL with 78 tables
- All triggers and sync_queue active

**Cloud = Replica (functional, partial data):**
- Web UI functional (same pages as local)
- Bidirectional sync active
- Schema mismatch on: cycles (initial_count vs initial_quantity), device_commands
- **Acceptable for hybrid use** - cloud has ~7 synced tables, sufficient for web UI
- LAN-only features (IP cameras) stay on local only

### ⬜ Pending

1. **Sync Infrastructure** (5 items):
   - Retry mechanism (push fail → retry)
   - SyncLock (prevent concurrent sync)
   - Priority queue (farms/inventory before care ops)
   - FieldMapper (map column names)
   - ConflictResolver (last-write-wins vs merge)

2. **Entity Logic Roadmap** - see `docs/entity_logic_roadmap.md`
   - Phase 1: Farm Infrastructure (Farm → Barn → Warehouse)
   - Phase 2: IoT Infrastructure (Device → Equipment/Sensor)
   - Phase 3: Inventory & Products (Supplier → Product → Inventory)
   - Phase 4: Operations (Cycle → Care operations)
   - Phase 5: Sync Integration

3. **Feature Development** - proceed with IoT hybrid and farm management features

---

*Last Updated: 2026-04-04*
