/**
 * Inverter Dashboard — Luxpower SNA 6.5k (Phase 1: read-only monitoring)
 *
 * Layout (per docs/ui_style_guide.md §4.2 Dashboard + KPI Grid):
 *   - Header bar with status pill (connected / error / polling)
 *   - 5 KPI cards: Tổng PV, Công suất lưới, Tải tiêu thụ, SoC pin, Pin sạc/xả
 *   - 2-col dashboard grid:
 *       Main : inline SVG chart (24h SoC + PV curves)
 *       Side : last-update timestamp, raw diagnostics, refresh button
 *
 * Data refresh:
 *   - /api/inverter/current  → every 5 s
 *   - /api/inverter/status   → every 5 s (cheap)
 *   - /api/inverter/history  → once on mount + on manual "Tải lại" button
 *     (history queries TimescaleDB and shouldn't be auto-refreshed)
 *
 * UI conventions:
 *   - fmtNum() / fmtDate() are global in app.js — don't redefine
 *   - showToast() is global — never use alert/confirm
 *   - Skeleton first load → spinner refresh
 *   - Vietnamese locale / labels
 */

const { ref, computed, onMounted, onUnmounted, reactive } = Vue;


export default {
    setup() {
        // ── State ─────────────────────────────────────────────
        const current = ref(null);             // latest inverter_runtime sample
        const status = ref(null);             // {connected, last_poll_at, ...}
        const history = ref([]);              // 24h samples for the chart
        const loading = ref(true);            // first-load (skeleton)
        const refreshing = ref(false);        // refresh-spinner state
        const lastUpdated = ref(null);
        const chartRange = ref(24);           // hours

        // ── Data freshness tracker ─────────────────────────────
        // "now" is a reactive clock ticking every second so the
        // freshness label auto-updates without polling the API again.
        const now = ref(new Date());
        let clockTimer = null;

        // ── Polling ───────────────────────────────────────────
        let pollTimer = null;

        async function pollOnce() {
            // Skip the loading flag on poll ticks; only flip it on manual refresh.
            try {
                const [cur, st] = await Promise.all([
                    API.inverter.current().catch(() => null),
                    API.inverter.status().catch(() => null),
                ]);
                if (cur) current.value = cur;
                if (st) status.value = st;
                lastUpdated.value = new Date();
            } catch (e) {
                // Don't toast on every poll failure — the status pill already
                // shows the connection state. Silent retry.
                console.warn('inverter poll error:', e);
            }
        }

        function startPolling() {
            stopPolling();
            pollTimer = setInterval(pollOnce, 5000);
        }
        function stopPolling() {
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        }

        function startClock() {
            stopClock();
            clockTimer = setInterval(() => { now.value = new Date(); }, 1000);
        }
        function stopClock() {
            if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
        }

        // ── History load ──────────────────────────────────────
        async function loadHistory() {
            try {
                const h = await API.inverter.history(chartRange.value, 'auto');
                history.value = h.samples || [];
            } catch (e) {
                console.warn('inverter history load error:', e);
                history.value = [];
            }
        }

        async function reloadAll() {
            try {
                refreshing.value = true;
                await Promise.all([pollOnce(), loadHistory()]);
            } finally {
                refreshing.value = false;
            }
        }

        // ── Computed ──────────────────────────────────────────
        const ppvTotal = computed(() => {
            if (!current.value) return 0;
            return (current.value.ppv1 || 0) + (current.value.ppv2 || 0);
        });

        const statusClass = computed(() => {
            if (!status.value) return 'is-unknown';
            if (status.value.last_error && !status.value.connected) return 'is-error';
            if (status.value.connected) return 'is-connected';
            return 'is-disconnected';
        });

        const statusText = computed(() => {
            if (!status.value) return 'Đang khởi động…';
            if (status.value.last_error && !status.value.connected) {
                return 'Lỗi kết nối';
            }
            if (status.value.connected) return 'Đang kết nối';
            if (status.value.enabled === false) return 'Tắt (cấu hình)';
            return 'Mất kết nối';
        });

        const updatedText = computed(() => {
            if (!lastUpdated.value) return '—';
            return lastUpdated.value.toLocaleTimeString('vi-VN');
        });

        const lastPollText = computed(() => {
            if (!status.value || !status.value.last_poll_at) return '—';
            try {
                return new Date(status.value.last_poll_at).toLocaleTimeString('vi-VN');
            } catch { return '—'; }
        });

        const pollCountText = computed(() => {
            if (!status.value) return '0';
            return fmtNum(status.value.poll_count || 0);
        });

        // ── Data freshness ─────────────────────────────────────
        // age = now − lastUpdated (seconds). Re-evaluates every second
        // because `now` ticks on the clock timer.
        const dataAgeSec = computed(() => {
            if (!lastUpdated.value) return null;
            return Math.max(0, Math.floor((now.value - lastUpdated.value) / 1000));
        });

        // Age threshold bands (Vietnamese UX):
        //   ≤ 15s  : "vừa xong"      — green  (fresh)
        //   15-60s : "Xs trước"      — yellow (acceptable)
        //   > 60s  : "X phút trước"  — red    (stale → likely disconnected)
        const freshnessText = computed(() => {
            const a = dataAgeSec.value;
            if (a === null) return '—';
            if (a <= 1) return 'vừa xong';
            if (a < 60) return `${a} giây trước`;
            if (a < 3600) {
                const m = Math.floor(a / 60);
                return `${m} phút trước`;
            }
            const h = Math.floor(a / 3600);
            return `${h} giờ trước`;
        });

        const freshnessClass = computed(() => {
            const a = dataAgeSec.value;
            if (a === null) return 'is-unknown';
            if (a <= 15) return 'is-fresh';
            if (a <= 60) return 'is-aging';
            return 'is-stale';
        });

        // Absolute timestamp shown on hover (toISOString is too long → use
        // toLocaleString which produces a readable full date+time).
        const freshnessTooltip = computed(() => {
            if (!lastUpdated.value) return 'Chưa có dữ liệu';
            return lastUpdated.value.toLocaleString('vi-VN');
        });

        // ── SVG chart (lightweight inline, no Chart.js dep) ───
        // Renders two lines: SoC (%) and Total PV (W) on the same chart,
        // each with its own Y-axis range and color.
        const chart = computed(() => {
            const samples = history.value;
            const W = 600, H = 220;
            const padL = 44, padR = 44, padT = 12, padB = 26;
            const innerW = W - padL - padR;
            const innerH = H - padT - padB;

            if (!samples.length) {
                return { W, H, padL, padR, padT, padB, lines: [], socAxis: [], pvAxis: [], tAxis: [] };
            }

            const tMin = new Date(samples[0].ts).getTime();
            const tMax = new Date(samples[samples.length - 1].ts).getTime();
            const tSpan = Math.max(1, tMax - tMin);

            // SoC: 0..100 (use min/max from data with a 10-unit floor for variance)
            let socMin = Infinity, socMax = -Infinity;
            // PV: 0..max (W)
            let pvMax = 0;
            for (const s of samples) {
                const soc = Number(s.soc ?? s.soc_avg ?? 0);
                if (soc < socMin) socMin = soc;
                if (soc > socMax) socMax = soc;
                const pv = (Number(s.ppv1 ?? s.ppv1_avg ?? 0))
                         + (Number(s.ppv2 ?? s.ppv2_avg ?? 0));
                if (pv > pvMax) pvMax = pv;
            }
            if (socMin === socMax) { socMin = Math.max(0, socMin - 5); socMax = Math.min(100, socMax + 5); }
            const socRange = Math.max(1, socMax - socMin);
            pvMax = Math.max(10, pvMax);  // floor so axis isn't 0..0.001

            const xOf = (ts) => padL + ((new Date(ts).getTime() - tMin) / tSpan) * innerW;
            const socY = (v) => padT + innerH - ((Number(v) - socMin) / socRange) * innerH;
            const pvY = (v) => padT + innerH - (Number(v) / pvMax) * innerH;

            // Build SoC path
            const socPts = samples
                .map(s => `${xOf(s.ts).toFixed(1)},${socY(s.soc ?? s.soc_avg ?? 0).toFixed(1)}`)
                .join(' ');
            // Build PV path
            const pvPts = samples
                .map(s => {
                    const pv = (Number(s.ppv1 ?? s.ppv1_avg ?? 0))
                             + (Number(s.ppv2 ?? s.ppv2_avg ?? 0));
                    return `${xOf(s.ts).toFixed(1)},${pvY(pv).toFixed(1)}`;
                })
                .join(' ');

            // Y-axis ticks (SoC on left, PV on right) — 4 ticks each
            const socAxis = [0, 1, 2, 3].map(i => {
                const v = socMin + (socRange * i) / 3;
                return { v: Math.round(v), y: socY(v) };
            });
            const pvAxis = [0, 1, 2, 3].map(i => {
                const v = (pvMax * i) / 3;
                return { v: Math.round(v), y: pvY(v), label: v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}` };
            });

            // X-axis ticks — 5 evenly spaced
            const tAxis = [0, 1, 2, 3, 4].map(i => {
                const ts = tMin + (tSpan * i) / 4;
                const d = new Date(ts);
                return {
                    x: padL + (innerW * i) / 4,
                    label: d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                };
            });

            return {
                W, H, padL, padR, padT, padB,
                socPts, pvPts,
                socAxis, pvAxis, tAxis,
            };
        });

        // ── Lifecycle ─────────────────────────────────────────
        onMounted(async () => {
            loading.value = true;
            try {
                await Promise.all([pollOnce(), loadHistory()]);
            } finally {
                loading.value = false;
            }
            startPolling();
            startClock();
        });

        onUnmounted(() => {
            stopPolling();
            stopClock();
        });

        return {
            current, status, history, loading, refreshing, chartRange,
            lastUpdated, now,
            // computed
            ppvTotal, statusClass, statusText,
            updatedText, lastPollText, pollCountText, chart,
            dataAgeSec, freshnessText, freshnessClass, freshnessTooltip,
            // methods
            reloadAll,
            // helpers (passed to template)
            fmtNum,
        };
    },

    template: `
    <div class="cf-container">

        <!-- Header -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                         fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">Inverter (Luxpower SNA 6.5k)</h1>
                    <p class="cf-subtitle">Giám sát công suất, pin & lưới — chỉ đọc</p>
                </div>
            </div>
            <div class="cf-header-right">
                <span class="cf-inverter-status" :class="statusClass">
                    <span class="cf-inverter-status-dot"></span>
                    {{ statusText }}
                </span>
                <!-- Data freshness: how old is the latest sample? Auto-updates every 1s. -->
                <span class="cf-inverter-freshness"
                      :class="freshnessClass"
                      :title="freshnessTooltip">
                    <span class="cf-inverter-freshness-dot"></span>
                    {{ freshnessText }}
                </span>
                <button @click="reloadAll" class="cf-btn-sm cf-btn-secondary" :disabled="refreshing">
                    <span v-if="refreshing" class="cf-spinner cf-spinner-sm"></span>
                    <span v-else>🔄</span>
                    Tải lại
                </button>
            </div>
        </div>

        <!-- Skeleton first load -->
        <div v-if="loading && !current" class="cf-inverter-kpi-grid">
            <div v-for="n in 5" :key="n" class="cf-inverter-kpi animate-pulse">
                <div class="cf-inverter-kpi-icon" style="background:#e5e7eb;"></div>
                <div class="cf-inverter-kpi-body">
                    <div class="cf-inverter-kpi-label" style="background:#e5e7eb;height:12px;width:80px;border-radius:4px;"></div>
                    <div class="cf-inverter-kpi-value" style="background:#e5e7eb;height:24px;width:60%;margin-top:8px;border-radius:4px;"></div>
                </div>
            </div>
        </div>

        <!-- KPI cards -->
        <div v-else class="cf-inverter-kpi-grid">

            <!-- 1) Tổng PV -->
            <div class="cf-inverter-kpi cf-inverter-pv">
                <div class="cf-inverter-kpi-icon" style="background: linear-gradient(135deg, #facc15 0%, #eab308 100%);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                         fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="4"/>
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                    </svg>
                </div>
                <div class="cf-inverter-kpi-body">
                    <div class="cf-inverter-kpi-label">Tổng PV</div>
                    <div class="cf-inverter-kpi-value">{{ fmtNum(ppvTotal, 0) }} <span class="cf-inverter-kpi-unit">W</span></div>
                    <div class="cf-inverter-kpi-sub" v-if="current">
                        PV1: {{ fmtNum(current.ppv1, 0) }} W · PV2: {{ fmtNum(current.ppv2, 0) }} W
                    </div>
                </div>
            </div>

            <!-- 2) Công suất lưới -->
            <div class="cf-inverter-kpi" :class="(current && current.p_grid !== 0 && current.p_grid >= 0) ? 'cf-inverter-grid-export' : (current && current.p_grid !== 0 ? 'cf-inverter-grid-import' : '')">
                <div class="cf-inverter-kpi-icon" :style="current && current.p_grid !== 0 && current.p_grid >= 0
                    ? 'background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);'
                    : 'background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                         fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 12h4l3-9 4 18 3-9h4"/>
                    </svg>
                </div>
                <div class="cf-inverter-kpi-body">
                    <div class="cf-inverter-kpi-label">
                        Công suất lưới
                        <span class="cf-inverter-unverified" title="Thanh ghi chưa verify với LCD — cần bật phụ tải (bình nóng lạnh) để identify">⚠ chưa verify</span>
                    </div>
                    <div class="cf-inverter-kpi-value">
                        <span v-if="current && current.p_grid !== 0">{{ current.p_grid >= 0 ? '+' : '' }}{{ fmtNum(current.p_grid, 0) }}</span>
                        <span v-else-if="current">—</span>
                        <span v-else>—</span>
                        <span class="cf-inverter-kpi-unit">W</span>
                    </div>
                    <div class="cf-inverter-kpi-sub" v-if="current">
                        <span class="cf-inverter-help-text">Bật bình nóng lạnh để identify thanh ghi</span>
                    </div>
                </div>
            </div>

            <!-- 3) Tải tiêu thụ -->
            <div class="cf-inverter-kpi cf-inverter-load">
                <div class="cf-inverter-kpi-icon" style="background: linear-gradient(135deg, #60a5fa 0%, #2563eb 100%);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                         fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                </div>
                <div class="cf-inverter-kpi-body">
                    <div class="cf-inverter-kpi-label">
                        Tải tiêu thụ (EPS)
                        <span class="cf-inverter-unverified" title="Thanh ghi chưa verify">⚠ chưa verify</span>
                    </div>
                    <div class="cf-inverter-kpi-value">
                        <span v-if="current && current.p_eps !== 0">{{ fmtNum(current.p_eps, 0) }}</span>
                        <span v-else-if="current">—</span>
                        <span v-else>—</span>
                        <span class="cf-inverter-kpi-unit">W</span>
                    </div>
                    <div class="cf-inverter-kpi-sub" v-if="current">
                        V_bat: {{ fmtNum(current.v_bat, 2) }} V
                    </div>
                </div>
            </div>

            <!-- 4) SoC pin -->
            <div class="cf-inverter-kpi cf-inverter-battery">
                <div class="cf-inverter-kpi-icon" :style="current && current.soc < 20
                    ? 'background: linear-gradient(135deg, #f87171 0%, #dc2626 100%);'
                    : 'background: linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%);'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                         fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="1" y="6" width="18" height="12" rx="2"/>
                        <line x1="23" y1="13" x2="23" y2="11"/>
                    </svg>
                </div>
                <div class="cf-inverter-kpi-body">
                    <div class="cf-inverter-kpi-label">SoC pin</div>
                    <div class="cf-inverter-kpi-value">
                        <span v-if="current">{{ fmtNum(current.soc, 0) }}</span>
                        <span v-else>—</span>
                        <span class="cf-inverter-kpi-unit">%</span>
                    </div>
                    <div class="cf-inverter-kpi-sub" v-if="current">
                        <span :class="current.soc < 20 ? 'cf-inverter-warn-text' : ''">
                            {{ current.soc < 20 ? '⚠ Pin yếu' : '✓ Bình thường' }}
                        </span>
                    </div>
                </div>
            </div>

            <!-- 5) Pin sạc / xả -->
            <div class="cf-inverter-kpi" :class="(current && current.p_bat !== 0 && current.p_bat >= 0) ? 'cf-inverter-charging' : (current && current.p_bat !== 0 ? 'cf-inverter-discharging' : '')">
                <div class="cf-inverter-kpi-icon" :style="current && current.p_bat !== 0 && current.p_bat >= 0
                    ? 'background: linear-gradient(135deg, #34d399 0%, #059669 100%);'
                    : 'background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                         fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M7 16V4M17 8V20M3 8h4M17 4h4M3 20h4M17 16h4"/>
                    </svg>
                </div>
                <div class="cf-inverter-kpi-body">
                    <div class="cf-inverter-kpi-label">
                        Pin (sạc/xả)
                        <span class="cf-inverter-unverified" title="Thanh ghi chưa verify">⚠ chưa verify</span>
                    </div>
                    <div class="cf-inverter-kpi-value">
                        <span v-if="current && current.p_bat !== 0">{{ current.p_bat >= 0 ? '+' : '' }}{{ fmtNum(current.p_bat, 0) }}</span>
                        <span v-else-if="current">—</span>
                        <span v-else>—</span>
                        <span class="cf-inverter-kpi-unit">W</span>
                    </div>
                    <div class="cf-inverter-kpi-sub" v-if="current">
                        <span class="cf-inverter-help-text">Sẽ hiện khi pin chạy sạc/xả</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Error banner (when last_error is set) -->
        <div v-if="status && status.last_error && !status.connected"
             class="cf-inverter-error-banner">
            <span>⚠️ {{ status.last_error }}</span>
            <button @click="reloadAll" class="cf-btn-sm cf-btn-secondary">Thử lại</button>
        </div>

        <!-- Data freshness banner — shows right above the KPIs so users always
             see how old the displayed numbers are. Auto-updates every 1s. -->
        <div v-if="current" class="cf-inverter-freshness-banner"
             :class="freshnessClass"
             :title="freshnessTooltip">
            <span class="cf-inverter-freshness-dot"></span>
            <span class="cf-inverter-freshness-label">Dữ liệu lấy lúc:</span>
            <strong>{{ freshnessText }}</strong>
            <span class="cf-inverter-freshness-sep">·</span>
            <span class="cf-inverter-freshness-abs">{{ freshnessTooltip }}</span>
            <span class="cf-inverter-freshness-cfg">· mỗi {{ status?.poll_interval_seconds || 5 }}s</span>
        </div>

        <!-- Dashboard 2-col: chart + diagnostics -->
        <div class="dashboard-grid mt-6">

            <!-- Main: 24h chart -->
            <div class="dashboard-main">
                <div class="card">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-semibold text-primary">24h qua: SoC pin & Công suất PV</h3>
                        <span class="text-xs text-gray-500" v-if="chart.tAxis.length">
                            {{ chart.tAxis[0].label }} → {{ chart.tAxis[chart.tAxis.length - 1].label }}
                        </span>
                    </div>

                    <div v-if="!history.length && !loading" class="cf-empty-box">
                        <div class="cf-empty-icon">📊</div>
                        <p>Chưa có dữ liệu lịch sử. Dữ liệu sẽ xuất hiện sau khi inverter poll được vài phút.</p>
                    </div>

                    <svg v-else-if="history.length" class="cf-inverter-chart" :viewBox="'0 0 ' + chart.W + ' ' + chart.H"
                         preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                        <!-- Horizontal grid lines (3) -->
                        <g class="cf-inverter-chart-grid">
                            <line v-for="(t, i) in chart.socAxis" :key="'g'+i"
                                  :x1="chart.padL" :x2="chart.W - chart.padR"
                                  :y1="t.y" :y2="t.y" />
                        </g>

                        <!-- SoC axis ticks (left) -->
                        <g class="cf-inverter-chart-axis">
                            <text v-for="(t, i) in chart.socAxis" :key="'soc'+i"
                                  :x="chart.padL - 6" :y="t.y + 4" text-anchor="end">
                                {{ t.v }}%
                            </text>
                        </g>

                        <!-- PV axis ticks (right) -->
                        <g class="cf-inverter-chart-axis">
                            <text v-for="(t, i) in chart.pvAxis" :key="'pv'+i"
                                  :x="chart.W - chart.padR + 6" :y="t.y + 4" text-anchor="start">
                                {{ t.label }}W
                            </text>
                        </g>

                        <!-- X-axis ticks (time) -->
                        <g class="cf-inverter-chart-axis">
                            <text v-for="(t, i) in chart.tAxis" :key="'t'+i"
                                  :x="t.x" :y="chart.H - 8" text-anchor="middle">
                                {{ t.label }}
                            </text>
                        </g>

                        <!-- SoC polyline (purple) -->
                        <polyline class="cf-inverter-line-soc" :points="chart.socPts" />

                        <!-- PV polyline (yellow) -->
                        <polyline class="cf-inverter-line-pv" :points="chart.pvPts" />
                    </svg>

                    <div v-else class="text-center py-8 text-gray-400 text-sm">
                        Đang tải biểu đồ…
                    </div>

                    <!-- Legend -->
                    <div class="flex items-center gap-4 mt-3 text-xs text-gray-600">
                        <span class="flex items-center gap-1">
                            <span class="cf-inverter-legend-dot" style="background:#7c3aed;"></span>
                            SoC pin (%)
                        </span>
                        <span class="flex items-center gap-1">
                            <span class="cf-inverter-legend-dot" style="background:#eab308;"></span>
                            Tổng PV (W)
                        </span>
                    </div>
                </div>
            </div>

            <!-- Side: diagnostics -->
            <div class="dashboard-side">
                <div class="card mb-4">
                    <h3 class="font-semibold text-primary mb-3">Trạng thái</h3>
                    <dl class="cf-inverter-dl">
                        <dt>Cập nhật UI</dt>
                        <dd>{{ updatedText }}</dd>

                        <dt>Poll gần nhất</dt>
                        <dd>{{ lastPollText }}</dd>

                        <dt>Số lần poll</dt>
                        <dd>{{ pollCountText }}</dd>

                        <dt>Interval</dt>
                        <dd>
                            <span v-if="status">{{ fmtNum(status.poll_interval_seconds || 5, 0) }} s</span>
                            <span v-else>—</span>
                        </dd>

                        <dt>Lỗi</dt>
                        <dd>
                            <span v-if="status && status.error_count > 0" class="cf-inverter-warn-text">
                                {{ fmtNum(status.error_count) }}
                            </span>
                            <span v-else class="text-gray-400">0</span>
                        </dd>
                    </dl>
                </div>

                <div class="card">
                    <h3 class="font-semibold text-primary mb-3">Ghi chú</h3>
                    <ul class="cf-inverter-notes">
                        <li>⚡ Phase 1: <strong>chỉ đọc</strong> — không gửi lệnh điều khiển tới inverter.</li>
                        <li>📊 Dữ liệu được lưu vào TimescaleDB hypertable <code>inverter_runtime</code>.</li>
                        <li>🕒 Retention: 90 ngày; biểu đồ 24h dùng raw, &gt;48h dùng aggregate hourly.</li>
                        <li>✓ Register SoC (0x1B) đã verify với LCD. V_bat & PV V/A là best-guess.</li>
                    </ul>
                </div>
            </div>
        </div>

    </div>
    `
};
