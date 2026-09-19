/**
 * Brooder Dashboard — Master-Edge PID heating for free-range chickens.
 *
 * Layout (per docs/ui_style_guide.md §4.2 Dashboard + KPI Grid):
 *   - Header bar: title + status pill (connected / stale / failsafe)
 *   - 3 KPI cards per node: Nhiệt tối thiểu (min of 2 SHT40), Setpoint hiệu lực,
 *     Công suất lưới (last PID output %)
 *   - Inline SVG chart: 24h temp + setpoint + power (3 y-axes)
 *   - Manual override panel:
 *       - On/Off toggle (true = PID follows user slider; false = day-age auto)
 *       - Slider (20.0 → 36.0 °C) — only active when toggle is on
 *       - Note field (free-text audit)
 *       - Save / Clear buttons
 *   - Setpoint audit log (last 10 changes)
 *
 * Data refresh:
 *   - /api/brooder/nodes     → every 5 s (cheap, in-memory overlay)
 *   - /api/brooder/nodes/X/telemetry → once on mount + manual refresh
 *   - Auto-refresh polling stops when component unmounts.
 *
 * Conventions:
 *   - fmtNum() / fmtDate() are global in app.js — don't redefine
 *   - showToast() is global — never use alert/confirm
 *   - Skeleton first load → spinner refresh
 *   - Vietnamese locale / labels
 */

const { ref, reactive, computed, onMounted, onUnmounted, watch } = Vue;


export default {
    setup() {
        // ── State ─────────────────────────────────────────────
        const nodes = ref([]);                 // list of {device_code, online, ...}
        const selectedCode = ref(null);        // currently focused node
        const telemetry = ref({ temp: [], power: [] });
        const loading = ref(true);
        const refreshing = ref(false);
        const lastUpdated = ref(null);

        // Manual override form state
        const manualEnabled = ref(false);      // toggle on/off
        const manualTemp = ref(30.0);          // slider value (°C)
        const manualNote = ref('');
        const submittingOverride = ref(false);
        const overrideHistory = ref([]);

        // Tier-2 fallback delta — admin-tuned heater/zone bias. Positive value
        // means SHT40 on brooder reads hotter than chick-zone; firmware subtracts
        // it to estimate chick-zone. See Tier-2 card sub-text for full convention.
        const fallbackDelta   = ref(0.0);
        const savingDelta     = ref(false);

        const TEMP_MIN = 18.0;
        const TEMP_MAX = 36.0;
        const DELTA_MIN = -5.0;
        const DELTA_MAX =  5.0;

        // ── Polling ───────────────────────────────────────────
        let pollTimer = null;
        async function pollNodes() {
            try {
                const r = await API.brooder.list();
                nodes.value = r.nodes || [];
                lastUpdated.value = new Date();
                // Auto-select first node if none chosen yet
                if (!selectedCode.value && nodes.value.length) {
                    selectNode(nodes.value[0].device_code);
                }
            } catch (e) {
                console.warn('brooder poll error:', e);
            }
        }
        function startPolling() {
            stopPolling();
            pollTimer = setInterval(pollNodes, 5000);
        }
        function stopPolling() {
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        }

        // ── Selection / drill-down ────────────────────────────
        async function selectNode(code) {
            selectedCode.value = code;
            await loadTelemetry(code);
            await loadOverrideHistory(code);
            await loadZoneSensors(code);
            // Pre-load candidate sensors for the "Sensor có thể gắn thêm" panel.
            // Only run when this node actually has a barn assigned; otherwise
            // the endpoint would return sensors from every barn (barn_id=null).
            const bid = currentNode.value?.cycle_barn_id || null;
            if (bid) await loadCandidates(bid);
            syncManualFormToNode();
        }
        function syncManualFormToNode() {
            const n = currentNode.value;
            if (!n) return;
            manualEnabled.value = n.manual_setpoint != null;
            manualTemp.value = n.manual_setpoint ?? n.setpoint ?? 30.0;
            manualNote.value = '';
            fallbackDelta.value = n.fallback_delta_c ?? 0.0;
        }

        async function loadTelemetry(code) {
            try {
                const [tempRes, powerRes] = await Promise.all([
                    API.brooder.telemetry(code, 24, 'brooder_temp'),
                    API.brooder.telemetry(code, 24, 'brooder_power'),
                ]);
                telemetry.value = {
                    temp:  tempRes.samples  || [],
                    power: powerRes.samples || [],
                };
            } catch (e) {
                console.warn('brooder telemetry load error:', e);
                telemetry.value = { temp: [], power: [] };
            }
        }
        async function loadOverrideHistory(code) {
            try {
                const r = await API.brooder.setpointHistory(code, 10);
                overrideHistory.value = r.history || [];
            } catch (e) {
                console.warn('brooder override history error:', e);
                overrideHistory.value = [];
            }
        }

        async function reloadAll() {
            try {
                refreshing.value = true;
                await pollNodes();
                if (selectedCode.value) {
                    await Promise.all([
                        loadTelemetry(selectedCode.value),
                        loadOverrideHistory(selectedCode.value),
                    ]);
                }
            } finally {
                refreshing.value = false;
            }
        }

        // Zone Sensors section — sits between Manual Override and the chart
        const zoneSensors   = ref([]);
        const zsLoading    = ref(false);
        const zsSaving     = ref(false);
        const zsAddOpen    = ref(false);
        const zsAddBarnId  = ref(null);
        const zsAddSensor  = ref('');
        const zsAddWeight  = ref(1.0);
        const zsAddLabel   = ref('');
        const zsCandidates  = ref([]);
        const zsCandidatesLoading = ref(false);
        const brooderBarnId = computed(() => currentNode.value?.cycle_barn_id || null);
        async function loadZoneSensors(code) {
            try {
                zsLoading.value = true;
                const r = await API.brooder.listZoneSensors(code);
                zoneSensors.value = r.zone_sensors || [];
            } catch (e) {
                console.warn('zone-sensor list error:', e);
                zoneSensors.value = [];
            } finally {
                zsLoading.value = false;
            }
        }
        async function loadCandidates(barnId) {
            try {
                zsCandidatesLoading.value = true;
                const r = await API.brooder.listAvailableSensors(barnId);
                zsCandidates.value = r.sensors || [];
            } catch (e) {
                console.warn('zone-sensor candidates error:', e);
                zsCandidates.value = [];
            } finally {
                zsCandidatesLoading.value = false;
            }
        }
        async function addZoneSensor() {
            if (!zsAddSensor.value) {
                showToast('Chọn sensor trước', 'error');
                return;
            }
            try {
                zsSaving.value = true;
                await API.brooder.addZoneSensor(selectedCode.value, {
                    sensor_device_code: zsAddSensor.value,
                    weight: Number(zsAddWeight.value),
                    label: zsAddLabel.value || null,
                });
                showToast('Đã thêm zone sensor', 'success');
                zsAddOpen.value = false;
                zsAddSensor.value = '';
                zsAddWeight.value = 1.0;
                zsAddLabel.value = '';
                await loadZoneSensors(selectedCode.value);
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                zsSaving.value = false;
            }
        }
        async function removeZoneSensor(sensorCode) {
            try {
                zsSaving.value = true;
                await API.brooder.removeZoneSensor(selectedCode.value, sensorCode);
                showToast('Đã gỡ zone sensor', 'success');
                await loadZoneSensors(selectedCode.value);
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                zsSaving.value = false;
            }
        }
        async function updateZoneSensorWeight(sensorCode, weight) {
            try {
                await API.brooder.updateZoneSensor(
                    selectedCode.value, sensorCode, { weight: Number(weight) }
                );
                showToast('Đã cập nhật weight', 'success');
                await loadZoneSensors(selectedCode.value);
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            }
        }
        async function openAddForm() {
            zsAddOpen.value = true;
            zsAddBarnId.value = brooderBarnId.value;
            await loadCandidates(zsAddBarnId.value);
        }

        // Filter candidates: drop anything already attached to this brooder.
        const availableCandidates = computed(() => {
            const attached = new Set(
                zoneSensors.value.map(zs => zs.sensor_device_code)
            );
            return zsCandidates.value.filter(c => !attached.has(c.device_code));
        });
        function candidateAgeMin(c) {
            if (!c.last_time) return null;
            return Math.floor((Date.now() - new Date(c.last_time).getTime()) / 60000);
        }
        async function quickAttach(c) {
            if (zsSaving.value) return;
            try {
                zsSaving.value = true;
                await API.brooder.addZoneSensor(selectedCode.value, {
                    sensor_device_code: c.device_code,
                    weight: 1.0,
                    label: null,
                });
                showToast(`Đã gắn ${c.device_code} làm zone sensor`, 'success');
                await loadZoneSensors(selectedCode.value);
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                zsSaving.value = false;
            }
        }

        // ── Computed ──────────────────────────────────────────
        const currentNode = computed(() => {
            if (!selectedCode.value) return null;
            return nodes.value.find(n => n.device_code === selectedCode.value) || null;
        });

        // Pre-load candidates whenever the selected node's barn changes, so
        // the "Sensor có thể gắn thêm" panel below is always populated
        // without needing to open the add form first.
        // MUST come AFTER currentNode is declared — brooderBarnId's computed
        // closes over currentNode, so subscribing to it would hit TDZ.
        watch(brooderBarnId, (bid) => {
            if (bid) loadCandidates(bid);
        }, { immediate: false });

        const anyOnline = computed(() => nodes.value.some(n => n.online));
        const anyFailsafe = computed(() =>
            nodes.value.some(n => n.mode === 'failsafe' || n.mode === 'stale')
        );
        const statusClass = computed(() => {
            if (!nodes.value.length) return 'is-unknown';
            if (anyFailsafe.value) return 'is-warning';
            if (anyOnline.value) return 'is-connected';
            return 'is-disconnected';
        });
        const statusText = computed(() => {
            if (!nodes.value.length) return 'Chưa có node';
            if (anyFailsafe.value) return 'Cảnh báo: Failsafe / Stale';
            if (anyOnline.value) return 'Đang hoạt động';
            return 'Mất kết nối';
        });

        // ── Manual override ───────────────────────────────────
        async function saveOverride() {
            if (!currentNode.value) return;
            if (!manualEnabled.value) {
                // Toggle is off → don't send slider; treat as "clear"
                await clearOverride();
                return;
            }
            if (manualTemp.value < TEMP_MIN || manualTemp.value > TEMP_MAX) {
                showToast(`Setpoint phải trong khoảng ${TEMP_MIN}-${TEMP_MAX}°C`, 'error');
                return;
            }
            try {
                submittingOverride.value = true;
                const updated = await API.brooder.setSetpoint(
                    selectedCode.value,
                    Number(manualTemp.value.toFixed(1)),
                    manualNote.value || null,
                );
                showToast(`Đã đặt setpoint ${manualTemp.value.toFixed(1)}°C`, 'success');
                // Refresh
                await pollNodes();
                await loadOverrideHistory(selectedCode.value);
                manualNote.value = '';
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                submittingOverride.value = false;
            }
        }
        async function clearOverride() {
            if (!currentNode.value) return;
            try {
                submittingOverride.value = true;
                await API.brooder.setSetpoint(
                    selectedCode.value, null,
                    manualNote.value || null,
                );
                showToast('Đã xoá manual override — về chế độ auto theo ngày tuổi', 'success');
                manualEnabled.value = false;
                await pollNodes();
                await loadOverrideHistory(selectedCode.value);
                manualNote.value = '';
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                submittingOverride.value = false;
            }
        }

        async function saveFallbackDelta() {
            if (!currentNode.value) return;
            const v = Number(fallbackDelta.value);
            if (v < DELTA_MIN || v > DELTA_MAX) {
                showToast(`Delta phải trong khoảng ${DELTA_MIN} → ${DELTA_MAX}°C`, 'error');
                return;
            }
            try {
                savingDelta.value = true;
                await API.brooder.setFallbackDelta(selectedCode.value, v);
                showToast(`Đã lưu fallback delta ${v.toFixed(2)}°C`, 'success');
                await pollNodes();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                savingDelta.value = false;
            }
        }

        // ── Chart geometry (inline SVG) ───────────────────────
        // 24h temp line + setpoint line + power area (scaled to fit).
        // Computed values are reactive — re-renders when telemetry updates.
        const CHART_W = 720;
        const CHART_H = 220;
        const CHART_PAD = { l: 36, r: 36, t: 12, b: 24 };

        function buildChartPath(samples, accessor, yMin, yMax) {
            if (!samples.length) return { line: '', area: '', points: [] };
            const innerW = CHART_W - CHART_PAD.l - CHART_PAD.r;
            const innerH = CHART_H - CHART_PAD.t - CHART_PAD.b;
            const t0 = new Date(samples[0].time).getTime();
            const t1 = new Date(samples[samples.length - 1].time).getTime();
            const tSpan = Math.max(1, t1 - t0);
            const points = samples.map(s => {
                const x = CHART_PAD.l
                    + ((new Date(s.time).getTime() - t0) / tSpan) * innerW;
                const v = accessor(s);
                const y = CHART_PAD.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
                return { x, y, v };
            });
            const line = 'M ' + points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ');
            // Area under line down to baseline
            const baseline = CHART_PAD.t + innerH;
            const area = line
                + ` L ${points[points.length - 1].x.toFixed(1)},${baseline}`
                + ` L ${points[0].x.toFixed(1)},${baseline} Z`;
            return { line, area, points };
        }

        const tempChart = computed(() => {
            const samples = telemetry.value.temp || [];
            const minT = 15, maxT = 40;
            const lineData = buildChartPath(samples, s => s.value, minT, maxT);
            // Setpoint horizontal line at current setpoint
            const innerH = CHART_H - CHART_PAD.t - CHART_PAD.b;
            const sp = currentNode.value?.setpoint;
            let spLineY = null;
            if (sp != null) {
                spLineY = CHART_PAD.t + innerH
                    - ((sp - minT) / (maxT - minT)) * innerH;
            }
            return { ...lineData, spLineY, minT, maxT };
        });
        const powerChart = computed(() => {
            const samples = telemetry.value.power || [];
            const lineData = buildChartPath(samples, s => s.value, 0, 100);
            return lineData;
        });

        // Y-axis ticks (5 evenly spaced)
        function tempTicks(minT, maxT) {
            const innerH = CHART_H - CHART_PAD.t - CHART_PAD.b;
            const ticks = [];
            for (let i = 0; i <= 4; i++) {
                const v = minT + (i * (maxT - minT)) / 4;
                const y = CHART_PAD.t + innerH - (i * innerH) / 4;
                ticks.push({ v: v.toFixed(0), y });
            }
            return ticks;
        }

        // ── Lifecycle ─────────────────────────────────────────
        onMounted(async () => {
            try {
                loading.value = true;
                await pollNodes();
            } finally {
                loading.value = false;
            }
            startPolling();
        });
        onUnmounted(() => {
            stopPolling();
        });

        // ── Template ──────────────────────────────────────────
        return {
            nodes, selectedCode, currentNode, telemetry, loading, refreshing,
            lastUpdated, statusClass, statusText, anyOnline,
            manualEnabled, manualTemp, manualNote, submittingOverride,
            overrideHistory, TEMP_MIN, TEMP_MAX,
            fallbackDelta, savingDelta, DELTA_MIN, DELTA_MAX,
            saveFallbackDelta,
            // chart
            CHART_W, CHART_H, CHART_PAD, tempChart, powerChart, tempTicks,
            // zone sensors
            zoneSensors, zsLoading, zsSaving, zsAddOpen, zsAddSensor,
            zsAddWeight, zsAddLabel, zsCandidates, zsCandidatesLoading,
            availableCandidates, candidateAgeMin, quickAttach,
            brooderBarnId, openAddForm, addZoneSensor, removeZoneSensor,
            updateZoneSensorWeight,
            // actions
            selectNode, saveOverride, clearOverride, reloadAll, syncManualFormToNode,
            fmtNum, fmtDate,
        };
    },

    template: `
    <div class="cf-container">

        <!-- Header bar -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon" style="background-color: #d97706;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">Brooder Heating</h1>
                    <p class="cf-subtitle">Master-Edge PID &middot; Carbon fiber + Phase-angle SSR (4-20mA)</p>
                </div>
            </div>
            <div class="cf-header-right">
                <span class="cf-brooder-status-pill" :class="statusClass">
                    <span class="dot"></span>
                    {{ statusText }}
                </span>
                <button class="cf-btn-secondary cf-btn-sm" :disabled="refreshing" @click="reloadAll">
                    <span v-if="refreshing">&#9203;</span>
                    <span v-else>&#128260;</span>
                    Tải lại
                </button>
            </div>
        </div>

        <!-- Skeleton first load -->
        <div v-if="loading" class="cf-cards-grid">
            <div v-for="i in 3" :key="i" class="cf-barn-card animate-pulse">
                <div class="cf-card-content">
                    <div class="h-3 bg-gray-200 rounded w-1/3 mb-3"></div>
                    <div class="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
            </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="!nodes.length" class="cf-empty-box">
            <div class="cf-empty-icon">&#128293;</div>
            <div class="cf-empty-title">Chưa có node brooder</div>
            <div class="cf-empty-desc">
                Khi ESP32 gửi MQTT telemetry lên topic
                <code>cfarm/brooder-&lt;device_code&gt;/telemetry</code>,
                node sẽ tự động đăng ký. Hoặc đăng ký thủ công qua API
                <code>POST /api/brooder/nodes</code>.
            </div>
        </div>

        <template v-else>
            <!-- Node selector tabs -->
            <div class="cf-tabs">
                <button v-for="n in nodes" :key="n.device_code"
                        class="cf-tab-btn"
                        :class="n.device_code === selectedCode ? 'active' : ''"
                        @click="selectNode(n.device_code)">
                    <span :class="['cf-brooder-tab-dot', n.online ? 'online' : 'offline']"></span>
                    {{ n.device_code }}
                    <span v-if="n.zone_name" class="cf-text-muted text-sm">&middot; {{ n.zone_name }}</span>
                    <span v-if="n.mode === 'failsafe'" class="cf-tab-btn-badge">FS</span>
                </button>
            </div>

            <template v-if="currentNode">

                <!-- KPI grid (3 cards) -->
                <div class="cf-cards-grid mb-4">

                    <!-- Temp card -->
                    <div class="cf-barn-card">
                        <div class="cf-card-content">
                            <div class="cf-card-top-row">
                                <div class="cf-card-identity">
                                    <div class="cf-card-icon-box" style="background:#fef2f2;color:#dc2626;">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 class="cf-card-title">Nhiệt (T_min)</h3>
                                        <div class="cf-card-meta-line">
                                            <span v-if="currentNode.last_temp1 != null">T1={{ fmtNum(currentNode.last_temp1, 1) }}&deg;</span>
                                            <span v-if="currentNode.last_temp1 != null && currentNode.last_temp2 != null" class="cf-card-meta-bullet">&middot;</span>
                                            <span v-if="currentNode.last_temp2 != null">T2={{ fmtNum(currentNode.last_temp2, 1) }}&deg;</span>
                                            <span v-if="currentNode.last_hum_avg != null" class="cf-card-meta-bullet">&middot;</span>
                                            <span v-if="currentNode.last_hum_avg != null">H={{ fmtNum(currentNode.last_hum_avg, 0) }}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="mt-3 text-2xl font-bold text-gray-900">
                                <span v-if="currentNode.last_temp_min != null">{{ fmtNum(currentNode.last_temp_min, 1) }}&deg;C</span>
                                <span v-else class="cf-text-muted text-base font-normal">&mdash;</span>
                            </div>
                        </div>
                    </div>

                    <!-- Setpoint card -->
                    <div class="cf-barn-card">
                        <div class="cf-card-content">
                            <div class="cf-card-top-row">
                                <div class="cf-card-identity">
                                    <div class="cf-card-icon-box" style="background:#f0fdf4;color:#16a34a;">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="12" cy="12" r="10"/>
                                            <circle cx="12" cy="12" r="6"/>
                                            <circle cx="12" cy="12" r="2"/>
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 class="cf-card-title">Setpoint</h3>
                                        <div class="cf-card-meta-line">
                                            <span v-if="currentNode.manual_setpoint != null">Manual override</span>
                                            <span v-else>Day-age {{ currentNode.day_age ?? '?' }}</span>
                                        </div>
                                    </div>
                                </div>
                                <span v-if="currentNode.manual_setpoint != null" class="cf-badge cf-badge-yellow">Manual</span>
                                <span v-else class="cf-badge cf-badge-green">Auto</span>
                            </div>
                            <div class="mt-3 text-2xl font-bold text-gray-900">
                                <span v-if="currentNode.setpoint != null">{{ fmtNum(currentNode.setpoint, 1) }}&deg;C</span>
                                <span v-else class="cf-text-muted text-base font-normal">&mdash;</span>
                            </div>
                        </div>
                    </div>

                    <!-- Power + mode card -->
                    <div class="cf-barn-card">
                        <div class="cf-card-content">
                            <div class="cf-card-top-row">
                                <div class="cf-card-identity">
                                    <div class="cf-card-icon-box"
                                         :style="currentNode.online ? 'background:#fffbeb;color:#d97706;' : 'background:#f1f5f9;color:#64748b;'">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 class="cf-card-title">Công suất</h3>
                                        <div class="cf-card-meta-line">
                                            <span>{{ currentNode.mode || '?' }}</span>
                                            <span v-if="currentNode.pid_source" class="cf-card-meta-bullet">&middot;</span>
                                            <span v-if="currentNode.pid_source">{{ currentNode.pid_source }}</span>
                                        </div>
                                    </div>
                                </div>
                                <span :class="currentNode.online ? 'cf-badge cf-badge-green' : 'cf-badge cf-badge-gray'">
                                    {{ currentNode.online ? '● online' : '○ offline' }}
                                </span>
                            </div>
                            <div class="mt-3 text-2xl font-bold text-gray-900">
                                <span v-if="currentNode.last_power_sent != null">{{ fmtNum(currentNode.last_power_sent, 0) }}%</span>
                                <span v-else class="cf-text-muted text-base font-normal">&mdash;</span>
                            </div>
                        </div>
                    </div>

                </div>

                <!-- Zone sensors card -->
                <div class="card mb-4">
                    <div class="flex items-start justify-between gap-3 mb-3">
                        <div>
                            <div class="card-title">Sensor tham chiếu vùng (Zone sensors)</div>
                            <div class="cf-text-muted text-sm mt-1">
                                Server blend các sensor (trọng số weighted avg) rồi publish
                                xuống ESP mỗi 20s. ESP dùng làm PID input khi fresh, tự fallback
                                về local khi zone_temp &gt; 3 phút.
                            </div>
                        </div>
                        <button v-if="!zsAddOpen" class="cf-btn-primary cf-btn-sm flex-shrink-0"
                                :disabled="zsSaving" @click="openAddForm">
                            + Thêm sensor
                        </button>
                    </div>

                    <!-- KPI strip: zone temp + count -->
                    <div class="grid grid-cols-2 gap-3 mb-3">
                        <div class="bg-gray-50 rounded p-3">
                            <div class="text-xs text-gray-500 uppercase font-bold tracking-wide">Zone temp (blended)</div>
                            <div class="text-xl font-bold mt-1">
                                <span v-if="currentNode.last_zone_temp != null">{{ fmtNum(currentNode.last_zone_temp, 1) }}&deg;C</span>
                                <span v-else class="cf-text-muted font-normal">&mdash;</span>
                            </div>
                            <div class="text-xs text-gray-500 mt-1">
                                <span v-if="currentNode.last_zone_temp_at">{{ fmtDate(currentNode.last_zone_temp_at) }}</span>
                                <span v-else>chưa có</span>
                            </div>
                        </div>
                        <div class="bg-gray-50 rounded p-3">
                            <div class="text-xs text-gray-500 uppercase font-bold tracking-wide">Số sensor đã gán</div>
                            <div class="text-xl font-bold mt-1">{{ currentNode.zone_sensors_count ?? 0 }}</div>
                            <div class="text-xs text-gray-500 mt-1">
                                <span v-if="brooderBarnId">Trại: <code>{{ brooderBarnId }}</code></span>
                                <span v-else class="cf-text-muted">Chưa có cycle &rarr; chọn trại tuỳ ý</span>
                            </div>
                        </div>
                    </div>

                    <!-- Existing sensors table -->
                    <div v-if="zoneSensors.length" class="cf-table-wrapper">
                        <table class="cf-table">
                            <thead>
                                <tr>
                                    <th>Sensor</th>
                                    <th>Trại</th>
                                    <th class="text-center">Weight</th>
                                    <th class="text-right">Nhiệt</th>
                                    <th>Cập nhật</th>
                                    <th>Ghi chú</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="zs in zoneSensors" :key="zs.id">
                                    <td>
                                        <code>{{ zs.sensor_device_code }}</code>
                                        <span v-if="zs.sensor_name" class="cf-text-muted">&middot; {{ zs.sensor_name }}</span>
                                    </td>
                                    <td>
                                        <code v-if="zs.sensor_barn_id">{{ zs.sensor_barn_id }}</code>
                                        <span v-else class="cf-text-muted">&mdash;</span>
                                    </td>
                                    <td class="text-center">
                                        <input type="number" step="0.1" min="0" max="10"
                                               :value="zs.weight" :disabled="zsSaving"
                                               class="cf-input"
                                               style="width:5rem; text-align:center; padding:0.25rem 0.5rem;"
                                               @change="(e) => updateZoneSensorWeight(
                                                   zs.sensor_device_code,
                                                   e.target.value)">
                                    </td>
                                    <td class="text-right">
                                        <span v-if="zs.last_value != null">{{ fmtNum(zs.last_value, 1) }}&deg;C</span>
                                        <span v-else class="cf-text-muted">&mdash;</span>
                                    </td>
                                    <td>
                                        <span v-if="zs.last_time" class="cf-text-muted text-xs whitespace-nowrap">{{ fmtDate(zs.last_time) }}</span>
                                        <span v-else class="cf-text-muted">&mdash;</span>
                                    </td>
                                    <td>{{ zs.label || '' }}</td>
                                    <td>
                                        <button class="cf-btn cf-btn-ghost cf-btn-xs"
                                                :disabled="zsSaving"
                                                @click="removeZoneSensor(zs.sensor_device_code)">
                                            &#10005; Gỡ
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div v-else-if="!zsLoading" class="cf-empty-inline">
                        Chưa gán sensor nào. Bấm <b>+ Thêm sensor</b> để ESP32 brooder này tham
                        chiếu nhiệt từ các ESP-sensor cùng trại.
                    </div>

                    <!-- Available barn sensors (pre-attached: always loaded when node changes) -->
                    <div class="mt-4 pt-3 border-t border-gray-200">
                        <div class="flex items-center justify-between gap-2 mb-2">
                            <div>
                                <div class="text-sm font-semibold text-gray-800">
                                    Sensor có thể gắn thêm trong trại
                                </div>
                                <div class="cf-text-muted text-xs mt-0.5">
                                    ESP32 có cảm biến nhiệt ở trại
                                    <code v-if="brooderBarnId">{{ brooderBarnId }}</code>
                                    <span v-else>(chưa chọn trại)</span>
                                    mà brooder này có thể tham chiếu. Bấm <b>Gắn</b> để dùng
                                    làm zone sensor (weight = 1.0).
                                </div>
                            </div>
                            <button class="cf-btn cf-btn-ghost cf-btn-xs flex-shrink-0"
                                    :disabled="zsCandidatesLoading || !brooderBarnId"
                                    @click="loadCandidates(brooderBarnId)">
                                <span v-if="zsCandidatesLoading">&#9203;</span>
                                <span v-else>&#128260;</span>
                                Tải lại
                            </button>
                        </div>

                        <!-- Loading skeleton -->
                        <div v-if="zsCandidatesLoading && !zsCandidates.length"
                             class="cf-table-wrapper">
                            <table class="cf-table">
                                <thead>
                                    <tr>
                                        <th>Sensor</th>
                                        <th>Trại</th>
                                        <th class="text-right">Nhiệt mới nhất</th>
                                        <th>Cập nhật</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="i in 3" :key="'skel' + i">
                                        <td><div class="h-3 bg-gray-200 rounded w-24"></div></td>
                                        <td><div class="h-3 bg-gray-200 rounded w-16"></div></td>
                                        <td class="text-right"><div class="h-3 bg-gray-200 rounded w-12 ml-auto"></div></td>
                                        <td><div class="h-3 bg-gray-200 rounded w-20"></div></td>
                                        <td><div class="h-5 bg-gray-200 rounded w-12"></div></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <!-- No barn yet -->
                        <div v-else-if="!brooderBarnId" class="cf-empty-inline">
                            Brooder chưa gán vào cycle nào → không xác định được trại để liệt kê sensor.
                        </div>

                        <!-- Loaded, but no candidates (filtered = nothing left in barn) -->
                        <div v-else-if="!availableCandidates.length" class="cf-empty-inline">
                            <span v-if="zoneSensors.length">
                                Tất cả sensor trong trại đã được gắn vào brooder này.
                            </span>
                            <span v-else>
                                Trại <code>{{ brooderBarnId }}</code> chưa có ESP-sensor nào có
                                nhiệt để tham chiếu.
                            </span>
                        </div>

                        <!-- Candidates table -->
                        <div v-else class="cf-table-wrapper">
                            <table class="cf-table">
                                <thead>
                                    <tr>
                                        <th>Sensor</th>
                                        <th>Trại</th>
                                        <th class="text-right">Nhiệt mới nhất</th>
                                        <th>Cập nhật</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="c in availableCandidates" :key="c.device_code">
                                        <td>
                                            <code>{{ c.device_code }}</code>
                                            <span v-if="c.name" class="cf-text-muted">&middot; {{ c.name }}</span>
                                        </td>
                                        <td>
                                            <code v-if="c.barn_id">{{ c.barn_id }}</code>
                                            <span v-else class="cf-text-muted">&mdash;</span>
                                        </td>
                                        <td class="text-right">
                                            <span v-if="c.last_temp != null">{{ fmtNum(c.last_temp, 1) }}&deg;C</span>
                                            <span v-else class="cf-text-muted">&mdash;</span>
                                        </td>
                                        <td>
                                            <span v-if="c.last_time"
                                                  class="cf-text-muted text-xs whitespace-nowrap"
                                                  :class="candidateAgeMin(c) > 30 ? 'text-amber-600 font-medium' : ''">
                                                {{ fmtDate(c.last_time) }}
                                                <span v-if="candidateAgeMin(c) != null">
                                                    &middot; {{ candidateAgeMin(c) }}p
                                                </span>
                                            </span>
                                            <span v-else class="cf-text-muted">&mdash;</span>
                                        </td>
                                        <td>
                                            <button class="cf-btn-primary cf-btn-xs"
                                                    :disabled="zsSaving"
                                                    @click="quickAttach(c)">
                                                <span v-if="zsSaving">&#9203;</span>
                                                <span v-else>+</span> Gắn
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Add form (inline panel) -->
                    <div v-if="zsAddOpen" class="bg-gray-50 rounded p-3 mt-3">
                        <div class="cf-form-group">
                            <label class="cf-label">Sensor (cùng trại)</label>
                            <select v-model="zsAddSensor" class="cf-select"
                                    :disabled="zsCandidatesLoading">
                                <option value="" disabled>
                                    {{ zsCandidatesLoading
                                        ? 'Đang tải&hellip;'
                                        : (zsCandidates.length
                                            ? '&mdash; chọn sensor &mdash;'
                                            : 'Không có sensor nào ở trại này') }}
                                </option>
                                <option v-for="c in zsCandidates"
                                        :key="c.device_code"
                                        :value="c.device_code">
                                    {{ c.device_code }}<template v-if="c.name"> &middot; {{ c.name }}</template><template v-if="c.last_temp != null"> &middot; {{ fmtNum(c.last_temp, 1) }}&deg;C</template>
                                </option>
                            </select>
                        </div>
                        <div class="grid grid-cols-2 gap-3 mt-2">
                            <div class="cf-form-group">
                                <label class="cf-label">Weight (0 &rarr; 10)</label>
                                <input type="number" v-model.number="zsAddWeight"
                                       step="0.1" min="0" max="10" class="cf-input">
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Ghi chú</label>
                                <input type="text" v-model="zsAddLabel" class="cf-input"
                                       placeholder="VD: cảm biến giữa trại">
                            </div>
                        </div>
                        <div class="flex gap-2 mt-3">
                            <button class="cf-btn-primary cf-btn-sm"
                                    :disabled="zsSaving || !zsAddSensor"
                                    @click="addZoneSensor">
                                <span v-if="zsSaving">&#9203;</span> Lưu
                            </button>
                            <button class="cf-btn cf-btn-ghost cf-btn-sm"
                                    :disabled="zsSaving"
                                    @click="zsAddOpen = false">
                                Huỷ
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Manual Override + Fallback Delta (2-col on desktop) -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

                    <!-- Manual override card -->
                    <div class="card">
                        <div class="card-title mb-2">Manual Override</div>
                        <div class="cf-text-muted text-sm mb-4">
                            Bật để khoá setpoint cố định (khẩn cấp). ESP32 sẽ cache vào NVS và
                            giữ nguyên cả khi server mất.
                        </div>

                        <div class="flex items-center gap-3 mb-4">
                            <label class="cf-brooder-toggle">
                                <input type="checkbox" v-model="manualEnabled">
                                <span class="cf-brooder-toggle-slider"></span>
                            </label>
                            <span class="text-sm font-medium"
                                  :class="manualEnabled ? 'text-orange-700' : 'text-gray-500'">
                                {{ manualEnabled
                                    ? 'Đang khoá setpoint thủ công'
                                    : 'Đang theo bảng ngày tuổi (auto)' }}
                            </span>
                        </div>

                        <div v-if="manualEnabled" class="mb-4">
                            <div class="cf-brooder-slider-row">
                                <span class="text-xs text-gray-500">Setpoint:</span>
                                <input type="range" :min="TEMP_MIN" :max="TEMP_MAX" step="0.1"
                                       v-model.number="manualTemp" class="cf-brooder-slider">
                                <span class="cf-brooder-slider-value">{{ manualTemp.toFixed(1) }}&deg;C</span>
                            </div>
                        </div>

                        <div class="cf-form-group mb-3">
                            <label class="cf-label">Ghi chú (audit log)</label>
                            <input type="text" v-model="manualNote" class="cf-input"
                                   placeholder="VD: úm gà con ngày 3, can thiệp khẩn cấp">
                        </div>

                        <div class="flex gap-2">
                            <button class="cf-btn-primary cf-btn-sm"
                                    :disabled="submittingOverride"
                                    @click="saveOverride">
                                <span v-if="submittingOverride">&#9203;</span>
                                {{ manualEnabled ? 'Áp dụng' : 'Xoá override (về auto)' }}
                            </button>
                            <button v-if="manualEnabled"
                                    class="cf-btn cf-btn-ghost cf-btn-sm"
                                    :disabled="submittingOverride"
                                    @click="clearOverride">
                                Xoá thủ công
                            </button>
                        </div>
                    </div>

                    <!-- Fallback delta card -->
                    <div class="card">
                        <div class="card-title mb-2">Fallback delta (Tier-2 khi zone stale)</div>
                        <div class="cf-text-muted text-sm mb-4">
                            Khi 3 phút không có zone_temp, ESP chuyển sang dùng
                            <code>local_SHT40 &minus; delta</code> làm ước lượng nhiệt chick-zone cho
                            PID. Quy ước: <strong>delta dương = SHT40 trên brooder đọc nóng hơn
                            chick-zone</strong> (thường +1.5 đến +3.0&deg;C). Delta = 0 = conservative.
                            Delta âm hiếm gặp.
                        </div>

                        <div class="mb-4">
                            <div class="cf-brooder-slider-row">
                                <span class="text-xs text-gray-500">Delta (&deg;C):</span>
                                <input type="range" :min="DELTA_MIN" :max="DELTA_MAX" step="0.1"
                                       v-model.number="fallbackDelta" class="cf-brooder-slider">
                                <span class="cf-brooder-slider-value">
                                    {{ fallbackDelta >= 0 ? '+' : '' }}{{ fallbackDelta.toFixed(1) }}&deg;C
                                </span>
                            </div>
                        </div>

                        <div class="flex gap-2">
                            <button class="cf-btn-primary cf-btn-sm"
                                    :disabled="savingDelta"
                                    @click="saveFallbackDelta">
                                <span v-if="savingDelta">&#9203;</span>
                                Lưu delta
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 24h chart card -->
                <div class="card mb-4">
                    <div class="card-title mb-1">24h gần nhất</div>
                    <div class="cf-text-muted text-sm mb-3">
                        Đường đỏ = nhiệt (&deg;C, trục trái); vùng mờ xanh = công suất (%, trục phải);
                        đường đứt nét xanh = setpoint hiệu lực.
                    </div>

                    <svg :viewBox="'0 0 ' + CHART_W + ' ' + CHART_H"
                         class="cf-brooder-chart" preserveAspectRatio="none">
                        <!-- Y-axis grid (left, temp °C) -->
                        <g>
                            <g v-for="t in tempTicks(tempChart.minT, tempChart.maxT)"
                               :key="'y' + t.v">
                                <line :x1="CHART_PAD.l" :x2="CHART_W - CHART_PAD.r"
                                      :y1="t.y" :y2="t.y"
                                      class="cf-brooder-chart-grid"/>
                                <text :x="CHART_PAD.l - 6" :y="t.y + 3"
                                      text-anchor="end"
                                      class="cf-brooder-chart-tick">{{ t.v }}&deg;</text>
                            </g>
                        </g>
                        <!-- Y-axis ticks (right, power %) -->
                        <g>
                            <g v-for="i in 5" :key="'pr' + i">
                                <text :x="CHART_W - CHART_PAD.r + 6"
                                      :y="CHART_PAD.t + (i - 1) *
                                          (CHART_H - CHART_PAD.t - CHART_PAD.b) / 4 + 3"
                                      class="cf-brooder-chart-tick">{{ (100 - (i - 1) * 25) }}%</text>
                            </g>
                        </g>
                        <!-- Power area (background) + outline -->
                        <path v-if="powerChart.area"
                              :d="powerChart.area"
                              class="cf-brooder-chart-area-power"/>
                        <path v-if="powerChart.line"
                              :d="powerChart.line"
                              class="cf-brooder-chart-line-power"/>
                        <!-- Setpoint dashed line -->
                        <line v-if="tempChart.spLineY != null"
                              :x1="CHART_PAD.l"
                              :x2="CHART_W - CHART_PAD.r"
                              :y1="tempChart.spLineY"
                              :y2="tempChart.spLineY"
                              class="cf-brooder-chart-line-setpoint"/>
                        <!-- Temp line -->
                        <path v-if="tempChart.line"
                              :d="tempChart.line"
                              class="cf-brooder-chart-line-temp"/>
                    </svg>

                    <div class="cf-brooder-chart-legend">
                        <span><span class="cf-brooder-legend-swatch is-temp"></span>Nhiệt (&deg;C)</span>
                        <span><span class="cf-brooder-legend-swatch is-power"></span>Công suất (%)</span>
                        <span><span class="cf-brooder-legend-swatch is-setpoint"></span>Setpoint</span>
                    </div>
                </div>

                <!-- Override audit log -->
                <div class="card" v-if="overrideHistory.length">
                    <div class="card-title mb-3">Lịch sử can thiệp</div>
                    <div class="cf-table-wrapper">
                        <table class="cf-table">
                            <thead>
                                <tr>
                                    <th>Thời gian</th>
                                    <th class="text-right">Setpoint đặt</th>
                                    <th class="text-right">Hiệu lực</th>
                                    <th>Source</th>
                                    <th>Ghi chú</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="h in overrideHistory" :key="h.id">
                                    <td class="cf-text-muted text-xs whitespace-nowrap">{{ fmtDate(h.created_at) }}</td>
                                    <td class="text-right">
                                        <span v-if="h.manual_setpoint != null">{{ fmtNum(h.manual_setpoint, 1) }}&deg;C</span>
                                        <span v-else class="cf-text-muted">(clear)</span>
                                    </td>
                                    <td class="text-right">{{ fmtNum(h.effective_setpoint, 1) }}&deg;C</td>
                                    <td>
                                        <span class="cf-badge"
                                              :class="h.source === 'manual' ? 'cf-badge-yellow' : ''">
                                            {{ h.source }}
                                        </span>
                                    </td>
                                    <td>{{ h.note || '' }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

            </template>
        </template>
    </div>
    `,
};
