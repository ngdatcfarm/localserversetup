# Entity Logic Roadmap

**Mục tiêu:** Xây dựng business logic cho từng entity theo đúng data dependency hierarchy.

**Sync Status:** Hybrid sync đang hoạt động (Local ↔ Cloud, errors=0)

---

## Progress Overview

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1: Farm Infrastructure | ✅ Done | 100% |
| Phase 2: IoT Infrastructure | ⬜ Pending | 0% |
| Phase 3: Inventory & Products | ⬜ Pending | 0% |
| Phase 4: Operations (Cycles & Care) | ⬜ Pending | 0% |
| Phase 5: Sync Integration | ⬜ Pending | 0% |

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

---

## Phase 2: IoT Infrastructure

**Goal:** Device → Equipment/Sensor hierarchy với MQTT integration

### Step 2.1: Device Type Entity
- [ ] CRUD DeviceType (relay count, config template)
- [ ] MQTT protocol schema definition
- [ ] Test: Create device type, verify template

### Step 2.2: Device Entity
- [ ] CRUD Device (gán Barn nào)
- [ ] Device code (ESP32 serial from MQTT)
- [ ] Online/heartbeat status (already exists via MQTT listener)
- [ ] Device firmware link
- [ ] Test: Verify MQTT heartbeat updates device status

### Step 2.3: Equipment Type + Equipment
- [ ] CRUD EquipmentType
- [ ] CRUD Equipment (fans, feeders, lights)
- [ ] Link Equipment to Device Channel
- [ ] Equipment assignment log
- [ ] Test: Assign equipment to device channel

### Step 2.4: Sensor Type + Sensor
- [ ] CRUD SensorType (temp, humidity, nhiet do)
- [ ] CRUD Sensor (gán location, Device)
- [ ] Sensor calibration tracking
- [ ] Threshold configs
- [ ] Test: Create sensor, verify telemetry

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

## Phase 5: Sync Integration & Polish

**Goal:** Hoàn thiện sync infrastructure

### Step 5.1: FieldMapper
- [ ] Column name mapping Local ↔ Cloud
- [ ] Handle `initial_count` vs `initial_quantity`
- [ ] Handle `note` vs `notes`

### Step 5.2: ConflictResolver
- [ ] Last-write-wins strategy
- [ ] Or merge strategy for critical data

### Step 5.3: Cloud Remote Commands
- [ ] Cloud → Local: Relay control via sync
- [ ] Cloud → Local: Device config push
- [ ] Test: Trigger relay from cloud UI

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

**Last Updated:** 2026-04-04
