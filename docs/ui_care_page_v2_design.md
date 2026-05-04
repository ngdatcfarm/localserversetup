# Care Page V2 - Daily Chicken Care (Theo spec chi tiết)

**Page:** `/care`
**Mục tiêu:** Nhập liệu chăm sóc gà theo ngày và theo ca (Sáng/Chiều), tối ưu cho thao tác nhanh

---

## 1. So sánh Implementation Hiện tại vs Spec

### ✅ Đã có (Current care.js)
- Tab-based navigation (Feed, Death, Medication, Weight, Sale)
- Cycle selector
- Quick stats panel
- Forms cho từng loại care
- Recent logs display
- Delete functionality
- Mobile responsive layout

### ❌ Chưa có (Theo spec)

| Tính năng | Mô tả | Backend cần? |
|-----------|--------|-------------|
| **Shift-based input** | Sáng (<12h) / Chiều (>=12h) | Có - thêm field `shift` |
| **Day Status Header** | Đã nhập đủ / Thiếu ca / Chưa nhập | Có - logic tính toán |
| **Vaccine Tab** | Tích hợp vaccine schedule | Có - API vaccine schedule |
| **Health Flags** | cough, diarrhea, lethargy, respiratory | Có - bảng health_notes |
| **Water Consumption** | Theo dõi lượng nước | Có - bảng water_logs |
| **Environment Data** | temp, humidity, NH3 (IoT) | Có - từ sensors |
| **Alerts System** | feed drop, abnormal death | Có - alerts API |
| **Quick Presets** | "Giống hôm qua", "Không có gì bất thường" | Không |
| **Auto-fill** | Tự động điền từ ngày trước | Không |

---

## 2. Layout Mới

### Desktop View (> 1024px)
```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔄 Test Cycle | Barn A1 | Day 15 | 1,188 con | ⚠️ Thiếu ca chiều │
├─────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────┐ ┌─────────────────────────────────────┐│
│ │ 📅 Ngày: 2026-04-07   │ │ [Sáng] [Chiều] ← Ca toggle          ││
│ │ [◀ Prev] [Today] [Next ▶]│ │                                    ││
│ └─────────────────────────┘ └─────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─ SÁNG (đã nhập ✓) ─────────────────────────────────────────┐    │
│  │ 🌾 Feed: 50kg  💊 Med: Vitamin  💉 Vaccine: Gumboro ✓    │    │
│  │ ⚖️ Weight: 2.5kg avg  💀 Dead: 2  🩺 Health: OK         │    │
│  │ [Edit] [Delete]                                       [+ Thêm]│    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─ CHIỀU (chưa nhập) ─────────────────────────────────────────┐    │
│  │ ❓ Chưa có dữ liệu buổi chiều                              │    │
│  │ [+ Nhập nhanh] [Giống buổi sáng]                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ 📊 Tổng hợp hôm nay: Feed=100kg | Dead=3 | Avg W=2.5kg           │
│ ⚠️ Alerts: Tăng chết bất thường (+2 so với TB)                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Mobile View (< 768px)
```
┌─────────────────────────┐
│ 🔄 Cycle | Day 15      │
│ 1,188 con | ⚠️ Thiếu  │
├─────────────────────────┤
│ 📅 2026-04-07         │
│ [Sáng ●] [Chiều ○]    │
├─────────────────────────┤
│ ┌─────────────────────┐│
│ │ 🌾 Feed (Sáng)     ││
│ │ Amount: [50] kg    ││
│ │ Warehouse: [▼]     ││
│ │ Product: [▼]       ││
│ │ [Lưu]             ││
│ └─────────────────────┘│
│ ┌─────────────────────┐│
│ │ 💀 Death (Sáng)    ││
│ │ Count: [2]         ││
│ │ Reason: [▼]       ││
│ │ [Lưu]             ││
│ └─────────────────────┘│
├─────────────────────────┤
│ 📊 Today: 100kg | 3 dead│
└─────────────────────────┘
```

---

## 3. Chi tiết Từng Block

### 3.1 Header Bar (Day Status)
```javascript
const dayStatus = computed(() => {
    // Check if morning (shift 1) has data
    const hasMorning = feedLogs.value.some(l => l.shift === 'sang');
    const hasAfternoon = feedLogs.value.some(l => l.shift === 'chieu');

    if (hasMorning && hasAfternoon) return { text: 'Đã nhập đủ', class: 'green' };
    if (hasMorning || hasAfternoon) return { text: 'Thiếu ca', class: 'yellow' };
    return { text: 'Chưa nhập', class: 'gray' };
});
```

### 3.2 Feeding Block (mỗi ca)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| feed_amount | number | Yes | kg |
| feed_remaining_percent | number | No | % tồn kho |
| warehouse_id | select | No | Kho thức ăn |
| product_id | select | No | Loại thức ăn |
| notes | text | No | Ghi chú |

**Auto-calculate:**
```
feed_consumed = feed_amount + tồn đầu - tồn cuối
```

### 3.3 Medication Block
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| medication_name | text/select | Yes | Tên thuốc |
| medication_method | select | Yes | "water" (default) hoặc "feed" |
| medication_dosage | text | No | Liều lượng |
| notes | text | No | Ghi chú |

**UX:** Default = "water" (pha nước). Chỉ có 2 methods chính.

### 3.4 Vaccine Block
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| vaccine_today | auto | - | List từ schedule |
| administered | checkbox | Yes (if scheduled) | Đã tiêm |
| actual_vaccine | text | No | Nếu khác lịch |
| notes | text | No | Ghi chú |

**Logic:**
```javascript
// Lấy vaccine cần tiêm trong ngày dựa trên cycle day_age
const vaccinesToday = computed(() => {
    if (!selectedCycle.value) return [];
    const dayAge = getDayAge(selectedCycle.value.start_date);
    return vaccineSchedules.value.filter(v =>
        v.day_age_target === dayAge && !v.administered
    );
});
```

### 3.5 Weight Block
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sample_count | number | Yes | Số con cân |
| total_weight | number | Yes | kg |
| min_weight | number | No | kg (nhỏ nhất) |
| max_weight | number | No | kg (lớn nhất) |

**Auto-calculate:**
```
avg_weight = total_weight / sample_count
```

### 3.6 Death Block
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| count | number | Yes | Số con chết |
| cause | select | No | disease/predator/heat/cold/other |
| symptoms | text | No | Triệu chứng |

### 3.7 Health Block (NEW)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| health_flags | multi-select | No | cough, diarrhea, lethargy, respiratory |
| notes | text | No | Ghi chú sức khỏe |

### 3.8 Water Block (NEW)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| water_consumption | number | No | Lít |
| water_medicated | boolean | No | Có pha thuốc không |

### 3.9 Environment Block (Optional/IoT)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| temperature | number | No | °C (từ sensor) |
| humidity | number | No | % (từ sensor) |
| nh3 | number | No | ppm (từ sensor) |

---

## 4. Quick Actions & Presets

### 4.1 Quick Presets
```javascript
const presets = [
    { id: 'like_yesterday', label: '🔄 Giống hôm qua', action: fillLikeYesterday },
    { id: 'no_issues', label: '✅ Không có gì bất thường', action: fillNoIssues },
    { id: 'skip', label: '⏭️ Bỏ qua ca này', action: skipShift }
];
```

### 4.2 Auto-fill Logic
```javascript
async function fillLikeYesterday() {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayLogs = await getLogsForDate(yesterday);

    // Auto-fill forms với data của yesterday
    if (yesterdayLogs.feed) {
        feedForm.quantity = yesterdayLogs.feed.quantity;
        feedForm.warehouse_id = yesterdayLogs.feed.warehouse_id;
        feedForm.product_id = yesterdayLogs.feed.product_id;
    }
}
```

---

## 5. Alerts System

### 5.1 Alert Types
```javascript
const alertRules = {
    feed_drop: { threshold: 0.7, compare_to: 'avg_last_7_days' },
    abnormal_death: { threshold: 3, compare_to: 'avg_last_7_days' },
    low_consumption: { threshold: 0.5, compare_to: 'expected' },
    missed_vaccine: { cycle_day: 'scheduled_day' }
};
```

### 5.2 Alert Display
```html
<div v-if="alerts.length" class="alert-banner">
    <span v-for="alert in alerts" :key="alert.type"
        :class="alert.severity">
        ⚠️ {{ alert.message }}
    </span>
</div>
```

---

## 6. Backend API Changes Required

### 6.1 Care Logs - Thêm shift field
```sql
-- Migration: Thêm shift vào các bảng care
ALTER TABLE care_feeds ADD COLUMN shift VARCHAR(10) DEFAULT 'all_day';
ALTER TABLE care_deaths ADD COLUMN shift VARCHAR(10) DEFAULT 'all_day';
ALTER TABLE care_medications ADD COLUMN shift VARCHAR(10) DEFAULT 'all_day';
```

### 6.2 Vaccine Schedules - API cần có
```javascript
// GET /api/farm/vaccine-schedules?cycle_id={id}
// Response:
[{
    "id": 1,
    "cycle_id": 1,
    "vaccine_name": "Gumboro",
    "day_age_target": 14,
    "scheduled_date": "2026-04-15",
    "administered": false,
    "actual_date": null,
    "notes": null
}]
```

### 6.3 Health Notes - Bảng mới
```sql
CREATE TABLE care_health_notes (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50),
    health_date DATE NOT NULL,
    shift VARCHAR(10),
    health_flags JSONB, -- ["cough", "diarrhea"]
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 6.4 Water Logs - Bảng mới
```sql
CREATE TABLE care_water_logs (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50),
    water_date DATE NOT NULL,
    shift VARCHAR(10),
    consumption_liters DECIMAL(10,2),
    medicated BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 7. State Management (Vue 3)

```javascript
setup() {
    // ── State ──────────────────────────────────────
    const selectedDate = ref(new Date().toISOString().slice(0, 10));
    const currentShift = ref(getCurrentShift()); // 'sang' hoặc 'chieu'

    const logsByShift = computed(() => {
        // Group logs by shift
    });

    const dayStatus = computed(() => {
        // Calculate: đã nhập đủ / thiếu ca / chưa nhập
    });

    const vaccinesToday = computed(() => {
        // Get vaccines scheduled for today
    });

    const alerts = computed(() => {
        // Calculate alerts based on data
    });

    // ── Methods ───────────────────────────────────
    async function saveCareEntry(type, data) { /* ... */ }
    async function deleteCareEntry(type, id) { /* ... */ }
    function applyPreset(presetId) { /* ... */ }
    function fillLikeYesterday() { /* ... */ }

    return {
        selectedDate,
        currentShift,
        dayStatus,
        logsByShift,
        vaccinesToday,
        alerts,
        saveCareEntry,
        deleteCareEntry,
        applyPreset
    };
}
```

---

## 8. Implementation Plan

### Phase 1: Core Shift-Based Input (✅ Backend DONE)
1. [x] Thêm shift field vào backend (migration)
2. [x] Cập nhật API care logs để hỗ trợ shift
3. [ ] Rewrite care.js với shift header
4. [ ] Morning/Afternoon toggle
5. [ ] Day status indicator

### Phase 2: Complete Data Types (✅ Backend DONE)
6. [x] Health flags form & API
7. [x] Water consumption form & API
8. [ ] Environment data (from sensors) - IoT integration later

### Phase 3: Frontend Implementation (IN PROGRESS)
9. [ ] Care V2 UI - Shift-based layout
10. [ ] Day status header
11. [ ] Health & Water tabs
12. [ ] Vaccine tab với auto-schedule

### Phase 4: UX Enhancements
13. [ ] Quick presets
14. [ ] Auto-fill from yesterday
15. [ ] Alerts system
16. [ ] Daily summary

---

## 9. File Changes

| File | Changes |
|------|---------|
| `static/js/pages/care.js` | Complete rewrite |
| `src/farm/care_service.py` | Add shift support, health, water |
| `src/server/routes/farm.py` | New endpoints |
| Database migrations | New tables + shift column |

---

## 10. Success Criteria

- [ ] Nhập liệu < 10s / ca
- [ ] Shift header hiển thị đúng trạng thái
- [ ] Vaccine schedule tự động hiện đúng ngày
- [ ] Alerts hoạt động cho abnormal data
- [ ] Mobile: thao tác bằng 1 tay
- [ ] Desktop: hiển thị đầy đủ data

---

**Last Updated:** 2026-04-07
