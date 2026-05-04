/**
 * Relays Control Page - Direct relay control organized by Barn
 */
const { ref, reactive, onMounted, computed } = Vue;

const component = {
    template: `
    <div>
        <div class="page-header">
            <h2 class="page-title">🔌 Điều khiển Relay</h2>
            <button class="btn btn-secondary" @click="refresh()">
                <i class="fas fa-refresh mr-1"></i>Làm mới
            </button>
        </div>

        <!-- Barns with Relay Devices -->
        <div v-if="barnsWithRelays.length" class="space-y-6">
            <div v-for="barn in barnsWithRelays" :key="barn.id" class="card p-4">
                <!-- Barn Header -->
                <div class="flex items-center justify-between mb-4 pb-3 border-b">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">{{ barn.icon || '🏠' }}</span>
                        <div>
                            <h3 class="font-semibold text-lg">{{ barn.name || barn.id }}</h3>
                            <div class="text-sm text-gray-500">{{ barn.devices.length }} thiết bị relay</div>
                        </div>
                    </div>
                    <div class="flex gap-2 items-center">
                        <span class="badge badge-green" v-if="barn.onlineCount > 0">
                            {{ barn.onlineCount }} online
                        </span>
                        <span class="badge badge-red" v-if="barn.offlineCount > 0">
                            {{ barn.offlineCount }} offline
                        </span>
                    </div>
                </div>

                <!-- Relay Devices Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div v-for="d in barn.devices" :key="d.id"
                         class="border rounded-xl p-4 transition-all"
                         :class="d.is_online ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200 opacity-70'">

                        <!-- Device Header -->
                        <div class="flex items-start justify-between mb-3">
                            <div>
                                <div class="flex items-center gap-2">
                                    <span class="online-dot" :class="d.is_online ? 'on' : 'off'"></span>
                                    <span class="font-semibold">{{ d.name }}</span>
                                </div>
                                <div class="text-xs text-gray-500 font-mono mt-1">{{ d.device_code }}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-xs" :class="d.is_online ? 'text-green-600' : 'text-gray-400'">
                                    {{ d.is_online ? 'Online' : 'Offline' }}
                                </div>
                                <div class="text-xs text-gray-400 mt-1" v-if="d.wifi_rssi">
                                    📶 {{ d.wifi_rssi }} dBm
                                </div>
                            </div>
                        </div>

                        <!-- Relay Channels -->
                        <div class="mb-3">
                            <div class="text-xs text-gray-500 mb-2">Kênh relay ({{ getChannelCount(d) }}):</div>
                            <div class="flex gap-2 flex-wrap">
                                <button v-for="ch in getChannelCount(d)" :key="ch"
                                        class="relay-btn w-14 h-14 text-center font-bold text-lg rounded-lg transition-all"
                                        :class="getRelayState(d, ch) ? 'relay-on shadow-lg scale-105' : 'relay-off'"
                                        :disabled="!d.is_online || loading[key(d,ch)]"
                                        @click="toggleRelay(d, ch)">
                                    <div class="text-xs font-normal mb-1">K{{ ch }}</div>
                                    <div>{{ getRelayState(d, ch) ? 'ON' : 'OFF' }}</div>
                                </button>
                            </div>
                        </div>

                        <!-- Last Heartbeat -->
                        <div class="text-xs text-gray-400 flex items-center justify-between">
                            <span>
                                <i class="fas fa-clock mr-1"></i>
                                {{ timeAgo(d.last_heartbeat_at) }}
                            </span>
                            <span v-if="d.uptime_seconds" class="text-gray-500">
                                UP {{ formatUptime(d.uptime_seconds) }}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Empty Barn Message -->
                <div v-if="barn.devices.length === 0" class="text-center py-8 text-gray-400">
                    <i class="fas fa-plug text-4xl mb-2"></i>
                    <p>Không có thiết bị relay trong chuồng này</p>
                </div>
            </div>
        </div>

        <!-- No Relay Devices -->
        <div v-else class="empty-state">
            <div class="icon">🔌</div>
            <p>Chưa có thiết bị relay nào</p>
            <p class="text-sm text-gray-500 mt-1">Thêm thiết bị relay để điều khiển</p>
        </div>
    </div>
    `,
    setup() {
        const devices = ref([]);
        const relayStates = ref({}); // { "deviceId-channel": true/false }
        const loading = ref({}); // { "deviceId-channel": true/false }
        const lastClick = ref({}); // { "deviceId-channel": timestamp } - debounce protection

        // Get channel count from type_code (fallback when channel_count not available)
        function getChannelCount(device) {
            if (device.channel_count > 0) return device.channel_count;
            const typeToChannels = {
                'relay_4ch': 4,
                'relay_8ch': 8,
                'mixed': 4,
                'sensor': 0
            };
            return typeToChannels[device.type_code] || 0;
        }

        // Filter devices that have relay channels
        const relayDevices = computed(() =>
            devices.value.filter(d => getChannelCount(d) > 0)
        );

        // Group relay devices by barn
        const barnsWithRelays = computed(() => {
            const groups = {};
            for (const d of relayDevices.value) {
                const barnId = d.barn_id || 'unknown';
                if (!groups[barnId]) {
                    groups[barnId] = {
                        id: barnId,
                        name: barnId,
                        icon: null,
                        devices: [],
                        onlineCount: 0,
                        offlineCount: 0
                    };
                }
                groups[barnId].devices.push(d);
                if (d.is_online) {
                    groups[barnId].onlineCount++;
                } else {
                    groups[barnId].offlineCount++;
                }
            }
            // Get barn names from devices
            for (const d of devices.value) {
                if (d.barn_name && groups[d.barn_id]) {
                    groups[d.barn_id].name = d.barn_name;
                }
            }
            return Object.values(groups);
        });

        async function loadDevices() {
            try {
                const data = await API.devices.list();
                devices.value = data;
                // Initialize relay states as OFF
                for (const d of data) {
                    const chCount = getChannelCount(d);
                    if (chCount > 0) {
                        for (let ch = 1; ch <= chCount; ch++) {
                            const k = `${d.id}-${ch}`;
                            if (relayStates.value[k] === undefined) {
                                relayStates.value[k] = false;
                            }
                        }
                    }
                }
            } catch (e) {
                showToast('Không thể tải danh sách thiết bị', 'error');
            }
        }

        function getRelayState(device, channel) {
            return relayStates.value[`${device.id}-${channel}`] || false;
        }

        function key(device, channel) {
            return `${device.id}-${channel}`;
        }

        async function toggleRelay(device, channel) {
            const k = key(device, channel);
            const now = Date.now();

            // Debounce: ignore rapid clicks within 250ms to prevent MQTT flooding
            if (lastClick.value[k] && now - lastClick.value[k] < 250) return;
            lastClick.value[k] = now;

            // If a request is already in-flight for this relay, skip
            if (loading.value[k]) return;

            const currentState = getRelayState(device, channel);
            const newState = !currentState;

            // ✅ Optimistic UI update - immediate feedback to user
            relayStates.value[k] = newState;
            showToast(`Relay K${channel} đã ${newState ? 'BẬT' : 'TẮT'}`);

            loading.value[k] = true;
            try {
                await API.relay.send({
                    device_topic: device.mqtt_topic,
                    channel: channel,
                    state: newState ? 'on' : 'off'
                });
                // Success - state already updated optimistically
            } catch (e) {
                // ❌ Server error - revert optimistic update
                relayStates.value[k] = currentState;
                showToast(`Lỗi: ${e.message || 'Không thể gửi lệnh'}`, 'error');
            } finally {
                loading.value[k] = false;
            }
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

        function refresh() {
            loadDevices();
        }

        onMounted(() => {
            loadDevices();
        });

        return {
            devices,
            relayDevices,
            barnsWithRelays,
            relayStates,
            loading,
            getChannelCount,
            getRelayState,
            key,
            toggleRelay,
            timeAgo,
            formatUptime,
            refresh
        };
    }
};

return component;
