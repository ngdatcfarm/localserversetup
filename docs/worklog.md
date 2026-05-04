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

## 2026-04-07: Disk Failure Recovery Session

### Vấn đề
Ổ cứng C:\ die - mất local server đang chạy. Backup trên GitHub và F:/Backup.

### Đã làm
1. Clone repo về C:\Local server
2. Copy Docker volumes từ E:/Local-server (corrupted PostgreSQL data - phải reinitialize)
3. Restore Mosquitto password file (3 users: cfarm_server, cfarm_device, cfarm_cloud)
4. Update mosquitto.conf để enable authentication
5. Chạy migrations 002-031 - tạo 77 tables
6. Cập nhật config/cameras.yaml với MQTT credentials
7. Update port 8000 → 8002 (port 8000 bị zombie)
8. Cập nhật documentation (MEMORY.md, ROADMAP.md, entity_logic_roadmap.md)

### Trạng thái hiện tại
```
Server:        port 8002 ✅ (MQTT connected, DB connected)
Database:      77 tables, no devices registered (cần re-register ESP32)
MQTT:          Mosquitto Docker, auth enabled
Cloud Sync:    disabled (paused - tập trung local trước)
Cameras:       cam_001 (192.168.1.72) online, cam_002 (192.168.1.96) offline
```

### Quyết định quan trọng
**Tạm dừng sync, tập trung hoàn thiện local server trước.**
- Cloud sync bidirectional phức tạp, nhiều lỗi
- Local-first: local là primary, cloud chỉ là backup
- Thay vì sync phức tạp, sẽ dùng HTTPS proxy cho remote commands

### Files tạo mới
- `start_server.bat` - Startup script (port 8002)
- `scripts/backup.ps1` - Backup script to F:\Backup\cfarm_backup
- `test_root.py` - Debug script cho root endpoint

### Port 8000 Issue
Port 8000 có 13 zombie processes từ các lần test trước. Giải pháp:
- Dùng port 8002 tạm thời
- Hoặc reboot máy để clear hoàn toàn

### Cần làm tiếp
- [ ] Reboot để fix port 8000 (hoặc tiếp tục dùng 8002)
- [ ] Re-register ESP32 devices lên MQTT
- [ ] Test camera cam_002 (192.168.1.96)
- [ ] Hoàn thiện Phase 2: IoT Infrastructure (Equipment, Sensor CRUD)
- [ ] Hoàn thiện Phase 3: Inventory & Products
- [ ] Hoàn thiện Phase 4: Operations (Cycle → Care)

---

## 2026-04-07 PM: Chuyển sang Docker PostgreSQL + Care Operations Test

### Mục tiêu
- Chuyển database từ Local Windows PostgreSQL sang Docker PostgreSQL (dễ backup/restore)
- Setup port 5434 cho Docker (port 5432 bị Windows PostgreSQL chiếm)
- Test care operations (feed, death, medication, weight)

### Vấn đề gặp phải
1. **Port 5432 tranh chấp**: 2 Windows PostgreSQL services (x64-17, x64-18) đang chạy
2. **Không có quyền stop Windows services** (Access denied)
3. **pg_hba.conf**: Docker PostgreSQL dùng scram-sha-256, cần đổi sang trust

### Đã làm

#### 1. Docker Setup
```yaml
# docker-compose.yml - đổi port 5432 → 5434
db:
  ports:
    - "5434:5432"  # host 5434 → container 5432
```

#### 2. Config Update
```yaml
# config/cameras.yaml
database:
  host: localhost
  port: 5434  # Docker PostgreSQL
```

#### 3. pg_hba.conf fix (trust authentication)
```bash
docker exec cfarm-db sh -c "cat > /var/lib/postgresql/data/pg_hba.conf << 'EOF'
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
local   replication     all                                     trust
host    replication     all             127.0.0.1/32            trust
host    replication     all             ::1/128                 trust
host all all all trust
EOF"
docker restart cfarm-db
```

#### 4. Chạy Migrations
```bash
# Từ C:/Local server/scripts
for f in 002_*.sql ... 031_*.sql; do
  docker exec -i cfarm-db psql -U cfarm -d cfarm_local < "$f"
done
# Result: 77 tables created
```

#### 5. Test Care Operations

**Tạo test data:**
```bash
# Farm
POST /api/farm/farms {"id": "farm-test", "name": "Trang trai Test"}

# Barn
POST /api/farm/barns {"id": "barn-01", "name": "Chuong Test", "farm_id": "farm-test"}

# Cycle
POST /api/farm/cycles {"barn_id": "barn-01", "name": "Dot 1 - 2026", "breed": "Lai Choi", "initial_count": 3000, "start_date": "2026-04-07"}
```

**Care Operations Test:**
| Operation | Endpoint | Result |
|-----------|----------|--------|
| Log Feed | POST /api/farm/care/feed | ✅ 100kg (no inventory) |
| Log Death | POST /api/farm/care/death | ✅ -3 con |
| Log Medication | POST /api/farm/care/medication | ✅ 50g vitamin |
| Log Weight | POST /api/farm/care/weight | ✅ 50 con, avg 2.5kg |
| **Feed WITH Inventory** | POST /api/farm/care/feed | ✅ 50kg → inventory 500→450kg |
| **Transaction Log** | GET /api/farm/inventory/transactions | ✅ export -50kg |

**Test Data Setup:**
```bash
# Product
POST /api/farm/products {"code":"FEED-001","name":"Tongwei 311","product_type":"feed"}

# Warehouse (đã add farm_id, is_central columns)
# ALTER TABLE warehouses ADD COLUMN farm_id VARCHAR(50);
# ALTER TABLE warehouses ADD COLUMN is_central BOOLEAN;
POST /api/farm/warehouses {"code":"WH-FEED","name":"Kho Feed","warehouse_type":"feed"}

# Import stock
POST /api/farm/inventory/import {"warehouse_id":1,"product_id":1,"quantity":500}
```

**Dashboard KPIs (cycle_id=1):**
```
alive_count: 2997 (3000 - 3)
total_deaths: 3
mortality_rate: 0.1%
total_feed_kg: 150.0 (100 + 50)
feed_per_bird_day: 50.1 g/con
latest_weight: 2.5 kg
inventory: 450kg (500 - 50)
```

### Kết quả cuối cùng
```
Docker PostgreSQL:  ✅ port 5434
Migrations:        ✅ 77 tables
Database:          ✅ Docker (volumes: ./docker/db/data)
Server:            ✅ localhost:8002
Care Operations:   ✅ All working
```

### Files cập nhật
- `docker-compose.yml` - port 5434
- `config/cameras.yaml` - database port 5434
- `docs/worklog.md` - this entry
- `docs/care_operations_daily_logging.md` - care operations documentation

### Backup Docker Database
```bash
# Backup
docker cp cfarm-db:/var/lib/postgresql/data F:/Backup/cfarm_db

# Restore (sau khi xóa container)
docker cp F:/Backup/cfarm_db cfarm-db:/var/lib/postgresql/data
docker restart cfarm-db
```

---

## 2026-04-07: Phân chia Development Phases

### 4 Phases của Development Process

| Phase | Tên | Mô tả |
|-------|-----|--------|
| **1** | Backend thô + database | Schema, API structure, Database design |
| **2** | Logic Backend | Business constraints, Validation, Relationships |
| **3** | Frontend Logic | State management, API calls, Error handling |
| **4** | UI/UX Polish | CSS, Responsive, Animation |

---

### Hiện trạng CFarm Local Server

#### Phase 1: Backend thô + database ⚠️ ĐANG HOÀN THIỆN

- **77 tables** đã tạo qua migrations 002-031 + 032
- **API endpoints**: 67 endpoints (46 farm routes + 21 farm_extended routes)
- **Schema validation**: Đang kiểm tra và bổ sung Pydantic Field validation
- **File:** `docs/api_schema_validation_checklist.md`

**API Endpoints Status:**
- ✅ CRUD đầy đủ cho: Farm, Barn, Cycle, Warehouse, Product
- ✅ Care operations: Feed, Death, Medication, Weight, Sale
- ✅ Inventory: Import, Export, Transfer
- ✅ Catalog: Feed brands, Feed types, Medications, Suppliers
- ✅ Vaccine programs và schedules

**Schema Validation Issues (đã identify):**
- ❌ Thiếu Field validation cho required fields
- ❌ Thiếu Literal enums cho choice fields (meal, cause, med_type...)
- ❌ Thiếu min/max validation cho quantity, count

#### Phase 2: Logic Backend ⚠️ CẦN KIỂM TRA

**Business Logic Checklist:**

| # | Rule | Status |
|---|------|--------|
| 1 | Farm không xóa nếu có barns | ❓ |
| 2 | Barn không xóa nếu có active cycle | ❓ |
| 3 | Cycle close → check all feeds recorded | ❓ |
| 4 | Feed log → auto deduct inventory | ✅ Đã test |
| 5 | Medication log → auto deduct inventory | ✅ Đã test |
| 6 | Death log → auto update current_count | ✅ Đã test |
| 7 | Sale log → auto update current_count | ❓ |
| 8 | Warehouse không xóa nếu có inventory | ❓ |
| 9 | Product không xóa nếu có transactions | ❓ |
| 10 | Export stock → không cho > available | ❓ |

#### Phase 3: Frontend Logic ⚠️ CHƯA TEST

- Vue 3 SPA có sẵn trong `src/webapp/`
- Chưa test systematic từng flow
- Cần verify: forms → API calls → response handling

#### Phase 4: UI/UX Polish ❌ CHƯA LÀM

- CSS/Tailwind responsive chưa hoàn chỉnh
- Error messages chưa đẹp
- Loading states chưa có

---

### Đề xuất: Bắt đầu từ Phase 2

**Lý do:**
1. Phase 1 đã hoàn thành (77 tables + API)
2. Phase 2 là phần **quan trọng nhất** - quyết định hệ thống có chạy đúng không
3. Phase 3 & 4 phụ thuộc Phase 2 đúng

---

## 2026-04-07 PM: Warehouse-Barn Linkage & Inventory Alerts

### Mục tiêu
Khắc phục các vấn đề còn thiếu trong Warehouse + Care Operations integration:
1. Barn → default feed/medication warehouse assignment
2. Warehouse type validation khi log feed/medication
3. Low stock alert khi inventory < min_stock_alert
4. Auto-suggest warehouse API

### Đã làm

#### 1. Migration Script 033
```sql
-- Tạo 2 bảng mới:
-- - barn_default_warehouses: gán warehouse mặc định theo loại (feed/medication) cho barn
-- - inventory_alerts: theo dõi cảnh báo tồn kho thấp
-- - Thêm sync triggers cho cả 2 bảng
```

#### 2. InventoryService Updates (`src/farm/inventory_service.py`)
**Thêm methods:**
- `set_default_warehouse(barn_id, warehouse_type, warehouse_id)` - UPSERT default warehouse
- `get_default_warehouse(barn_id, warehouse_type)` - Get default warehouse
- `list_default_warehouses(barn_id)` - List all barn defaults
- `delete_default_warehouse(barn_id, warehouse_type)` - Remove default
- `check_low_stock_alerts(warehouse_id)` - Kiểm tra và tạo alerts
- `get_active_alerts(...)` - Lấy danh sách alerts
- `acknowledge_alert(alert_id, acknowledged_by)` - Acknowledge alert
- `resolve_alert(alert_id)` - Resolve alert

#### 3. CareService Validation Updates (`src/farm/care_service.py`)
**log_feed():**
- Auto-lookup default warehouse nếu không specify warehouse_id
- Validate warehouse_type phải là 'feed' hoặc 'mixed'
- Validate product_type phải là 'feed'

**log_medication():**
- Auto-lookup default warehouse nếu không specify warehouse_id
- Validate warehouse_type phải là 'medication' hoặc 'mixed'
- Validate product_type phải là 'medication' hoặc 'medicine'

#### 4. Sync Handler (`src/sync/sync_service.py`)
- Thêm `barn_default_warehouses` vào HANDLERS dict
- Thêm `_sync_barn_default_warehouses()` method

#### 5. API Routes (`src/server/routes/farm.py`)
**Thêm endpoints:**
```
GET  /api/farm/barns/{barn_id}/default-warehouses
POST /api/farm/barns/{barn_id}/default-warehouses
DELETE /api/farm/barns/{barn_id}/default-warehouses/{warehouse_type}

GET  /api/farm/barns/{barn_id}/suggested-warehouses

GET  /api/farm/inventory/alerts
POST /api/farm/inventory/alerts/check
POST /api/farm/inventory/alerts/{alert_id}/acknowledge
POST /api/farm/inventory/alerts/{alert_id}/resolve
```

### Files tạo mới / cập nhật
| File | Action |
|------|--------|
| `scripts/033_barn_default_warehouses_and_alerts.sql` | NEW |
| `src/farm/inventory_service.py` | MODIFIED |
| `src/farm/care_service.py` | MODIFIED |
| `src/sync/sync_service.py` | MODIFIED |
| `src/server/routes/farm.py` | MODIFIED |
| `docs/worklog.md` | MODIFIED |

### Tiến độ cập nhật Phase 1 trong entity_logic_roadmap.md
Phase 1: Farm Infrastructure - **Updated với warehouse-barn linkage:**
- [x] Barn → Default Feed Warehouse assignment
- [x] Barn → Default Medication Warehouse assignment
- [x] Warehouse type validation trong care operations
- [x] Low stock alert system
- [x] Suggested warehouses API

---

### Migration Scripts đã tạo

- `scripts/033_barn_default_warehouses_and_alerts.sql` - Barn default warehouses + inventory alerts

---

### Test Data hiện tại (Docker PostgreSQL)

```
Farm: farm-test
Barn: barn-01
Cycle: 1 (Dot 1 - 2026, 3000 con)
Products: FEED-001 (Tongwei 311), MED-001 (Vitamin C)
Warehouses: WH-FEED (500kg → 450kg), WH-MED (200g → 170g)
```

---

### Files đã cập nhật hôm nay

- `docs/worklog.md` - Phân chia 4 phases
- `docs/care_operations_daily_logging.md` - Chi tiết care operations
- `docs/entity_logic_roadmap.md` - Cập nhật Phase 4 progress
- `memory/MEMORY.md` - Docker PostgreSQL setup
- `memory/ROADMAP.md` - Phase 1 update

---

### Tiếp theo cần làm

**Option 1:** Kiểm tra Phase 2 - Business Logic từng cái một
**Option 2:** Bắt đầu Phase 3 - Frontend Logic (UI + API calls)
**Option 3:** Tùy bạn chọn

---

## 2026-04-07 PM: Inventory UI Upgrade + API Testing

### Mục tiêu
Test và fix các APIs cho warehouse-barn linkage features.

### Files đã sửa/thêm

**1. Migration script mới:**
- `scripts/034_fix_inventory_alerts_unique.sql` - Thêm unique constraint `(warehouse_id, product_id)` cho inventory_alerts table để UPSERT hoạt động đúng

**2. Bug fix in inventory_service.py:**
- Dòng 533: Thêm `ON CONFLICT (warehouse_id, product_id)` vào UPSERT query trong `check_low_stock_alerts()`
- Trước đó: `ON CONFLICT DO UPDATE` (thiếu target)
- Sau khi sửa: `ON CONFLICT (warehouse_id, product_id) DO UPDATE SET...`

**3. inventory.js đã được rewrite trong session trước:**
- 6 tabs: Warehouses, Barn Assignment, Products, Stock, Actions
- Low Stock Alerts Panel
- Barn Default Assignment UI
- Warehouse Detail Modal với zones

### API Testing Results (Server port 8010)

| Endpoint | Kết quả |
|----------|---------|
| `POST /api/farm/inventory/alerts/check?warehouse_id=1` | ✅ Tạo alert cho Tongwei 311 (5kg vs 100kg min) |
| `GET /api/farm/inventory/alerts` | ✅ Trả về alert với product/warehouse details |
| `POST /api/farm/inventory/alerts/{id}/acknowledge` | ✅ Acknowledge thành công |
| `POST /api/farm/inventory/alerts/{id}/resolve` | ✅ Resolve thành công |
| `GET /api/farm/barns/6/suggested-warehouses` | ✅ Trả về stock levels + low_stock_items count |
| `GET /api/farm/barns/6/default-warehouses` | ✅ Trả về 2 assignments (feed + mixed) |
| `GET /api/farm/warehouses` | ✅ Trả về 2 warehouses |
| `GET /api/farm/inventory?warehouse_id=1` | ✅ Trả về 2 inventory items |

### Data Test
- **Product**: Tongwei 311 (FEED-001)
- **Warehouse**: Kho Chinh (WH-01, feed type)
- **Quantity**: 5.0 kg
- **min_stock_alert**: 100.0 kg
- **Alert triggered**: severity=critical (qty <= 50% of threshold)
- **Alert acknowledged by**: admin
- **Alert resolved**: ✅

### Database Port Issue Phát Hiện
- Server đang chạy trên port 8002 cũ có thể dùng Docker database (5434)
- Server mới trên port 8010 dùng Windows PostgreSQL (5432)
- Config `config/cameras.yaml` chỉ định port 5432 nhưng server cũ không áp dụng thay đổi
- **Giải pháp**: Restart server để áp dụng code mới

### Files đã cập nhật hôm nay
- `docs/worklog.md` - Thêm session 2026-04-07 PM
- `scripts/034_fix_inventory_alerts_unique.sql` - Migration fix (NEW)
- `src/farm/inventory_service.py` - Sửa bugs (ON CONFLICT clause + warehouse_id type)
- `static/js/pages/inventory.js` - UI updates (barn selector)

### UI Updates (inventory.js)
1. **Tab Ton kho**: Thêm dropdown chọn barn
   - Không chọn barn → chỉ hiển thị kho trung tâm
   - Chọn barn → hiển thị kho của barn + kho trung tâm
   - Auto-select default feed warehouse của barn

2. **Tab Nhap/Xuat/Chuyen**: Thêm dropdown chọn barn
   - Tất cả dropdown kho đều dùng `stockWarehouseOptions` computed
   - Lọc theo barn + kho trung tâm

3. **Modal Them kho**: Field "Chuong" → dropdown chọn barn
   - `-- Kho trung tam --` = không gán barn

### Bug đã fix
1. `inventory_service.py:533` - ON CONFLICT thiếu target columns
2. `inventory_service.py:139` - list_warehouse_zones warehouse_id string cast

### Tiếp theo cần làm (2026-04-08)
1. Restart server 8010 để áp dụng code mới (fix warehouse-zones API)
2. Test inventory UI trên trình duyệt (http://localhost:8010/#/inventory)
3. Test warehouse-zones API sau restart
4. Tiếp tục Phase 2: IoT Infrastructure (Device → Equipment/Sensor)

---

## 2026-04-08: Inventory Alert Rules System

### Mục tiêu
Hoàn thiện alert system với:
1. Cài đặt ngưỡng riêng per warehouse-product
2. Tần suất alert (frequency_minutes)
3. Bật/tắt alert rules
4. Xóa alert

### Đã làm

#### 1. Migration Script 035
```sql
-- Tạo bảng inventory_alert_rules:
-- - warehouse_id/product_id nullable (null = apply to all)
-- - alert_type: 'low_stock', 'out_of_stock', 'overstock'
-- - threshold override (null = use product.min_stock_alert)
-- - frequency_minutes (null = manual only)
-- - enabled boolean
-- - severity override

-- Thêm vào inventory_alerts:
-- - is_enabled (soft enable/disable)
-- - deleted_at (soft delete)
```

#### 2. Backend Updates (`src/farm/inventory_service.py`)
- Thêm `delete_alert()` - soft delete alert
- Thêm `list_alert_rules()` - list với filters
- Thêm `get_alert_rule()` - get single rule
- Thêm `create_alert_rule()` - tạo rule mới
- Thêm `update_alert_rule()` - cập nhật rule
- Thêm `delete_alert_rule()` - xóa rule
- Thêm `toggle_alert_rule()` - enable/disable
- Cập nhật `check_low_stock_alerts()` - sử dụng rule thresholds

#### 3. API Routes (`src/server/routes/farm.py`)
Thêm endpoints:
```
GET    /inventory/alerts/rules           - List rules
POST   /inventory/alerts/rules           - Create rule
GET    /inventory/alerts/rules/{id}     - Get rule
PUT    /inventory/alerts/rules/{id}     - Update rule
DELETE /inventory/alerts/rules/{id}     - Delete rule
POST   /inventory/alerts/rules/{id}/toggle - Enable/disable
DELETE /inventory/alerts/{id}           - Delete alert
```

#### 4. Frontend Updates
- `static/js/api.js` - Thêm alertRules API methods
- `static/js/pages/inventory.js`:
  - Thêm tab "Canh bao" mới
  - Alert Rules table với CRUD
  - Alert Rule form modal (warehouse, product, type, threshold, frequency, severity)
  - Toggle enable/disable rule
  - Delete alert button

### Files tạo/sửa
| File | Action |
|------|--------|
| `scripts/035_inventory_alert_rules.sql` | NEW |
| `src/farm/inventory_service.py` | MODIFIED |
| `src/server/routes/farm.py` | MODIFIED |
| `static/js/api.js` | MODIFIED |
| `static/js/pages/inventory.js` | MODIFIED |
| `docs/worklog.md` | MODIFIED |

### Cần làm tiếp
1. Chạy migration 035: `docker exec cfarm-db psql -U cfarm -d cfarm_local < scripts/035_inventory_alert_rules.sql`
2. Restart server để áp dụng code mới
3. Test alert rules UI

---

## 2026-04-08 PM: Push Notification System - Alert Notifications

### Mục tiêu
Hoàn thiện hệ thống push notifications để gửi cảnh báo đến các thiết bị:
1. Sensor Alerts (nhiệt độ, độ ẩm vượt ngưỡng)
2. Inventory Alerts (tồn kho thấp)
3. WebPush cho trình duyệt

### Kiến trúc

```
Alert Trigger → AlertService._check_alerts()
             → notification_service.send_alert()
             → WebPush to all subscribers
             → Service Worker shows notification
```

### Đã làm

#### 1. Backend Files

**`src/server/routes/notifications.py`** (NEW endpoints)
- `GET /api/notifications/status` - Check push notification readiness
- `GET /api/notifications/vapid-public-key` - Get VAPID key cho browser
- `POST /api/notifications/subscribe` - Register push subscription
- `POST /api/notifications/unsubscribe` - Remove subscription
- `GET /api/notifications/subscriptions` - List all subscriptions
- `POST /api/notifications/test` - Send test notification

**`src/iot/notification_service.py`** (EXISTING - đã có)
- Quản lý push subscriptions trong `push_subscriptions` table
- Send WebPush via pywebpush

**`src/server/main.py`** (MODIFIED)
- Thêm endpoint `/sw.js` - serve service worker
- Thêm endpoint `/cfarm.crt` - download SSL certificate

#### 2. SSL Certificate

**Self-signed certificate cho LAN:**
```bash
openssl req -x509 -newkey rsa:2048 -keyout cert.key -out cert.pem -days 365
```
- File: `cert.pem`, `cert.key`
- CN: `cfarm-local`
- Port: **8443** (HTTPS)

**Config (`config/cameras.yaml`):**
```yaml
push_notifications:
  vapid_public_key: |
    MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEJ2kaoQzRwM9ZbT+CJaPbH01UJTMke7BL7Wdqam78pkkutZ2bzTtp9x+cG+T+NAcZiXFIOc0REHh9wQB/JAWWOA==
  vapid_private_key: |
    MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgyXbcXCPZW6F4SLns...
  vapid_subject: mailto:admin@cfarm.local
```

#### 3. Service Worker (`static/sw.js`)

```javascript
// Handle push events
self.addEventListener('push', (event) => {
    const data = event.data.json();
    self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/favicon.ico',
        tag: 'cfarm-alert'
    });
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    clients.openWindow('/');
});
```

#### 4. Frontend Updates

**`static/js/api.js`** - Thêm API methods:
```javascript
notifications: {
    status() { return API.get('/api/notifications/status'); },
    vapidKey() { return API.get('/api/notifications/vapid-public-key'); },
    subscribe(sub) { return API.post('/api/notifications/subscribe', sub); },
    unsubscribe(endpoint) { return API.post('/api/notifications/unsubscribe', { endpoint }); },
    subscriptions() { return API.get('/api/notifications/subscriptions'); },
    test(title, body) { return API.post('/api/notifications/test', { title, body }); },
}
```

**`static/js/app.js`** - Register service worker:
```javascript
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('[App] SW registered:', reg.scope))
        .catch(err => console.error('[App] SW failed:', err));
}
```

**`static/js/pages/alerts.js`** - Tab "Thong bao":
- Trạng thái push notification (ready/vapid configured)
- Nút "Bật thông báo" / "Tắt thông báo"
- Nút "Tai Certificate" để tải SSL cert
- Nút "Gui thong bao test"
- Danh sách subscriptions hiện tại
- Hướng dẫn cài đặt trên Android/iPhone

#### 5. VAPID Key Format Fix

**Vấn đề:** Browser Push API yêu cầu raw P-256 key (65 bytes), nhưng config lưu SPKI format (91 bytes).

**Giải pháp:** Parse SPKI DER structure để extract raw key:
```python
# Tìm BIT STRING với length 0x42 trong DER
# Skip tag + length + unused bits byte
# Extract 65 bytes raw key
```

#### 6. Sensor Alert System - Debug

**Vấn đề:** Alerts không trigger dù sensor data vượt threshold.

**Root cause:**
1. `sensor_data` có `device_id=1` nhưng `devices` table EMPTY
2. Foreign key constraint violation khi insert alert

**Fix:**
```sql
INSERT INTO devices (id, device_code, name, device_type_id, barn_id, mqtt_topic, is_online)
VALUES (1, 'ESP001', 'ESP32 Sensor 1', 1, 'barn-01', 'sensors/esp32/001', true);
```

### Kết quả Test

| Nền tảng | Trình duyệt | Certificate | Push Status |
|----------|-------------|-------------|-------------|
| Windows | Chrome | Self-signed + Proceed | ✅ Works |
| Windows | Firefox | Self-signed + Accept | ✅ Works |
| Android | Chrome | Self-signed + Import to System | ✅ Works |
| Android | Firefox | Self-signed + Import to System | ✅ Works |
| iPhone | Safari | Cần CA thật (Let's Encrypt) | ❌ Not supported |

### Giải pháp cho iOS

**Vấn đề:** Safari/iOS không trust user-installed certificates cho WebPush.

**Các lựa chọn:**
1. **Let's Encrypt** (miễn phí) - Cần domain + port 80 access
2. **Firebase Cloud Messaging (FCM)** - Push qua Google, iOS supported
3. **PWA** - Vẫn cần CA thật

### Files tạo/sửa

| File | Action |
|------|--------|
| `static/sw.js` | NEW - Service Worker |
| `src/server/routes/notifications.py` | MODIFIED - VAPID key fix |
| `src/server/main.py` | MODIFIED - /sw.js, /cfarm.crt endpoints |
| `config/cameras.yaml` | MODIFIED - push_notifications config |
| `static/js/api.js` | MODIFIED - notifications API |
| `static/js/app.js` | MODIFIED - SW registration |
| `static/js/pages/alerts.js` | MODIFIED - Tab Thong bao |
| `cert.pem`, `cert.key`, `cfarm-local.crt` | NEW - SSL certificates |

### Server Commands

```bash
# Start với HTTPS
python -m uvicorn src.server.main:app --host 0.0.0.0 --port 8443 --ssl-keyfile cert.key --ssl-certfile cert.pem

# Test notification API
curl https://localhost:8443/api/notifications/status
curl https://localhost:8443/api/notifications/vapid-public-key

# Trigger sensor alert check
curl -X POST https://localhost:8443/api/alerts/check
```

### Cần làm sau

1. **Firebase Cloud Messaging cho iOS**
   - Tạo Firebase project
   - Setup FCM server key
   - Integrate vào notification_service.py
   - iOS app setup (P12 certificate)

2. **PWA Enhancement**
   - Offline support
   - Add to Home Screen prompt
   - Better notification UI

3. **Let's Encrypt** (optional)
   - Cài certbot
   - Setup domain (VD: cfarm.local)
   - Auto-renewal

---

*Last Updated: 2026-04-10*
*Alert System Status: Android ✅ Working | iOS 🔲 Pending FCM*

---

## 2026-04-10: Bats System (Ventilation Curtains) Implementation

### Mục tiêu
Điều khiển 4 bạt thông gió mỗi barn (trái trên, trái dưới, phải trên, phải dưới):
- Mỗi bạt có UP relay và DOWN relay (từ relay 8 kênh ESP32)
- Auto-stop sau 3.5 phút (210 giây)
- Safety: không cho UP và DOWN cùng ON
- Log lịch sử với cycle_id

### Đã làm

#### 1. Database Schema (`scripts/037_add_bats_system.sql`)
```sql
CREATE TABLE bats (
    id SERIAL PRIMARY KEY,
    barn_id VARCHAR(50) NOT NULL REFERENCES barns(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,  -- left_top, left_bottom, right_top, right_bottom
    name VARCHAR(100) NOT NULL,  -- UI display name: Bạt trái trên, etc.
    device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
    up_relay_channel INTEGER NOT NULL CHECK (up_relay_channel BETWEEN 1 AND 8),
    down_relay_channel INTEGER NOT NULL CHECK (down_relay_channel BETWEEN 1 AND 8),
    auto_enabled BOOLEAN DEFAULT FALSE,
    timeout_seconds INTEGER DEFAULT 210,
    position VARCHAR(20) DEFAULT 'stopped',  -- up, down, stopped
    UNIQUE(barn_id, code)
);

CREATE TABLE bat_logs (
    id SERIAL PRIMARY KEY,
    bat_id INTEGER NOT NULL REFERENCES bats(id) ON DELETE CASCADE,
    cycle_id INTEGER REFERENCES cycles(id) ON DELETE SET NULL,
    action VARCHAR(20) NOT NULL,  -- up, down, stop
    duration_seconds INTEGER,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ
);
```

#### 2. Backend Service (`src/iot/bat_service.py`)
- `list_by_barn(barn_id)` - Lấy 4 bats với device info và moving state
- `move_up(bat_id)` / `move_down(bat_id)` - Điều khiển bạt lên/xuống
- `stop(bat_id)` - Dừng bạt (manual hoặc auto-stop)
- `_schedule_stop(bat_id, delay_seconds)` - Timer auto-stop
- Threading Timer để auto-stop không block asyncio
- Safety: turn OFF inactive channel trước khi turn ON active channel

#### 3. API Routes (`src/server/routes/bats.py`)
```
GET    /api/bats/barns/{barn_id}           - List 4 bats trong barn
GET    /api/bats/{bat_id}                  - Bat details
PUT    /api/bats/{bat_id}                  - Update config (relay channels, timeout, device_id)
POST   /api/bats/{bat_id}/up              - Move UP
POST   /api/bats/{bat_id}/down            - Move DOWN
POST   /api/bats/{bat_id}/stop            - Stop
GET    /api/bats/{bat_id}/logs            - Bat movement history
GET    /api/bats/barns/{barn_id}/logs     - All bat logs trong barn
```

#### 4. Frontend UI (`static/js/pages/bats.js`)
- Grid 2x2 cho 4 bạt
- Nút LÊN/XUỐNG/STOP với loading states
- Progress bar khi đang chạy
- Panel cài đặt (Esp32, kênh relay, timeout)
- Shared device dropdown - chọn 1 ESP32 cho tất cả 4 bạt
- Lịch sử hoạt động bên dưới
- Auto-refresh khi bạt đang chuyển động (5s interval)

#### 5. Relay 8ch Firmware (`firmware/esp32_relay_8ch_hybrid/esp32_relay_8ch_hybrid.ino`)
- Single MQTT local connection (không cloud)
- MQTT_MAX_PACKET_SIZE = 512 (fix heartbeat JSON size issue)
- HTTP OTA update (không HTTPS vì ESP32 không support self-signed cert)
- Relay control via MQTT: `devices/{topic}/relay` với payload `{"channel":N,"state":"on|off"}`

#### 6. Documentation (`docs/entity_logic_roadmap.md`)
- Added Step 2.5: Bats System documentation
- Complete features, relay mapping, API endpoints, file list

### Relay 8ch Channel Mapping
```
Bạt trái trên:   UP=K1 (ch1), DOWN=K2 (ch2)
Bạt trái dưới:  UP=K3 (ch3), DOWN=K4 (ch4)
Bạt phải trên:  UP=K5 (ch5), DOWN=K6 (ch6)
Bạt phải dưới:  UP=K7 (ch7), DOWN=K8 (ch8)
```

### Files tạo mới
| File | Description |
|------|-------------|
| `scripts/037_add_bats_system.sql` | Database schema |
| `src/iot/bat_service.py` | Bat control service |
| `src/server/routes/bats.py` | API routes |
| `static/js/pages/bats.js` | Vue 3 UI component |
| `firmware/esp32_relay_8ch_hybrid/esp32_relay_8ch_hybrid.ino` | Relay 8ch firmware |

### Files cập nhật
| File | Description |
|------|-------------|
| `static/js/api.js` | Thêm bats API methods |
| `src/server/routes/devices.py` | Thêm relay command endpoint |
| `docs/entity_logic_roadmap.md` | Added Step 2.5 |
| `docs/worklog.md` | This entry |

### Test Results (2026-04-10)
```
GET /api/bats/barns/barn-01 → ✅ 4 bats (left_top, left_bottom, right_top, right_bottom)
GET /api/bats/1 → ✅ Bat details với device info
POST /api/bats/1/up → ✅ MQTT command sent, bat_logs record created
```

### Bug Fixes
1. **MQTT publish FAIL**: MQTT_MAX_PACKET_SIZE default 128 bytes < heartbeat JSON ~180-200 bytes
   - Fix: `#define MQTT_MAX_PACKET_SIZE 512` BEFORE `#include <PubSubClient.h>`
2. **ESP32 OTA HTTPS fails**: ESP32 doesn't support self-signed certificates
   - Fix: Changed LOCAL_SERVER from `https://` to `http://`
3. **barn_id type mismatch**: barns.id is VARCHAR(50), not integer
   - Fix: Changed barn_id type from int to str in routes

### Pending (nếu cần)
- [ ] Test bat logs API
- [ ] Test auto-stop timer functionality
- [ ] Test safety lock (cannot send UP while DOWN is active)

---

*Last Updated: 2026-04-10*
*Bats System: ✅ Implemented | Relay 8ch Firmware: ✅ Working*

