/**
 * Devices Page V2 - Quản lý thiết bị IoT & Tủ điều khiển ESP32
 * - Quản lý thiết bị theo chuồng (Grid) và Danh sách (List)
 * - Quản lý Danh mục Loại thiết bị IoT
 * - Tự động sinh Firmware ESP32 (.ino C++) trực tuyến
 * - Semantic .cf-* CSS classes
 */
const { ref, reactive, computed, onMounted, onUnmounted } = Vue;

export default{
    setup() {
        // ── State ──────────────────────────────────────
        const devices = ref([]);
        const types = ref([]);
        const barns = ref([]);
        const tab = ref('grid');
        const showModal = ref(false);
        const showTypeModal = ref(false);
        const showFirmwareModal = ref(false);
        const form = ref({});
        const typeForm = ref({});
        const activeDropdown = ref(null);
        const deviceStates = ref({});
        const firmwareDevice = ref(null);
        const firmwareCode = ref('');
        const firmwareLoading = ref(false);
        const firmwareError = ref('');

        // MQ Tare state
        const showTareModal = ref(false);
        const tareDevice = ref(null);
        const tareStatuses = ref([]);         // result of /status/{id}
        const tareCountdown = ref(0);          // seconds remaining
        const tarePoller = ref(null);
        const tareLoading = ref(false);

        // Health-flag tooltip state (per device)
        const healthTipDevice = ref(null);

        // ── Computed ───────────────────────────────────
        const barnsWithDevices = computed(() => {
            const groups = {};
            devices.value.forEach(d => {
                const barnId = d.barn_id || '_unassigned';
                if (!groups[barnId]) {
                    const barnObj = barns.value.find(b => b.id === barnId);
                    groups[barnId] = {
                        id: barnId,
                        name: barnObj ? barnObj.name : 'Chưa gán chuồng',
                        devices: [],
                        onlineCount: 0,
                        offlineCount: 0
                    };
                }
                groups[barnId].devices.push(d);
                if (d.is_online) groups[barnId].onlineCount++;
                else groups[barnId].offlineCount++;
            });
            return Object.values(groups);
        });

        // ── Methods ────────────────────────────────────
        function toggleDropdown(id) {
            activeDropdown.value = activeDropdown.value === id ? null : id;
        }

        function getRelayState(device, channel) {
            const key = `${device.id}-${channel}`;
            return deviceStates.value[key] === true;
        }

        async function toggleRelay(device, channel) {
            const key = `${device.id}-${channel}`;
            const curState = deviceStates.value[key] || false;
            const newState = !curState;

            try {
                await API.relay.send({
                    device_topic: device.mqtt_topic,
                    channel: channel,
                    state: newState ? 'on' : 'off'
                });
                deviceStates.value[key] = newState;
                if (typeof showToast === 'function') {
                    showToast(`K${channel} → ${newState ? 'BẬT' : 'TẮT'} thành công`, 'success');
                }
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast(e.message || 'Lỗi gửi lệnh rơ-le', 'error');
                }
            }
        }

        function timeAgo(time) {
            if (!time) return 'Chưa có tín hiệu';
            const diff = Date.now() - new Date(time).getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return 'Vừa nhận';
            if (mins < 60) return `${mins} phút trước`;
            const hours = Math.floor(mins / 60);
            if (hours < 24) return `${hours} giờ trước`;
            return `${Math.floor(hours / 24)} ngày trước`;
        }

        async function load() {
            try {
                const [devsRes, typesRes, barnsRes] = await Promise.all([
                    API.devices.list(),
                    API.devices.types.list(),
                    API.barns.list()
                ]);
                devices.value = devsRes || [];
                types.value = typesRes || [];
                barns.value = barnsRes || [];

                devices.value.forEach(d => {
                    const found = barns.value.find(b => b.id === d.barn_id);
                    d.barn_name = found ? found.name : 'Chưa gán';
                    const tFound = types.value.find(t => t.id === d.device_type_id);
                    d.type_name = tFound ? tFound.name : 'Không xác định';
                    d.channel_count = tFound ? tFound.channel_count : 0;
                });

                for (const d of devices.value) {
                    if (d.channel_count > 0) {
                        try {
                            const states = await API.devices.states(d.id);
                            for (let ch = 1; ch <= d.channel_count; ch++) {
                                const key = `${d.id}-${ch}`;
                                if (deviceStates.value[key] === undefined) {
                                    deviceStates.value[key] = states[ch] || false;
                                }
                            }
                        } catch (e) {
                            for (let ch = 1; ch <= d.channel_count; ch++) {
                                const key = `${d.id}-${ch}`;
                                if (deviceStates.value[key] === undefined) {
                                    deviceStates.value[key] = false;
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Lỗi nạp thiết bị IoT:', e);
            }
        }

        async function openFirmwareModal(d) {
            firmwareDevice.value = d;
            firmwareCode.value = '';
            firmwareError.value = '';
            firmwareLoading.value = true;
            showFirmwareModal.value = true;

            try {
                const result = await API.firmware.generate(d.id);
                if (result && result.code) {
                    firmwareCode.value = result.code;
                } else {
                    firmwareError.value = result.message || 'Thiết bị chưa có cấu hình chân rơ-le';
                }
            } catch (e) {
                firmwareError.value = e.message || 'Lỗi khởi tạo mã firmware';
            } finally {
                firmwareLoading.value = false;
            }
        }

        function downloadFirmware() {
            if (!firmwareCode.value || !firmwareDevice.value) return;
            const blob = new Blob([firmwareCode.value], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${firmwareDevice.value.device_code}_firmware.ino`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            if (typeof showToast === 'function') showToast('Đã tải file firmware ESP32 (.ino)!', 'success');
        }

        function openForm(d = null) {
            if (d) {
                form.value = { ...d };
            } else {
                const randomId = Math.floor(1000 + Math.random() * 9000);
                const code = `esp32-${randomId}`;
                form.value = {
                    device_code: code,
                    name: '',
                    device_type_id: types.value.length > 0 ? types.value[0].id : '',
                    barn_id: barns.value.length > 0 ? barns.value[0].id : '',
                    mqtt_topic: `cfarm/${code}/control`
                };
            }
            showModal.value = true;
        }

        function closeModal() { showModal.value = false; }

        async function save() {
            try {
                if (form.value.id) {
                    await API.devices.update(form.value.id, form.value);
                    if (typeof showToast === 'function') showToast('Cập nhật thiết bị thành công!', 'success');
                } else {
                    await API.devices.create(form.value);
                    if (typeof showToast === 'function') showToast('Tạo thiết bị IoT mới thành công!', 'success');
                }
                closeModal();
                await load();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message || 'Lỗi lưu thiết bị', 'error');
            }
        }

        async function removeDevice(d) {
            if (!confirm(`Thu hồi thiết bị "${d.name}" (${d.device_code}) khỏi mạng lưới?`)) return;
            try {
                await API.devices.del(d.id);
                if (typeof showToast === 'function') showToast('Đã thu hồi thiết bị IoT!', 'success');
                await load();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message || 'Lỗi khi xóa', 'error');
            }
        }

        async function testDevice(d) {
            try {
                await API.devices.test(d.id);
                if (typeof showToast === 'function') showToast(`Test gửi tới "${d.name}" thành công!`, 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message || 'Lỗi gửi test', 'error');
            }
        }

        function openTypeForm(t = null) {
            typeForm.value = t ? { ...t } : { code: '', name: '', channel_count: 4, description: '' };
            showTypeModal.value = true;
        }

        function closeTypeModal() { showTypeModal.value = false; }

        async function saveType() {
            try {
                if (typeForm.value.id) {
                    await API.devices.types.update(typeForm.value.id, typeForm.value);
                    if (typeof showToast === 'function') showToast('Cập nhật loại thiết bị thành công!', 'success');
                } else {
                    await API.devices.types.create(typeForm.value);
                    if (typeof showToast === 'function') showToast('Thêm mới loại thiết bị!', 'success');
                }
                closeTypeModal();
                await load();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message || 'Lỗi lưu loại thiết bị', 'error');
            }
        }

        async function removeType(t) {
            if (!confirm(`Xóa loại thiết bị "${t.name}"?`)) return;
            try {
                await API.devices.types.del(t.id);
                if (typeof showToast === 'function') showToast('Đã xóa loại thiết bị!', 'success');
                await load();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message || 'Lỗi khi xóa', 'error');
            }
        }

        // ── MQ Tare ──────────────────────────────────────
        function canTare(d) {
            if (!d) return false;
            if (d.type_code !== 'sensor' && d.device_type_id !== 3) return false;
            const ref = d.first_heartbeat_at || d.created_at;
            if (!ref) return false;
            const refMs = new Date(ref).getTime();
            if (Number.isNaN(refMs)) return false;
            return (Date.now() - refMs) >= 24 * 60 * 60 * 1000;
        }

        async function openTareModal(d) {
            tareDevice.value = d;
            tareLoading.value = true;
            showTareModal.value = true;
            tareCountdown.value = 0;
            try {
                tareStatuses.value = await API.mqTare.status(d.id);
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message || 'Lỗi tải trạng thái tare', 'error');
                tareStatuses.value = [];
            } finally {
                tareLoading.value = false;
            }
            refreshTareCountdown();
        }

        function refreshTareCountdown() {
            const inProgress = tareStatuses.value.find(s => s.in_progress);
            if (inProgress) {
                tareCountdown.value = inProgress.seconds_remaining || 0;
            } else {
                tareCountdown.value = 0;
            }
        }

        function fmtTareCountdown(secs) {
            const m = Math.floor(secs / 60);
            const s = secs % 60;
            return `${m}:${s.toString().padStart(2, '0')}`;
        }

        function fmtOhms(v) {
            if (v == null) return '—';
            if (v >= 1000) return `${(v / 1000).toFixed(2)} kΩ`;
            return `${v.toFixed(0)} Ω`;
        }

        async function startTare(sensorType) {
            if (!tareDevice.value) return;
            tareLoading.value = true;
            try {
                await API.mqTare.start({
                    device_id: tareDevice.value.id,
                    sensor_type: sensorType,
                    load_resistor: 10000.0,
                });
                if (typeof showToast === 'function') showToast(`Đã bắt đầu tare ${sensorType} (10 phút)`, 'success');
                // Reload status
                tareStatuses.value = await API.mqTare.status(tareDevice.value.id);
                refreshTareCountdown();
                // Poll every 5s for status updates
                if (tarePoller.value) clearInterval(tarePoller.value);
                tarePoller.value = setInterval(async () => {
                    if (!showTareModal.value) {
                        clearInterval(tarePoller.value);
                        tarePoller.value = null;
                        return;
                    }
                    try {
                        tareStatuses.value = await API.mqTare.status(tareDevice.value.id);
                        refreshTareCountdown();
                    } catch (e) {
                        // ignore transient errors
                    }
                }, 5000);
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message || 'Lỗi bắt đầu tare', 'error');
            } finally {
                tareLoading.value = false;
            }
        }

        async function cancelTare(sensorType) {
            if (!tareDevice.value) return;
            if (!confirm(`Hủy tare ${sensorType} đang chạy?`)) return;
            try {
                await API.mqTare.cancel({
                    device_id: tareDevice.value.id,
                    sensor_type: sensorType,
                });
                if (typeof showToast === 'function') showToast(`Đã hủy tare ${sensorType}`, 'success');
                tareStatuses.value = await API.mqTare.status(tareDevice.value.id);
                refreshTareCountdown();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message || 'Lỗi hủy tare', 'error');
            }
        }

        function closeTareModal() {
            showTareModal.value = false;
            if (tarePoller.value) {
                clearInterval(tarePoller.value);
                tarePoller.value = null;
            }
        }

        let poller = null;
        onMounted(async () => {
            await load();
            poller = setInterval(load, 15000);
        });

        onUnmounted(() => {
            if (poller) clearInterval(poller);
            if (tarePoller.value) {
                clearInterval(tarePoller.value);
                tarePoller.value = null;
            }
        });

        return {
            devices, types, barns, tab,
            showModal, showTypeModal, showFirmwareModal,
            form, typeForm, barnsWithDevices,
            activeDropdown, toggleDropdown,
            getRelayState, toggleRelay, timeAgo,
            openFirmwareModal, downloadFirmware,
            firmwareDevice, firmwareCode, firmwareLoading, firmwareError,
            openForm, closeModal, save, removeDevice, testDevice,
            openTypeForm, closeTypeModal, saveType, removeType,
            // MQ Tare
            showTareModal, tareDevice, tareStatuses, tareCountdown, tareLoading,
            canTare, openTareModal, startTare, cancelTare, closeTareModal,
            fmtTareCountdown, fmtOhms,
            // Health flag
            healthTipDevice
        };
    },

    template: `
    <div class="cf-container">

        <!-- Header -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon" style="background-color: #0ea5e9;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 22a10 10 0 0 1-10-10"/>
                        <path d="M14 22a13 13 0 0 0-13-13"/>
                        <circle cx="12" cy="12" r="2"/>
                        <path d="M12 2a10 10 0 0 1 10 10"/>
                        <path d="M12 5a7 7 0 0 1 7 7"/>
                        <path d="M12 8a4 4 0 0 1 4 4"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">Quản lý Thiết bị IoT & Gateway</h1>
                    <p class="cf-subtitle">Cấu hình mạng lưới ESP32, rơ-le chấp hành & xuất firmware tự động</p>
                </div>
            </div>
            <button @click="openForm()" class="cf-btn-primary" style="background-color: #0ea5e9;">
                + Thêm thiết bị mới
            </button>
        </div>

        <!-- Tab Switcher -->
        <div class="cf-dev-tabs">
            <button @click="tab = 'grid'" :class="['cf-tab-btn', tab === 'grid' ? 'active' : '']">
                🗂️ Theo chuồng
            </button>
            <button @click="tab = 'list'" :class="['cf-tab-btn', tab === 'list' ? 'active' : '']">
                📋 Danh sách
            </button>
            <button @click="tab = 'types'" :class="['cf-tab-btn', tab === 'types' ? 'active' : '']">
                ⚙️ Loại phần cứng
            </button>
        </div>

        <!-- ── TAB 1: GRID BY BARN ── -->
        <div v-if="tab === 'grid'">
            <div v-if="barnsWithDevices.length">
                <div v-for="barn in barnsWithDevices" :key="barn.id" class="cf-card" style="padding: 1.5rem; margin-bottom: 1.5rem;">
                    <div class="cf-dev-barn-header">
                        <div class="cf-dev-barn-title">
                            <span>🏡</span>
                            {{ barn.name }}
                            <span class="cf-tab-btn-badge" style="background: #f1f5f9; color: #64748b;">{{ barn.devices.length }} Nodes</span>
                        </div>
                        <div class="cf-dev-barn-badges">
                            <span v-if="barn.onlineCount > 0" class="cf-dev-badge online">{{ barn.onlineCount }} Trực tuyến</span>
                            <span v-if="barn.offlineCount > 0" class="cf-dev-badge offline">{{ barn.offlineCount }} Ngắt kết nối</span>
                        </div>
                    </div>

                    <div class="cf-dev-grid">
                        <div v-for="d in barn.devices" :key="d.id"
                             :class="['cf-dev-card', d.is_online ? 'is-online' : '']">

                            <div class="cf-dev-card-header">
                                <div class="cf-dev-card-title-row">
                                    <span :class="['cf-dev-online-dot', d.is_online ? 'online' : 'offline']"></span>
                                    <span class="cf-primary-text">{{ d.name }}</span>
                                    <div v-if="d.needs_check"
                                         class="cf-dev-check-wrap"
                                         @mouseenter="healthTipDevice = d.id"
                                         @mouseleave="healthTipDevice = null"
                                         :title="(d.check_reasons || []).join('\\n')">
                                        <span class="cf-dev-check-flag">🚩 Cần kiểm tra</span>
                                        <div v-if="healthTipDevice === d.id" class="cf-dev-check-tooltip">
                                            <div class="cf-dev-check-tooltip-title">Phát hiện bất thường</div>
                                            <ul>
                                                <li v-for="r in d.check_reasons" :key="r">{{ r }}</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                                <div v-if="activeDropdown === d.id" class="cf-dev-dropdown">
                                    <button @click.stop="openFirmwareModal(d); activeDropdown = null">💾 Lấy code ESP32</button>
                                    <button v-if="d.type_code === 'sensor' || d.device_type_id === 3" @click.stop="openTareModal(d); activeDropdown = null" :disabled="!canTare(d)" :title="canTare(d) ? 'Hiệu chỉnh baseline R0' : 'Cần online 24h+ để tare'">🧪 Tare MQ135 / MQ137</button>
                                    <button @click.stop="openForm(d); activeDropdown = null">✏️ Sửa cấu hình</button>
                                    <button @click.stop="testDevice(d); activeDropdown = null">⚡ Test mạng</button>
                                    <button @click.stop="removeDevice(d); activeDropdown = null" class="danger">🗑️ Thu hồi xóa</button>
                                </div>
                                <button v-else @click.stop="toggleDropdown(d.id)" class="cf-dev-menu-btn">•••</button>
                            </div>

                            <div class="cf-dev-meta">
                                <div class="cf-dev-meta-row">
                                    <span>🏷️</span>
                                    <span class="cf-dev-code">{{ d.device_code }}</span>
                                </div>
                                <div class="cf-dev-meta-row">
                                    <span>⚙️</span>
                                    <span>{{ d.type_name || 'Không xác định' }}</span>
                                </div>
                                <div class="cf-dev-meta-row">
                                    <span>🌐</span>
                                    <span class="cf-dev-topic">{{ d.mqtt_topic }}</span>
                                </div>
                            </div>

                            <div v-if="d.channel_count > 0" class="cf-dev-relay-strip">
                                <span class="cf-dev-relay-label">Rơ-le:</span>
                                <button v-for="ch in d.channel_count" :key="ch"
                                        :class="['cf-dev-relay-btn', getRelayState(d, ch) ? 'on' : 'off']"
                                        @click.stop="toggleRelay(d, ch)">
                                    K{{ ch }}
                                </button>
                            </div>

                            <div class="cf-dev-heartbeat">
                                <span>📡 Bản tin cuối:</span>
                                <span class="cf-dev-time">{{ timeAgo(d.last_heartbeat_at) }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else class="cf-empty-state" style="padding: 4rem 2rem;">
                <div class="cf-empty-icon-box" style="background-color: #f0fdf4; color: #0ea5e9;">📡</div>
                <h3 class="cf-empty-title">Chưa có kết nối phần cứng</h3>
                <p class="cf-empty-desc">Vui lòng đăng ký hộp điều khiển ESP32 đầu tiên để kích hoạt telemetry.</p>
            </div>
        </div>

        <!-- ── TAB 2: LIST VIEW ── -->
        <div v-if="tab === 'list'">
            <div v-if="devices.length" class="cf-card" style="padding: 0;">
                <div class="cf-table-wrapper">
                    <table class="cf-table">
                        <thead>
                            <tr>
                                <th>Trạng thái</th>
                                <th>Mã Node</th>
                                <th>Thiết bị</th>
                                <th>Loại tủ</th>
                                <th>Chuồng</th>
                                <th>MQTT Topic</th>
                                <th class="text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="d in devices" :key="d.id" class="cf-table-tr">
                                <td>
                                    <div class="cf-dev-status-cell">
                                        <span :class="['cf-dev-online-dot', d.is_online ? 'online' : 'offline']"></span>
                                        <span :class="d.is_online ? 'text-emerald' : 'text-slate'">
                                            {{ d.is_online ? 'Online' : 'Offline' }}
                                        </span>
                                        <div v-if="d.needs_check"
                                             class="cf-dev-check-wrap cf-dev-check-wrap--inline"
                                             @mouseenter="healthTipDevice = d.id"
                                             @mouseleave="healthTipDevice = null"
                                             :title="(d.check_reasons || []).join('\\n')">
                                            <span class="cf-dev-check-flag">🚩</span>
                                            <div v-if="healthTipDevice === d.id" class="cf-dev-check-tooltip">
                                                <div class="cf-dev-check-tooltip-title">Phát hiện bất thường</div>
                                                <ul>
                                                    <li v-for="r in d.check_reasons" :key="r">{{ r }}</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td><span class="cf-dev-code-sm">{{ d.device_code }}</span></td>
                                <td><span class="cf-primary-text">{{ d.name }}</span></td>
                                <td>{{ d.type_name || '-' }}</td>
                                <td>🏡 {{ d.barn_name || d.barn_id || '-' }}</td>
                                <td><span class="cf-dev-topic">{{ d.mqtt_topic }}</span></td>
                                <td>
                                    <div class="cf-dev-row-actions">
                                        <button @click="openFirmwareModal(d)" class="cf-btn-sm" style="background:#0ea5e9; color:white;">💾 ESP32</button>
                                        <button @click="testDevice(d)" class="cf-btn-sm" style="background:#0ea5e9; color:white;">⚡ Test</button>
                                        <button @click="openForm(d)" class="cf-btn-ghost-sm">✏️</button>
                                        <button @click="removeDevice(d)" class="cf-btn-ghost-sm danger">🗑️</button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div v-else class="cf-empty-state">
                <div class="cf-empty-icon-box">📂</div>
                <h3 class="cf-empty-title">Danh sách trống rỗng</h3>
            </div>
        </div>

        <!-- ── TAB 3: TYPES ── -->
        <div v-if="tab === 'types'">
            <div class="cf-card" style="padding: 1.5rem;">
                <div class="cf-dev-types-header">
                    <div class="cf-dev-types-title">
                        <span>⚙️</span>
                        <h2 class="cf-section-title-sm">Danh mục phân loại ESP-Nodes</h2>
                    </div>
                    <button @click="openTypeForm()" class="cf-btn-primary" style="background-color: #0c4a6e;">
                        + Đăng ký loại Node mới
                    </button>
                </div>

                <div v-if="types.length" class="cf-table-wrapper">
                    <table class="cf-table">
                        <thead>
                            <tr>
                                <th>Mã mạch</th>
                                <th>Tên loại</th>
                                <th>Số rơ-le</th>
                                <th>Mô tả</th>
                                <th class="text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="t in types" :key="t.id" class="cf-table-tr">
                                <td><span class="cf-dev-type-code">{{ t.code }}</span></td>
                                <td><span class="cf-primary-text">{{ t.name }}</span></td>
                                <td><span class="cf-dev-channel-badge">{{ t.channel_count }} Cổng</span></td>
                                <td class="cf-text-muted">{{ t.description || '-' }}</td>
                                <td>
                                    <div class="cf-dev-row-actions">
                                        <button @click="openTypeForm(t)" class="cf-btn-ghost-sm">✏️</button>
                                        <button @click="removeType(t)" class="cf-btn-ghost-sm danger">🗑️</button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="cf-empty-inline">
                    Hệ thống chưa đăng ký cấu trúc phần cứng nào.
                </div>
            </div>
        </div>

        <!-- ── MODAL: FIRMWARE GENERATOR ── -->
        <teleport to="body">
            <div v-if="showFirmwareModal" class="cf-modal-overlay" @click.self="showFirmwareModal = false">
                <div class="cf-modal-box" style="max-width: 48rem; max-height: 90vh;">
                    <div class="cf-modal-header" style="background-color: #0f172a; border-bottom: 1px solid #1e293b;">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #38bdf8; color: #0f172a;">💾</div>
                            <div>
                                <h3 class="cf-modal-title" style="color: #f8fafc;">Biên tập Firmware ESP32 (.ino)</h3>
                                <p class="cf-modal-subtitle">
                                    {{ firmwareDevice ? firmwareDevice.name : '' }} ({{ firmwareDevice ? firmwareDevice.device_code : '' }})
                                </p>
                            </div>
                        </div>
                        <div style="display: flex; gap: 0.75rem; align-items: center;">
                            <button v-if="firmwareCode" @click="downloadFirmware" class="cf-btn-primary" style="background-color: #0284c7; font-size: 11px; padding: 0.45rem 0.85rem;">
                                📥 Tải File (.ino)
                            </button>
                            <button @click="showFirmwareModal = false" class="cf-modal-close-btn" style="color: #94a3b8;">✕</button>
                        </div>
                    </div>

                    <div v-if="firmwareLoading" class="cf-dev-fw-loader">
                        <div class="cf-spinner" style="border-color: #38bdf8; border-top-color: transparent;"></div>
                        <p>Đang kiến thiết code firmware ESP32...</p>
                    </div>

                    <div v-else-if="firmwareError" class="cf-dev-fw-error">
                        <div class="cf-dev-fw-err-icon">⚠️</div>
                        <p>{{ firmwareError }}</p>
                    </div>

                    <div v-else-if="firmwareCode" class="cf-dev-fw-code">
                        <pre>{{ firmwareCode }}</pre>
                    </div>

                    <div class="cf-modal-footer" style="background-color: #0f172a; border-top: 1px solid #1e293b;">
                        <div class="cf-dev-fw-hint">
                            💡 Copy toàn bộ dán vào <b>Arduino IDE</b>, cài <b>PubSubClient</b> + <b>ArduinoJson</b> rồi Flash qua USB!
                        </div>
                        <button @click="showFirmwareModal = false" class="cf-btn-secondary" style="border-color: #334155; color: #94a3b8; background: transparent;">
                            Đóng lại
                        </button>
                    </div>
                </div>
            </div>
        </teleport>

        <!-- ── MODAL: DEVICE CREATE/EDIT ── -->
        <teleport to="body">
            <div v-if="showModal" class="cf-modal-overlay" @click.self="closeModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #e0f2fe; color: #0369a1;">📡</div>
                            <h3 class="cf-modal-title">{{ form.id ? 'Cập nhật cấu hình Node' : 'Bố trí ESP32 mới' }}</h3>
                        </div>
                        <button @click="closeModal" class="cf-modal-close-btn">✕</button>
                    </div>

                    <form @submit.prevent="save">
                        <div class="cf-modal-body">
                            <div v-if="!form.id" class="cf-dev-id-preview">
                                <div class="cf-dev-id-cell">
                                    <span class="cf-dev-id-label">Mã Node (Tự sinh)</span>
                                    <span class="cf-dev-id-val teal">{{ form.device_code }}</span>
                                </div>
                                <div class="cf-dev-id-cell">
                                    <span class="cf-dev-id-label">MQTT Topic</span>
                                    <span class="cf-dev-id-val sky">{{ form.mqtt_topic }}</span>
                                </div>
                            </div>

                            <div class="cf-form-group">
                                <label class="cf-label">Tên gọi Module <span class="req">*</span></label>
                                <input v-model="form.name" type="text" class="cf-input" placeholder="Ví dụ: Tủ rơ-le sấy sưởi số 1" required>
                            </div>

                            <div class="cf-col-grid-2">
                                <div class="cf-form-group">
                                    <label class="cf-label">Loại phần cứng</label>
                                    <select v-model="form.device_type_id" class="cf-modal-select" required>
                                        <option value="" disabled>-- Chọn loại mạch --</option>
                                        <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }} ({{ t.channel_count }} kênh)</option>
                                    </select>
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Chuồng nuôi</label>
                                    <select v-model="form.barn_id" class="cf-modal-select" required>
                                        <option value="" disabled>-- Chọn chuồng --</option>
                                        <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                                    </select>
                                </div>
                            </div>

                            <div v-if="form.id" class="cf-col-grid-2">
                                <div class="cf-form-group">
                                    <label class="cf-label">Mã thiết bị</label>
                                    <input v-model="form.device_code" type="text" class="cf-input font-mono" required>
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">MQTT Topic</label>
                                    <input v-model="form.mqtt_topic" type="text" class="cf-input font-mono" required>
                                </div>
                            </div>
                        </div>

                        <div class="cf-modal-footer">
                            <button type="button" @click="closeModal" class="cf-btn-secondary">Hủy bỏ</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #0ea5e9;">Lưu thiết bị</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

        <!-- ── MODAL: TYPE CREATE/EDIT ── -->
        <teleport to="body">
            <div v-if="showTypeModal" class="cf-modal-overlay" @click.self="closeTypeModal">
                <div class="cf-modal-box" style="max-width: 25rem;">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #f0fde8; color: #166534;">⚙️</div>
                            <h3 class="cf-modal-title">{{ typeForm.id ? 'Chỉnh sửa loại Node' : 'Tạo mới loại Node ESP32' }}</h3>
                        </div>
                        <button @click="closeTypeModal" class="cf-modal-close-btn">✕</button>
                    </div>

                    <form @submit.prevent="saveType">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Mã Code phân loại <span class="req">*</span></label>
                                <input v-model="typeForm.code" type="text" class="cf-input font-mono uppercase" placeholder="Ví dụ: esp32_relay_8ch" required>
                            </div>

                            <div class="cf-form-group">
                                <label class="cf-label">Tên gọi loại mạch <span class="req">*</span></label>
                                <input v-model="typeForm.name" type="text" class="cf-input" placeholder="Ví dụ: Tủ 8 kênh rơ-le" required>
                            </div>

                            <div class="cf-form-group">
                                <label class="cf-label">Số cổng rơ-le điều khiển</label>
                                <input v-model.number="typeForm.channel_count" type="number" class="cf-input font-mono" placeholder="4" min="0" max="16" required>
                            </div>

                            <div class="cf-form-group">
                                <label class="cf-label">Mô tả ứng dụng</label>
                                <textarea v-model="typeForm.description" class="cf-textarea" rows="2" placeholder="ESP-WROOM-32E, cổng đóng ngắt cách ly opto..."></textarea>
                            </div>
                        </div>

                        <div class="cf-modal-footer">
                            <button type="button" @click="closeTypeModal" class="cf-btn-secondary">Đóng lại</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #16a34a;">Thiết lập loại</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

        <!-- ── MODAL: MQ TARE (R0 CALIBRATION) ── -->
        <teleport to="body">
            <div v-if="showTareModal" class="cf-modal-overlay" @click.self="closeTareModal">
                <div class="cf-modal-box" style="max-width: 36rem;">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #e0f2fe; color: #0369a1;">🧪</div>
                            <div>
                                <h3 class="cf-modal-title">Hiệu chuẩn Tare (R0 baseline)</h3>
                                <p class="cf-modal-subtitle">
                                    {{ tareDevice ? tareDevice.name : '' }}
                                    <span v-if="tareDevice" class="cf-dev-code-sm">({{ tareDevice.device_code }})</span>
                                </p>
                            </div>
                        </div>
                        <button @click="closeTareModal" class="cf-modal-close-btn">✕</button>
                    </div>

                    <div class="cf-modal-body">
                        <div v-if="tareLoading" class="text-center py-4 text-muted">Đang tải trạng thái…</div>

                        <div v-else>
                            <div v-for="s in tareStatuses" :key="s.sensor_type"
                                 class="cf-card mb-3" style="padding: 1rem; border: 1px solid #e2e8f0;">
                                <div class="flex items-center justify-between mb-2">
                                    <div>
                                        <div class="font-semibold text-base">
                                            {{ s.sensor_type === 'mq135_raw' ? '🧪 MQ135 (Amoniac)' : '💨 MQ137 (H₂S)' }}
                                        </div>
                                        <div class="text-xs text-muted">
                                            R0 hiện tại: <span class="font-mono">{{ fmtOhms(s.active_r0_ohms) }}</span>
                                            <span v-if="s.completed_at"> · lúc {{ new Date(s.completed_at).toLocaleString('vi-VN') }}</span>
                                        </div>
                                    </div>
                                    <div v-if="s.in_progress" class="text-right">
                                        <div class="text-amber-600 font-semibold text-sm">⏱️ Đang thu thập</div>
                                        <div class="text-2xl font-mono font-bold">{{ fmtTareCountdown(s.seconds_remaining) }}</div>
                                        <div class="text-xs text-muted">{{ s.sample_count || 0 }} mẫu</div>
                                    </div>
                                </div>

                                <div class="flex gap-2 mt-3">
                                    <button v-if="!s.in_progress"
                                            @click="startTare(s.sensor_type)"
                                            class="cf-btn-primary flex-1"
                                            style="background-color:#0284c7; font-size:12px; padding:0.5rem 0.75rem;">
                                        🚀 Bắt đầu tare (10 phút)
                                    </button>
                                    <button v-else
                                            @click="cancelTare(s.sensor_type)"
                                            class="cf-btn-secondary flex-1"
                                            style="font-size:12px; padding:0.5rem 0.75rem; border-color:#ef4444; color:#ef4444;">
                                        ⏹️ Hủy tare
                                    </button>
                                </div>
                            </div>

                            <div class="text-xs text-muted mt-2" style="line-height:1.5;">
                                💡 <b>Tare</b> thu thập 10 phút ADC khi không khí sạch để tính baseline <span class="font-mono">R0</span>.
                                Hệ thống sẽ lấy median của Rs làm R0, sau đó dùng để tính <span class="font-mono">Rs/R0</span>
                                theo thời gian thực và lưu aggregate 5 phút để phân tích trend.
                            </div>
                        </div>
                    </div>

                    <div class="cf-modal-footer">
                        <button @click="closeTareModal" class="cf-btn-secondary">Đóng lại</button>
                    </div>
                </div>
            </div>
        </teleport>

    </div>
    `
};
