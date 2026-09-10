/**
 * Security Dashboard — anti-theft / person detection (Phase 1)
 *
 * Layout (per docs/ui_style_guide.md §4.2 Dashboard + KPI Grid):
 *   - Header bar: status pill (running / stopped / error) + Arm-all/Disarm-all
 *   - 4 KPI cards: Zones armed, Events today, Unacked events, Cameras offline
 *   - 2-col dashboard:
 *       Main : event feed — thumbnail, camera, ts, confidence, ACK button
 *       Side : zones list — armed toggle inline + settings (modal edit)
 *
 * Modal patterns:
 *   - Zone edit: create/update (camera select, threshold slider, etc.)
 *   - Disarm confirm: narrow .cf-modal-narrow
 *
 * Polling:
 *   - Status: every 10s (worker_alive, queue_size, stats)
 *   - Events: every 3s (when at least one zone is armed)
 *   - Zones: every 30s (rarely changes)
 *
 * Conventions:
 *   - API.security.* (added to static/js/api.js)
 *   - fmtNum(), fmtDate(), showToast() — global from app.js, do not redefine
 *   - Skeleton first load → spinner refresh
 *   - Vietnamese labels
 */

const { ref, computed, onMounted, onUnmounted, reactive, watch } = Vue;


export default {
    setup() {
        // ── State ─────────────────────────────────────────────
        const status = ref(null);
        const zones = ref([]);
        const events = ref([]);
        const cameras = ref([]);
        const devices = ref([]);                // for siren device selector
        const loading = ref(true);
        const refreshing = ref(false);
        const lastUpdated = ref(null);

        // Edit modal state
        const editModal = reactive({
            open: false,
            mode: 'create',                     // 'create' | 'edit'
            saving: false,
            form: emptyZoneForm(),
        });

        // Disarm-all confirm modal
        const disarmModal = reactive({ open: false });

        // Snapshot preview modal
        const snapModal = reactive({ open: false, url: null, title: '' });

        // ── Relay (Telegram notification channel via Cloudflare Worker) ──
        const relay = ref(null);
        const relayModal = reactive({ open: false, busy: false, payload: null });

        // ── Polling ───────────────────────────────────────────
        let statusTimer = null;
        let eventTimer = null;
        let zoneTimer = null;
        let relayTimer = null;

        function emptyZoneForm() {
            return {
                id: null,
                name: '',
                camera_id: '',
                enabled: true,
                armed: false,
                motion_threshold: 0.05,
                yolo_confidence: 0.30,
                cooldown_seconds: 60,
                trigger_siren: false,
                siren_device_id: null,
                siren_channel: null,
                siren_duration_seconds: 30,
                notes: '',
            };
        }

        async function loadAll() {
            try {
                const [st, zs, cs, ds] = await Promise.all([
                    API.security.status().catch(() => null),
                    API.security.zones().catch(() => []),
                    API.cameras.list().catch(() => []),
                    API.devices.list().catch(() => []),
                ]);
                if (st) status.value = st;
                zones.value = zs || [];
                cameras.value = cs || [];
                devices.value = ds || [];
                lastUpdated.value = new Date();
            } catch (e) {
                console.warn('security loadAll error:', e);
            }
        }

        // ── Relay (Telegram notification channel) ────────────
        async function loadRelay() {
            try {
                relay.value = await API.relay.status();
            } catch (e) {
                console.warn('relay status error:', e);
                relay.value = { configured: false, error: String(e) };
            }
        }

        async function openBindModal() {
            relayModal.busy = true;
            relayModal.payload = null;
            relayModal.open = true;
            try {
                relayModal.payload = await API.relay.bindToken('admin');
            } catch (e) {
                showToast(`Không tạo được token: ${e.message}`, 'error');
            } finally {
                relayModal.busy = false;
            }
        }

        function closeBindModal() {
            relayModal.open = false;
            relayModal.payload = null;
        }

        async function testRelay() {
            try {
                const r = await API.relay.test();
                showToast(r.message || 'Đã gửi test qua Worker.', 'success');
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        function copyToClipboard(text, label = 'Link') {
            navigator.clipboard?.writeText(text).then(
                () => showToast(`Đã copy ${label}`, 'success'),
                () => showToast('Copy thất bại — chọn thủ công.', 'error')
            );
        }

        async function loadEvents() {
            try {
                events.value = await API.security.events({ limit: 100 });
            } catch (e) {
                console.warn('security loadEvents error:', e);
            }
        }

        async function pollStatus() {
            try {
                const st = await API.security.status().catch(() => null);
                if (st) status.value = st;
            } catch (e) { /* silent */ }
        }

        async function refresh() {
            try {
                refreshing.value = true;
                await Promise.all([loadAll(), loadEvents()]);
            } finally {
                refreshing.value = false;
            }
        }

        // Light polling — events only when something is armed
        watch(armedCount, (n) => {
            if (n > 0) startEventPolling();
            else stopEventPolling();
        });

        function startStatusPolling() {
            stopStatusPolling();
            statusTimer = setInterval(pollStatus, 10000);
        }
        function stopStatusPolling() {
            if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
        }

        function startEventPolling() {
            stopEventPolling();
            eventTimer = setInterval(loadEvents, 3000);
        }
        function stopEventPolling() {
            if (eventTimer) { clearInterval(eventTimer); eventTimer = null; }
        }

        function startZonePolling() {
            stopZonePolling();
            zoneTimer = setInterval(async () => {
                try {
                    zones.value = await API.security.zones();
                } catch (e) { /* silent */ }
            }, 30000);
        }
        function stopZonePolling() {
            if (zoneTimer) { clearInterval(zoneTimer); zoneTimer = null; }
        }

        // ── Computed ──────────────────────────────────────────
        const armedCount = computed(() => zones.value.filter(z => z.armed).length);

        const todayCount = computed(() => {
            const today = new Date().toISOString().slice(0, 10);
            return events.value.filter(e => (e.time || '').slice(0, 10) === today).length;
        });

        const unackCount = computed(() =>
            events.value.filter(e => !e.acknowledged_at).length
        );

        // Cameras referenced by zones but not in the cameras list → "offline"
        const offlineCameras = computed(() => {
            const knownIds = new Set(cameras.value.map(c => c.id));
            return zones.value
                .filter(z => !knownIds.has(z.camera_id))
                .map(z => z.camera_id);
        });

        const statusClass = computed(() => {
            if (!status.value) return 'is-unknown';
            if (!status.value.running) return 'is-disconnected';
            if (!status.value.model_loaded) return 'is-error';
            return 'is-connected';
        });

        const statusText = computed(() => {
            if (!status.value) return 'Đang khởi động…';
            if (!status.value.running) return 'Đã dừng';
            if (!status.value.model_loaded) return 'Lỗi model YOLO';
            return 'Đang chạy';
        });

        const camNameById = computed(() => {
            const m = {};
            for (const c of cameras.value) m[c.id] = c.name || c.id;
            return m;
        });
        function cameraLabel(id) {
            return camNameById.value[id] || id;
        }

        // Color zone by armed state
        function zoneBadge(zone) {
            if (!zone.enabled) return { label: 'Tắt', cls: 'badge-gray' };
            if (zone.armed) return { label: 'Đang bật', cls: 'badge-green' };
            return { label: 'Sẵn sàng', cls: 'badge-blue' };
        }

        // Confidence → bar color
        function confClass(c) {
            if (c == null) return 'is-unknown';
            if (c < 0.4) return 'is-low';
            if (c < 0.7) return 'is-med';
            return 'is-high';
        }

        function fmtTime(iso) {
            if (!iso) return '—';
            try {
                const d = new Date(iso);
                return d.toLocaleString('vi-VN', {
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    day: '2-digit', month: '2-digit',
                });
            } catch { return iso; }
        }

        // ── Arm/Disarm actions ────────────────────────────────
        async function toggleArm(zone) {
            try {
                if (zone.armed) {
                    await API.security.disarm(zone.id);
                    showToast(`Đã tắt an ninh: ${zone.name}`, 'info');
                } else {
                    await API.security.arm(zone.id);
                    showToast(`Đã bật an ninh: ${zone.name}`, 'success');
                }
                await loadAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        function openDisarmAllConfirm() {
            if (armedCount.value === 0) {
                showToast('Không có zone nào đang bật.', 'info');
                return;
            }
            disarmModal.open = true;
        }

        async function confirmDisarmAll() {
            try {
                const ids = zones.value.filter(z => z.armed).map(z => z.id);
                await Promise.all(ids.map(id => API.security.disarm(id)));
                showToast(`Đã tắt ${ids.length} zone.`, 'info');
                disarmModal.open = false;
                await loadAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        // ── Edit modal ────────────────────────────────────────
        function openCreate() {
            editModal.mode = 'create';
            editModal.form = emptyZoneForm();
            if (cameras.value.length && !editModal.form.camera_id) {
                editModal.form.camera_id = cameras.value[0].id;
            }
            editModal.open = true;
        }

        function openEdit(zone) {
            editModal.mode = 'edit';
            editModal.form = {
                id: zone.id,
                name: zone.name,
                camera_id: zone.camera_id,
                enabled: zone.enabled,
                armed: zone.armed,
                motion_threshold: zone.motion_threshold,
                yolo_confidence: zone.yolo_confidence,
                cooldown_seconds: zone.cooldown_seconds,
                trigger_siren: zone.trigger_siren,
                siren_device_id: zone.siren_device_id,
                siren_channel: zone.siren_channel,
                siren_duration_seconds: zone.siren_duration_seconds,
                notes: zone.notes || '',
            };
            editModal.open = true;
        }

        function closeEdit() {
            editModal.open = false;
        }

        async function saveZone() {
            const f = editModal.form;
            if (!f.name || !f.camera_id) {
                showToast('Vui lòng nhập tên và chọn camera.', 'error');
                return;
            }
            editModal.saving = true;
            try {
                if (editModal.mode === 'create') {
                    await API.security.createZone({
                        name: f.name,
                        camera_id: f.camera_id,
                        enabled: f.enabled,
                        armed: f.armed,
                        motion_threshold: Number(f.motion_threshold),
                        yolo_confidence: Number(f.yolo_confidence),
                        cooldown_seconds: Number(f.cooldown_seconds),
                        trigger_siren: f.trigger_siren,
                        siren_device_id: f.trigger_siren && f.siren_device_id ? Number(f.siren_device_id) : null,
                        siren_channel: f.trigger_siren && f.siren_channel !== null ? Number(f.siren_channel) : null,
                        siren_duration_seconds: Number(f.siren_duration_seconds),
                        notes: f.notes || null,
                    });
                    showToast('Đã tạo zone.', 'success');
                } else {
                    await API.security.updateZone(f.id, {
                        name: f.name,
                        enabled: f.enabled,
                        armed: f.armed,
                        motion_threshold: Number(f.motion_threshold),
                        yolo_confidence: Number(f.yolo_confidence),
                        cooldown_seconds: Number(f.cooldown_seconds),
                        trigger_siren: f.trigger_siren,
                        siren_device_id: f.trigger_siren && f.siren_device_id ? Number(f.siren_device_id) : null,
                        siren_channel: f.trigger_siren && f.siren_channel !== null ? Number(f.siren_channel) : null,
                        siren_duration_seconds: Number(f.siren_duration_seconds),
                        notes: f.notes || null,
                    });
                    showToast('Đã cập nhật zone.', 'success');
                }
                editModal.open = false;
                await loadAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                editModal.saving = false;
            }
        }

        async function deleteZone(zone) {
            if (!confirm(`Xóa zone "${zone.name}"? (Toàn bộ events của zone này cũng sẽ bị xóa)`)) return;
            try {
                await API.security.deleteZone(zone.id);
                showToast('Đã xóa zone.', 'info');
                await loadAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        // ── Acknowledge event ─────────────────────────────────
        async function ackEvent(ev) {
            try {
                await API.security.ackEvent(ev.id);
                showToast('Đã xác nhận sự kiện.', 'success');
                await loadEvents();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        // ── Snapshot modal ────────────────────────────────────
        function openSnapshot(ev) {
            snapModal.open = true;
            snapModal.url = ev.snapshot_url;
            snapModal.title = `${ev.zone_name || 'Zone'} · ${cameraLabel(ev.camera_id)} · ${fmtTime(ev.time)}`;
        }
        function closeSnapshot() {
            snapModal.open = false;
            snapModal.url = null;
        }

        // ── Test alert ────────────────────────────────────────
        async function testAlert(zone) {
            try {
                await API.security.testAlert(zone.id);
                showToast(`Đã gửi test notification cho zone "${zone.name}".`, 'success');
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        // ── Lifecycle ─────────────────────────────────────────
        onMounted(async () => {
            loading.value = true;
            try {
                await Promise.all([loadAll(), loadEvents(), loadRelay()]);
            } finally {
                loading.value = false;
            }
            startStatusPolling();
            startZonePolling();
            if (armedCount.value > 0) startEventPolling();
            // Relay status refresh — 30s cadence, separate from event polling
            relayTimer = setInterval(loadRelay, 30000);
        });

        onUnmounted(() => {
            stopStatusPolling();
            stopZonePolling();
            stopEventPolling();
            if (relayTimer) { clearInterval(relayTimer); relayTimer = null; }
        });

        return {
            // state
            zones, status, events, cameras, loading, refreshing, lastUpdated,
            editModal, disarmModal, snapModal, devices,
            relay, relayModal,
            // computed
            armedCount, todayCount, unackCount, offlineCameras,
            statusClass, statusText,
            // helpers
            fmtTime, fmtNum, zoneBadge, confClass, cameraLabel,
            // actions
            refresh, toggleArm, openDisarmAllConfirm, confirmDisarmAll,
            openCreate, openEdit, closeEdit, saveZone, deleteZone,
            ackEvent, openSnapshot, closeSnapshot, testAlert,
            openBindModal, closeBindModal, testRelay, copyToClipboard,
        };
    },

    template: `
    <div class="cf-container">

        <!-- Header -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                         fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">An ninh · Chống trộm</h1>
                    <p class="cf-subtitle">Phát hiện người bằng camera + YOLO — Phase 1: bật/tắt thủ công</p>
                </div>
            </div>
            <div class="cf-header-right">
                <span class="cf-inverter-status" :class="statusClass">
                    <span class="cf-inverter-status-dot"></span>
                    {{ statusText }}
                </span>
                <button v-if="armedCount > 0" @click="openDisarmAllConfirm"
                        class="cf-btn-sm cf-btn-danger">
                    ⏹ Tắt an ninh ({{ armedCount }})
                </button>
                <button v-else @click="openCreate"
                        class="cf-btn-sm cf-btn-primary">
                    + Thêm zone
                </button>
                <button @click="refresh" class="cf-btn-sm cf-btn-secondary" :disabled="refreshing">
                    <span v-if="refreshing" class="cf-spinner cf-spinner-sm"></span>
                    <span v-else>🔄</span>
                    Tải lại
                </button>
            </div>
        </div>

        <!-- 📡 Kênh thông báo (Cloudflare Worker relay → Telegram) -->
        <div class="cf-cfrelay-card" :class="relay && relay.configured ? 'cf-cfrelay-ok' : 'cf-cfrelay-warn'">
            <div class="cf-cfrelay-icon">📡</div>
            <div class="cf-cfrelay-body">
                <div class="cf-cfrelay-title">
                    Kênh thông báo (Telegram)
                    <span v-if="relay && relay.configured" class="cf-cfrelay-status">✅ Đã cấu hình</span>
                    <span v-else class="cf-cfrelay-status warn">⚠ Chưa cấu hình</span>
                </div>
                <div class="cf-cfrelay-sub">
                    <template v-if="relay && relay.configured">
                        Worker: <code>{{ relay.worker_url }}</code>
                        · Ngưỡng: {{ relay.severity_threshold }}
                        · Đã gửi: {{ relay.stats?.delivered || 0 }}
                        · Lỗi: {{ relay.stats?.failed || 0 }}
                    </template>
                    <template v-else>
                        Cấu hình <code>cf_relay</code> trong <code>config/cameras.yaml</code> và deploy Cloudflare Worker (<code>cfarm-relay/README.md</code>) để nhận cảnh báo trên Telegram.
                    </template>
                </div>
            </div>
            <div class="cf-cfrelay-actions">
                <button v-if="relay && relay.configured" @click="openBindModal"
                        class="cf-btn-sm cf-btn-primary">📨 Bind Telegram</button>
                <button v-if="relay && relay.configured" @click="testRelay"
                        class="cf-btn-sm cf-btn-secondary">🧪 Test</button>
            </div>
        </div>

        <!-- KPI cards -->
        <div v-if="loading && !status" class="cf-inverter-kpi-grid">
            <div v-for="n in 4" :key="n" class="cf-inverter-kpi animate-pulse">
                <div class="cf-inverter-kpi-icon" style="background:#e5e7eb;"></div>
                <div class="cf-inverter-kpi-body">
                    <div class="cf-inverter-kpi-label" style="background:#e5e7eb;height:12px;width:80px;border-radius:4px;"></div>
                    <div class="cf-inverter-kpi-value" style="background:#e5e7eb;height:24px;width:60%;margin-top:8px;border-radius:4px;"></div>
                </div>
            </div>
        </div>

        <div v-else class="cf-inverter-kpi-grid">
            <!-- Zones armed -->
            <div class="cf-inverter-kpi">
                <div class="cf-inverter-kpi-icon" style="background: linear-gradient(135deg, #34d399 0%, #059669 100%);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                         fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 12l2 2 4-4"/>
                        <circle cx="12" cy="12" r="10"/>
                    </svg>
                </div>
                <div class="cf-inverter-kpi-body">
                    <div class="cf-inverter-kpi-label">Zone đang bật</div>
                    <div class="cf-inverter-kpi-value">
                        {{ fmtNum(armedCount) }} <span class="cf-inverter-kpi-unit">/ {{ fmtNum(zones.length) }}</span>
                    </div>
                    <div class="cf-inverter-kpi-sub">{{ fmtNum(zones.length) }} zone tổng cộng</div>
                </div>
            </div>

            <!-- Events today -->
            <div class="cf-inverter-kpi">
                <div class="cf-inverter-kpi-icon" style="background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                         fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                </div>
                <div class="cf-inverter-kpi-body">
                    <div class="cf-inverter-kpi-label">Phát hiện hôm nay</div>
                    <div class="cf-inverter-kpi-value">{{ fmtNum(todayCount) }}</div>
                    <div class="cf-inverter-kpi-sub">Sự kiện trong 100 events gần nhất</div>
                </div>
            </div>

            <!-- Unack events -->
            <div class="cf-inverter-kpi" :class="unackCount > 0 ? 'cf-inverter-discharging' : ''">
                <div class="cf-inverter-kpi-icon" :style="unackCount > 0
                    ? 'background: linear-gradient(135deg, #f87171 0%, #dc2626 100%);'
                    : 'background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                         fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                </div>
                <div class="cf-inverter-kpi-body">
                    <div class="cf-inverter-kpi-label">Chưa xác nhận</div>
                    <div class="cf-inverter-kpi-value">{{ fmtNum(unackCount) }}</div>
                    <div class="cf-inverter-kpi-sub" v-if="unackCount > 0">
                        <span class="cf-inverter-warn-text">⚠ Cần kiểm tra</span>
                    </div>
                    <div class="cf-inverter-kpi-sub" v-else>
                        ✓ Đã xử lý hết
                    </div>
                </div>
            </div>

            <!-- Cameras offline (referenced by zone but not in cameras list) -->
            <div class="cf-inverter-kpi" :class="offlineCameras.length > 0 ? 'cf-inverter-discharging' : ''">
                <div class="cf-inverter-kpi-icon" :style="offlineCameras.length > 0
                    ? 'background: linear-gradient(135deg, #fb923c 0%, #ea580c 100%);'
                    : 'background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                         fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M23 7l-7 5 7 5V7z"/>
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                    </svg>
                </div>
                <div class="cf-inverter-kpi-body">
                    <div class="cf-inverter-kpi-label">Camera không rõ</div>
                    <div class="cf-inverter-kpi-value">{{ fmtNum(offlineCameras.length) }}</div>
                    <div class="cf-inverter-kpi-sub" v-if="offlineCameras.length > 0">
                        <span class="cf-inverter-warn-text">{{ offlineCameras.join(', ') }}</span>
                    </div>
                    <div class="cf-inverter-kpi-sub" v-else>
                        ✓ Tất cả camera OK
                    </div>
                </div>
            </div>
        </div>

        <!-- Dashboard 2-col: events + zones -->
        <div class="dashboard-grid mt-6">

            <!-- Main: event feed -->
            <div class="dashboard-main">
                <div class="card">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-semibold text-primary">Sự kiện phát hiện người</h3>
                        <span class="text-xs text-gray-500" v-if="lastUpdated">
                            Cập nhật {{ fmtTime(lastUpdated.toISOString()) }}
                        </span>
                    </div>

                    <div v-if="!events.length && !loading" class="cf-empty-box">
                        <div class="cf-empty-icon">🛡️</div>
                        <p>Chưa có sự kiện nào. Khi có người bước vào camera đang bật, sự kiện sẽ xuất hiện ở đây.</p>
                    </div>

                    <ul v-else-if="events.length" class="cf-inv-alerts-list">
                        <li v-for="ev in events" :key="ev.id" class="cf-inv-alerts-item">
                            <div class="cf-inv-alerts-info">
                                <!-- Snapshot thumbnail -->
                                <div v-if="ev.snapshot_url"
                                     class="cf-sec-event-thumb"
                                     @click="openSnapshot(ev)"
                                     title="Click để xem ảnh lớn">
                                    <img :src="ev.snapshot_url" :alt="'Snapshot ' + ev.id"
                                         onerror="this.style.display='none'" />
                                </div>
                                <div v-else class="cf-sec-event-thumb cf-sec-event-thumb-empty">📷</div>

                                <div class="flex-1">
                                    <div class="flex items-center gap-2">
                                        <strong>{{ ev.zone_name || 'Zone #' + ev.zone_id }}</strong>
                                        <span class="text-xs text-gray-500">·</span>
                                        <span class="text-xs text-gray-500">{{ cameraLabel(ev.camera_id) }}</span>
                                        <span v-if="ev.acknowledged_at" class="badge badge-green text-xs">✓ Đã xác nhận</span>
                                    </div>
                                    <div class="text-xs text-gray-500 mt-1">
                                        {{ fmtTime(ev.time) }}
                                        <span v-if="ev.siren_triggered">· 🚨 Siren đã kích hoạt</span>
                                        <span v-if="ev.notification_sent">· 🔔 Đã thông báo</span>
                                    </div>
                                    <!-- Confidence bar -->
                                    <div class="cf-sec-confidence-bar" :class="confClass(ev.confidence)">
                                        <div class="cf-sec-confidence-fill"
                                             :style="'width:' + Math.round((ev.confidence || 0) * 100) + '%'"></div>
                                        <span class="cf-sec-confidence-label">
                                            Tin cậy {{ Math.round((ev.confidence || 0) * 100) }}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div class="cf-inv-alerts-right">
                                <button v-if="!ev.acknowledged_at"
                                        @click="ackEvent(ev)"
                                        class="cf-btn-sm cf-btn-primary">
                                    ✓ Xác nhận
                                </button>
                            </div>
                        </li>
                    </ul>

                    <div v-else class="text-center py-8 text-gray-400 text-sm">
                        Đang tải sự kiện…
                    </div>
                </div>
            </div>

            <!-- Side: zones list -->
            <div class="dashboard-side">
                <div class="card">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-semibold text-primary">Zone giám sát</h3>
                        <button @click="openCreate" class="cf-btn-sm cf-btn-secondary">
                            + Thêm
                        </button>
                    </div>

                    <div v-if="!zones.length && !loading" class="cf-empty-box">
                        <div class="cf-empty-icon">📹</div>
                        <p>Chưa có zone nào. Bấm <strong>+ Thêm</strong> để cấu hình camera đầu tiên.</p>
                    </div>

                    <ul v-else class="cf-sec-zone-list">
                        <li v-for="zone in zones" :key="zone.id" class="cf-sec-zone-row">
                            <div class="cf-sec-zone-info">
                                <div class="flex items-center gap-2">
                                    <strong>{{ zone.name }}</strong>
                                    <span :class="['badge text-xs', zoneBadge(zone).cls]">
                                        {{ zoneBadge(zone).label }}
                                    </span>
                                </div>
                                <div class="text-xs text-gray-500 mt-1">
                                    📹 {{ cameraLabel(zone.camera_id) }}
                                </div>
                                <div class="text-xs text-gray-400 mt-0.5">
                                    YOLO ≥ {{ Math.round((zone.yolo_confidence || 0) * 100) }}%
                                    · Cooldown {{ zone.cooldown_seconds }}s
                                    <span v-if="zone.trigger_siren">· 🚨 Siren</span>
                                </div>
                            </div>
                            <div class="cf-sec-zone-actions">
                                <button @click="toggleArm(zone)"
                                        :class="zone.armed ? 'cf-btn-sm cf-btn-danger' : 'cf-btn-sm cf-btn-primary'"
                                        :disabled="!zone.enabled"
                                        :title="zone.armed ? 'Tắt' : 'Bật'">
                                    {{ zone.armed ? '⏹' : '▶' }}
                                </button>
                                <button @click="openEdit(zone)" class="cf-btn-sm cf-btn-secondary" title="Cài đặt">⚙</button>
                                <button @click="testAlert(zone)" class="cf-btn-sm cf-btn-secondary" title="Test alert">🔔</button>
                                <button @click="deleteZone(zone)" class="cf-btn-sm cf-btn-danger" title="Xóa">🗑</button>
                            </div>
                        </li>
                    </ul>
                </div>

                <!-- Stats card -->
                <div class="card mt-4" v-if="status">
                    <h3 class="font-semibold text-primary mb-3">Worker</h3>
                    <dl class="cf-inverter-dl">
                        <dt>Model</dt>
                        <dd>{{ status.model_name }} ({{ status.device }})</dd>
                        <dt>Queue</dt>
                        <dd>{{ status.queue_size }} / {{ status.queue_capacity }}</dd>
                        <dt>Frames nhận</dt>
                        <dd>{{ fmtNum(status.stats.frames_received || 0) }}</dd>
                        <dt>Motion pass</dt>
                        <dd>{{ fmtNum(status.stats.motion_passes || 0) }}</dd>
                        <dt>YOLO runs</dt>
                        <dd>{{ fmtNum(status.stats.yolo_runs || 0) }}</dd>
                        <dt>Person phát hiện</dt>
                        <dd>{{ fmtNum(status.stats.persons_detected || 0) }}</dd>
                    </dl>
                </div>
            </div>
        </div>

        <!-- ── Zone edit modal ───────────────────────────────── -->
        <div v-if="editModal.open" class="cf-modal-overlay" @click.self="closeEdit">
            <div class="cf-modal-box">
                <div class="cf-modal-header">
                    <h3>{{ editModal.mode === 'create' ? '+ Thêm zone an ninh' : '⚙ Sửa zone an ninh' }}</h3>
                    <button @click="closeEdit" class="cf-modal-close">✕</button>
                </div>
                <div class="cf-modal-body">
                    <div class="cf-form-row">
                        <label class="cf-form-label">Tên zone *</label>
                        <input v-model="editModal.form.name" class="cf-input" placeholder="VD: Lối vào chính" />
                    </div>
                    <div class="cf-form-row">
                        <label class="cf-form-label">Camera *</label>
                        <select v-model="editModal.form.camera_id" class="cf-input"
                                :disabled="editModal.mode === 'edit'">
                            <option value="">-- Chọn camera --</option>
                            <option v-for="c in cameras" :key="c.id" :value="c.id">
                                {{ c.name || c.id }} ({{ c.id }})
                            </option>
                        </select>
                        <small v-if="editModal.mode === 'edit'" class="text-gray-400">
                            Không thể đổi camera sau khi tạo (mỗi camera chỉ có 1 zone).
                        </small>
                    </div>
                    <div class="cf-form-row cf-form-row-2">
                        <div>
                            <label class="cf-form-label">
                                Motion threshold: {{ editModal.form.motion_threshold }}
                            </label>
                            <input type="range" min="0.01" max="0.30" step="0.01"
                                   v-model.number="editModal.form.motion_threshold"
                                   class="cf-input-range" />
                            <small class="text-gray-400">Càng cao → càng chặt (ít cảnh báo giả)</small>
                        </div>
                        <div>
                            <label class="cf-form-label">
                                YOLO confidence: {{ editModal.form.yolo_confidence }}
                            </label>
                            <input type="range" min="0.10" max="0.80" step="0.05"
                                   v-model.number="editModal.form.yolo_confidence"
                                   class="cf-input-range" />
                            <small class="text-gray-400">Càng thấp → càng nhạy (chấp nhận nhầm người)</small>
                        </div>
                    </div>
                    <div class="cf-form-row">
                        <label class="cf-form-label">Cooldown (giây)</label>
                        <input type="number" min="10" max="600" v-model.number="editModal.form.cooldown_seconds"
                               class="cf-input" />
                        <small class="text-gray-400">Sau khi phát hiện, bỏ qua cảnh báo trong {{ editModal.form.cooldown_seconds }}s</small>
                    </div>
                    <div class="cf-form-row">
                        <label class="cf-form-label flex items-center gap-2">
                            <input type="checkbox" v-model="editModal.form.enabled" />
                            Kích hoạt zone (enabled)
                        </label>
                    </div>
                    <div class="cf-form-row">
                        <label class="cf-form-label flex items-center gap-2">
                            <input type="checkbox" v-model="editModal.form.armed" />
                            Bật ngay (armed) khi lưu
                        </label>
                    </div>

                    <hr class="my-3 border-gray-200" />
                    <h4 class="font-semibold mb-2">🚨 Siren (tùy chọn)</h4>
                    <div class="cf-form-row">
                        <label class="cf-form-label flex items-center gap-2">
                            <input type="checkbox" v-model="editModal.form.trigger_siren" />
                            Kích hoạt còi khi phát hiện người
                        </label>
                    </div>
                    <div v-if="editModal.form.trigger_siren" class="cf-form-row cf-form-row-2">
                        <div>
                            <label class="cf-form-label">Thiết bị (ESP32 relay)</label>
                            <select v-model.number="editModal.form.siren_device_id" class="cf-input">
                                <option :value="null">-- Chọn thiết bị --</option>
                                <option v-for="d in devices" :key="d.id" :value="d.id">
                                    {{ d.name || d.device_code || ('Device #' + d.id) }}
                                </option>
                            </select>
                        </div>
                        <div>
                            <label class="cf-form-label">Kênh relay</label>
                            <input type="number" min="1" max="8" v-model.number="editModal.form.siren_channel"
                                   class="cf-input" />
                        </div>
                    </div>
                    <div v-if="editModal.form.trigger_siren" class="cf-form-row">
                        <label class="cf-form-label">Thời gian kêu (giây)</label>
                        <input type="number" min="5" max="600" v-model.number="editModal.form.siren_duration_seconds"
                               class="cf-input" />
                    </div>

                    <div class="cf-form-row">
                        <label class="cf-form-label">Ghi chú</label>
                        <textarea v-model="editModal.form.notes" class="cf-input" rows="2"
                                  placeholder="VD: Zone cổng chính, giám sát 24/7 khi vắng nhà"></textarea>
                    </div>
                </div>
                <div class="cf-modal-footer">
                    <button @click="closeEdit" class="cf-btn cf-btn-secondary">Huỷ</button>
                    <button @click="saveZone" class="cf-btn cf-btn-primary" :disabled="editModal.saving">
                        <span v-if="editModal.saving" class="cf-spinner cf-spinner-sm"></span>
                        {{ editModal.saving ? 'Đang lưu…' : (editModal.mode === 'create' ? 'Tạo zone' : 'Lưu thay đổi') }}
                    </button>
                </div>
            </div>
        </div>

        <!-- ── Disarm-all confirm modal ──────────────────────── -->
        <div v-if="disarmModal.open" class="cf-modal-overlay" @click.self="disarmModal.open = false">
            <div class="cf-modal-box cf-modal-narrow">
                <div class="cf-modal-header">
                    <h3>⏹ Tắt tất cả zone an ninh?</h3>
                    <button @click="disarmModal.open = false" class="cf-modal-close">✕</button>
                </div>
                <div class="cf-modal-body">
                    <p>Có <strong>{{ armedCount }}</strong> zone đang bật an ninh. Bạn có chắc muốn tắt hết?</p>
                    <p class="text-xs text-gray-500 mt-2">Sau khi tắt, hệ thống sẽ không phát hiện người cho đến khi bạn bật lại từng zone.</p>
                </div>
                <div class="cf-modal-footer">
                    <button @click="disarmModal.open = false" class="cf-btn cf-btn-secondary">Huỷ</button>
                    <button @click="confirmDisarmAll" class="cf-btn cf-btn-danger">Tắt tất cả</button>
                </div>
            </div>
        </div>

        <!-- ── Snapshot modal ───────────────────────────────── -->
        <div v-if="snapModal.open" class="cf-modal-overlay" @click.self="closeSnapshot">
            <div class="cf-modal-box cf-sec-snapshot-modal">
                <div class="cf-modal-header">
                    <h3>📷 {{ snapModal.title }}</h3>
                    <button @click="closeSnapshot" class="cf-modal-close">✕</button>
                </div>
                <div class="cf-modal-body">
                    <img v-if="snapModal.url" :src="snapModal.url" alt="Snapshot" class="cf-sec-snapshot-img" />
                </div>
            </div>
        </div>

        <!-- ── Relay bind modal (Telegram) ────────────────────────── -->
        <div v-if="relayModal.open" class="cf-modal-overlay" @click.self="closeBindModal">
            <div class="cf-modal-box">
                <div class="cf-modal-header">
                    <h3>📨 Bind Telegram</h3>
                    <button @click="closeBindModal" class="cf-modal-close">✕</button>
                </div>
                <div class="cf-modal-body">
                    <div v-if="relayModal.busy" class="cf-cfrelay-bind-loading">
                        <div class="cf-spinner"></div>
                        <p>Đang tạo bind token...</p>
                    </div>
                    <div v-else-if="relayModal.payload">
                        <p class="text-sm text-gray-600 mb-3">
                            1. Mở Telegram, tìm bot <strong>@CFarmAlertBot</strong> (hoặc tên bot bạn đã tạo qua @BotFather).<br>
                            2. Gõ <code>/start</code> rồi gõ <code>/bind {{ relayModal.payload.token }}</code>.<br>
                            3. Bot sẽ tự đăng ký chat_id và gửi tin nhắn xác nhận.
                        </p>
                        <div class="cf-cfrelay-bind-token">
                            <span class="cf-cfrelay-bind-token-label">Bind token (TTL 5 phút):</span>
                            <code class="cf-cfrelay-bind-token-value">{{ relayModal.payload.token }}</code>
                            <button @click="copyToClipboard(relayModal.payload.token, 'token')"
                                    class="cf-btn-sm cf-btn-secondary">📋 Copy</button>
                        </div>
                        <div class="cf-cfrelay-bind-url mt-3" v-if="relayModal.payload.bind_url">
                            <span class="cf-cfrelay-bind-token-label">Hoặc mở link (cần thêm <code>&amp;chat_id=...</code>):</span>
                            <code class="cf-cfrelay-bind-token-value cf-cfrelay-bind-url-value">{{ relayModal.payload.bind_url }}</code>
                            <button @click="copyToClipboard(relayModal.payload.bind_url, 'link')"
                                    class="cf-btn-sm cf-btn-secondary">📋 Copy</button>
                        </div>
                        <details class="mt-3">
                            <summary class="text-xs text-gray-500 cursor-pointer">Hướng dẫn tạo Telegram bot</summary>
                            <ol class="text-xs text-gray-600 mt-2 pl-4 list-decimal space-y-1">
                                <li>Tìm <strong>@BotFather</strong> trên Telegram.</li>
                                <li>Gõ <code>/newbot</code>, đặt tên + username (phải kết thúc bằng <code>_bot</code>).</li>
                                <li>Copy bot token, dán vào <code>wrangler secret put TELEGRAM_BOT_TOKEN</code>.</li>
                                <li>Deploy: <code>npx wrangler deploy</code> trong thư mục <code>cfarm-relay/</code>.</li>
                                <li>Dán <code>worker_url</code> + <code>shared_secret</code> vào <code>config/cameras.yaml</code>.</li>
                            </ol>
                        </details>
                    </div>
                    <div v-else>
                        <p class="text-red-600">Không lấy được bind token từ Worker. Kiểm tra log server.</p>
                    </div>
                </div>
                <div class="cf-modal-footer">
                    <button @click="closeBindModal" class="cf-btn cf-btn-secondary">Đóng</button>
                </div>
            </div>
        </div>

    </div>
    `
};