/**
 * Brooder Dashboard — Zone-based thermal control (Phase D).
 *
 * The legacy per-node dashboard has been moved to brooder-legacy.js for
 * rollback. This page shows the new zone model: 1 zone = 1 PID + N heaters
 * (across N ESP32 nodes, 2 channels each) + M reference sensors.
 *
 * Layout (per docs/ui_style_guide.md §4.2 Dashboard):
 *   - Header bar: title + status pill
 *   - Summary strip: total zones, total heaters online, any failsafe flag
 *   - Cards grid (one card per zone):
 *       - Zone name + barn name + day-age badge
 *       - KPI inline: zone temp, setpoint, total power%, online status
 *       - Heater count + member count
 *       - Click → /brooder/{id} (zone detail)
 *   - "+ Thêm zone" button (modal form)
 *
 * Data refresh: every 5s via /api/brooder/zones (cheap in-memory overlay).
 */

const { ref, reactive, computed, onMounted, onUnmounted } = Vue;


export default {
    setup() {
        // ── State ─────────────────────────────────────────────
        const zones = ref([]);
        const loading = ref(true);
        const refreshing = ref(false);
        const lastUpdated = ref(null);

        // Add-zone modal state
        const addOpen = ref(false);
        const addSaving = ref(false);
        const addForm = reactive({
            barn_id: null,
            name: '',
            manual_setpoint: null,
            fallback_delta_c: 0.0,
            max_total_w: null,
            notes: '',
        });
        const barns = ref([]);

        // ── Polling ───────────────────────────────────────────
        let pollTimer = null;
        async function pollZones() {
            try {
                const r = await API.brooder.zones.list();
                zones.value = r.zones || [];
                lastUpdated.value = new Date();
            } catch (e) {
                console.warn('brooder zones poll error:', e);
            }
        }
        function startPolling() {
            stopPolling();
            pollTimer = setInterval(pollZones, 5000);
        }
        function stopPolling() {
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        }

        async function reloadAll() {
            try {
                refreshing.value = true;
                await pollZones();
            } finally {
                refreshing.value = false;
            }
        }

        // ── Computed ──────────────────────────────────────────
        const totalZones = computed(() => zones.value.length);
        const totalHeaters = computed(() =>
            zones.value.reduce((acc, z) => acc + (z.heater_count || 0), 0)
        );
        const anyFailsafe = computed(() =>
            zones.value.some(z => z.mode === 'failsafe' || z.mode === 'stale')
        );
        const anyOnline = computed(() => zones.value.some(z => z.online));

        // ── "last seen" humanizer + freshness bucket ─────────────
        // Server returns `last_seen_seconds` (null when never seen).
        // We bucket by freshness so the user can tell at a glance:
        //   <2 min   = green   (just talked)
        //   2-15 min = yellow  (quiet but not concerning)
        //   >15 min  = red     (something is wrong)
        //   null     = gray    (never reported)
        function formatLastSeen(seconds) {
            if (seconds === null || seconds === undefined) return '— chưa có dữ liệu';
            if (seconds < 60)        return seconds + ' giây trước';
            if (seconds < 3600)      return Math.floor(seconds / 60) + ' phút trước';
            if (seconds < 86400)     return Math.floor(seconds / 3600) + ' giờ trước';
            return Math.floor(seconds / 86400) + ' ngày trước';
        }
        function lastSeenClass(seconds) {
            if (seconds === null || seconds === undefined) return 'cf-badge-gray';
            if (seconds < 120)   return 'cf-badge-green';   // <2 min
            if (seconds < 900)   return 'cf-badge-yellow';  // 2-15 min
            return 'cf-badge-red';                          // >15 min
        }

        const statusClass = computed(() => {
            if (!zones.value.length) return 'is-unknown';
            if (anyFailsafe.value) return 'is-warning';
            if (anyOnline.value) return 'is-connected';
            return 'is-disconnected';
        });
        const statusText = computed(() => {
            if (!zones.value.length) return 'Chưa có zone';
            if (anyFailsafe.value) return 'Cảnh báo: Failsafe / Stale';
            if (anyOnline.value) return 'Đang hoạt động';
            return 'Mất kết nối';
        });

        // ── Add zone modal ────────────────────────────────────
        async function loadBarns() {
            try {
                const r = await API.get('/api/farm/barns');
                barns.value = (r.barns || r || []).map(b => ({
                    id: b.id, name: b.name,
                }));
            } catch (e) {
                console.warn('brooder load barns error:', e);
                barns.value = [];
            }
        }
        function openAddForm() {
            addForm.barn_id = null;
            addForm.name = '';
            addForm.manual_setpoint = null;
            addForm.fallback_delta_c = 0.0;
            addForm.max_total_w = null;
            addForm.notes = '';
            addOpen.value = true;
            loadBarns();
        }
        async function createZone() {
            if (!addForm.name.trim()) {
                showToast('Tên zone không được rỗng', 'error');
                return;
            }
            try {
                addSaving.value = true;
                await API.brooder.zones.create({
                    barn_id: addForm.barn_id || null,
                    name: addForm.name.trim(),
                    manual_setpoint: addForm.manual_setpoint,
                    fallback_delta_c: Number(addForm.fallback_delta_c) || 0.0,
                    max_total_w: addForm.max_total_w || null,
                    notes: addForm.notes.trim() || null,
                });
                showToast('Đã tạo zone', 'success');
                addOpen.value = false;
                await pollZones();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                addSaving.value = false;
            }
        }

        // ── Click → navigate to detail ────────────────────────
        function openZone(id) {
            // `router` lives in app.js module scope (invisible from here),
            // so always navigate via window.location.hash. Vue Router picks
            // up the hash change and loads brooder-detail.js (props: true).
            window.location.hash = '#/brooder/' + id;
        }

        // ── Lifecycle ─────────────────────────────────────────
        onMounted(async () => {
            try {
                loading.value = true;
                await pollZones();
            } finally {
                loading.value = false;
            }
            startPolling();
        });
        onUnmounted(() => stopPolling());

        // ── Template ──────────────────────────────────────────
        return {
            zones, loading, refreshing, lastUpdated,
            totalZones, totalHeaters, anyFailsafe,
            statusClass, statusText,
            addOpen, addSaving, addForm, barns,
            openAddForm, createZone,
            reloadAll, openZone, fmtNum, fmtDate,
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
                    <p class="cf-subtitle">Zone-based PID &middot; 1 zone = 1 thermal control unit</p>
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
                <button class="cf-btn-primary cf-btn-sm" @click="openAddForm">
                    + Thêm zone
                </button>
            </div>
        </div>

        <!-- Skeleton first load -->
        <div v-if="loading" class="cf-cards-grid">
            <div v-for="i in 3" :key="i" class="cf-barn-card animate-pulse">
                <div class="cf-card-content">
                    <div class="h-3 bg-gray-200 rounded w-1/3 mb-3"></div>
                    <div class="h-8 bg-gray-200 rounded w-1/2 mb-3"></div>
                    <div class="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
            </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="!zones.length" class="cf-empty-box">
            <div class="cf-empty-icon">&#128293;</div>
            <div class="cf-empty-title">Chưa có zone brooder</div>
            <div class="cf-empty-desc">
                Zone = 1 PID + N heaters (N ESP32 &times; 2 chảo) + M sensor tham chiếu.
                Bấm <b>+ Thêm zone</b> để tạo zone đầu tiên.
            </div>
        </div>

        <!-- Summary strip -->
        <div v-else class="cf-brooder-summary-strip">
            <div class="cf-brooder-summary-stat">
                <span class="cf-brooder-summary-num">{{ totalZones }}</span>
                <span class="cf-brooder-summary-label">Zone</span>
            </div>
            <div class="cf-brooder-summary-stat">
                <span class="cf-brooder-summary-num">{{ totalHeaters }}</span>
                <span class="cf-brooder-summary-label">Heater đang bật</span>
            </div>
            <div class="cf-brooder-summary-stat"
                 :class="anyFailsafe ? 'is-warn' : ''">
                <span class="cf-brooder-summary-num">{{ zones.filter(z => z.online).length }}</span>
                <span class="cf-brooder-summary-label">Zone online</span>
            </div>
            <div v-if="anyFailsafe" class="cf-brooder-summary-stat is-warn">
                <span class="cf-brooder-summary-num">!</span>
                <span class="cf-broeder-summary-label">Failsafe / Stale</span>
            </div>
        </div>

        <!-- Zone cards grid -->
        <div v-if="!loading && zones.length" class="cf-cards-grid mt-4">
            <div v-for="z in zones" :key="z.id"
                 class="cf-barn-card cf-brooder-zone-card"
                 @click="openZone(z.id)">
                <div class="cf-brooder-zone-banner"
                     :class="z.mode === 'failsafe' ? 'is-failsafe'
                             : z.mode === 'stale' ? 'is-stale'
                             : z.online ? 'is-online' : 'is-offline'">
                </div>
                <div class="cf-card-content">
                    <div class="cf-card-top-row">
                        <div class="cf-card-identity">
                            <div class="cf-card-icon-box"
                                 :style="z.online ? 'background:#fffbeb;color:#d97706;' : 'background:#f1f5f9;color:#64748b;'">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                                </svg>
                            </div>
                            <div>
                                <h3 class="cf-card-title">{{ z.name }}</h3>
                                <div class="cf-card-meta-line">
                                    <span v-if="z.barn_name">Trại {{ z.barn_name }}</span>
                                    <span v-else class="cf-text-muted">Chưa gán trại</span>
                                </div>
                            </div>
                        </div>
                        <span v-if="z.manual_setpoint != null"
                              class="cf-badge cf-badge-yellow">Manual</span>
                        <span v-else class="cf-badge cf-badge-green">Auto</span>
                    </div>

                    <!-- KPI inline -->
                    <div class="cf-brooder-zone-kpi-row mt-3">
                        <div class="cf-brooder-zone-kpi">
                            <div class="cf-brooder-zone-kpi-label">Nhiệt zone</div>
                            <div class="cf-brooder-zone-kpi-val">
                                <span v-if="z.last_zone_temp != null">{{ fmtNum(z.last_zone_temp, 1) }}&deg;</span>
                                <span v-else class="cf-text-muted">&mdash;</span>
                            </div>
                        </div>
                        <div class="cf-brooder-zone-kpi">
                            <div class="cf-brooder-zone-kpi-label">Setpoint</div>
                            <div class="cf-brooder-zone-kpi-val">
                                <span v-if="z.effective_setpoint != null">{{ fmtNum(z.effective_setpoint, 1) }}&deg;</span>
                                <span v-else class="cf-text-muted">&mdash;</span>
                            </div>
                        </div>
                        <div class="cf-brooder-zone-kpi">
                            <div class="cf-brooder-zone-kpi-label">Công suất</div>
                            <div class="cf-brooder-zone-kpi-val">
                                <span v-if="z.last_power_total_pct != null">{{ fmtNum(z.last_power_total_pct, 0) }}%</span>
                                <span v-else class="cf-text-muted">&mdash;</span>
                            </div>
                        </div>
                    </div>

                    <!-- Footer: count + status -->
                    <div class="cf-brooder-zone-footer mt-3">
                        <div class="cf-text-muted text-xs">
                            {{ z.heater_count || 0 }} heater
                            &middot; {{ z.member_count || 0 }} ESP32
                            <span v-if="z.zone_sensors_count > 0">
                                &middot; {{ z.zone_sensors_count }} sensor
                            </span>
                        </div>
                        <div>
                            <span :class="['cf-badge', lastSeenClass(z.last_seen_seconds)]"
                                  :title="z.last_telemetry_at
                                          ? 'Cập nhật lúc ' + z.last_telemetry_at
                                          : 'Chưa từng nhận telemetry'">
                                {{ formatLastSeen(z.last_seen_seconds) }}
                            </span>
                            <span v-if="z.mode === 'failsafe'"
                                  class="cf-badge cf-badge-red ml-1">FS</span>
                            <span v-else-if="z.mode === 'stale'"
                                  class="cf-badge cf-badge-yellow ml-1">stale</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add-zone modal -->
        <div v-if="addOpen" class="cf-modal-backdrop" @click.self="addOpen = false">
            <div class="cf-modal">
                <div class="cf-modal-header">
                    <div class="cf-modal-title">Tạo zone mới</div>
                    <button class="cf-btn cf-btn-ghost cf-btn-sm" @click="addOpen = false">&#10005;</button>
                </div>
                <div class="cf-modal-body">
                    <div class="cf-form-group">
                        <label class="cf-label">Tên zone *</label>
                        <input type="text" v-model="addForm.name" class="cf-input"
                               placeholder="VD: Trại 4 - Zone A" maxlength="100">
                    </div>
                    <div class="cf-form-group">
                        <label class="cf-label">Trại</label>
                        <select v-model.number="addForm.barn_id" class="cf-select">
                            <option :value="null">— Không gán —</option>
                            <option v-for="b in barns" :key="b.id" :value="b.id">
                                {{ b.name }} (#{{ b.id }})
                            </option>
                        </select>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="cf-form-group">
                            <label class="cf-label">Manual setpoint (&deg;C)</label>
                            <input type="number" v-model.number="addForm.manual_setpoint"
                                   step="0.1" min="0" max="45" class="cf-input"
                                   placeholder="null = theo ngày tuổi">
                        </div>
                        <div class="cf-form-group">
                            <label class="cf-label">Fallback delta (&deg;C)</label>
                            <input type="number" v-model.number="addForm.fallback_delta_c"
                                   step="0.1" min="-5" max="5" class="cf-input">
                        </div>
                    </div>
                    <div class="cf-form-group">
                        <label class="cf-label">Tổng công suất tối đa (W)</label>
                        <input type="number" v-model.number="addForm.max_total_w"
                               step="100" min="0" class="cf-input"
                               placeholder="optional cap">
                    </div>
                    <div class="cf-form-group">
                        <label class="cf-label">Ghi chú</label>
                        <textarea v-model="addForm.notes" class="cf-input"
                                  rows="2" placeholder="optional"></textarea>
                    </div>
                </div>
                <div class="cf-modal-footer">
                    <button class="cf-btn cf-btn-ghost cf-btn-sm"
                            :disabled="addSaving" @click="addOpen = false">Huỷ</button>
                    <button class="cf-btn-primary cf-btn-sm"
                            :disabled="addSaving" @click="createZone">
                        <span v-if="addSaving">&#9203;</span>
                        Tạo zone
                    </button>
                </div>
            </div>
        </div>
    </div>
    `,
};