# Care Operations - Daily Logging Documentation

**Mục tiêu:** Ghi lại tất cả chức năng care operations đã implement và logic chi tiết của từng operation.

**Test Date:** 2026-04-07

---

## 1. Tổng quan Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     CARE OPERATIONS                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Cycle (bắt đầu đợt nuôi)                                    │
│    │                                                          │
│    ├── Feed (cho ăn) ──────────► care_feeds                  │
│    │                            └──► inventory (trừ kho)      │
│    │                                                          │
│    ├── Medication (thuốc) ──────► care_medications            │
│    │                            └──► inventory (trừ kho)      │
│    │                                                          │
│    ├── Death (tử vong) ─────────► care_deaths                │
│    │                            └──► cycles.current_count (-)  │
│    │                                                          │
│    ├── Weight (cân) ────────────► care_weights               │
│    │                                                          │
│    └── Sale (bán) ───────────────► care_sales                │
│                                 └──► cycles.current_count (-)  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Cycle - Đợt nuôi

### 2.1 Cycle Dashboard KPIs

| KPI | Công thức | Nguồn |
|-----|-----------|-------|
| `alive_count` | `initial_count - total_deaths - total_sold` | cycles + care_deaths + care_sales |
| `mortality_rate` | `total_deaths / initial_count × 100` | care_deaths |
| `total_feed_kg` | `SUM(quantity)` | care_feeds |
| `feed_per_bird_day` | `today_feed_kg / alive_count × 1000` | care_feeds |
| `latest_weight` | MAX(weigh_date) | care_weights |
| `day_age` | `TODAY - start_date` | cycles |

### 2.2 Logic khi tạo Cycle

**Bảng:** `cycles`

**Fields:**
- `barn_id` - Chuồng nào
- `name` - Tên đợt nuôi
- `breed` - Giống
- `initial_count` - Số lượng ban đầu
- `current_count` - Số lượng hiện tại ( = initial_count khi tạo)
- `start_date` - Ngày bắt đầu
- `status` - active | closed | cancelled
- `stage` - chick | grower | adult

**API:**
```
POST   /api/farm/cycles              - Tạo cycle mới
GET    /api/farm/cycles              - Danh sách cycles
GET    /api/farm/cycles/{id}         - Chi tiết cycle
GET    /api/farm/cycles/{id}/dashboard - Dashboard với KPIs
PUT    /api/farm/cycles/{id}        - Cập nhật cycle
POST   /api/farm/cycles/{id}/close  - Đóng cycle
```

---

## 3. Feed - Cho ăn

### 3.1 Bảng: `care_feeds`

| Field | Type | Mô tả |
|-------|------|-------|
| `id` | serial | Primary key |
| `cycle_id` | int | FK → cycles |
| `barn_id` | str | FK → barns |
| `feed_date` | date | Ngày cho ăn |
| `meal` | str | Bữa ăn: sang, trua, chieu, toi, all_day |
| `product_id` | int | FK → products (nullable) |
| `feed_type_id` | int | FK → feed_types (nullable) |
| `quantity` | float | Số kg |
| `bags` | float | Số bao (nullable) |
| `kg_actual` | float | Số kg thực (nullable) |
| `remaining` | float | Thức ăn còn lại (nullable) |
| `remaining_pct` | float | % còn lại (nullable) |
| `warehouse_id` | int | FK → warehouses (nullable) |
| `notes` | str | Ghi chú |
| `created_at` | timestamp | |

### 3.2 Logic khi log Feed

```
1. INSERT vào care_feeds
2. NẾU có warehouse_id + product_id:
      → Gọi inventory_service.export_stock()
      → Trừ quantity từ inventory
3. Queue sync to cloud
```

**Inventory Deduction:**
```python
# care_service.log_feed() line 17-26
if data.get("warehouse_id") and data.get("product_id"):
    result = await inventory_service.export_stock({
        "warehouse_id": data["warehouse_id"],
        "product_id": data["product_id"],
        "quantity": data["quantity"],
        "reference_type": "feed_log",
        "notes": f"Cho ăn {data.get('barn_id', '')} {data.get('feed_date', '')}",
    })
```

### 3.3 Dashboard Feed KPIs

| KPI | Công thức |
|-----|-----------|
| `total_feed_kg` | `SUM(care_feeds.quantity)` |
| `today_feed_kg` | `SUM(quantity) WHERE feed_date = TODAY` |
| `feed_per_bird_day` | `today_feed_kg / alive_count × 1000` (g/con/ngày) |

### 3.4 API

```
POST /api/farm/care/feed              - Log cho ăn
GET  /api/farm/care/feed/{cycle_id}  - Lịch sử cho ăn
GET  /api/farm/care/feed/{cycle_id}/daily - Tổng hợp theo ngày
```

**Request Example:**
```json
{
    "cycle_id": 3,
    "barn_id": "6",
    "feed_date": "2026-04-07",
    "meal": "sang",
    "quantity": 120.5,
    "notes": "Test cho an"
}
```

---

## 4. Medication - Thuốc/Vaccine/Vitamin

### 4.1 Bảng: `care_medications`

| Field | Type | Mô tả |
|-------|------|-------|
| `id` | serial | Primary key |
| `cycle_id` | int | FK → cycles |
| `barn_id` | str | FK → barns |
| `med_date` | date | Ngày cho thuốc |
| `med_type` | str | vaccine, medicine, antibiotic, vitamin, probiotic |
| `product_id` | int | FK → products (nullable) |
| `medication_id` | int | FK → medications (nullable) |
| `medication_name` | str | Tên thuốc |
| `quantity` | float | Số lượng |
| `unit` | str | Đơn vị: g, ml, liều |
| `dosage` | str | Liều dùng |
| `method` | str | water, inject, spray, feed |
| `warehouse_id` | int | FK → warehouses (nullable) |
| `purpose` | str | Mục đích |
| `notes` | str | Ghi chú |
| `created_at` | timestamp | |

### 4.2 Logic khi log Medication

```
1. INSERT vào care_medications
2. NẾU có warehouse_id + product_id + quantity:
      → Gọi inventory_service.export_stock()
      → Trừ quantity từ inventory
3. Queue sync to cloud
```

**Inventory Deduction:**
```python
# care_service.log_medication() line 139-149
if data.get("warehouse_id") and data.get("product_id") and data.get("quantity"):
    result = await inventory_service.export_stock({
        "warehouse_id": data["warehouse_id"],
        "product_id": data["product_id"],
        "quantity": data["quantity"],
        "reference_type": "medication",
        "notes": f"{data.get('med_type', '')} {data.get('barn_id', '')}",
    })
```

### 4.3 API

```
POST /api/farm/care/medication           - Log thuốc
GET  /api/farm/care/medication/{cycle_id} - Lịch sử thuốc
```

**Request Example:**
```json
{
    "cycle_id": 3,
    "barn_id": "6",
    "med_date": "2026-04-07",
    "med_type": "vitamin",
    "quantity": 100,
    "method": "water",
    "purpose": "Bo vitamin tang suc de cuong",
    "notes": "Test thuoc"
}
```

### 4.4 Danh mục thuốc: `medications`

```
GET    /api/farm/medications            - Danh sách thuốc
POST   /api/farm/medications             - Tạo thuốc mới
PUT    /api/farm/medications/{id}        - Cập nhật
DELETE /api/farm/medications/{id}        - Xóa (kiểm tra in-use)
```

**Categories:** vaccine, medicine, antibiotic, vitamin, probiotic

---

## 5. Death - Tử vong

### 5.1 Bảng: `care_deaths`

| Field | Type | Mô tả |
|-------|------|-------|
| `id` | serial | Primary key |
| `cycle_id` | int | FK → cycles |
| `barn_id` | str | FK → barns |
| `death_date` | date | Ngày chết |
| `count` | int | Số con chết |
| `cause` | str | Nguyên nhân: disease, predator, heat, cold, other |
| `symptoms` | str | Triệu chứng |
| `notes` | str | Ghi chú |
| `created_at` | timestamp | |

### 5.2 Logic khi log Death

```
1. INSERT vào care_deaths
2. UPDATE cycles.current_count = current_count - count
3. Queue sync to cloud
```

**Cycle Update:**
```python
# care_service.log_death() line 97-99
await db.execute(
    "UPDATE cycles SET current_count = current_count - $1, updated_at = NOW() WHERE id = $2",
    data["count"], data["cycle_id"],
)
```

### 5.3 Dashboard Death KPIs

| KPI | Công thức |
|-----|-----------|
| `total_deaths` | `SUM(care_deaths.count)` |
| `mortality_rate` | `total_deaths / initial_count × 100` |
| `today_deaths` | `SUM(count) WHERE death_date = TODAY` |

### 5.4 API

```
POST /api/farm/care/death              - Log tử vong
GET  /api/farm/care/death/{cycle_id}   - Lịch sử tử vong
GET  /api/farm/care/death/{cycle_id}/daily - Tổng hợp theo ngày
```

**Request Example:**
```json
{
    "cycle_id": 3,
    "barn_id": "6",
    "death_date": "2026-04-07",
    "count": 5,
    "cause": "chuot",
    "notes": "Chet vi chuot an"
}
```

---

## 6. Weight - Cân trọng lượng

### 6.1 Bảng: `care_weights`

| Field | Type | Mô tả |
|-------|------|-------|
| `id` | serial | Primary key |
| `cycle_id` | int | FK → cycles |
| `barn_id` | str | FK → barns |
| `weigh_date` | date | Ngày cân |
| `sample_count` | int | Số con cân |
| `total_weight` | float | Tổng kg |
| `avg_weight` | float | Trung bình kg/con (auto-calculated) |
| `min_weight` | float | Nhẹ nhất |
| `max_weight` | float | Nặng nhất |
| `uniformity` | float | Độ đồng đều % |
| `day_age` | int | Ngày tuổi (auto-calculated) |
| `notes` | str | Ghi chú |
| `created_at` | timestamp | |

### 6.2 Logic khi log Weight

```
1. Tính day_age = weigh_date - cycle.start_date
2. Tính avg_weight = total_weight / sample_count
3. INSERT vào care_weights
4. UPDATE weight_reminders.next_remind_date += remind_every_days
5. Queue sync to cloud
```

**Day Age Calculation:**
```python
# care_service.log_weight() line 197-202
day_age = None
cycle = await db.fetchrow(
    "SELECT start_date FROM cycles WHERE id = $1", data["cycle_id"]
)
if cycle:
    day_age = (data["weigh_date"] - cycle["start_date"]).days
```

### 6.3 Dashboard Weight

| KPI | Nguồn |
|-----|-------|
| `latest_weight.avg_weight` | MAX(weigh_date) → avg_weight |
| `latest_weight.weigh_date` | MAX(weigh_date) |
| `latest_weight.day_age` | MAX(weigh_date) → day_age |

### 6.4 API

```
POST /api/farm/care/weight                    - Log cân
GET  /api/farm/care/weight/{cycle_id}         - Lịch sử cân
GET  /api/farm/care/weight/reminders          - Nhắc cân sắp tới
PUT  /api/farm/care/weight/reminders/{cycle_id} - Cập nhật reminder
```

**Request Example:**
```json
{
    "cycle_id": 3,
    "barn_id": "6",
    "weigh_date": "2026-04-07",
    "sample_count": 50,
    "total_weight": 125.5,
    "min_weight": 2.3,
    "max_weight": 2.8,
    "uniformity": 85.0,
    "notes": "Mau tot"
}
```

---

## 7. Sale - Xuất bán

### 7.1 Bảng: `care_sales`

| Field | Type | Mô tả |
|-------|------|-------|
| `id` | serial | Primary key |
| `cycle_id` | int | FK → cycles |
| `barn_id` | str | FK → barns |
| `sale_date` | date | Ngày bán |
| `count` | int | Số con bán |
| `total_weight` | float | Tổng kg |
| `avg_weight` | float | TB/con |
| `unit_price` | float | Giá/kg |
| `total_amount` | float | Tổng tiền |
| `buyer` | str | Người mua |
| `sale_type` | str | sale hoặc cull |
| `notes` | str | Ghi chú |
| `created_at` | timestamp | |

### 7.2 Logic khi log Sale

```
1. INSERT vào care_sales
2. UPDATE cycles.current_count = current_count - count
3. Queue sync to cloud
```

### 7.3 API

```
POST /api/farm/care/sale              - Log bán
GET  /api/farm/care/sale/{cycle_id}   - Lịch sử bán
```

---

## 8. Feed Catalog (Không liên quan trực tiếp đến care)

### 8.1 Feed Brands: `feed_brands`

| Field | Type |
|-------|------|
| `id` | serial |
| `name` | str |
| `kg_per_bag` | float |
| `code` | str |
| `note` | str |
| `status` | active/inactive |

**API:**
```
GET    /api/farm/feed-brands
POST   /api/farm/feed-brands
GET    /api/farm/feed-brands/{id}
PUT    /api/farm/feed-brands/{id}
DELETE /api/farm/feed-brands/{id}  (kiểm tra in-use)
```

### 8.2 Feed Types: `feed_types`

| Field | Type |
|-------|------|
| `id` | serial |
| `feed_brand_id` | int FK |
| `code` | str |
| `name` | str |
| `price_per_bag` | float |
| `suggested_stage` | chick/grower/adult |
| `status` | active/inactive |

**API:**
```
GET    /api/farm/feed-types
POST   /api/farm/feed-types
GET    /api/farm/feed-types/{id}
PUT    /api/farm/feed-types/{id}
DELETE /api/farm/feed-types/{id}  (kiểm tra in-use)
```

---

## 9. Inventory (Kho) - Phụ thuộc

### 9.1 Bảng: `products`

| Field | Type |
|-------|------|
| `id` | serial |
| `code` | str |
| `name` | str |
| `product_type` | feed hoặc medicine |
| `unit` | kg, g, ml, liều |

**API:**
```
GET    /api/farm/products
POST   /api/farm/products
```

### 9.2 Bảng: `inventory`

| Field | Type |
|-------|------|
| `id` | serial |
| `warehouse_id` | int FK |
| `product_id` | int FK |
| `quantity` | float |
| `batch_number` | str |
| `expiry_date` | date |

### 9.3 Inventory Operations

```
POST /api/farm/inventory/import    - Nhập kho
POST /api/farm/inventory/export    - Xuất kho (trừ)
POST /api/farm/inventory/transfer  - Chuyển kho
GET  /api/farm/inventory          - Xem tồn kho
GET  /api/farm/inventory/transactions - Lịch sử
```

---

## 10. Các bảng phụ trợ

### 10.1 Barns: `barns`

**API:**
```
GET    /api/farm/barns
POST   /api/farm/barns
GET    /api/farm/barns/{id}
PUT    /api/farm/barns/{id}
DELETE /api/farm/barns/{id}  (không xóa được nếu có active cycle)
```

### 10.2 Farms: `farms`

**API:**
```
GET    /api/farm/farms
POST   /api/farm/farms
GET    /api/farm/farms/{id}
PUT    /api/farm/farms/{id}
DELETE /api/farm/farms/{id}  (không xóa được nếu có barns)
```

### 10.3 Warehouses: `warehouses`

**API:**
```
GET    /api/farm/warehouses
POST   /api/farm/warehouses
GET    /api/farm/warehouses/{id}
PUT    /api/farm/warehouses/{id}
DELETE /api/farm/warehouses/{id}  (không xóa được nếu có inventory)
```

---

## 11. Test Results (2026-04-07) - Docker PostgreSQL

### 11.1 Environment

| Entity | ID | Giá trị |
|--------|----|---------|
| Farm | farm-test | Trang trai Test |
| Barn | barn-01 | Chuong Test |
| Cycle | 1 | Dot 1 - 2026, 3000 con, day_age=0 |

**Database:** Docker PostgreSQL (port 5434)
**Server:** localhost:8002

### 11.2 Test Cases

| # | Operation | Kết quả | Chi tiết |
|---|-----------|---------|----------|
| 1 | Log Feed (no inventory) | ✅ PASS | 100kg |
| 2 | Log Death | ✅ PASS | -3 con, current_count=2997 |
| 3 | Log Medication | ✅ PASS | Vitamin 50g |
| 4 | Log Weight | ✅ PASS | 50 con, avg 2.5kg |
| 5 | Dashboard Update | ✅ PASS | mortality_rate=0.1%, feed_per_bird=33.4g |
| 6 | **Feed WITH Inventory** | ✅ PASS | 50kg → inventory 500→450kg |
| 7 | Inventory Transaction Log | ✅ PASS | export -50kg, feed_log reference |

### 11.3 Calculated Values (Sau test)

| KPI | Giá trị | Công thức |
|-----|---------|-----------|
| alive_count | 2997 | 3000 - 3 |
| total_deaths | 3 | |
| mortality_rate | 0.1% | 3/3000×100 |
| total_feed_kg | 150.0 | 100 + 50 |
| feed_per_bird_day | 50.1g | 150kg/2997×1000 |
| avg_weight | 2.5kg | 125kg/50 |
| day_age | 0 | 2026-04-07 - 2026-04-07 |
| inventory_after | 450kg | 500 - 50 |

---

## 12. Cleanup Script (Docker PostgreSQL)

```sql
-- Xóa test data (chạy sau khi test xong)

-- Xóa inventory transactions trước (foreign key)
DELETE FROM inventory_transactions WHERE warehouse_id = 1;

-- Xóa inventory
DELETE FROM inventory WHERE warehouse_id = 1;

-- Xóa care records cho cycle 1
DELETE FROM care_weights WHERE cycle_id = 1;
DELETE FROM care_deaths WHERE cycle_id = 1;
DELETE FROM care_medications WHERE cycle_id = 1;
DELETE FROM care_feeds WHERE cycle_id = 1;

-- Reset cycle count
UPDATE cycles SET current_count = initial_count WHERE id = 1;

-- Xóa test entities (nếu cần)
DELETE FROM warehouses WHERE code = 'WH-FEED';
DELETE FROM products WHERE code = 'FEED-001';
-- DELETE FROM cycles WHERE id = 1;
-- DELETE FROM barns WHERE id = 'barn-01';
-- DELETE FROM farms WHERE id = 'farm-test';
```

**Docker Commands:**
```bash
# Backup database
docker cp cfarm-db:/var/lib/postgresql/data F:/Backup/cfarm_db

# Xóa containers và volumes (reset hoàn toàn)
docker-compose down -v

# Restore database
docker cp F:/Backup/cfarm_db cfarm-db:/var/lib/postgresql/data
docker-compose up -d
```

---

**Last Updated:** 2026-04-07 PM
