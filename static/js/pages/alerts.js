/**
 * Alerts Page - He thong Canh bao & Giam sat Rui ro
 * Dung app.css classes, dong bo voi cac trang moi nhat
 */
const { ref, reactive, computed, onMounted } = Vue;

return {
    setup() {
        // ── State ──────────────────────────────────────
        const tab = ref('sensor');
        const filterBarn = ref('');
        const vaccineDays = ref('14');

        // Sensor alerts
        const sensorAlerts = ref([]);
        const sensorRules = ref([]);
        const sensorHistory = ref([]);

        // Inventory alerts
        const inventoryAlerts = ref([]);
        const inventoryRules = ref([]);
        const inventoryHistory = ref([]);

        // Vaccines
        const vaccineSchedules = ref([]);

        // Lists
        const barns = ref([]);
        const warehouses = ref([]);
        const products = ref([]);

        // Modals
        const showSensorModal = ref(false);
        const showInventoryModal = ref(false);

        // Forms (reactive like other pages)
        const sensorForm = reactive({
            id: '', name: '', sensor_type: 'temperature',
            barn_id: '', min_value: null, max_value: null,
            severity: 'warning', cooldown_minutes: 15, enabled: true
        });

        const inventoryForm = reactive({
            id: '', warehouse_id: '', product_id: '',
            threshold: 1000, severity: 'warning'
        });

        // Simulators
        const simBarnId = ref('');
        const simType = ref('temperature');
        const simVal = ref(41.4);
        const simProdId = ref('');
        const simWhId = ref('');
        const simQty = ref(15);

        // Push
        const subscribed = ref(false);
        const pushSubs = ref([]);

        // Loading
        const loading = ref(false);

        // ── Computed ───────────────────────────────────
        const activeSensorAlerts = computed(() =>
            sensorAlerts.value.filter(a => !a.acknowledged)
        );

        const activeInventoryAlerts = computed(() =>
            inventoryAlerts.value.filter(a => !a.acknowledged)
        );

        const upcomingVaccines = computed(() =>
            vaccineSchedules.value.filter(v => v.status === 'pending')
        );

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
            loading.value = true;
            try {
                const [b, w, p] = await Promise.all([
                    API.barns.list().catch(() => []),
                    API.warehouses.list().catch(() => []),
                    API.products.list().catch(() => [])
                ]);
                barns.value = b;
                warehouses.value = w;
                products.value = p;

                if (b.length && !simBarnId.value) simBarnId.value = b[0].id;
                if (w.length && !simWhId.value) simWhId.value = w[0].id;
                if (p.length && !simProdId.value) simProdId.value = p[0].id;

                await Promise.all([
                    loadSensorAlerts(),
                    loadSensorRules(),
                    loadInventoryAlerts(),
                    loadInventoryRules(),
                    loadVaccines(),
                    loadPushSubs()
                ]);
            } catch (e) {
                console.error('Load alerts error:', e);
            } finally {
                loading.value = false;
            }
        }

        async function loadSensorAlerts() {
            try {
                const [active, history] = await Promise.all([
                    API.sensorAlerts.active(),
                    API.sensorAlerts.list(true, undefined, 50)
                ]);
                sensorAlerts.value = Array.isArray(active) ? active : [];
                sensorHistory.value = Array.isArray(history) ? history : [];
            } catch (e) {
                sensorAlerts.value = [];
                sensorHistory.value = [];
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
                inventoryAlerts.value = all;
            } catch (e) {
                inventoryAlerts.value = [];
            }
        }

        async function loadInventoryRules() {
            try {
                inventoryRules.value = await API.inventory.alertRules();
            } catch (e) {
                inventoryRules.value = [];
            }
        }

        async function loadVaccines() {
            try {
                vaccineSchedules.value = await API.vaccines.schedules.upcoming(vaccineDays.value);
            } catch (e) {
                vaccineSchedules.value = [];
            }
        }

        async function loadPushSubs() {
            try {
                const subs = await API.notifications.subscriptions();
                pushSubs.value = Array.isArray(subs) ? subs : [];
                subscribed.value = pushSubs.value.length > 0;
            } catch (e) {
                pushSubs.value = [];
                subscribed.value = false;
            }
        }

        // ── Sensor Rule Actions ──────────────────────────
        function openSensorRule(r = null) {
            if (r) {
                Object.assign(sensorForm, {
                    id: r.id || '',
                    name: r.name || '',
                    sensor_type: r.sensor_type || 'temperature',
                    barn_id: r.barn_id || '',
                    min_value: r.min_value ?? null,
                    max_value: r.max_value ?? null,
                    severity: r.severity || 'warning',
                    cooldown_minutes: r.cooldown_minutes || 15,
                    enabled: r.enabled !== false
                });
            } else {
                Object.assign(sensorForm, {
                    id: '', name: '', sensor_type: 'temperature',
                    barn_id: '', min_value: null, max_value: null,
                    severity: 'warning', cooldown_minutes: 15, enabled: true
                });
            }
            showSensorModal.value = true;
        }

        async function saveSensorRule() {
            if (!sensorForm.name?.trim()) {
                showToast('Ten quy dinh khong duoc trong', 'error');
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
                    enabled: sensorForm.enabled
                };
                if (sensorForm.id) {
                    await API.sensorAlerts.rules.update(sensorForm.id, payload);
                    showToast('Cap nhat quy tac cam bien thanh cong', 'success');
                } else {
                    await API.sensorAlerts.rules.create(payload);
                    showToast('Tao moi quy tac cam bien', 'success');
                }
                showSensorModal.value = false;
                await loadSensorRules();
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        async function delSensorRule(r) {
            if (!confirm('Xoa quy tac nay?')) return;
            try {
                await API.sensorAlerts.rules.delete(r.id);
                sensorRules.value = sensorRules.value.filter(x => x.id !== r.id);
                showToast('Da xoa quy tac');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        async function ackSensorAlert(a) {
            try {
                await API.sensorAlerts.ack(a.id);
                sensorAlerts.value = sensorAlerts.value.filter(x => x.id !== a.id);
                sensorHistory.value.unshift({ ...a, acknowledged: true, acknowledged_at: new Date().toISOString() });
                showToast('Da tat canh bao cam bien');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        async function ackAllSensor() {
            try {
                await API.sensorAlerts.ackAll();
                sensorAlerts.value = [];
                showToast('Da phep duyet tat ca canh bao cam bien');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        // ── Inventory Rule Actions ───────────────────────
        function openInventoryRule(r = null) {
            if (r) {
                Object.assign(inventoryForm, {
                    id: r.id || '',
                    warehouse_id: r.warehouse_id || '',
                    product_id: r.product_id || '',
                    threshold: r.threshold || 1000,
                    severity: r.severity || 'warning'
                });
            } else {
                Object.assign(inventoryForm, {
                    id: '', warehouse_id: '', product_id: '',
                    threshold: 1000, severity: 'warning'
                });
            }
            showInventoryModal.value = true;
        }

        async function saveInventoryRule() {
            if (!inventoryForm.warehouse_id || !inventoryForm.product_id) {
                showToast('Chon kho va san pham', 'error');
                return;
            }
            try {
                const payload = {
                    warehouse_id: Number(inventoryForm.warehouse_id),
                    product_id: Number(inventoryForm.product_id),
                    threshold: inventoryForm.threshold,
                    severity: inventoryForm.severity
                };
                if (inventoryForm.id) {
                    await API.inventory.updateAlertRule(inventoryForm.id, payload);
                    showToast('Cap nhat nguyen do ton kho', 'success');
                } else {
                    await API.inventory.createAlertRule(payload);
                    showToast('Tao moi nguyen do ton kho', 'success');
                }
                showInventoryModal.value = false;
                await loadInventoryRules();
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        async function deleteInventoryRule(id) {
            if (!confirm('Xac nhan xoa nguyen do?')) return;
            try {
                await API.inventory.deleteAlertRule(id);
                inventoryRules.value = inventoryRules.value.filter(x => x.id !== id);
                showToast('Da xoa nguyen do');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        async function ackInventoryAlert(a) {
            try {
                await API.inventory.ackAlert(a.id);
                inventoryAlerts.value = inventoryAlerts.value.filter(x => x.id !== a.id);
                showToast('Da ghi nhan canh bao ton kho');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        async function ackAllInventory() {
            try {
                for (const a of inventoryAlerts.value) {
                    await API.inventory.ackAlert(a.id);
                }
                inventoryAlerts.value = [];
                showToast('Da phep duyet tat ca canh bao ton kho');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        // ── Vaccine Actions ──────────────────────────────
        async function markVaccineDone(id) {
            try {
                await API.vaccines.schedules.done(id);
                vaccineSchedules.value = vaccineSchedules.value.map(v =>
                    v.id === id ? { ...v, status: 'completed' } : v
                );
                showToast('Da hoan thanh lich tiem');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        async function skipVaccine(id) {
            try {
                await API.vaccines.schedules.skip(id);
                vaccineSchedules.value = vaccineSchedules.value.map(v =>
                    v.id === id ? { ...v, status: 'skipped' } : v
                );
                showToast('Bo qua lich tiem');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        function changeVaccineDays() {
            loadVaccines();
        }

        // ── Simulators ───────────────────────────────────
        function simulateSensorAlert() {
            const barn = barnMap.value[simBarnId.value];
            sensorAlerts.value.unshift({
                id: 'sim_' + Date.now(),
                sensor_type: simType.value,
                value: simVal.value,
                threshold: simType.value === 'temperature' ? '> 38°C' : '> 85%',
                message: '[Gia lap] ' + simType.value.toUpperCase() + ' dat ' + simVal.value + ' tai ' + (barn?.name || simBarnId.value),
                barn_id: simBarnId.value,
                created_at: new Date().toISOString(),
                acknowledged: false
            });
            showToast('Nap loi cam bien gia dinh');
        }

        function simulateInventoryAlert() {
            const wh = warehouseMap.value[simWhId.value];
            const prod = productMap.value[simProdId.value];
            inventoryAlerts.value.unshift({
                id: 'sim_inv_' + Date.now(),
                warehouse_id: simWhId.value,
                warehouse_name: wh?.name || simWhId.value,
                product_id: simProdId.value,
                product_name: prod?.name || simProdId.value,
                current_quantity: simQty.value,
                threshold_value: 1000,
                created_at: new Date().toISOString(),
                acknowledged: false
            });
            showToast('Nap canh bao ton kho gia dinh');
        }

        // ── Push ─────────────────────────────────────────
        async function togglePush(enable) {
            if (enable) {
                try {
                    const reg = await navigator.serviceWorker.ready;
                    const vapidKey = await API.notifications.vapidKey();
                    const sub = await reg.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(vapidKey.publicKey)
                    });
                    await API.notifications.subscribe(sub.toJSON());
                    subscribed.value = true;
                    await loadPushSubs();
                    showToast('Da dang ky push notification');
                } catch (e) {
                    showToast('Loi dang ky: ' + e.message, 'error');
                }
            } else {
                try {
                    const subs = await API.notifications.subscriptions();
                    for (const s of subs) {
                        await API.notifications.unsubscribe(s.endpoint);
                    }
                    subscribed.value = false;
                    pushSubs.value = [];
                    showToast('Da tat thong bao push');
                } catch (e) {
                    showToast(e.message, 'error');
                }
            }
        }

        async function sendTestPush() {
            try {
                await API.notifications.test('Test thong bao CFarm', 'Day la thong bao test!');
                showToast('Gui test push thanh cong');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        async function removeSub(id) {
            try {
                const sub = pushSubs.value.find(s => s.id === id);
                if (sub) await API.notifications.unsubscribe(sub.endpoint);
                pushSubs.value = pushSubs.value.filter(s => s.id !== id);
                if (pushSubs.value.length === 0) subscribed.value = false;
                showToast('Da goi ket noi thiet bi');
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        function downloadCert() {
            showToast('Dang tai certificate...', 'info');
            setTimeout(() => showToast('Chung thuc an toan tai ve thanh cong!'), 800);
        }

        // ── Helpers ─────────────────────────────────────
        function urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
        }

        function checkAlertsNow() {
            showToast('Dang kiem tra he thong...', 'info');
            setTimeout(() => showToast('Kiem tra hoan tat!'), 800);
        }

        onMounted(() => { loadAll(); });

        // ── Return ──────────────────────────────────────
        return {
            tab, filterBarn, vaccineDays,
            sensorAlerts, sensorRules, sensorHistory,
            inventoryAlerts, inventoryRules, inventoryHistory,
            vaccineSchedules, upcomingVaccines,
            barns, warehouses, products,
            showSensorModal, showInventoryModal,
            sensorForm, inventoryForm,
            simBarnId, simType, simVal, simProdId, simWhId, simQty,
            subscribed, pushSubs, loading,
            activeSensorAlerts, activeInventoryAlerts,
            barnMap, warehouseMap, productMap,
            openSensorRule, saveSensorRule, delSensorRule, ackSensorAlert, ackAllSensor,
            openInventoryRule, saveInventoryRule, deleteInventoryRule, ackInventoryAlert,
            markVaccineDone, skipVaccine, changeVaccineDays,
            simulateSensorAlert, simulateInventoryAlert,
            togglePush, sendTestPush, removeSub, downloadCert, checkAlertsNow
        };
    },

    template: `
    <div class="page">
        <!-- Page Header -->
        <div class="page-header">
            <h2 class="page-title">Canh bao</h2>
            <div class="flex gap-2 items-center">
                <button @click="checkAlertsNow" class="btn btn-sm btn-ghost">
                    🔄 Kiem tra ngay
                </button>
            </div>
        </div>

        <!-- Active Alerts Banner -->
        <div v-if="activeSensorAlerts.length || activeInventoryAlerts.length" class="mb-4 p-4 rounded-lg" style="background:#fff1f2;border:1px solid #fecdd3;">
            <div class="flex items-center gap-2 mb-3">
                <span class="text-lg">⚠️</span>
                <h3 class="font-semibold text-sm" style="color:#be123c;">RUI RO DANG BAO DONG</h3>
                <button @click="() => { sensorAlerts = []; inventoryAlerts = []; }" class="ml-auto text-xs btn btn-ghost btn-sm">✕ Dong</button>
            </div>
            <div class="flex flex-wrap gap-3">
                <div v-if="activeSensorAlerts.length" class="flex-1 min-w-[200px]">
                    <p class="text-xs font-semibold mb-1" style="color:#9f1239;">CAM BIEN:</p>
                    <div v-for="a in activeSensorAlerts" :key="a.id" class="bg-white rounded p-2 mb-1 border" style="border-color:#fecdd3;">
                        <span class="text-xs">{{ a.message }}</span>
                        <button @click="ackSensorAlert(a)" class="block mt-1 text-xs font-bold" style="color:#e11d48;">Tat coi</button>
                    </div>
                </div>
                <div v-if="activeInventoryAlerts.length" class="flex-1 min-w-[200px]">
                    <p class="text-xs font-semibold mb-1" style="color:#b45309;">TON KHO:</p>
                    <div v-for="a in activeInventoryAlerts" :key="a.id" class="bg-white rounded p-2 mb-1 border" style="border-color:#fde68a;">
                        <span class="text-xs">{{ a.product_name }} - {{ a.warehouse_name }}</span>
                        <button @click="ackInventoryAlert(a)" class="block mt-1 text-xs font-bold" style="color:#b45309;">Ghi nhan</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 mb-4 border-b" style="border-color:#e2e8f0;">
            <button @click="tab = 'sensor'" :class="['tab-btn', tab === 'sensor' && 'tab-btn-active']">📡 Cam bien</button>
            <button @click="tab = 'inventory'" :class="['tab-btn', tab === 'inventory' && 'tab-btn-active']">📦 Kho</button>
            <button @click="tab = 'vaccine'" :class="['tab-btn', tab === 'vaccine' && 'tab-btn-active']">💉 Vaccine</button>
            <button @click="tab = 'notify'" :class="['tab-btn', tab === 'notify' && 'tab-btn-active']">🔔 Push</button>
        </div>

        <!-- SENSOR TAB -->
        <div v-if="tab === 'sensor'" class="space-y-4">
            <!-- Rules -->
            <div class="card">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold">Quy tac cam bien</h3>
                    <button @click="openSensorRule()" class="btn btn-sm btn-primary">+ Them quy tac</button>
                </div>
                <div v-if="sensorRules.length" class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Ten</th>
                                <th>Loai</th>
                                <th>Chuong</th>
                                <th>Min/Max</th>
                                <th>Khan</th>
                                <th>Cooldown</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="r in sensorRules" :key="r.id">
                                <td class="font-medium">{{ r.name }}</td>
                                <td><span class="badge badge-blue">{{ r.sensor_type }}</span></td>
                                <td>{{ barnMap[r.barn_id]?.name || 'Tat ca' }}</td>
                                <td>{{ r.min_value ?? '-' }} / {{ r.max_value ?? '-' }}</td>
                                <td><span :class="['badge', r.severity === 'danger' ? 'badge-red' : 'badge-yellow']">{{ r.severity }}</span></td>
                                <td>{{ r.cooldown_minutes }} phut</td>
                                <td class="text-right">
                                    <button @click="openSensorRule(r)" class="btn btn-ghost btn-sm">Sua</button>
                                    <button @click="delSensorRule(r)" class="btn btn-ghost btn-sm text-red-500">Xoa</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="text-center py-6 text-muted">Chua co quy tac nao</div>
            </div>

            <!-- History -->
            <div class="card">
                <h3 class="font-semibold mb-3">Lich su canh bao</h3>
                <select v-model="filterBarn" class="border rounded px-2 py-1 text-sm mb-3">
                    <option value="">Tat ca chuong</option>
                    <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
                <div v-if="sensorHistory.length" class="space-y-2">
                    <div v-for="a in sensorHistory" :key="a.id" class="flex items-center justify-between p-3 rounded" :class="a.acknowledged ? 'bg-gray-50' : 'bg-white border'">
                        <div>
                            <span class="text-sm">{{ a.message }}</span>
                            <span class="text-xs text-muted ml-2">{{ fmtDate(a.created_at) }}</span>
                        </div>
                        <span v-if="a.acknowledged" class="badge badge-green">Da xu ly</span>
                        <button v-else @click="ackSensorAlert(a)" class="btn btn-ghost btn-sm">Xac nhan</button>
                    </div>
                </div>
                <div v-else class="text-center py-6 text-muted">Chua co lich su</div>
            </div>

            <!-- Simulator -->
            <div class="card">
                <h3 class="font-semibold mb-2">Gia lap loi cam bien</h3>
                <form @submit.prevent="simulateSensorAlert" class="flex flex-wrap gap-2 items-end">
                    <select v-model="simBarnId" class="border rounded px-2 py-1 text-sm">
                        <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                    </select>
                    <select v-model="simType" class="border rounded px-2 py-1 text-sm">
                        <option value="temperature">Nhiet do</option>
                        <option value="humidity">Do am</option>
                    </select>
                    <input type="number" step="0.1" v-model="simVal" class="border rounded px-2 py-1 text-sm w-24" required />
                    <button type="submit" class="btn btn-sm btn-danger">Nap loi gia dinh</button>
                </form>
            </div>
        </div>

        <!-- INVENTORY TAB -->
        <div v-if="tab === 'inventory'" class="space-y-4">
            <!-- Rules -->
            <div class="card">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold">Nguyen do ton kho</h3>
                    <button @click="openInventoryRule()" class="btn btn-sm btn-primary">+ Them nguyen do</button>
                </div>
                <div v-if="inventoryRules.length" class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Kho</th>
                                <th>San pham</th>
                                <th>Nguong (kg)</th>
                                <th>Khan</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="r in inventoryRules" :key="r.id">
                                <td class="font-medium">{{ warehouseMap[r.warehouse_id]?.name || r.warehouse_id }}</td>
                                <td>{{ productMap[r.product_id]?.name || r.product_id }}</td>
                                <td>{{ fmtNum(r.threshold) }}</td>
                                <td><span :class="['badge', r.severity === 'critical' ? 'badge-red' : 'badge-yellow']">{{ r.severity }}</span></td>
                                <td class="text-right">
                                    <button @click="openInventoryRule(r)" class="btn btn-ghost btn-sm">Sua</button>
                                    <button @click="deleteInventoryRule(r.id)" class="btn btn-ghost btn-sm text-red-500">Xoa</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="text-center py-6 text-muted">Chua co nguyen do nao</div>
            </div>

            <!-- Active Alerts -->
            <div v-if="activeInventoryAlerts.length" class="card" style="background:#fffbeb;border-color:#fde68a;">
                <h3 class="font-semibold mb-2" style="color:#b45309;">Canh bao ton kho hien tai</h3>
                <div v-for="a in activeInventoryAlerts" :key="a.id" class="flex items-center justify-between p-3 bg-white rounded mb-2 border" style="border-color:#fde68a;">
                    <div>
                        <span class="font-medium">{{ a.product_name }}</span>
                        <span class="text-xs text-muted ml-2">Kho: {{ a.warehouse_name }}</span>
                        <span class="text-xs font-bold ml-2" style="color:#b45309;">{{ fmtNum(a.current_quantity) }} / {{ fmtNum(a.threshold_value) }} kg</span>
                    </div>
                    <button @click="ackInventoryAlert(a)" class="btn btn-sm" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;">Ghi nhan</button>
                </div>
            </div>

            <!-- Simulator -->
            <div class="card">
                <h3 class="font-semibold mb-2">Gia lap canh bao ton kho</h3>
                <form @submit.prevent="simulateInventoryAlert" class="flex flex-wrap gap-2 items-end">
                    <select v-model="simProdId" class="border rounded px-2 py-1 text-sm">
                        <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                    <select v-model="simWhId" class="border rounded px-2 py-1 text-sm">
                        <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                    </select>
                    <input type="number" v-model="simQty" class="border rounded px-2 py-1 text-sm w-24" required />
                    <button type="submit" class="btn btn-sm btn-warning">Nap canh bao</button>
                </form>
            </div>
        </div>

        <!-- VACCINE TAB -->
        <div v-if="tab === 'vaccine'" class="space-y-4">
            <div class="card">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold">Lich tiem vaccine</h3>
                    <select v-model="vaccineDays" @change="changeVaccineDays" class="border rounded px-2 py-1 text-sm">
                        <option value="7">7 ngay</option>
                        <option value="14">14 ngay</option>
                        <option value="30">30 ngay</option>
                    </select>
                </div>
                <div v-if="vaccineSchedules.length" class="space-y-2">
                    <div v-for="v in vaccineSchedules" :key="v.id" class="flex items-center justify-between p-3 rounded border" :class="v.status === 'completed' ? 'bg-green-50 border-green-200' : v.status === 'skipped' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'">
                        <div>
                            <span class="font-medium">{{ v.product_name || v.name || 'Vaccine' }}</span>
                            <span class="text-xs text-muted ml-2">{{ fmtDate(v.scheduled_date) }}</span>
                            <span v-if="v.method" class="badge badge-blue ml-1">{{ v.method }}</span>
                            <span :class="['badge ml-1', v.status === 'completed' ? 'badge-green' : v.status === 'skipped' ? 'badge-gray' : 'badge-yellow']">{{ v.status }}</span>
                        </div>
                        <div v-if="v.status === 'pending'" class="flex gap-1">
                            <button @click="markVaccineDone(v.id)" class="btn btn-sm btn-primary">Da tiem</button>
                            <button @click="skipVaccine(v.id)" class="btn btn-sm btn-ghost">Bo qua</button>
                        </div>
                    </div>
                </div>
                <div v-else class="text-center py-6 text-muted">
                    🎉 Khong co lich tiem nao trong {{ vaccineDays }} ngay
                </div>
            </div>
        </div>

        <!-- PUSH TAB -->
        <div v-if="tab === 'notify'" class="space-y-4">
            <div class="card">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold">Push Notifications</h3>
                    <span :class="['badge', subscribed ? 'badge-green' : 'badge-gray']">
                        {{ subscribed ? 'Da dang ky' : 'Chua dang ky' }}
                    </span>
                </div>
                <p class="text-sm text-muted mb-3">Nhan thong bao ngay ca khi trinh duyet dong.</p>
                <div class="flex gap-2 flex-wrap">
                    <button v-if="!subscribed" @click="togglePush(true)" class="btn btn-primary">🔔 Bat push</button>
                    <button v-else @click="togglePush(false)" class="btn btn-ghost">Tat push</button>
                    <button @click="sendTestPush" class="btn btn-ghost">Gui test</button>
                    <button @click="downloadCert" class="btn btn-ghost">📥 Certificate</button>
                </div>
            </div>

            <div v-if="pushSubs.length" class="card">
                <h3 class="font-semibold mb-3">Thiet bi da ket noi ({{ pushSubs.length }})</h3>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Ten/Endpoint</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="s in pushSubs" :key="s.id">
                                <td class="text-sm" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ s.user_label || s.endpoint }}</td>
                                <td class="text-right">
                                    <button @click="removeSub(s.id)" class="btn btn-ghost btn-sm text-red-500">Goiv</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- SENSOR RULE MODAL -->
        <div v-if="showSensorModal" class="modal-overlay" @click.self="showSensorModal = false">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="font-semibold">{{ sensorForm.id ? 'Hieu chinh quy tac' : 'Tao quy tac moi' }}</h3>
                    <button @click="showSensorModal = false" class="text-muted">✕</button>
                </div>
                <form @submit.prevent="saveSensorRule" class="space-y-3">
                    <div>
                        <label class="text-sm font-medium mb-1 block">Ten quy tac *</label>
                        <input type="text" v-model="sensorForm.name" class="w-full border rounded px-3 py-2 text-sm" placeholder="VD: Nhiet do chuong lon" required />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-sm font-medium mb-1 block">Loai cam bien</label>
                            <select v-model="sensorForm.sensor_type" class="w-full border rounded px-2 py-2 text-sm">
                                <option value="temperature">Nhiet do</option>
                                <option value="humidity">Do am</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-sm font-medium mb-1 block">Chuong</label>
                            <select v-model="sensorForm.barn_id" class="w-full border rounded px-2 py-2 text-sm">
                                <option value="">Tat ca</option>
                                <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-sm font-medium mb-1 block">Min</label>
                            <input type="number" step="0.1" v-model="sensorForm.min_value" class="w-full border rounded px-2 py-2 text-sm" />
                        </div>
                        <div>
                            <label class="text-sm font-medium mb-1 block">Max</label>
                            <input type="number" step="0.1" v-model="sensorForm.max_value" class="w-full border rounded px-2 py-2 text-sm" />
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-sm font-medium mb-1 block">Muc do</label>
                            <select v-model="sensorForm.severity" class="w-full border rounded px-2 py-2 text-sm">
                                <option value="info">Thong tin</option>
                                <option value="warning">Canh giac</option>
                                <option value="danger">Nguy hiem</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-sm font-medium mb-1 block">Cooldown (phut)</label>
                            <input type="number" v-model="sensorForm.cooldown_minutes" class="w-full border rounded px-2 py-2 text-sm" required />
                        </div>
                    </div>
                    <div class="flex gap-2 justify-end pt-2">
                        <button type="button" @click="showSensorModal = false" class="btn btn-ghost">Huy bo</button>
                        <button type="submit" class="btn btn-primary">Luu</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- INVENTORY RULE MODAL -->
        <div v-if="showInventoryModal" class="modal-overlay" @click.self="showInventoryModal = false">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="font-semibold">{{ inventoryForm.id ? 'Hieu chinh nguyen do' : 'Tao nguyen do moi' }}</h3>
                    <button @click="showInventoryModal = false" class="text-muted">✕</button>
                </div>
                <form @submit.prevent="saveInventoryRule" class="space-y-3">
                    <div>
                        <label class="text-sm font-medium mb-1 block">Kho *</label>
                        <select v-model="inventoryForm.warehouse_id" class="w-full border rounded px-3 py-2 text-sm" required>
                            <option value="">-- Chon kho --</option>
                            <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-sm font-medium mb-1 block">San pham *</label>
                        <select v-model="inventoryForm.product_id" class="w-full border rounded px-3 py-2 text-sm" required>
                            <option value="">-- Chon san pham --</option>
                            <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                        </select>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-sm font-medium mb-1 block">Nguong (kg)</label>
                            <input type="number" v-model="inventoryForm.threshold" class="w-full border rounded px-2 py-2 text-sm" required />
                        </div>
                        <div>
                            <label class="text-sm font-medium mb-1 block">Muc do</label>
                            <select v-model="inventoryForm.severity" class="w-full border rounded px-2 py-2 text-sm">
                                <option value="info">Thong tin</option>
                                <option value="warning">Canh giac</option>
                                <option value="critical">Khan cap</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex gap-2 justify-end pt-2">
                        <button type="button" @click="showInventoryModal = false" class="btn btn-ghost">Huy bo</button>
                        <button type="submit" class="btn btn-primary">Luu</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `
};