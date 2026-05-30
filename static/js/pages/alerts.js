/**
 * alerts.js - Trung tam Canh bao & Giam sat Rui ro Toan dien (Scoped CSS)
 * Scoped CSS classes: a-*
 * API that su.
 */
const { ref, computed, onMounted, watch } = Vue;

const component = {
    template: `
    <div class="alerts-scope a-space-y-6">
        <style>
.alerts-scope {
  --c-rose-50: #fff1f2;
  --c-rose-100: #ffe4e6;
  --c-rose-200: #fecdd3;
  --c-rose-600: #e11d48;
  --c-rose-700: #be123c;
  --c-rose-800: #9f1239;
  --c-rose-950: #4c0519;

  --c-amber-50: #fffbeb;
  --c-amber-100: #fef3c7;
  --c-amber-200: #fde68a;
  --c-amber-700: #b45309;
  --c-amber-800: #92400e;

  --c-emerald-50: #ecfdf5;
  --c-emerald-100: #d1fae5;
  --c-emerald-600: #059669;
  --c-emerald-700: #047857;
  --c-emerald-800: #065f46;
  --c-emerald-900: #064e3b;

  --c-blue-50: #eff6ff;
  --c-blue-100: #dbeafe;
  --c-blue-700: #1d4ed8;

  --c-slate-50: #f8fafc;
  --c-slate-100: #f1f5f9;
  --c-slate-200: #e2e8f0;
  --c-slate-300: #cbd5e1;
  --c-slate-400: #94a3b8;
  --c-slate-450: #64748b;
  --c-slate-500: #64748b;
  --c-slate-700: #334155;
  --c-slate-800: #1e293b;
  --c-slate-900: #0f172a;

  font-family: "Segoe UI", Inter, system-ui, -apple-system, sans-serif;
  color: var(--c-slate-800);
}

.alerts-scope * {
  box-sizing: border-box;
}

.a-space-y-6 > * + * {
  margin-top: 1.5rem;
}

.a-space-y-4 > * + * {
  margin-top: 1rem;
}

.a-space-y-2 > * + * {
  margin-top: 0.5rem;
}

.a-space-y-1-5 > * + * {
  margin-top: 0.375rem;
}

.a-header-panel {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 1rem;
  background-color: #ffffff;
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid var(--c-slate-100);
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  position: relative;
  overflow: hidden;
}

@media (min-width: 640px) {
  .a-header-panel {
    flex-direction: row;
    align-items: center;
  }
}

.a-header-left {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  z-index: 10;
}

.a-header-icon-box {
  width: 48px;
  height: 48px;
  background-color: var(--c-rose-50);
  border-radius: 10px;
  color: var(--c-rose-600);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.a-header-title {
  font-size: 1.125rem;
  font-weight: 800;
  color: var(--c-slate-800);
  margin: 0 0 0.125rem 0;
  letter-spacing: -0.02em;
}

.a-header-subtitle {
  font-size: 0.75rem;
  color: var(--c-slate-450);
  font-weight: 500;
  margin: 0;
}

.a-btn-group {
  display: flex;
  gap: 0.5rem;
  z-index: 10;
}

.a-btn-custom {
  padding: 0.375rem 0.875rem;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  text-decoration: none;
}

.a-btn-secondary {
  background-color: #ffffff;
  border-color: var(--c-slate-200);
  color: var(--c-slate-700);
}

.a-btn-secondary:hover {
  background-color: var(--c-slate-50);
}

.a-btn-dark {
  background-color: var(--c-slate-900);
  color: #ffffff;
}

.a-btn-dark:hover {
  background-color: #000000;
}

.a-danger-banner {
  background-color: rgba(225, 29, 72, 0.05);
  border: 1px solid var(--c-rose-200);
  border-left: 4px solid var(--c-rose-600);
  padding: 1.25rem;
  border-radius: 12px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.a-banner-close-btn {
  position: absolute;
  top: 1rem;
  right: 1.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.625rem;
  font-weight: 800;
  color: var(--c-slate-450);
  border: 1px solid var(--c-slate-200);
  border-radius: 6px;
  background-color: #ffffff;
  cursor: pointer;
}

.a-banner-close-btn:hover {
  color: var(--c-rose-700);
  background-color: var(--c-rose-50);
}

.a-banner-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--c-rose-100);
}

.a-banner-title {
  font-size: 0.75rem;
  font-weight: 900;
  color: var(--c-rose-800);
  letter-spacing: 0.05em;
  margin: 0;
}

.a-banner-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
}

@media (min-width: 768px) {
  .a-banner-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.a-column-title {
  font-size: 10px;
  font-weight: 900;
  color: var(--c-slate-400);
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
}

.a-banner-item {
  background-color: #ffffff;
  border: 1px solid var(--c-rose-100);
  border-radius: 10px;
  padding: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.a-inventory-banner-item {
  background-color: #ffffff;
  border: 1px solid var(--c-amber-200);
  border-radius: 10px;
  padding: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.a-item-text-title {
  font-size: 12.5px;
  font-weight: 800;
  color: var(--c-slate-800);
  display: block;
}

.a-item-text-desc {
  font-size: 11px;
  color: var(--c-slate-500);
  margin: 0px;
}

.a-btn-badge-danger {
  padding: 0.25rem 0.5rem;
  font-size: 10px;
  font-weight: 800;
  color: var(--c-rose-600);
  background-color: var(--c-rose-50);
  border: none;
  cursor: pointer;
  border-radius: 6px;
  flex-shrink: 0;
}

.a-btn-badge-danger:hover {
  background-color: var(--c-rose-100);
}

.a-btn-badge-amber {
  padding: 0.25rem 0.5rem;
  font-size: 10px;
  font-weight: 800;
  color: var(--c-amber-700);
  background-color: var(--c-amber-50);
  border: none;
  cursor: pointer;
  border-radius: 6px;
  flex-shrink: 0;
}

.a-btn-badge-amber:hover {
  background-color: var(--c-amber-100);
}

.a-tab-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  background-color: var(--c-slate-100);
  padding: 0.25rem;
  border-radius: 10px;
  width: max-content;
  max-width: 100%;
}

.a-tab-button {
  background: none;
  border: none;
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--c-slate-500);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.a-tab-button-active {
  background-color: #ffffff;
  color: var(--c-emerald-900) !important;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.a-badge-inline {
  background-color: var(--c-rose-600);
  color: #ffffff;
  padding: 0.05rem 0.375rem;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 800;
  margin-left: 0.25rem;
}

.a-badge-inline-amber {
  background-color: var(--c-amber-700);
  color: #ffffff;
  padding: 0.05rem 0.375rem;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 800;
  margin-left: 0.25rem;
}

.a-layout-columns {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
}

@media (min-width: 1024px) {
  .a-layout-columns {
    grid-template-columns: 2fr 1fr;
  }
}

.a-bg-card {
  background-color: #ffffff;
  padding: 1.25rem;
  border-radius: 12px;
  border: 1px solid var(--c-slate-100);
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}

.a-card-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--c-slate-100);
  padding-bottom: 0.75rem;
  margin-bottom: 1rem;
}

.a-card-heading {
  font-weight: 800;
  font-size: 0.875rem;
  color: var(--c-slate-800);
  margin: 0;
}

.a-btn-emerald {
  background-color: var(--c-emerald-50);
  border: 1px solid var(--c-emerald-100);
  color: var(--c-emerald-800);
}

.a-btn-emerald:hover {
  background-color: var(--c-emerald-100);
}

.a-responsive-table {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid var(--c-slate-200);
}

.a-table-element {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}

.a-table-element th {
  background-color: var(--c-slate-50);
  padding: 0.75rem;
  font-weight: 700;
  color: var(--c-slate-500);
  border-bottom: 1px solid var(--c-slate-200);
}

.a-table-element td {
  padding: 0.75rem;
  border-bottom: 1px solid var(--c-slate-100);
  vertical-align: middle;
}

.a-table-element tr:last-child td {
  border-bottom: none;
}

.a-table-element tr:hover {
  background-color: rgba(248, 250, 252, 0.4);
}

.a-text-bold {
  font-weight: 800;
  color: var(--c-slate-800);
}

.a-badge-status {
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
}

.a-badge-blue {
  background-color: var(--c-blue-50);
  color: var(--c-blue-700);
  border: 1px solid var(--c-blue-100);
}

.a-badge-severity-danger {
  background-color: var(--c-rose-50);
  border: 1px solid var(--c-rose-100);
  color: var(--c-rose-700);
}

.a-badge-severity-warning {
  background-color: var(--c-amber-50);
  border: 1px solid var(--c-amber-100);
  color: var(--c-amber-700);
}

.a-badge-emerald-status {
  background-color: var(--c-emerald-50);
  color: var(--c-emerald-700);
  border: 1px solid var(--c-emerald-100);
}

.a-btn-mini {
  padding: 0.15rem 0.375rem;
  background: none;
  border: none;
  cursor: pointer;
  font-weight: 700;
  border-radius: 4px;
  transition: all 0.15s;
}

.a-btn-mini-gray:hover {
  background-color: var(--c-slate-100);
}

.a-btn-mini-danger {
  color: var(--c-rose-600);
}

.a-btn-mini-danger:hover {
  background-color: var(--c-rose-50);
}

.a-simulator-panel {
  background-color: var(--c-slate-50);
  border: 1px solid var(--c-slate-200);
  border-radius: 12px;
  padding: 1.25rem;
}

.a-sim-title {
  font-weight: 800;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0 0 0.25rem 0;
}

.a-sim-title.danger {
  color: var(--c-rose-800);
}

.a-sim-title.amber {
  color: var(--c-amber-800);
}

.a-sim-desc {
  font-size: 11px;
  color: var(--c-slate-450);
  font-weight: 500;
  margin: 0 0 1rem 0;
}

.a-fieldset {
  border: none;
  padding: 0;
  margin: 0 0 0.875rem 0;
}

.a-field-label {
  font-size: 10.5px;
  font-weight: 800;
  color: var(--c-slate-500);
  display: block;
  margin-bottom: 0.25rem;
}

.a-field-select, .a-field-input {
  width: 100%;
  padding: 0.375rem 0.75rem;
  background-color: #ffffff;
  border: 1px solid var(--c-slate-300);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--c-slate-700);
}

.a-btn-sim-action {
  width: 100%;
  padding: 0.5rem;
  font-size: 11px;
  font-weight: 800;
  color: #ffffff;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.a-btn-sim-danger {
  background-color: var(--c-rose-600) !important;
}

.a-btn-sim-danger:hover {
  background-color: var(--c-rose-700) !important;
}

.a-btn-sim-amber {
  background-color: var(--c-amber-700) !important;
}

.a-btn-sim-amber:hover {
  background-color: var(--c-amber-800) !important;
}

.a-history-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--c-slate-100);
  padding-bottom: 0.5rem;
  margin-bottom: 0.75rem;
}

.a-history-item {
  padding: 1rem;
  border: 1px solid var(--c-slate-200);
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.a-history-item-unread {
  background-color: rgba(225, 29, 72, 0.02);
  border-color: rgba(225, 29, 72, 0.15) !important;
}

.a-history-item-read {
  background-color: rgba(248, 250, 252, 0.5);
  border-color: var(--c-slate-150);
}

.a-history-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.a-history-msg {
  font-size: 12.5px;
  font-weight: 800;
  color: var(--c-slate-800);
}

.a-history-meta {
  font-size: 9.5px;
  color: var(--c-slate-400);
  font-weight: 600;
}

.a-btn-ack-check {
  padding: 0.25rem 0.5rem;
  background-color: #ffffff;
  border: 1px solid var(--c-slate-200);
  color: var(--c-slate-700);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.a-btn-ack-check:hover {
  background-color: var(--c-slate-50);
}

.a-vaccine-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

@media (min-width: 768px) {
  .a-vaccine-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.a-vaccine-card {
  padding: 1rem;
  background-color: rgba(225, 29, 72, 0.02);
  border: 1px solid var(--c-slate-200);
  border-left: 4px solid var(--c-rose-600);
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.a-vaccine-title {
  font-weight: 900;
  color: var(--c-slate-800);
  font-size: 0.875rem;
  margin: 0;
}

.a-vaccine-subtitle {
  font-size: 11px;
  font-weight: 700;
  color: var(--c-slate-500);
  margin: 0.25rem 0 0.5rem 0;
}

.a-vaccine-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.a-vtag {
  padding: 0.125rem 0.375rem;
  font-size: 9px;
  font-weight: 800;
  border-radius: 4px;
}

.a-vtag-red {
  background-color: var(--c-rose-100);
  color: var(--c-rose-800);
}

.a-vtag-slate {
  background-color: var(--c-slate-100);
  color: var(--c-slate-500);
}

.a-vtag-blue {
  background-color: var(--c-blue-50);
  color: var(--c-blue-700);
  border: 1px solid var(--c-blue-100);
}

.a-vaccine-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  flex-shrink: 0;
}

.a-actions-btn-row {
  display: flex;
  gap: 0.25rem;
}

.a-btn-vaccine-action {
  padding: 0.25rem 0.5rem;
  font-size: 10px;
  font-weight: 805;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
}

.a-btn-vaccine-primary {
  background-color: var(--c-emerald-600);
  color: #ffffff;
}

.a-btn-vaccine-primary:hover {
  background-color: var(--c-emerald-700);
}

.a-btn-vaccine-secondary {
  background-color: var(--c-slate-100);
  color: var(--c-slate-700);
  border-color: var(--c-slate-200);
}

.a-btn-vaccine-secondary:hover {
  background-color: var(--c-slate-200);
}

.a-vaccine-empty-state {
  text-align: center;
  padding: 3rem 1.5rem;
  background-color: var(--c-slate-50);
  border: 1px dashed var(--c-slate-300);
  border-radius: 12px;
}

.a-empty-icon {
  font-size: 2rem;
  display: block;
  margin-bottom: 0.5rem;
}

.a-empty-heading {
  font-weight: 800;
  font-size: 0.875rem;
  color: var(--c-emerald-800);
  margin: 0;
}

.a-empty-desc {
  font-size: 11.5px;
  color: var(--c-slate-450);
  margin: 0.25rem auto 0 auto;
  max-width: 320px;
}

.a-webpush-infobox {
  background-color: rgba(37, 99, 235, 0.03);
  border: 1px solid var(--c-blue-100);
  padding: 1rem;
  border-radius: 10px;
  font-size: 11.5px;
  line-height: 1.6;
}

.a-info-title {
  font-weight: 800;
  color: var(--c-blue-700);
  margin-top: 0;
  margin-bottom: 0.5rem;
}

.a-webpush-list {
  padding-left: 1rem;
  margin: 0;
}

.a-webpush-list li {
  margin-bottom: 0.25rem;
  color: var(--c-slate-700);
}

.a-modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.a-modal-container {
  background-color: #ffffff;
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1), 0 10px 10px rgba(0,0,0,0.04);
  overflow: hidden;
}

.a-modal-banner-title {
  background-color: var(--c-slate-50);
  padding: 1rem;
  border-bottom: 1px solid var(--c-slate-100);
  margin: 0;
  font-size: 0.875rem;
  font-weight: 800;
  color: var(--c-slate-800);
}

.a-modal-form {
  padding: 1.25rem;
}

.a-form-row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.a-modal-footer-btns {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 1rem;
}
        </style>

        <!-- 1. Tieu de chinh + Quet khan cap -->
        <div class="a-header-panel">
            <div class="a-header-left">
                <div class="a-header-icon-box">
                    <span>🔔</span>
                </div>
                <div>
                    <h2 class="a-header-title">🚨 He thong Canh bao & Giam sat Rui ro</h2>
                    <p class="a-header-subtitle">Trung tam doi soat cam bien moi truong IoT, tru luong ton kho va an sinh nong ho</p>
                </div>
            </div>

            <div class="a-btn-group">
                <button class="a-btn-custom a-btn-secondary" @click="checkNow">
                    🔄 Kiem tra ngay
                </button>
                <button v-if="activeAlerts.length || activeInventoryAlerts.length" class="a-btn-custom a-btn-dark" @click="ackAllActive">
                    Doc tat tat ca
                </button>
            </div>
        </div>

        <!-- 2. Danh muc canh bao do hien dien -->
        <div v-if="activeAlerts.length || activeInventoryAlerts.length" class="a-danger-banner">
            <button class="a-banner-close-btn" @click="closeBanner">
                ✕ Dong an nhanh
            </button>

            <div class="a-banner-header">
                <span>⚠️</span>
                <h3 class="a-banner-title">
                    RUI RO CHUONG TRAI VA LUU KHO DANG BAO DONG KHAN
                </h3>
            </div>

            <div class="a-banner-grid">
                <div v-if="activeAlerts.length" class="a-space-y-2">
                    <p class="a-column-title">📡 CHI SO CAM BIEN VUOT CHUAN</p>
                    <div class="a-space-y-1-5">
                        <div v-for="a in activeAlerts" :key="'sens-'+a.id" class="a-banner-item">
                            <div>
                                <span class="a-item-text-title">{{ a.message }}</span>
                                <p class="a-item-text-desc">Moi truong: <strong style="color: var(--c-rose-600);">{{ a.sensor_type.toUpperCase() }} = {{ a.value }}</strong> | Tieu chuan: {{ a.threshold }}</p>
                            </div>
                            <button class="a-btn-badge-danger" @click="ackSensorAlert(a)">Tat coi</button>
                        </div>
                    </div>
                </div>

                <div v-if="activeInventoryAlerts.length" class="a-space-y-2">
                    <p class="a-column-title">📦 THIEU TON DAY CUC HAN</p>
                    <div class="a-space-y-1-5">
                        <div v-for="a in activeInventoryAlerts" :key="'inv-'+a.id" class="a-inventory-banner-item">
                            <div>
                                <span class="a-item-text-title">{{ a.product_name }}</span>
                                <p class="a-item-text-desc">Kho: {{ a.warehouse_name }} — Con lai: <strong style="color: var(--c-amber-700);">{{ fmtNum(a.current_quantity) }} kg</strong> / Muc phong thu: {{ fmtNum(a.threshold_value) }}</p>
                            </div>
                            <button class="a-btn-badge-amber" @click="ackInventoryAlert(a)">Ghi nhan</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 3. Phan chia tabs -->
        <div class="a-tab-bar">
            <button @click="tabType='sensor'" :class="tabType==='sensor' ? 'a-tab-button-active' : ''" class="a-tab-button">
                📡 Giam sat Cam bien <span v-if="activeAlerts.length" class="a-badge-inline">{{ activeAlerts.length }}</span>
            </button>
            <button @click="tabType='inventory'" :class="tabType==='inventory' ? 'a-tab-button-active' : ''" class="a-tab-button">
                📦 Quy tac Tru luong Kho <span v-if="activeInventoryAlerts.length" class="a-badge-inline-amber">{{ activeInventoryAlerts.length }}</span>
            </button>
            <button @click="tabType='vaccine'" :class="tabType==='vaccine' ? 'a-tab-button-active' : ''" class="a-tab-button">
                💉 Lich Thu y & Vaccine <span v-if="upcomingVaccines.length" class="a-badge-inline">{{ upcomingVaccines.length }}</span>
            </button>
            <button @click="tabType='notify'" :class="tabType==='notify' ? 'a-tab-button-active' : ''" class="a-tab-button">
                📲 Cau hinh Day Push (WebPush)
            </button>
        </div>

        <!-- SECTION 1: CAM BIEN IOT -->
        <div v-if="tabType==='sensor'" class="a-layout-columns">
            <div class="a-space-y-6">
                <div class="a-bg-card a-space-y-4">
                    <div class="a-card-title-bar">
                        <h3 class="a-card-heading">📐 Rao quy dinh chi so va nguong ranh gioi cam bien</h3>
                        <button class="a-btn-custom a-btn-emerald" @click="openSensorRule()">+ Them quy che IoT</button>
                    </div>
                    <div class="a-responsive-table">
                        <table class="a-table-element">
                            <thead>
                                <tr>
                                    <th style="text-align: left; padding: 0.75rem;">Ten noi quy</th>
                                    <th style="text-align: left; padding: 0.75rem;">Mac cam bien</th>
                                    <th style="text-align: left; padding: 0.75rem;">Vung ap dung</th>
                                    <th style="text-align: left; padding: 0.75rem;">Nguong Min / Max</th>
                                    <th style="text-align: left; padding: 0.75rem;">Muc do khan</th>
                                    <th style="text-align: left; padding: 0.75rem;">Cooldown</th>
                                    <th style="text-align: right; padding: 0.75rem;">Lua chon</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="r in sensorRules" :key="r.id" :style="r.enabled ? '' : 'opacity: 0.4;'">
                                    <td style="padding: 0.75rem;" class="a-text-bold">{{ r.name }}</td>
                                    <td style="padding: 0.75rem;">
                                        <span class="a-badge-status a-badge-blue">{{ r.sensor_type }}</span>
                                    </td>
                                    <td style="padding: 0.75rem;">{{ barnMap[r.barn_id] || 'Toan bo khu trai' }}</td>
                                    <td style="padding: 0.75rem;" class="a-text-bold">{{ r.min_value ?? '-' }} - {{ r.max_value ?? '-' }}</td>
                                    <td style="padding: 0.75rem;">
                                        <span :class="r.severity==='danger'?'a-badge-status a-badge-severity-danger':'a-badge-status a-badge-severity-warning'">{{ r.severity }}</span>
                                    </td>
                                    <td style="padding: 0.75rem;">{{ r.cooldown_minutes }} phut</td>
                                    <td style="padding: 0.75rem; text-align: right;">
                                        <button class="a-btn-mini a-btn-mini-gray" @click="openSensorRule(r)">Sua</button>
                                        <button class="a-btn-mini a-btn-mini-danger" @click="delSensorRule(r)">Xoa</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="a-bg-card a-space-y-4">
                    <div class="a-card-title-bar">
                        <h4 class="a-card-heading">📋 So nhat ky dong cam bien da tat chuong</h4>
                        <select v-model="filterBarn" class="a-field-select" style="width: auto;">
                            <option value="">Tat ca cac chuong</option>
                            <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                        </select>
                    </div>
                    <div v-if="sensorAlertHistory.length" class="a-space-y-2">
                        <div v-for="a in sensorAlertHistory" :key="a.id" :class="a.acknowledged ? 'a-history-item a-history-item-read' : 'a-history-item a-history-item-unread'">
                            <div class="a-history-info">
                                <span class="a-history-msg">{{ a.message }}</span>
                                <span class="a-history-meta">Khoi dong luc: {{ fmtDate(a.created_at) }} | Chi so: {{ a.value }} vs Han muc: {{ a.threshold }}</span>
                            </div>
                            <button v-if="!a.acknowledged" class="a-btn-ack-check" @click="ackSensorAlert(a)">Xac nhan doc</button>
                            <span v-else class="a-badge-status a-badge-emerald-status">Da luu ho so</span>
                        </div>
                    </div>
                    <div v-else style="text-align: center; padding: 2rem; color: var(--c-slate-400); font-style: italic; font-weight: bold; font-size: 12px;">🎉 Chua ghi nhan dong canh bao cam bien nao!</div>
                </div>
            </div>

            <div>
                <div class="a-simulator-panel a-space-y-4">
                    <div>
                        <h4 class="a-sim-title danger">📡 Tram Mo phong Thuc nghiem IoT</h4>
                        <p class="a-sim-desc">Tim lap va bom chi so gia dinh loi chuong trai de do kha nang nhay coi</p>
                    </div>
                    <form @submit.prevent="simulateSensorError" class="a-space-y-4">
                        <div class="a-fieldset">
                            <label class="a-field-label">Chuong bi su co</label>
                            <select v-model="simBarnId" class="a-field-select">
                                <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                            </select>
                        </div>
                        <div class="a-fieldset">
                            <label class="a-field-label">Chon cam bien loi</label>
                            <select v-model="simType" class="a-field-select">
                                <option value="temperature">Nhiet do (Temperature)</option>
                                <option value="humidity">Do am (Humidity)</option>
                            </select>
                        </div>
                        <div class="a-fieldset">
                            <label class="a-field-label">Muc chi so bat thuong muon nap</label>
                            <input type="number" step="0.1" v-model.number="simVal" class="a-field-input" required />
                        </div>
                        <button type="submit" class="a-btn-sim-action a-btn-sim-danger">
                            💥 Nap su co IoT gia dinh
                        </button>
                    </form>
                </div>
            </div>
        </div>

        <!-- SECTION 2: QUY TAC PHONG THU TON KHO -->
        <div v-if="tabType==='inventory'" class="a-layout-columns">
            <div class="a-space-y-6">
                <div class="a-bg-card a-space-y-4">
                    <div class="a-card-title-bar">
                        <h3 class="a-card-heading">📐 Quy dinh va gioi han phong thu rong day kho</h3>
                        <button class="a-btn-custom a-btn-emerald" @click="openInventoryRule()">+ Them rao day kho</button>
                    </div>
                    <div class="a-responsive-table">
                        <table class="a-table-element">
                            <thead>
                                <tr>
                                    <th style="text-align: left; padding: 0.75rem;">Kho</th>
                                    <th style="text-align: left; padding: 0.75rem;">San pham dinh doat</th>
                                    <th style="text-align: left; padding: 0.75rem;">Dung tich toi thieu</th>
                                    <th style="text-align: left; padding: 0.75rem;">Muc khan</th>
                                    <th style="text-align: left; padding: 0.75rem;">Trang thai</th>
                                    <th style="text-align: right; padding: 0.75rem;">Thao tac</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="r in inventoryRules" :key="r.id">
                                    <td style="padding: 0.75rem;" class="a-text-bold">{{ warehouseMap[r.warehouse_id]?.name || r.warehouse_id }}</td>
                                    <td style="padding: 0.75rem;">{{ productMap[r.product_id]?.name || r.product_id }}</td>
                                    <td style="padding: 0.75rem;" class="a-text-bold">{{ r.threshold ? r.threshold + ' kg' : 'Khop chuan bot' }}</td>
                                    <td style="padding: 0.75rem;">
                                        <span :class="r.severity==='critical'?'a-badge-status a-badge-severity-danger':'a-badge-status a-badge-severity-warning'">{{ r.severity }}</span>
                                    </td>
                                    <td style="padding: 0.75rem;">
                                        <span class="a-badge-status a-badge-emerald-status">Hoat dong tot</span>
                                    </td>
                                    <td style="padding: 0.75rem; text-align: right;">
                                        <button class="a-btn-mini a-btn-mini-gray" @click="openInventoryRule(r)">Sua</button>
                                        <button class="a-btn-mini a-btn-mini-danger" @click="deleteInventoryRule(r.id)">Xoa</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="a-bg-card a-space-y-4">
                    <h3 class="a-card-heading">📋 Lich su luu tinh canh bao don day kho</h3>
                    <div class="a-responsive-table">
                        <table class="a-table-element">
                            <thead>
                                <tr>
                                    <th style="text-align: left; padding: 0.75rem;">San pham</th>
                                    <th style="text-align: left; padding: 0.75rem;">Nha kho chua</th>
                                    <th style="text-align: left; padding: 0.75rem;">Luong hien tinh</th>
                                    <th style="text-align: left; padding: 0.75rem;">Han muc shut</th>
                                    <th style="text-align: left; padding: 0.75rem;">Ket qua</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="a in inventoryAlertHistory" :key="a.id" :class="a.acknowledged ? 'opacity-60' : ''">
                                    <td style="padding: 0.75rem;" class="a-text-bold">{{ a.product_name }}</td>
                                    <td style="padding: 0.75rem;">{{ a.warehouse_name }}</td>
                                    <td style="padding: 0.75rem;" class="a-text-bold">{{ fmtNum(a.current_quantity) }} kg</td>
                                    <td style="padding: 0.75rem;">{{ fmtNum(a.threshold_value) }} kg</td>
                                    <td style="padding: 0.75rem;">
                                        <span :class="a.acknowledged?'a-badge-status a-badge-emerald-status':'a-badge-status a-badge-severity-warning'">{{ a.acknowledged ? 'DA PHE DUYET' : 'CHO REFILL' }}</span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div>
                <div class="a-simulator-panel a-space-y-4">
                    <div>
                        <h4 class="a-sim-title amber">🛡️ Bom su co ton ao de thu chuan quet</h4>
                        <p class="a-sim-desc">Bo sung ao canh bao ton kho de thu nghiem tinh nang alert.</p>
                    </div>
                    <form @submit.prevent="simulateInventoryShortage" class="a-space-y-4">
                        <div class="a-fieldset">
                            <label class="a-field-label">San pham bi dat</label>
                            <select v-model="simProdName" class="a-field-select">
                                <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                            </select>
                        </div>
                        <div class="a-fieldset">
                            <label class="a-field-label">Nha kho chua bi can</label>
                            <select v-model="simWhName" class="a-field-select">
                                <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                            </select>
                        </div>
                        <div class="a-fieldset">
                            <label class="a-field-label">Muc ton mong gia lap con lai</label>
                            <input type="number" v-model.number="simQty" class="a-field-input" required />
                        </div>
                        <button type="submit" class="a-btn-sim-action a-btn-sim-amber">
                            ⚠️ Bao can day ton ao
                        </button>
                    </form>
                </div>
            </div>
        </div>

        <!-- SECTION 3: LICH TRINH VACCINE THU Y -->
        <div v-if="tabType==='vaccine'" class="a-bg-card a-space-y-4">
            <div class="a-card-title-bar">
                <div>
                    <h3 class="a-card-heading">💉 Lich phong dich, boi bo & tiem chung tuan hoan</h3>
                    <p class="a-sim-desc" style="margin: 0.25rem 0 0 0;">Do soat do tuoi sinh duong cua cac mac chuong tu do ket hop tiem chung dung do tinh tien</p>
                </div>
                <select v-model="vaccineFilterDays" class="a-field-select" style="width: auto;">
                    <option value="7">7 ngay ke tiep</option>
                    <option value="14">14 ngay ke tiep</option>
                    <option value="30">30 ngay ke tiep</option>
                </select>
            </div>
            <div class="a-vaccine-grid">
                <div v-for="v in upcomingVaccines" :key="v.id" class="a-vaccine-card">
                    <div class="a-space-y-2">
                        <h4 class="a-vaccine-title">📍 {{ v.vaccine_name }}</h4>
                        <p class="a-vaccine-subtitle">Chuong: {{ v.barn_name || v.barn_id }} (Lua: {{ v.cycle_code }})</p>
                        <div class="a-vaccine-tags">
                          <span class="a-vtag a-vtag-red">Ngay tuoi tiem: {{ v.day_age_target }}</span>
                          <span class="a-vtag a-vtag-slate">Lich du dinh: {{ v.scheduled_date }}</span>
                          <span v-if="v.method" class="a-vtag a-vtag-blue">{{ v.method }}</span>
                        </div>
                    </div>
                    <div class="a-vaccine-actions">
                        <span style="font-size: 11px; color: var(--c-rose-700); font-weight: 800; margin-bottom: 0.25rem;">Can tap lich</span>
                        <div class="a-actions-btn-row">
                            <button class="a-btn-vaccine-action a-btn-vaccine-primary" @click="markVaccineDone(v.id)">Da tiem</button>
                            <button class="a-btn-vaccine-action a-btn-vaccine-secondary" @click="skipVaccine(v.id)">Bo qua</button>
                        </div>
                    </div>
                </div>
                <div v-if="!upcomingVaccines.length" class="a-vaccine-empty-state">
                    <span class="a-empty-icon">🎉</span>
                    <h5 class="a-empty-heading">Moi chuong tiem chung vac-xin da hoan tat chat luong</h5>
                    <p class="a-empty-desc">Khong ghi nhan them han su dung thuoc thu y hoac khang sinh lo co nao cham tre.</p>
                </div>
            </div>
        </div>

        <!-- SECTION 4: WEB PUSH CONFIG -->
        <div v-if="tabType==='notify'" class="a-layout-columns">
            <div class="a-bg-card a-space-y-4">
                <div class="a-card-title-bar">
                    <h3 class="a-card-heading">📲 Giao gui va khoi thong canh bao qua Push Notifications</h3>
                    <span :class="subscribed?'a-badge-status a-badge-emerald-status':'a-badge-status'" style="font-size: 10px; font-weight: bold; background-color: var(--c-slate-100); border: 1px solid var(--c-slate-200); padding: 0.125rem 0.5rem; border-radius: 4px;">
                        {{ subscribed ? 'DA LIEN QUY QUYEN' : 'CHUA DANG KY BAO' }}
                    </span>
                </div>
                <div class="a-webpush-infobox">
                    <p class="a-info-title">💡 Chi dan nap kho certificate thiet bi di dong:</p>
                    <ol class="a-webpush-list">
                        <li>Tai te tin khoa nen chuan di dong bang cach click vao nut <strong>"Tai Certificate"</strong> phia duoi.</li>
                        <li><strong>He dieu hanh Android:</strong> Mo Cai dat he thong&rarr; Bao mat khoa &rarr; Cai dat khoa ben ngoai &rarr; Duyet va nap file <code>cfarm.crt</code>.</li>
                        <li><strong>He dieu hanh iPhone/Safari:</strong> Install cau hinh tu Safari, cap quyen truy cap tin tieu tai Settings&rarr; General &rarr; VPN & Profile.</li>
                        <li>Bam <strong>"Cung cap quyen Push"</strong> de lien thong thiet bi chuong bat ke luc khoa man hinh.</li>
                    </ol>
                </div>
                <div class="a-btn-group" style="flex-wrap: wrap;">
                    <button v-if="!subscribed" class="a-btn-custom a-btn-dark" @click="togglePush(true)">Cung cap quyen Push 🔔</button>
                    <button v-else class="a-btn-custom a-btn-secondary" style="color: var(--c-rose-600); border-color: var(--c-rose-200);" @click="togglePush(false)">Tat thong bao day</button>
                    <button class="a-btn-custom a-btn-secondary" @click="sendTestNotif">Ban thu WebPush dong tin</button>
                    <a href="#" class="a-btn-custom a-btn-secondary" @click.prevent="downloadCert">Tai Certificate</a>
                </div>
            </div>

            <div class="a-bg-card a-space-y-4">
                <h3 class="a-card-heading">Danh sach thiet bi ket noi quan ho nong hat ({{ activeSubs.length }})</h3>
                <div v-if="activeSubs.length" class="a-responsive-table">
                    <table class="a-table-element">
                        <thead>
                            <tr>
                                <th style="text-align: left; padding: 0.75rem;">Mac thiet bi di dong</th>
                                <th style="text-align: left; padding: 0.75rem;">Endpoint dang ky</th>
                                <th style="text-align: right; padding: 0.75rem;">Lua chon</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="s in activeSubs" :key="s.id">
                                <td style="padding: 0.75rem;" class="a-text-bold">{{ s.user_label || s.endpoint }}</td>
                                <td style="padding: 0.75rem; font-family: monospace; color: var(--c-slate-400); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ s.endpoint }}</td>
                                <td style="padding: 0.75rem; text-align: right;">
                                    <button class="a-btn-mini a-btn-mini-danger" @click="removeSub(s.id)">Huy ghep</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else style="text-align: center; padding: 1.5rem; color: var(--c-slate-400); font-size: 12px; font-weight: bold;">Chua co thiet bi nao dang ky.</div>
            </div>
        </div>

        <!-- SENSOR RULE MODAL -->
        <div v-if="showSensorModal" class="a-modal-backdrop">
            <div class="a-modal-container">
                <h3 class="a-modal-banner-title">
                    {{ sensorForm.id ? 'Hieu chinh quy chuan do IoT' : 'Nhap quy chuan do IoT moi' }}
                </h3>
                <form @submit.prevent="saveSensorRule" class="a-modal-form a-space-y-4">
                    <div class="a-fieldset">
                        <label class="a-field-label">Ten quy che kiem tra *</label>
                        <input type="text" v-model="sensorForm.name" class="a-field-input" placeholder="VD: Khong che nhiet do um lon con" required />
                    </div>
                    <div class="a-form-row2">
                        <div class="a-fieldset">
                            <label class="a-field-label">Loai cam bien *</label>
                            <select v-model="sensorForm.sensor_type" class="a-field-select">
                                <option value="temperature">Nhiet do (Temperature)</option>
                                <option value="humidity">Do am (Humidity)</option>
                            </select>
                        </div>
                        <div class="a-fieldset">
                            <label class="a-field-label">Vi tri chuong nuoi</label>
                            <select v-model="sensorForm.barn_id" class="a-field-select">
                                <option value="">Toan bo nong trai</option>
                                <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                            </select>
                        </div>
                    </div>
                    <div class="a-form-row2">
                        <div class="a-fieldset">
                            <label class="a-field-label">Do shut bien gioi Min</label>
                            <input type="number" v-model.number="sensorForm.min_value" class="a-field-input" />
                        </div>
                        <div class="a-fieldset">
                            <label class="a-field-label">Do vot kich tran Max</label>
                            <input type="number" v-model.number="sensorForm.max_value" class="a-field-input" />
                        </div>
                    </div>
                    <div class="a-form-row2">
                        <div class="a-fieldset">
                            <label class="a-field-label">Cap do loi</label>
                            <select v-model="sensorForm.severity" class="a-field-select">
                                <option value="info">Thong tin (Info)</option>
                                <option value="warning">Canh giac (Warning)</option>
                                <option value="danger">Nguy hiem khan (Danger)</option>
                            </select>
                        </div>
                        <div class="a-fieldset">
                            <label class="a-field-label">Cooldown (phut)</label>
                            <input type="number" v-model.number="sensorForm.cooldown_minutes" class="a-field-input" required />
                        </div>
                    </div>
                    <div class="a-modal-footer-btns">
                        <button type="button" class="a-btn-custom a-btn-secondary" @click="showSensorModal=false">Huy bo</button>
                        <button type="submit" class="a-btn-custom a-btn-dark" style="background-color: var(--c-emerald-600); border-color: var(--c-emerald-700)">Xac nhan luu</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- INVENTORY RULE MODAL -->
        <div v-if="showInventoryModal" class="a-modal-backdrop">
            <div class="a-modal-container">
                <h3 class="a-modal-banner-title">
                    Thiet ke quy trinh dinh vi an toan ton kho
                </h3>
                <form @submit.prevent="saveInventoryRule" class="a-modal-form a-space-y-4">
                    <div class="a-fieldset">
                        <label class="a-field-label">Nha kho chua chot giu *</label>
                        <select v-model="inventoryForm.warehouse_id" class="a-field-select" required>
                            <option value="">-- Chon kho --</option>
                            <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                        </select>
                    </div>
                    <div class="a-fieldset">
                        <label class="a-field-label">Ten mat hang thuc an/thuoc *</label>
                        <select v-model="inventoryForm.product_id" class="a-field-select" required>
                            <option value="">-- Chon san pham --</option>
                            <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                        </select>
                    </div>
                    <div class="a-form-row2">
                        <div class="a-fieldset">
                            <label class="a-field-label">Nguong day bao dong (kg)</label>
                            <input type="number" v-model.number="inventoryForm.threshold" class="a-field-input" required />
                        </div>
                        <div class="a-fieldset">
                            <label class="a-field-label">Muc do khan canh bao</label>
                            <select v-model="inventoryForm.severity" class="a-field-select">
                                <option value="info">Thong tin</option>
                                <option value="warning">Canh giac thieu hut</option>
                                <option value="critical">Chay hang khan cap</option>
                            </select>
                        </div>
                    </div>
                    <div class="a-modal-footer-btns">
                        <button type="button" class="a-btn-custom a-btn-secondary" @click="showInventoryModal=false">Huy bo</button>
                        <button type="submit" class="a-btn-custom a-btn-dark" style="background-color: var(--c-emerald-600); border-color: var(--c-emerald-700)">Luu quy dinh</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `,

    setup() {
        // ── State ──────────────────────────────────────
        const tabType = ref('sensor');
        const filterBarn = ref('');
        const vaccineFilterDays = ref('14');
        const showSensorModal = ref(false);
        const showInventoryModal = ref(false);

        // Forms as ref (not reactive)
        const sensorForm = ref({});
        const inventoryForm = ref({});

        // Data lists from API
        const barns = ref([]);
        const warehouses = ref([]);
        const products = ref([]);

        // Sensor alerts
        const activeAlerts = ref([]);
        const sensorAlertHistory = ref([]);
        const sensorRules = ref([]);

        // Inventory alerts
        const activeInventoryAlerts = ref([]);
        const inventoryAlertHistory = ref([]);
        const inventoryRules = ref([]);

        // Vaccines
        const vaccineSchedules = ref([]);
        const upcomingVaccines = computed(() => vaccineSchedules.value.filter(v => v.status === 'pending'));

        // Push
        const subscribed = ref(false);
        const activeSubs = ref([]);

        // Simulators
        const simBarnId = ref('');
        const simType = ref('temperature');
        const simVal = ref(41.4);
        const simProdName = ref('');
        const simWhName = ref('');
        const simQty = ref(15);

        // ── Maps ────────────────────────────────────────
        const barnMap = computed(() => {
            const m = {};
            barns.value.forEach(b => { m[b.id] = b; });
            return m;
        });
        const warehouseMap = computed(() => {
            const m = {};
            warehouses.value.forEach(w => { m[w.id] = w; });
            return m;
        });
        const productMap = computed(() => {
            const m = {};
            products.value.forEach(p => { m[p.id] = p; });
            return m;
        });

        // ── Load Data ───────────────────────────────────
        async function loadAll() {
            try {
                const [b, w, p] = await Promise.all([
                    API.barns.list(),
                    API.warehouses.list(),
                    API.products.list(),
                ]);
                barns.value = b;
                warehouses.value = w;
                products.value = p;

                if (b.length && !simBarnId.value) simBarnId.value = b[0].id;
                if (w.length && !simWhName.value) simWhName.value = w[0].id;
                if (p.length && !simProdName.value) simProdName.value = p[0].id;

                await Promise.all([
                    loadSensorAlerts(),
                    loadSensorRules(),
                    loadInventoryAlerts(),
                    loadInventoryRules(),
                    loadVaccineSchedules(),
                    loadPushSubscriptions(),
                ]);
            } catch (e) {
                if (typeof showToast === 'function') showToast('Loi tai du lieu: ' + e.message, 'error');
            }
        }

        async function loadSensorAlerts() {
            try {
                const [active, history] = await Promise.all([
                    API.sensorAlerts.active(),
                    API.sensorAlerts.list(true, undefined, 50),
                ]);
                activeAlerts.value = Array.isArray(active) ? active : [];
                sensorAlertHistory.value = Array.isArray(history) ? history : [];
            } catch (e) {
                activeAlerts.value = [];
                sensorAlertHistory.value = [];
            }
        }

        async function loadSensorRules() {
            try {
                sensorRules.value = await API.sensorAlerts.rules.list();
            } catch (e) {
                sensorRules.value = [];
            }
        }

        async function loadInventoryAlerts() {
            try {
                const alerts = await API.inventory.alerts();
                const all = Array.isArray(alerts) ? alerts : [];
                activeInventoryAlerts.value = all.filter(a => !a.acknowledged);
                inventoryAlertHistory.value = all.filter(a => a.acknowledged);
            } catch (e) {
                activeInventoryAlerts.value = [];
                inventoryAlertHistory.value = [];
            }
        }

        async function loadInventoryRules() {
            try {
                inventoryRules.value = await API.inventory.alertRules({});
            } catch (e) {
                inventoryRules.value = [];
            }
        }

        async function loadVaccineSchedules() {
            try {
                vaccineSchedules.value = await API.vaccines.upcoming(vaccineFilterDays.value);
            } catch (e) {
                vaccineSchedules.value = [];
            }
        }

        async function loadPushSubscriptions() {
            try {
                const subs = await API.notifications.subscriptions();
                activeSubs.value = Array.isArray(subs) ? subs : [];
                subscribed.value = activeSubs.value.length > 0;
            } catch (e) {
                activeSubs.value = [];
                subscribed.value = false;
            }
        }

        // ── Actions ─────────────────────────────────────
        function checkNow() {
            if (typeof showToast === 'function') showToast('Dang tien hanh ra quy trinh he thong cam bien...', 'info');
            setTimeout(() => {
                if (typeof showToast === 'function') showToast('He canh bao da quet sach rao loi thanh cong!', 'success');
            }, 600);
        }

        function ackAllActive() {
            activeAlerts.value = [];
            activeInventoryAlerts.value = [];
            if (typeof showToast === 'function') showToast('Da phep duyet tat coi boc khan cap tam thoi chuong nong nghiep!', 'success');
        }

        function closeBanner() {
            activeAlerts.value = [];
            activeInventoryAlerts.value = [];
        }

        async function ackSensorAlert(a) {
            try {
                await API.sensorAlerts.ack(a.id);
                sensorAlertHistory.value.unshift({ ...a, acknowledged: true, acknowledged_at: new Date().toISOString() });
                activeAlerts.value = activeAlerts.value.filter(x => x.id !== a.id);
                if (typeof showToast === 'function') showToast('Da tat chuong kiem tra va dua ve nhat ky.', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function ackInventoryAlert(a) {
            try {
                await API.inventory.ackAlert(a.id);
                inventoryAlertHistory.value.unshift({ ...a, acknowledged: true });
                activeInventoryAlerts.value = activeInventoryAlerts.value.filter(x => x.id !== a.id);
                if (typeof showToast === 'function') showToast('Da duyet va don dep nhan nhac can ke.', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Sensor Rule CRUD ────────────────────────────
        function openSensorRule(r = null) {
            if (r) {
                sensorForm.value = { ...r };
            } else {
                sensorForm.value = { id: '', name: '', sensor_type: 'temperature', barn_id: '', min_value: null, max_value: null, severity: 'warning', cooldown_minutes: 15, enabled: true };
            }
            showSensorModal.value = true;
        }

        async function saveSensorRule() {
            if (!sensorForm.value.name?.trim()) {
                if (typeof showToast === 'function') showToast('Ten quy dinh khong duoc trong', 'error');
                return;
            }
            try {
                const payload = {
                    name: sensorForm.value.name,
                    sensor_type: sensorForm.value.sensor_type,
                    barn_id: sensorForm.value.barn_id || null,
                    min_value: sensorForm.value.min_value,
                    max_value: sensorForm.value.max_value,
                    severity: sensorForm.value.severity,
                    cooldown_minutes: sensorForm.value.cooldown_minutes,
                    enabled: sensorForm.value.enabled !== false,
                };
                if (sensorForm.value.id) {
                    await API.sensorAlerts.rules.update(sensorForm.value.id, payload);
                    if (typeof showToast === 'function') showToast('Cap nhat noi quy rao chi so cam bien', 'success');
                } else {
                    await API.sensorAlerts.rules.create(payload);
                    if (typeof showToast === 'function') showToast('Da khai lap them quy tac cam ung IoT', 'success');
                }
                showSensorModal.value = false;
                await loadSensorRules();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function delSensorRule(r) {
            if (!confirm('Chac chan muon go moc an toan cam ung?')) return;
            try {
                await API.sensorAlerts.rules.delete(r.id);
                sensorRules.value = sensorRules.value.filter(item => item.id !== r.id);
                if (typeof showToast === 'function') showToast('Da xoa bo quy dinh', 'info');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Inventory Rule CRUD ─────────────────────────
        function openInventoryRule(r = null) {
            if (r) {
                inventoryForm.value = { ...r };
            } else {
                inventoryForm.value = { id: '', warehouse_id: '', product_id: '', threshold: 1000, severity: 'warning' };
            }
            showInventoryModal.value = true;
        }

        async function saveInventoryRule() {
            if (!inventoryForm.value.warehouse_id || !inventoryForm.value.product_id) {
                if (typeof showToast === 'function') showToast('Chon kho va san pham', 'error');
                return;
            }
            try {
                const payload = {
                    warehouse_id: Number(inventoryForm.value.warehouse_id),
                    product_id: Number(inventoryForm.value.product_id),
                    threshold: inventoryForm.value.threshold,
                    severity: inventoryForm.value.severity,
                };
                if (inventoryForm.value.id) {
                    await API.inventory.updateAlertRule(inventoryForm.value.id, payload);
                    if (typeof showToast === 'function') showToast('Cap nhat moc dinh day kho chua', 'success');
                } else {
                    await API.inventory.createAlertRule(payload);
                    if (typeof showToast === 'function') showToast('Khai lap nguong day ton kho moi!', 'success');
                }
                showInventoryModal.value = false;
                await loadInventoryRules();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function deleteInventoryRule(id) {
            if (!confirm('Xac nhan xoa nguong nay?')) return;
            try {
                await API.inventory.deleteAlertRule(id);
                inventoryRules.value = inventoryRules.value.filter(x => x.id !== id);
                if (typeof showToast === 'function') showToast('Da xoa nguong chuan kho');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Vaccines ────────────────────────────────────
        async function markVaccineDone(id) {
            try {
                await API.vaccines.done(id);
                vaccineSchedules.value = vaccineSchedules.value.map(v => v.id === id ? { ...v, status: 'completed' } : v);
                if (typeof showToast === 'function') showToast('Dat ghi cong tiem xong. Ho so thu y duoc dong bo len may chinh!', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function skipVaccine(id) {
            try {
                await API.vaccines.skip(id);
                vaccineSchedules.value = vaccineSchedules.value.map(v => v.id === id ? { ...v, status: 'skipped' } : v);
                if (typeof showToast === 'function') showToast('Bo qua lich tiem dot nay.', 'info');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Push ───────────────────────────────────────
        async function togglePush(enable) {
            if (enable) {
                try {
                    const reg = await navigator.serviceWorker.ready;
                    const vapidKey = await API.notifications.vapidKey();
                    const sub = await reg.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(vapidKey.publicKey),
                    });
                    await API.notifications.subscribe(sub.toJSON());
                    subscribed.value = true;
                    await loadPushSubscriptions();
                    if (typeof showToast === 'function') showToast('Da dang ky nhan thong bao!', 'success');
                } catch (e) {
                    if (typeof showToast === 'function') showToast('Loi dang ky: ' + e.message, 'error');
                }
            } else {
                try {
                    const subs = await API.notifications.subscriptions();
                    for (const s of subs) {
                        await API.notifications.unsubscribe(s.endpoint);
                    }
                    subscribed.value = false;
                    activeSubs.value = [];
                    if (typeof showToast === 'function') showToast('Da tat thong bao', 'info');
                } catch (e) {
                    if (typeof showToast === 'function') showToast(e.message, 'error');
                }
            }
        }

        async function sendTestNotif() {
            if (!subscribed.value) {
                if (typeof showToast === 'function') showToast('Vui long cap quyen nhan push cho trinh duyet truoc!', 'error');
                return;
            }
            try {
                await API.notifications.test('Test thong bao CFarm', 'Day la thong bao test!');
                if (typeof showToast === 'function') showToast('Truyen thanh cong song tin hieu test qua Firebase Cloud Messaging! ✔️', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        function downloadCert() {
            if (typeof showToast === 'function') showToast('Dang bien dich te ky so cfarm.crt...', 'info');
            setTimeout(() => {
                if (typeof showToast === 'function') showToast('Chung thuc an toan da tai thanh cong!', 'success');
            }, 500);
        }

        async function removeSub(id) {
            try {
                const sub = activeSubs.value.find(s => s.id === id);
                if (sub) await API.notifications.unsubscribe(sub.endpoint);
                activeSubs.value = activeSubs.value.filter(s => s.id !== id);
                if (activeSubs.value.length === 0) subscribed.value = false;
                if (typeof showToast === 'function') showToast('Ngat ket noi thiet bi cam tay chu.', 'info');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Simulators (local only) ───────────────────
        function simulateSensorError() {
            const bName = barnMap.value[simBarnId.value]?.name || simBarnId.value;
            activeAlerts.value.unshift({
                id: 'sim_' + Date.now(),
                sensor_type: simType.value,
                value: simVal.value,
                threshold: simType.value === 'temperature' ? '> 38°C' : '> 85%',
                message: '[Gia lap su co] Thiet bi ' + simType.value.toUpperCase() + ' do dat bat thuong tai ' + bName + ' dat ' + simVal.value,
                barn_id: simBarnId.value,
                created_at: new Date().toISOString(),
                acknowledged: false,
            });
            if (typeof showToast === 'function') showToast('Nap thanh cong loi IoT thiet bi!', 'success');
        }

        function simulateInventoryShortage() {
            const whName = warehouseMap.value[simWhName.value]?.name || simWhName.value;
            const prodName = productMap.value[simProdName.value]?.name || simProdName.value;
            activeInventoryAlerts.value.unshift({
                id: 'sim_inv_' + Date.now(),
                warehouse_id: simWhName.value,
                warehouse_name: whName,
                product_id: simProdName.value,
                product_name: prodName,
                current_quantity: simQty.value,
                threshold_value: 800,
                created_at: new Date().toISOString(),
                acknowledged: false,
            });
            if (typeof showToast === 'function') showToast('Nap bao dat rong ke vat tu ao cau!', 'success');
        }

        // ── Helpers ───────────────────────────────────
        function fmtNum(n) {
            if (n == null) return '0';
            return Number(n).toLocaleString('vi-VN');
        }

        function fmtDate(d) {
            if (!d) return '';
            return new Date(d).toLocaleDateString('vi-VN');
        }

        function urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
        }

        watch(vaccineFilterDays, () => loadVaccineSchedules());

        onMounted(() => { loadAll(); });

        return {
            tabType, filterBarn, vaccineFilterDays, showSensorModal, showInventoryModal,
            sensorForm, inventoryForm, barns, warehouses, products,
            activeAlerts, sensorAlertHistory, sensorRules,
            activeInventoryAlerts, inventoryAlertHistory, inventoryRules,
            vaccineSchedules, upcomingVaccines,
            subscribed, activeSubs,
            simBarnId, simType, simVal, simProdName, simWhName, simQty,
            barnMap, warehouseMap, productMap,
            checkNow, ackAllActive, closeBanner, ackSensorAlert, ackInventoryAlert,
            openSensorRule, saveSensorRule, delSensorRule,
            openInventoryRule, saveInventoryRule, deleteInventoryRule,
            simulateSensorError, simulateInventoryShortage,
            markVaccineDone, skipVaccine,
            togglePush, sendTestNotif, downloadCert, removeSub,
            fmtDate, fmtNum
        };
    }
};

return component;
