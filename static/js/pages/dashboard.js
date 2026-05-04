/**
 * Dashboard - Stats + active cycles + upcoming vaccines + quick actions
 * Mobile-first, uses app.css classes only
 */
const { ref, reactive, computed, onMounted, onUnmounted } = Vue;

const CACHE_KEY = 'cfarm_dashboard_cache';
const CACHE_EXPIRY = 5 * 60 * 1000;

return {
    setup() {
        const stats = reactive({
            farms: 0, activeCycles: 0, totalBirds: 0,
            devices: 0, devicesOnline: 0, alerts: 0
        });
        const cycles = ref([]);
        const alerts = ref([]);
        const vaccines = ref([]);
        const syncStatus = ref({ enabled: false, running: false });
        const loadingState = ref('idle');
        const isFirstLoad = ref(true);
        let refreshInterval = null;

        const activeCyclesWithInfo = computed(() => {
            return cycles.value.slice(0, 6).map(c => {
                const dayAge = c.start_date
                    ? Math.floor((new Date() - new Date(c.start_date)) / (1000 * 60 * 60 * 24))
                    : '-';
                return { ...c, dayAge };
            });
        });

        const showKpiSkeleton = computed(() => isFirstLoad.value && loadingState.value !== 'success');
        const showContentSkeleton = computed(() => isFirstLoad.value && cycles.value.length === 0);

        function loadFromCache() {
            try {
                const cached = sessionStorage.getItem(CACHE_KEY);
                if (!cached) return false;
                const data = JSON.parse(cached);
                if (Date.now() - data.timestamp > CACHE_EXPIRY) {
                    sessionStorage.removeItem(CACHE_KEY);
                    return false;
                }
                Object.assign(stats, data.stats);
                cycles.value = data.cycles || [];
                vaccines.value = data.vaccines || [];
                alerts.value = data.alerts || [];
                syncStatus.value = data.syncStatus || { enabled: false, running: false };
                isFirstLoad.value = false;
                return true;
            } catch (e) { return false; }
        }

        function saveToCache() {
            const cacheData = {
                timestamp: Date.now(), stats: { ...stats },
                cycles: cycles.value, vaccines: vaccines.value,
                alerts: alerts.value, syncStatus: syncStatus.value
            };
            try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheData)); } catch (e) {}
        }

        async function loadKpisFirst() {
            try {
                const [health, farms, cycleList] = await Promise.all([
                    API.health().catch(() => ({ devices: { total: 0, online: 0 } })),
                    API.farms.list().catch(() => []),
                    API.cycles.list().catch(() => [])
                ]);
                stats.farms = farms.length || 0;
                const active = (cycleList || []).filter(c => c.status === 'active');
                stats.activeCycles = active.length;
                stats.totalBirds = active.reduce((sum, c) => sum + (c.current_count || 0), 0);
                stats.devices = health.devices?.total || 0;
                stats.devicesOnline = health.devices?.online || 0;
                cycles.value = active;
                return { active };
            } catch (e) {
                console.error('KPI load error:', e);
                return { active: [] };
            }
        }

        async function loadSecondaryData() {
            try {
                const [alertList, vaccinesList, sync] = await Promise.all([
                    API.alerts.list(false).catch(() => []),
                    API.vaccines.schedules.upcoming(7).catch(() => []),
                    API.sync.status().catch(() => ({ enabled: false }))
                ]);
                stats.alerts = alertList.length || 0;
                alerts.value = alertList.slice(0, 5);
                vaccines.value = (vaccinesList || []).slice(0, 5);
                syncStatus.value = sync;
            } catch (e) {
                console.error('Secondary data load error:', e);
            }
        }

        async function loadDashboard() {
            if (isFirstLoad.value) loadingState.value = 'loading_kpi';
            try {
                await loadKpisFirst();
                loadingState.value = 'loading_content';
                await loadSecondaryData();
                loadingState.value = 'success';
                isFirstLoad.value = false;
                saveToCache();
            } catch (e) {
                console.error('Dashboard load error:', e);
                loadingState.value = 'success';
                isFirstLoad.value = false;
            }
        }

        function refresh() { loadDashboard(); }

        onMounted(() => {
            loadFromCache();
            loadDashboard();
            refreshInterval = setInterval(loadDashboard, 60000);
        });

        onUnmounted(() => {
            if (refreshInterval) clearInterval(refreshInterval);
        });

        return {
            stats, cycles: activeCyclesWithInfo, alerts, vaccines,
            syncStatus, loadingState, showKpiSkeleton, showContentSkeleton,
            refresh, fmtDate, fmtNum
        };
    },

    template: `
    <div class="page">
        <!-- Header -->
        <div class="page-header">
            <h2 class="page-title">Dashboard</h2>
            <button @click="refresh" class="btn btn-ghost" :disabled="loadingState !== 'success'">
                <svg class="w-4 h-4" :class="{ 'animate-spin': loadingState !== 'success' }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
            </button>
        </div>

        <!-- KPI Grid -->
        <div class="kpi-grid mb-6">
            <template v-if="showKpiSkeleton">
                <div v-for="i in 6" :key="i" class="stat-card animate-pulse">
                    <div class="stat-icon bg-gray-200"></div>
                    <div class="flex-1 text-right">
                        <div class="h-6 bg-gray-200 rounded w-10 mx-auto mb-1"></div>
                        <div class="h-3 bg-gray-100 rounded w-14 mx-auto"></div>
                    </div>
                </div>
            </template>
            <template v-else>
                <div class="stat-card">
                    <div class="stat-icon bg-green-100 text-green-600">🏠</div>
                    <div>
                        <div class="card-value">{{ stats.farms }}</div>
                        <div class="text-xs text-muted">Trang trại</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-blue-100 text-blue-600">🔄</div>
                    <div>
                        <div class="card-value">{{ stats.activeCycles }}</div>
                        <div class="text-xs text-muted">Đợt nuôi</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-green-100 text-green-700">🐔</div>
                    <div>
                        <div class="card-value">{{ fmtNum(stats.totalBirds) }}</div>
                        <div class="text-xs text-muted">Tổng gia cầm</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-purple-100 text-purple-600">📡</div>
                    <div>
                        <div class="card-value">{{ stats.devicesOnline }}/{{ stats.devices }}</div>
                        <div class="text-xs text-muted">Thiết bị</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-red-100 text-red-600">⚠️</div>
                    <div>
                        <div class="card-value">{{ stats.alerts }}</div>
                        <div class="text-xs text-muted">Cảnh báo</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" :class="syncStatus?.enabled ? (syncStatus?.running ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600') : 'bg-gray-100 text-gray-400'">☁️</div>
                    <div>
                        <div class="card-value" :class="syncStatus?.enabled ? (syncStatus?.running ? 'text-green-600' : 'text-yellow-600') : 'text-gray-400'">
                            {{ syncStatus?.enabled ? (syncStatus?.running ? 'ON' : 'Pause') : 'OFF' }}
                        </div>
                        <div class="text-xs text-muted">Cloud Sync</div>
                    </div>
                </div>
            </template>
        </div>

        <!-- Main Content: 2 columns on desktop, 1 on mobile -->
        <div class="dashboard-grid">
            <!-- Left: Cycles + Vaccines -->
            <div class="dashboard-main">
                <!-- Active Cycles Card -->
                <div class="card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-primary flex items-center gap-2">
                            <span>🔄</span> Đợt nuôi đang hoạt động
                        </h3>
                        <router-link to="/cycles" class="text-sm text-primary hover:underline">Xem tất cả →</router-link>
                    </div>

                    <div v-if="showContentSkeleton" class="space-y-2">
                        <div v-for="i in 2" :key="i" class="border border-gray-200 rounded-lg p-4 animate-pulse">
                            <div class="flex items-start justify-between mb-2">
                                <div class="h-5 bg-gray-200 rounded w-24"></div>
                                <div class="h-5 bg-gray-200 rounded w-12"></div>
                            </div>
                            <div class="h-4 bg-gray-100 rounded w-32 mb-3"></div>
                            <div class="flex items-center gap-4">
                                <div class="h-4 bg-gray-100 rounded w-12"></div>
                                <div class="h-4 bg-gray-100 rounded w-12"></div>
                            </div>
                        </div>
                    </div>

                    <div v-else-if="cycles.length === 0" class="empty-state">
                        <div class="icon">📭</div>
                        <p>Chưa có đợt nuôi nào đang hoạt động</p>
                        <router-link to="/cycles" class="btn btn-primary mt-3">Tạo đợt nuôi mới</router-link>
                    </div>

                    <div v-else class="cycles-list">
                        <router-link v-for="c in cycles" :key="c.id" :to="'/cycles/' + c.id"
                            class="cycle-card">
                            <div class="flex items-start justify-between mb-2">
                                <div class="font-semibold text-gray-900">{{ c.name || c.code || 'Cycle ' + c.id }}</div>
                                <span class="badge badge-green">Active</span>
                            </div>
                            <div class="text-sm text-gray-500 mb-3">
                                {{ c.barn_name || 'Chuồng ' + c.barn_id }} • Ngày {{ c.dayAge }}
                            </div>
                            <div class="flex items-center gap-4 text-sm">
                                <div class="flex items-center gap-1"><span>🐔</span><span class="font-medium">{{ fmtNum(c.current_count || 0) }}</span></div>
                            </div>
                        </router-link>
                    </div>
                </div>

                <!-- Upcoming Vaccines Card -->
                <div class="card mt-4">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-primary flex items-center gap-2">
                            <span>💉</span> Vaccine sắp tới (7 ngày)
                        </h3>
                        <router-link to="/vaccines" class="text-sm text-primary hover:underline">Xem tất cả →</router-link>
                    </div>

                    <div v-if="showContentSkeleton" class="space-y-2">
                        <div v-for="i in 2" :key="i" class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg animate-pulse">
                            <div class="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0"></div>
                            <div class="flex-1"><div class="h-4 bg-gray-200 rounded w-32 mb-1"></div><div class="h-3 bg-gray-100 rounded w-24"></div></div>
                        </div>
                    </div>

                    <div v-else-if="vaccines.length === 0" class="empty-state">
                        <div class="icon">✅</div>
                        <p>Không có vaccine nào sắp tới</p>
                    </div>

                    <div v-else class="vaccine-list">
                        <div v-for="v in vaccines" :key="v.id" class="vaccine-item">
                            <div class="vaccine-icon">💉</div>
                            <div class="flex-1 min-w-0">
                                <div class="font-medium text-gray-900">{{ v.vaccine_name }}</div>
                                <div class="text-sm text-gray-500">{{ v.cycle_code || 'Cycle' }} - {{ v.barn_name || v.barn_id }}</div>
                            </div>
                            <div class="text-right flex-shrink-0">
                                <div class="text-sm font-medium text-gray-900">{{ fmtDate(v.scheduled_date) }}</div>
                                <div class="text-xs text-gray-400">{{ v.day_age_target ? 'Ngày ' + v.day_age_target : '' }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right: Quick Actions + Alerts -->
            <div class="dashboard-side">
                <!-- Quick Actions -->
                <div class="card">
                    <h3 class="font-semibold text-primary mb-4 flex items-center gap-2">
                        <span>⚡</span> Thao tác nhanh
                    </h3>
                    <div class="quick-actions">
                        <router-link to="/cycles" class="quick-action action-green">
                            <div class="action-icon">➕</div>
                            <div><div class="font-medium">Tạo đợt nuôi mới</div><div class="text-xs text-muted">Bắt đầu chu kỳ mới</div></div>
                        </router-link>
                        <router-link to="/care" class="quick-action action-blue">
                            <div class="action-icon">🌾</div>
                            <div><div class="font-medium">Ghi nhận cho ăn</div><div class="text-xs text-muted">Nhập liệu thức ăn</div></div>
                        </router-link>
                        <router-link to="/care" class="quick-action action-red">
                            <div class="action-icon">💀</div>
                            <div><div class="font-medium">Ghi nhận hao hụt</div><div class="text-xs text-muted">Báo cáo gia cầm chết</div></div>
                        </router-link>
                        <router-link to="/care" class="quick-action action-purple">
                            <div class="action-icon">💊</div>
                            <div><div class="font-medium">Ghi nhận thuốc</div><div class="text-xs text-muted">Nhập thuốc đã dùng</div></div>
                        </router-link>
                        <router-link to="/care" class="quick-action action-blue2">
                            <div class="action-icon">⚖️</div>
                            <div><div class="font-medium">Cân trọng lượng</div><div class="text-xs text-muted">Ghi mẫu cân</div></div>
                        </router-link>
                        <router-link to="/cameras" class="quick-action action-gray">
                            <div class="action-icon">📹</div>
                            <div><div class="font-medium">Camera</div><div class="text-xs text-muted">Xem trực tiếp</div></div>
                        </router-link>
                    </div>
                </div>

                <!-- Alerts -->
                <div class="card mt-4">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-primary flex items-center gap-2">
                            <span>🔔</span> Cảnh báo gần đây
                        </h3>
                        <router-link to="/alerts" class="text-sm text-primary hover:underline">Xem tất cả</router-link>
                    </div>

                    <div v-if="showContentSkeleton" class="space-y-2">
                        <div v-for="i in 2" :key="i" class="flex items-start gap-3 p-3 rounded-lg bg-gray-50 animate-pulse">
                            <div class="w-5 h-5 rounded-full bg-gray-200 flex-shrink-0"></div>
                            <div class="flex-1"><div class="h-4 bg-gray-200 rounded w-full mb-1"></div><div class="h-3 bg-gray-100 rounded w-20"></div></div>
                        </div>
                    </div>

                    <div v-else-if="alerts.length === 0" class="empty-state">
                        <div class="icon">✅</div>
                        <p>Không có cảnh báo nào</p>
                    </div>

                    <div v-else class="alert-list">
                        <div v-for="a in alerts" :key="a.id"
                            class="alert-item"
                            :class="{
                                'alert-danger': a.severity === 'danger',
                                'alert-warning': a.severity === 'warning',
                                'alert-info': a.severity === 'info'
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

        <!-- Empty Welcome State -->
        <div v-if="!showKpiSkeleton && !showContentSkeleton && cycles.length === 0 && alerts.length === 0 && vaccines.length === 0"
            class="card text-center py-16">
            <div class="text-6xl mb-4">🐔</div>
            <h3 class="text-xl font-bold text-gray-900 mb-2">Chào mừng đến CFarm!</h3>
            <p class="text-gray-500 mb-6">Bắt đầu bằng cách tạo trang trại và đợt nuôi đầu tiên</p>
            <div class="flex flex-wrap justify-center gap-3">
                <router-link to="/cycles" class="btn btn-primary">➕ Tạo đợt nuôi mới</router-link>
                <router-link to="/devices" class="btn btn-secondary">📡 Thêm thiết bị</router-link>
            </div>
        </div>
    </div>
    `
};
