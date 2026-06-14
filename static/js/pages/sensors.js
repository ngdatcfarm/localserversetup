/**
 * Sensors Page - Giám sát Môi trường IoT
 * Tab theo từng chuồng, truy vấn nhanh hơn
 */
const { ref, computed, watch, onMounted, onUnmounted, nextTick } = Vue;

const SENSOR_TYPES = [
    { key: 'temperature', label: 'Nhiệt độ (°C)', color: '#ef4444', unit: '°C' },
    { key: 'humidity',    label: 'Độ ẩm (%)',     color: '#3b82f6', unit: '%' },
    { key: 'mq135_raw',   label: 'MQ135 (ADC)',   color: '#f59e0b', unit: 'ADC' },
    { key: 'mq137_raw',   label: 'MQ137 (ADC)',   color: '#a855f7', unit: 'ADC' },
];

// bucket_size for each range + label for the toggle buttons
const RANGE_CONFIG = {
    day:   { label: '1 ngày',  maxTicks: 12,  fmt: 'time' },
    week:  { label: '1 tuần',  maxTicks: 7,   fmt: 'shortday' },
    month: { label: '1 tháng', maxTicks: 10,  fmt: 'day' },
    year:  { label: '1 năm',   maxTicks: 12,  fmt: 'month' },
};

function fmtTick(iso, fmt) {
    const d = new Date(iso);
    if (fmt === 'time')     return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (fmt === 'shortday') return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit' });
    if (fmt === 'day')      return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    return d.toLocaleDateString('vi-VN', { month: 'short', year: '2-digit' });
}

function buildChart(canvasEl, data, color, fmt) {
    if (!canvasEl) return null;
    return new Chart(canvasEl.getContext('2d'), {
        type: 'line',
        data: {
            labels: data.map(d => fmtTick(d.bucket, fmt)),
            datasets: [{
                label: 'avg',
                data: data.map(d => d.avg_value),
                borderColor: color,
                backgroundColor: color + '20',
                tension: 0.25,
                pointRadius: 0,
                pointHoverRadius: 4,
                borderWidth: 2,
                fill: false,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const row = data[items[0].dataIndex];
                            return row?.bucket ? new Date(row.bucket).toLocaleString('vi-VN') : '';
                        },
                    },
                },
            },
            scales: {
                x: { ticks: { maxRotation: 0, autoSkip: true }, grid: { display: false } },
                y: { beginAtZero: false, ticks: { font: { size: 10 } } },
            },
        },
    });
}

function refreshChart(chart, data, fmt) {
    if (!chart) return;
    chart.data.labels = data.map(d => fmtTick(d.bucket, fmt));
    chart.data.datasets[0].data = data.map(d => d.avg_value);
    chart.update('none');
}

export default{
    setup() {
        // ── State ──────────────────────────────────────
        const activeTab = ref('');
        const currentSim = ref('normal');
        const barns = ref([]);
        const devices = ref([]);
        const latestReadings = ref([]);
        const loading = ref(false);
        const tareStatusMap = ref({});

        // Chart state
        const chartRange = ref('day');
        const chartData = ref({ temperature: [], humidity: [], mq135_raw: [], mq137_raw: [] });
        const chartLoading = ref(false);
        const canvasRefs = {
            temperature: ref(null),
            humidity: ref(null),
            mq135_raw: ref(null),
            mq137_raw: ref(null),
        };
        const charts = {};

        let intervalId = null;

        // ── Computed ──────────────────────────────────
        const sensorDevices = computed(() =>
            devices.value.filter(d => d.type_code === 'sensor' || d.device_type_id === 3)
        );

        const effectiveTab = computed(() => {
            if (activeTab.value && activeTab.value !== 'all') return activeTab.value;
            const firstBarnWithSensor = sensorDevices.value.find(d => d.barn_id)?.barn_id;
            return firstBarnWithSensor || 'all';
        });

        const filteredDevices = computed(() =>
            effectiveTab.value === 'all'
                ? sensorDevices.value
                : sensorDevices.value.filter(d => d.barn_id === effectiveTab.value)
        );

        const filteredReadings = computed(() =>
            effectiveTab.value === 'all'
                ? latestReadings.value
                : latestReadings.value.filter(r => r.barn_id === effectiveTab.value)
        );

        const metrics = computed(() => {
            const avg = (rows) => rows.length ? rows.reduce((s, r) => s + r.value, 0) / rows.length : null;
            const temps = filteredReadings.value.filter(r => r.sensor_type === 'temperature');
            const humids = filteredReadings.value.filter(r => r.sensor_type === 'humidity');
            const mq135 = filteredReadings.value.filter(r => r.sensor_type === 'mq135_raw');
            const mq137 = filteredReadings.value.filter(r => r.sensor_type === 'mq137_raw');
            return [
                { type: 'temp', label: 'Nhiệt độ', icon: '🌡️', value: avg(temps), unit: '°C',
                  statusLabel: avg(temps) > 35 ? 'Nóng gây gát' : avg(temps) < 16 ? 'Quá lạnh' : 'Bình thường',
                  statusClass: avg(temps) > 35 ? 'badge-red' : avg(temps) < 16 ? 'badge-yellow' : 'badge-green',
                  color: '#ef4444' },
                { type: 'humid', label: 'Độ ẩm', icon: '💧', value: avg(humids), unit: '%',
                  statusLabel: avg(humids) > 85 ? 'Quá ẩm' : avg(humids) < 40 ? 'Hán khô' : 'An sinh tốt',
                  statusClass: (avg(humids) > 85 || avg(humids) < 40) ? 'badge-yellow' : 'badge-green',
                  color: '#3b82f6' },
                { type: 'mq135', label: 'MQ135 Amoniac', icon: '🧪', value: avg(mq135), unit: 'ADC',
                  statusLabel: avg(mq135) > 1500 ? 'Nguy kịch' : avg(mq135) > 1000 ? 'Cảnh báo' : 'An toàn',
                  statusClass: avg(mq135) > 1500 ? 'badge-red' : avg(mq135) > 1000 ? 'badge-yellow' : 'badge-green',
                  color: '#f59e0b' },
                { type: 'mq137', label: 'MQ137 Hydro Sunfua', icon: '💨', value: avg(mq137), unit: 'ADC',
                  statusLabel: avg(mq137) > 400 ? 'Quá định mức' : 'An toàn',
                  statusClass: avg(mq137) > 400 ? 'badge-red' : 'badge-green',
                  color: '#a855f7' },
            ];
        });

        // ── Helpers ────────────────────────────────────
        function getDeviceReadings(device) {
            const readings = {};
            filteredReadings.value
                .filter(r => r.barn_id === device.barn_id)
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

        function fmtOhms(v) {
            if (v == null) return '—';
            if (v >= 1000) return `${(v / 1000).toFixed(2)} kΩ`;
            return `${v.toFixed(0)} Ω`;
        }

        function getTareR0(deviceId, sensorType) {
            const list = tareStatusMap.value[deviceId];
            if (!list) return null;
            const entry = list.find(s => s.sensor_type === sensorType);
            return entry ? entry.active_r0_ohms : null;
        }

        function tempClass(v) { return v == null ? '' : v < 28 || v > 32 ? 'text-red-500' : 'text-green-500'; }
        function humidClass(v) { return v == null ? '' : v < 60 || v > 75 ? 'text-red-500' : 'text-green-500'; }
        function gasClass(v, warn, danger) {
            if (v == null) return '';
            return v > danger ? 'text-red-500' : v > warn ? 'text-yellow-500' : 'text-green-500';
        }

        // ── Load Data ───────────────────────────────────
        async function loadTareStatuses() {
            const sensorDevs = devices.value.filter(x => x.type_code === 'sensor' || x.device_type_id === 3);
            if (!sensorDevs.length) { tareStatusMap.value = {}; return; }
            const pairs = await Promise.all(
                sensorDevs.map(async x => {
                    try { return [x.id, await API.mqTare.status(x.id)]; }
                    catch { return [x.id, []]; }
                })
            );
            const next = {};
            for (const [id, res] of pairs) next[id] = res;
            tareStatusMap.value = next;
        }

        async function loadReadings() {
            try {
                const tab = effectiveTab.value;
                if (tab === 'all') {
                    const data = await API.get('/api/sensors/barns-temperature');
                    const transformed = [];
                    if (Array.isArray(data)) {
                        data.forEach(barn => {
                            if (barn.temperature != null) transformed.push({
                                device_id: barn.device_id, device_name: barn.device_name || barn.barn_name,
                                barn_id: barn.barn_id, sensor_type: 'temperature',
                                value: barn.temperature, unit: '°C', time: barn.time,
                            });
                            if (barn.humidity != null) transformed.push({
                                device_id: barn.device_id, device_name: barn.device_name || barn.barn_name,
                                barn_id: barn.barn_id, sensor_type: 'humidity',
                                value: barn.humidity, unit: '%', time: barn.time,
                            });
                        });
                    }
                    latestReadings.value = transformed;
                } else {
                    latestReadings.value = await API.sensors.latest(`?barn_id=${tab}`);
                }
            } catch (e) {
                latestReadings.value = [];
            }
        }

        async function loadAll() {
            loading.value = true;
            try {
                const [b, d] = await Promise.all([
                    API.barns.list().catch(() => []),
                    API.devices.list().catch(() => []),
                ]);
                barns.value = b;
                devices.value = d;
                await Promise.all([loadTareStatuses(), loadReadings(), loadChartData()]);
            } catch (e) {
                console.error('Load sensors error:', e);
            } finally {
                loading.value = false;
            }
        }

        async function loadChartData() {
            chartLoading.value = true;
            try {
                const tab = effectiveTab.value;
                const barnId = (tab === 'all' || !tab) ? null : tab;
                const results = await Promise.all(
                    SENSOR_TYPES.map(s => API.sensors.series(s.key, chartRange.value, barnId).catch(() => []))
                );
                const next = {};
                SENSOR_TYPES.forEach((s, i) => { next[s.key] = results[i] || []; });
                chartData.value = next;
            } finally {
                chartLoading.value = false;
            }
        }

        function mountCharts() {
            const fmt = RANGE_CONFIG[chartRange.value].fmt;
            SENSOR_TYPES.forEach(s => {
                if (charts[s.key]) charts[s.key].destroy();
                charts[s.key] = buildChart(canvasRefs[s.key].value, chartData.value[s.key] || [], s.color, fmt);
            });
        }

        function applyChartData() {
            const fmt = RANGE_CONFIG[chartRange.value].fmt;
            SENSOR_TYPES.forEach(s => refreshChart(charts[s.key], chartData.value[s.key] || [], fmt));
        }

        function destroyCharts() {
            SENSOR_TYPES.forEach(s => { if (charts[s.key]) { charts[s.key].destroy(); charts[s.key] = null; } });
        }

        // ── UI handlers ─────────────────────────────────
        function switchTab(tab) { activeTab.value = tab; }
        function refreshReadings() { loadReadings(); }
        function triggerSim(type) { currentSim.value = type; }

        // ── Watchers ────────────────────────────────────
        watch(chartRange, () => loadChartData());
        watch(effectiveTab, () => {
            loadReadings();
            loadChartData();
        });
        watch(chartData, () => {
            // Charts may not exist yet (initial mount uses loadAll first)
            if (charts.temperature) applyChartData();
        }, { deep: false });

        // Function ref binder for v-for-generated canvases. Defined in setup
        // scope so the returned closure can reach `canvasRefs` directly.
        function bindCanvas(s) {
            return (el) => { canvasRefs[s.key].value = el; };
        }

        // ── Lifecycle ────────────────────────────────────
        onMounted(async () => {
            await loadAll();
            await nextTick();
            mountCharts();
            intervalId = setInterval(async () => {
                await loadTareStatuses();
                await loadReadings();
                await loadChartData();
            }, 30000);
        });

        onUnmounted(() => {
            if (intervalId) clearInterval(intervalId);
            destroyCharts();
        });

        // ── Return ──────────────────────────────────────
        return {
            activeTab, effectiveTab, currentSim,
            barns, devices, latestReadings, sensorDevices, filteredDevices, filteredReadings,
            metrics,
            tareStatusMap, getTareR0, fmtOhms,
            getDeviceReadings, isRecent, signalBars, fmtTime, fmtVal,
            tempClass, humidClass, gasClass,
            switchTab, refreshReadings, triggerSim, loadAll, loadTareStatuses,
            // chart
            chartRange, chartData, chartLoading, SENSOR_TYPES, RANGE_CONFIG,
            canvasRefs, bindCanvas, loadChartData,
        };
    },

    template: `
    <div class="page">
        <!-- Page Header -->
        <div class="page-header">
            <h2 class="page-title">🌡️ Môi trường IoT</h2>
            <div class="flex gap-2 items-center">
                <div class="view-toggle">
                    <button v-for="(cfg, key) in RANGE_CONFIG" :key="key"
                        :class="['view-toggle-btn', chartRange === key && 'active']"
                        @click="chartRange = key">
                        {{ cfg.label }}
                    </button>
                </div>
                <button @click="loadChartData" class="btn btn-sm btn-secondary">🔄 Làm mới</button>
            </div>
        </div>

        <!-- Tab Navigation -->
        <div class="flex flex-wrap gap-2 mb-6" style="border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
            <button @click="switchTab('all')"
                class="px-5 py-2.5 rounded-lg font-medium text-sm whitespace-nowrap transition-colors"
                :class="effectiveTab === 'all' ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'">
                📊 Tất cả
            </button>
            <button v-for="b in barns" :key="b.id" @click="switchTab(b.id)"
                class="px-5 py-2.5 rounded-lg font-medium text-sm whitespace-nowrap transition-colors"
                :class="effectiveTab === b.id ? 'bg-green-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'">
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
                <div v-for="s in SENSOR_TYPES.slice(0,2)" :key="s.key" class="card p-4">
                    <h3 class="font-semibold mb-3 flex items-center gap-2">
                        <span :style="'color:' + s.color">●</span> {{ s.label }}
                    </h3>
                    <div class="chart-container" style="position: relative; height: 220px;">
                        <canvas :ref="bindCanvas(s)"></canvas>
                    </div>
                </div>
            </div>

            <!-- Charts Row 2: Gas Sensors -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div v-for="s in SENSOR_TYPES.slice(2)" :key="s.key" class="card p-4">
                    <h3 class="font-semibold mb-3 flex items-center gap-2">
                        <span :style="'color:' + s.color">●</span> {{ s.label }}
                    </h3>
                    <div class="chart-container" style="position: relative; height: 220px;">
                        <canvas :ref="bindCanvas(s)"></canvas>
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
                                <th>R0 MQ135</th>
                                <th>R0 MQ137</th>
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
                                <td class="text-xs font-mono">
                                    <span :class="getTareR0(device.id, 'mq135_raw') ? 'text-emerald-600' : 'text-muted'">
                                        {{ fmtOhms(getTareR0(device.id, 'mq135_raw')) }}
                                    </span>
                                </td>
                                <td class="text-xs font-mono">
                                    <span :class="getTareR0(device.id, 'mq137_raw') ? 'text-emerald-600' : 'text-muted'">
                                        {{ fmtOhms(getTareR0(device.id, 'mq137_raw')) }}
                                    </span>
                                </td>
                                <td>
                                    <div class="flex gap-0.5 items-end h-3">
                                        <div v-for="(h, i) in [4, 7, 10, 13]" :key="i"
                                             class="w-1 rounded-sm"
                                             :class="signalBars(device.wifi_rssi)[i] ? 'bg-green-500' : 'bg-gray-200'"
                                             :style="'height:' + h + 'px;'"></div>
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
                    <button class="btn btn-sm" :class="currentSim === 'normal' ? 'btn-primary' : 'btn-secondary'" @click="triggerSim('normal')">☀️ Normal</button>
                    <button class="btn btn-sm" :class="currentSim === 'heatwave' ? 'btn-danger' : 'btn-secondary'" @click="triggerSim('heatwave')">🔥 Heatwave</button>
                    <button class="btn btn-sm" :class="currentSim === 'biogas' ? 'btn-danger' : 'btn-secondary'" @click="triggerSim('biogas')">☣️ Biogas</button>
                    <button class="btn btn-sm" :class="currentSim === 'rainstorm' ? 'btn-primary' : 'btn-secondary'" @click="triggerSim('rainstorm')">🌧️ Rainstorm</button>
                </div>
            </div>
        </template>
    </div>
    `
};
