/**
 * Sensors Page - Giam sat Moi truong IoT (App CSS)
 * Du lieu thuc te tu API: /api/devices, /api/sensors/latest
 * Dung app.css classes: card, btn, badge, grid, table-wrap
 */
const { ref, computed, onMounted, onUnmounted } = Vue;

return {
    setup() {
        // ── State ──────────────────────────────────────
        const selectedBarn = ref('');
        const timeRange = ref('24');
        const currentSim = ref('normal');

        const barns = ref([]);
        const devices = ref([]);
        const latestReadings = ref([]);
        const loading = ref(false);

        let intervalId = null;

        // ── Computed ──────────────────────────────────
        const sensorDevices = computed(() => {
            return devices.value.filter(d => d.type_code === 'sensor' || d.device_type_id === 3);
        });

        const metrics = computed(() => {
            const temps = latestReadings.value.filter(r => r.sensor_type === 'temperature');
            const humids = latestReadings.value.filter(r => r.sensor_type === 'humidity');
            const mq135 = latestReadings.value.filter(r => r.sensor_type === 'mq135_raw');
            const mq137 = latestReadings.value.filter(r => r.sensor_type === 'mq137_raw');

            const avgTemp = temps.length ? temps.reduce((s, r) => s + r.value, 0) / temps.length : null;
            const avgHumid = humids.length ? humids.reduce((s, r) => s + r.value, 0) / humids.length : null;
            const avgMq135 = mq135.length ? mq135.reduce((s, r) => s + r.value, 0) / mq135.length : null;
            const avgMq137 = mq137.length ? mq137.reduce((s, r) => s + r.value, 0) / mq137.length : null;

            return [
                { type: 'temp', label: 'Nhiet do', icon: '🌡️', value: avgTemp, unit: '°C',
                  statusLabel: avgTemp > 35 ? 'Nong gay gat' : avgTemp < 16 ? 'Qua lanh' : 'Binh thuong',
                  statusClass: avgTemp > 35 ? 'badge-red' : avgTemp < 16 ? 'badge-yellow' : 'badge-green',
                  color: '#ef4444' },
                { type: 'humid', label: 'Do am', icon: '💧', value: avgHumid, unit: '%',
                  statusLabel: avgHumid > 85 ? 'Qua am' : avgHumid < 40 ? 'Hanh kho' : 'An sinh tot',
                  statusClass: (avgHumid > 85 || avgHumid < 40) ? 'badge-yellow' : 'badge-green',
                  color: '#3b82f6' },
                { type: 'mq135', label: 'MQ135 Amoniac', icon: '🧪', value: avgMq135, unit: 'ADC',
                  statusLabel: avgMq135 > 1500 ? 'Nguy kich' : avgMq135 > 1000 ? 'Canh cao' : 'An toan',
                  statusClass: avgMq135 > 1500 ? 'badge-red' : avgMq135 > 1000 ? 'badge-yellow' : 'badge-green',
                  color: '#f59e0b' },
                { type: 'mq137', label: 'MQ137 Hydro Sunfua', icon: '💨', value: avgMq137, unit: 'ADC',
                  statusLabel: avgMq137 > 400 ? 'Qua dinh muc' : 'An toan',
                  statusClass: avgMq137 > 400 ? 'badge-red' : 'badge-green',
                  color: '#a855f7' }
            ];
        });

        const chartLabels = computed(() => {
            if (!latestReadings.value.length) return [];
            const times = [...new Set(latestReadings.value.map(r => r.time))].sort();
            return times.map(t => {
                const d = new Date(t);
                return timeRange.value <= '24'
                    ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                    : d.toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' });
            });
        });

        const tempData = computed(() => getSeriesData('temperature'));
        const humidData = computed(() => getSeriesData('humidity'));
        const mq135Data = computed(() => getSeriesData('mq135_raw'));
        const mq137Data = computed(() => getSeriesData('mq137_raw'));

        function getSeriesData(sensorType) {
            const times = [...new Set(latestReadings.value.map(r => r.time))].sort();
            return times.map(t => {
                const group = latestReadings.value.filter(r => r.sensor_type === sensorType && r.time === t);
                return group.length ? group.reduce((s, r) => s + r.value, 0) / group.length : null;
            });
        }

        function getDeviceReadings(deviceId) {
            const readings = {};
            latestReadings.value.filter(r => r.device_id === deviceId)
                .forEach(r => { readings[r.sensor_type] = r; });
            return readings;
        }

        function isRecent(time) {
            if (!time) return false;
            return Date.now() - new Date(time).getTime() < 300000;
        }

        function signalBars(rssi) {
            if (!rssi) return [false, false, false, false];
            return [rssi > -80, rssi > -65, rssi > -50, rssi > -40];
        }

        function fmtTime(time) {
            if (!time) return '-';
            return new Date(time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }

        function fmtVal(v, dec = 1) {
            return v !== null ? v.toFixed(dec) : '--';
        }

        function tempClass(v) {
            if (v === null) return '';
            return v < 28 || v > 32 ? 'text-red-500' : 'text-green-500';
        }

        function humidClass(v) {
            if (v === null) return '';
            return v < 60 || v > 75 ? 'text-red-500' : 'text-green-500';
        }

        function gasClass(v, warn, danger) {
            if (v === null) return '';
            return v > danger ? 'text-red-500' : v > warn ? 'text-yellow-500' : 'text-green-500';
        }

        // ── Load Data ───────────────────────────────────
        async function loadAll() {
            loading.value = true;
            try {
                const [b, d] = await Promise.all([
                    API.barns.list().catch(() => []),
                    API.devices.list().catch(() => [])
                ]);
                barns.value = b;
                devices.value = d;
                await loadReadings();
            } catch (e) {
                console.error('Load sensors error:', e);
            } finally {
                loading.value = false;
            }
        }

        async function loadReadings() {
            try {
                const params = selectedBarn.value ? `?barn_id=${selectedBarn.value}` : '';
                latestReadings.value = await API.sensors.latest(params);
            } catch (e) {
                latestReadings.value = [];
            }
        }

        function handleFilterChange() {
            loadReadings();
        }

        function refreshReadings() {
            loadReadings();
        }

        function triggerSim(type) {
            currentSim.value = type;
        }

        // ── Lifecycle ────────────────────────────────────
        onMounted(() => {
            loadAll();
            intervalId = setInterval(loadReadings, 30000);
        });

        onUnmounted(() => {
            if (intervalId) clearInterval(intervalId);
        });

        // ── Return ──────────────────────────────────────
        return {
            selectedBarn, timeRange, currentSim,
            barns, devices, latestReadings, sensorDevices,
            metrics, chartLabels, tempData, humidData, mq135Data, mq137Data,
            getDeviceReadings, isRecent, signalBars, fmtTime, fmtVal,
            tempClass, humidClass, gasClass,
            handleFilterChange, refreshReadings, triggerSim, loadAll
        };
    },

    template: `
    <div class="page">
        <!-- Page Header -->
        <div class="page-header">
            <h2 class="page-title"> Moi truong IoT</h2>
            <div class="flex gap-2 items-center">
                <select v-model="selectedBarn" @change="handleFilterChange" class="border rounded px-3 py-1.5 text-sm">
                    <option value="">Tat ca chuong</option>
                    <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
                <select v-model="timeRange" @change="handleFilterChange" class="border rounded px-3 py-1.5 text-sm">
                    <option value="1">1 gio</option>
                    <option value="6">6 gio</option>
                    <option value="24">24 gio</option>
                    <option value="168">7 ngay</option>
                </select>
                <button @click="refreshReadings" class="btn btn-sm btn-secondary">🔄 Lam moi</button>
            </div>
        </div>

        <!-- Metrics Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div v-for="m in metrics" :key="m.type" class="card p-4">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-muted">{{ m.icon }} {{ m.label }}</span>
                    <span :class="['badge', m.statusClass]">{{ m.statusLabel }}</span>
                </div>
                <div class="text-3xl font-bold" :class="m.type === 'temp' ? tempClass(m.value) : m.type === 'humid' ? humidClass(m.value) : gasClass(m.value, 1000, 1500)">
                    {{ fmtVal(m.value, 1) }}
                    <span class="text-lg font-normal">{{ m.unit }}</span>
                </div>
                <div class="text-xs text-muted mt-1">ADC reading</div>
            </div>
        </div>

        <!-- Charts Row 1: Temp & Humidity -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div class="card p-4">
                <h3 class="font-semibold mb-3 flex items-center gap-2">
                    <span class="text-red-500">●</span> Nhiet do (°C)
                </h3>
                <div class="chart-container" style="position: relative; height: 220px;">
                    <canvas ref="tempChart"></canvas>
                </div>
            </div>
            <div class="card p-4">
                <h3 class="font-semibold mb-3 flex items-center gap-2">
                    <span class="text-blue-500">●</span> Do am (%)
                </h3>
                <div class="chart-container" style="position: relative; height: 220px;">
                    <canvas ref="humidChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Charts Row 2: Gas Sensors -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div class="card p-4">
                <h3 class="font-semibold mb-3 flex items-center gap-2">
                    <span class="text-yellow-500">●</span> MQ135 - Khí Amoniac (ADC)
                </h3>
                <div class="chart-container" style="position: relative; height: 220px;">
                    <canvas ref="mq135Chart"></canvas>
                </div>
            </div>
            <div class="card p-4">
                <h3 class="font-semibold mb-3 flex items-center gap-2">
                    <span class="text-purple-500">●</span> MQ137 - Hydro Sunfua (ADC)
                </h3>
                <div class="chart-container" style="position: relative; height: 220px;">
                    <canvas ref="mq137Chart"></canvas>
                </div>
            </div>
        </div>

        <!-- Device Table -->
        <div class="card p-4 mb-6">
            <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold">📡 Cam bien IoT Hoat dong ({{ sensorDevices.length }})</h3>
                <span class="text-xs text-muted font-mono">{{ latestReadings.length }} ghi doc</span>
            </div>
            <div v-if="sensorDevices.length" class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Trang thai</th>
                            <th>Thiet bi</th>
                            <th>Chuong</th>
                            <th>Nhiet do</th>
                            <th>Do am</th>
                            <th>MQ135</th>
                            <th>MQ137</th>
                            <th>RSSI</th>
                            <th>Last seen</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="device in sensorDevices" :key="device.id">
                            <td>
                                <span class="online-dot" :class="device.is_online ? 'on' : 'off'"></span>
                                <span class="text-xs font-medium ml-1" :class="device.is_online ? 'text-green-600' : 'text-muted'">
                                    {{ device.is_online ? 'Online' : 'Offline' }}
                                </span>
                            </td>
                            <td class="font-mono font-medium text-primary">{{ device.device_code || device.name }}</td>
                            <td>{{ device.barn_id || '-' }}</td>
                            <td :class="tempClass(getDeviceReadings(device.id).temperature?.value)">
                                {{ fmtVal(getDeviceReadings(device.id).temperature?.value) }} °C
                            </td>
                            <td :class="humidClass(getDeviceReadings(device.id).humidity?.value)">
                                {{ fmtVal(getDeviceReadings(device.id).humidity?.value) }} %
                            </td>
                            <td :class="gasClass(getDeviceReadings(device.id).mq135_raw?.value, 1000, 1500)">
                                {{ fmtVal(getDeviceReadings(device.id).mq135_raw?.value, 0) }}
                            </td>
                            <td :class="gasClass(getDeviceReadings(device.id).mq137_raw?.value, 300, 400)">
                                {{ fmtVal(getDeviceReadings(device.id).mq137_raw?.value, 0) }}
                            </td>
                            <td>
                                <div class="flex gap-0.5 items-end h-3">
                                    <div class="w-1 rounded-sm" :class="signalBars(device.wifi_rssi)[0] ? 'bg-green-500' : 'bg-gray-200'" style="height:4px;"></div>
                                    <div class="w-1 rounded-sm" :class="signalBars(device.wifi_rssi)[1] ? 'bg-green-500' : 'bg-gray-200'" style="height:7px;"></div>
                                    <div class="w-1 rounded-sm" :class="signalBars(device.wifi_rssi)[2] ? 'bg-green-500' : 'bg-gray-200'" style="height:10px;"></div>
                                    <div class="w-1 rounded-sm" :class="signalBars(device.wifi_rssi)[3] ? 'bg-green-500' : 'bg-gray-200'" style="height:13px;"></div>
                                </div>
                            </td>
                            <td class="text-xs text-muted">{{ fmtTime(device.last_heartbeat_at) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="text-center py-8 text-muted">
                Khong co thiet bi cam bien nao
            </div>
        </div>

        <!-- Simulation Panel -->
        <div class="card p-4" style="background:#f8fafc; border: 1px dashed #cbd5e1;">
            <h3 class="font-semibold mb-3 text-sm uppercase tracking-wide text-muted">⚙️ Gia lap bien dong moi truong</h3>
            <div class="flex flex-wrap gap-2">
                <button class="btn btn-sm" :class="currentSim === 'normal' ? 'btn-primary' : 'btn-secondary'" @click="triggerSim('normal')">
                    ☀️ Normal
                </button>
                <button class="btn btn-sm" :class="currentSim === 'heatwave' ? 'btn-danger' : 'btn-secondary'" @click="triggerSim('heatwave')">
                    🔥 Heatwave
                </button>
                <button class="btn btn-sm" :class="currentSim === 'biogas' ? 'btn-danger' : 'btn-secondary'" @click="triggerSim('biogas')">
                    ☣️ Biogas
                </button>
                <button class="btn btn-sm" :class="currentSim === 'rainstorm' ? 'btn-primary' : 'btn-secondary'" @click="triggerSim('rainstorm')">
                    🌧️ Rainstorm
                </button>
            </div>
        </div>
    </div>
    `
};