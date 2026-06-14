/**
 * Inventory Page - Warehouse Dashboard
 * - Groups warehouses: central (hero) + per-barn
 * - Per-card stock preview + alert badge
 * - Drill-down to /inventory/:id (handled by inventory-detail.js)
 * - Keeps warehouse/product CRUD modals + low-stock alerts panel
 */
const { ref, computed, onMounted, watch } = Vue;
const { useRouter } = VueRouter;

export default {
    setup() {
        const router = useRouter();

        // ── State ──────────────────────────────────────
        const warehouses = ref([]);
        const products = ref([]);
        const barns = ref([]);
        const feedBrands = ref([]);
        const stockMap = ref({});          // { warehouseId: stockRow[] }
        const alerts = ref([]);
        const alertsPanelOpen = ref(false);
        const loading = ref(true);
        const filterType = ref('');         // '' | 'feed' | 'medication' | 'mixed'

        const showWhModal = ref(false);
        const showProdModal = ref(false);
        const whForm = ref({});
        const prodForm = ref({});

        // ── Computed ───────────────────────────────────
        const activeWarehouses = computed(() =>
            warehouses.value.filter(w => w.active !== false)
        );

        const activeAlertsByWh = computed(() => {
            const map = {};
            for (const a of alerts.value) {
                const wid = a.warehouse_id;
                if (wid === undefined || wid === null) continue;
                if (!map[wid]) map[wid] = [];
                map[wid].push(a);
            }
            return map;
        });

        const filteredWarehouses = computed(() => {
            if (!filterType.value) return activeWarehouses.value;
            return activeWarehouses.value.filter(w => w.warehouse_type === filterType.value);
        });

        const grouped = computed(() => {
            const ws = filteredWarehouses.value;
            const central = ws.filter(w => w.is_central);
            const perBarn = {};
            for (const w of ws.filter(x => !x.is_central)) {
                const key = w.barn_id || '_orphan';
                if (!perBarn[key]) perBarn[key] = [];
                perBarn[key].push(w);
            }
            const barnKeys = Object.keys(perBarn).sort();
            const barnsList = barnKeys.map(bid => {
                const barn = barns.value.find(b => b.id === bid);
                return {
                    barn: barn || { id: bid, name: bid === '_orphan' ? 'Chưa gán chuồng' : bid },
                    isOrphan: bid === '_orphan',
                    warehouses: perBarn[bid],
                };
            });
            return { central, barns: barnsList };
        });

        // ── Helpers ────────────────────────────────────
        function typeIcon(wh) {
            if (wh.warehouse_type === 'feed') return '🌾';
            if (wh.warehouse_type === 'medication' || wh.warehouse_type === 'medicine') return '💊';
            if (wh.warehouse_type === 'mixed') return '📦';
            if (wh.warehouse_type === 'equipment') return '⚙️';
            return '📦';
        }

        function productName(productId) {
            const p = products.value.find(x => x.id === productId);
            return p ? p.name : productId;
        }

        function topStock(warehouseId, n = 2) {
            const rows = stockMap.value[warehouseId] || [];
            if (rows.length === 0) return [];
            return [...rows]
                .filter(r => Number(r.quantity) > 0)
                .sort((a, b) => Number(b.quantity) - Number(a.quantity))
                .slice(0, n);
        }

        function cardFor(wh) {
            const top = topStock(wh.id, 2);
            const alertRows = activeAlertsByWh.value[wh.id] || [];
            return {
                top,
                alertCount: alertRows.length,
                hasAlert: alertRows.length > 0,
            };
        }

        // ── API ────────────────────────────────────────
        async function load() {
            try {
                [warehouses.value, products.value, barns.value, feedBrands.value, alerts.value] = await Promise.all([
                    API.warehouses.list().catch(() => []),
                    API.products.list().catch(() => []),
                    API.barns.list().catch(() => []),
                    API.feedBrands.list().catch(() => []),
                    API.inventory.alerts().catch(() => []),
                ]);
            } catch (e) { console.error('Load error:', e); }
        }

        async function loadStockForAll() {
            const targets = activeWarehouses.value;
            if (!targets.length) { loading.value = false; return; }
            await Promise.all(targets.map(async w => {
                try {
                    stockMap.value[w.id] = await API.inventory.list(w.id);
                } catch { stockMap.value[w.id] = []; }
            }));
            loading.value = false;
        }

        async function checkAlerts() {
            try { alerts.value = await API.inventory.checkAlerts(); }
            catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        // ── Forms ──────────────────────────────────────
        function openWhForm(w) {
            whForm.value = w
                ? { ...w }
                : { name: '', code: '', warehouse_type: 'feed', barn_id: '', farm_id: 'farm-01', active: true, is_central: false };
            showWhModal.value = true;
        }
        function closeWhModal() { showWhModal.value = false; }

        function openProdForm(p) {
            prodForm.value = p
                ? { ...p }
                : { name: '', code: '', product_type: 'feed', unit: 'kg', min_stock_alert: null };
            showProdModal.value = true;
        }
        function closeProdModal() { showProdModal.value = false; }

        async function saveWh() {
            try {
                if (whForm.value.id) await API.warehouses.update(whForm.value.id, whForm.value);
                else await API.warehouses.create(whForm.value);
                closeWhModal();
                if (typeof showToast === 'function') showToast('Đã lưu kho', 'success');
                await load();
                await loadStockForAll();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function saveProd() {
            try {
                if (prodForm.value.id) await API.products.update(prodForm.value.id, prodForm.value);
                else await API.products.create(prodForm.value);
                closeProdModal();
                if (typeof showToast === 'function') showToast('Đã lưu sản phẩm', 'success');
                await load();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function removeWh(w) {
            if (!confirm('Xóa kho "' + w.name + '"?')) return;
            try {
                await API.warehouses.del(w.id);
                if (typeof showToast === 'function') showToast('Đã xóa kho', 'success');
                await load();
                await loadStockForAll();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        // ── Alert panel ────────────────────────────────
        async function ackAlert(a) {
            try {
                await API.inventory.ackAlert(a.id);
                if (typeof showToast === 'function') showToast('Đã đồng ý', 'success');
                alerts.value = await API.inventory.alerts();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }
        async function delAlert(a) {
            if (!confirm('Xóa cảnh báo này?')) return;
            try {
                await API.inventory.deleteAlert(a.id);
                if (typeof showToast === 'function') showToast('Đã xóa', 'success');
                alerts.value = await API.inventory.alerts();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        // ── Navigation ─────────────────────────────────
        function goToDetail(w) {
            router.push('/inventory/' + w.id);
        }

        // ── Misc helpers ───────────────────────────────
        function fmtNum(n, decimals = 0) {
            if (n === null || n === undefined) return '-';
            return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        }

        const activeAlertCount = computed(() => alerts.value.length);

        onMounted(async () => {
            await load();
            await loadStockForAll();
        });

        return {
            warehouses, products, barns, alerts,
            loading, filterType, activeWarehouses, grouped, activeAlertsByWh, activeAlertCount,
            showWhModal, showProdModal, whForm, prodForm, alertsPanelOpen,
            typeIcon, productName, topStock, cardFor,
            load, loadStockForAll, checkAlerts,
            openWhForm, closeWhModal, saveWh, removeWh,
            openProdForm, closeProdModal, saveProd,
            ackAlert, delAlert, goToDetail, fmtNum,
        };
    },

    template: `
    <div class="cf-container">

        <!-- Header -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon" style="background-color: #d97706;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/>
                        <path d="M3 9V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3"/>
                        <path d="M12 4v5"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">Quản lý kho</h1>
                    <p class="cf-subtitle">Kho, sản phẩm, tồn kho & cảnh báo</p>
                </div>
            </div>
            <div class="cf-header-right">
                <button @click="alertsPanelOpen = !alertsPanelOpen" :class="['cf-btn-sm', alertsPanelOpen ? 'cf-btn-danger' : 'cf-btn-secondary']">
                    <span v-if="activeAlertCount > 0" class="cf-badge cf-badge-red animate-pulse">{{ activeAlertCount }}</span>
                    Cảnh báo tồn kho
                </button>
                <button @click="openWhForm()" class="cf-btn-primary" style="background-color: #d97706;">+ Kho</button>
                <button @click="openProdForm()" class="cf-btn-primary" style="background-color: #1e40af;">+ Sản phẩm</button>
            </div>
        </div>

        <!-- Low Stock Alerts Panel (collapsible) -->
        <div v-if="alertsPanelOpen" class="cf-inv-alerts-panel">
            <div class="cf-inv-alerts-header">
                <h3 class="cf-inv-alerts-title">Cảnh báo tồn kho thấp</h3>
                <div class="cf-inv-alerts-actions">
                    <button @click="checkAlerts" class="cf-btn-sm cf-btn-secondary">Kiểm tra lại</button>
                    <button @click="alertsPanelOpen = false" class="cf-btn-sm cf-btn-ghost">Đóng</button>
                </div>
            </div>
            <div v-if="alerts.length" class="cf-inv-alerts-list">
                <div v-for="a in alerts" :key="a.id" class="cf-inv-alert-item" :class="a.severity === 'critical' ? 'critical' : 'warning'">
                    <div class="cf-inv-alert-info">
                        <span class="cf-inv-alert-product">{{ a.product_name }}</span>
                        <span class="cf-inv-alert-warehouse">- {{ a.warehouse_name }}</span>
                        <span class="cf-inv-alert-qty">({{ fmtNum(a.quantity) }}/{{ fmtNum(a.threshold_value) }})</span>
                    </div>
                    <div class="cf-inv-alert-right">
                        <span class="cf-badge" :class="a.severity === 'critical' ? 'cf-badge-red' : 'cf-badge-yellow'">{{ a.alert_type }}</span>
                        <button @click="ackAlert(a)" class="cf-btn-xs cf-btn-secondary">Đồng ý</button>
                        <button @click="delAlert(a)" class="cf-btn-xs cf-btn-danger">Xóa</button>
                    </div>
                </div>
            </div>
            <div v-else class="cf-inv-alerts-empty">Không có cảnh báo nào</div>
        </div>

        <!-- Type filter -->
        <div class="cf-inv-toolbar" v-if="warehouses.length">
            <span class="cf-text-muted text-sm">Lọc theo loại:</span>
            <select v-model="filterType" class="cf-select cf-select-sm">
                <option value="">Tất cả</option>
                <option value="feed">Cám</option>
                <option value="medication">Thuốc</option>
                <option value="mixed">Hỗn hợp</option>
                <option value="equipment">Thiết bị</option>
            </select>
        </div>

        <!-- Empty state: no warehouses -->
        <div v-if="!warehouses.length && !loading" class="cf-inv-empty-state" style="padding: 3rem 1rem;">
            <p style="font-size: 1rem; margin-bottom: 1rem;">Chưa có kho nào</p>
            <button @click="openWhForm()" class="cf-btn-primary" style="background-color: #d97706;">+ Tạo kho đầu tiên</button>
        </div>

        <!-- ── CENTRAL WAREHOUSES (hero) ── -->
        <template v-if="grouped.central.length">
            <div class="cf-inv-section-header">
                <span class="cf-inv-section-icon" style="background: #f3e8ff; color: #7c3aed;">🏛️</span>
                <h2 class="cf-inv-section-title">Kho trung tâm</h2>
            </div>
            <div class="cf-cards-grid cf-inv-dash-grid">
                <div v-for="w in grouped.central" :key="w.id" class="cf-inv-wh-card hero" @click="goToDetail(w)">
                    <div class="cf-inv-wh-card-banner" style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);"></div>
                    <div class="cf-inv-wh-card-body">
                        <div class="cf-inv-wh-card-title-row">
                            <span class="cf-inv-wh-card-icon">{{ typeIcon(w) }}</span>
                            <h3 class="cf-inv-wh-card-title">{{ w.name }}</h3>
                        </div>
                        <div class="cf-inv-wh-card-badges">
                            <span class="cf-badge cf-badge-purple">Trung tâm</span>
                            <span v-if="w.warehouse_type === 'feed'" class="cf-badge cf-badge-yellow">Cám</span>
                            <span v-else-if="w.warehouse_type === 'medication'" class="cf-badge cf-badge-blue">Thuốc</span>
                            <span v-else-if="w.warehouse_type === 'mixed'" class="cf-badge cf-badge-gray">Hỗn hợp</span>
                            <span v-else class="cf-badge cf-badge-gray">{{ w.warehouse_type }}</span>
                        </div>
                        <div class="cf-inv-wh-card-stock">
                            <div v-if="cardFor(w).top.length">
                                <div v-for="s in cardFor(w).top" :key="s.product_id" class="cf-inv-wh-card-stock-row">
                                    <span class="cf-inv-wh-card-stock-name">{{ s.product_name || productName(s.product_id) }}</span>
                                    <span class="cf-inv-wh-card-stock-qty" :class="s.min_stock_alert && Number(s.quantity) <= Number(s.min_stock_alert) ? 'low' : ''">
                                        {{ fmtNum(s.quantity, 1) }} {{ s.unit || '' }}
                                    </span>
                                </div>
                            </div>
                            <div v-else class="cf-inv-wh-card-stock-empty">
                                {{ loading ? 'Đang tải...' : 'Kho trống' }}
                            </div>
                        </div>
                        <div class="cf-inv-wh-card-footer">
                            <span v-if="cardFor(w).hasAlert" class="cf-badge cf-badge-red">⚠️ {{ cardFor(w).alertCount }} cảnh báo</span>
                            <span v-else class="cf-badge cf-badge-green">✅ Bình thường</span>
                            <div class="cf-inv-wh-card-actions" @click.stop>
                                <button @click="openWhForm(w)" class="cf-btn-ghost-sm" title="Sửa">✏️</button>
                                <button @click="removeWh(w)" class="cf-btn-ghost-sm danger" title="Xóa">🗑️</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- ── BARN SECTIONS ── -->
        <template v-for="group in grouped.barns" :key="group.barn.id">
            <div class="cf-inv-section-header">
                <span class="cf-inv-section-icon" style="background: #dbeafe; color: #1e40af;">📍</span>
                <h2 class="cf-inv-section-title">{{ group.barn.name }}</h2>
            </div>
            <div class="cf-cards-grid cf-inv-dash-grid">
                <div v-for="w in group.warehouses" :key="w.id" class="cf-inv-wh-card" @click="goToDetail(w)">
                    <div class="cf-inv-wh-card-banner" :class="'type-' + w.warehouse_type"></div>
                    <div class="cf-inv-wh-card-body">
                        <div class="cf-inv-wh-card-title-row">
                            <span class="cf-inv-wh-card-icon">{{ typeIcon(w) }}</span>
                            <h3 class="cf-inv-wh-card-title">{{ w.name }}</h3>
                        </div>
                        <div class="cf-inv-wh-card-badges">
                            <span class="cf-badge cf-badge-gray">{{ w.barn_id || '-' }}</span>
                            <span v-if="w.warehouse_type === 'feed'" class="cf-badge cf-badge-yellow">Cám</span>
                            <span v-else-if="w.warehouse_type === 'medication'" class="cf-badge cf-badge-blue">Thuốc</span>
                            <span v-else-if="w.warehouse_type === 'mixed'" class="cf-badge cf-badge-gray">Hỗn hợp</span>
                            <span v-else class="cf-badge cf-badge-gray">{{ w.warehouse_type }}</span>
                        </div>
                        <div class="cf-inv-wh-card-stock">
                            <div v-if="cardFor(w).top.length">
                                <div v-for="s in cardFor(w).top" :key="s.product_id" class="cf-inv-wh-card-stock-row">
                                    <span class="cf-inv-wh-card-stock-name">{{ s.product_name || productName(s.product_id) }}</span>
                                    <span class="cf-inv-wh-card-stock-qty" :class="s.min_stock_alert && Number(s.quantity) <= Number(s.min_stock_alert) ? 'low' : ''">
                                        {{ fmtNum(s.quantity, 1) }} {{ s.unit || '' }}
                                    </span>
                                </div>
                            </div>
                            <div v-else class="cf-inv-wh-card-stock-empty">
                                {{ loading ? 'Đang tải...' : 'Kho trống' }}
                            </div>
                        </div>
                        <div class="cf-inv-wh-card-footer">
                            <span v-if="cardFor(w).hasAlert" class="cf-badge cf-badge-red">⚠️ {{ cardFor(w).alertCount }} cảnh báo</span>
                            <span v-else class="cf-badge cf-badge-green">✅ Bình thường</span>
                            <div class="cf-inv-wh-card-actions" @click.stop>
                                <button @click="openWhForm(w)" class="cf-btn-ghost-sm" title="Sửa">✏️</button>
                                <button @click="removeWh(w)" class="cf-btn-ghost-sm danger" title="Xóa">🗑️</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- ── MODAL: WAREHOUSE FORM ── -->
        <teleport to="body">
            <div v-if="showWhModal" class="cf-modal-overlay" @click.self="closeWhModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #fef3c3; color: #92400e;">🏭</div>
                            <h3 class="cf-modal-title">{{ whForm.id ? 'Sửa kho' : 'Thêm kho' }}</h3>
                        </div>
                        <button @click="closeWhModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="saveWh">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Mã kho</label>
                                <input v-model="whForm.code" type="text" class="cf-input" placeholder="VD: WH-FEED-01">
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Tên kho <span class="req">*</span></label>
                                <input v-model="whForm.name" type="text" class="cf-input" placeholder="VD: Kho cám trung tâm" required>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Loại</label>
                                <select v-model="whForm.warehouse_type" class="cf-input">
                                    <option value="feed">Cám</option>
                                    <option value="medication">Thuốc</option>
                                    <option value="mixed">Hỗn hợp</option>
                                    <option value="equipment">Thiết bị</option>
                                    <option value="consumable">Tiêu hao</option>
                                </select>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label cf-label-checkbox">
                                    <input type="checkbox" v-model="whForm.is_central" class="cf-checkbox">
                                    Kho trung tâm
                                </label>
                            </div>
                            <div class="cf-form-group" v-if="!whForm.is_central">
                                <label class="cf-label">Chuồng</label>
                                <select v-model="whForm.barn_id" class="cf-input">
                                    <option value="">-- Chọn chuồng --</option>
                                    <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }} ({{ b.id }})</option>
                                </select>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Farm</label>
                                <input v-model="whForm.farm_id" type="text" class="cf-input" placeholder="farm-01">
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Địa chỉ</label>
                                <input v-model="whForm.address" type="text" class="cf-input" placeholder="Địa điểm kho">
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label cf-label-checkbox">
                                    <input type="checkbox" v-model="whForm.active" class="cf-checkbox">
                                    Hoạt động
                                </label>
                            </div>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeWhModal" class="cf-btn-secondary">Hủy bỏ</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #d97706;">Lưu kho</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

        <!-- ── MODAL: PRODUCT FORM ── -->
        <teleport to="body">
            <div v-if="showProdModal" class="cf-modal-overlay" @click.self="closeProdModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #dbeafe; color: #1e40af;">💊</div>
                            <h3 class="cf-modal-title">{{ prodForm.id ? 'Sửa sản phẩm' : 'Thêm sản phẩm' }}</h3>
                        </div>
                        <button @click="closeProdModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="saveProd">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Mã sản phẩm</label>
                                <input v-model="prodForm.code" type="text" class="cf-input" placeholder="VD: FEED-001">
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Tên <span class="req">*</span></label>
                                <input v-model="prodForm.name" type="text" class="cf-input" placeholder="VD: Cám gà con C01" required>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Loại</label>
                                <select v-model="prodForm.product_type" class="cf-input">
                                    <option value="feed">Cám</option>
                                    <option value="medication">Thuốc</option>
                                    <option value="medicine">Thuốc (chính)</option>
                                    <option value="equipment">Thiết bị</option>
                                    <option value="consumable">Tiêu hao</option>
                                </select>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Đơn vị</label>
                                <input v-model="prodForm.unit" type="text" class="cf-input" placeholder="VD: kg, lọ, viên">
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Mức tối thiểu (thấp hơn sẽ cảnh báo)</label>
                                <input v-model.number="prodForm.min_stock_alert" type="number" step="0.1" class="cf-input" placeholder="VD: 100">
                            </div>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeProdModal" class="cf-btn-secondary">Hủy bỏ</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #d97706;">Lưu sản phẩm</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

    </div>
    `
};
