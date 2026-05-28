/**
 * Inventory Page - Warehouse, Product, Stock & Alert Management
 * - Semantic .cf-* CSS classes (no Tailwind)
 * - 7 tabs: warehouses, barn-assignment, products, stock, actions, alerts, history
 * - Modal forms for create/edit
 * - showToast called with typeof guard
 */
const { ref, computed, onMounted, watch } = Vue;

return {
    setup() {
        // ── State ──────────────────────────────────────
        const warehouses = ref([]);
        const products = ref([]);
        const barns = ref([]);
        const stock = ref([]);
        const alerts = ref([]);
        const transactions = ref([]);
        const tab = ref('warehouses');
        const filterType = ref('');
        const selectedWh = ref('');
        const selectedWhName = ref('');
        const selectedBarn = ref('');
        const selectedStockBarn = ref('');
        const suggestedWh = ref(null);
        const showWhModal = ref(false);
        const showProdModal = ref(false);
        const showWhDetail = ref(false);
        const showSetDefaultWhModal = ref(false);
        const showTxModal = ref(false);
        const whDetail = ref({});
        const whDetailStock = ref([]);
        const whDetailZones = ref([]);
        const whForm = ref({});
        const prodForm = ref({});
        const alertsPanelOpen = ref(false);
        const setDefaultWhType = ref('');
        const setDefaultWhId = ref('');
        const importForm = ref({ warehouse_id: '', product_id: '', quantity: 0, note: '' });
        const exportForm = ref({ warehouse_id: '', product_id: '', quantity: 0, note: '' });
        const transferForm = ref({ from_warehouse_id: '', to_warehouse_id: '', product_id: '', quantity: 0 });
        const alertRules = ref([]);
        const showAlertRuleModal = ref(false);
        const alertRuleForm = ref({
            warehouse_id: '', product_id: '', alert_type: 'low_stock',
            threshold: null, frequency_minutes: 60, severity: 'warning', enabled: true, note: ''
        });

        // ── Computed ───────────────────────────────────
        const filteredWarehouses = computed(() => {
            if (!filterType.value) return warehouses.value;
            return warehouses.value.filter(w => w.warehouse_type === filterType.value);
        });

        const whForType = computed(() => {
            return warehouses.value.filter(w => {
                if (setDefaultWhType.value === 'feed') return w.warehouse_type === 'feed' || w.warehouse_type === 'mixed';
                return w.warehouse_type === 'medication' || w.warehouse_type === 'mixed';
            });
        });

        const stockWarehouseOptions = computed(() => {
            if (!selectedStockBarn.value) {
                return warehouses.value.filter(w => w.is_central && w.active !== false);
            }
            return warehouses.value.filter(w => (w.barn_id === selectedStockBarn.value || w.is_central) && w.active !== false);
        });

        const activeAlertCount = computed(() => alerts.value.length);

        watch(() => tab.value, (newTab) => {
            if (newTab === 'alerts') loadAlertRules();
        });

        // ── API ────────────────────────────────────────
        async function load() {
            try {
                [warehouses.value, products.value, barns.value] = await Promise.all([
                    API.warehouses.list().catch(() => []),
                    API.products.list().catch(() => []),
                    API.barns.list().catch(() => []),
                ]);
            } catch (e) { console.error('Load error:', e); }
        }

        async function loadStock() {
            if (!selectedWh.value) { stock.value = []; return; }
            try {
                stock.value = await API.inventory.list(selectedWh.value);
                const wh = warehouses.value.find(w => w.id == selectedWh.value);
                selectedWhName.value = wh ? wh.name : '';
            } catch { stock.value = []; }
        }

        async function loadSuggestedWarehouses() {
            if (!selectedBarn.value) return;
            try { suggestedWh.value = await API.barns.suggestedWarehouses(selectedBarn.value); }
            catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function onStockBarnChange() {
            selectedWh.value = '';
            stock.value = [];
            if (selectedStockBarn.value) {
                try {
                    const suggested = await API.barns.suggestedWarehouses(selectedStockBarn.value);
                    if (suggested.feed_warehouse && suggested.feed_warehouse.id) {
                        selectedWh.value = suggested.feed_warehouse.id;
                        await loadStock();
                    }
                } catch (e) { console.error('Auto-select warehouse error:', e); }
            }
        }

        async function loadTransactions() {
            if (!selectedWh.value) return;
            try {
                transactions.value = await API.inventory.transactions(selectedWh.value, 50);
                showTxModal.value = true;
            } catch { transactions.value = []; }
        }

        async function checkAlerts() {
            try { alerts.value = await API.inventory.checkAlerts(); }
            catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function loadAlerts() {
            try { alerts.value = await API.inventory.alerts(); }
            catch { alerts.value = []; }
        }

        async function loadAlertRules() {
            try { alertRules.value = await API.inventory.alertRules(); }
            catch { alertRules.value = []; }
        }

        async function loadWhDetailStock(whId) {
            try { whDetailStock.value = await API.inventory.list(whId); }
            catch { whDetailStock.value = []; }
        }

        async function loadWhDetailZones(whId) {
            try {
                const zones = await API.get(`/api/farm/warehouse-zones?warehouse_id=${whId}`);
                whDetailZones.value = zones || [];
            } catch { whDetailZones.value = []; }
        }

        // ── Form open/close ─────────────────────────────
        function openWhForm(w) {
            whForm.value = w ? { ...w } : { name: '', code: '', warehouse_type: 'feed', barn_id: '', farm_id: 'farm-01', active: true };
            showWhModal.value = true;
        }

        function openWhDetail(w) {
            whDetail.value = w;
            whDetailStock.value = [];
            whDetailZones.value = [];
            showWhDetail.value = true;
            loadWhDetailStock(w.id);
            loadWhDetailZones(w.id);
        }

        function openProdForm(p) {
            prodForm.value = p ? { ...p } : { name: '', code: '', product_type: 'feed', unit: 'kg', min_stock_alert: null };
            showProdModal.value = true;
        }

        function openSetDefaultWh(type, currentId) {
            setDefaultWhType.value = type;
            setDefaultWhId.value = currentId || '';
            showSetDefaultWhModal.value = true;
        }

        function openAlertRuleForm(r) {
            if (r) {
                alertRuleForm.value = {
                    id: r.id, warehouse_id: r.warehouse_id || '', product_id: r.product_id || '',
                    alert_type: r.alert_type || 'low_stock', threshold: r.threshold,
                    frequency_minutes: r.frequency_minutes, severity: r.severity || 'warning',
                    enabled: r.enabled !== false, note: r.note || ''
                };
            } else {
                alertRuleForm.value = {
                    warehouse_id: '', product_id: '', alert_type: 'low_stock',
                    threshold: null, frequency_minutes: 60, severity: 'warning', enabled: true, note: ''
                };
            }
            showAlertRuleModal.value = true;
        }

        function closeWhModal() { showWhModal.value = false; }
        function closeProdModal() { showProdModal.value = false; }
        function closeWhDetail() { showWhDetail.value = false; }
        function closeSetDefaultWhModal() { showSetDefaultWhModal.value = false; }
        function closeAlertRuleModal() { showAlertRuleModal.value = false; }
        function closeTxModal() { showTxModal.value = false; }

        // ── Save / Delete ────────────────────────────────
        async function saveWh() {
            try {
                if (whForm.value.id) await API.warehouses.update(whForm.value.id, whForm.value);
                else await API.warehouses.create(whForm.value);
                closeWhModal();
                if (typeof showToast === 'function') showToast('Đã lưu kho', 'success');
                await load();
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

        async function saveDefaultWh() {
            if (!setDefaultWhId.value || !selectedBarn.value) return;
            try {
                await API.barns.setDefaultWarehouse(selectedBarn.value, {
                    warehouse_type: setDefaultWhType.value,
                    warehouse_id: parseInt(setDefaultWhId.value)
                });
                closeSetDefaultWhModal();
                if (typeof showToast === 'function') showToast('Đã lưu kho mặc định', 'success');
                await loadSuggestedWarehouses();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function removeDefaultWh(barnId, whType) {
            if (!confirm('Bỏ gán kho ' + whType + ' mặc định?')) return;
            try {
                await API.barns.deleteDefaultWarehouse(barnId, whType);
                if (typeof showToast === 'function') showToast('Đã bỏ gán', 'success');
                await loadSuggestedWarehouses();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function removeWh(w) {
            if (!confirm('Xóa kho ' + w.name + '?')) return;
            try { await API.warehouses.del(w.id); if (typeof showToast === 'function') showToast('Đã xóa kho', 'success'); await load(); }
            catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function removeProd(p) {
            if (!confirm('Xóa ' + p.name + '?')) return;
            try { await API.products.del(p.id); if (typeof showToast === 'function') showToast('Đã xóa sản phẩm', 'success'); await load(); }
            catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function doImport() {
            try {
                await API.inventory.import(importForm.value);
                if (typeof showToast === 'function') showToast('Nhập kho thành công', 'success');
                importForm.value = { ...importForm.value, quantity: 0, note: '' };
                await loadStock();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function doExport() {
            try {
                await API.inventory.export(exportForm.value);
                if (typeof showToast === 'function') showToast('Xuất kho thành công', 'success');
                exportForm.value = { ...exportForm.value, quantity: 0, note: '' };
                await loadStock();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function doTransfer() {
            try {
                await API.inventory.transfer(transferForm.value);
                if (typeof showToast === 'function') showToast('Chuyển kho thành công', 'success');
                transferForm.value = { ...transferForm.value, quantity: 0 };
                await loadStock();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function ackAlert(a) {
            try { await API.inventory.ackAlert(a.id); if (typeof showToast === 'function') showToast('Đã đồng ý', 'success'); await loadAlerts(); }
            catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function delAlert(a) {
            if (!confirm('Xóa cảnh báo này?')) return;
            try { await API.inventory.deleteAlert(a.id); if (typeof showToast === 'function') showToast('Đã xóa', 'success'); await loadAlerts(); }
            catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function saveAlertRule() {
            const d = { ...alertRuleForm.value };
            if (!d.warehouse_id) { if (typeof showToast === 'function') showToast('Vui lòng chọn kho', 'error'); return; }
            if (!d.product_id) { if (typeof showToast === 'function') showToast('Vui lòng chọn sản phẩm', 'error'); return; }
            try {
                if (d.id) await API.inventory.updateAlertRule(d.id, d);
                else await API.inventory.createAlertRule(d);
                closeAlertRuleModal();
                if (typeof showToast === 'function') showToast('Đã lưu quy tắc', 'success');
                await loadAlertRules();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function toggleAlertRule(r) {
            try {
                await API.inventory.toggleAlertRule(r.id, !r.enabled);
                if (typeof showToast === 'function') showToast(r.enabled ? 'Đã tắt' : 'Đã bật', 'success');
                await loadAlertRules();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function deleteAlertRule(r) {
            if (!confirm('Xóa quy tắc "' + (r.product_name || r.alert_type) + '"?')) return;
            try { await API.inventory.deleteAlertRule(r.id); if (typeof showToast === 'function') showToast('Đã xóa', 'success'); await loadAlertRules(); }
            catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        // ── Misc helpers ────────────────────────────────
        function fmtNum(n, decimals = 0) {
            if (n === null || n === undefined) return '-';
            return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        }

        function fmtDate(d) {
            if (!d) return '-';
            return new Date(d).toLocaleString('vi-VN');
        }

        onMounted(async () => { await load(); await loadAlerts(); await loadAlertRules(); });

        return {
            warehouses, products, barns, stock, alerts, transactions, tab, filterType,
            selectedWh, selectedWhName, selectedBarn, suggestedWh, selectedStockBarn, stockWarehouseOptions,
            showWhModal, showProdModal, showWhDetail, showSetDefaultWhModal, showTxModal,
            whDetail, whDetailStock, whDetailZones, whForm, prodForm, alertsPanelOpen,
            setDefaultWhType, setDefaultWhId, importForm, exportForm, transferForm,
            alertRules, showAlertRuleModal, alertRuleForm,
            filteredWarehouses, whForType, activeAlertCount,
            load, loadStock, loadSuggestedWarehouses, loadTransactions, loadAlerts, loadAlertRules, checkAlerts, onStockBarnChange,
            openWhForm, openWhDetail, openProdForm, openSetDefaultWh, openAlertRuleForm,
            closeWhModal, closeProdModal, closeWhDetail, closeSetDefaultWhModal, closeAlertRuleModal, closeTxModal,
            saveWh, saveProd, saveDefaultWh, removeDefaultWh, removeWh, removeProd,
            doImport, doExport, doTransfer, ackAlert, delAlert, toggleAlertRule, deleteAlertRule,
            fmtNum, fmtDate
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
            </div>
        </div>

        <!-- Low Stock Alerts Banner -->
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
                    </div>
                </div>
            </div>
            <div v-else class="cf-inv-alerts-empty">Không có cảnh báo nào</div>
        </div>

        <!-- Tab Switcher -->
        <div class="cf-inv-tabs">
            <button v-for="t in [
                {key:'warehouses', label:'Kho'},
                {key:'barn-assignment', label:'Gán kho mặc định'},
                {key:'products', label:'Sản phẩm'},
                {key:'stock', label:'Tồn kho'},
                {key:'actions', label:'Nhập/Xuất/Chuyển'},
                {key:'alerts', label:'Cảnh báo'}
            ]" :key="t.key" @click="tab = t.key" :class="['cf-inv-tab-btn', tab === t.key ? 'active' : '']">
                {{ t.label }}
                <span v-if="t.key === 'alerts' && activeAlertCount > 0" class="cf-badge cf-badge-red ml-1">{{ activeAlertCount }}</span>
            </button>
        </div>

        <!-- ── TAB: WAREHOUSES ── -->
        <div v-if="tab === 'warehouses'">
            <div class="cf-inv-toolbar">
                <button @click="openWhForm()" class="cf-btn-primary" style="background-color: #d97706;">
                    + Thêm kho
                </button>
                <select v-model="filterType" class="cf-select cf-select-sm">
                    <option value="">Tất cả loại</option>
                    <option value="feed">Cám</option>
                    <option value="medication">Thuốc</option>
                    <option value="mixed">Hợp nhất</option>
                </select>
            </div>
            <div class="cf-card" style="padding: 0;">
                <div class="cf-table-wrapper">
                    <table class="cf-table">
                        <thead>
                            <tr>
                                <th>Tên kho</th><th>Loại</th><th>Loại kho</th><th>Chuồng</th><th>Trạng thái</th><th class="text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="w in filteredWarehouses" :key="w.id" class="cf-table-tr" @click="openWhDetail(w)">
                                <td class="cf-inv-wh-name">{{ w.name }}</td>
                                <td>
                                    <span v-if="w.warehouse_type === 'feed'" class="cf-badge cf-badge-yellow">Cám</span>
                                    <span v-else-if="w.warehouse_type === 'medication'" class="cf-badge cf-badge-blue">Thuốc</span>
                                    <span v-else class="cf-badge cf-badge-gray">Hợp nhất</span>
                                </td>
                                <td>
                                    <span v-if="w.is_central" class="cf-badge cf-badge-purple">Trung tâm</span>
                                    <span v-else class="cf-badge cf-badge-gray">Chuồng</span>
                                </td>
                                <td class="cf-text-muted">{{ w.barn_id || '-' }}</td>
                                <td>
                                    <span v-if="w.active !== false" class="cf-badge cf-badge-green">Hoạt động</span>
                                    <span v-else class="cf-badge cf-badge-red">Không hoạt động</span>
                                </td>
                                <td @click.stop>
                                    <div class="cf-inv-row-actions">
                                        <button @click="openWhForm(w)" class="cf-btn-ghost-sm">✏️ Sửa</button>
                                        <button @click="removeWh(w)" class="cf-btn-ghost-sm danger">🗑️ Xóa</button>
                                    </div>
                                </td>
                            </tr>
                            <tr v-if="!filteredWarehouses.length">
                                <td colspan="6" class="cf-table-empty">Chưa có kho</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- ── TAB: BARN ASSIGNMENT ── -->
        <div v-if="tab === 'barn-assignment'">
            <p class="cf-inv-subtitle">Gán kho mặc định cho từng chuồng. Kho mặc định sẽ tự động được sử dụng khi ghi nhận thức ăn/thuốc.</p>
            <div class="cf-inv-barn-select-row">
                <select v-model="selectedBarn" class="cf-select" style="flex: 1;">
                    <option value="">-- Chọn chuồng --</option>
                    <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }} ({{ b.farm_id }})</option>
                </select>
                <button v-if="selectedBarn" @click="loadSuggestedWarehouses" class="cf-btn-sm cf-btn-secondary">Tải kho đề xuất</button>
            </div>

            <div v-if="selectedBarn && suggestedWh" class="cf-inv-barn-assignment-grid">
                <div class="cf-inv-assign-card feed">
                    <div class="cf-inv-assign-header">
                        <h4 class="cf-inv-assign-title">Kho cám mặc định</h4>
                        <button v-if="suggestedWh.feed_warehouse" @click="removeDefaultWh(selectedBarn, 'feed')" class="cf-btn-xs cf-btn-secondary">Gỡ bỏ</button>
                    </div>
                    <div v-if="suggestedWh.feed_warehouse">
                        <div class="cf-inv-assign-wh-name">{{ suggestedWh.feed_warehouse.name }}</div>
                        <div class="cf-inv-assign-wh-code">{{ suggestedWh.feed_warehouse.code }}</div>
                        <div class="cf-inv-assign-stock">
                            <span class="cf-inv-stock-green">Tổng tồn: {{ fmtNum(suggestedWh.feed_warehouse.total_quantity) }} kg</span>
                            <span v-if="suggestedWh.feed_warehouse.low_stock_items > 0" class="cf-inv-stock-red ml-2">
                                {{ suggestedWh.feed_warehouse.low_stock_items }} món dưới mức tối thiểu
                            </span>
                        </div>
                        <button class="cf-btn-sm cf-btn-primary mt-2" style="background-color: #d97706;" @click="openSetDefaultWh('feed', suggestedWh.feed_warehouse.id)">Đổi kho</button>
                    </div>
                    <div v-else>
                        <p class="cf-inv-assign-empty">Chưa có kho cám mặc định</p>
                        <button class="cf-btn-sm cf-btn-primary mt-2" style="background-color: #d97706;" @click="openSetDefaultWh('feed')">+ Gán kho cám</button>
                    </div>
                </div>
                <div class="cf-inv-assign-card medication">
                    <div class="cf-inv-assign-header">
                        <h4 class="cf-inv-assign-title">Kho thuốc mặc định</h4>
                        <button v-if="suggestedWh.medication_warehouse" @click="removeDefaultWh(selectedBarn, 'medication')" class="cf-btn-xs cf-btn-secondary">Gỡ bỏ</button>
                    </div>
                    <div v-if="suggestedWh.medication_warehouse">
                        <div class="cf-inv-assign-wh-name">{{ suggestedWh.medication_warehouse.name }}</div>
                        <div class="cf-inv-assign-wh-code">{{ suggestedWh.medication_warehouse.code }}</div>
                        <div class="cf-inv-assign-stock">
                            <span class="cf-inv-stock-green">Tổng tồn: {{ fmtNum(suggestedWh.medication_warehouse.total_quantity) }}</span>
                            <span v-if="suggestedWh.medication_warehouse.low_stock_items > 0" class="cf-inv-stock-red ml-2">
                                {{ suggestedWh.medication_warehouse.low_stock_items }} món dưới mức tối thiểu
                            </span>
                        </div>
                        <button class="cf-btn-sm cf-btn-primary mt-2" style="background-color: #d97706;" @click="openSetDefaultWh('medication', suggestedWh.medication_warehouse.id)">Đổi kho</button>
                    </div>
                    <div v-else>
                        <p class="cf-inv-assign-empty">Chưa có kho thuốc mặc định</p>
                        <button class="cf-btn-sm cf-btn-primary mt-2" style="background-color: #d97706;" @click="openSetDefaultWh('medication')">+ Gán kho thuốc</button>
                    </div>
                </div>
            </div>
            <div v-else-if="selectedBarn" class="cf-inv-empty-state"><p>Chọn kho để gán</p></div>
            <div v-else class="cf-inv-empty-state"><p>Vui lòng chọn một chuồng</p></div>
        </div>

        <!-- ── TAB: PRODUCTS ── -->
        <div v-if="tab === 'products'">
            <div class="cf-inv-toolbar">
                <button @click="openProdForm()" class="cf-btn-primary" style="background-color: #d97706;">
                    + Thêm sản phẩm
                </button>
            </div>
            <div class="cf-card" style="padding: 0;">
                <div class="cf-table-wrapper">
                    <table class="cf-table">
                        <thead>
                            <tr><th>Tên</th><th>Loại</th><th>Đơn vị</th><th>Mức tối thiểu</th><th class="text-right">Thao tác</th></tr>
                        </thead>
                        <tbody>
                            <tr v-for="p in products" :key="p.id" class="cf-table-tr">
                                <td class="cf-inv-prod-name">{{ p.name }}</td>
                                <td>
                                    <span v-if="p.product_type === 'feed'" class="cf-badge cf-badge-yellow">Cám</span>
                                    <span v-else-if="p.product_type === 'medication' || p.product_type === 'medicine'" class="cf-badge cf-badge-blue">Thuốc</span>
                                    <span v-else class="cf-badge cf-badge-gray">{{ p.product_type }}</span>
                                </td>
                                <td>{{ p.unit }}</td>
                                <td>
                                    <span v-if="p.min_stock_alert" :class="p.min_stock_alert > 0 ? 'cf-inv-min-stock-low' : 'cf-text-muted'">
                                        {{ fmtNum(p.min_stock_alert) }}
                                    </span>
                                    <span v-else class="cf-text-muted">-</span>
                                </td>
                                <td>
                                    <div class="cf-inv-row-actions">
                                        <button @click="openProdForm(p)" class="cf-btn-ghost-sm">✏️ Sửa</button>
                                        <button @click="removeProd(p)" class="cf-btn-ghost-sm danger">🗑️ Xóa</button>
                                    </div>
                                </td>
                            </tr>
                            <tr v-if="!products.length">
                                <td colspan="5" class="cf-table-empty">Chưa có sản phẩm</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- ── TAB: STOCK ── -->
        <div v-if="tab === 'stock'">
            <div class="cf-inv-toolbar">
                <select v-model="selectedStockBarn" @change="onStockBarnChange" class="cf-select" style="flex: 1;">
                    <option value="">-- Kho trung tâm --</option>
                    <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
                <select v-model="selectedWh" @change="loadStock" class="cf-select" style="flex: 1;">
                    <option value="">-- Chọn kho --</option>
                    <option v-for="w in stockWarehouseOptions" :key="w.id" :value="w.id">{{ w.name }} ({{ w.warehouse_type }})</option>
                </select>
                <button v-if="selectedWh" @click="loadTransactions" class="cf-btn-sm cf-btn-secondary">Lịch sử</button>
            </div>
            <div v-if="stock.length" class="cf-card" style="padding: 0;">
                <div class="cf-table-wrapper">
                    <table class="cf-table">
                        <thead>
                            <tr><th>Sản phẩm</th><th>Đơn vị</th><th>Tồn kho</th><th>Mức tối thiểu</th><th>Tình trạng</th></tr>
                        </thead>
                        <tbody>
                            <tr v-for="s in stock" :key="s.product_id" class="cf-table-tr" :class="s.min_stock_alert && s.quantity <= s.min_stock_alert ? 'cf-inv-stock-low' : ''">
                                <td>{{ s.product_name || s.product_id }}</td>
                                <td>{{ s.unit || '-' }}</td>
                                <td class="cf-inv-stock-qty" :class="s.min_stock_alert && s.quantity <= s.min_stock_alert ? 'cf-inv-stock-qty-low' : ''">
                                    {{ fmtNum(s.quantity, 2) }}
                                </td>
                                <td>{{ s.min_stock_alert ? fmtNum(s.min_stock_alert) : '-' }}</td>
                                <td>
                                    <span v-if="s.min_stock_alert && s.quantity <= s.min_stock_alert" class="cf-badge cf-badge-red">Dưới tối thiểu</span>
                                    <span v-else-if="s.min_stock_alert && s.quantity <= s.min_stock_alert * 1.5" class="cf-badge cf-badge-yellow">Gần tối thiểu</span>
                                    <span v-else class="cf-badge cf-badge-green">Bình thường</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div v-else-if="selectedWh" class="cf-inv-empty-state"><p>Kho trống</p></div>
        </div>

        <!-- ── TAB: ACTIONS ── -->
        <div v-if="tab === 'actions'" class="cf-inv-actions-grid">
            <div class="cf-inv-toolbar" style="grid-column: 1/-1;">
                <select v-model="selectedStockBarn" class="cf-select" style="flex: 1;">
                    <option value="">-- Kho trung tâm --</option>
                    <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
                <span class="cf-text-muted text-sm">Chọn chuồng để lọc kho tự động</span>
            </div>

            <!-- Import Card -->
            <div class="cf-inv-action-card import">
                <h3 class="cf-inv-action-title import">Nhập kho</h3>
                <div class="cf-form-group">
                    <label class="cf-label">Kho</label>
                    <select v-model="importForm.warehouse_id" class="cf-input">
                        <option value="">--</option>
                        <option v-for="w in stockWarehouseOptions" :key="w.id" :value="w.id">{{ w.name }}</option>
                    </select>
                </div>
                <div class="cf-form-group">
                    <label class="cf-label">Sản phẩm</label>
                    <select v-model="importForm.product_id" class="cf-input">
                        <option value="">--</option>
                        <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                </div>
                <div class="cf-form-group">
                    <label class="cf-label">Số lượng</label>
                    <input v-model.number="importForm.quantity" type="number" step="0.1" class="cf-input">
                </div>
                <div class="cf-form-group">
                    <label class="cf-label">Ghi chú</label>
                    <input v-model="importForm.note" type="text" class="cf-input">
                </div>
                <button @click="doImport" class="cf-btn-primary" style="background-color: #16a34a; width: 100%;">Nhập kho</button>
            </div>

            <!-- Export Card -->
            <div class="cf-inv-action-card export">
                <h3 class="cf-inv-action-title export">Xuất kho</h3>
                <div class="cf-form-group">
                    <label class="cf-label">Kho</label>
                    <select v-model="exportForm.warehouse_id" class="cf-input">
                        <option value="">--</option>
                        <option v-for="w in stockWarehouseOptions" :key="w.id" :value="w.id">{{ w.name }}</option>
                    </select>
                </div>
                <div class="cf-form-group">
                    <label class="cf-label">Sản phẩm</label>
                    <select v-model="exportForm.product_id" class="cf-input">
                        <option value="">--</option>
                        <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                </div>
                <div class="cf-form-group">
                    <label class="cf-label">Số lượng</label>
                    <input v-model.number="exportForm.quantity" type="number" step="0.1" class="cf-input">
                </div>
                <div class="cf-form-group">
                    <label class="cf-label">Ghi chú</label>
                    <input v-model="exportForm.note" type="text" class="cf-input">
                </div>
                <button @click="doExport" class="cf-btn-primary" style="background-color: #dc2626; width: 100%;">Xuất kho</button>
            </div>

            <!-- Transfer Card -->
            <div class="cf-inv-action-card transfer">
                <h3 class="cf-inv-action-title transfer">Chuyển kho</h3>
                <div class="cf-form-group">
                    <label class="cf-label">Từ kho</label>
                    <select v-model="transferForm.from_warehouse_id" class="cf-input">
                        <option value="">--</option>
                        <option v-for="w in stockWarehouseOptions" :key="w.id" :value="w.id">{{ w.name }}</option>
                    </select>
                </div>
                <div class="cf-form-group">
                    <label class="cf-label">Đến kho</label>
                    <select v-model="transferForm.to_warehouse_id" class="cf-input">
                        <option value="">--</option>
                        <option v-for="w in stockWarehouseOptions" :key="w.id" :value="w.id">{{ w.name }}</option>
                    </select>
                </div>
                <div class="cf-form-group">
                    <label class="cf-label">Sản phẩm</label>
                    <select v-model="transferForm.product_id" class="cf-input">
                        <option value="">--</option>
                        <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                </div>
                <div class="cf-form-group">
                    <label class="cf-label">Số lượng</label>
                    <input v-model.number="transferForm.quantity" type="number" step="0.1" class="cf-input">
                </div>
                <button @click="doTransfer" class="cf-btn-primary" style="background-color: #d97706; width: 100%;">Chuyển kho</button>
            </div>
        </div>

        <!-- ── TAB: ALERTS ── -->
        <div v-if="tab === 'alerts'" class="cf-inv-alerts-section">
            <!-- Active Alerts -->
            <div class="cf-inv-current-alerts">
                <div class="cf-inv-section-header">
                    <h3 class="cf-inv-section-title">Cảnh báo hiện tại</h3>
                    <button @click="checkAlerts" class="cf-btn-sm cf-btn-secondary">Kiểm tra lại</button>
                </div>
                <div v-if="alerts.length" class="cf-inv-alerts-list">
                    <div v-for="a in alerts" :key="a.id" class="cf-inv-alert-item" :class="a.severity === 'critical' ? 'critical' : 'warning'">
                        <div class="cf-inv-alert-info">
                            <span class="cf-inv-alert-product">{{ a.product_name }}</span>
                            <span class="cf-inv-alert-warehouse">- {{ a.warehouse_name }}</span>
                            <span class="cf-inv-alert-qty">({{ fmtNum(a.current_quantity) }}/{{ fmtNum(a.threshold_value) }})</span>
                            <div class="cf-inv-alert-message">{{ a.message }}</div>
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

            <!-- Alert Rules -->
            <div class="cf-inv-alert-rules">
                <div class="cf-inv-section-header">
                    <h3 class="cf-inv-section-title">Quy tắc cảnh báo</h3>
                    <button @click="openAlertRuleForm()" class="cf-btn-primary" style="background-color: #d97706;">+ Thêm quy tắc</button>
                </div>
                <p class="cf-inv-rules-desc">Quy tắc giúp tùy chỉnh ngưỡng và tần suất cảnh báo cho từng kho/sản phẩm cụ thể.</p>
                <div v-if="alertRules.length" class="cf-card" style="padding: 0;">
                    <div class="cf-table-wrapper">
                        <table class="cf-table">
                            <thead>
                                <tr><th>Kho</th><th>Sản phẩm</th><th>Loại</th><th>Ngưỡng</th><th>Tần suất</th><th>Trạng thái</th><th class="text-right">Thao tác</th></tr>
                            </thead>
                            <tbody>
                                <tr v-for="r in alertRules" :key="r.id" class="cf-table-tr" :class="r.enabled ? '' : 'cf-inv-rule-disabled'">
                                    <td>{{ r.warehouse_name || 'Tất cả' }}</td>
                                    <td>{{ r.product_name || 'Tất cả' }}</td>
                                    <td>
                                        <span v-if="r.alert_type === 'low_stock'" class="cf-badge cf-badge-yellow">Tồn thấp</span>
                                        <span v-else-if="r.alert_type === 'out_of_stock'" class="cf-badge cf-badge-red">Hết hàng</span>
                                        <span v-else class="cf-badge cf-badge-gray">{{ r.alert_type }}</span>
                                    </td>
                                    <td>{{ r.threshold ? fmtNum(r.threshold) : '(mặc định)' }}</td>
                                    <td>{{ r.frequency_minutes ? r.frequency_minutes + ' phút' : 'thủ công' }}</td>
                                    <td>
                                        <span v-if="r.enabled" class="cf-badge cf-badge-green">Bật</span>
                                        <span v-else class="cf-badge cf-badge-gray">Tắt</span>
                                    </td>
                                    <td>
                                        <div class="cf-inv-row-actions">
                                            <button @click="toggleAlertRule(r)" class="cf-btn-ghost-sm">{{ r.enabled ? 'Tắt' : 'Bật' }}</button>
                                            <button @click="openAlertRuleForm(r)" class="cf-btn-ghost-sm">✏️ Sửa</button>
                                            <button @click="deleteAlertRule(r)" class="cf-btn-ghost-sm danger">🗑️ Xóa</button>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <div v-else class="cf-inv-empty-state"><p>Chưa có quy tắc nào</p></div>
            </div>
        </div>

        <!-- ── MODAL: WAREHOUSE DETAIL ── -->
        <teleport to="body">
            <div v-if="showWhDetail" class="cf-modal-overlay" @click.self="closeWhDetail">
                <div class="cf-modal-box" style="max-width: 640px;">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #fef3c3; color: #92400e;">📦</div>
                            <h3 class="cf-modal-title">{{ whDetail.name }}</h3>
                        </div>
                        <button @click="closeWhDetail" class="cf-modal-close-btn">✕</button>
                    </div>
                    <div class="cf-modal-body">
                        <div class="cf-inv-detail-grid">
                            <div class="cf-inv-detail-item"><span class="cf-inv-detail-label">Mã kho:</span> {{ whDetail.code }}</div>
                            <div class="cf-inv-detail-item"><span class="cf-inv-detail-label">Loại:</span> {{ whDetail.warehouse_type }}</div>
                            <div class="cf-inv-detail-item"><span class="cf-inv-detail-label">Loại kho:</span> {{ whDetail.is_central ? 'Trung tâm' : 'Chuồng' }}</div>
                            <div class="cf-inv-detail-item"><span class="cf-inv-detail-label">Trạng thái:</span> {{ whDetail.active !== false ? 'Hoạt động' : 'Không hoạt động' }}</div>
                            <div class="cf-inv-detail-item"><span class="cf-inv-detail-label">Chuồng:</span> {{ whDetail.barn_id || '-' }}</div>
                            <div class="cf-inv-detail-item"><span class="cf-inv-detail-label">Farm:</span> {{ whDetail.farm_id }}</div>
                            <div v-if="whDetail.address" class="cf-inv-detail-item"><span class="cf-inv-detail-label">Địa chỉ:</span> {{ whDetail.address }}</div>
                            <div v-if="whDetail.capacity_kg" class="cf-inv-detail-item"><span class="cf-inv-detail-label">Dung tích:</span> {{ whDetail.capacity_kg }} kg</div>
                        </div>

                        <h4 class="cf-modal-section-title">Tồn kho hiện tại</h4>
                        <div v-if="whDetailStock.length" class="cf-table-wrapper mb-4">
                            <table class="cf-table">
                                <thead><tr><th>Sản phẩm</th><th>Đơn vị</th><th>Số lượng</th><th>Dưới mức tối thiểu?</th></tr></thead>
                                <tbody>
                                    <tr v-for="s in whDetailStock" :key="s.product_id" class="cf-table-tr" :class="s.min_stock_alert && s.quantity <= s.min_stock_alert ? 'cf-inv-stock-low' : ''">
                                        <td>{{ s.product_name }}</td>
                                        <td>{{ s.unit }}</td>
                                        <td class="cf-inv-stock-qty">{{ fmtNum(s.quantity, 2) }}</td>
                                        <td>
                                            <span v-if="s.min_stock_alert && s.quantity <= s.min_stock_alert" class="cf-badge cf-badge-red">Dưới</span>
                                            <span v-else class="cf-inv-ok-text">OK</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div v-else class="cf-inv-empty-state mb-4"><p>Kho trống</p></div>

                        <div v-if="whDetailZones.length">
                            <h4 class="cf-modal-section-title">Các vùng kho</h4>
                            <div class="cf-inv-zones-list">
                                <span v-for="z in whDetailZones" :key="z.id" class="cf-badge cf-badge-gray">{{ z.name }} ({{ z.zone_type }})</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </teleport>

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
                                    <option value="mixed">Hợp nhất</option>
                                    <option value="equipment">Thiết bị</option>
                                    <option value="consumable">Tiêu hao</option>
                                </select>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Chuồng (nếu là kho chuồng)</label>
                                <select v-model="whForm.barn_id" class="cf-input">
                                    <option value="">-- Kho trung tâm --</option>
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

        <!-- ── MODAL: SET DEFAULT WAREHOUSE ── -->
        <teleport to="body">
            <div v-if="showSetDefaultWhModal" class="cf-modal-overlay" @click.self="closeSetDefaultWhModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #fef3c3; color: #92400e;">🏷️</div>
                            <h3 class="cf-modal-title">Gán kho {{ setDefaultWhType === 'feed' ? 'cám' : 'thuốc' }} mặc định</h3>
                        </div>
                        <button @click="closeSetDefaultWhModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="saveDefaultWh">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Chọn kho <span class="req">*</span></label>
                                <select v-model="setDefaultWhId" class="cf-input" required>
                                    <option value="">-- Chọn kho --</option>
                                    <option v-for="w in whForType" :key="w.id" :value="w.id">{{ w.name }} ({{ w.code }})</option>
                                </select>
                            </div>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeSetDefaultWhModal" class="cf-btn-secondary">Hủy bỏ</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #d97706;">Lưu</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

        <!-- ── MODAL: ALERT RULE FORM ── -->
        <teleport to="body">
            <div v-if="showAlertRuleModal" class="cf-modal-overlay" @click.self="closeAlertRuleModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #fee2e2; color: #991b1b;">⚠️</div>
                            <h3 class="cf-modal-title">{{ alertRuleForm.id ? 'Sửa quy tắc' : 'Thêm quy tắc cảnh báo' }}</h3>
                        </div>
                        <button @click="closeAlertRuleModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="saveAlertRule">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Kho <span class="req">*</span></label>
                                <select v-model="alertRuleForm.warehouse_id" class="cf-input" required>
                                    <option value="">-- Chọn kho --</option>
                                    <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                                </select>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Sản phẩm <span class="req">*</span></label>
                                <select v-model="alertRuleForm.product_id" class="cf-input" required>
                                    <option value="">-- Chọn sản phẩm --</option>
                                    <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                                </select>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Loại cảnh báo <span class="req">*</span></label>
                                <select v-model="alertRuleForm.alert_type" class="cf-input" required>
                                    <option value="low_stock">Tồn kho thấp</option>
                                    <option value="out_of_stock">Hết hàng</option>
                                    <option value="overstock">Quá nhiều</option>
                                </select>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Ngưỡng (bỏ trống = dùng ngưỡng mặc định của sản phẩm)</label>
                                <input v-model.number="alertRuleForm.threshold" type="number" step="0.1" class="cf-input" placeholder="VD: 100">
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Tần suất kiểm tra (phút, 0 hoặc để trống = thủ công)</label>
                                <input v-model.number="alertRuleForm.frequency_minutes" type="number" step="5" min="0" class="cf-input" placeholder="60">
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Mức độ</label>
                                <select v-model="alertRuleForm.severity" class="cf-input">
                                    <option value="info">Thông tin</option>
                                    <option value="warning">Cảnh chú ý</option>
                                    <option value="critical">Nguy hiểm</option>
                                </select>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Ghi chú</label>
                                <input v-model="alertRuleForm.note" type="text" class="cf-input" placeholder="Ghi chú thêm...">
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label cf-label-checkbox">
                                    <input type="checkbox" v-model="alertRuleForm.enabled" class="cf-checkbox">
                                    Bật hiện tại
                                </label>
                            </div>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeAlertRuleModal" class="cf-btn-secondary">Hủy bỏ</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #d97706;">Lưu quy tắc</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

        <!-- ── MODAL: TRANSACTIONS ── -->
        <teleport to="body">
            <div v-if="showTxModal" class="cf-modal-overlay" @click.self="closeTxModal">
                <div class="cf-modal-box" style="max-width: 700px;">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #dbeafe; color: #1e40af;">📋</div>
                            <h3 class="cf-modal-title">Lịch sử kho - {{ selectedWhName }}</h3>
                        </div>
                        <button @click="closeTxModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <div class="cf-modal-body">
                        <div v-if="transactions.length" class="cf-table-wrapper" style="max-height: 24rem; overflow-y: auto;">
                            <table class="cf-table">
                                <thead><tr><th>Thời gian</th><th>Sản phẩm</th><th>Loại</th><th>Số lượng</th><th>Ghi chú</th></tr></thead>
                                <tbody>
                                    <tr v-for="t in transactions" :key="t.id" class="cf-table-tr">
                                        <td class="cf-text-sm cf-text-muted">{{ fmtDate(t.created_at) }}</td>
                                        <td>{{ t.product_name }}</td>
                                        <td>
                                            <span v-if="t.transaction_type === 'import'" class="cf-badge cf-badge-green">Nhập</span>
                                            <span v-else-if="t.transaction_type === 'export'" class="cf-badge cf-badge-red">Xuất</span>
                                            <span v-else class="cf-badge cf-badge-gray">{{ t.transaction_type }}</span>
                                        </td>
                                        <td :class="t.quantity > 0 ? 'cf-inv-txn-pos' : 'cf-inv-txn-neg'">{{ fmtNum(t.quantity) }}</td>
                                        <td class="cf-text-sm cf-text-muted">{{ t.notes || '-' }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div v-else class="cf-inv-empty-state"><p>Không có lịch sử</p></div>
                    </div>
                    <div class="cf-modal-footer">
                        <button @click="closeTxModal" class="cf-btn-secondary">Đóng</button>
                    </div>
                </div>
            </div>
        </teleport>

    </div>
    `
};