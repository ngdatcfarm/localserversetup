/**
 * Relays Control Page - Direct relay control organized by Barn
 * - Grid view of relay devices grouped by barn
 * - Per-channel toggle with optimistic UI
 * - Debounce protection to prevent MQTT flooding
 */
const { ref, computed, onMounted } = Vue;

return {
    setup() {
        // ── State ──────────────────────────────────────
        const devices = ref([]);
        const relayStates = ref({});
        const loading = ref({});
        const lastClick = ref({});

        // ── Computed ───────────────────────────────────
        const relayDevices = computed(() =>
            devices.value.filter(d => getChannelCount(d) > 0)
        );

        const barnsWithRelays = computed(() => {
            const groups = {};
            for (const d of relayDevices.value) {
                const barnId = d.barn_id || 'unknown';
                if (!groups[barnId]) {
                    groups[barnId] = {
                        id: barnId,
                        name: barnId,
                        icon: '🏡',
                        devices: [],
                        onlineCount: 0,
                        offlineCount: 0
                    };
                }
                groups[barnId].devices.push(d);
                if (d.is_online) groups[barnId].onlineCount++;
                else groups[barnId].offlineCount++;
            }
            for (const d of devices.value) {
                if (d.barn_name && groups[d.barn_id]) {
                    groups[d.barn_id].name = d.barn_name;
                }
            }
            return Object.values(groups);
        });

        // ── Helpers ───────────────────────────────────
        function getChannelCount(device) {
            if (device.channel_count > 0) return device.channel_count;
            const map = { relay_4ch: 4, relay_8ch: 8, mixed: 4, sensor: 0 };
            return map[device.type_code] || 0;
        }

        function relayKey(device, channel) {
            return `${device.id}-${channel}`;
        }

        function getRelayState(device, channel) {
            return relayStates.value[relayKey(device, channel)] || false;
        }

        function timeAgo(time) {
            if (!time) return 'Chưa có dữ liệu';
            const diff = Date.now() - new Date(time).getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return 'Vừa xong';
            if (mins < 60) return `${mins} phút trước`;
            const hours = Math.floor(mins / 60);
            if (hours < 24) return `${hours} giờ trước`;
            return `${Math.floor(hours / 24)} ngày trước`;
        }

        function formatUptime(seconds) {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            return `${h}h ${m}m`;
        }

        // ── API ────────────────────────────────────────
        async function loadDevices() {
            try {
                const data = await API.devices.list();
                devices.value = data || [];
                for (const d of data || []) {
                    const chCount = getChannelCount(d);
                    for (let ch = 1; ch <= chCount; ch++) {
                        const k = relayKey(d, ch);
                        if (relayStates.value[k] === undefined) {
                            relayStates.value[k] = false;
                        }
                    }
                }
            } catch (e) {
                if (typeof showToast === 'function') showToast('Không thể tải danh sách thiết bị', 'error');
            }
        }

        async function toggleRelay(device, channel) {
            const k = relayKey(device, channel);
            const now = Date.now();

            if (lastClick.value[k] && now - lastClick.value[k] < 250) return;
            lastClick.value[k] = now;

            if (loading.value[k]) return;

            const currentState = getRelayState(device, channel);
            const newState = !currentState;

            relayStates.value[k] = newState;

            loading.value[k] = true;
            try {
                await API.relay.send({
                    device_topic: device.mqtt_topic,
                    channel: channel,
                    state: newState ? 'on' : 'off'
                });
                if (typeof showToast === 'function') showToast(`Relay K${channel} đã ${newState ? 'BẬT' : 'TẮT'}`);
            } catch (e) {
                relayStates.value[k] = currentState;
                if (typeof showToast === 'function') showToast(`Lỗi: ${e.message || 'Không thể gửi lệnh'}`, 'error');
            } finally {
                loading.value[k] = false;
            }
        }

        function refresh() { loadDevices(); }

        onMounted(() => { loadDevices(); });

        return {
            relayDevices, barnsWithRelays, relayStates, loading,
            getChannelCount, relayKey, getRelayState,
            toggleRelay, timeAgo, formatUptime, refresh
        };
    },

    template: `
    <div class="cf-container">

        <!-- Header -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon" style="background-color: #16a34a;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 22v-5"/>
                        <path d="M9 8V2"/>
                        <path d="M15 8V2"/>
                        <path d="M18 8H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2Z"/>
                        <path d="M9 12h6"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">Điều khiển Relay</h1>
                    <p class="cf-subtitle">Bật/tắt rơ-le theo chuồng nuôi với cập nhật trạng thái thời gian thực</p>
                </div>
            </div>
            <button @click="refresh()" class="cf-btn-secondary">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                    <path d="M21 21v-5h-5"/>
                </svg>
                Làm mới
            </button>
        </div>

        <!-- Barns with Relay Devices -->
        <div v-if="barnsWithRelays.length">
            <div v-for="barn in barnsWithRelays" :key="barn.id" class="cf-card" style="padding: 1.5rem; margin-bottom: 1.5rem;">

                <!-- Barn Header -->
                <div class="cf-relay-barn-header">
                    <div class="cf-relay-barn-info">
                        <span class="cf-relay-barn-icon">{{ barn.icon }}</span>
                        <div>
                            <h3 class="cf-relay-barn-name">{{ barn.name }}</h3>
                            <span class="cf-relay-device-count">{{ barn.devices.length }} thiết bị relay</span>
                        </div>
                    </div>
                    <div class="cf-relay-barn-badges">
                        <span v-if="barn.onlineCount > 0" class="cf-badge-success">{{ barn.onlineCount }} online</span>
                        <span v-if="barn.offlineCount > 0" class="cf-badge-danger">{{ barn.offlineCount }} offline</span>
                    </div>
                </div>

                <!-- Relay Devices Grid -->
                <div class="cf-relay-grid">
                    <div v-for="d in barn.devices" :key="d.id"
                         :class="['cf-relay-card', d.is_online ? 'is-online' : 'is-offline']">

                        <!-- Device Header -->
                        <div class="cf-relay-card-header">
                            <div>
                                <div class="cf-relay-card-title-row">
                                    <span :class="['cf-relay-dot', d.is_online ? 'online' : 'offline']"></span>
                                    <span class="cf-relay-device-name">{{ d.name }}</span>
                                </div>
                                <span class="cf-relay-code">{{ d.device_code }}</span>
                            </div>
                            <div class="cf-relay-card-meta">
                                <span :class="d.is_online ? 'cf-relay-online' : 'cf-relay-offline'">
                                    {{ d.is_online ? 'Online' : 'Offline' }}
                                </span>
                                <span v-if="d.wifi_rssi" class="cf-relay-rssi">📶 {{ d.wifi_rssi }} dBm</span>
                            </div>
                        </div>

                        <!-- Relay Channels -->
                        <div v-if="getChannelCount(d) > 0" class="cf-relay-channels">
                            <span class="cf-relay-channel-label">Kênh relay ({{ getChannelCount(d) }}):</span>
                            <div class="cf-relay-btn-row">
                                <button v-for="ch in getChannelCount(d)" :key="ch"
                                        :class="['cf-relay-btn', getRelayState(d, ch) ? 'on' : 'off']"
                                        :disabled="!d.is_online || loading[relayKey(d, ch)]"
                                        @click="toggleRelay(d, ch)">
                                    <span class="cf-relay-btn-label">K{{ ch }}</span>
                                    <span>{{ getRelayState(d, ch) ? 'ON' : 'OFF' }}</span>
                                </button>
                            </div>
                        </div>

                        <!-- Footer -->
                        <div class="cf-relay-footer">
                            <span class="cf-relay-time">
                                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polyline points="12 6 12 12 16 14"/>
                                </svg>
                                {{ timeAgo(d.last_heartbeat_at) }}
                            </span>
                            <span v-if="d.uptime_seconds" class="cf-relay-uptime">UP {{ formatUptime(d.uptime_seconds) }}</span>
                        </div>
                    </div>
                </div>

                <!-- Empty Barn Message -->
                <div v-if="barn.devices.length === 0" class="cf-relay-empty">
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3">
                        <path d="M12 22v-5"/>
                        <path d="M9 8V2"/>
                        <path d="M15 8V2"/>
                        <path d="M18 8H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2Z"/>
                        <path d="M9 12h6"/>
                    </svg>
                    <p>Không có thiết bị relay trong chuồng này</p>
                </div>
            </div>
        </div>

        <!-- No Relay Devices -->
        <div v-else class="cf-empty-state">
            <div class="cf-empty-icon-box" style="background-color: #f0fdf4; color: #16a34a;">🔌</div>
            <h3 class="cf-empty-title">Chưa có thiết bị relay nào</h3>
            <p class="cf-empty-desc">Thêm thiết bị relay để điều khiển</p>
        </div>

    </div>
    `
};