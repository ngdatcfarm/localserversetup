/**
 * Dashboard - Stats + active cycles + upcoming vaccines + recent alerts
 */
const { ref, reactive, onMounted } = Vue;

return {
    setup() {
        const stats = reactive({ barns: 0, activeCycles: 0, devices: 0, devicesOnline: 0, alerts: 0, totalBirds: 0 });
        const cycles = ref([]);
        const alerts = ref([]);
        const upcomingVaccines = ref([]);
        const syncStatus = ref(null);

        onMounted(async () => {
            try {
                const [health, barnList, cycleList, alertList, vaccines] = await Promise.all([
                    API.health(),
                    API.barns.list().catch(() => []),
                    API.cycles.list().catch(() => []),
                    API.alerts.list(false).catch(() => []),
                    API.vaccines.schedules.upcoming(7).catch(() => []),
                ]);
                stats.devices = health.devices?.total || 0;
                stats.devicesOnline = health.devices?.online || 0;
                stats.barns = barnList.length || 0;

                const active = cycleList.filter(c => c.status === 'active');
                stats.activeCycles = active.length;
                stats.totalBirds = active.reduce((sum, c) => sum + (c.current_count || 0), 0);
                cycles.value = active.slice(0, 6);

                stats.alerts = alertList.length || 0;
                alerts.value = alertList.slice(0, 5);
                upcomingVaccines.value = vaccines.slice(0, 5);

                // Load sync status
                try { syncStatus.value = await API.sync.status(); } catch {}
            } catch (e) { console.error('Dashboard load error:', e); }
        });

        return { stats, cycles, alerts, upcomingVaccines, syncStatus, fmtDate, fmtNum };
    },

    template: `
    <div>
        <h2 class="text-xl font-bold mb-4">Dashboard</h2>

        <!-- Stats -->
        <div class="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
            <div class="card p-3 text-center">
                <div class="text-xs text-gray-500 uppercase">Chuong trai</div>
                <div class="text-2xl font-bold text-green-600">{{ stats.barns }}</div>
            </div>
            <div class="card p-3 text-center">
                <div class="text-xs text-gray-500 uppercase">Dot nuoi</div>
                <div class="text-2xl font-bold text-blue-600">{{ stats.activeCycles }}</div>
            </div>
            <div class="card p-3 text-center">
                <div class="text-xs text-gray-500 uppercase">Tong dan</div>
                <div class="text-2xl font-bold text-green-700">{{ fmtNum(stats.totalBirds) }}</div>
            </div>
            <div class="card p-3 text-center">
                <div class="text-xs text-gray-500 uppercase">Thiet bi</div>
                <div class="text-2xl font-bold text-purple-600">{{ stats.devicesOnline }}/{{ stats.devices }}</div>
            </div>
            <div class="card p-3 text-center">
                <div class="text-xs text-gray-500 uppercase">Canh bao</div>
                <div class="text-2xl font-bold text-red-600">{{ stats.alerts }}</div>
            </div>
            <div class="card p-3 text-center" v-if="syncStatus">
                <div class="text-xs text-gray-500 uppercase">Cloud Sync</div>
                <router-link to="/sync" class="text-2xl font-bold" :class="syncStatus.enabled && syncStatus.running ? 'text-green-600' : 'text-gray-400'">
                    {{ syncStatus.enabled ? (syncStatus.running ? 'ON' : 'Paused') : 'OFF' }}
                </router-link>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <!-- Active Cycles -->
            <div class="card" v-if="cycles.length">
                <h3 class="font-semibold mb-3">Dot nuoi dang hoat dong</h3>
                <div class="space-y-2">
                    <router-link v-for="c in cycles" :key="c.id" :to="'/cycles/' + c.id"
                                 class="block border rounded-lg p-3 hover:border-green-400 transition-colors">
                        <div class="flex justify-between items-start">
                            <div>
                                <div class="font-medium">{{ c.name || c.code }}</div>
                                <div class="text-xs text-gray-500">{{ c.barn_name || 'Chuong ' + c.barn_id }}</div>
                            </div>
                            <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Dang nuoi</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-sm mt-2">
                            <div><span class="text-gray-500">SL:</span> {{ fmtNum(c.current_count) }}</div>
                            <div><span class="text-gray-500">Ngay tuoi:</span> {{ c.day_age || '-' }}</div>
                        </div>
                    </router-link>
                </div>
            </div>

            <!-- Upcoming Vaccines -->
            <div class="card" v-if="upcomingVaccines.length">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-semibold">Vaccine sap toi (7 ngay)</h3>
                    <router-link to="/vaccines" class="text-sm text-green-600 hover:underline">Xem tat ca</router-link>
                </div>
                <div class="space-y-2">
                    <div v-for="v in upcomingVaccines" :key="v.id" class="flex items-center gap-3 py-2 border-b last:border-0">
                        <div class="text-lg">💉</div>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-medium">{{ v.vaccine_name }}</div>
                            <div class="text-xs text-gray-500">{{ v.cycle_code }} - {{ v.barn_name || '' }} - {{ fmtDate(v.scheduled_date) }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Recent Alerts -->
        <div class="card" v-if="alerts.length">
            <div class="flex justify-between items-center mb-3">
                <h3 class="font-semibold">Canh bao gan day</h3>
                <router-link to="/alerts" class="text-sm text-green-600 hover:underline">Xem tat ca</router-link>
            </div>
            <div v-for="a in alerts" :key="a.id" class="flex items-start gap-3 py-2 border-b last:border-0">
                <span class="text-lg mt-0.5">{{ a.severity === 'danger' ? '🔴' : a.severity === 'warning' ? '🟡' : '🔵' }}</span>
                <div class="flex-1 min-w-0">
                    <div class="text-sm">{{ a.message }}</div>
                    <div class="text-xs text-gray-400">{{ fmtDate(a.created_at) }}</div>
                </div>
            </div>
        </div>

        <div v-if="!cycles.length && !alerts.length && !upcomingVaccines.length" class="text-center text-gray-400 py-12">
            <p class="text-lg mb-2">Chao mung den CFarm!</p>
            <p class="text-sm">Bat dau bang cach tao chuong trai va dot nuoi moi.</p>
        </div>
    </div>`
};
