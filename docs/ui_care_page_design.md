# Care Page - UI Design Specification

**Page:** `/care`
**Purpose:** Daily farm operations logging (Feed, Death, Medication, Weight, Sale)

---

## 1. Layout Structure

### Desktop View (> 1024px)
```
┌─────────────────────────────────────────────────────────────┐
│  Header: "Chăm sóc gia cầm"                    [Cycle: ▼]   │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌────────────────────────────────────┐   │
│  │  Quick Stats │  │  Care Forms (Tab-based)           │   │
│  │  - Alive     │  │  [Feed] [Death] [Med] [Weight]    │   │
│  │  - Day Age   │  │  [Sale]                            │   │
│  │  - FCR      │  │                                    │   │
│  │  - Mortality │  │  Form fields here...               │   │
│  │              │  │                                    │   │
│  └──────────────┘  │  [Submit Button]                   │   │
│                    └────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Recent Logs Table                                   │   │
│  │  Date | Type | Details | Actions                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Mobile View (< 768px)
```
┌─────────────────────┐
│  ☰  Chăm sóc   [📱]│
├─────────────────────┤
│  [Cycle ▼]          │
├─────────────────────┤
│  Quick Stats Cards  │
│  ┌───┐ ┌───┐ ┌───┐│
│  │ 🔢 │ │📅 │ │ 💊││
│  └───┘ └───┘ └───┘│
├─────────────────────┤
│  ┌─────────────────┐│
│  │ Tab Buttons     ││
│  │ [F] [D] [M]    ││
│  │ [W] [S]        ││
│  └─────────────────┘│
│  ┌─────────────────┐│
│  │                 ││
│  │  Form           ││
│  │                 ││
│  └─────────────────┘│
│  [Submit Button]    │
├─────────────────────┤
│  Recent Logs        │
│  ┌─────────────────┐│
│  │ Log Item 1      ││
│  │ Log Item 2      ││
│  └─────────────────┘│
├─────────────────────┤
│ 🏠 📊 🩺 ⚡ 📹     │
└─────────────────────┘
```

---

## 2. Components

### Cycle Selector
- Dropdown với search
- Hiển thị: `Cycle Name (Barn ID) - Day X`
- Chỉ show active cycles
- Required - không chọn không thể log

### Quick Stats Panel
| Stat | Calculation | Display |
|------|-------------|---------|
| Alive | initial - deaths - sales | Số con |
| Day Age | today - start_date | X ngày |
| FCR | total_feed / (alive * avg_weight) | X.XX |
| Mortality | deaths / initial * 100 | X% |

### Tab Buttons
| Tab | Icon | Color | Form Fields |
|-----|------|-------|-------------|
| Feed | 🌾 | green | meal, quantity, warehouse, product |
| Death | 💀 | red | count, cause, symptoms |
| Medication | 💊 | purple | med_type, product, quantity, method |
| Weight | ⚖️ | blue | sample, total_weight, min, max |
| Sale | 💰 | yellow | count, weight, price, buyer |

### Form Structure

**Feed Form:**
- Meal: Select (sang, trua, chieu, toi, all_day)
- Quantity (kg): Number input
- Warehouse: Select từ feed warehouses
- Product: Select từ feed products
- Date: Date picker (default today)
- Note: Text input

**Death Form:**
- Count: Number input (required, > 0)
- Date: Date picker
- Cause: Select enum (disease, predator, heat, cold, other)
- Symptoms: Text input
- Note: Text input

**Medication Form:**
- Med Type: Select (vaccine, medicine, antibiotic, vitamin, probiotic)
- Product: Select từ medications
- Quantity: Number input
- Method: Select (water, inject, spray, eye_drop, feed, other)
- Warehouse: Select từ medicine warehouses
- Date: Date picker
- Note: Text input

**Weight Form:**
- Sample Count: Number input (required)
- Total Weight (g): Number input
- Min Weight (g): Number input
- Max Weight (g): Number input
- Date: Date picker
- Note: Text input
- Auto-calculate: avg = total / sample

**Sale Form:**
- Count: Number input (required)
- Total Weight (kg): Number input
- Unit Price (VND): Number input
- Buyer: Text input
- Date: Date picker
- Note: Text input
- Auto-calculate: total = count * weight * price

### Recent Logs Table
Columns:
- Date
- Type (icon + label)
- Details (quantity, meal, etc.)
- Actions (edit, delete - icon buttons)

Mobile: Card-based list

---

## 3. State Management

```javascript
setup() {
    // Data
    const cycles = ref([]);
    const selectedCycle = ref(null);
    const currentTab = ref('feed');

    // Forms
    const feedForm = reactive({ meal: 'all_day', quantity: 0, ... });
    const deathForm = reactive({ count: 0, cause: '', ... });
    // ...

    // UI State
    const loading = ref(false);
    const submitting = ref(false);

    // Computed
    const quickStats = computed(() => { ... });
    const canSubmit = computed(() => { ... });

    // Methods
    async function loadCycles() { ... }
    async function submitForm() { ... }
    function switchTab(tab) { ... }

    return { ... };
}
```

---

## 4. API Mapping

| Action | API Endpoint | Method |
|--------|-------------|--------|
| Load cycles | `/api/farm/cycles?status=active` | GET |
| Load warehouses | `/api/farm/warehouses` | GET |
| Load products | `/api/farm/products` | GET |
| Log feed | `/api/farm/care/feed` | POST |
| Log death | `/api/farm/care/death` | POST |
| Log medication | `/api/farm/care/medication` | POST |
| Log weight | `/api/farm/care/weight` | POST |
| Log sale | `/api/farm/care/sale` | POST |
| Delete log | `/api/farm/care/{type}/{id}` | DELETE |

---

## 5. Validation Rules

| Field | Rule | Error Message |
|-------|------|---------------|
| Death count | > 0 | "Số lượng phải > 0" |
| Weight sample | > 0 | "Số mẫu phải > 0" |
| Sale count | > 0 | "Số lượng phải > 0" |
| Quantity | > 0 | "Số lượng phải > 0" |

---

## 6. UX Details

### Submit Flow
1. User fills form
2. Click "Ghi nhận"
3. Show loading spinner, disable button
4. API call
5. Success: Clear form, show toast, refresh logs
6. Error: Show error toast, keep form data

### Delete Flow
1. Click delete icon on log
2. Confirm modal: "Xóa bản ghi này?"
3. OK → API DELETE
4. Success: Remove from list, show toast
5. Error: Show error toast

### Empty States
- No cycles: "Không có đợt nuôi đang hoạt động"
- No logs: "Chưa có bản ghi nào"

---

## 7. Implementation Checklist

- [ ] Cycle selector component
- [ ] Quick stats panel
- [ ] Tab navigation
- [ ] Feed form + submission
- [ ] Death form + submission
- [ ] Medication form + submission
- [ ] Weight form + submission
- [ ] Sale form + submission
- [ ] Recent logs list
- [ ] Delete log functionality
- [ ] Loading states
- [ ] Error handling
- [ ] Mobile responsive layout

---

**Last Updated:** 2026-04-07
