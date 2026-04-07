# Cycles Page - UI Design Specification

**Page:** `/cycles`
**Purpose:** Quản lý đợt nuôi - CRUD, view cycles by barn/status, close cycle

---

## 1. Layout Structure

### Desktop View (> 1024px)
```
┌────────────────────────────────────────────────────────────────┐
│  🔄 Đợt nuôi                                    [+ Tạo đợt mới]│
├────────────────────────────────────────────────────────────────┤
│  [Tất cả ▼ Barn]  [Tìm kiếm...]                               │
│  [Tất cả] [Đang nuôi] [Đã kết thúc]  ← tabs                  │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 🔄 Đợt 1 - T3/2026    [Active]    Farm A / Barn A1     │ │
│  │ ─────────────────────────────────────────────────────── │ │
│  │ 🐔 1,200 con  |  📅 Day 15  |  🌾 850kg  |  💀 12 (1%)  │ │
│  │ ─────────────────────────────────────────────────────── │ │
│  │ [Chi tiết] [Kết thúc]                                   │ │
│  └──────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 🔄 Đợt 2 - T2/2026    [Closed]    Farm B / Barn B2     │ │
│  │ ─────────────────────────────────────────────────────── │ │
│  │ 🐔 950 con  |  📅 45 days  |  🌾 1,200kg  |  💀 50 (5%)│ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Mobile View (< 768px)
```
┌─────────────────────────────┐
│  🔄 Đợt nuôi          [+]   │
├─────────────────────────────┤
│  [Barn ▼] [🔍 Tìm...]      │
│  [Tất cả][Đang nuôi][Kết]  │
├─────────────────────────────┤
│  ┌───────────────────────┐ │
│  │ 🔄 Đợt 1 - T3/2026   │ │
│  │ Farm A / Barn A1     │ │
│  │ ──────────────────── │ │
│  │ 🐔 1,200 | Day 15   │ │
│  │ 🌾 850kg | 💀 12    │ │
│  │ ──────────────────── │ │
│  │ [Chi tiết] [Kết thúc]│ │
│  └───────────────────────┘ │
└─────────────────────────────┘
```

---

## 2. Features

### Filter Bar
- **Barn Filter:** Dropdown with all barns + "Tất cả chuồng"
- **Search:** Filter cycles by name
- **Status Tabs:** Tất cả | Đang nuôi | Đã kết thúc

### Cycle Card/Row
- **Header:** Cycle name + Status badge
- **Body:** Farm name, Barn name, Breed
- **Stats row:** Current count, Day age, Total feed, Mortality
- **Footer:** Action buttons

### Cycle Stats (calculated/computed)
- **Day Age:** Calculated from start_date to today
- **Mortality Rate:** (initial_count - current_count - sales) / initial_count * 100
- **Feed Total:** Sum of all feed records for this cycle

### Create Modal
- **Fields:**
  - Barn (dropdown, required) - only barns with no active cycle
  - Tên đợt (name, optional - auto-generate if empty)
  - Giống (breed, optional)
  - Số lượng ban đầu (initial_count, required, > 0)
  - Ngày bắt đầu (start_date, required, default today)

### Close Cycle Flow
1. Click "Kết thúc" button
2. Confirmation modal with:
   - Summary of cycle stats
   - End date (default today)
   - Notes (optional)
   - Force close checkbox (if no feeding records)
3. On confirm → API.cycles.close()

### View Cycle Details
- Click "Chi tiết" → Navigate to `/cycles/{id}`
- Opens Cycle Detail Page (separate page)

---

## 3. Component States

### Loading State
- Skeleton cards or spinner

### Empty State (no cycles at all)
- Icon: 🔄
- Message: "Chưa có đợt nuôi nào"
- CTA: "Tạo đợt nuôi đầu tiên"

### Empty State (filtered, no results)
- Icon: 🔍
- Message: "Không có đợt nuôi nào phù hợp"

### Form Validation Errors
- Barn required
- Initial count > 0
- Start date required
- Barn must not have active cycle

---

## 4. State Management (Vue 3 Composition API)

```javascript
setup() {
    // Data
    const cycles = ref([]);
    const barns = ref([]);
    const farms = ref([]);
    const filterBarn = ref('');
    const filterStatus = ref(''); // '', 'active', 'closed'
    const searchQuery = ref('');
    const showModal = ref(false);
    const showCloseModal = ref(false);
    const cycleToClose = ref(null);
    const loading = ref(false);

    const form = reactive({
        barn_id: '',
        name: '',
        breed: '',
        initial_count: null,
        start_date: new Date().toISOString().slice(0, 10)
    });

    const closeForm = reactive({
        end_date: new Date().toISOString().slice(0, 10),
        notes: '',
        force: false
    });

    // Computed
    const filteredCycles = computed(() => {
        let result = cycles.value;
        if (filterBarn.value) {
            result = result.filter(c => c.barn_id == filterBarn.value);
        }
        if (filterStatus.value) {
            result = result.filter(c => c.status === filterStatus.value);
        }
        if (searchQuery.value) {
            const q = searchQuery.value.toLowerCase();
            result = result.filter(c => c.name?.toLowerCase().includes(q));
        }
        return result;
    });

    const availableBarns = computed(() => {
        return barns.value.filter(b => !b.active_cycle || b.id == form.barn_id);
    });

    // Methods
    async function loadCycles() { /* ... */ }
    async function loadBarnsAndFarms() { /* ... */ }
    function getBarnName(barnId) { /* ... */ }
    function getFarmName(farmId) { /* ... */ }
    function getDayAge(startDate) { /* ... */ }
    function openForm() { /* ... */ }
    async function save() { /* ... */ }
    function openCloseModal(cycle) { /* ... */ }
    async function confirmClose() { /* ... */ }

    return {
        cycles,
        barns,
        farms,
        filterBarn,
        filterStatus,
        searchQuery,
        filteredCycles,
        availableBarns,
        showModal,
        showCloseModal,
        form,
        closeForm,
        cycleToClose,
        loading,
        openForm,
        save,
        openCloseModal,
        confirmClose,
        getBarnName,
        getFarmName,
        getDayAge,
        fmtDate,
        fmtNum
    };
}
```

---

## 5. API Integration

| Action | Endpoint | Method |
|--------|----------|--------|
| List cycles | `/api/farm/cycles` | GET |
| Get cycle | `/api/farm/cycles/{id}` | GET |
| Create cycle | `/api/farm/cycles` | POST |
| Update cycle | `/api/farm/cycles/{id}` | PUT |
| Close cycle | `/api/farm/cycles/{id}/close` | POST |
| List barns | `/api/farm/barns` | GET |
| List farms | `/api/farm/farms` | GET |
| Feed history | `/api/farm/care/feed/{cycleId}` | GET |

### Cycle Object Response
```json
{
    "id": 1,
    "barn_id": 1,
    "barn_name": "Barn A1",
    "farm_id": "farm_001",
    "farm_name": "Farm 1",
    "name": "Đợt 1 - T3/2026",
    "code": "CYC-001",
    "breed": "Gà Ri",
    "status": "active",
    "initial_count": 1200,
    "current_count": 1188,
    "start_date": "2026-03-15",
    "end_date": null,
    "created_at": "2026-03-15T00:00:00Z"
}
```

---

## 6. Create Cycle Validation

| Field | Required | Validation |
|-------|----------|------------|
| barn_id | Yes | Must exist, must not have active cycle |
| name | No | Auto-generate if empty |
| breed | No | Max 200 chars |
| initial_count | Yes | > 0 |
| start_date | Yes | Valid date, default today |

### Error Messages
- "Vui lòng chọn chuồng" - barn_id required
- "Số lượng ban đầu phải lớn hơn 0" - initial_count must be > 0
- "Chuồng này đang có đợt nuôi hoạt động" - barn has active cycle

---

## 7. Close Cycle Validation

| Field | Required | Validation |
|-------|----------|------------|
| end_date | Yes | >= start_date |
| notes | No | Max 1000 chars |
| force | No | Boolean, bypasses feed check |

### Close Constraints
- Cycle must have feeding records (or use force=true)
- API returns error if no feeding records

---

**Last Updated:** 2026-04-07
