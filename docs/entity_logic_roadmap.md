# Entity Logic Roadmap

**Mục tiêu:** Xây dựng business logic cho từng entity theo đúng data dependency hierarchy.

**Sync Status:** Cloud sync paused (2026-04-07) - local-first architecture

---

## Progress Overview

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1: Farm Infrastructure | ✅ Done | 100% |
| Phase 2: IoT Infrastructure | ✅ Done | 100% |
| Phase 3: Inventory & Products | ⬜ Pending | 0% |
| Phase 4: Operations (Cycles & Care) | ✅ Done | 100% |
| Phase 5: Sync Integration | ⏸️ Paused | 0% |

**Phase 2 Components:** Device ✅ | Bats ✅ (2026-04-10) | Equipment ✅ (2026-04-13) | Sensor ✅

**Note:** Sync (Phase 5) paused 2026-04-07 - focusing on local-first stability.

**Care Operations Test (2026-04-07 PM):** ✅ Feed, Death, Medication, Weight logs tested on Docker PostgreSQL

**Phase 1 Full Validation Results (2026-04-07):**
| Test | Result |
|------|--------|
| Default warehouse assignment | ✅ PASS |
| Auto-lookup (feed without warehouse_id) | ✅ PASS |
| Auto-lookup (medication without warehouse_id) | ✅ PASS |
| Warehouse type validation (feed vs medication) | ✅ PASS |
| Product type validation | ✅ PASS |
| Inactive warehouse rejection | ✅ PASS |
| Insufficient stock rejection | ✅ PASS |
| Low stock alert detection | ✅ PASS |

---

---

## Phase 1: Farm Infrastructure

**Goal:** CRUD operations cho Farm → Barn → Warehouse hierarchy

### Step 1.1: Farm Entity ✅ DONE
- [x] CRUD Farm (name, address, contact)
- [x] Farm settings/config
- [x] Test: Create farm, verify barns link correctly

### Step 1.2: Barn Entity ✅ DONE
- [x] CRUD Barn (thuộc Farm nào)
- [x] Barn dimensions (length_m, width_m, height_m)
- [x] Barn capacity_kg
- [x] Barn status (active/inactive)
- [x] Test: Create barn under farm, verify relationship

### Step 1.3: Warehouse Entity ✅ DONE
- [x] CRUD Warehouse (central vs barn-level)
- [x] Warehouse zones
- [x] Link to Farm/Barn
- [x] Test: Create warehouse, add zones

**Data Flow:**
```
Farm (1) ───< Barn (N)
  │
  └──< Warehouse (N) ───< WarehouseZone (N)
```

**Files Modified:**
- `src/farm/farm_service.py` (NEW)
- `src/farm/barn_service.py` (updated)
- `src/farm/inventory_service.py` (updated)
- `src/server/routes/farm.py` (added Farm + Barn CRUD)

**API Endpoints:**
```
POST   /api/farms           - Create farm ✅
GET    /api/farms           - List farms ✅
GET    /api/farms/{id}      - Get farm details (with barn/warehouse counts) ✅
PUT    /api/farms/{id}      - Update farm ✅
DELETE /api/farms/{id}      - Delete farm (check barns/warehouses first) ✅

POST   /api/barns           - Create barn ✅
GET    /api/barns           - List barns (filter by farm_id) ✅
GET    /api/barns/{id}      - Get barn details (with farm + active cycle) ✅
PUT    /api/barns/{id}      - Update barn ✅
DELETE /api/barns/{id}      - Delete barn (check active cycle first) ✅

POST   /api/warehouses      - Create warehouse ✅
GET    /api/warehouses      - List warehouses (filter by farm_id) ✅
GET    /api/warehouses/{id} - Get warehouse details ✅
PUT    /api/warehouses/{id} - Update warehouse ✅
DELETE /api/warehouses/{id} - Delete warehouse (check inventory first) ✅

POST   /api/warehouse-zones         - Create zone ✅
GET    /api/warehouse-zones          - List zones (filter by warehouse) ✅
DELETE /api/warehouse-zones/{zone_id} - Delete zone ✅
```

**Test Results (2026-04-04):**
- GET /api/farm/farms → returns farm-01
- GET /api/farm/farms/farm-01 → returns summary (barn_count=1, warehouse_count=0)
- GET /api/farm/barns → returns barns with farm_id
- POST /api/farm/warehouses → creates warehouse with is_central=true
- POST /api/farm/warehouse-zones → creates zone successfully

### Step 1.4: Barn-Warehouse Linkage ✅ DONE (2026-04-07)
- [x] Barn default warehouse assignment (feed/medication per barn)
- [x] Auto-lookup default warehouse in care operations
- [x] Warehouse type validation (feed vs medication)
- [x] Product type validation in care operations
- [x] Low stock alert system (inventory_alerts table)
- [x] Suggested warehouses API with stock levels

**New Tables:**
- `barn_default_warehouses` - default warehouse per barn + type (UNIQUE barn_id+warehouse_type)
- `inventory_alerts` - low stock, out of stock tracking with severity

**New API Endpoints:**
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

**Business Rules Enforced:**
- Feed log: warehouse_type must be 'feed' or 'mixed', product_type must be 'feed'
- Medication log: warehouse_type must be 'medication' or 'mixed', product_type must be 'medication' or 'medicine'
- Auto-lookup default warehouse if warehouse_id not provided
- Low stock alerts triggered when inventory.quantity <= products.min_stock_alert

**Bug Fix (2026-04-07 PM):**
- `scripts/034_fix_inventory_alerts_unique.sql` - Thêm unique constraint `(warehouse_id, product_id)` cho inventory_alerts UPSERT
- `src/farm/inventory_service.py:533` - Sửa `ON CONFLICT DO UPDATE` → `ON CONFLICT (warehouse_id, product_id) DO UPDATE SET`
- `src/farm/inventory_service.py:139` - Sửa `list_warehouse_zones` warehouse_id string→int cast với `$1::int`

**UI Updates (2026-04-07 PM):**
- `static/js/pages/inventory.js` - Thêm barn selector cho tabs:
  - Tab "Ton kho": dropdown chọn barn → lọc kho của barn + kho trung tâm, auto-select default warehouse
  - Tab "Nhap/Xuat/Chuyen": dropdown chọn barn → lọc kho theo barn + kho trung tâm
  - Modal "Them kho": field "Chuong" từ text input → dropdown chọn barn

**Pending (cần restart server 8010 để fix):**
- `warehouse-zones?warehouse_id=X` API - đã fix code nhưng cần restart

---

## Phase 2: IoT Infrastructure

**Goal:** Device → Equipment/Sensor hierarchy với MQTT integration

### Step 2.1: Device Type Entity ✅ DONE
- [x] CRUD DeviceType (relay count, config template)
- [x] MQTT protocol schema definition
- [x] Test: Create device type, verify template

### Step 2.2: Device Entity ✅ DONE
- [x] CRUD Device (gán Barn nào)
- [x] Device code (ESP32 serial from MQTT)
- [x] Online/heartbeat status (already exists via MQTT listener)
- [x] Device firmware link
- [x] Test: Verify MQTT heartbeat updates device status

### Step 2.5: Bats System (Ventilation Curtains) ✅ DONE (2026-04-10)

**Mô tả:** Mỗi barn có 4 bạt (bạt trái trên, bạt trái dưới, bạt phải trên, bạt phải dưới). Mỗi bạt có relay UP và relay DOWN để điều khiển lên/xuống.

**Tables:**
- `bats` - cấu hình bạt cho mỗi barn (code, name, up/down relay channel, device_id, timeout)
- `bat_logs` - lịch sử hoạt động (bat_id, cycle_id, action, duration_seconds, started_at, ended_at)

**Tính năng:**
- Điều khiển LÊN/XUỐNG/STOP cho từng bạt
- Auto-stop sau timeout (mặc định 3.5 phút / 210 giây)
- Safety lock: không cho UP và DOWN cùng ON
- Log lịch sử với cycle_id (NULL nếu không có active cycle)
- Auto-refresh UI khi bạt đang chuyển động
- Cài đặt kênh relay và timeout per bat
- Chế độ Auto (dành cho ML - tương lai)

**Relay 8ch mapping:**
```
Bạt trái trên:   UP=K1, DOWN=K2
Bạt trái dưới:  UP=K3, DOWN=K4
Bạt phải trên:  UP=K5, DOWN=K6
Bạt phải dưới:  UP=K7, DOWN=K8
```

**Files:**
- `src/iot/bat_service.py` (NEW)
- `src/server/routes/bats.py` (NEW)
- `scripts/037_add_bats_system.sql` (NEW)
- `static/js/pages/bats.js` (NEW)
- `static/js/api.js` (ADDED bats API)

**API Endpoints:**
```
GET    /api/bats/barns/{barn_id}           - List 4 bats trong barn
GET    /api/bats/{bat_id}                 - Bat details
PUT    /api/bats/{bat_id}                 - Update config (kênh relay, timeout, device_id)
POST   /api/bats/{bat_id}/up               - Move UP
POST   /api/bats/{bat_id}/down             - Move DOWN
POST   /api/bats/{bat_id}/stop             - Stop
GET    /api/bats/{bat_id}/logs             - Bat movement history
GET    /api/bats/barns/{barn_id}/logs      - All bat logs trong barn
```

**Frontend UI (`/bats`):**
- Grid 2x2 cho 4 bạt
- Nút LÊN/XUỐNG/STOP to
- Thanh tiến trình khi đang chạy
- Panel cài đặt (Esp32, kênh relay, timeout)
- Lịch sử hoạt động bên dưới

### Step 2.3: Equipment Type + Equipment ✅ DONE (2026-04-13)

**Files:**
- `src/iot/equipment_service.py` (267 lines) - Equipment CRUD service
- `src/server/routes/equipment.py` (191 lines) - REST API routes
- `static/js/pages/equipment.js` - Vue 3 UI
- `scripts/038_equipment_system.sql` - Database schema

**Features:**
- [x] CRUD EquipmentType (code, name, power, voltage, mqtt_protocol)
- [x] CRUD Equipment instances (fans, feeders, lights)
- [x] Link Equipment to Device Channel (device_id + channel_number)
- [x] Equipment assignment with device binding
- [x] Maintenance tracking (interval days, warranty dates)
- [x] Runtime hours tracking per equipment
- [x] Energy consumption monitoring
- [x] Equipment parts/maintenance system

**Tables:**
- `equipment_types` - Catalog of equipment types
- `equipment` - Actual installed equipment instances
- `equipment_parts` - Maintainable components
- `maintenance_logs` - Maintenance history

**API Endpoints:**
```
GET    /api/equipment/types              - List equipment types
POST   /api/equipment/types             - Create equipment type
GET    /api/equipment/types/{id}         - Get type details
PUT    /api/equipment/types/{id}         - Update type
DELETE /api/equipment/types/{id}         - Delete type

GET    /api/equipment?barn_id=X          - List equipment (filter by barn)
POST   /api/equipment                    - Create equipment
GET    /api/equipment/{id}               - Equipment details
PUT    /api/equipment/{id}               - Update equipment
DELETE /api/equipment/{id}               - Delete equipment
POST   /api/equipment/{id}/assign-channel - Assign to device channel
GET    /api/equipment/by-device/{device_id} - List equipment by device
```

### Step 2.4: Sensor Type + Sensor ✅ DONE

**Files:**
- `src/iot/sensor_service.py` (103 lines) - Sensor CRUD service
- `src/server/routes/sensors.py` (34 lines) - REST API routes
- `static/js/pages/sensors.js` - Vue 3 UI

**Features:**
- [x] CRUD SensorType (temperature, humidity, etc.)
- [x] CRUD Sensor (gán location, Device)
- [x] Sensor threshold configurations
- [x] Sensor calibration tracking
- [x] Telemetry data handling via MQTT

**Tables:**
- `sensor_types` - Catalog of sensor types
- `sensors` - Physical sensor instances
- `sensor_thresholds` - Alert thresholds per sensor
- `sensor_calibrations` - Calibration history

**API Endpoints:**
```
GET    /api/sensors/types                - List sensor types
POST   /api/sensors/types                - Create sensor type
GET    /api/sensors?barn_id=X            - List sensors
POST   /api/sensors                      - Create sensor
GET    /api/sensors/{id}                 - Sensor details
PUT    /api/sensors/{id}                 - Update sensor
DELETE /api/sensors/{id}                 - Delete sensor
GET    /api/sensors/by-device/{device_id} - Sensors by device
```

**Data Flow:**
```
Barn (1) ───< Device (N) ───< DeviceChannel (N)
                            │
                            ├──< Equipment (N) ───< EquipmentAssignmentLog
                            │
                            └──< Sensor (N) ───< SensorThresholdConfig
                                                    └──< SensorCalibration
```

**API Endpoints:**
```
POST   /api/device-types
GET    /api/device-types
...

POST   /api/devices
GET    /api/devices?barn_id=X
GET    /api/devices/{id}
PUT    /api/devices/{id}
DELETE /api/devices/{id}
POST   /api/devices/{id}/relay    (already exists)

POST   /api/equipment-types
...

POST   /api/equipment
GET    /api/equipment?barn_id=X
PUT    /api/equipment/{id}
DELETE /api/equipment/{id}

POST   /api/sensors
GET    /api/sensors?barn_id=X
PUT    /api/sensors/{id}
DELETE /api/sensors/{id}
```

---

## Phase 3: Inventory & Products

**Goal:** Supplier → Product → Inventory → Warehouse chain

### Step 3.1: Supplier Entity
- [ ] CRUD Supplier
- [ ] Contact info, categories
- [ ] Payment terms
- [ ] Test: Create supplier, link products

### Step 3.2: Product Entity
- [ ] CRUD Product (feed, medication, equipment)
- [ ] Link to Supplier
- [ ] Unit, barcode, min stock alert
- [ ] Test: Create product, verify supplier link

### Step 3.3: Inventory + Purchase Orders
- [ ] Stock tracking per Warehouse
- [ ] CRUD PurchaseOrder
- [ ] PurchaseOrderItems
- [ ] Auto-create inventory on PO received
- [ ] Low stock alert logic
- [ ] Test: Create PO, receive goods, verify inventory

**Data Flow:**
```
Supplier (1) ───< Product (N)
                        │
                        └──< Inventory (N) ───< InventoryTransaction (N)
                                                        ▲
                                                        │
                                              PurchaseOrder (received)
```

**API Endpoints:**
```
POST   /api/suppliers
GET    /api/suppliers
...

POST   /api/products
GET    /api/products?type=feed|medication|equipment
...

POST   /api/inventory
GET    /api/inventory?warehouse_id=X
PUT    /api/inventory/{id}

POST   /api/purchase-orders
GET    /api/purchase-orders
GET    /api/purchase-orders/{id}
PUT    /api/purchase-orders/{id}/receive
```

---

## Phase 4: Operations - Cycles & Care

**Goal:** Cycle → Care operations (Feed, Medication, Health)

### Step 4.1: Cycle Entity
- [ ] CRUD Cycle (chọn Barn)
- [ ] Cycle stages (chick → grower → adult)
- [ ] Stage transition logic
- [ ] Cycle status (active/closed/cancelled)
- [ ] Test: Create cycle, verify barn link, check status

### Step 4.2: Care - Feed
- [ ] FeedProgram per Cycle (multi-stage)
- [ ] FeedProgramItems (daily feeding schedule)
- [ ] CareFeeds (actual feed given per day)
- [ ] Inventory deduction on feed consumption
- [ ] Test: Add feed to cycle, verify inventory

### Step 4.3: Care - Medication
- [ ] Medication schedule per Cycle
- [ ] CareMedications log
- [ ] Inventory deduction
- [ ] Withdrawal days tracking
- [ ] Test: Record medication, verify inventory

### Step 4.4: Care - Health & Other
- [ ] CareDeaths (mortality tracking)
- [ ] CareWeights (batch weighing)
- [ ] WeightSamples (individual samples)
- [ ] HealthNotes
- [ ] Test: Record mortality, weights

**Data Flow:**
```
Barn (1) ───< Cycle (N) ───< CareFeed (N)
                  │              │
                  │              └──< FeedProgram (1) ───< FeedProgramItems (N)
                  │
                  ├──< CareMedication (N)
                  ├──< CareDeath (N)
                  ├──< CareWeight (N) ───< WeightSample (N)
                  │
                  └──< HealthNote (N)

Cycle status + Inventory:
Cycle.active → deduct inventory on feed/medication
Cycle.closed → final inventory reconciliation
```

**API Endpoints:**
```
POST   /api/cycles
GET    /api/cycles?barn_id=X&status=active
GET    /api/cycles/{id}
PUT    /api/cycles/{id}/close
DELETE /api/cycles/{id}

POST   /api/cycles/{id}/feed-program
GET    /api/cycles/{id}/feed-program
PUT    /api/cycles/{id}/feed-program

POST   /api/care-feeds
GET    /api/care-feeds?cycle_id=X

POST   /api/care-medications
GET    /api/care-medications?cycle_id=X

POST   /api/care-deaths
GET    /api/care-deaths?cycle_id=X

POST   /api/care-weights
GET    /api/care-weights?cycle_id=X
```

---

## Phase 5: Sync Integration & Polish (PAUSED)

**Goal:** Hoàn thiện sync infrastructure

**Status:** PAUSED - Tập trung local trước (2026-04-07)

### Future work:
- [ ] FieldMapper (column name mapping Local ↔ Cloud)
- [ ] ConflictResolver (last-write-wins strategy)
- [ ] Cloud Remote Commands via HTTPS proxy thay vì bidirectional sync

---

## Views (Future - Not in scope for Phase 1-5)

These can be added later when reporting needs are clear:

```
cycle_summary_view      - Cycle với barn, total feed, total deaths
inventory_summary_view - Current stock across warehouses
device_status_view     - Device với latest heartbeat
barn_overview_view     - Barn với active cycle, device count
```

---

## Implementation Notes

### Business Rules to Enforce:
1. **Farm**: Cannot delete if has Barns
2. **Barn**: Cannot delete if has active Cycle
3. **Cycle**: Can only close if all CareFeeds recorded
4. **Device**: Auto-set is_online=false after 2x heartbeat_interval no response
5. **Inventory**: Cannot go negative on deduction
6. **Equipment**: Cannot assign to Device if already assigned elsewhere

### Cascade Delete Rules:
- Farm → Barns → Cycles → Care*
- Barn → Devices, Sensors, Equipment
- Warehouse → Inventory

---

**Last Updated:** 2026-04-15 (Phase 2 complete: Equipment + Sensor)
