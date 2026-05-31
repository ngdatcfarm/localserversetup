/**
 * Sensors Page - Giam sat Moi truong IoT (Custom Bento CSS)
 * Du lieu thuc te tu API: /api/devices, /api/sensors/latest
 * Bieu do SVG inline, bang trang thai thiet bi
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

        // ── Computed: Latest readings grouped by device ──
        const latestByDevice = computed(() => {
            const grouped = {};
            latestReadings.value.forEach(r => {
                if (!grouped[r.device_id]) {
                    grouped[r.device_id] = {
                        device_id: r.device_id,
                        device_name: r.device_name || ('Thiet bi ' + r.device_id),
                        barn_id: r.barn_id,
                        readings: {},
                        last_time: null
                    };
                }
                grouped[r.device_id].readings[r.sensor_type] = r;
                if (!grouped[r.device_id].last_time || new Date(r.time) > new Date(grouped[r.device_id].last_time)) {
                    grouped[r.device_id].last_time = r.time;
                }
            });
            return Object.values(grouped);
        });

        // ── Metrics cards ──────────────────────────────
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
                {
                    type: 'temp', label: 'Nhiet do', icon: '🌡️',
                    value: avgTemp, unit: '°C',
                    min: '18.0', max: '34.5',
                    statusLabel: avgTemp > 35 ? 'Nong gay gat' : avgTemp < 16 ? 'Qua lanh' : 'Binh thuong',
                    statusClass: avgTemp > 35 ? 's-metric-badge-danger' : avgTemp < 16 ? 's-metric-badge-warn' : 's-metric-badge-safe',
                    color: '#f43f5e',
                    sparklinePath: buildSparkPath(temps.map(r => ({ time: r.time, value: r.value })))
                },
                {
                    type: 'humid', label: 'Do am', icon: '💧',
                    value: avgHumid, unit: '%',
                    min: '45.0', max: '85.0',
                    statusLabel: avgHumid > 85 ? 'Qua am' : avgHumid < 40 ? 'Hanh kho' : 'An sinh tot',
                    statusClass: avgHumid > 85 || avgHumid < 40 ? 's-metric-badge-warn' : 's-metric-badge-safe',
                    color: '#0ea5e9',
                    sparklinePath: buildSparkPath(humids.map(r => ({ time: r.time, value: r.value })))
                },
                {
                    type: 'mq135', label: 'MQ135 (Amoniac)', icon: '🧪',
                    value: avgMq135, unit: 'ADC',
                    min: '0', max: '2000',
                    statusLabel: avgMq135 > 1500 ? 'Nguy kich' : avgMq135 > 1000 ? 'Canh cao' : 'An toan',
                    statusClass: avgMq135 > 1500 ? 's-metric-badge-danger' : avgMq135 > 1000 ? 's-metric-badge-warn' : 's-metric-badge-safe',
                    color: '#f59e0b',
                    sparklinePath: buildSparkPath(mq135.map(r => ({ time: r.time, value: r.value })))
                },
                {
                    type: 'mq137', label: 'MQ137 (Hydro Sunfua)', icon: '💨',
                    value: avgMq137, unit: 'ADC',
                    min: '0', max: '500',
                    statusLabel: avgMq137 > 400 ? 'Qua dinh muc' : 'An toan tuyet doi',
                    statusClass: avgMq137 > 400 ? 's-metric-badge-danger' : 's-metric-badge-safe',
                    color: '#a855f7',
                    sparklinePath: buildSparkPath(mq137.map(r => ({ time: r.time, value: r.value })))
                }
            ];
        });

        // ── Chart data ──────────────────────────────────
        const chartData = computed(() => {
            if (!latestReadings.value.length) return { labels: [], tempData: [], humidData: [], mq135Data: [], mq137Data: [] };

            // Group by hour for the time range
            const hours = parseInt(timeRange.value);
            const now = Date.now();
            const cutoff = now - hours * 3600000;

            const temps = latestReadings.value.filter(r => r.sensor_type === 'temperature' && new Date(r.time).getTime() > cutoff);
            const humids = latestReadings.value.filter(r => r.sensor_type === 'humidity' && new Date(r.time).getTime() > cutoff);
            const mq135 = latestReadings.value.filter(r => r.sensor_type === 'mq135_raw' && new Date(r.time).getTime() > cutoff);
            const mq137 = latestReadings.value.filter(r => r.sensor_type === 'mq137_raw' && new Date(r.time).getTime() > cutoff);

            // Simple time labels
            const sortedTimes = [...new Set([...temps, ...humids, ...mq135, ...mq137].map(r => r.time))].sort();
            const labels = sortedTimes.map(t => {
                const d = new Date(t);
                return timeRange.value <= '24'
                    ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                    : d.toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' });
            });

            const avgByTime = (arr, time) => {
                const group = arr.filter(r => r.time === time);
                return group.length ? group.reduce((s, r) => s + r.value, 0) / group.length : null;
            };

            return {
                labels,
                tempData: sortedTimes.map(t => avgByTime(temps, t)),
                humidData: sortedTimes.map(t => avgByTime(humids, t)),
                mq135Data: sortedTimes.map(t => avgByTime(mq135, t)),
                mq137Data: sortedTimes.map(t => avgByTime(mq137, t))
            };
        });

        const tempSvgPath = computed(() => buildSvgPath(chartData.value.tempData));
        const humidSvgPath = computed(() => buildSvgPath(chartData.value.humidData));
        const mq135SvgPath = computed(() => buildSvgPath(chartData.value.mq135Data));
        const mq137SvgPath = computed(() => buildSvgPath(chartData.value.mq137Data));

        const chartPoints = computed(() => {
            return chartData.value.labels.map((time, idx) => ({
                time,
                xPercent: 10 + (idx / Math.max(chartData.value.labels.length - 1, 1)) * 85
            }));
        });

        // ── Device table ────────────────────────────────
        const sensorDevices = computed(() => {
            return devices.value.filter(d => d.type_code === 'sensor' || d.device_type_id === 3);
        });

        function getDeviceReadings(deviceId) {
            const readings = {};
            latestReadings.value
                .filter(r => r.device_id === deviceId)
                .forEach(r => { readings[r.sensor_type] = r; });
            return readings;
        }

        function isRecent(time) {
            if (!time) return false;
            return Date.now() - new Date(time).getTime() < 300000; // 5 min
        }

        function signalBars(rssi) {
            if (!rssi) return [false, false, false, false];
            return [
                rssi > -80,
                rssi > -65,
                rssi > -50,
                rssi > -40
            ];
        }

        // ── Helpers ─────────────────────────────────────
        function buildSparkPath(data) {
            if (!data || data.length < 2) return 'M 0 10 L 100 10';
            const vals = data.map(d => d.value);
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const spread = max - min || 1;
            return data.map((d, i) => {
                const x = (i / (data.length - 1)) * 100;
                const y = 18 - ((d.value - min) / spread) * 16;
                return (i === 0 ? 'M' : 'L') + ' ' + x.toFixed(1) + ' ' + y.toFixed(1);
            }).join(' ');
        }

        function buildSvgPath(values) {
            if (!values || values.length < 2) return '';
            const valid = values.map((v, i) => ({ v, i })).filter(x => x.v !== null);
            if (valid.length < 2) return '';
            const min = Math.min(...valid.map(x => x.v));
            const max = Math.max(...valid.map(x => x.v));
            const spread = max - min || 1;
            return valid.map((x, idx) => {
                const pct = x.i / (values.length - 1);
                const px = 10 + pct * 85;
                const py = 140 - ((x.v - min) / spread) * 110;
                return (idx === 0 ? 'M' : 'L') + ' ' + px.toFixed(1) + '% ' + py.toFixed(1);
            }).join(' ');
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
            // Visual simulation only - no real data change
        }

        // ── Lifecycle ────────────────────────────────────
        onMounted(() => {
            loadAll();
            intervalId = setInterval(loadReadings, 30000); // refresh every 30s
        });

        onUnmounted(() => {
            if (intervalId) clearInterval(intervalId);
        });

        // ── Return ──────────────────────────────────────
        return {
            selectedBarn, timeRange, currentSim,
            barns, devices, latestReadings, latestByDevice,
            metrics, chartData,
            tempSvgPath, humidSvgPath, mq135SvgPath, mq137SvgPath,
            chartPoints, sensorDevices,
            getDeviceReadings, isRecent, signalBars,
            handleFilterChange, refreshReadings, triggerSim, loadAll
        };
    },

    template: `
    <div class="sensors-scope s-space-y-6">
        <style>
.sensors-scope {
  --c-teal-50: #f0fdfa;
  --c-teal-100: #ccfbf1;
  --c-teal-500: #14b8a6;
  --c-teal-600: #0d9488;
  --c-teal-700: #0f766e;

  --c-sky-50: #f0f9ff;
  --c-sky-100: #e0f2fe;
  --c-sky-500: #0ea5e9;
  --c-sky-600: #0284c7;
  --c-sky-700: #0369a1;

  --c-amber-50: #fffbeb;
  --c-amber-100: #fef3c7;
  --c-amber-500: #f59e0b;
  --c-amber-600: #d97706;
  --c-amber-700: #b45309;

  --c-rose-50: #fff1f2;
  --c-rose-100: #ffe4e6;
  --c-rose-500: #f43f5e;
  --c-rose-600: #e11d48;
  --c-rose-700: #be123c;

  --c-slate-50: #f8fafc;
  --c-slate-100: #f1f5f9;
  --c-slate-200: #e2e8f0;
  --c-slate-300: #cbd5e1;
  --c-slate-450: #64748b;
  --c-slate-650: #475569;
  --c-slate-800: #1e293b;
  --c-slate-900: #0f172a;

  font-family: "Segoe UI", Inter, system-ui, -apple-system, sans-serif;
  color: var(--c-slate-800);
}

.sensors-scope * { box-sizing: border-box; }

.s-space-y-6 > * + * { margin-top: 1.5rem; }

.s-header-panel {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 1rem;
  background-color: #ffffff;
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid var(--c-slate-100);
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

@media (min-width: 640px) {
  .s-header-panel { flex-direction: row; align-items: center; }
}

.s-header-left { display: flex; align-items: center; gap: 0.875rem; }

.s-header-icon {
  width: 3rem; height: 3rem; border-radius: 10px;
  background-color: var(--c-teal-600);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 10px rgba(13, 148, 136, 0.2);
  flex-shrink: 0;
  color: white; font-size: 1.4rem;
}

.s-title-group h1 {
  margin: 0; font-size: 1.25rem; font-weight: 800;
  color: var(--c-slate-900); letter-spacing: -0.02em;
}

.s-title-group p {
  margin: 0.25rem 0 0 0; font-size: 0.75rem;
  color: var(--c-slate-450); font-weight: 500;
}

.s-control-bar { display: flex; align-items: center; gap: 0.5rem; }

.s-select {
  padding: 0.45rem 1rem; border-radius: 10px;
  border: 1px solid var(--c-slate-200); background-color: #ffffff;
  font-size: 0.8rem; font-weight: 600; color: var(--c-slate-800);
  cursor: pointer; outline: none; transition: all 0.2s;
}

.s-select:hover { border-color: var(--c-slate-350); }

.s-btn-refresh {
  width: 2.2rem; height: 2.2rem;
  display: flex; align-items: center; justify-content: center;
  background-color: var(--c-slate-100); border: 1px solid var(--c-slate-200);
  border-radius: 10px; color: var(--c-slate-650); cursor: pointer; transition: all 0.2s;
}

.s-btn-refresh:hover { background-color: var(--c-slate-200); color: var(--c-slate-900); }

.s-metrics-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

@media (min-width: 640px) {
  .s-metrics-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (min-width: 1024px) {
  .s-metrics-grid { grid-template-columns: repeat(4, 1fr); }
}

.s-metric-card {
  background-color: #ffffff;
  border: 1px solid var(--c-slate-100);
  border-radius: 14px; padding: 1.15rem;
  position: relative; overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.03);
  display: flex; flex-direction: column; justify-content: space-between;
  transition: transform 0.2s, box-shadow 0.2s;
}

.s-metric-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.06); }

.s-metric-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;
}

.s-metric-title { font-size: 0.725rem; font-weight: 700; text-transform: uppercase; color: var(--c-slate-450); letter-spacing: 0.05em; }

.s-metric-badge {
  font-size: 0.625rem; font-weight: 800;
  padding: 0.15rem 0.5rem; border-radius: 99px; text-transform: uppercase;
}

.s-metric-badge-safe { background-color: var(--c-teal-50); color: var(--c-teal-700); border: 1px solid var(--c-teal-100); }
.s-metric-badge-warn { background-color: var(--c-amber-50); color: var(--c-amber-700); border: 1px solid var(--c-amber-100); }
.s-metric-badge-danger { background-color: var(--c-rose-50); color: var(--c-rose-700); border: 1px solid var(--c-rose-100); }

.s-metric-value-wrap { display: flex; align-items: baseline; gap: 0.25rem; }

.s-metric-value { font-size: 1.85rem; font-weight: 800; color: var(--c-slate-900); letter-spacing: -0.03em; }
.s-metric-unit { font-size: 0.85rem; font-weight: 700; color: var(--c-slate-450); }

.s-metric-bounds {
  font-size: 0.65rem; font-weight: 600; color: var(--c-slate-440);
  margin-top: 0.35rem; display: flex; justify-content: space-between;
}

.s-charts-container { display: grid; grid-template-columns: 1fr; gap: 1.25rem; }

@media (min-width: 1024px) {
  .s-charts-container { grid-template-columns: repeat(2, 1fr); }
}

.s-chart-box {
  background-color: #ffffff; border: 1px solid var(--c-slate-100);
  border-radius: 14px; padding: 1.25rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.03);
  display: flex; flex-direction: column;
}

.s-chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }

.s-chart-title {
  font-size: 0.825rem; font-weight: 800; color: var(--c-slate-900);
  display: flex; align-items: center; gap: 0.5rem;
}

.s-chart-legend { display: flex; gap: 0.75rem; font-size: 0.65rem; font-weight: 700; color: var(--c-slate-450); }

.s-legend-item { display: flex; align-items: center; gap: 0.25rem; }

.s-legend-dot { width: 6px; height: 6px; border-radius: 50px; }

.s-svg-chart {
  width: 100%; height: 180px;
  background-color: #fafbfc;
  border-radius: 8px; border: 1px solid #f1f5f9;
  overflow: visible; padding: 10px 0px;
}

.s-chart-axis-label { font-family: inherit; font-size: 8px; font-weight: 700; fill: #94a3b8; }

.s-table-box {
  background-color: #ffffff;
  border: 1px solid var(--c-slate-100);
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.03);
}

.s-table-header {
  padding: 1.15rem 1.5rem;
  border-bottom: 1px solid var(--c-slate-100);
  display: flex; justify-content: space-between; align-items: center;
}

.s-table-heading {
  margin: 0; font-size: 0.825rem; font-weight: 800; color: var(--c-slate-900);
  display: flex; align-items: center; gap: 0.5rem;
}

.s-table-wrap { width: 100%; overflow-x: auto; }

.s-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.75rem; }

.s-table th {
  background-color: var(--c-slate-50);
  color: var(--c-slate-450); font-weight: 800; text-transform: uppercase;
  font-size: 0.625rem; padding: 0.85rem 1.25rem;
  border-bottom: 1px solid var(--c-slate-100); letter-spacing: 0.05em;
}

.s-table td {
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid var(--c-slate-100);
  color: var(--c-slate-800); font-weight: 600;
}

.s-table tr:hover { background-color: var(--c-slate-50); }

.s-dot-active { width: 8px; height: 8px; border-radius: 50px; display: inline-block; background-color: var(--c-teal-500); }

.s-signal-bar { display: inline-flex; align-items: flex-end; gap: 2px; height: 10px; }

.s-sig-block { width: 2.5px; background-color: var(--c-slate-200); border-radius: 0.5px; }

.s-sig-block-active { background-color: var(--c-teal-500); }

.s-simulator-panel {
  background-color: #f8fafc;
  border: 1px dashed var(--c-slate-300);
  border-radius: 12px; padding: 1.25rem;
}

.s-sim-header {
  font-size: 0.8rem; font-weight: 800; text-transform: uppercase;
  color: var(--c-slate-650); margin-bottom: 0.85rem;
  letter-spacing: 0.03em; display: flex; align-items: center; gap: 0.5rem;
}

.s-sim-flex { display: flex; flex-wrap: wrap; gap: 0.75rem; }

.s-btn-sim {
  background-color: #ffffff; border: 1px solid var(--c-slate-200);
  padding: 0.45rem 1rem; font-size: 0.725rem; font-weight: 700;
  border-radius: 8px; color: var(--c-slate-800); cursor: pointer;
  transition: all 0.2s; display: flex; align-items: center; gap: 0.35rem;
}

.s-btn-sim:hover { border-color: var(--c-slate-300); background-color: var(--c-slate-50); }

.s-btn-sim-active { background-color: var(--c-sky-50); border-color: var(--c-sky-500); color: var(--c-sky-700); }

.s-btn-sim-danger { background-color: var(--c-rose-50); border-color: var(--c-rose-500); color: var(--c-rose-700); }
        </style>

        <!-- 1. HEADER -->
        <div class="s-header-panel">
            <div class="s-header-left">
                <div class="s-header-icon">🌡️</div>
                <div class="s-title-group">
                    <h1>Tram Giam sat Moi truong (IoT Sensors)</h1>
                    <p>Theo doi nhiet do, do am, MQ135/MQ137 tu cac cam bien IoT trong chuong nuoi.</p>
                </div>
            </div>
            <div class="s-control-bar">
                <select class="s-select" v-model="selectedBarn" @change="handleFilterChange">
                    <option value="">Tat ca chuong</option>
                    <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
                <select class="s-select" v-model="timeRange" @change="handleFilterChange">
                    <option value="1">1 gio</option>
                    <option value="6">6 gio</option>
                    <option value="24">24 gio</option>
                    <option value="168">7 ngay</option>
                </select>
                <button class="s-btn-refresh" @click="refreshReadings" title="Lam moi du lieu">
                    🔄
                </button>
            </div>
        </div>

        <!-- 2. METRICS CARDS -->
        <div class="s-metrics-grid">
            <div v-for="m in metrics" :key="m.type" class="s-metric-card">
                <div class="s-metric-header">
                    <span class="s-metric-title">{{ m.icon }} {{ m.label }}</span>
                    <span class="s-metric-badge" :class="m.statusClass">{{ m.statusLabel }}</span>
                </div>
                <div class="s-metric-value-wrap">
                    <span class="s-metric-value">{{ m.value !== null ? m.value.toFixed(1) : '--' }}</span>
                    <span class="s-metric-unit">{{ m.unit }}</span>
                </div>
                <svg viewBox="0 0 100 20" style="height: 24px; width: 100%; margin-top: 5px; fill: none;">
                    <path :d="m.sparklinePath" :stroke="m.color" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                <div class="s-metric-bounds">
                    <span>Min: {{ m.min }}</span>
                    <span>Max: {{ m.max }}</span>
                </div>
            </div>
        </div>

        <!-- 3. CHARTS -->
        <div class="s-charts-container">
            <div class="s-chart-box">
                <div class="s-chart-header">
                    <span class="s-chart-title">🌡️ Nhiet do & Do am</span>
                    <div class="s-chart-legend">
                        <div class="s-legend-item">
                            <span class="s-legend-dot" style="background-color: var(--c-rose-500);"></span>
                            <span>Nhiet do (°C)</span>
                        </div>
                        <div class="s-legend-item">
                            <span class="s-legend-dot" style="background-color: var(--c-sky-500);"></span>
                            <span>Do am (%)</span>
                        </div>
                    </div>
                </div>
                <svg class="s-svg-chart">
                    <line x1="10%" y1="20%" x2="95%" y2="20%" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="3,3"/>
                    <line x1="10%" y1="50%" x2="95%" y2="50%" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="3,3"/>
                    <line x1="10%" y1="80%" x2="95%" y2="80%" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="3,3"/>
                    <text x="3%" y="23%" class="s-chart-axis-label">Cuc dai</text>
                    <text x="3%" y="53%" class="s-chart-axis-label">Trung vi</text>
                    <text x="3%" y="83%" class="s-chart-axis-label">Cuc tieu</text>
                    <path :d="tempSvgPath" fill="none" stroke="var(--c-rose-500)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path :d="humidSvgPath" fill="none" stroke="var(--c-sky-500)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <text v-for="(point, idx) in chartPoints" :key="'lbl'+idx" :x="point.xPercent + '%'" y="93%" class="s-chart-axis-label" text-anchor="middle">{{ point.time }}</text>
                </svg>
            </div>

            <div class="s-chart-box">
                <div class="s-chart-header">
                    <span class="s-chart-title">🧪 MQ135 / MQ137 Gas Sensors</span>
                    <div class="s-chart-legend">
                        <div class="s-legend-item">
                            <span class="s-legend-dot" style="background-color: var(--c-amber-500);"></span>
                            <span>MQ135 ADC</span>
                        </div>
                        <div class="s-legend-item">
                            <span class="s-legend-dot" style="background-color: var(--c-teal-500);"></span>
                            <span>MQ137 ADC</span>
                        </div>
                    </div>
                </div>
                <svg class="s-svg-chart">
                    <line x1="10%" y1="20%" x2="95%" y2="20%" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="3,3"/>
                    <line x1="10%" y1="50%" x2="95%" y2="50%" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="3,3"/>
                    <line x1="10%" y1="80%" x2="95%" y2="80%" stroke="#e2e8f0" stroke-width="0.8" stroke-dasharray="3,3"/>
                    <text x="3%" y="23%" class="s-chart-axis-label">Cao</text>
                    <text x="3%" y="53%" class="s-chart-axis-label">Trung binh</text>
                    <text x="3%" y="83%" class="s-chart-axis-label">Thap</text>
                    <path :d="mq135SvgPath" fill="none" stroke="var(--c-amber-600)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path :d="mq137SvgPath" fill="none" stroke="var(--c-teal-600)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <text v-for="(point, idx) in chartPoints" :key="'glbl'+idx" :x="point.xPercent + '%'" y="93%" class="s-chart-axis-label" text-anchor="middle">{{ point.time }}</text>
                </svg>
            </div>
        </div>

        <!-- 4. DEVICE TABLE -->
        <div class="s-table-box">
            <div class="s-table-header">
                <h3 class="s-table-heading">📡 Cam bien IoT Hoat dong ({{ sensorDevices.length }})</h3>
                <span style="font-family: monospace; font-size: 0.65rem; color: var(--c-slate-450); font-weight: bold;">
                    {{ latestReadings.length }} ghi doc
                </span>
            </div>
            <div class="s-table-wrap">
                <table class="s-table">
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
                                <span class="s-dot-active" :style="device.is_online ? '' : 'background-color: var(--c-slate-300);'"></span>
                                <span style="font-size: 0.70rem; font-weight: 700; margin-left: 0.35rem;" :style="device.is_online ? 'color: var(--c-teal-700);' : 'color: var(--c-slate-450);'">
                                    {{ device.is_online ? 'Online' : 'Offline' }}
                                </span>
                            </td>
                            <td style="font-family: monospace; font-weight: bold; color: var(--c-teal-700);">
                                {{ device.device_code || device.name }}
                            </td>
                            <td>{{ device.barn_id || '-' }}</td>
                            <td :style="(getDeviceReadings(device.id).temperature?.value || 0) > 35 ? 'color: var(--c-rose-600); font-weight: bold;' : ''">
                                {{ getDeviceReadings(device.id).temperature?.value?.toFixed(1) || '-' }} °C
                            </td>
                            <td :style="(getDeviceReadings(device.id).humidity?.value || 0) > 85 ? 'color: var(--c-amber-600); font-weight: bold;' : ''">
                                {{ getDeviceReadings(device.id).humidity?.value?.toFixed(1) || '-' }} %
                            </td>
                            <td :style="(getDeviceReadings(device.id).mq135_raw?.value || 0) > 1500 ? 'color: var(--c-rose-600); font-weight: bold;' : ''">
                                {{ getDeviceReadings(device.id).mq135_raw?.value?.toFixed(0) || '-' }}
                            </td>
                            <td :style="(getDeviceReadings(device.id).mq137_raw?.value || 0) > 400 ? 'color: var(--c-rose-600); font-weight: bold;' : ''">
                                {{ getDeviceReadings(device.id).mq137_raw?.value?.toFixed(0) || '-' }}
                            </td>
                            <td>
                                <div class="s-signal-bar" :title="device.wifi_rssi + ' dBm'">
                                    <div class="s-sig-block" :class="{'s-sig-block-active': signalBars(device.wifi_rssi)[0]}" style="height: 3px;"></div>
                                    <div class="s-sig-block" :class="{'s-sig-block-active': signalBars(device.wifi_rssi)[1]}" style="height: 5px;"></div>
                                    <div class="s-sig-block" :class="{'s-sig-block-active': signalBars(device.wifi_rssi)[2]}" style="height: 8px;"></div>
                                    <div class="s-sig-block" :class="{'s-sig-block-active': signalBars(device.wifi_rssi)[3]}" style="height: 11px;"></div>
                                </div>
                            </td>
                            <td style="font-size: 0.70rem; color: var(--c-slate-450);">
                                {{ device.last_heartbeat_at ? new Date(device.last_heartbeat_at).toLocaleTimeString('vi-VN') : '-' }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 5. SIMULATION PANEL -->
        <div class="s-simulator-panel">
            <h4 class="s-sim-header">⚙️ Phong thi nghiem & Gia lap bien dong moi truong</h4>
            <div class="s-sim-flex">
                <button class="s-btn-sim" :class="{'s-btn-sim-active': currentSim === 'normal'}" @click="triggerSim('normal')">
                    ☀️ Che do Bin thuong
                </button>
                <button class="s-btn-sim" :class="{'s-btn-sim-active s-btn-sim-danger': currentSim === 'heatwave'}" @click="triggerSim('heatwave')">
                    🔥 Gia lap Nang nong cuc doan
                </button>
                <button class="s-btn-sim" :class="{'s-btn-sim-active s-btn-sim-danger': currentSim === 'biogas'}" @click="triggerSim('biogas')">
                    ☣️ Thu nghiem ro ri Biogas
                </button>
                <button class="s-btn-sim" :class="{'s-btn-sim-active': currentSim === 'rainstorm'}" @click="triggerSim('rainstorm')">
                    🌧️ Gia lap Mu dông doc am cao
                </button>
            </div>
        </div>
    </div>
    `
};