# CFarm UX/UI Style Guide

> **Mục đích**: Single source of truth cho toàn bộ frontend. Mọi page MỚI hoặc REFACTOR đều phải tuân theo guide này để tránh drift giữa các page.
>
> **Áp dụng cho**: Tất cả 31 page modules (`static/js/pages/*.js`) + `farm.html` shell + `app.css`.
>
> **Cập nhật**: Khi thêm component mới, cập nhật guide này TRƯỚC, code SAU.

---

## Mục lục

1. [Nguyên tắc cốt lõi](#1-nguyên-tắc-cốt-lõi)
2. [Design Tokens](#2-design-tokens)
3. [Phân lớp CSS Class](#3-phân-lớp-css-class)
4. [Layout Patterns](#4-layout-patterns)
5. [Component Patterns](#5-component-patterns)
6. [State Patterns](#6-state-patterns)
7. [Interaction Patterns](#7-interaction-patterns)
8. [Iconography](#8-iconography)
9. [Naming Conventions](#9-naming-conventions)
10. [Accessibility Checklist](#10-accessibility-checklist)
11. [Do's and Don'ts](#11-dos-and-donts)
12. [Liên kết](#12-liên-kết)

---

## 1. Nguyên tắc cốt lõi

### 1.1 Mobile-first
Mọi layout **mặc định cho mobile** (< 768px), dùng breakpoint Tailwind để scale lên:
- `sm:` ≥ 640px
- `md:` ≥ 768px
- `lg:` ≥ 1024px (sidebar cố định)
- `xl:` ≥ 1280px (max container)

**Tại sao**: User farm 80% dùng mobile (đi dọc chuồng). Mobile bottom nav đã có sẵn ở `farm.html:134-178`.

### 1.2 Tiếng Việt là chính
- UI text: **tiếng Việt** (không dùng tiếng Anh trong label/button/empty state)
- `aria-label`: tiếng Việt (screen reader nói tiếng Việt)
- Số: locale `vi-VN` (dấu chấm phân cách hàng nghìn, dấu phẩy thập phân)
- Ngày: `DD/MM/YYYY` (chuẩn VN)

### 1.3 Consistency > Creativity
- **Tái sử dụng** class đã có (`.btn`, `.btn-primary`, `.card`, `.badge-red`)
- **KHÔNG** tạo class mới khi class cũ đáp ứng được
- Khi cần tweak, dùng utility Tailwind inline (`text-xs`, `font-medium`, `gap-2`)

### 1.4 Loading ≠ Blinking
- **Skeleton** cho first load (giữ layout, animate pulse)
- **Spinner** chỉ khi refresh data sau khi page đã có nội dung
- **Không** flash toàn trang khi refresh

### 1.5 Data Integrity First
- Sau mỗi mutation (POST/PUT/DELETE), **LUÔN refetch data liên quan**
- KHÔNG để user F5 mới thấy kết quả
- Optimistic update chỉ khi rollback dễ (toggle, like)

---

## 2. Design Tokens

Định nghĩa trong `:root` của `static/css/app.css` (line 5-26). **LUÔN dùng CSS variables**, không hardcode.

### 2.1 Colors

| Token | Value | Dùng cho |
|-------|-------|----------|
| `--primary` | `#16a34a` | Brand green, primary buttons |
| `--primary-dark` | `#15803d` | Hover, active states |
| `--primary-darker` | `#166534` | Pressed states |
| `--primary-light` | `#22c55e` | Highlights, success |
| `--primary-50` | `#f0fdf4` | Subtle backgrounds |
| `--primary-100` | `#dcfce7` | Hover backgrounds |
| `--primary-200` | `#bbf7d0` | Borders emphasis |

| Token | Value | Dùng cho |
|-------|-------|----------|
| `--text-primary` | `#111827` | Body text |
| `--text-secondary` | `#6b7280` | Captions |
| `--text-muted` | `#9ca3af` | Placeholders, disabled |
| `--bg-page` | `#f8fafc` | Page background |
| `--bg-card` | `#ffffff` | Card background |
| `--border` | `#e5e7eb` | Default border |
| `--border-light` | `#f3f4f6` | Subtle dividers |

| Token | Value | Dùng cho |
|-------|-------|----------|
| `--sidebar-bg` | `#14532d` | Dark sidebar background |
| `--sidebar-hover` | `#166534` | Sidebar item hover |
| `--sidebar-border` | `#15803d` | Sidebar dividers |

### 2.2 Semantic colors (Tailwind palette inline)

| Trạng thái | Background | Text |
|------------|-----------|------|
| Success | `bg-green-100` | `text-green-600/700` |
| Warning | `bg-yellow-100` | `text-yellow-600` |
| Danger | `bg-red-100` | `text-red-600` |
| Info | `bg-blue-100` | `text-blue-600` |
| Neutral | `bg-gray-100` | `text-gray-500` |
| Purple | `bg-purple-100` | `text-purple-600` |

### 2.3 Spacing scale (Tailwind mặc định)

Dùng scale: `0`, `0.5`, `1`, `1.5`, `2`, `3`, `4`, `6`, `8`, `12`, `16` (rem).
- Gap: `gap-2` (8px), `gap-3` (12px), `gap-4` (16px)
- Padding: `p-4` (16px) cho card, `p-6` (24px) cho container
- Margin: cách nhau theo section: `mb-4`, `mb-6`

### 2.4 Radius

| Token | Value | Dùng cho |
|-------|-------|----------|
| `--radius` | `0.5rem` (8px) | Buttons, inputs, small cards |
| `--radius-lg` | `0.75rem` (12px) | Cards, modals |

Tailwind: `rounded-lg` (8px), `rounded-xl` (12px), `rounded-2xl` (16px), `rounded-full` (pill).

### 2.5 Shadows

| Token | Dùng cho |
|-------|----------|
| `--shadow-sm` | Subtle elevation |
| `--shadow` | Default cards |
| `--shadow-md` | Hover, dropdown |

**KHÔNG** dùng `shadow-lg`/`shadow-xl` (quá nặng cho design hiện tại).

### 2.6 Typography

```css
--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'Cascadia Code', 'Fira Code', monospace;
```

| Size | px | Dùng cho |
|------|----|----------|
| `text-xs` | 12 | Captions, badges, IDs |
| `text-sm` | 14 | Body small, table cells |
| `text-base` | 16 | Body default |
| `text-lg` | 18 | Card titles |
| `text-xl` | 20 | Section titles |
| `text-2xl` | 24 | Page H1 |

Font weight: `font-medium` (500), `font-semibold` (600), `font-bold` (700).

---

## 3. Phân lớp CSS Class

### 3.1 Hai lớp trong `app.css`

| Lớp | Prefix | Mục đích |
|-----|--------|----------|
| **Primitives** | không prefix hoặc Tailwind | Shared |
| **Feature-specific** | `.cf-{feature}-*` | Chỉ 1 feature |

### 3.2 Quy tắc

**LUÔN ưu tiên primitive**. Chỉ tạo `.cf-*` khi:
- Component quá feature-specific (vd: `.cf-care-product-btn`)
- Layout có logic đặc biệt (vd: `.cf-inv-actions` 3-card)

### 3.3 Reference classes chính

```
Primitives (dùng chung):
  Layout:   .page, .page-header, .page-title, .cf-container
  Buttons:  .btn, .btn-primary, .btn-secondary, .btn-danger,
            .btn-warning, .btn-ghost, .btn-outline,
            .btn-sm, .btn-xs
  Forms:    .form-group, .form-input, .form-label, .form-checkbox
  Cards:    .card, .card-title, .card-value
  Badges:   .badge, .badge-green, .badge-red, .badge-yellow,
            .badge-blue, .badge-purple, .badge-gray
  Misc:     .animate-pulse, .animate-spin, .empty-state, .alert-toast

Feature namespaces:
  Care:     .cf-care-*  (care.js, care-history.js, care-weight.js)
  Inv:      .cf-inv-*   (inventory.js, inventory-detail.js)
  Bats:     .cf-bats-*  (bats.js, bats-detail.js)
  Alerts:   .cf-alerts-*, .alerts-*
  Barns:    .cf-barns-*
  Cycles:   .cf-cycles-*, .cf-stats-grid, .cf-cycle-*
  Modals:   .cf-modal-* (BẮT BUỘC)
```

**Lưu ý đặc biệt**: Modal PHẢI dùng `.cf-modal-overlay/.cf-modal-box/.cf-modal-header/.cf-modal-body/.cf-modal-footer`. KHÔNG dùng `.modal/.modal-overlay` (legacy, chỉ còn trong `cameras.js`).

---

## 4. Layout Patterns

### 4.1 Page shell

```html
<!-- Page đơn giản: dùng .page -->
<div class="page">
  <div class="page-header">
    <h2 class="page-title">Dashboard</h2>
    <button class="btn btn-ghost btn-sm">Refresh</button>
  </div>
</div>

<!-- Page có header card: dùng .cf-container -->
<div class="cf-container">
  <div class="cf-header-bar">
    <div class="cf-header-left">
      <div class="cf-header-icon" style="background:#d97706">📦</div>
      <div>
        <h1 class="cf-h1">Quản lý kho</h1>
        <p class="cf-subtitle">Kho, sản phẩm, tồn kho & cảnh báo</p>
      </div>
    </div>
    <div class="cf-header-right">
      <button class="cf-btn-primary">+ Thêm</button>
    </div>
  </div>
</div>
```

### 4.2 Dashboard Pattern

```
┌─ Page Header ─────────────┐
├─ KPI Grid (cards thống kê)
├─ Dashboard Grid (2 col desktop, 1 col mobile)
│  ┌─ Main ──┐ ┌─ Side ──┐
│  │  Card   │ │  Card   │
│  └─────────┘ └─────────┘
└───────────────────────────┘
```

CSS:
```html
<div class="kpi-grid mb-6">  <!-- 6 cards max -->
<div class="dashboard-grid">  <!-- 2 col responsive -->
  <div class="dashboard-main">...</div>
  <div class="dashboard-side">...</div>
</div>
```

### 4.3 Detail Page Pattern

```
┌─ Back button + Entity header ───────────────┐
├─ Action cards (3 cards: Import/Export/Transfer)
├─ Current data table (tồn kho / sensor values)
├─ History tabs (Nhập | Xuất | Chuyển | Alerts)
└─────────────────────────────────────────────┘
```

**Quy tắc**:
- Back button: luôn `<button @click="$router.push('/parent')" class="btn btn-ghost">← Quay lại</button>`
- Action cards: 1–3 card cùng layout
- History tabs: pill style, count badge nếu có
- Mỗi tab có empty state riêng

### 4.4 Form Layout

```html
<div class="form-group">
  <label class="form-label">Tên <span class="req">*</span></label>
  <input v-model="form.name" class="form-input" type="text" required>
  <small v-if="error" class="cf-error">{{ error }}</small>
</div>
```

2-column trên desktop cho field liên quan:
```html
<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
  <div class="form-group">...</div>
  <div class="form-group">...</div>
</div>
```

---

## 5. Component Patterns

### 5.1 Buttons

| Class | Dùng cho |
|-------|----------|
| `.btn .btn-primary` | Hành động chính |
| `.btn .btn-secondary` | Hành động phụ (Hủy, Đóng) |
| `.btn .btn-danger` | Nguy hiểm (Xóa, Hủy) |
| `.btn .btn-warning` | Cảnh báo |
| `.btn .btn-ghost` | Icon button, link action |
| `.btn .btn-sm` | Size nhỏ |
| `.btn .btn-xs` | Size cực nhỏ |

**Quy tắc**:
- 1 page chỉ có **1 primary button** tại 1 thời điểm
- Destructive actions **LUÔN** confirm trước (xem §7.1)
- Icon button có `title=` attribute cho tooltip

### 5.2 Forms

| Element | Class |
|---------|-------|
| Wrapper | `.form-group` hoặc `.cf-inv-field` |
| Label | `.form-label` / `.cf-label` |
| Input text | `.form-input` / `.cf-input` |
| Number | `.form-input` |
| Select | `.form-input` |
| Checkbox | `.form-checkbox` / `.cf-checkbox` |
| Required | `<span class="req">*</span>` |
| Error | `<small class="cf-error">...</small>` |

### 5.3 Cards

```html
<div class="card">
  <h3 class="font-semibold text-primary mb-4">Tiêu đề</h3>
</div>
```

- Padding mặc định: `p-4`
- Shadow: `shadow-sm`
- Border: `border border-gray-200`

### 5.4 Badges

```html
<span class="badge badge-green">Active</span>
<span class="badge badge-red">Offline</span>
```

**Không inline color** — LUÔN dùng class.

### 5.5 Modals (BẮT BUỘC `.cf-modal-*`)

```html
<teleport to="body">
  <div v-if="showModal" class="cf-modal-overlay" @click.self="closeModal">
    <div class="cf-modal-box" style="max-width: 32rem;">
      <div class="cf-modal-header">
        <div class="cf-modal-header-left">
          <div class="cf-modal-header-icon">🔔</div>
          <h3 class="cf-modal-title">Tiêu đề</h3>
        </div>
        <button @click="closeModal" class="cf-modal-close-btn">✕</button>
      </div>
      <form @submit.prevent="save">
        <div class="cf-modal-body">...</div>
        <div class="cf-modal-footer">
          <button type="button" @click="closeModal" class="btn btn-secondary">Hủy</button>
          <button type="submit" class="btn btn-primary">Lưu</button>
        </div>
      </form>
    </div>
  </div>
</teleport>
```

**Quy tắc**:
- LUÔN `<teleport to="body">`
- `@click.self="closeModal"` cho overlay click-outside (TODO: confirm if dirty)
- ESC, focus trap, scroll lock: TODO

### 5.6 Data Tables

```html
<div class="overflow-x-auto">
  <table class="cf-inv-stock-table">
    <thead><tr><th>Cột</th><th class="text-right">Số</th></tr></thead>
    <tbody><tr><td>{{ row.name }}</td><td class="text-right">{{ fmtNum(row.qty) }}</td></tr></tbody>
  </table>
</div>
```

**Quy tắc**:
- LUÔN `.overflow-x-auto` cho mobile
- "Số lượng" / "Tiền" LUÔN `class="text-right"`
- Date/time: `text-xs text-gray-500 whitespace-nowrap`
- ID: `text-xs text-gray-400`
- Action column: `class="flex gap-1"`

**TODO sprint 3**: Component `<cf-data-table>` với sort/filter/pagination.

---

## 6. State Patterns

### 6.1 Loading — 3 trường hợp

| Trường h�p | Dùng |
|-----------|------|
| **First load** (chưa có data) | **Skeleton** (animate-pulse) |
| **Refresh** (đã có data) | **Spinner** inline |
| **Submitting** (đang POST/PUT) | **Button spinner** + disable |

**Skeleton**:
```html
<div class="stat-card animate-pulse">
  <div class="stat-icon bg-gray-200"></div>
  <div class="h-6 bg-gray-200 rounded w-10 mx-auto"></div>
</div>
```

**Spinner**:
```html
<div v-if="loading" style="text-align:center;padding:2rem">
  <div class="cf-spinner"></div>
</div>
```

**Submitting**:
```html
<button :disabled="submitting" class="btn btn-primary">
  <span v-if="submitting" class="cf-spinner cf-spinner-sm"></span>
  {{ submitting ? 'Đang lưu...' : 'Lưu' }}
</button>
```

### 6.2 Empty State

Hiện tại MỖI page tự viết. Mục tiêu:

```html
<cf-empty-state
  icon="📭"
  title="Chưa ghi nhận ca này"
  subtitle="Bắt đầu bằng cách chọn loại cám"
  action-label="+ Tạo phiếu mới"
  action-href="/care/new"
/>
```

Hiện tại (inline):
```html
<div v-if="!rows.length" class="empty-state">
  <div class="icon">📭</div>
  <p>Chưa có dữ liệu</p>
  <button class="btn btn-primary mt-3">+ Thêm mới</button>
</div>
```

### 6.3 Error State

```html
<div v-if="error" class="cf-error-banner">
  <span>⚠️ {{ error.message }}</span>
  <button @click="retry" class="btn btn-sm btn-ghost">Thử lại</button>
</div>
```

LUÔN: try/catch, toast error, retry button cho action quan trọng.

### 6.4 Success feedback

```js
showToast('Đã lưu', 'success');  // xanh
showToast('Lỗi: ' + e.message, 'error');  // đỏ
showToast('Đang xử lý...', 'info');  // xanh dương
```

**TODO sprint 2**: Nâng cấp toast với progress bar, pause-on-hover, swipe.

---

## 7. Interaction Patterns

### 7.1 Confirm Dialog — THAY THẾ native confirm()

**KHÔNG** dùng `confirm()` / `prompt()` / `alert()`.

Hiện tại có 2 hướng:

**(A) Custom modal** (vd: `care.js:316-323`):
```js
const confirmDelete = ref(null);
function askDelete(message, onConfirm) {
  confirmDelete.value = { message, onConfirm };
}
function doConfirmDelete() { confirmDelete.value.onConfirm(); confirmDelete.value = null; }
function cancelDelete() { confirmDelete.value = null; }
```

```html
<teleport to="body">
  <div v-if="confirmDelete" class="cf-modal-overlay" @click.self="cancelDelete">
    <div class="cf-modal-box" style="max-width:24rem">
      <div class="cf-modal-header">
        <h3 class="cf-modal-title">Xác nhận</h3>
      </div>
      <div class="cf-modal-body">{{ confirmDelete.message }}</div>
      <div class="cf-modal-footer">
        <button @click="cancelDelete" class="btn btn-secondary">Hủy</button>
        <button @click="doConfirmDelete" class="btn btn-danger">Xóa</button>
      </div>
    </div>
  </div>
</teleport>
```

**Bug đã biết**: Pattern này bị race nếu user click Xóa nhiều entry liên tục.

**(B) SweetAlert2** (TODO sprint 1): Một dòng `Swal.fire({...})` thay cho 25 dòng custom modal.

### 7.2 Toast Notification

Global `showToast()` trong `app.js:9-15`. Dùng MỌI NƠI thay cho `alert()`.

### 7.3 Modal Lifecycle

| Action | Behavior | TODO |
|--------|----------|------|
| Open | Teleport to body, focus first input | Auto-focus |
| Click overlay | Close (nếu form không dirty) | Confirm if dirty |
| ESC key | Close | Implement |
| Tab cycle | Stay inside modal | Focus trap |
| Submit | Save → close → toast success | — |
| Cancel | Close → reset form | — |
| Body scroll | Lock when modal open | Implement |

### 7.4 Navigation

- **Back button**: Luôn ở detail page, route đến parent dashboard
- **Breadcrumb**: TODO (sprint 4)
- **Active link**: Sidebar dùng `active-class="active"` (đã có trong `farm.html:72,79`)
- **Mobile bottom nav**: Care ở FAB (đã có trong `farm.html:155`)
- **URL sync**: Khi user đổi dropdown trong detail page, dùng `router.replace()`

---

## 8. Iconography

### 8.1 Hiện trạng — Emoji

100+ chỗ dùng emoji 🌾 💊 🩺 📹... **Vấn đề**: render khác OS, không style được, a11y kém.

### 8.2 Mục tiêu — Lucide icons (TODO sprint 1)

| Hiện tại | Lucide tương đương |
|----------|-------------------|
| 🏠 | `home` |
| 🔄 | `refresh-cw` |
| 🐔 | `bird` |
| 📡 | `radio` |
| 🔌 | `plug` |
| 🪟 | `wind` |
| ⚙️ | `settings` |
| 🌡️ | `thermometer` |
| 🌾 | `wheat` |
| 💊 | `pill` |
| 💉 | `syringe` |
| � | `package` |
| 🏭 | `factory` |
| 🩺 | `stethoscope` |
| ⚖️ | `scale` |
| 📋 | `clipboard-list` |
| 🔔 | `bell` |
| ⚠️ | `alert-triangle` |
| ⚡ | `zap` |
| 📹 | `video` |
| ☁️ | `cloud` |
| 💬 | `message-circle` |
| 📥 | `arrow-down-circle` |
| 📤 | `arrow-up-circle` |
| ➕ | `plus-circle` |
| ✏️ | `pencil` |
| 🗑️ | `trash-2` |
| ✕ | `x` |
| ✓ | `check` |

### 8.3 Cách dùng

```html
<!-- Inline SVG: copy trực tiếp vào template -->
<svg class="cf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
</svg>
```

CSS:
```css
.cf-icon { width: 1.25rem; height: 1.25rem; stroke: currentColor; fill: none; }
.cf-icon-sm { width: 1rem; height: 1rem; }
.cf-icon-lg { width: 1.5rem; height: 1.5rem; }
```

---

## 9. Naming Conventions

### 9.1 File names

- Page modules: `kebab-case.js`
- CSS: `static/css/app.css`
- Vendor: `static/vendor/{name}.min.js`

### 9.2 CSS classes

| Loại | Pattern |
|------|---------|
| Primitives | `.{noun}` (no prefix) |
| Variants | `.{base}-{variant}` |
| Sizes | `.{base}-{size}` |
| Feature-specific | `.cf-{feature}-{element}` |
| State | `.is-{state}` hoặc `.has-{state}` |

### 9.3 Vue component refs

```js
const loading = ref(false);  // noun
const selectedCycle = computed(...);  // noun (no 'get' prefix)
function saveFeed() {...}  // verb + noun
function deleteEntry(type, id) {...}
```

### 9.4 API namespace

- `API.farms.list()` ← /api/farm/farms
- `API.cycles.get(id)`
- `API.inventory.transfer(data)`
- `API.care.logFeed(data)`
- `API.sensors.barnsTemperature()`

Không viết tắt.

### 9.5 Routes

- `/{resource}` — dashboard
- `/{resource}/:id` — detail
- `/{resource}/{action}` — sub-page

Hash router (`createWebHashHistory`).

---

## 10. Accessibility Checklist

Mỗi page MỚI hoặc REFACTOR phải pass:

### 10.1 Keyboard

- [ ] Tất cả action Tab-able
- [ ] Modal đóng bằng ESC
- [ ] Form submit b�ng Enter
- [ ] Focus indicator rõ (`focus:ring-2`)

### 10.2 Screen reader

- [ ] Icon button có `aria-label` hoặc `title=`
- [ ] Image có `alt` hoặc `aria-hidden`
- [ ] Modal có `role="dialog"` `aria-modal="true"`
- [ ] Loading state có `aria-live="polite"`

### 10.3 Color contrast

- [ ] Text vs background ≥ 4.5:1 (WCAG AA)
- [ ] Không chỉ dựa vào color (vd: badge đỏ + icon ⚠️, không chỉ đỏ)

### 10.4 Touch target

- [ ] Min size 44×44px / 48×48dp
- [ ] Spacing ≥ 8px giữa touch targets

### 10.5 Forms

- [ ] Mỗi input có `<label>` (không chỉ placeholder)
- [ ] Required: `aria-required="true"`
- [ ] Error: link qua `aria-describedby`

---

## 11. Do's and Don'ts

### ✅ DO

1. **Dùng `.cf-modal-*`** cho mọi modal — KHÔNG dùng `.modal` legacy
2. **Dùng `.cf-container` + `.cf-header-bar`** cho page có header card
3. **Dùng `.btn .btn-primary/secondary/danger`** — KHÔNG custom
4. **Dùng `.badge .badge-{color}`** — KHÔNG inline color
5. **Dùng `showToast()`** thay cho `alert()`
6. **Dùng `<teleport to="body">`** cho modal/dropdown
7. **Refetch data** sau mỗi mutation
8. **Skeleton first load** + Spinner refresh
9. **Mobile-first**: mặc định < 768px
10. **Loading state** qua `loading.value = true/false`
11. **Race protection** trong watcher: capture ID trước await
12. **fmtNum() / fmtDate()** từ `app.js` global — KHÔNG redefine

### ❌ DON'T

1. **KHÔNG** dùng `confirm()` / `prompt()` / `alert()`
2. **KHÔNG** dùng emoji làm icon chính — chuyển sang Lucide
3. **KHÔNG** hardcode màu (`style="background:#d97706"`) — dùng CSS class
4. **KHÔNG** hardcode version trong HTML
5. **KHÔNG** dùng `<input type="date">` cho UX quan trọng
6. **KHÔNG** flash toàn trang khi refresh — dùng skeleton/spinner
7. **KHÔNG** để form data mất khi click overlay đóng modal
8. **KHÔNG** để toast che keyboard trên mobile
9. **KHÔNG** để race condition khi user click nhanh
10. **KHÔNG** tạo CSS class mới khi class c� đáp ứng được
11. **KHÔNG** `<input v-model>` không có `type=`
12. **KHÔNG** `v-if="loading"` mà không có `v-else` cho full form

---

## 12. Liên kết

### 12.1 Per-page design specs (đang có)

- `docs/ui_dashboard_design.md`
- `docs/ui_care_page_design.md`
- `docs/ui_care_page_v2_design.md`
- `docs/ui_barns_page_design.md`
- `docs/ui_cycles_page_design.md`

### 12.2 Style guide này

- File: `docs/ui_style_guide.md` (file này)
- Cập nhật khi: thêm component, đổi design token, đổi pattern

### 12.3 Vendored libraries (hiện tại)

| Library | Path | Version |
|---------|------|---------|
| Vue 3 | `static/vendor/vue.global.prod.js` | 3.x |
| Vue Router 4 | `static/vendor/vue-router.global.prod.js` | 4.x |
| Tailwind | `static/vendor/tailwind.min.css` | 2.2.19 |
| Chart.js | CDN `chart.js@4.4.0` | 4.4 (chưa dùng) |

### 12.4 Vendored libraries (TODO)

| Library | Size | Use | Sprint |
|---------|------|-----|--------|
| Lucide Icons | ~50KB | Thay emoji | 1 |
| SweetAlert2 | ~70KB | Thay confirm() | 1 |
| Vue DatePicker | ~80KB | Thay input type=date | 4 |
| Tippy.js | ~30KB | Tooltip | 4 |

---

## Phụ lục A: Bug đã phát hiện (review 2026-08-13)

36 bug UX/UI cụ thể đã được identify trong session review. Top critical bugs:

| # | Bug | Sprint |
|---|-----|--------|
| 1 | Race condition cycle/date switch | 1 |
| 2 | Loading spinner không che form (form cũ flash) | 1 |
| 3 | Confirm modal race condition | 1 |
| 4 | PTZ save 2s thiếu progress feedback | 2 |
| 5 | Toast che keyboard trên mobile | 2 |
| 6 | Inventory-detail không refresh stock sau mutation | 1 |
| 7 | Hardcoded severity labels trong template | 1 |
| 8 | fmtNum() redefine trong 5+ pages | 1 |

---

**Cập nhật cuối**: 2026-08-13
**Người tạo**: AI review session
**Reviewers cần thiết**: Bạn (UI/UX owner) — verify và thêm phần thiếu trước khi enforce
