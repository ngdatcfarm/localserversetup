const { ref, reactive, onMounted } = Vue;

const component = {
    template: `
    <div>
        <h2 class="page-title">Dashboard</h2>

        <!-- Stats -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div class="stat-card">
                <div class="stat-icon bg-green-100">🏠</div>
                <div><div class="card-title">Chuồng trại</div><div class="card-value">{{ stats.barns }}</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon bg-blue-100">🔄</div>
                <div><div class="card-title">Đợt nuôi</div><div class="card-value">{{ stats.activeCycles }}</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon bg-purple-100">📡</div>
                <div><div class="card-title">Thiết bị</div><div class="card-value">{{ stats.devicesOnline }}/{{ stats.devices }}</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon bg-red-100">🔔</div>
                <div><div class="card-title">Cảnh báo mới</div><div class="card-value">{{ stats.alerts }}</div></div>
            </div>
        </div>

        <!-- Active Cycles -->
        <div class="card mb-6" v-if="cycles.length">
            <h3 class="font-semibold mb-3">Đợt nuôi đang hoạt động</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div v-for="c in cycles" :key="c.id" class="border rounded-lg p-4">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <div class="font-semibold">{{ c.name }}</div>
                            <div class="text-sm text-gray-500">{{ c.barn_name || 'Chuồng ' + c.barn_id }}</div>
                        </div>
                        <span class="badge badge-green">Đang nuôi</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div><span class="text-gray-500">Số lượng:</span> {{ fmtNum(c.current_count) }}</div>
                        <div><span class="text-gray-500">Ngày tuổi:</span> {{ c.day_age || '-' }}</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Recent Alerts -->
        <div class="card" v-if="alerts.length">
            <div class="flex justify-between items-center mb-3">
                <h3 class="font-semibold">Cảnh báo gần đây</h3>
                <router-link to="/alerts" class="text-sm text-green-600 hover:underline">Xem tất cả</router-link>
            </div>
            <div v-for="a in alerts" :key="a.id" class="flex items-start gap-3 py-2 border-b last:border-0">
                <span :class="a.severity === 'danger' ? 'text-red-500' : a.severity === 'warning' ? 'text-yellow-500' : 'text-blue-500'" class="text-lg mt-0.5">
                    {{ a.severity === 'danger' ? '🔴' : a.severity === 'warning' ? '🟡' : '🔵' }}
                </span>
                <div class="flex-1 min-w-0">
                    <div class="text-sm">{{ a.message }}</div>
                    <div class="text-xs text-gray-400">{{ fmtDate(a.created_at) }}</div>
                </div>
            </div>
        </div>

        <div v-if="!cycles.length && !alerts.length" class="empty-state">
            <div class="icon">🌾</div>
            <p>Chào mừng đến CFarm!</p>
            <p class="text-sm mt-2">Bắt đầu bằng cách tạo chuồng trại và đợt nuôi mới.</p>
        </div>
    </div>`,

    setup() {
        const stats = reactive({ barns: 0, activeCycles: 0, devices: 0, devicesOnline: 0, alerts: 0 });
        const cycles = ref([]);
        const alerts = ref([]);

        onMounted(async () => {
            try {
                const [health, barnList, cycleList, alertList] = await Promise.all([
                    API.health(),
                    API.barns.list().catch(() => []),
                    API.cycles.list().catch(() => []),
                    API.alerts.list(false).catch(() => []),
                ]);
                stats.devices = health.devices?.total || 0;
                stats.devicesOnline = health.devices?.online || 0;
                stats.barns = barnList.length || 0;

                const active = cycleList.filter(c => c.status === 'active');
                stats.activeCycles = active.length;
                cycles.value = active.slice(0, 6);

                stats.alerts = alertList.length || 0;
                alerts.value = alertList.slice(0, 5);
            } catch (e) { console.error('Dashboard load error:', e); }
        });

        return { stats, cycles, alerts, fmtDate, fmtNum };
    }
};

return component;
