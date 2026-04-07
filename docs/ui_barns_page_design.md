# Barns Page - UI Design Specification

**Page:** `/barns`
**Purpose:** Quản lý chuồng trại - CRUD operations, view by farm, cycle status

---

## 1. Layout Structure

### Desktop View (> 1024px)
```
┌──────────────────────────────────────────────────────────────┐
│  🏠 Chuồng trại                              [+ Thêm chuồng] │
├──────────────────────────────────────────────────────────────┤
│  [Tất cả ▼ Farm 1] [Tìm kiếm...]                            │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │ 🏠 Barn A1     │ │ 🏠 Barn A2     │ │ 🏠 Barn B1     ││
│  │ Farm: Farm 1   │ │ Farm: Farm 1   │ │ Farm: Farm 2   ││
│  │ Sức chứa: 2000 │ │ Sức chứa: 1500 │ │ Sức chứa: 3000 ││
│  │ 🔄 1 đợt nuôi  │ │ ✅ Trống       │ │ 🔄 2 đợt nuôi  ││
│  │ [Sửa] [Xóa]   │ │ [Sửa] [Xóa]   │ │ [Sửa] [Xóa]   ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### Mobile View (< 768px)
```
┌─────────────────────────┐
│  🏠 Chuồng trại   [+]   │
├─────────────────────────┤
│  [Tất cả ▼ Farm 1]     │
├─────────────────────────┤
│  ┌───────────────────┐ │
│  │ 🏠 Barn A1        │ │
│  │ Farm: Farm 1     │ │
│  │ Sức chứa: 2000   │ │
│  │ 🔄 1 đợt nuôi    │ │
│  │ [Sửa] [Xóa]     │ │
│  └───────────────────┘ │
│  ┌───────────────────┐ │
│  │ 🏠 Barn B1        │ │
│  │ Farm: Farm 2     │ │
│  │ Sức chứa: 3000   │ │
│  │ ✅ Trống         │ │
│  └───────────────────┘ │
└─────────────────────────┘
```

---

## 2. Features

### Farm Filter Dropdown
- "Tất cả" option to show all barns
- Dropdown populated from API.farms.list()
- Selected farm filters barn list client-side

### Barn Card
- **Header:** Icon + Name + Code badge
- **Body:** Farm name, Capacity, Area (optional)
- **Footer:** Cycle status badge + Action buttons
- **Status badges:**
  - Green badge: "Đang nuôi" if has active cycles
  - Gray badge: "Trống" if no active cycles

### Create/Edit Modal
- **Fields:**
  - Farm (dropdown, required) - for both create and edit
  - Mã chuồng (code, required, max 50)
  - Tên chuồng (name, required, max 200)
  - Sức chứa (capacity, optional, number, > 0)
  - Diện tích (area_sqm, optional, number, > 0)
  - Mô tả (description, optional, max 1000)
  - Active (checkbox, default true)

### Delete Confirmation
- Show barn name and any active cycles warning
- If barn has active cycles, show error message

---

## 3. Component States

### Loading State
- Skeleton cards or spinner in grid

### Empty State (no barns)
- Icon: 🏠
- Message: "Chưa có chuồng trại nào"
- CTA button to create first barn

### Empty State (filtered by farm, no results)
- Icon: 🔍
- Message: "Không có chuồng nào thuộc farm này"

---

## 4. State Management (Vue 3 Composition API)

```javascript
setup() {
    // Data
    const barns = ref([]);
    const farms = ref([]);
    const selectedFarmId = ref(null); // null = all
    const searchQuery = ref('');
    const showModal = ref(false);
    const form = reactive({
        id: null,
        farm_id: '',
        code: '',
        name: '',
        capacity: null,
        area_sqm: null,
        description: '',
        active: true
    });
    const loading = ref(false);

    // Computed
    const filteredBarns = computed(() => {
        let result = barns.value;
        if (selectedFarmId.value) {
            result = result.filter(b => b.farm_id === selectedFarmId.value);
        }
        if (searchQuery.value) {
            const q = searchQuery.value.toLowerCase();
            result = result.filter(b =>
                b.name?.toLowerCase().includes(q) ||
                b.code?.toLowerCase().includes(q)
            );
        }
        return result;
    });

    // Methods
    async function loadBarns() { /* ... */ }
    async function loadFarms() { /* ... */ }
    function openForm(barn) { /* ... */ }
    async function save() { /* ... */ }
    async function remove(barn) { /* ... */ }

    return {
        barns,
        farms,
        selectedFarmId,
        searchQuery,
        filteredBarns,
        showModal,
        form,
        loading,
        openForm,
        save,
        remove
    };
}
```

---

## 5. API Integration

| Action | Endpoint | Method |
|--------|----------|--------|
| List barns | `/api/farm/barns` | GET |
| Get barn | `/api/farm/barns/{id}` | GET |
| Create barn | `/api/farm/barns` | POST |
| Update barn | `/api/farm/barns/{id}` | PUT |
| Delete barn | `/api/farm/barns/{id}` | DELETE |
| List farms | `/api/farm/farms` | GET |

### Barn Object Response
```json
{
    "id": 1,
    "farm_id": "farm_001",
    "farm_name": "Farm 1",
    "code": "barn_a1",
    "name": "Chuồng A1",
    "capacity": 2000,
    "area_sqm": 150.5,
    "description": "Chuồng nuôi gà thịt",
    "active": true,
    "active_cycle": true,
    "cycle_count": 1,
    "created_at": "2026-04-01T00:00:00Z"
}
```

---

## 6. Form Validation

| Field | Required | Validation |
|-------|----------|------------|
| farm_id | Yes | Must exist in farms table |
| code | Yes | 1-50 chars, alphanumeric with underscores/hyphens |
| name | Yes | 1-200 chars |
| capacity | No | > 0 if provided |
| area_sqm | No | > 0 if provided |
| description | No | Max 1000 chars |
| active | No | Boolean, default true |

### Error Messages
- "Farm không hợp lệ" - farm_id not found
- "Mã chuồng đã tồn tại" - code duplicate
- "Tên chuồng là bắt buộc" - name required
- "Sức chứa phải lớn hơn 0" - capacity must be positive

---

## 7. Delete Constraints

Barn cannot be deleted if:
1. Has active cycles → "Không thể xóa chuồng đang có đợt nuôi đang hoạt động"

---

**Last Updated:** 2026-04-07
