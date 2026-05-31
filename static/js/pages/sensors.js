/**
 * Sensors Page - Giám sát Môi trường IoT
 * Tab theo từng chuồng, truy vấn nhanh hơn
 */
const { ref, computed, onMounted, onUnmounted } = Vue;

return {
    setup() {
        // ── State ──────────────────────────────────────
        const activeTab = ref(''); // '' = mặc định tab đầu tiên, 'all' = tất cả
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

        // Tab active thực sự (nếu empty thì lấy barn đầu tiên có sensor)
        const effectiveTab = computed(() => {
            if (activeTab.value && activeTab.value !== 'all') return activeTab.value;
            // Tìm barn đầu tiên có sensor
            const firstBarnWithSensor = sensorDevices.value.find(d => d.barn_id)?.barn_id;
            return firstBarnWithSensor || 'all';
        });

        // Lọc devices theo tab đang active
        const filteredDevices = computed(() => {
            if (effectiveTab.value === 'all') return sensorDevices.value;
            return sensorDevices.value.filter(d => d.barn_id === effectiveTab.value);
        });

        // Lọc readings theo tab đang active
        const filteredReadings = computed(() => {
            if (effectiveTab.value === 'all') return latestReadings.value;
            return latestReadings.value.filter(r => r.barn_id === effectiveTab.value);
        });

        const metrics = computed(() => {
            const temps = filteredReadings.value.filter(r => r.sensor_type === 'temperature');
            const humids = filteredReadings.value.filter(r => r.sensor_type === 'humidity');
            const mq135 = filteredReadings.value.filter(r => r.sensor_type === 'mq135_raw');
            const mq137 = filteredReadings.value.filter(r => r.sensor_type === 'mq137_raw');

            const avgTemp = temps.length ? temps.reduce((s, r) => s + r.value, 0) / temps.length : null;
            const avgHumid = humids.length ? humids.reduce((s, r) => s + r.value, 0) / humids.length : null;
            const avgMq135 = mq135.length ? mq135.reduce((s, r) => s + r.value, 0) / mq135.length : null;
            const avgMq137 = mq137.length ? mq137.reduce((s, r) => s + r.value, 0) / mq137.length : null;

            return [
                { type: 'temp', label: 'Nhiệt độ', icon: '🌡️', value: avgTemp, unit: '°C',
                  statusLabel: avgTemp > 35 ? 'Nóng gây gát' : avgTemp < 16 ? 'Quá lạnh' : 'Bình thường',
                  statusClass: avgTemp > 35 ? 'badge-red' : avgTemp < 16 ? 'badge-yellow' : 'badge-green',
                  color: '#ef4444' },
                { type: 'humid', label: 'Độ ẩm', icon: '💧', value: avgHumid, unit: '%',
                  statusLabel: avgHumid > 85 ? 'Quá ẩm' : avgHumid < 40 ? 'Hán khô' : 'An sinh tốt',
                  statusClass: (avgHumid > 85 || avgHumid < 40) ? 'badge-yellow' : 'badge-green',
                  color: '#3b82f6' },
                { type: 'mq135', label: 'MQ135 Amoniac', icon: '🧪', value: avgMq135, unit: 'ADC',
                  statusLabel: avgMq135 > 1500 ? 'Nguy kịch' : avgMq135 > 1000 ? 'Cảnh báo' : 'An toàn',
                  statusClass: avgMq135 > 1500 ? 'badge-red' : avgMq135 > 1000 ? 'badge-yellow' : 'badge-green',
                  color: '#f59e0b' },
                { type: 'mq137', label: 'MQ137 Hydro Sunfua', icon: '💨', value: avgMq137, unit: 'ADC',
                  statusLabel: avgMq137 > 400 ? 'Quá định mức' : 'An toàn',
                  statusClass: avgMq137 > 400 ? 'badge-red' : 'badge-green',
                  color: '#a855f7' }
            ];
        });

        const chartLabels = computed(() => {
            if (!filteredReadings.value.length) return [];
            const times = [...new Set(filteredReadings.value.map(r => r.time))].sort();
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
            const times = [...new Set(filteredReadings.value.map(r => r.time))].sort();
            return times.map(t => {
                const group = filteredReadings.value.filter(r => r.sensor_type === sensorType && r.time === t);
                return group.length ? group.reduce((s, r) => s + r.value, 0) / group.length : null;
            });
        }

        function getDeviceReadings(device) {
            const readings = {};
            filteredReadings.value.filter(r => r.barn_id === device.barn_id)
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
            if (v == null) return '--';
            try { return Number(v).toFixed(dec); } catch { return '--'; }
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
                const tab = effectiveTab.value;
                if (tab === 'all') {
                    // Tất cả barns - dùng barns-temperature (chậm)
                    const data = await API.get('/api/sensors/barns-temperature');
                    const transformed = [];
                    if (Array.isArray(data)) {
                        data.forEach(barn => {
                            if (barn.temperature != null) transformed.push({
                                device_id: barn.device_id, device_name: barn.device_name || barn.barn_name,
                                barn_id: barn.barn_id, sensor_type: 'temperature',
                                value: barn.temperature, unit: '°C', time: barn.time
                            });
                            if (barn.humidity != null) transformed.push({
                                device_id: barn.device_id, device_name: barn.device_name || barn.barn_name,
                                barn_id: barn.barn_id, sensor_type: 'humidity',
                                value: barn.humidity, unit: '%', time: barn.time
                            });
                        });
                    }
                    latestReadings.value = transformed;
                } else {
                    // Tab riêng - dùng latest với barn_id (Nhanh!)
                    latestReadings.value = await API.sensors.latest(`?barn_id=${tab}`);
                }
            } catch (e) {
                latestReadings.value = [];
            }
        }

        function switchTab(tab) {
            activeTab.value = tab;
            loadReadings();
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
            activeTab, effectiveTab, timeRange, currentSim,
            barns, devices, latestReadings, sensorDevices, filteredDevices, filteredReadings,
            metrics, chartLabels, tempData, humidData, mq135Data, mq137Data,
            getDeviceReadings, isRecent, signalBars, fmtTime, fmtVal,
            tempClass, humidClass, gasClass,
            switchTab, handleFilterChange, refreshReadings, triggerSim, loadAll
        };
    },

    template: `
    <div class="page">
        <!-- Page Header -->
        <div class="page-header">
<h2 class="page-title">🌡️ Môi trường IoT</h2>
            <div class="flex gap-2 items-center">
                <select v-model="timeRange" @change="handleFilterChange" class="border rounded px-3 py-1.5 text-sm">
                    <option value="1">1 giờ</option>
                    <option value="6">6 giờ</option>
                    <option value="24">24 giờ</option>
                    <option value="168">7 ngày</option>
                </select>
                <button @click="refreshReadings" class="btn btn-sm btn-secondary">🔄 Làm mới</button>
            </div>
        </div>

        <!-- Tab Navigation -->
        <div class="flex flex-wrap gap-2 mb-6" style="border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
            <button
                @click="switchTab('all')"
                class="px-5 py-2.5 rounded-lg font-medium text-sm whitespace-nowrap transition-colors"
                :class="effectiveTab === 'all' ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            >
                📊 Tất cả
            </button>
            <button
                v-for="b in barns"
                :key="b.id"
                @click="switchTab(b.id)"
                class="px-5 py-2.5 rounded-lg font-medium text-sm whitespace-nowrap transition-colors"
                :class="effectiveTab === b.id ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            >
                {{ b.name || b.id }}
            </button>
        </div>

        <!-- Loading indicator -->
        <div v-if="loading" class="text-center py-4 text-muted">Đang tải dữ liệu...</div>

        <template v-else>
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
                        <span class="text-red-500">●</span> Nhiệt độ (°C)
                    </h3>
                    <div class="chart-container" style="position: relative; height: 220px;">
                        <canvas ref="tempChart"></canvas>
                    </div>
                </div>
                <div class="card p-4">
                    <h3 class="font-semibold mb-3 flex items-center gap-2">
                        <span class="text-blue-500">●</span> Độ ẩm (%)
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
                    <h3 class="font-semibold">📡 Cảm biến IoT Hoạt động ({{ filteredDevices.length }})</h3>
                    <span class="text-xs text-muted font-mono">{{ filteredReadings.length }} ghi đọc</span>
                </div>
                <div v-if="filteredDevices.length" class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Trạng thái</th>
                                <th>Thiết bị</th>
                                <th>Chuồng</th>
                                <th>Nhiệt độ</th>
                                <th>Độ ẩm</th>
                                <th>MQ135</th>
                                <th>MQ137</th>
                                <th>RSSI</th>
                                <th>Last seen</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="device in filteredDevices" :key="device.id">
                                <td>
                                    <span class="online-dot" :class="device.is_online ? 'on' : 'off'"></span>
                                    <span class="text-xs font-medium ml-1" :class="device.is_online ? 'text-green-600' : 'text-muted'">
                                        {{ device.is_online ? 'Online' : 'Offline' }}
                                    </span>
                                </td>
                                <td class="font-mono font-medium text-primary">{{ device.device_code || device.name }}</td>
                                <td>{{ device.barn_id || '-' }}</td>
                                <td :class="tempClass(getDeviceReadings(device).temperature?.value)">
                                    {{ fmtVal(getDeviceReadings(device).temperature?.value) }} °C
                                </td>
                                <td :class="humidClass(getDeviceReadings(device).humidity?.value)">
                                    {{ fmtVal(getDeviceReadings(device).humidity?.value) }} %
                                </td>
                                <td :class="gasClass(getDeviceReadings(device).mq135_raw?.value, 1000, 1500)">
                                    {{ fmtVal(getDeviceReadings(device).mq135_raw?.value, 0) }}
                                </td>
                                <td :class="gasClass(getDeviceReadings(device).mq137_raw?.value, 300, 400)">
                                    {{ fmtVal(getDeviceReadings(device).mq137_raw?.value, 0) }}
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
                    Không có thiết bị cảm biến nào
                </div>
            </div>

            <!-- Simulation Panel -->
            <div class="card p-4" style="background:#f8fafc; border: 1px dashed #cbd5e1;">
                <h3 class="font-semibold mb-3 text-sm uppercase tracking-wide text-muted">⚙️ Giả lập biến động môi trường</h3>
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
        </template>
    </div>
    `
};
