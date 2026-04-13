/**
 * Bats Control Page - Điều khiển bạt thông minh
 * Giao diện tối ưu: Grid 2x2, nút to, trạng thái rõ ràng
 */
const { ref, reactive, onMounted, computed, onUnmounted } = Vue;

return {
    setup() {
        const barns = ref([]);
        const selectedBarnId = ref('');
        const bats = ref([]);
        const logs = ref([]);
        const devices = ref([]);  // Relay devices for selected barn
        const loading = ref({});
        const showSettings = ref(false);
        let refreshInterval = null;

        // ── Computed ───────────────────────────────────
        const selectedBarn = computed(() => 
            barns.value.find(b => b.id == selectedBarnId.value)
        );

        const anyMoving = computed(() =>
            bats.value.some(b => b.moving_state !== 'stopped')
        );

        // Device chung cho tất cả bạt (nếu cùng device)
        const sharedDeviceId = computed(() => {
            const ids = bats.value.map(b => b.device_id).filter(id => id != null);
            if (ids.length === 0) return null;
            const first = ids[0];
            return ids.every(id => id === first) ? first : null;
        });

        async function setSharedDevice(deviceId) {
            const id = deviceId ? parseInt(deviceId) : null;
            try {
                for (const bat of bats.value) {
                    await API.bats.update(bat.id, { device_id: id });
                }
                showToast('Đã cập nhật thiết bị cho tất cả bạt', 'success');
                await loadBats();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        // ── Methods ───────────────────────────────────
        async function loadBarns() {
            try {
                barns.value = await API.barns.list();
            } catch (e) {
                showToast('Không thể tải danh sách chuồng', 'error');
            }
        }

        async function loadBats() {
            if (!selectedBarnId.value) return;
            try {
                bats.value = await API.bats.listByBarn(selectedBarnId.value);
            } catch (e) {
                showToast('Không thể tải bạt', 'error');
            }
        }

        async function loadLogs() {
            if (!selectedBarnId.value) return;
            try {
                logs.value = await API.bats.logsByBarn(selectedBarnId.value, 20);
            } catch (e) {
                console.error('Failed to load logs', e);
            }
        }

        async function loadDevices() {
            if (!selectedBarnId.value) return;
            try {
                // Load devices for this barn (filter relay_8ch devices)
                const allDevices = await API.devices.list(selectedBarnId.value);
                devices.value = allDevices.filter(d =>
                    d.type_code === 'relay_8ch' || d.channel_count === 8
                );
            } catch (e) {
                console.error('Failed to load devices', e);
            }
        }

        async function onBarnChange() {
            await loadBats();
            await loadLogs();
            await loadDevices();
        }

        async function moveUp(bat) {
            if (loading.value[bat.id]) return;
            loading.value[bat.id] = 'up';
            try {
                await API.bats.moveUp(bat.id);
                showToast(`${bat.name}: Đang kéo lên`, 'info');
                await loadBats();
                await loadLogs();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                delete loading.value[bat.id];
            }
        }

        async function moveDown(bat) {
            if (loading.value[bat.id]) return;
            loading.value[bat.id] = 'down';
            try {
                await API.bats.moveDown(bat.id);
                showToast(`${bat.name}: Đang hạ xuống`, 'info');
                await loadBats();
                await loadLogs();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                delete loading.value[bat.id];
            }
        }

        async function stopBat(bat) {
            if (loading.value[bat.id]) return;
            loading.value[bat.id] = 'stop';
            try {
                await API.bats.stop(bat.id);
                showToast(`${bat.name}: Đã dừng`, 'success');
                await loadBats();
                await loadLogs();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                delete loading.value[bat.id];
            }
        }

        async function updateBat(bat, field, value) {
            try {
                await API.bats.update(bat.id, { [field]: value });
                showToast('Đã cập nhật cài đặt', 'success');
                await loadBats();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        function getBatIcon(code) {
            const icons = {
                'left_top': '↖️',
                'left_bottom': '↙️',
                'right_top': '↗️',
                'right_bottom': '↘️'
            };
            return icons[code] || '🪟';
        }

        function getBatName(code) {
            const names = {
                'left_top': 'Bạt trái trên',
                'left_bottom': 'Bạt trái dưới',
                'right_top': 'Bạt phải trên',
                'right_bottom': 'Bạt phải dưới'
            };
            return names[code] || code;
        }

        function isMoving(bat) {
            return bat.moving_state === 'up' || bat.moving_state === 'down';
        }

        function formatElapsed(bat) {
            if (!bat.elapsed_seconds) return '';
            const s = Math.floor(bat.elapsed_seconds);
            if (s < 60) return `${s}s`;
            const m = Math.floor(s / 60);
            const sec = s % 60;
            return `${m}:${sec.toString().padStart(2, '0')}`;
        }

        function formatTime(timeStr) {
            if (!timeStr) return '-';
            const d = new Date(timeStr);
            return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }

        function refresh() {
            loadBats();
            loadLogs();
        }

        // Auto-refresh khi có bạt đang chạy
        function startAutoRefresh() {
            stopAutoRefresh();
            refreshInterval = setInterval(() => {
                if (anyMoving.value) {
                    loadBats();
                }
            }, 1000);
        }

        function stopAutoRefresh() {
            if (refreshInterval) {
                clearInterval(refreshInterval);
                refreshInterval = null;
            }
        }

        // Watch bats changes để bật/tắt auto refresh
        const stopWatch = watch(anyMoving, (moving) => {
            if (moving) startAutoRefresh();
            else stopAutoRefresh();
        }, { immediate: true });

        onMounted(async () => {
            await loadBarns();
            if (barns.value.length === 1) {
                selectedBarnId.value = barns.value[0].id;
                await onBarnChange();
            }
        });

        onUnmounted(() => {
            stopAutoRefresh();
            stopWatch();
        });

        return {
            barns,
            selectedBarnId,
            bats,
            logs,
            devices,
            loading,
            showSettings,
            selectedBarn,
            anyMoving,
            sharedDeviceId,
            onBarnChange,
            setSharedDevice,
            moveUp,
            moveDown,
            stopBat,
            updateBat,
            getBatIcon,
            getBatName,
            isMoving,
            formatElapsed,
            formatTime,
            refresh
        };
    },

    template: `
    <div class="bats-control-page">
        <div class="page-header">
            <div class="flex items-center gap-3">
                <span class="text-2xl">🪟</span>
                <h1 class="page-title">Điều khiển bạt</h1>
            </div>
            <div class="flex gap-2">
                <button @click="refresh" class="p-2 rounded-lg hover:bg-gray-100 transition">
                    🔄
                </button>
                <button @click="showSettings = !showSettings"
                    class="p-2 rounded-lg hover:bg-gray-100 transition"
                    :class="showSettings ? 'bg-blue-50 text-blue-600' : ''">
                    ⚙️
                </button>
            </div>
        </div>

        <!-- Chọn chuồng -->
        <div class="mb-6">
            <label class="block text-sm font-medium text-gray-600 mb-2">Chọn chuồng</label>
            <select v-model="selectedBarnId" @change="onBarnChange" 
                class="w-full md:w-80 px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500">
                <option value="">-- Chọn chuồng --</option>
                <option v-for="b in barns" :key="b.id" :value="b.id">
                    {{ b.name || 'Chuồng ' + b.id }}
                </option>
            </select>
        </div>

        <!-- Nội dung chính -->
        <div v-if="selectedBarnId && bats.length">
            <!-- Grid điều khiển 2x2 -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                <div v-for="bat in bats" :key="bat.id"
                    class="relative bg-white rounded-2xl shadow-md border transition-all overflow-hidden"
                    :class="{
                        'border-green-400 ring-2 ring-green-200': bat.moving_state === 'up',
                        'border-red-400 ring-2 ring-red-200': bat.moving_state === 'down',
                        'border-gray-200': bat.moving_state === 'stopped',
                        'opacity-75': !bat.device_id
                    }">

                    <!-- Đèn báo trạng thái (animation) -->
                    <div v-if="bat.moving_state === 'up' || bat.moving_state === 'down'" 
                        class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-current to-transparent animate-pulse"
                        :class="bat.moving_state === 'up' ? 'text-green-500' : 'text-red-500'">
                    </div>

                    <div class="p-5">
                        <!-- Header Card -->
                        <div class="flex items-start justify-between mb-4">
                            <div class="flex items-center gap-3">
                                <span class="text-3xl">{{ getBatIcon(bat.code) }}</span>
                                <div>
                                    <h3 class="font-bold text-gray-800 text-lg">{{ getBatName(bat.code) }}</h3>
                                    <div class="flex items-center gap-2 mt-1">
                                        <span class="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                                            {{ bat.device_name || 'Chưa gắn TB' }}
                                        </span>
                                        <span v-if="bat.auto_enabled" class="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full flex items-center gap-1">
                                            🤖 Auto
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <!-- Trạng thái -->
                            <div class="text-right">
                                <div class="text-sm font-semibold" :class="{
                                    'text-green-600': bat.moving_state === 'up',
                                    'text-red-600': bat.moving_state === 'down',
                                    'text-gray-500': bat.moving_state === 'stopped'
                                }">
                                    {{ bat.moving_state === 'up' ? '↑ ĐANG LÊN' : 
                                       bat.moving_state === 'down' ? '↓ ĐANG XUỐNG' : '■ DỪNG' }}
                                </div>
                                <div v-if="isMoving(bat)" class="text-xs text-gray-500 mt-0.5">
                                    {{ formatElapsed(bat) }}
                                </div>
                            </div>
                        </div>

                        <!-- Thanh tiến trình (nếu đang chạy) -->
                        <div v-if="isMoving(bat)" class="mb-4">
                            <div class="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div class="h-full transition-all duration-1000"
                                    :class="bat.moving_state === 'up' ? 'bg-green-500' : 'bg-red-500'"
                                    :style="{ width: Math.min((bat.elapsed_seconds || 0) / (bat.timeout_seconds || 60) * 100, 100) + '%' }">
                                </div>
                            </div>
                            <div class="flex justify-between text-xs text-gray-400 mt-1">
                                <span>0s</span>
                                <span>{{ bat.timeout_seconds || 60 }}s</span>
                            </div>
                        </div>

                        <!-- Nút điều khiển -->
                        <div class="flex gap-3">
                            <button @click="moveUp(bat)"
                                :disabled="isMoving(bat) || !bat.device_id || loading[bat.id]"
                                class="flex-1 py-3 px-4 rounded-xl font-medium text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                :class="bat.moving_state === 'up' ? 'bg-green-600' : 'bg-green-500 hover:bg-green-600'">
                                <span v-if="loading[bat.id] === 'up'" class="animate-spin">⏳</span>
                                <span v-else>↑</span>
                                LÊN
                            </button>
                            <button @click="moveDown(bat)"
                                :disabled="isMoving(bat) || !bat.device_id || loading[bat.id]"
                                class="flex-1 py-3 px-4 rounded-xl font-medium text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                :class="bat.moving_state === 'down' ? 'bg-red-600' : 'bg-red-500 hover:bg-red-600'">
                                <span v-if="loading[bat.id] === 'down'" class="animate-spin">⏳</span>
                                <span v-else>↓</span>
                                XUỐNG
                            </button>
                            <button @click="stopBat(bat)"
                                :disabled="!isMoving(bat) || loading[bat.id]"
                                class="px-4 py-3 rounded-xl font-medium bg-amber-500 hover:bg-amber-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                <span v-if="loading[bat.id] === 'stop'" class="animate-spin">⏳</span>
                                <span v-else>■</span>
                            </button>
                        </div>

                        <!-- Cảnh báo chưa gắn thiết bị -->
                        <div v-if="!bat.device_id" class="mt-3 text-xs text-center text-orange-500">
                            ⚠️ Cần gắn thiết bị điều khiển
                        </div>
                    </div>
                </div>
            </div>

            <!-- Panel cài đặt (có thể ẩn/hiện) -->
            <div v-if="showSettings" class="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 mb-8">
                <h3 class="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <span>⚙️</span> Cài đặt bạt
                </h3>

                <!-- Chọn thiết bị chung cho tất cả bạt -->
                <div class="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <span class="text-xl">🎛️</span>
                            <div>
                                <div class="font-medium text-gray-800">Esp32 điều khiển (8 kênh)</div>
                                <div class="text-xs text-gray-500">Tất cả 4 bạt đều dùng chung 1 ESP32</div>
                            </div>
                        </div>
                        <select class="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            :value="sharedDeviceId || ''"
                            @change="setSharedDevice($event.target.value)">
                            <option value="">-- Chọn Esp32 --</option>
                            <option v-for="d in devices" :key="d.id" :value="d.id">
                                {{ d.name || d.device_code }} {{ d.is_online ? '🟢' : '🔴' }}
                            </option>
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div v-for="bat in bats" :key="'set-' + bat.id" class="p-4 bg-gray-50 rounded-xl">
                        <div class="font-medium text-gray-800 mb-3">{{ getBatName(bat.code) }}</div>
                        <div class="space-y-3">
                            <!-- Kênh Lên -->
                            <div class="flex items-center justify-between">
                                <span class="text-sm text-gray-600">Kênh LÊN</span>
                                <select class="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                                    :value="bat.up_relay_channel"
                                    @change="updateBat(bat, 'up_relay_channel', parseInt($event.target.value))">
                                    <option v-for="n in 8" :key="n" :value="n">K{{ n }}</option>
                                </select>
                            </div>
                            <!-- Kênh Xuống -->
                            <div class="flex items-center justify-between">
                                <span class="text-sm text-gray-600">Kênh XUỐNG</span>
                                <select class="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                                    :value="bat.down_relay_channel"
                                    @change="updateBat(bat, 'down_relay_channel', parseInt($event.target.value))">
                                    <option v-for="n in 8" :key="n" :value="n">K{{ n }}</option>
                                </select>
                            </div>
                            <!-- Timeout -->
                            <div class="flex items-center justify-between">
                                <span class="text-sm text-gray-600">Timeout (giây)</span>
                                <input type="number" 
                                    class="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                                    :value="bat.timeout_seconds"
                                    @change="updateBat(bat, 'timeout_seconds', parseInt($event.target.value))"
                                    min="10" max="300">
                            </div>
                            <!-- Auto -->
                            <div class="flex items-center justify-between">
                                <span class="text-sm text-gray-600">Chế độ Auto</span>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" class="sr-only peer"
                                        :checked="bat.auto_enabled"
                                        @change="updateBat(bat, 'auto_enabled', $event.target.checked)">
                                    <div class="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Lịch sử hoạt động -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 class="font-semibold text-gray-800 flex items-center gap-2">
                        <span>📋</span> Hoạt động gần đây
                    </h3>
                    <span class="text-xs text-gray-400">{{ logs.length }} bản ghi</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-50 text-gray-500 text-xs">
                            <tr>
                                <th class="px-4 py-2 text-left">Thời gian</th>
                                <th class="px-4 py-2 text-left">Bạt</th>
                                <th class="px-4 py-2 text-center">Hành động</th>
                                <th class="px-4 py-2 text-center">Thời gian</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            <tr v-for="log in logs" :key="log.id" class="hover:bg-gray-50">
                                <td class="px-4 py-3 text-gray-700">{{ formatTime(log.started_at) }}</td>
                                <td class="px-4 py-3 font-medium">{{ log.bat_name }}</td>
                                <td class="px-4 py-3 text-center">
                                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                                        :class="{
                                            'bg-green-100 text-green-700': log.action === 'up',
                                            'bg-red-100 text-red-700': log.action === 'down',
                                            'bg-amber-100 text-amber-700': log.action === 'stop'
                                        }">
                                        {{ log.action === 'up' ? '↑ LÊN' : log.action === 'down' ? '↓ XUỐNG' : '■ DỪNG' }}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-center text-gray-500">{{ log.duration_seconds ? log.duration_seconds + 's' : '-' }}</td>
                            </tr>
                            <tr v-if="logs.length === 0">
                                <td colspan="4" class="px-4 py-8 text-center text-gray-400">
                                    <div class="text-3xl mb-2">📭</div>
                                    Chưa có hoạt động nào
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Trạng thái rỗng -->
        <div v-else-if="!selectedBarnId" class="bg-white rounded-2xl p-12 text-center border border-gray-200">
            <div class="text-6xl mb-4">🪟</div>
            <h3 class="text-lg font-medium text-gray-700 mb-2">Chưa chọn chuồng</h3>
            <p class="text-gray-500">Vui lòng chọn chuồng để điều khiển bạt</p>
        </div>

        <div v-else class="bg-white rounded-2xl p-12 text-center border border-gray-200">
            <div class="text-6xl mb-4">🚫</div>
            <h3 class="text-lg font-medium text-gray-700 mb-2">Không có bạt</h3>
            <p class="text-gray-500">Chuồng này chưa được cấu hình bạt điều khiển</p>
        </div>
    </div>
    `
};