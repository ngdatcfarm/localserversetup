/**
 * Alerts Page - He thong Canh bao & Giam sat Rong ro
 * - 4 tabs: Cam bien, Kho, Vaccine, Push
 * - Semantic .cf-* CSS classes (no Tailwind)
 * - Real API calls throughout
 */
const { ref, reactive, computed, onMounted, watch } = Vue;

return {
    setup() {
        // ── State ──────────────────────────────────────
        const tabType = ref('sensor');
        const filterBarn = ref('');
        const vaccineFilterDays = ref(14);
        const loading = ref(false);
        const loadingSensorRules = ref(false);
        const loadingInventoryRules = ref(false);

        // Modals
        const showSensorModal = ref(false);
        const showInventoryModal = ref(false);

        // Sensor form
        const sensorForm = reactive({
            id: null, name: '', sensor_type: 'temperature', barn_id: '',
            min_value: null, max_value: null, severity: 'warning',
            cooldown_minutes: 15, enabled: true
        });

        // Inventory form
        const inventoryForm = reactive({
            id: null, warehouse_id: null, product_id: null,
            threshold: null, severity: 'warning'
        });

        // Data lists
        const barns = ref([]);
        const warehouses = ref([]);
        const products = ref([]);

        const activeSensorAlerts = ref([]);
        const sensorAlertHistory = ref([]);
        const sensorRules = ref([]);

        const activeInventoryAlerts = ref([]);
        const inventoryAlertHistory = ref([]);
        const inventoryRules = ref([]);

        const vaccineSchedules = ref([]);
        const upcomingVaccines = ref([]);

        const pushSubscriptions = ref([]);
        const pushSubscribed = ref(false);

        // Simulation
        const simBarnId = ref('');
        const simType = ref('temperature');
        const simVal = ref(40);
        const simProdName = ref('');
        const simWhName = ref('');
        const simQty = ref(0);

        // ── Computed ────────────────────────────────────
        const activeInventoryCount = computed(() => activeInventoryAlerts.value.length);
        const activeSensorCount = computed(() => activeSensorAlerts.value.length);

        const filteredInventoryRules = computed(() => {
            let list = inventoryRules.value;
            if (filterBarn.value) {
                list = list.filter(r => r.warehouse_id && String(r.warehouse_id) === filterBarn.value);
            }
            return list;
        });

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

        // ── API ────────────────────────────────────────
        async function loadAll() {
            loading.value = true;
            try {
                const [b, w, p] = await Promise.all([
                    API.barns.list(),
                    API.warehouses.list(),
                    API.products.list(),
                ]);
                barns.value = b;
                warehouses.value = w;
                products.value = p;

                if (barns.value.length && !simBarnId.value) {
                    simBarnId.value = b[0].id;
                }

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
            } finally {
                loading.value = false;
            }
        }

        async function loadSensorAlerts() {
            try {
                const [active, history] = await Promise.all([
                    API.sensorAlerts.active(),
                    API.sensorAlerts.list(true, undefined, 50),
                ]);
                activeSensorAlerts.value = Array.isArray(active) ? active : [];
                sensorAlertHistory.value = Array.isArray(history) ? history.filter(a => a.acknowledged) : [];
            } catch (e) {
                activeSensorAlerts.value = [];
                sensorAlertHistory.value = [];
            }
        }

        async function loadSensorRules() {
            loadingSensorRules.value = true;
            try {
                sensorRules.value = await API.sensorAlerts.rules.list();
            } catch (e) {
                sensorRules.value = [];
            } finally {
                loadingSensorRules.value = false;
            }
        }

        async function loadInventoryAlerts() {
            try {
                const [active, history] = await Promise.all([
                    API.inventory.alerts(),
                    API.inventory.alertRules({}),
                ]);
                // Filter to unacknowledged for active, all for history
                activeInventoryAlerts.value = Array.isArray(active) ? active.filter(a => !a.acknowledged) : [];
                inventoryAlertHistory.value = Array.isArray(history) ? history.filter(r => r.acknowledged) : [];
            } catch (e) {
                activeInventoryAlerts.value = [];
            }
        }

        async function loadInventoryRules() {
            loadingInventoryRules.value = true;
            try {
                inventoryRules.value = await API.inventory.alertRules({});
            } catch (e) {
                inventoryRules.value = [];
            } finally {
                loadingInventoryRules.value = false;
            }
        }

        async function loadVaccineSchedules() {
            try {
                vaccineSchedules.value = await API.vaccineSchedules.upcoming(vaccineFilterDays.value);
                upcomingVaccines.value = vaccineSchedules.value;
            } catch (e) {
                upcomingVaccines.value = [];
            }
        }

        async function loadPushSubscriptions() {
            try {
                pushSubscriptions.value = await API.notifications.subscriptions();
                pushSubscribed.value = pushSubscriptions.value.length > 0;
            } catch (e) {
                pushSubscriptions.value = [];
            }
        }

        // ── Sensor Alert Actions ─────────────────────────
        async function ackSensorAlert(a) {
            try {
                await API.sensorAlerts.ack(a.id);
                sensorAlertHistory.value.unshift({ ...a, acknowledged: true, acknowledged_at: new Date().toISOString() });
                activeSensorAlerts.value = activeSensorAlerts.value.filter(x => x.id !== a.id);
                if (typeof showToast === 'function') showToast('Da tat thong bao cam bien', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function ackAllSensor() {
            try {
                await API.sensorAlerts.ackAll();
                const now = new Date().toISOString();
                activeSensorAlerts.value.forEach(a => {
                    sensorAlertHistory.value.unshift({ ...a, acknowledged: true, acknowledged_at: now });
                });
                activeSensorAlerts.value = [];
                if (typeof showToast === 'function') showToast('Da tat tat ca thong bao cam bien', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function checkNow() {
            if (typeof showToast === 'function') showToast('Dang kiem tra...', 'info');
            try {
                await API.sensorAlerts.check();
                await loadSensorAlerts();
                await loadInventoryAlerts();
                if (typeof showToast === 'function') showToast('Kiem tra xong!', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Sensor Rule CRUD ────────────────────────────
        function openSensorRule(r = null) {
            if (r) {
                Object.assign(sensorForm, {
                    id: r.id, name: r.name, sensor_type: r.sensor_type, barn_id: r.barn_id || '',
                    min_value: r.min_value, max_value: r.max_value,
                    severity: r.severity, cooldown_minutes: r.cooldown_minutes, enabled: r.enabled
                });
            } else {
                Object.assign(sensorForm, {
                    id: null, name: '', sensor_type: 'temperature', barn_id: '',
                    min_value: null, max_value: null, severity: 'warning',
                    cooldown_minutes: 15, enabled: true
                });
            }
            showSensorModal.value = true;
        }

        function closeSensorModal() { showSensorModal.value = false; }

        async function saveSensorRule() {
            if (!sensorForm.name.trim()) {
                if (typeof showToast === 'function') showToast('Ten quy dinh khong duoc trong', 'error');
                return;
            }
            try {
                const payload = {
                    name: sensorForm.name,
                    sensor_type: sensorForm.sensor_type,
                    barn_id: sensorForm.barn_id || null,
                    min_value: sensorForm.min_value,
                    max_value: sensorForm.max_value,
                    severity: sensorForm.severity,
                    cooldown_minutes: sensorForm.cooldown_minutes,
                    enabled: sensorForm.enabled,
                };
                if (sensorForm.id) {
                    await API.sensorAlerts.rules.update(sensorForm.id, payload);
                    if (typeof showToast === 'function') showToast('Da cap nhat quy dinh', 'success');
                } else {
                    await API.sensorAlerts.rules.create(payload);
                    if (typeof showToast === 'function') showToast('Da them quy dinh moi', 'success');
                }
                closeSensorModal();
                await loadSensorRules();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function delSensorRule(r) {
            if (!confirm('Xoa quy dinh "' + r.name + '"?')) return;
            try {
                await API.sensorAlerts.rules.delete(r.id);
                sensorRules.value = sensorRules.value.filter(x => x.id !== r.id);
                if (typeof showToast === 'function') showToast('Da xoa quy dinh', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Inventory Rule CRUD ────────────────────────
        function openInventoryRule(r = null) {
            if (r) {
                Object.assign(inventoryForm, {
                    id: r.id, warehouse_id: r.warehouse_id, product_id: r.product_id,
                    threshold: r.threshold, severity: r.severity
                });
            } else {
                Object.assign(inventoryForm, {
                    id: null, warehouse_id: null, product_id: null,
                    threshold: null, severity: 'warning'
                });
            }
            showInventoryModal.value = true;
        }

        function closeInventoryModal() { showInventoryModal.value = false; }

        async function saveInventoryRule() {
            if (!inventoryForm.warehouse_id || !inventoryForm.product_id) {
                if (typeof showToast === 'function') showToast('Chon kho va san pham', 'error');
                return;
            }
            try {
                const payload = {
                    warehouse_id: Number(inventoryForm.warehouse_id),
                    product_id: Number(inventoryForm.product_id),
                    threshold: inventoryForm.threshold,
                    severity: inventoryForm.severity,
                };
                if (inventoryForm.id) {
                    await API.inventory.updateAlertRule(inventoryForm.id, payload);
                    if (typeof showToast === 'function') showToast('Da cap nhat ngưỡng kho', 'success');
                } else {
                    await API.inventory.createAlertRule(payload);
                    if (typeof showToast === 'function') showToast('Da them ngưỡng kho moi', 'success');
                }
                closeInventoryModal();
                await loadInventoryRules();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function deleteInventoryRule(r) {
            if (!confirm('Xoa ngưỡng "' + r.product_name + '"?')) return;
            try {
                await API.inventory.deleteAlertRule(r.id);
                inventoryRules.value = inventoryRules.value.filter(x => x.id !== r.id);
                if (typeof showToast === 'function') showToast('Da xoa ngưỡng', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function ackInventoryAlert(a) {
            try {
                await API.inventory.ackAlert(a.id);
                activeInventoryAlerts.value = activeInventoryAlerts.value.filter(x => x.id !== a.id);
                await loadInventoryRules();
                if (typeof showToast === 'function') showToast('Da xac nhan canh bao kho', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function toggleInventoryRule(r) {
            try {
                await API.inventory.toggleAlertRule(r.id, !r.enabled);
                r.enabled = !r.enabled;
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Vaccine Actions ────────────────────────────
        async function markVaccineDone(id) {
            try {
                await API.vaccineSchedules.done(id);
                vaccineSchedules.value = vaccineSchedules.value.map(v =>
                    v.id === id ? { ...v, status: 'completed' } : v
                );
                upcomingVaccines.value = vaccineSchedules.value.filter(v => v.status === 'pending');
                if (typeof showToast === 'function') showToast('Da ghi nhan tieu chuan!', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function skipVaccine(id) {
            try {
                await API.vaccineSchedules.skip(id);
                vaccineSchedules.value = vaccineSchedules.value.map(v =>
                    v.id === id ? { ...v, status: 'skipped' } : v
                );
                upcomingVaccines.value = vaccineSchedules.value.filter(v => v.status === 'pending');
                if (typeof showToast === 'function') showToast('Da bo qua lich', 'info');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Push Notifications ────────────────────────
        async function togglePush(enable) {
            if (enable) {
                try {
                    const reg = await navigator.serviceWorker.ready;
                    const sub = await reg.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(
                            (await API.notifications.vapidKey()).publicKey
                        ),
                    });
                    await API.notifications.subscribe(sub.toJSON());
                    pushSubscribed.value = true;
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
                    pushSubscribed.value = false;
                    pushSubscriptions.value = [];
                    if (typeof showToast === 'function') showToast('Da tat thong bao', 'info');
                } catch (e) {
                    if (typeof showToast === 'function') showToast(e.message, 'error');
                }
            }
        }

        async function sendTestNotif() {
            try {
                await API.notifications.test('Test thong bao CFarm', 'Day la thong bao test!');
                if (typeof showToast === 'function') showToast('Da gui thong bao test!', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function removeSub(id) {
            try {
                const sub = pushSubscriptions.value.find(s => s.id === id);
                if (sub) await API.notifications.unsubscribe(sub.endpoint);
                pushSubscriptions.value = pushSubscriptions.value.filter(s => s.id !== id);
                if (typeof showToast === 'function') showToast('Da goi thiet bi', 'info');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Simulators (local only) ───────────────────
        function simulateSensorError() {
            const bName = barnMap.value[simBarnId.value]?.name || simBarnId.value;
            activeSensorAlerts.value.unshift({
                id: 'sim_' + Date.now(),
                sensor_type: simType.value,
                value: simVal.value,
                threshold: simType.value === 'temperature' ? '38' : '85',
                message: '[Mô phỏng] Cam bien ' + simType.value + ' bat thuong tai ' + bName + ': ' + simVal.value,
                barn_id: simBarnId.value,
                created_at: new Date().toISOString(),
                acknowledged: false,
            });
            if (typeof showToast === 'function') showToast('Da tao canh bao cam bien gia!', 'success');
        }

        function simulateInventoryShortage() {
            const whName = warehouseMap.value[simWhName.value]?.name || simWhName.value;
            const prodName = productMap.value[simProdName.value]?.name || simProdName.value;
            activeInventoryAlerts.value.unshift({
                id: 'sim_inv_' + Date.now(),
                warehouse_name: whName,
                product_name: prodName,
                current_quantity: simQty.value,
                threshold_value: 100,
                created_at: new Date().toISOString(),
                acknowledged: false,
            });
            if (typeof showToast === 'function') showToast('Da tao canh bao kho gia!', 'success');
        }

        // ── Helpers ───────────────────────────────────
        function fmtNum(n) {
            if (n == null) return '-';
            return Number(n).toLocaleString('vi-VN');
        }

        function fmtDate(d) {
            if (!d) return '-';
            return new Date(d).toLocaleDateString('vi-VN');
        }

        function severityClass(s) {
            const map = { danger: 'cf-alert-severity-danger', warning: 'cf-alert-severity-warning', critical: 'cf-alert-severity-critical', info: 'cf-alert-severity-info' };
            return map[s] || 'cf-alert-severity-info';
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
            tabType, filterBarn, vaccineFilterDays, loading,
            showSensorModal, showInventoryModal,
            sensorForm, inventoryForm,
            barns, warehouses, products,
            activeSensorAlerts, sensorAlertHistory, sensorRules, loadingSensorRules,
            activeInventoryAlerts, inventoryAlertHistory, inventoryRules, loadingInventoryRules,
            vaccineSchedules, upcomingVaccines,
            pushSubscriptions, pushSubscribed,
            simBarnId, simType, simVal, simProdName, simWhName, simQty,
            activeInventoryCount, activeSensorCount,
            filteredInventoryRules,
            loadSensorAlerts, loadSensorRules, loadInventoryAlerts, loadInventoryRules,
            loadVaccineSchedules, loadPushSubscriptions,
            ackSensorAlert, ackAllSensor, checkNow,
            openSensorRule, closeSensorModal, saveSensorRule, delSensorRule,
            openInventoryRule, closeInventoryModal, saveInventoryRule, deleteInventoryRule, ackInventoryAlert, toggleInventoryRule,
            markVaccineDone, skipVaccine,
            togglePush, sendTestNotif, removeSub,
            simulateSensorError, simulateInventoryShortage,
            fmtNum, fmtDate, severityClass
        };
    },

    template: `
    <div class="cf-alerts-container">

        <!-- ── HEADER ── -->
        <div class="cf-alerts-header">
            <div class="cf-alerts-header-left">
                <div class="cf-alerts-header-icon">🔔</div>
                <div>
                    <h1 class="cf-alerts-title">He thong Canh bao</h1>
                    <p class="cf-alerts-subtitle">Giam sat cam bien, kho & vaccine</p>
                </div>
            </div>
            <div class="cf-alerts-header-actions">
                <button @click="checkNow" class="cf-btn-sm cf-btn-outline">
                    🔄 Kiem tra ngay
                </button>
                <button v-if="activeSensorCount || activeInventoryCount"
                    @click="activeSensorAlerts=[]; activeInventoryAlerts=[];"
                    class="cf-btn-sm cf-btn-ghost">
                    Dong tat ca
                </button>
            </div>
        </div>

        <!-- ── ACTIVE ALERTS BANNER ── -->
        <div v-if="activeSensorCount || activeInventoryCount" class="cf-alerts-banner">
            <div class="cf-alerts-banner-header">
                <span>⚠️ CO HIEU LUC - {{ (activeSensorCount + activeInventoryCount) }} CANH BAO</span>
            </div>
            <div class="cf-alerts-banner-grid">
                <div v-if="activeSensorCount" class="cf-alerts-banner-section">
                    <div class="cf-alerts-banner-section-title">📡 Cam bien</div>
                    <div v-for="a in activeSensorAlerts.slice(0,3)" :key="a.id" class="cf-alerts-banner-item">
                        <span class="cf-alerts-banner-msg">{{ a.message }}</span>
                        <button @click="ackSensorAlert(a)" class="cf-alerts-banner-btn">Tat</button>
                    </div>
                </div>
                <div v-if="activeInventoryCount" class="cf-alerts-banner-section">
                    <div class="cf-alerts-banner-section-title">📦 Kho</div>
                    <div v-for="a in activeInventoryAlerts.slice(0,3)" :key="a.id" class="cf-alerts-banner-item">
                        <span class="cf-alerts-banner-msg">{{ a.product_name }} - con {{ fmtNum(a.current_quantity) }}</span>
                        <button @click="ackInventoryAlert(a)" class="cf-alerts-banner-btn">Xac nhan</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── TABS ── -->
        <div class="cf-alerts-tabs">
            <button @click="tabType = 'sensor'" :class="['cf-alerts-tab', tabType === 'sensor' ? 'active' : '']">
                📡 Cam bien
                <span v-if="activeSensorCount" class="cf-alerts-tab-badge red">{{ activeSensorCount }}</span>
            </button>
            <button @click="tabType = 'inventory'" :class="['cf-alerts-tab', tabType === 'inventory' ? 'active' : '']">
                📦 Kho
                <span v-if="activeInventoryCount" class="cf-alerts-tab-badge orange">{{ activeInventoryCount }}</span>
            </button>
            <button @click="tabType = 'vaccine'" :class="['cf-alerts-tab', tabType === 'vaccine' ? 'active' : '']">
                💉 Vaccine
                <span v-if="upcomingVaccines.length" class="cf-alerts-tab-badge">{{ upcomingVaccines.length }}</span>
            </button>
            <button @click="tabType = 'notify'" :class="['cf-alerts-tab', tabType === 'notify' ? 'active' : '']">
                📲 Push
            </button>
        </div>

        <!-- ── TAB: CAM BIEN ── -->
        <div v-if="tabType === 'sensor'" class="cf-alerts-tab-body">
            <div class="cf-alerts-main">
                <!-- Sensor Rules -->
                <div class="cf-alerts-card">
                    <div class="cf-alerts-card-header">
                        <h3 class="cf-alerts-card-title">Quy dinh nguong cam bien</h3>
                        <button @click="openSensorRule()" class="cf-btn-sm cf-btn-primary">+ Them quy dinh</button>
                    </div>
                    <div v-if="loadingSensorRules" class="cf-alerts-loading">Dang tai...</div>
                    <div v-else-if="!sensorRules.length" class="cf-alerts-empty">
                        <span>📡</span><p>Chua co quy dinh nao</p>
                    </div>
                    <div v-else class="cf-table-wrapper">
                        <table class="cf-table">
                            <thead>
                                <tr>
                                    <th>Ten</th>
                                    <th>Loai</th>
                                    <th>Chuong</th>
                                    <th>Min / Max</th>
                                    <th>Muc do</th>
                                    <th>Cooldown</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="r in sensorRules" :key="r.id" :class="r.enabled ? '' : 'cf-row-disabled'">
                                    <td class="cf-font-semibold">{{ r.name }}</td>
                                    <td><span class="cf-badge cf-badge-blue">{{ r.sensor_type }}</span></td>
                                    <td class="cf-text-muted">{{ barnMap[r.barn_id]?.name || 'Toan trai' }}</td>
                                    <td class="cf-font-mono">{{ r.min_value ?? '-' }} / {{ r.max_value ?? '-' }}</td>
                                    <td><span :class="['cf-badge', severityClass(r.severity)]">{{ r.severity }}</span></td>
                                    <td class="cf-text-muted">{{ r.cooldown_minutes }} phut</td>
                                    <td class="cf-row-actions">
                                        <button @click="openSensorRule(r)" class="cf-btn-icon-sm">✏️</button>
                                        <button @click="delSensorRule(r)" class="cf-btn-icon-sm danger">🗑️</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Sensor Alert History -->
                <div class="cf-alerts-card">
                    <div class="cf-alerts-card-header">
                        <h3 class="cf-alerts-card-title">Lich su canh bao cam bien</h3>
                        <select v-model="filterBarn" class="cf-select cf-select-sm">
                            <option value="">Tat ca chuong</option>
                            <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                        </select>
                    </div>
                    <div v-if="!sensorAlertHistory.length" class="cf-alerts-empty">
                        <span>🎉</span><p>Chua co canh bao nao!</p>
                    </div>
                    <div v-else class="cf-alerts-list">
                        <div v-for="a in sensorAlertHistory" :key="a.id" class="cf-alerts-log-item">
                            <div class="cf-alerts-log-main">
                                <span class="cf-alerts-log-msg">{{ a.message }}</span>
                                <span class="cf-alerts-log-time">{{ fmtDate(a.acknowledged_at || a.created_at) }}</span>
                            </div>
                            <span class="cf-badge cf-badge-green">Da xu ly</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Simulator -->
            <div class="cf-alerts-sidebar">
                <div class="cf-alerts-card cf-alerts-sim-card">
                    <h4 class="cf-alerts-sim-title">📡 Mo phong loi cam bien</h4>
                    <form @submit.prevent="simulateSensorError" class="cf-alerts-sim-form">
                        <div class="cf-form-group">
                            <label class="cf-label">Chuong</label>
                            <select v-model="simBarnId" class="cf-input">
                                <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                            </select>
                        </div>
                        <div class="cf-form-group">
                            <label class="cf-label">Loai cam bien</label>
                            <select v-model="simType" class="cf-input">
                                <option value="temperature">Nhiet do</option>
                                <option value="humidity">Do am</option>
                            </select>
                        </div>
                        <div class="cf-form-group">
                            <label class="cf-label">Gia tri</label>
                            <input v-model.number="simVal" type="number" step="0.1" class="cf-input" required>
                        </div>
                        <button type="submit" class="cf-btn-sm cf-btn-danger">Tao loi gia</button>
                    </form>
                </div>
            </div>
        </div>

        <!-- ── TAB: KHO ── -->
        <div v-if="tabType === 'inventory'" class="cf-alerts-tab-body">
            <div class="cf-alerts-main">
                <!-- Inventory Rules -->
                <div class="cf-alerts-card">
                    <div class="cf-alerts-card-header">
                        <h3 class="cf-alerts-card-title">Ngưỡng ton kho</h3>
                        <button @click="openInventoryRule()" class="cf-btn-sm cf-btn-primary">+ Them ngưỡng</button>
                    </div>
                    <div v-if="loadingInventoryRules" class="cf-alerts-loading">Dang tai...</div>
                    <div v-else-if="!filteredInventoryRules.length" class="cf-alerts-empty">
                        <span>📦</span><p>Chua co ngưỡng nao</p>
                    </div>
                    <div v-else class="cf-table-wrapper">
                        <table class="cf-table">
                            <thead>
                                <tr>
                                    <th>Kho</th>
                                    <th>San pham</th>
                                    <th>Ngưỡng</th>
                                    <th>Muc do</th>
                                    <th>Trang thai</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="r in filteredInventoryRules" :key="r.id">
                                    <td class="cf-font-semibold">{{ warehouseMap[r.warehouse_id]?.name || r.warehouse_id }}</td>
                                    <td>{{ productMap[r.product_id]?.name || r.product_id }}</td>
                                    <td class="cf-font-mono">{{ r.threshold }} kg</td>
                                    <td><span :class="['cf-badge', severityClass(r.severity)]">{{ r.severity }}</span></td>
                                    <td>
                                        <span v-if="r.enabled" class="cf-badge cf-badge-green">Hoat dong</span>
                                        <span v-else class="cf-badge cf-badge-gray">Tat</span>
                                    </td>
                                    <td class="cf-row-actions">
                                        <button @click="toggleInventoryRule(r)" class="cf-btn-icon-sm">{{ r.enabled ? '⏸️' : '▶️' }}</button>
                                        <button @click="openInventoryRule(r)" class="cf-btn-icon-sm">✏️</button>
                                        <button @click="deleteInventoryRule(r)" class="cf-btn-icon-sm danger">🗑️</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Simulator -->
            <div class="cf-alerts-sidebar">
                <div class="cf-alerts-card cf-alerts-sim-card">
                    <h4 class="cf-alerts-sim-title">🛡️ Mo phong ton kho thap</h4>
                    <form @submit.prevent="simulateInventoryShortage" class="cf-alerts-sim-form">
                        <div class="cf-form-group">
                            <label class="cf-label">San pham</label>
                            <select v-model="simProdName" class="cf-input">
                                <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                            </select>
                        </div>
                        <div class="cf-form-group">
                            <label class="cf-label">Kho</label>
                            <select v-model="simWhName" class="cf-input">
                                <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                            </select>
                        </div>
                        <div class="cf-form-group">
                            <label class="cf-label">So luong ton</label>
                            <input v-model.number="simQty" type="number" class="cf-input" required>
                        </div>
                        <button type="submit" class="cf-btn-sm cf-btn-warning">Tao canh bao gia</button>
                    </form>
                </div>
            </div>
        </div>

        <!-- ── TAB: VACCINE ── -->
        <div v-if="tabType === 'vaccine'" class="cf-alerts-tab-body">
            <div class="cf-alerts-card">
                <div class="cf-alerts-card-header">
                    <h3 class="cf-alerts-card-title">Lich vaccine & thu y</h3>
                    <select v-model="vaccineFilterDays" class="cf-select cf-select-sm">
                        <option :value="7">7 ngay toi</option>
                        <option :value="14">14 ngay toi</option>
                        <option :value="30">30 ngay toi</option>
                    </select>
                </div>
                <div v-if="!upcomingVaccines.length" class="cf-alerts-empty">
                    <span>🎉</span><p>Tat ca lich da hoan thanh!</p>
                </div>
                <div v-else class="cf-alerts-vaccine-grid">
                    <div v-for="v in upcomingVaccines" :key="v.id" class="cf-alerts-vaccine-card">
                        <div class="cf-alerts-vaccine-info">
                            <span class="cf-alerts-vaccine-name">{{ v.vaccine_name }}</span>
                            <span class="cf-alerts-vaccine-meta">
                                {{ barnMap[v.barn_id]?.name || v.barn_id }} | Ngay {{ v.day_age_target }}
                            </span>
                            <span v-if="v.method" class="cf-badge cf-badge-blue">{{ v.method }}</span>
                        </div>
                        <div class="cf-alerts-vaccine-actions">
                            <button @click="markVaccineDone(v.id)" class="cf-btn-sm cf-btn-success">Da tiem</button>
                            <button @click="skipVaccine(v.id)" class="cf-btn-sm cf-btn-ghost">Bo qua</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── TAB: PUSH ── -->
        <div v-if="tabType === 'notify'" class="cf-alerts-tab-body">
            <div class="cf-alerts-main">
                <div class="cf-alerts-card">
                    <div class="cf-alerts-card-header">
                        <h3 class="cf-alerts-card-title">Cau hinh Push Notifications</h3>
                        <span :class="['cf-badge', pushSubscribed ? 'cf-badge-green' : 'cf-badge-gray']">
                            {{ pushSubscribed ? 'DA DANG KY' : 'CHUA DANG KY' }}
                        </span>
                    </div>
                    <div class="cf-alerts-notify-info">
                        <p>Web Push cho phep nhan thong bao ngay ca khi trinh duyet dong.</p>
                    </div>
                    <div class="cf-alerts-notify-actions">
                        <button v-if="!pushSubscribed" @click="togglePush(true)" class="cf-btn-primary">Bat thong bao</button>
                        <button v-else @click="togglePush(false)" class="cf-btn-danger">Tat thong bao</button>
                        <button @click="sendTestNotif" class="cf-btn-outline">Gui test</button>
                    </div>
                </div>

                <!-- Device list -->
                <div class="cf-alerts-card">
                    <h3 class="cf-alerts-card-title">Thiet bi da dang ky ({{ pushSubscriptions.length }})</h3>
                    <div v-if="!pushSubscriptions.length" class="cf-alerts-empty">
                        <span>📲</span><p>Chua co thiet bi nao</p>
                    </div>
                    <div v-else class="cf-table-wrapper">
                        <table class="cf-table">
                            <thead>
                                <tr>
                                    <th>Thiet bi</th>
                                    <th>Endpoint</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="s in pushSubscriptions" :key="s.id">
                                    <td class="cf-font-semibold">{{ s.user_label || s.endpoint?.slice(0,30) || 'Unknown' }}</td>
                                    <td class="cf-text-muted cf-text-xs">{{ s.endpoint }}</td>
                                    <td class="cf-row-actions">
                                        <button @click="removeSub(s.id)" class="cf-btn-icon-sm danger">🗑️</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── SENSOR RULE MODAL ── -->
        <teleport to="body">
            <div v-if="showSensorModal" class="cf-modal-overlay" @click.self="closeSensorModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <h3 class="cf-modal-title">{{ sensorForm.id ? 'Sua quy dinh' : 'Them quy dinh cam bien' }}</h3>
                        <button @click="closeSensorModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="saveSensorRule">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Ten quy dinh *</label>
                                <input v-model="sensorForm.name" type="text" class="cf-input" placeholder="VD: Nhiet do chuong heo" required>
                            </div>
                            <div class="cf-form-row">
                                <div class="cf-form-group">
                                    <label class="cf-label">Loai cam bien</label>
                                    <select v-model="sensorForm.sensor_type" class="cf-input">
                                        <option value="temperature">Nhiet do</option>
                                        <option value="humidity">Do am</option>
                                    </select>
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Chuong</label>
                                    <select v-model="sensorForm.barn_id" class="cf-input">
                                        <option value="">Toan trai</option>
                                        <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                                    </select>
                                </div>
                            </div>
                            <div class="cf-form-row">
                                <div class="cf-form-group">
                                    <label class="cf-label">Nguong Min</label>
                                    <input v-model.number="sensorForm.min_value" type="number" step="0.1" class="cf-input">
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Nguong Max</label>
                                    <input v-model.number="sensorForm.max_value" type="number" step="0.1" class="cf-input">
                                </div>
                            </div>
                            <div class="cf-form-row">
                                <div class="cf-form-group">
                                    <label class="cf-label">Muc do</label>
                                    <select v-model="sensorForm.severity" class="cf-input">
                                        <option value="info">Thong tin</option>
                                        <option value="warning">Canh giac</option>
                                        <option value="danger">Nguy hiem</option>
                                    </select>
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Cooldown (phut)</label>
                                    <input v-model.number="sensorForm.cooldown_minutes" type="number" class="cf-input">
                                </div>
                            </div>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeSensorModal" class="cf-btn-secondary">Huy</button>
                            <button type="submit" class="cf-btn-primary">Luu</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

        <!-- ── INVENTORY RULE MODAL ── -->
        <teleport to="body">
            <div v-if="showInventoryModal" class="cf-modal-overlay" @click.self="closeInventoryModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <h3 class="cf-modal-title">{{ inventoryForm.id ? 'Sua ngưỡng kho' : 'Them ngưỡng ton kho' }}</h3>
                        <button @click="closeInventoryModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="saveInventoryRule">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Kho *</label>
                                <select v-model="inventoryForm.warehouse_id" class="cf-input" required>
                                    <option value="">-- Chon kho --</option>
                                    <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                                </select>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">San pham *</label>
                                <select v-model="inventoryForm.product_id" class="cf-input" required>
                                    <option value="">-- Chon san pham --</option>
                                    <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                                </select>
                            </div>
                            <div class="cf-form-row">
                                <div class="cf-form-group">
                                    <label class="cf-label">Nguong (kg) *</label>
                                    <input v-model.number="inventoryForm.threshold" type="number" class="cf-input" required>
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Muc do</label>
                                    <select v-model="inventoryForm.severity" class="cf-input">
                                        <option value="info">Thong tin</option>
                                        <option value="warning">Canh giac</option>
                                        <option value="critical">Nguy hiem</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeInventoryModal" class="cf-btn-secondary">Huy</button>
                            <button type="submit" class="cf-btn-primary">Luu</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>
    </div>
    `
};
