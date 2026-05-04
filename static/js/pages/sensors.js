/**
 * Sensors Page - Environmental Monitoring with Charts
 */
const { ref, onMounted, onUnmounted, computed } = Vue;

const component = {
    template: `
    <div>
        <div class="page-header">
            <h2 class="page-title">Môi trường</h2>
            <div class="flex gap-2 items-center">
                <select v-model="selectedBarn" @change="loadBarnData();" class="border rounded px-3 py-1.5 text-sm">
                    <option value="">Tat ca chuong</option>
                    <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
                <select v-model="timeRange" @change="loadChartData();" class="border rounded px-3 py-1.5 text-sm">
                    <option value="1">1 gio</option>
                    <option value="6">6 gio</option>
                    <option value="24">24 gio</option>
                    <option value="168">7 ngay</option>
                </select>
                <button class="btn btn-sm btn-secondary" @click="loadAll">Lam moi</button>
            </div>
        </div>

        <!-- Current Readings Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="card p-4">
                <div class="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <span class="text-lg">🌡️</span> Nhiet do
                </div>
                <div class="text-3xl font-bold" :class="tempClass">
                    {{ currentTemp !== null ? fmtNum(currentTemp, 1) : '--' }}
                    <span class="text-lg font-normal">°C</span>
                </div>
                <div class="text-xs text-gray-400 mt-1">Muc tieu: 28-32°C</div>
            </div>
            <div class="card p-4">
                <div class="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <span class="text-lg">💧</span> Do am
                </div>
                <div class="text-3xl font-bold" :class="humidityClass">
                    {{ currentHumidity !== null ? fmtNum(currentHumidity, 1) : '--' }}
                    <span class="text-lg font-normal">%</span>
                </div>
                <div class="text-xs text-gray-400 mt-1">Muc tieu: 60-75%</div>
            </div>
            <div class="card p-4">
                <div class="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <span class="text-lg">🧪</span> NH3
                </div>
                <div class="text-3xl font-bold" :class="nh3Class">
                    {{ currentNh3 !== null ? fmtNum(currentNh3, 1) : '--' }}
                    <span class="text-lg font-normal">ppm</span>
                </div>
                <div class="text-xs text-gray-400 mt-1">Muc tieu: &lt;25 ppm</div>
            </div>
            <div class="card p-4">
                <div class="flex items-center gap-2 text-gray-500 text-sm mb-1">
                    <span class="text-lg">💨</span> H2S
                </div>
                <div class="text-3xl font-bold" :class="h2sClass">
                    {{ currentH2S !== null ? fmtNum(currentH2S, 1) : '--' }}
                    <span class="text-lg font-normal">ppm</span>
                </div>
                <div class="text-xs text-gray-400 mt-1">Muc tieu: &lt;5 ppm</div>
            </div>
        </div>

        <!-- Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <!-- Temperature Chart -->
            <div class="card p-4">
                <h3 class="font-semibold mb-3 flex items-center gap-2">
                    <span class="text-red-500">●</span> Nhiet do (°C)
                </h3>
                <div class="chart-container" style="position: relative; height: 250px;">
                    <canvas ref="tempChart"></canvas>
                </div>
            </div>
            <!-- Humidity Chart -->
            <div class="card p-4">
                <h3 class="font-semibold mb-3 flex items-center gap-2">
                    <span class="text-blue-500">●</span> Do am (%)
                </h3>
                <div class="chart-container" style="position: relative; height: 250px;">
                    <canvas ref="humidityChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Gas Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <!-- NH3 Chart -->
            <div class="card p-4">
                <h3 class="font-semibold mb-3 flex items-center gap-2">
                    <span class="text-yellow-500">●</span> NH3 - Khí amoniac (ppm)
                </h3>
                <div class="chart-container" style="position: relative; height: 250px;">
                    <canvas ref="nh3Chart"></canvas>
                </div>
            </div>
            <!-- H2S Chart -->
            <div class="card p-4">
                <h3 class="font-semibold mb-3 flex items-center gap-2">
                    <span class="text-purple-500">●</span> H2S - Khí hydro sulfua (ppm)
                </h3>
                <div class="chart-container" style="position: relative; height: 250px;">
                    <canvas ref="h2sChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Device Status Table -->
        <div class="card p-4">
            <h3 class="font-semibold mb-3">Trang thai cam bien</h3>
            <div v-if="devices.length" class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Trang thai</th>
                            <th>Thiet bi</th>
                            <th>Chuong</th>
                            <th>Cam bien</th>
                            <th>Gia tri cuoi</th>
                            <th>Thoi gian</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="s in latestReadings" :key="s.device_id + '-' + s.sensor_type">
                            <td>
                                <span class="online-dot" :class="isRecent(s.time) ? 'on' : 'off'"></span>
                                {{ isRecent(s.time) ? 'Online' : 'Offline' }}
                            </td>
                            <td class="font-medium">{{ s.device_name }}</td>
                            <td>{{ s.barn_id || '-' }}</td>
                            <td>{{ sensorLabel(s.sensor_type) }}</td>
                            <td>
                                <span class="font-mono">{{ fmtNum(s.value, 1) }} {{ s.unit }}</span>
                            </td>
                            <td class="text-gray-500 text-sm">{{ timeAgo(s.time) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="text-center py-8 text-gray-500">
                Khong co du lieu cam bien
            </div>
        </div>
    </div>`,

    setup() {
        const barns = ref([]);
        const devices = ref([]);
        const latestReadings = ref([]);
        const selectedBarn = ref('');
        const timeRange = ref('24');
        const currentTemp = ref(null);
        const currentHumidity = ref(null);
        const currentNh3 = ref(null);
        const currentH2S = ref(null);

        // Chart refs
        const tempChart = ref(null);
        const humidityChart = ref(null);
        const nh3Chart = ref(null);
        const h2sChart = ref(null);

        // Chart instances
        let tempChartInstance = null;
        let humidityChartInstance = null;
        let nh3ChartInstance = null;
        let h2sChartInstance = null;

        // Color schemes
        const tempColor = '#ef4444';
        const humidityColor = '#3b82f6';
        const nh3Color = '#eab308';
        const h2sColor = '#a855f7';

        const sensorLabel = (type) => {
            const labels = {
                temperature: 'Nhiet do',
                humidity: 'Do am',
                nh3: 'NH3',
                h2s: 'H2S',
                nh4: 'NH4',
                co2: 'CO2',
                light: 'Anh sang',
            };
            return labels[type] || type;
        };

        const isRecent = (time) => {
            if (!time) return false;
            const diff = Date.now() - new Date(time).getTime();
            return diff < 300000; // 5 minutes
        };

        const timeAgo = (time) => {
            if (!time) return '-';
            const diff = Date.now() - new Date(time).getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return 'Vua xong';
            if (mins < 60) return `${mins} phut truoc`;
            const hours = Math.floor(mins / 60);
            if (hours < 24) return `${hours} gio truoc`;
            return `${Math.floor(hours / 24)} ngay truoc`;
        };

        const tempClass = computed(() => {
            if (currentTemp.value === null) return '';
            if (currentTemp.value < 28 || currentTemp.value > 32) return 'text-red-500';
            return 'text-green-500';
        });

        const humidityClass = computed(() => {
            if (currentHumidity.value === null) return '';
            if (currentHumidity.value < 60 || currentHumidity.value > 75) return 'text-red-500';
            return 'text-green-500';
        });

        const nh3Class = computed(() => {
            if (currentNh3.value === null) return '';
            if (currentNh3.value > 25) return 'text-red-500';
            if (currentNh3.value > 15) return 'text-yellow-500';
            return 'text-green-500';
        });

        const h2sClass = computed(() => {
            if (currentH2S.value === null) return '';
            if (currentH2S.value > 5) return 'text-red-500';
            if (currentH2S.value > 2) return 'text-yellow-500';
            return 'text-green-500';
        });

        async function loadBarns() {
            try {
                barns.value = await API.barns.list();
            } catch { barns.value = []; }
        }

        async function loadDevices() {
            try {
                devices.value = await API.devices.list();
            } catch { devices.value = []; }
        }

        async function loadLatestReadings() {
            try {
                const params = selectedBarn.value ? `?barn_id=${selectedBarn.value}` : '';
                latestReadings.value = await API.sensors.latest(params);
                updateCurrentValues();
            } catch {
                latestReadings.value = [];
            }
        }

        function updateCurrentValues() {
            currentTemp.value = null;
            currentHumidity.value = null;
            currentNh3.value = null;
            currentH2S.value = null;

            latestReadings.value.forEach(s => {
                if (s.sensor_type === 'temperature') currentTemp.value = s.value;
                if (s.sensor_type === 'humidity') currentHumidity.value = s.value;
                if (s.sensor_type === 'nh3') currentNh3.value = s.value;
                if (s.sensor_type === 'h2s') currentH2S.value = s.value;
            });
        }

        async function loadChartData() {
            if (!devices.value.length) return;

            const hours = parseInt(timeRange.value);

            // Get hourly aggregates for each sensor type
            for (const device of devices.value) {
                if (selectedBarn.value && device.barn_id !== selectedBarn.value) continue;

                for (const type of ['temperature', 'humidity', 'nh3', 'h2s']) {
                    try {
                        const data = await API.sensors.hourly(device.id, type, hours);
                        updateChart(type, data, device.device_name);
                    } catch (e) {
                        console.warn(`Failed to load ${type} for device ${device.id}:`, e);
                    }
                }
            }
        }

        function updateChart(type, data, deviceName) {
            if (!data || !data.length) return;

            const chartRef = type === 'temperature' ? tempChart
                : type === 'humidity' ? humidityChart
                : type === 'nh3' ? nh3Chart
                : h2sChart;

            const color = type === 'temperature' ? tempColor
                : type === 'humidity' ? humidityColor
                : type === 'nh3' ? nh3Color
                : h2sColor;

            const labels = data.map(d => {
                const date = new Date(d.time);
                return timeRange.value <= '24'
                    ? date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                    : date.toLocaleDateString('vi-VN', { month: 'short', day: 'numeric', hour: '2-digit' });
            });

            const values = data.map(d => d.avg_value);

            // Update or create chart
            let chartInstance;
            if (type === 'temperature') {
                chartInstance = tempChartInstance;
            } else if (type === 'humidity') {
                chartInstance = humidityChartInstance;
            } else if (type === 'nh3') {
                chartInstance = nh3ChartInstance;
            } else {
                chartInstance = h2sChartInstance;
            }

            if (chartInstance) {
                chartInstance.data.labels = labels;
                chartInstance.data.datasets[0].data = values;
                chartInstance.data.datasets[0].label = deviceName;
                chartInstance.update('none');
            } else {
                const ctx = type === 'temperature' ? tempChart.value
                    : type === 'humidity' ? humidityChart.value
                    : type === 'nh3' ? nh3Chart.value
                    : h2sChart.value;

                if (!ctx) return;

                chartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: deviceName,
                            data: values,
                            borderColor: color,
                            backgroundColor: color + '20',
                            fill: true,
                            tension: 0.3,
                            pointRadius: 2,
                            borderWidth: 2,
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top',
                                labels: { color: '#9ca3af', boxWidth: 12, font: { size: 11 } }
                            }
                        },
                        scales: {
                            x: {
                                grid: { color: '#374151' },
                                ticks: { color: '#9ca3af', maxTicksLimit: 8, font: { size: 10 } }
                            },
                            y: {
                                grid: { color: '#374151' },
                                ticks: { color: '#9ca3af', font: { size: 10 } }
                            }
                        }
                    }
                });

                if (type === 'temperature') tempChartInstance = chartInstance;
                else if (type === 'humidity') humidityChartInstance = chartInstance;
                else if (type === 'nh3') nh3ChartInstance = chartInstance;
                else h2sChartInstance = chartInstance;
            }
        }

        async function loadBarnData() {
            await loadLatestReadings();
            await loadChartData();
        }

        async function loadAll() {
            await loadBarns();
            await loadDevices();
            await loadLatestReadings();
            await loadChartData();
        }

        function destroyCharts() {
            if (tempChartInstance) { tempChartInstance.destroy(); tempChartInstance = null; }
            if (humidityChartInstance) { humidityChartInstance.destroy(); humidityChartInstance = null; }
            if (nh3ChartInstance) { nh3ChartInstance.destroy(); nh3ChartInstance = null; }
            if (h2sChartInstance) { h2sChartInstance.destroy(); h2sChartInstance = null; }
        }

        onMounted(loadAll);

        // Auto-refresh every 30 seconds
        let refreshInterval = setInterval(loadLatestReadings, 30000);

        onUnmounted(() => {
            clearInterval(refreshInterval);
            destroyCharts();
        });

        return {
            barns, devices, latestReadings, selectedBarn, timeRange,
            currentTemp, currentHumidity, currentNh3, currentH2S,
            tempChart, humidityChart, nh3Chart, h2sChart,
            tempClass, humidityClass, nh3Class, h2sClass,
            sensorLabel, isRecent, timeAgo,
            loadAll, loadBarnData,
            fmtNum
        };
    }
};

return component;
