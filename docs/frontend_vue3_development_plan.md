# Frontend Vue 3 Development Plan

**Mục tiêu:** Xây dựng Frontend theo đúng quy trình cho CFarm Local Server

---

## 1. Cấu trúc hiện tại

### File Structure
```
C:/Local server/
├── static/
│   ├── css/
│   │   └── app.css
│   ├── js/
│   │   ├── api.js          # API client
│   │   ├── app.js          # Main Vue app + Router
│   │   └── pages/          # Page components
│   │       ├── dashboard.js
│   │       ├── barns.js
│   │       ├── cycles.js
│   │       ├── care.js
│   │       └── ...
│   └── vendor/
└── src/server/templates/
    └── farm.html            # Main HTML shell
```

### Công nghệ
- **Vue 3** (Composition API)
- **Vue Router 4** (Hash mode)
- **Tailwind CSS 2.2**
- **Vanilla JS components** (dynamic loading)

---

## 2. Yêu cầu thiết kế

### Desktop View (Phân tích)
- Màn hình rộng > 1024px
- Layout: Sidebar + Main Content
- Mục đích: Phân tích data, quản lý nhiều thông tin cùng lúc
- Tables với nhiều columns
- Charts/Graphs cho analytics

### Mobile View (Người dùng)
- Màn hình < 768px
- Layout: Full-screen pages với bottom nav
- Mục đích: Xem nhanh, nhập liệu care, điều khiển relay
- Card-based UI
- Touch-friendly controls
- Fast loading

---

## 3. Component Architecture

### Layout Components
- [ ] `LayoutDesktop.vue` - Desktop layout shell
- [ ] `LayoutMobile.vue` - Mobile layout shell
- [ ] `Sidebar.vue` - Navigation sidebar
- [ ] `BottomNav.vue` - Mobile bottom navigation
- [ ] `Header.vue` - Page header
- [ ] `Toast.vue` - Toast notifications

### Reusable Components
- [ ] `DataTable.vue` - Desktop table component
- [ ] `Card.vue` - Mobile card component
- [ ] `FormInput.vue` - Input field
- [ ] `FormSelect.vue` - Dropdown select
- [ ] `FormDate.vue` - Date picker
- [ ] `Button.vue` - Button variants
- [ ] `Modal.vue` - Modal dialog
- [ ] `Badge.vue` - Status badges
- [ ] `Spinner.vue` - Loading spinner
- [ ] `EmptyState.vue` - Empty data state
- [ ] `ErrorState.vue` - Error state

### Page Components (theo thứ tự ưu tiên)

#### P0 - Core CRUD (Người dùng cần nhất)
1. [ ] `DashboardPage.vue` - Dashboard overview
2. [ ] `BarnsPage.vue` - Barn management
3. [ ] `CyclesPage.vue` - Cycle management
4. [ ] `CarePage.vue` - Care operations (Feed, Death, Med, Weight)

#### P1 - Inventory & Products
5. [ ] `InventoryPage.vue` - Stock management
6. [ ] `ProductsPage.vue` - Product catalog

#### P2 - Devices & IoT
7. [ ] `DevicesPage.vue` - Device management
8. [ ] `RelaysPage.vue` - Relay control

#### P3 - Reports & Analytics (Desktop)
9. [ ] `ReportsPage.vue` - Data analysis
10. [ ] `ChartsPage.vue` - Visualizations

---

## 4. API Integration

### API Client Structure (`api.js`)
```javascript
const API = {
    farms: { list, create, get, update, delete },
    barns: { list, create, get, update, delete },
    cycles: { list, create, get, update, close, getDashboard },
    care: {
        feed: { log, list, daily },
        death: { log, list, daily },
        medication: { log, list },
        weight: { log, list, reminders },
        sale: { log, list }
    },
    inventory: { list, import, export, transfer, transactions },
    devices: { list, get, control },
    // ...
}
```

### Error Handling
- 400: Validation Error → Show field errors
- 404: Not Found → Show "Not found" message
- 500: Server Error → Show "Something went wrong"
- Network Error → Show "Connection lost"

### Loading States
- Skeleton loaders for initial load
- Spinner for actions
- Disable buttons during API calls

---

## 5. State Management

### Vue 3 Reactivity (đã có)
```javascript
// Global state via app-level provide/inject
const serverStatus = reactive({ ok: false, mqtt: false });
const toast = reactive({ show: false, msg: '', type: '' });

// Per-page state via setup()
const cycles = ref([]);
const loading = ref(false);
```

### Cần thêm:
- [ ] Global store cho user preferences
- [ ] Cache layer cho frequently accessed data
- [ ] Optimistic updates cho better UX

---

## 6. Responsive Breakpoints

```css
/* Tailwind breakpoints */
sm: 640px   /* Large phones */
md: 768px   /* Tablets */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
```

### View Mode Logic
```javascript
const viewMode = ref(
    localStorage.getItem('cfarm_view') ||
    (window.innerWidth < 768 ? 'mobile' : 'desktop')
);
```

---

## 7. Form Validation

### Client-side Validation
- Required fields
- Min/Max values
- Format validation (dates, numbers)
- Real-time feedback

### UX Guidelines
- Validate on blur
- Show errors below fields
- Green border for valid
- Red border + message for invalid

---

## 8. Development Workflow

### Tạo Page Component Mới

1. **Tạo file** `static/js/pages/{page}.js`
2. **Viết component:**
```javascript
const { ref, onMounted, computed } = Vue;

return {
    setup() {
        // State
        const items = ref([]);
        const loading = ref(false);

        // Lifecycle
        onMounted(async () => {
            loading.value = true;
            items.value = await API.{resource}.list();
            loading.value = false;
        });

        // Methods
        async function createItem() { /* ... */ }

        // Template (as string)
        return { items, loading, createItem, template: `<div>...</div>` };
    },
    template: `<div v-html="template"></div>`
};
```

### Tạo Reusable Component

1. **Tạo file** `static/js/components/{Component}.vue` (HOẶC inline)
2. **Import trong page:**
```javascript
const MyComponent = {
    props: ['value'],
    emits: ['update'],
    template: `<div>...</div>`
};
```

---

## 9. Testing Checklist

### Desktop View
- [ ] Sidebar navigation works
- [ ] All pages render correctly
- [ ] Tables scroll properly
- [ ] Forms submit correctly
- [ ] Modals open/close
- [ ] Responsive at 1024px, 1280px, 1920px

### Mobile View
- [ ] Bottom navigation works
- [ ] Pages render on small screens
- [ ] Touch controls work
- [ ] Swipe/scroll is smooth
- [ ] Forms are usable
- [ ] Responsive at 375px, 414px

### Performance
- [ ] First load < 3s
- [ ] Page switch < 500ms
- [ ] No memory leaks
- [ ] Lazy load pages

---

## 10. Priorities

### Phase 1: Core Pages
1. Dashboard - overview
2. Barns - CRUD + list
3. Cycles - CRUD + list
4. Care - log feed/death/med/weight

### Phase 2: Inventory
5. Inventory - stock levels
6. Products - catalog

### Phase 3: IoT
7. Devices - status
8. Relay control

### Phase 4: Polish
9. Charts
10. Reports
11. Settings

---

**Last Updated:** 2026-04-07
