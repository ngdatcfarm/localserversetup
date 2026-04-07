# API Schema Validation Checklist

**Date:** 2026-04-07
**Purpose:** Kiểm tra API endpoints và schema validation cho Phase 1 completion

---

## 1. API Endpoints Summary

### Farm Routes (`/api/farm/*`)

| # | Endpoint | Method | Mô tả | Status |
|---|----------|--------|--------|--------|
| 1 | /farms | GET | List farms | ✅ |
| 2 | /farms | POST | Create farm | ✅ |
| 3 | /farms/{id} | GET | Get farm | ✅ |
| 4 | /farms/{id} | PUT | Update farm | ✅ |
| 5 | /farms/{id} | DELETE | Delete farm | ✅ |
| 6 | /barns | GET | List barns | ✅ |
| 7 | /barns | POST | Create barn | ✅ |
| 8 | /barns/{id} | GET | Get barn | ✅ |
| 9 | /barns/{id} | PUT | Update barn | ✅ |
| 10 | /barns/{id} | DELETE | Delete barn | ✅ |
| 11 | /cycles | GET | List cycles | ✅ |
| 12 | /cycles | POST | Create cycle | ✅ |
| 13 | /cycles/{id} | GET | Get cycle | ✅ |
| 14 | /cycles/{id} | GET /dashboard | Cycle dashboard | ✅ |
| 15 | /cycles/{id} | PUT | Update cycle | ✅ |
| 16 | /cycles/{id} | POST /close | Close cycle | ✅ |
| 17 | /cycles/{id} | GET /snapshots | Daily snapshots | ✅ |
| 18 | /warehouses | GET | List warehouses | ✅ |
| 19 | /warehouses | POST | Create warehouse | ✅ |
| 20 | /warehouses/{id} | GET | Get warehouse | ✅ |
| 21 | /warehouses/{id} | PUT | Update warehouse | ✅ |
| 22 | /warehouses/{id} | DELETE | Delete warehouse | ✅ |
| 23 | /warehouse-zones | GET | List zones | ✅ |
| 24 | /warehouse-zones | POST | Create zone | ✅ |
| 25 | /warehouse-zones/{id} | DELETE | Delete zone | ✅ |
| 26 | /products | GET | List products | ✅ |
| 27 | /products | POST | Create product | ✅ |
| 28 | /inventory | GET | Get inventory | ✅ |
| 29 | /inventory/import | POST | Import stock | ✅ |
| 30 | /inventory/export | POST | Export stock | ✅ |
| 31 | /inventory/transfer | POST | Transfer stock | ✅ |
| 32 | /inventory/transactions | GET | Transaction history | ✅ |
| 33 | /care/feed | POST | Log feed | ✅ |
| 34 | /care/feed/{cycle_id} | GET | Feed history | ✅ |
| 35 | /care/feed/{cycle_id}/daily | GET | Daily feed summary | ✅ |
| 36 | /care/death | POST | Log death | ✅ |
| 37 | /care/death/{cycle_id} | GET | Death history | ✅ |
| 38 | /care/death/{cycle_id}/daily | GET | Daily death summary | ✅ |
| 39 | /care/medication | POST | Log medication | ✅ |
| 40 | /care/medication/{cycle_id} | GET | Medication history | ✅ |
| 41 | /care/weight | POST | Log weight | ✅ |
| 42 | /care/weight/{cycle_id} | GET | Weight history | ✅ |
| 43 | /care/weight/reminders | GET | Weight reminders | ✅ |
| 44 | /care/weight/reminders/{cycle_id} | PUT | Update reminder | ✅ |
| 45 | /care/sale | POST | Log sale | ✅ |
| 46 | /care/sale/{cycle_id} | GET | Sale history | ✅ |
| 47 | /care/sale/{sale_id} | DELETE | Delete sale log | ✅ |
| 48 | /care/feed/{feed_id} | DELETE | Delete feed log | ✅ |
| 49 | /care/death/{death_id} | DELETE | Delete death log | ✅ |
| 50 | /care/medication/{med_id} | DELETE | Delete medication log | ✅ |
| 51 | /care/weight/{weight_id} | DELETE | Delete weight log | ✅ |

### Farm Extended Routes (`/api/farm/*`)

| # | Endpoint | Method | Mô tả | Status |
|---|----------|--------|--------|--------|
| 52 | /feed-brands | GET | List feed brands | ✅ |
| 53 | /feed-brands | POST | Create feed brand | ✅ |
| 54 | /feed-brands/{id} | GET/PUT/DELETE | CRUD brand | ✅ |
| 55 | /feed-types | GET/POST | List/Create feed types | ✅ |
| 56 | /feed-types/{id} | GET/PUT/DELETE | CRUD feed type | ✅ |
| 57 | /medications | GET/POST | List/Create medications | ✅ |
| 58 | /medications/{id} | GET/PUT/DELETE | CRUD medication | ✅ |
| 59 | /suppliers | GET/POST | List/Create suppliers | ✅ |
| 60 | /suppliers/{id} | GET/PUT/DELETE | CRUD supplier | ✅ |
| 61 | /vaccine-programs | GET/POST | List/Create programs | ✅ |
| 62 | /vaccine-programs/{id} | GET/PUT/DELETE | CRUD program | ✅ |
| 63 | /vaccine-programs/{id}/items | POST | Add program item | ✅ |
| 64 | /vaccine-schedules | GET | List schedules | ✅ |
| 65 | /vaccine-schedules/upcoming | GET | Upcoming vaccines | ✅ |
| 66 | /vaccine-schedules | POST | Create schedule | ✅ |
| 67 | /vaccine-schedules/apply-program | POST | Apply program | ✅ |
| 68 | /vaccine-schedules/{id}/done | POST | Mark done | ✅ |
| 69 | /vaccine-schedules/{id}/skip | POST | Skip vaccine | ✅ |
| 70 | /health-notes | GET/POST | List/Create health notes | ✅ |
| 71 | /health-notes/{id}/resolve | POST | Resolve note | ✅ |
| 72 | /weight-sessions | GET/POST | List/Create sessions | ✅ |

---

## 2. Schema Validation Issues

### Issue 1: FarmRequest

```python
class FarmRequest(BaseModel):
    id: str              # ❌ Nên có min_length
    name: str            # ❌ Nên có min_length
```

**Cần thêm:**
- `id: str = Field(..., min_length=1, max_length=50)`
- `name: str = Field(..., min_length=1, max_length=200)`

### Issue 2: BarnRequest

```python
class BarnRequest(BaseModel):
    id: str              # ❌ Nên validate format (slug)
    farm_id: str = "farm-01"  # ⚠️ Default không nên hardcode
```

**Cần thêm:**
- `id: str = Field(..., pattern=r'^[a-z0-9-]+$')` (slug format)
- Validate farm_id tồn tại khi tạo barn

### Issue 3: CycleRequest

```python
class CycleRequest(BaseModel):
    initial_count: int   # ❌ Cần > 0
    barn_id: str        # ❌ Cần validate tồn tại
```

**Cần thêm:**
- `initial_count: int = Field(..., gt=0)`
- Validate barn_id tồn tại

### Issue 4: WarehouseRequest

```python
class WarehouseRequest(BaseModel):
    code: str           # ❌ Nên unique
    warehouse_type: Optional[str]  # ❌ Cần enum validation
```

**Cần thêm:**
- `warehouse_type: Literal["feed", "medication", "equipment", "consumable", "mixed"]`

### Issue 5: ProductRequest

```python
class ProductRequest(BaseModel):
    product_type: str   # ❌ Cần enum
    unit: str = "kg"    # ❌ Cần enum
```

**Cần thêm:**
- `product_type: Literal["feed", "medicine"]`
- `unit: Literal["kg", "g", "ml", "l", "unit", "chai", "vie"]`

### Issue 6: FeedLogRequest

```python
class FeedLogRequest(BaseModel):
    meal: str = "all_day"  # ❌ Cần enum
    quantity: float         # ❌ Cần > 0
```

**Cần thêm:**
- `meal: Literal["sang", "trua", "chieu", "toi", "all_day"]`
- `quantity: float = Field(..., gt=0)`

### Issue 7: DeathLogRequest

```python
class DeathLogRequest(BaseModel):
    count: int    # ❌ Cần > 0
    cause: Optional[str]  # ❌ Cần enum
```

**Cần thêm:**
- `count: int = Field(..., gt=0)`
- `cause: Literal["disease", "predator", "heat", "cold", "other"]`

### Issue 8: MedicationLogRequest

```python
class MedicationLogRequest(BaseModel):
    med_type: str   # ❌ Cần enum
    quantity: Optional[float]  # ❌ Cần > 0 nếu có
```

**Cần thêm:**
- `med_type: Literal["vaccine", "medicine", "antibiotic", "vitamin", "probiotic"]`

### Issue 9: WeightLogRequest

```python
class WeightLogRequest(BaseModel):
    sample_count: int    # ❌ Cần > 0
    total_weight: float   # ❌ Cần > 0
```

**Cần thêm:**
- `sample_count: int = Field(..., gt=0)`
- `total_weight: float = Field(..., gt=0)`

### Issue 10: SaleLogRequest

```python
class SaleLogRequest(BaseModel):
    count: int    # ❌ Cần > 0
    sale_type: str = "sale"  # ❌ Cần enum
```

**Cần thêm:**
- `count: int = Field(..., gt=0)`
- `sale_type: Literal["sale", "cull"]`

---

## 3. Business Logic Validation Checklist

### CRUD Delete Validations

| # | Entity | Delete Rule | Status |
|---|--------|-------------|--------|
| 1 | Farm | Không xóa nếu có barns | ✅ |
| 2 | Farm | Không xóa nếu có warehouses | ✅ |
| 3 | Barn | Không xóa nếu có active cycle | ✅ |
| 4 | Barn | Không xóa nếu có devices | ✅ |
| 5 | Warehouse | Không xóa nếu có inventory | ✅ |
| 6 | Cycle | Không xóa được (chỉ close) | ✅ |

### Create Validations

| # | Entity | Create Rule | Status |
|---|--------|-------------|--------|
| 1 | Barn | farm_id phải tồn tại | ✅ |
| 2 | Cycle | barn_id phải tồn tại | ✅ |
| 3 | Cycle | barn_id phải không có active cycle | ✅ |
| 4 | Feed Log | cycle_id phải tồn tại | ✅ |
| 5 | Feed Log | warehouse_id + product_id phải tồn tại (nếu có) | ✅ |
| 6 | Death Log | cycle_id phải tồn tại | ✅ |
| 7 | Medication Log | cycle_id phải tồn tại | ✅ |
| 8 | Import Stock | warehouse_id + product_id phải tồn tại | ✅ |
| 9 | Export Stock | warehouse_id + product_id phải tồn tại | ✅ |
| 10 | Export Stock | inventory phải đủ (quantity > available) | ✅ |

### Update Validations

| # | Entity | Update Rule | Status |
|---|--------|-------------|--------|
| 1 | Cycle Close | Kiểm tra tất cả feeds đã ghi nhận | ❓ |
| 2 | Cycle Close | Cập nhật final_quantity | ❓ |
| 3 | Barn Update | Không đổi farm_id nếu có cycles | ✅ |
| 4 | Barn Update | farm_id phải tồn tại | ❓ |

---

## 4. Missing API Endpoints

### Có thể thiếu:

| # | Endpoint | Mô tả | Priority |
|---|----------|--------|----------|
| 1 | DELETE /cycles/{id} | Xóa cycle (nếu cần) | Low |
| 2 | GET /farms/{id}/summary | Farm với barn count, warehouse count | Medium |
| 3 | GET /barns/{id}/summary | Barn với active cycle, device count | Medium |
| 4 | GET /cycles/{id}/summary | Cycle summary (KPIs) | Medium |
| 5 | DELETE /care/feed/{id} | Xóa feed log (undo) | Medium |
| 6 | DELETE /care/death/{id} | Xóa death log (undo) | Medium |
| 7 | DELETE /care/medication/{id} | Xóa medication log (undo) | Medium |
| 8 | PUT /care/feed/{id} | Sửa feed log | Medium |

---

## 5. Test Scenarios for Validation

### Test 1: Farm Validation
```bash
# Thiếu required fields
POST /api/farm/farms {}  # → 422 Validation Error

# Empty name
POST /api/farm/farms {"id": "test", "name": ""}  # → 422

# Valid
POST /api/farm/farms {"id": "farm-test", "name": "Test Farm"}  # → 201
```

### Test 2: Barn Validation
```bash
# farm_id không tồn tại
POST /api/farm/barns {"id": "barn-1", "farm_id": "nonexistent"}  # → 400

# Valid
POST /api/farm/barns {"id": "barn-1", "farm_id": "farm-test"}  # → 201
```

### Test 3: Cycle Validation
```bash
# barn_id không tồn tại
POST /api/farm/cycles {"barn_id": "nonexistent", "name": "c1"}  # → 400

# barn có active cycle rồi
POST /api/farm/cycles {"barn_id": "barn-01", "name": "c2"}  # → 400 (barn đã có cycle active)
```

### Test 4: Inventory Validation
```bash
# Export nhiều hơn tồn kho
POST /api/farm/inventory/export {"warehouse_id": 1, "product_id": 1, "quantity": 99999}  # → 400
```

---

## 6. Priority Work Items

### High Priority (Must Fix)
1. [x] Add Pydantic Field validation cho all Request models (farm.py, farm_extended.py)
2. [x] Validate barn_id exists khi tạo Barn
3. [x] Validate barn_id exists khi tạo Cycle
4. [x] Validate warehouse_id + product_id exists khi import/export stock
5. [x] Farm không xóa được nếu có barns
6. [x] Barn không xóa được nếu có active cycle
7. [x] Warehouse không xóa được nếu có inventory

### Medium Priority (Should Fix)
1. [x] Cycle không tạo được nếu barn đã có active cycle
2. [x] Export stock không cho phép > available quantity
3. [x] Cycle close → validate feeds recorded
4. [x] Thêm DELETE endpoints cho care logs
5. [x] Barn không xóa được nếu có devices
6. [x] Barn Update → không đổi farm_id nếu có cycles

### Low Priority (Nice to Have)
1. [ ] Thêm summary endpoints cho Farm/Barn/Cycle
2. [ ] API pagination cho list endpoints
3. [ ] API filtering đầy đủ

---

**Last Updated:** 2026-04-07
