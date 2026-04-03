# Kế hoạch: Hybrid Daily Logging - Local + Cloud

> **Updated**: 2026-04-03 - Đã implement Phase 1.1 + 1.2 (Auto-queue + Field mapping)

---

## Implementation Log

### 2026-04-03: Phase 1.1 + 1.2 Complete ✅

**Files Modified:**
- `E:\Local-server\src\farm\care_service.py` - Thêm sync_service import + queue_change() calls
- `E:\Local-server\src\farm\inventory_service.py` - Thêm sync_service import + queue_change() calls

**Changes:**
1. **care_service.py** - 5 methods updated with queue_change():
   - `log_feed()` → queue `care_feeds` với field mapping (meal→session, bags, kg_actual, remaining_pct)
   - `log_death()` → queue `care_deaths` với field mapping (count→quantity, cause→reason)
   - `log_medication()` → queue `care_medications` với field mapping (product_id→medication_id)
   - `log_weight()` → queue `weight_sessions`
   - `log_sale()` → queue `care_sales` với field mapping (count→quantity, total_weight→weight_kg, unit_price→price_per_kg)

2. **inventory_service.py** - 3 methods updated with queue_change():
   - `import_stock()` → queue `inventory_transactions`
   - `export_stock()` → queue `inventory_transactions`
   - `transfer_stock()` → queue 2 transactions (export + import)

**Field Mapping done at queue time:**
| Local (PostgreSQL) | Cloud (MySQL) | Note |
|---|---|---|
| `care_feeds.meal` | `session` | |
| `care_deaths.count` | `quantity` | |
| `care_deaths.cause` | `reason` | |
| `care_sales.count` | `quantity` | |
| `care_sales.total_weight` | `weight_kg` | |
| `care_sales.unit_price` | `price_per_kg` | |
| `care_medications.product_id` | `medication_id` | |

---

## Tình trạng hiện tại (As-Is)

### Local Server (FastAPI + TimescaleDB)

**Đã có:**
- `care_service.py` - log feed, death, medication, weight, sale (đơn giản)
- `inventory_service.py` - warehouse, products, import/export/transfer
- `feed_service.py` - feed brands, feed types
- `medication_service.py` - medication catalog
- Sync handlers cho: `care_feeds`, `care_deaths`, `care_medications`, `weight_sessions`, `care_sales`, `health_notes`

**Chưa có / Khác cloud:**
- Không có **AnomalyDetector** - không cảnh báo feed/death bất thường
- Không có **SnapshotService** - không recalculate daily snapshots
- Không có **EditPermission** - không có giới hạn thời gian sửa/xóa
- Không tự động **queue_change()** khi ghi care record
- Không tracking **gender split** (male/female) cho deaths/sales
- Không có **trough_check** cho feed
- Farm management UI và daily logging UI chưa có

### Cloud (PHP + MySQL) - Logic chi tiết

#### 1. CareAnomalyDetector
Phát hiện giá trị bất thường khi nhập:

**Feed:**
- So sánh số bao với **trung bình 7 ngày** gần nhất
- Cảnh báo nếu: `bags >= 3x avg` hoặc `bags <= 0.2x avg`
- Cảnh báo nếu **trùng** (cùng feed_type + session + ngày)

**Death:**
- So sánh số con chết với **trung bình 7 ngày**
- Cảnh báo nếu: `quantity >= 3x avg`
- Cảnh báo nếu `quantity > 20` (tuyệt đối)

**Sale:**
- Cảnh báo nếu **đã có sale** cùng ngày (trùng lặp)

#### 2. RecordedAtValidator
- `recorded_at` không được trước `cycle.start_date`
- `recorded_at` không được ở tương lai

#### 3. CareEditPermission
- **Edit**: trong vòng **3 ngày** (hoặc password override: `admin123`)
- **Delete**: trong vòng **2 ngày** (hoặc password override)
- Xóa death/sale → hoàn lại `current_quantity` của cycle

#### 4. SnapshotService
**Rất phức tạp** - tính daily snapshot cho cycle từ ngày event trở đi:

Tính toán cho mỗi ngày:
- `alive_total/male/female` = sống đầu ngày - chết - bán
- `bird_days_cumulative` += alive_total cuối ngày
- `feed_poured` = tổng kg_actual các feed
- `feed_consumed` = poured - remaining - waste(3%)
- `feed_cumulative` += feed_consumed
- **Moving average weight**: trung bình 2 sessions cân gần nhất
- `biomass_kg` = alive_male * avg_male + alive_female * avg_female
- `weight_produced` = biomass - biomass_day0 + sold_kg + dead_kg
- `FCR` = feed_cumulative / weight_produced

**Trigger**: sau mỗi care record (feed, death, sale, weight)

#### 5. Cycle Quantity Management
- Death → `current_quantity -= quantity`
- Sale → `current_quantity -= quantity`
- Delete death → `current_quantity += quantity`
- Delete sale → `current_quantity += quantity`
- Validation: death quantity < current_quantity

#### 6. Inventory Deduction
- Feed → tự động trừ `inventory_stock` theo barn_id + feed_type
- Medication → tự động trừ inventory
- Delete → hoàn lại stock

#### 7. EventController (Daily Log View)
Trang `/event/create?cycle_id=X&date=Y`:
- Hiển thị feeds/deaths/medications/sales theo **sáng/chiều**
- **Banner cảnh báo**: missed sessions (vàng=1, đỏ=2+)
- Kiểm tra **trough_check** cho bữa gần nhất
- Weight sessions hôm nay
- Vaccine schedules

---

## Vấn đề Sync hiện tại

### Local → Cloud (Push)
**Hiện tại CHƯA HOẠT ĐỘNG tự động**:
- Care records KHÔNG được tự động `queue_change()` vào sync_queue
- `care_service.py` chỉ ghi vào DB, không push lên cloud
- Cần thêm auto-queue khi ghi feed/death/medication/sale/weight

### Cloud → Local (Pull)
**Đã có handlers** trong `sync_service.py` cho:
- `care_feeds`, `care_deaths`, `care_medications`, `care_sales`, `weight_sessions`, `health_notes`

**Nhưng thiếu:**
- `inventory_transactions` sync
- `cycle_feed_programs`, `cycle_feed_program_items`
- Field mapping có thể chưa đúng (cần verify chi tiết)

### Field Mapping Issues phát hiện

| Cloud (MySQL) | Local (PostgreSQL) | Vấn đề |
|--------------|-------------------|---------|
| `care_feeds.bags` | `care_feeds.bags` | OK |
| `care_feeds.kg_actual` | `care_feeds.kg_actual` | OK |
| `care_feeds.remaining_pct` | local không có cột này | THIẾU |
| `care_feeds.session` | `care_feeds.meal` | KHÁC TÊN |
| `care_deaths.quantity` | `care_deaths.count` | KHÁC TÊN |
| `care_deaths.reason` | `care_deaths.cause` | KHÁC TÊN |
| `care_sales.weight_kg` | `care_sales.total_weight` | KHÁC TÊN |
| `care_sales.price_per_kg` | `care_sales.unit_price` | KHÁC TÊN |
| `weight_sessions.weight_samples` | local lưu trong `weight_details` | CẦN MAP |
| `feed_trough_checks` | local KHÔNG CÓ bảng này | THIẾU HOÀN TOÀN |
| `inventory_stock` (barn_id) | `inventory` (warehouse_id) | CẦU MAP |
| `cycle_feed_programs` | local KHÔNG CÓ bảng này | THIẾU |
| `cycle_feed_program_items` | local KHÔNG CÓ bảng này | THIẾU |

---

## Mô hình Hybrid đề xuất

```
┌─────────────────────────────────────────────────────────────┐
│                     LOCAL SERVER (Primary)                   │
│                  FastAPI + TimescaleDB                      │
│                                                             │
│  ┌─────────────┐   ┌──────────────┐   ┌────────────────┐   │
│  │ Barns/Cycle │   │ Daily Log    │   │  Inventory     │   │
│  │ Management  │   │ Forms        │   │  Management    │   │
│  └──────┬──────┘   └──────┬───────┘   └───────┬────────┘   │
│         │                │                   │             │
│         └────────────────┴───────────────────┘             │
│                          │                                 │
│    care_service + anomaly_detector + snapshot_service       │
│                          │                                 │
│              ┌───────────┴───────────┐                   │
│              │    Sync Queue        │                   │
│              │  (auto on every write)│                   │
│              └───────────┬───────────┘                   │
└──────────────────────────┼──────────────────────────────────┘
                           │ PUSH (auto)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   CLOUD (Secondary)                            │
│                PHP + MySQL (cfarm_app_raw)                    │
│                                                              │
│  ┌──────────────────┐     ┌─────────────────────────────┐   │
│  │ CareController   │     │ SyncController::receive()    │   │
│  │ (CRUD + View)   │     │ → apply_change()             │   │
│  │ + Anomaly check │     │ → upsert care records        │   │
│  └────────┬─────────┘     │                             │   │
│           │               └─────────────────────────────┘   │
│           │                                                  │
│  ┌────────┴────────────────────────────────────────┐       │
│  │ SnapshotService + Cycle quantity management     │       │
│  └─────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

---

## Cần làm (To-Do)

### Phase 1: Fix Sync Infrastructure

#### 1.1 Auto-Queue Care Records (Local)
- [x] Sửa `care_service.py`: sau khi ghi feed/death/medication/sale → gọi `queue_change()`
- [x] Sửa `inventory_service.py`: sau khi import/export/transfer → gọi `queue_change()`
- [x] Thêm `sync_to_cloud()` call trong mỗi care method (queue_change đã được gọi, sync tự chạy trong background loop)

#### 1.2 Fix Field Mapping (SyncService)
- [x] `care_feeds.meal` → `session` (cloud) - đã map trong payload mỗi khi queue_change
- [x] `care_deaths.count` → `quantity` (cloud) - đã map trong payload
- [x] `care_deaths.cause` → `reason` (cloud) - đã map trong payload
- [x] `care_sales.total_weight` → `weight_kg` (cloud) - đã map trong payload
- [x] `care_sales.unit_price` → `price_per_kg` (cloud) - đã map trong payload
- [x] Thêm `remaining_pct` và `session` vào care_feeds sync - đã thêm vào payload
- [x] Map `care_medications.product_id` → `medication_id` (cloud) - đã map trong payload
- [ ] Verify weight_sessions vs weight_details mapping (cần kiểm tra weight_samples array)
- [ ] `care_sales.gender` column - local chưa có, cloud có

#### 1.3 Add Missing Tables to Sync
- [ ] Thêm `feed_trough_checks` table vào local (hoặc map sang care_feeds.remaining_pct)
- [ ] Thêm `cycle_feed_programs` table vào local
- [ ] Thêm `cycle_feed_program_items` table vào local
- [ ] Inventory: map `inventory_items` ↔ `products`, `inventory_stock` ↔ `inventory`

### Phase 2: Anomaly Detection + Validation (Local)

#### 2.1 AnomalyDetector Service (Local)
```python
class CareAnomalyDetector:
    def check_feed(cycle_id, feed_type_id, bags, session, recorded_at) -> list[str]
    def check_death(cycle_id, quantity, recorded_at) -> list[str]
    def check_sale(cycle_id, recorded_at) -> list[str]
```

#### 2.2 RecordedAtValidator (Local)
- Validate recorded_at không trước cycle.start_date
- Validate recorded_at không ở tương lai

#### 2.3 EditPermission (Local)
- Edit deadline: 3 ngày
- Delete deadline: 2 ngày
- Override password support

### Phase 3: Snapshot Service (Local)

#### 3.1 SnapshotService
```python
class SnapshotService:
    async def recalculate_from_day(cycle_id, from_day: int)
    async def recalculate_cycle(cycle_id)
```

Tính toán:
- `alive_total/male/female` với gender split
- `bird_days_cumulative`
- `feed_poured/consumed/cumulative`
- Moving average weight (last 2 sessions)
- `biomass_kg`, `weight_produced_kg`, `FCR`

#### 3.2 Trigger Snapshot
- Sau mỗi feed/death/sale/weight record
- Hook vào `care_service` methods

### Phase 4: Farm Management UI (Local)

#### 4.1 Barns/Cycles
- [ ] Barn CRUD view
- [ ] Cycle CRUD view
- [ ] Feed program setup (assign feed_brand to cycle)

#### 4.2 Daily Logging
- [ ] EventController logic (sáng/chiều, banner missed sessions)
- [ ] Feed form với anomaly detection
- [ ] Death form với anomaly detection
- [ ] Medication form
- [ ] Sale form với duplicate check
- [ ] Weight form
- [ ] Trough check form

#### 4.3 Inventory UI
- [ ] Stock view by barn
- [ ] Import/export/transfer forms
- [ ] Low stock alerts

### Phase 5: Sync Cloud → Local

#### 5.1 Inventory Sync
- [ ] `inventory_items` → `products` upsert
- [ ] `inventory_stock` (barn_id) → `inventory` (warehouse_id) upsert
- [ ] `inventory_transactions` → `inventory_transactions` sync

#### 5.2 Feed Program Sync
- [ ] `cycle_feed_programs` → local table
- [ ] `cycle_feed_program_items` → local table
- [ ] Verify feed_stages mapping

---

## Database Schema Mapping

### care_feeds
| Cloud (MySQL) | Local (PostgreSQL) |
|--------------|-------------------|
| id | id |
| cycle_id | cycle_id |
| feed_type_id | feed_type_id |
| bags | bags |
| kg_actual | kg_actual |
| session (morning/evening) | meal |
| remaining_pct | **THIẾU** → thêm cột |
| recorded_at | feed_date |
| note | notes |

### care_deaths
| Cloud (MySQL) | Local (PostgreSQL) |
|--------------|-------------------|
| id | id |
| cycle_id | cycle_id |
| quantity | count |
| reason | cause |
| symptoms | symptoms |
| recorded_at | death_date |
| note | notes |

### care_medications
| Cloud (MySQL) | Local (PostgreSQL) |
|--------------|-------------------|
| id | id |
| cycle_id | cycle_id |
| medication_id | product_id |
| medication_name | (not in local) |
| dosage | quantity |
| unit | **THIẾU** |
| method | method |
| recorded_at | med_date |
| note | notes |

### care_sales
| Cloud (MySQL) | Local (PostgreSQL) |
|--------------|-------------------|
| id | id |
| cycle_id | cycle_id |
| quantity | count |
| gender | **THIẾU** |
| weight_kg | total_weight |
| price_per_kg | unit_price |
| total_amount | **THIẾU** |
| recorded_at | sale_date |
| note | notes |

### weight_sessions
| Cloud (MySQL) | Local (PostgreSQL) |
|--------------|-------------------|
| id | id |
| cycle_id | cycle_id |
| day_age | day_age |
| sample_count | sample_count |
| avg_weight_g | avg_weight_g |
| weighed_at | weigh_date |
| weight_samples | weight_details |

### cycle_feed_programs (Cloud only - local cần tạo)
| Cloud | Local |
|-------|-------|
| id | id |
| cycle_id | cycle_id |
| feed_brand_id | feed_brand_id |
| start_date | start_date |
| end_date | end_date |

---

## Priority Implementation Order

1. **Fix auto-queue care records** - trước nhất, để sync hoạt động
2. **Fix field mapping** - đảm bảo dữ liệu đúng khi sync
3. **Add missing columns** - remaining_pct, gender, unit_price → local
4. **Test sync** - push care record, verify cloud nhận đúng
5. **AnomalyDetector** - port sang Python
6. **SnapshotService** - port sang Python + async
7. **Farm UI** - barns, cycles, daily log forms
8. **Inventory sync** - complex mapping

---

## Ghi chú quan trọng

- **Local là primary**: vẫn ghi được khi mất cloud
- **Cloud là secondary**: nhận data từ local, tính snapshot, xem/báo cáo
- **Snapshot cloud**: sau khi nhận care record từ local, cloud trigger SnapshotService
- **Conflict resolution**: care records dùng local ID, cloud upsert theo ID
- **Config data**: cloud là master (feed_brands, medications, vaccines), local là copy
