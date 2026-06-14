/**
 * Operations Hub - Mobile-first daily farm management dashboard
 * Tabbed bottom navigation for organized daily farm operations
 */
const { ref, reactive, computed, onMounted, onUnmounted } = Vue;

export default{
    setup() {
        const loading = ref(false);
        const refreshing = ref(false);
        const currentTab = ref('overview');
        let refreshInterval = null;

        // ── Data State ────────────────────────────────
        const cycles = ref([]);
        const barns = ref([]);
        const notifications = ref([]);
        const careStatusResponse = ref({ cycles: [] });
        const sensors = ref({});
        const batsByBarn = ref({});
        const warehouses = ref([]);
        const alerts = ref([]);

        // ── Computed ─────────────────────────────────
        const activeCycles = computed(() =>
            cycles.value.filter(c => c.status === 'active')
        );

        const unreadNotifications = computed(() =>
            notifications.value.filter(n => !n.read_at)
        );

        const todayCareStatus = computed(() => {
            return careStatusResponse.value.cycles || [];
        });

        const activeAlerts = computed(() =>
            alerts.value.filter(a => a.severity === 'danger')
        );

        const lowStockWarehouses = computed(() =>
            warehouses.value.filter(w => w.current_quantity !== undefined && w.current_quantity < (w.min_quantity || 10))
        );

        function getDayAge(startDate) {
            if (!startDate) return null;
            const days = Math.floor((new Date() - new Date(startDate)) / (1000 * 60 * 60 * 24));
            return days >= 0 ? days : null;
        }

        function getBarnName(barnId) {
            const b = barns.value.find(x => x.id == barnId);
            return b?.name || `Chuồng ${barnId}`;
        }

        // ── Load Functions ────────────────────────────
        async function loadAll() {
            refreshing.value = true;
            try {
                const [cyclesData, barnsData, notifsData, careData, alertsData, warehousesData] = await Promise.all([
                    API.cycles.list().catch(() => []),
                    API.barns.list().catch(() => []),
                    API.notifications.list().catch(() => []),
                    API.care.dailyStatus(new Date().toISOString().slice(0, 10)).catch(() => []),
                    API.alerts.list(true).catch(() => []),
                    API.warehouses.list().catch(() => []),
                ]);

                cycles.value = cyclesData;
                barns.value = barnsData;
                notifications.value = notifsData;
                careStatusResponse.value = careData;
                alerts.value = alertsData;
                warehouses.value = warehousesData;

                for (const barn of barnsData) {
                    const hasActive = cyclesData.some(c => c.barn_id == barn.id && c.status === 'active');
                    if (hasActive) {
                        loadSensorsForBarn(barn.id);
                        loadBatsForBarn(barn.id);
                    }
                }
            } catch (e) {
                console.error('Load all error:', e);
            }
            refreshing.value = false;
        }

        async function loadSensorsForBarn(barnId) {
            try {
                const data = await API.sensors.latestByBarn(barnId).catch(() => null);
                if (data) sensors.value[barnId] = data;
            } catch (e) {}
        }

        async function loadBatsForBarn(barnId) {
            try {
                const data = await API.bats.listByBarn(barnId).catch(() => []);
                batsByBarn.value[barnId] = data;
            } catch (e) {
                batsByBarn.value[barnId] = [];
            }
        }

        // ── Bat Control ────────────────────────────────
        async function moveBat(batId, direction) {
            try {
                if (direction === 'up') await API.bats.moveUp(batId);
                else if (direction === 'down') await API.bats.moveDown(batId);
                else await API.bats.stop(batId);
                showToast('Đã gửi lệnh', 'success');
                setTimeout(async () => {
                    for (const barnId of Object.keys(batsByBarn.value)) {
                        await loadBatsForBarn(barnId);
                    }
                }, 2000);
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        function getBatIcon(bat) {
            if (bat.moving_state === 'up') return '🔼';
            if (bat.moving_state === 'down') return '🔽';
            return bat.position >= 80 ? '🟢' : bat.position <= 20 ? '🔴' : '🟡';
        }

        function getActiveCyclesByBarn(barnId) {
            return activeCycles.value.filter(c => c.barn_id == barnId);
        }

        function formatNotifTime(sentAt) {
            if (!sentAt) return '';
            const d = new Date(sentAt);
            const now = new Date();
            const diff = now - d;
            if (diff < 60000) return 'Vừa xong';
            if (diff < 3600000) return `${Math.floor(diff / 60000)}p trước`;
            if (diff < 86400000) return `${Math.floor(diff / 3600000)}h trước`;
            return fmtDate(sentAt);
        }

        function getSensorColor(value, type) {
            if (value === null || value === undefined) return 'text-gray-400';
            if (type === 'temp') {
                if (value < 20 || value > 35) return 'text-red-500';
                if (value < 25 || value > 32) return 'text-yellow-600';
                return 'text-green-600';
            }
            if (type === 'humidity') {
                if (value < 50 || value > 80) return 'text-red-500';
                if (value < 60 || value > 75) return 'text-yellow-600';
                return 'text-green-600';
            }
            return 'text-gray-700';
        }

        function setTab(tab) {
            currentTab.value = tab;
        }

        // ── Lifecycle ─────────────────────────────────
        onMounted(() => {
            loadAll();
            refreshInterval = setInterval(loadAll, 120000);
        });

        onUnmounted(() => {
            if (refreshInterval) clearInterval(refreshInterval);
        });

        return {
            loading, refreshing, currentTab,
            cycles, barns, notifications, careStatus: careStatusResponse, sensors, batsByBarn, warehouses, alerts,
            activeCycles, unreadNotifications, todayCareStatus, activeAlerts, lowStockWarehouses,
            getDayAge, getBarnName, getBatIcon, moveBat,
            getActiveCyclesByBarn, formatNotifTime, getSensorColor, setTab,
            fmtDate, fmtNum, fmtNumVal: (v, dec = 0) => v !== null && v !== undefined ? fmtNum(v, dec) : '--'
        };
    },

    template: `
    <div class="page ops-hub">
        <!-- Header -->
        <div class="page-header">
            <h2 class="page-title">📱 Hoạt Động</h2>
            <button @click="loadAll" class="btn btn-ghost" :disabled="refreshing">
                <svg class="w-5 h-5" :class="refreshing ? 'animate-spin' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
            </button>
        </div>

        <!-- Tab Content Area -->
        <div class="tab-content-area">

            <!-- OVERVIEW TAB -->
            <div v-if="currentTab === 'overview'" class="tab-section">
                <!-- Alerts Banner -->
                <div v-if="activeAlerts.length > 0" class="card mb-4 border-l-4 border-red-500 bg-red-50">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-xl">🚨</span>
                        <span class="font-semibold text-red-700">Cảnh báo cần xử lý</span>
                    </div>
                    <div v-for="a in activeAlerts.slice(0, 3)" :key="a.id" class="text-sm text-red-600 py-1">
                        {{ a.message }}
                    </div>
                </div>

                <!-- Cycles Day Age Cards -->
                <div v-if="activeCycles.length > 0" class="mb-4">
                    <h3 class="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <span>🔄</span> Đợt nuôi đang hoạt động
                    </h3>
                    <div class="cycles-scroll">
                        <div v-for="c in activeCycles" :key="c.id" class="cycle-day-card">
                            <div class="flex items-center justify-between mb-2">
                                <span class="font-semibold text-sm">{{ c.name || ('Đợt ' + c.id) }}</span>
                                <span class="text-xs text-gray-500">{{ getBarnName(c.barn_id) }}</span>
                            </div>
                            <div class="text-center py-2">
                                <div class="text-3xl font-bold" :class="getDayAge(c.start_date) > 45 ? 'text-orange-500' : 'text-green-600'">
                                    {{ getDayAge(c.start_date) || '--' }}
                                </div>
                                <div class="text-xs text-gray-500">ngày tuổi</div>
                            </div>
                            <div class="flex items-center justify-between text-xs text-gray-500 mt-2">
                                <span>🐔 {{ fmtNum(c.current_count || c.initial_count) }}</span>
                                <span v-if="getDayAge(c.start_date) > 45" class="text-orange-500 font-medium">Sắp bán!</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Recent Notifications -->
                <div class="card mb-4">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-semibold text-primary flex items-center gap-2">
                            <span>🔔</span> Thông báo
                            <span v-if="unreadNotifications.length > 0" class="badge badge-red">{{ unreadNotifications.length }}</span>
                        </h3>
                        <router-link to="/notifications" class="text-xs text-primary hover:underline">Xem tất cả</router-link>
                    </div>
                    <div v-if="notifications.length === 0" class="empty-state py-4">
                        <div class="text-2xl mb-2">✅</div>
                        <p class="text-sm text-gray-500">Không có thông báo nào</p>
                    </div>
                    <div v-else class="notif-list">
                        <div v-for="n in notifications.slice(0, 5)" :key="n.id" class="notif-item" :class="{ unread: !n.read_at }">
                            <div class="notif-icon">{{ n.type === 'care' ? '🩺' : n.type === 'vaccine' ? '💉' : n.type === 'alert' ? '🚨' : 'ℹ️' }}</div>
                            <div class="flex-1 min-w-0">
                                <div class="text-sm font-medium text-gray-900">{{ n.title || n.message }}</div>
                                <div class="text-xs text-gray-400">{{ formatNotifTime(n.sent_at) }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- CARE TAB -->
            <div v-if="currentTab === 'care'" class="tab-section">
                <!-- Care Today Status -->
                <div class="card mb-4">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-semibold text-primary flex items-center gap-2">
                            <span>🩺</span> Care hôm nay
                        </h3>
                        <router-link to="/care" class="btn btn-primary btn-sm">+ Nhập liệu</router-link>
                    </div>
                    <div v-if="todayCareStatus.length === 0" class="text-center py-6">
                        <div class="text-3xl mb-2">📋</div>
                        <p class="text-sm text-gray-500 mb-3">Chưa có dữ liệu care hôm nay</p>
                    </div>
                    <div v-else class="care-today-grid">
                        <div v-for="cs in todayCareStatus" :key="cs.cycle_id" class="care-today-item">
                            <div class="text-sm font-medium">{{ cs.cycle_name || ('Cycle ' + cs.cycle_id) }}</div>
                            <div class="flex gap-1 mt-1 flex-wrap">
                                <span v-if="cs.has_morning_feed || cs.has_afternoon_feed" class="badge badge-green text-xs">Đã ăn</span>
                                <span v-else class="badge badge-red text-xs">Chưa ăn</span>
                                <span v-if="cs.weight_done" class="badge badge-green text-xs">Cân</span>
                                <span v-else class="badge badge-yellow text-xs">Chưa cân</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Quick Actions -->
                <div class="card">
                    <h3 class="font-semibold text-primary mb-3">Thao tác nhanh</h3>
                    <div class="quick-actions-grid">
                        <router-link to="/care" class="quick-action-btn bg-green-50">
                            <span class="text-2xl">🌾</span>
                            <span class="text-sm font-medium">Cho ăn</span>
                        </router-link>
                        <router-link to="/care" class="quick-action-btn bg-blue-50">
                            <span class="text-2xl">⚖️</span>
                            <span class="text-sm font-medium">Cân gà</span>
                        </router-link>
                        <router-link to="/care" class="quick-action-btn bg-red-50">
                            <span class="text-2xl">💀</span>
                            <span class="text-sm font-medium">Hao hụt</span>
                        </router-link>
                        <router-link to="/care" class="quick-action-btn bg-purple-50">
                            <span class="text-2xl">💊</span>
                            <span class="text-sm font-medium">Thuốc</span>
                        </router-link>
                    </div>
                </div>
            </div>

            <!-- CONTROL TAB (Bats) -->
            <div v-if="currentTab === 'control'" class="tab-section">
                <div v-if="barns.length === 0" class="empty-state py-12">
                    <div class="text-3xl mb-2">🏠</div>
                    <p class="text-gray-500">Chưa có chuồng nào</p>
                </div>

                <div v-for="barn in barns" :key="barn.id" class="card mb-4">
                    <div v-if="getActiveCyclesByBarn(barn.id).length === 0" class="text-sm text-gray-400 py-2">
                        {{ barn.name }} - Không có đợt nuôi active
                    </div>

                    <div v-else>
                        <div class="font-semibold mb-3">{{ barn.name }}</div>

                        <div v-if="batsByBarn[barn.id] && batsByBarn[barn.id].length > 0" class="space-y-3">
                            <div v-for="bat in batsByBarn[barn.id]" :key="bat.id" class="bat-control-item">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="flex items-center gap-2">
                                        <span class="text-lg">{{ getBatIcon(bat) }}</span>
                                        <span class="font-medium">{{ bat.name || ('Bạt ' + bat.id) }}</span>
                                    </div>
                                    <div class="text-sm">
                                        <span class="font-bold" :class="bat.position >= 80 ? 'text-green-600' : bat.position <= 20 ? 'text-red-500' : 'text-yellow-600'">
                                            {{ bat.position }}%
                                        </span>
                                    </div>
                                </div>
                                <div class="flex gap-2">
                                    <button @click="moveBat(bat.id, 'up')"
                                        :disabled="bat.moving_state === 'up'"
                                        class="btn btn-sm flex-1 bg-green-50 hover:bg-green-100 text-green-700 disabled:opacity-50">
                                        ▲ Mở
                                    </button>
                                    <button @click="moveBat(bat.id, 'stop')"
                                        :disabled="bat.moving_state === 'stopped'"
                                        class="btn btn-sm flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 disabled:opacity-50">
                                        ⏹ Dừng
                                    </button>
                                    <button @click="moveBat(bat.id, 'down')"
                                        :disabled="bat.moving_state === 'down'"
                                        class="btn btn-sm flex-1 bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-50">
                                        ▼ Đóng
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div v-else class="text-sm text-gray-400 py-3 text-center">
                            Chưa có bạt cho chuồng này
                        </div>
                    </div>
                </div>
            </div>

            <!-- ENVIRONMENT TAB (Sensors) -->
            <div v-if="currentTab === 'environment'" class="tab-section">
                <div v-if="barns.length === 0" class="empty-state py-12">
                    <div class="text-3xl mb-2">🏠</div>
                    <p class="text-gray-500">Chưa có chuồng nào</p>
                </div>

                <div v-for="barn in barns" :key="'sn-' + barn.id" class="card mb-4">
                    <div v-if="getActiveCyclesByBarn(barn.id).length === 0" class="text-sm text-gray-400 py-2">
                        {{ barn.name }} - Không có đợt nuôi active
                    </div>

                    <div v-else>
                        <div class="font-semibold mb-3">{{ barn.name }}</div>

                        <div v-if="sensors[barn.id]" class="sensor-grid">
                            <div class="sensor-card">
                                <div class="text-xs text-gray-500 mb-1">🌡️ Nhiệt độ</div>
                                <div class="text-xl font-bold" :class="getSensorColor(sensors[barn.id].temperature, 'temp')">
                                    {{ fmtNumVal(sensors[barn.id].temperature, 1) }}°C
                                </div>
                            </div>
                            <div class="sensor-card">
                                <div class="text-xs text-gray-500 mb-1">💧 Độ ẩm</div>
                                <div class="text-xl font-bold" :class="getSensorColor(sensors[barn.id].humidity, 'humidity')">
                                    {{ fmtNumVal(sensors[barn.id].humidity, 1) }}%
                                </div>
                            </div>
                            <div class="sensor-card">
                                <div class="text-xs text-gray-500 mb-1">🧪 NH3</div>
                                <div class="text-xl font-bold" :class="(sensors[barn.id].nh3 || 0) > 25 ? 'text-red-500' : 'text-gray-700'">
                                    {{ fmtNumVal(sensors[barn.id].nh3, 1) }}
                                </div>
                            </div>
                            <div class="sensor-card">
                                <div class="text-xs text-gray-500 mb-1">💨 H2S</div>
                                <div class="text-xl font-bold" :class="(sensors[barn.id].h2s || 0) > 5 ? 'text-red-500' : 'text-gray-700'">
                                    {{ fmtNumVal(sensors[barn.id].h2s, 1) }}
                                </div>
                            </div>
                        </div>

                        <div v-else class="text-sm text-gray-400 py-3 text-center">
                            Chuồng chưa có cảm biến
                        </div>
                    </div>
                </div>
            </div>

            <!-- WAREHOUSE TAB -->
            <div v-if="currentTab === 'warehouse'" class="tab-section">
                <div class="card mb-4">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-semibold text-primary flex items-center gap-2">
                            <span>📦</span> Kho hàng
                            <span v-if="lowStockWarehouses.length > 0" class="badge badge-red">{{ lowStockWarehouses.length }}</span>
                        </h3>
                        <router-link to="/inventory" class="btn btn-primary btn-sm">Quản lý kho</router-link>
                    </div>

                    <!-- Low Stock Alerts -->
                    <div v-if="lowStockWarehouses.length > 0" class="mb-4 space-y-2">
                        <div v-for="w in lowStockWarehouses" :key="w.id"
                            class="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                            <div>
                                <div class="text-sm font-medium text-red-700">{{ w.name }}</div>
                                <div class="text-xs text-red-500">{{ w.product_name || 'N/A' }}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-lg font-bold text-red-600">{{ fmtNum(w.current_quantity) }}</div>
                                <div class="text-xs text-gray-500">/ {{ fmtNum(w.min_quantity || 10) }}</div>
                            </div>
                        </div>
                    </div>

                    <div v-else-if="warehouses.length === 0" class="empty-state py-6">
                        <div class="text-3xl mb-2">📦</div>
                        <p class="text-sm text-gray-500">Chưa có dữ liệu kho</p>
                    </div>

                    <div v-else class="text-center py-6">
                        <div class="text-3xl mb-2">✅</div>
                        <p class="text-gray-500">Tất cả kho đều đủ stock</p>
                    </div>
                </div>

                <!-- All Warehouses List -->
                <div v-if="warehouses.length > 0" class="card">
                    <h4 class="font-semibold mb-3">Danh sách kho</h4>
                    <div class="warehouse-list">
                        <div v-for="w in warehouses" :key="w.id" class="flex items-center justify-between p-3 border-b border-gray-100 last:border-0">
                            <div>
                                <div class="text-sm font-medium">{{ w.name }}</div>
                                <div class="text-xs text-gray-500">{{ w.warehouse_type || 'inventory' }}</div>
                            </div>
                            <div class="text-sm font-semibold text-gray-700">
                                {{ fmtNum(w.current_quantity || 0) }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Bottom Tab Navigation -->
        <nav class="bottom-tab-nav">
            <button @click="setTab('overview')" class="tab-btn" :class="{ active: currentTab === 'overview' }">
                <span class="tab-icon">📊</span>
                <span class="tab-label">Tổng quan</span>
            </button>
            <button @click="setTab('care')" class="tab-btn" :class="{ active: currentTab === 'care' }">
                <span class="tab-icon">🩺</span>
                <span class="tab-label">Care</span>
            </button>
            <button @click="setTab('control')" class="tab-btn" :class="{ active: currentTab === 'control' }">
                <span class="tab-icon">🪟</span>
                <span class="tab-label">Bạt</span>
            </button>
            <button @click="setTab('environment')" class="tab-btn" :class="{ active: currentTab === 'environment' }">
                <span class="tab-icon">🌡️</span>
                <span class="tab-label">Môi trường</span>
            </button>
            <button @click="setTab('warehouse')" class="tab-btn" :class="{ active: currentTab === 'warehouse' }">
                <span class="tab-icon">📦</span>
                <span class="tab-label">Kho</span>
                <span v-if="lowStockWarehouses.length > 0" class="tab-badge">{{ lowStockWarehouses.length }}</span>
            </button>
        </nav>
    </div>
    `
};
