# Dashboard Page - UI Design Specification

**Page:** `/`
**Purpose:** Overview của toàn bộ farm - KPIs, active cycles, alerts, quick actions

---

## 1. Layout Structure

### Desktop View (> 1024px)
```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard                                    [Refresh]    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│  │ 🌾  │ │ 🐔  │ │ 📊  │ │ 📡  │ │ ⚠️  │ │ ☁️  │       │
│  │Barns│ │Cycles│ │Birds│ │Devs │ │Alerts│ │Sync │       │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘       │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────┐ ┌────────────────────┐ │
│  │  Active Cycles               │ │  Quick Actions     │ │
│  │  ┌────────────────────────┐   │ │  ┌──────────────┐  │ │
│  │  │ Cycle Card            │   │ │  │ + New Cycle  │  │ │
│  │  │ - Name, Barn, Age    │   │ │  │ + Log Feed   │  │ │
│  │  │ - Stats               │   │ │  │ + Add Death  │  │ │
│  │  └────────────────────────┘   │ │  │ + Weight     │  │ │
│  │                               │ │  └──────────────┘  │ │
│  └──────────────────────────────┘ └────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────┐ ┌────────────────────┐   │
│  │  Upcoming Vaccines (7 days) │ │  Recent Alerts    │   │
│  │  - Vaccine list             │ │  - Alert list     │   │
│  └──────────────────────────────┘ └────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Mobile View (< 768px)
```
┌─────────────────────┐
│  Dashboard    [↻]   │
├─────────────────────┤
│  ┌───┐ ┌───┐ ┌───┐ │
│  │ 5 │ │12 │ │8K │ │
│  │BRN│ │CYC│ │BRD│ │
│  └───┘ └───┘ └───┘ │
│  ┌───┐ ┌───┐ ┌───┐ │
│  │ 6 │ │ 2 │ │OFF│ │
│  │DEV│ │ALR│ │SYNC│ │
│  └───┘ └───┘ └───┘ │
├─────────────────────┤
│  Quick Actions       │
│  ┌─────────────────┐│
│  │ + New Cycle     ││
│  │ + Log Feed      ││
│  │ + Add Death     ││
│  └─────────────────┘│
├─────────────────────┤
│  Active Cycles       │
│  ┌─────────────────┐│
│  │ Cycle 1         ││
│  │ 1200 con - Day 15││
│  ├─────────────────┤│
│  │ Cycle 2         ││
│  │ 800 con - Day 8 ││
│  └─────────────────┘│
├─────────────────────┤
│  🏠 📊 🩺 ⚡ 📹     │
└─────────────────────┘
```

---

## 2. KPI Cards

| Metric | Icon | Color | Calculation |
|--------|------|-------|-------------|
| Farms | 🏠 | green | Count of farms |
| Active Cycles | 🔄 | blue | Cycles with status='active' |
| Total Birds | 🐔 | green | Sum of current_count |
| Devices Online | 📡 | purple | Online / Total |
| Alerts | ⚠️ | red | Unresolved alerts count |
| Cloud Sync | ☁️ | gray | ON/OFF/Paused |

---

## 3. Components

### KPI Card
```
┌────────────────┐
│  [Icon]        │
│  Value         │
│  Label         │
│  [Trend?/Sub]  │
└────────────────┘
```

### Cycle Card
```
┌────────────────────────────────────┐
│  Cycle Name            [Status]   │
│  Barn Name - Day X               │
│  ────────────────────────────    │
│  🐔 1,200  |  🌾 850kg  |  💀 2% │
│  ────────────────────────────    │
│  [View Details]                   │
└────────────────────────────────────┘
```

### Quick Action Button
```
┌────────────────────┐
│  [Icon] Action     │
└────────────────────┘
```

---

## 4. State Management

```javascript
setup() {
    // Data
    const stats = reactive({ farms: 0, cycles: 0, birds: 0, devices: 0, online: 0, alerts: 0 });
    const cycles = ref([]);
    const alerts = ref([]);
    const vaccines = ref([]);
    const loading = ref(false);

    // Computed
    const totalBirds = computed(() => /* ... */);

    // Methods
    async function loadDashboard() { /* ... */ }
    function refresh() { loadDashboard(); }

    return { stats, cycles, alerts, vaccines, loading, refresh, /* ... */ };
}
```

---

## 5. API Endpoints

| Data | Endpoint |
|------|----------|
| Health/Stats | `GET /health` |
| Farms | `GET /api/farm/farms` |
| Barns | `GET /api/farm/barns` |
| Cycles | `GET /api/farm/cycles?status=active` |
| Alerts | `GET /api/alerts?active=true` |
| Vaccines | `GET /api/farm/vaccine-schedules/upcoming?days=7` |
| Sync Status | `GET /api/sync/status` |

---

## 6. Implementation Checklist

- [ ] KPI Cards với icons
- [ ] Desktop: 6-column KPI grid
- [ ] Mobile: 3-column KPI grid (scrollable)
- [ ] Active Cycles section
- [ ] Quick Actions panel
- [ ] Upcoming Vaccines section
- [ ] Recent Alerts section
- [ ] Empty state
- [ ] Refresh button
- [ ] Loading states

---

## 7. Quick Actions (Priority Order)

| Action | Icon | Route |
|--------|------|-------|
| New Cycle | ➕ | `/cycles` (open modal) |
| Log Feed | 🌾 | `/care` (tab=feed) |
| Add Death | 💀 | `/care` (tab=death) |
| Record Weight | ⚖️ | `/care` (tab=weight) |
| View Cameras | 📹 | `/cameras` |

---

**Last Updated:** 2026-04-07
