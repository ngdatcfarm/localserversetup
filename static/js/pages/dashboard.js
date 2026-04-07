/**
 * Dashboard - Stats + active cycles + upcoming vaccines + quick actions
 * Desktop: 6-col KPI grid + 2-col layout for content
 * Mobile: 3-col KPIs + single column
 */
const { ref, reactive, computed, onMounted } = Vue;

return {
    setup() {
        // ── State ──────────────────────────────────────
        const stats = reactive({
            farms: 0,
            activeCycles: 0,
            totalBirds: 0,
            devices: 0,
            devicesOnline: 0,
            alerts: 0
        });
        const cycles = ref([]);
        const alerts = ref([]);
        const vaccines = ref([]);
        const syncStatus = ref(null);
        const loading = ref(false);

        // ── Computed ───────────────────────────────────
        const activeCyclesWithInfo = computed(() => {
            return cycles.value.slice(0, 6).map(c => {
                const dayAge = c.start_date
                    ? Math.floor((new Date() - new Date(c.start_date)) / (1000 * 60 * 60 * 24))
                    : '-';
                return { ...c, dayAge };
            });
        });

        // ── Methods ───────────────────────────────────
        async function loadDashboard() {
            loading.value = true;
            try {
                const [health, farms, cycleList, alertList, vaccinesList] = await Promise.all([
                    API.health().catch(() => ({ devices: { total: 0, online: 0 } })),
                    API.farms.list().catch(() => []),
                    API.cycles.list().catch(() => []),
                    API.alerts.list(false).catch(() => []),
                    API.vaccines.schedules.upcoming(7).catch(() => [])
                ]);

                // Stats
                stats.farms = farms.length || 0;

                const active = cycleList.filter(c => c.status === 'active');
                stats.activeCycles = active.length;
                stats.totalBirds = active.reduce((sum, c) => sum + (c.current_count || 0), 0);

                stats.devices = health.devices?.total || 0;
                stats.devicesOnline = health.devices?.online || 0;
                stats.alerts = alertList.length || 0;

                cycles.value = active;
                alerts.value = alertList.slice(0, 5);
                vaccines.value = vaccinesList.slice(0, 5);

                // Sync status
                try {
                    syncStatus.value = await API.sync.status();
                } catch (e) {
                    syncStatus.value = { enabled: false };
                }
            } catch (e) {
                console.error('Dashboard load error:', e);
            }
            loading.value = false;
        }

        function refresh() {
            loadDashboard();
        }

        // ── Lifecycle ─────────────────────────────────
        onMounted(() => {
            loadDashboard();
        });

        // Auto-refresh every 60 seconds
        let refreshInterval = setInterval(refresh, 60000);

        // Cleanup on unmount
        onMounted(() => {
            return () => clearInterval(refreshInterval);
        });

        // ── Template ──────────────────────────────────
        return {
            stats,
            cycles: activeCyclesWithInfo,
            alerts,
            vaccines,
            syncStatus,
            loading,
            refresh,
            fmtDate,
            fmtNum
        };
    },

    template: `
    <div class="dashboard-page">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold text-gray-900">Dashboard</h2>
            <button @click="refresh" :disabled="loading"
                class="p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50">
                <svg :class="loading ? 'animate-spin' : ''" class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
            </button>
        </div>

        <!-- KPI Grid -->
        <div class="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <!-- Farms -->
            <div class="card p-4 text-center">
                <div class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 text-green-600 mb-2">
                    <span class="text-lg">🏠</span>
                </div>
                <div class="text-2xl font-bold text-gray-900">{{ stats.farms }}</div>
                <div class="text-xs text-gray-500 mt-1">Trang trại</div>
            </div>

            <!-- Active Cycles -->
            <div class="card p-4 text-center">
                <div class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 text-blue-600 mb-2">
                    <span class="text-lg">🔄</span>
                </div>
                <div class="text-2xl font-bold text-gray-900">{{ stats.activeCycles }}</div>
                <div class="text-xs text-gray-500 mt-1">Đợt nuôi</div>
            </div>

            <!-- Total Birds -->
            <div class="card p-4 text-center">
                <div class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 text-green-700 mb-2">
                    <span class="text-lg">🐔</span>
                </div>
                <div class="text-2xl font-bold text-gray-900">{{ fmtNum(stats.totalBirds) }}</div>
                <div class="text-xs text-gray-500 mt-1">Tổng gia cầm</div>
            </div>

            <!-- Devices -->
            <div class="card p-4 text-center">
                <div class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-purple-100 text-purple-600 mb-2">
                    <span class="text-lg">📡</span>
                </div>
                <div class="text-2xl font-bold text-gray-900">{{ stats.devicesOnline }}/{{ stats.devices }}</div>
                <div class="text-xs text-gray-500 mt-1">Thiết bị online</div>
            </div>

            <!-- Alerts -->
            <div class="card p-4 text-center">
                <div class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600 mb-2">
                    <span class="text-lg">⚠️</span>
                </div>
                <div class="text-2xl font-bold text-gray-900">{{ stats.alerts }}</div>
                <div class="text-xs text-gray-500 mt-1">Cảnh báo</div>
            </div>

            <!-- Sync Status -->
            <div class="card p-4 text-center">
                <div class="inline-flex items-center justify-center w-10 h-10 rounded-full mb-2"
                    :class="syncStatus?.enabled ? (syncStatus?.running ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600') : 'bg-gray-100 text-gray-400'">
                    <span class="text-lg">☁️</span>
                </div>
                <div class="text-lg font-bold" :class="syncStatus?.enabled ? (syncStatus?.running ? 'text-green-600' : 'text-yellow-600') : 'text-gray-400'">
                    {{ syncStatus?.enabled ? (syncStatus?.running ? 'ON' : 'Paused') : 'OFF' }}
                </div>
                <div class="text-xs text-gray-500 mt-1">Cloud Sync</div>
            </div>
        </div>

        <!-- Main Content Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Left Column: Cycles + Vaccines (2/3 width on desktop) -->
            <div class="lg:col-span-2 space-y-6">
                <!-- Active Cycles -->
                <div class="card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-900 flex items-center gap-2">
                            <span>🔄</span> Đợt nuôi đang hoạt động
                        </h3>
                        <router-link to="/cycles" class="text-sm text-green-600 hover:underline">
                            Xem tất cả →
                        </router-link>
                    </div>

                    <div v-if="cycles.length === 0" class="text-center py-8 text-gray-400">
                        <div class="text-4xl mb-2">📭</div>
                        <p>Chưa có đợt nuôi nào đang hoạt động</p>
                        <router-link to="/cycles" class="text-green-600 hover:underline text-sm mt-2 inline-block">
                            Tạo đợt nuôi mới
                        </router-link>
                    </div>

                    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <router-link v-for="c in cycles" :key="c.id" :to="'/cycles/' + c.id"
                            class="block border border-gray-200 rounded-lg p-4 hover:border-green-400 hover:shadow-sm transition-all">
                            <div class="flex items-start justify-between mb-2">
                                <div class="font-semibold text-gray-900">{{ c.name || c.code || 'Cycle ' + c.id }}</div>
                                <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Active</span>
                            </div>
                            <div class="text-sm text-gray-500 mb-3">
                                {{ c.barn_name || 'Chuồng ' + c.barn_id }} • Ngày {{ c.dayAge }}
                            </div>
                            <div class="flex items-center gap-4 text-sm">
                                <div class="flex items-center gap-1">
                                    <span class="text-gray-400">🐔</span>
                                    <span class="font-medium">{{ fmtNum(c.current_count || 0) }}</span>
                                </div>
                                <div class="flex items-center gap-1">
                                    <span class="text-gray-400">🌾</span>
                                    <span class="font-medium">-</span>
                                </div>
                                <div class="flex items-center gap-1">
                                    <span class="text-gray-400">💀</span>
                                    <span class="font-medium">-</span>
                                </div>
                            </div>
                        </router-link>
                    </div>
                </div>

                <!-- Upcoming Vaccines -->
                <div class="card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-900 flex items-center gap-2">
                            <span>💉</span> Vaccine sắp tới (7 ngày)
                        </h3>
                        <router-link to="/vaccines" class="text-sm text-green-600 hover:underline">
                            Xem tất cả →
                        </router-link>
                    </div>

                    <div v-if="vaccines.length === 0" class="text-center py-6 text-gray-400">
                        <div class="text-3xl mb-2">✅</div>
                        <p>Không có vaccine nào sắp tới</p>
                    </div>

                    <div v-else class="space-y-2">
                        <div v-for="v in vaccines" :key="v.id"
                            class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <div class="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                                💉
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="font-medium text-gray-900">{{ v.vaccine_name }}</div>
                                <div class="text-sm text-gray-500">
                                    {{ v.cycle_code || 'Cycle' }} - {{ v.barn_name || v.barn_id }}
                                </div>
                            </div>
                            <div class="text-right flex-shrink-0">
                                <div class="text-sm font-medium text-gray-900">{{ fmtDate(v.scheduled_date) }}</div>
                                <div class="text-xs text-gray-400">{{ v.day_age_target ? 'Ngày ' + v.day_age_target : '' }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right Column: Quick Actions + Alerts (1/3 width on desktop) -->
            <div class="space-y-6">
                <!-- Quick Actions -->
                <div class="card">
                    <h3 class="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <span>⚡</span> Thao tác nhanh
                    </h3>
                    <div class="space-y-2">
                        <router-link to="/cycles" class="flex items-center gap-3 p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
                            <div class="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center">➕</div>
                            <div>
                                <div class="font-medium text-gray-900">Tạo đợt nuôi mới</div>
                                <div class="text-xs text-gray-500">Bắt đầu chu kỳ mới</div>
                            </div>
                        </router-link>

                        <router-link to="/care" class="flex items-center gap-3 p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                            <div class="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center">🌾</div>
                            <div>
                                <div class="font-medium text-gray-900">Ghi nhận cho ăn</div>
                                <div class="text-xs text-gray-500">Nhập liệu thức ăn</div>
                            </div>
                        </router-link>

                        <router-link to="/care" class="flex items-center gap-3 p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                            <div class="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center">💀</div>
                            <div>
                                <div class="font-medium text-gray-900">Ghi nhận tử vong</div>
                                <div class="text-xs text-gray-500">Báo cáo gia cầm chết</div>
                            </div>
                        </router-link>

                        <router-link to="/care" class="flex items-center gap-3 p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                            <div class="w-10 h-10 rounded-full bg-purple-500 text-white flex items-center justify-center">💊</div>
                            <div>
                                <div class="font-medium text-gray-900">Ghi nhận thuốc</div>
                                <div class="text-xs text-gray-500">Nhập thuốc đã dùng</div>
                            </div>
                        </router-link>

                        <router-link to="/care" class="flex items-center gap-3 p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                            <div class="w-10 h-10 rounded-full bg-blue-400 text-white flex items-center justify-center">⚖️</div>
                            <div>
                                <div class="font-medium text-gray-900">Cân trọng lượng</div>
                                <div class="text-xs text-gray-500">Ghi mẫu cân</div>
                            </div>
                        </router-link>

                        <router-link to="/cameras" class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                            <div class="w-10 h-10 rounded-full bg-gray-500 text-white flex items-center justify-center">📹</div>
                            <div>
                                <div class="font-medium text-gray-900">Camera</div>
                                <div class="text-xs text-gray-500">Xem trực tiếp</div>
                            </div>
                        </router-link>
                    </div>
                </div>

                <!-- Recent Alerts -->
                <div class="card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-900 flex items-center gap-2">
                            <span>🔔</span> Cảnh báo gần đây
                        </h3>
                        <router-link to="/alerts" class="text-sm text-green-600 hover:underline">
                            Xem tất cả
                        </router-link>
                    </div>

                    <div v-if="alerts.length === 0" class="text-center py-6 text-gray-400">
                        <div class="text-3xl mb-2">✅</div>
                        <p>Không có cảnh báo nào</p>
                    </div>

                    <div v-else class="space-y-2">
                        <div v-for="a in alerts" :key="a.id"
                            class="flex items-start gap-3 p-3 rounded-lg"
                            :class="{
                                'bg-red-50': a.severity === 'danger',
                                'bg-yellow-50': a.severity === 'warning',
                                'bg-blue-50': a.severity === 'info'
                            }">
                            <div class="text-lg flex-shrink-0">
                                {{ a.severity === 'danger' ? '🔴' : a.severity === 'warning' ? '🟡' : '🔵' }}
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="text-sm font-medium text-gray-900">{{ a.message }}</div>
                                <div class="text-xs text-gray-400 mt-1">{{ fmtDate(a.created_at) }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Empty State (no data at all) -->
        <div v-if="!loading && cycles.length === 0 && alerts.length === 0 && vaccines.length === 0"
            class="card text-center py-16">
            <div class="text-6xl mb-4">🐔</div>
            <h3 class="text-xl font-bold text-gray-900 mb-2">Chào mừng đến CFarm!</h3>
            <p class="text-gray-500 mb-6">Bắt đầu bằng cách tạo trang trại và đợt nuôi đầu tiên</p>
            <div class="flex flex-wrap justify-center gap-3">
                <router-link to="/cycles" class="btn btn-primary">
                    ➕ Tạo đợt nuôi mới
                </router-link>
                <router-link to="/devices" class="btn btn-secondary">
                    📡 Thêm thiết bị
                </router-link>
            </div>
        </div>
    </div>
    `
};
