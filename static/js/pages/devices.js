/**
 * Devices Page - Device Management organized by Barn
 */
const { ref, computed, onMounted } = Vue;

const component = {
    template: `
    <div class="devices-page">
        <div class="page-header">
            <div class="header-icon">📡</div>
            <div>
                <h2 class="page-title">Quản lý Thiết bị</h2>
                <p class="page-subtitle">Danh mục thiết bị IoT</p>
            </div>
            <button class="btn btn-primary" @click="openForm()">+ Thêm thiết bị</button>
        </div>

        <div class="tabs mb-4">
            <div class="tab" :class="{active: tab==='grid'}" @click="tab='grid'">
                <i class="fas fa-grid-2 mr-1"></i> Theo chuồng
            </div>
            <div class="tab" :class="{active: tab==='list'}" @click="tab='list'">
                <i class="fas fa-list mr-1"></i> Danh sách
            </div>
            <div class="tab" :class="{active: tab==='types'}" @click="tab='types'">
                <i class="fas fa-microchip mr-1"></i> Loại thiết bị
            </div>
        </div>

        <!-- Grid View by Barn -->
        <div v-if="tab==='grid'">
            <div v-if="barnsWithDevices.length" class="space-y-6">
                <div v-for="barn in barnsWithDevices" :key="barn.id" class="card p-4">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-lg flex items-center gap-2">
                            <span class="text-2xl">{{ barn.icon || '🏠' }}</span>
                            {{ barn.name || barn.id }}
                            <span class="text-sm font-normal text-gray-500">({{ barn.devices.length }} thiết bị)</span>
                        </h3>
                        <div class="flex gap-2">
                            <span class="badge badge-green" v-if="barn.onlineCount > 0">
                                {{ barn.onlineCount }} online
                            </span>
                            <span class="badge badge-red" v-if="barn.offlineCount > 0">
                                {{ barn.offlineCount }} offline
                            </span>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div v-for="d in barn.devices" :key="d.id"
                             class="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                             :class="d.is_online ? 'bg-green-50' : 'bg-gray-50'">
                            <!-- Device Header -->
                            <div class="flex items-start justify-between mb-3">
                                <div class="flex items-center gap-2">
                                    <span class="online-dot" :class="d.is_online ? 'on' : 'off'"></span>
                                    <span class="font-medium">{{ d.name }}</span>
                                </div>
                                <div class="dropdown relative">
                                    <button class="btn btn-ghost btn-sm" @click="toggleDropdown(d.id)">
                                        <i class="fas fa-ellipsis"></i>
                                    </button>
                                    <div v-if="activeDropdown === d.id"
                                         class="dropdown-menu absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[160px]">
                                        <button class="dropdown-item" @click="openFirmwareModal(d); activeDropdown=null">
                                            <i class="fas fa-microchip mr-2"></i>Lấy code ESP32
                                        </button>
                                        <button class="dropdown-item" @click="openForm(d); activeDropdown=null">
                                            <i class="fas fa-edit mr-2"></i>Sửa
                                        </button>
                                        <button class="dropdown-item" @click="testDevice(d); activeDropdown=null">
                                            <i class="fas fa-paper-plane mr-2"></i>Test
                                        </button>
                                        <button class="dropdown-item text-red-600" @click="remove(d); activeDropdown=null">
                                            <i class="fas fa-trash mr-2"></i>Xóa
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- Device Info -->
                            <div class="text-sm text-gray-600 space-y-1 mb-3">
                                <div class="flex items-center gap-2">
                                    <i class="fas fa-hashtag w-4 text-gray-400"></i>
                                    <span class="font-mono text-xs">{{ d.device_code }}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <i class="fas fa-layer-group w-4 text-gray-400"></i>
                                    <span>{{ d.type_name || 'Chưa phân loại' }}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <i class="fas fa-tower-cell w-4 text-gray-400"></i>
                                    <span class="font-mono text-xs">{{ d.mqtt_topic }}</span>
                                </div>
                            </div>

                            <!-- Relay Control (if device has channels) -->
                            <div v-if="d.channel_count > 0" class="mb-3">
                                <div class="text-xs text-gray-500 mb-2">Điều khiển relay:</div>
                                <div class="flex gap-2 flex-wrap">
                                    <button v-for="ch in d.channel_count" :key="ch"
                                            class="relay-btn"
                                            :class="getRelayState(d, ch) ? 'relay-on' : 'relay-off'"
                                            @click="toggleRelay(d, ch)">
                                        K{{ ch }}
                                    </button>
                                </div>
                            </div>

                            <!-- Last Seen -->
                            <div class="text-xs text-gray-400">
                                <i class="fas fa-clock mr-1"></i>
                                {{ timeAgo(d.last_seen) }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div v-else class="empty-state">
                <div class="icon">📡</div>
                <p>Chưa có thiết bị nào</p>
                <p class="text-sm text-gray-500 mt-1">Thêm thiết bị để bắt đầu</p>
            </div>
        </div>

        <!-- List View -->
        <div v-if="tab==='list'">
            <div v-if="devices.length" class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Trạng thái</th>
                            <th>Mã</th>
                            <th>Tên</th>
                            <th>Loại</th>
                            <th>Chuồng</th>
                            <th>MQTT Topic</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="d in devices" :key="d.id">
                            <td>
                                <span class="online-dot" :class="d.is_online ? 'on' : 'off'"></span>
                                {{ d.is_online ? 'Online' : 'Offline' }}
                            </td>
                            <td class="font-mono text-xs">{{ d.device_code }}</td>
                            <td class="font-medium">{{ d.name }}</td>
                            <td>{{ d.type_name || '-' }}</td>
                            <td>{{ d.barn_id || '-' }}</td>
                            <td class="font-mono text-xs">{{ d.mqtt_topic }}</td>
                            <td class="flex gap-1">
                                <button class="btn btn-blue btn-sm" @click="openFirmwareModal(d)">
                                    <i class="fas fa-microchip mr-1"></i>ESP32
                                </button>
                                <button class="btn btn-primary btn-sm" @click="testDevice(d)">Test</button>
                                <button class="btn btn-secondary btn-sm" @click="openForm(d)">Sửa</button>
                                <button class="btn btn-danger btn-sm" @click="remove(d)">Xóa</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="empty-state">
                <div class="icon">📡</div>
                <p>Chưa có thiết bị</p>
            </div>
        </div>

        <!-- Device Types -->
        <div v-if="tab==='types'">
            <div class="mb-3">
                <button class="btn btn-primary btn-sm" @click="openTypeForm()">+ Thêm loại</button>
            </div>
            <div v-if="types.length" class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Tên</th>
                            <th>Số kênh</th>
                            <th>Mô tả</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="t in types" :key="t.id">
                            <td class="font-mono">{{ t.code }}</td>
                            <td>{{ t.name }}</td>
                            <td>{{ t.channel_count }}</td>
                            <td class="text-gray-500">{{ t.description || '-' }}</td>
                            <td class="flex gap-1">
                                <button class="btn btn-secondary btn-sm" @click="openTypeForm(t)">Sửa</button>
                                <button class="btn btn-danger btn-sm" @click="removeType(t)">Xóa</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- ESP32 Firmware Modal -->
        <div v-if="showFirmwareModal" class="modal-overlay" @click.self="showFirmwareModal=false">
            <div class="modal" style="max-width: 800px; max-height: 90vh;">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h3 class="text-lg font-semibold">ESP32 Firmware</h3>
                        <p class="text-sm text-gray-500">{{ firmwareDevice ? firmwareDevice.name : '' }} - {{ firmwareDevice ? firmwareDevice.device_code : '' }}</p>
                    </div>
                    <div class="flex gap-2">
                        <button v-if="firmwareCode" class="btn btn-secondary" @click="downloadFirmware">
                            <i class="fas fa-download mr-1"></i>Tải .ino
                        </button>
                        <button class="btn btn-ghost" @click="showFirmwareModal=false">
                            <i class="fas fa-xmark"></i>
                        </button>
                    </div>
                </div>

                <div v-if="firmwareLoading" class="text-center py-8">
                    <i class="fas fa-spinner fa-spin text-2xl text-blue-500"></i>
                    <p class="mt-2 text-gray-500">Đang tạo firmware...</p>
                </div>

                <div v-else-if="firmwareError" class="text-center py-8 text-red-500">
                    <i class="fas fa-exclamation-triangle text-2xl"></i>
                    <p class="mt-2">{{ firmwareError }}</p>
                </div>

                <div v-else-if="firmwareCode" class="bg-gray-900 rounded-lg p-4 overflow-auto" style="max-height: 60vh;">
                    <pre class="text-xs text-green-400 whitespace-pre-wrap font-mono">{{ firmwareCode }}</pre>
                </div>

                <div class="mt-4 text-xs text-gray-500">
                    <i class="fas fa-info-circle mr-1"></i>
                    Copy code và paste vào Arduino IDE, compile và flash vào ESP32
                </div>
            </div>
        </div>

        <!-- Device Modal -->
        <div v-if="showModal" class="modal-overlay" @click.self="showModal=false">
            <div class="modal">
                <h3>{{ form.id ? 'Sửa thiết bị' : 'Thêm thiết bị' }}</h3>

                <!-- Auto-generated fields (read-only, shown for reference) -->
                <div v-if="!form.id" class="form-group">
                    <label class="text-xs text-gray-500">Mã thiết bị (tự động)</label>
                    <div class="bg-gray-100 px-3 py-2 rounded font-mono text-sm">
                        {{ form.device_code }}
                    </div>
                </div>
                <div v-if="!form.id" class="form-group">
                    <label class="text-xs text-gray-500">MQTT Topic (tự động)</label>
                    <div class="bg-gray-100 px-3 py-2 rounded font-mono text-sm">
                        {{ form.mqtt_topic }}
                    </div>
                </div>

                <div class="form-group"><label>Tên thiết bị</label><input v-model="form.name" placeholder="VD: Relay bơm nước"></div>
                <div class="form-group"><label>Loại thiết bị</label>
                    <select v-model="form.device_type_id" class="w-full border rounded px-3 py-2">
                        <option :value="null">-- Chọn loại --</option>
                        <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
                    </select>
                </div>
                <div class="form-group"><label>Chuồng</label>
                    <select v-model="form.barn_id" class="w-full border rounded px-3 py-2">
                        <option value="">-- Chọn chuồng --</option>
                        <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name || b.id }}</option>
                    </select>
                </div>

                <!-- Editable fields when editing existing device -->
                <div v-if="form.id">
                    <div class="form-group"><label>Mã thiết bị</label><input v-model="form.device_code" class="font-mono"></div>
                    <div class="form-group"><label>MQTT Topic</label><input v-model="form.mqtt_topic" class="font-mono"></div>
                </div>

                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-secondary" @click="showModal=false">Huỷ</button>
                    <button class="btn btn-primary" @click="save">Lưu</button>
                </div>
            </div>
        </div>

        <!-- Type Modal -->
        <div v-if="showTypeModal" class="modal-overlay" @click.self="showTypeModal=false">
            <div class="modal">
                <h3>{{ typeForm.id ? 'Sửa loại' : 'Thêm loại thiết bị' }}</h3>
                <div class="form-group"><label>Code</label><input v-model="typeForm.code" placeholder="VD: relay_4ch"></div>
                <div class="form-group"><label>Tên</label><input v-model="typeForm.name" placeholder="VD: Relay 4 Channel"></div>
                <div class="form-group"><label>Số kênh</label><input v-model.number="typeForm.channel_count" type="number"></div>
                <div class="form-group"><label>Mô tả</label><input v-model="typeForm.description"></div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-secondary" @click="showTypeModal=false">Huỷ</button>
                    <button class="btn btn-primary" @click="saveType">Lưu</button>
                </div>
            </div>
        </div>
    </div>`,

    setup() {
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

        // Group devices by barn
        const barnsWithDevices = computed(() => {
            const groups = {};
            devices.value.forEach(d => {
                const barnId = d.barn_id || '_unassigned';
                if (!groups[barnId]) {
                    const barn = barns.value.find(b => b.id === barnId);
                    groups[barnId] = {
                        id: barnId,
                        name: barn ? barn.name : 'Chưa gán chuồng',
                        icon: barn ? barn.icon : '📍',
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

        function toggleDropdown(id) {
            activeDropdown.value = activeDropdown.value === id ? null : id;
        }

        function getRelayState(device, channel) {
            const key = `${device.id}-${channel}`;
            return deviceStates.value[key] === true;
        }

        async function toggleRelay(device, channel) {
            const key = `${device.id}-${channel}`;
            const currentState = deviceStates.value[key] || false;
            const newState = !currentState;

            try {
                await API.relay.send({
                    device_topic: device.mqtt_topic,
                    channel: channel,
                    state: newState
                });
                deviceStates.value[key] = newState;
                showToast(`Relay ${channel} đã ${newState ? 'BẬT' : 'TẮT'}`);
            } catch(e) {
                showToast(e.message, 'error');
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

        async function load() {
            [devices.value, types.value, barns.value] = await Promise.all([
                API.devices.list().catch(() => []),
                API.devices.types.list().catch(() => []),
                API.barns.list().catch(() => [])
            ]);
            // Load device states for relay control
            for (const d of devices.value) {
                if (d.channel_count > 0) {
                    try {
                        const states = await API.devices.states(d.id);
                        for (let ch = 1; ch <= d.channel_count; ch++) {
                            const key = `${d.id}-${ch}`;
                            deviceStates.value[key] = states[ch] || false;
                        }
                    } catch(e) {}
                }
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
                if (result.code) {
                    firmwareCode.value = result.code;
                } else {
                    firmwareError.value = result.message || 'Không có firmware cho thiết bị này';
                }
            } catch(e) {
                firmwareError.value = e.message || 'Lỗi khi tạo firmware';
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
            a.download = `${firmwareDevice.value.device_code}.ino`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Đã tải firmware');
        }

        function openForm(d) {
            if (d) {
                // Edit mode - use existing values
                form.value = { ...d };
            } else {
                // Create mode - auto-generate device_code and mqtt_topic
                const randomId = Math.floor(10000 + Math.random() * 90000); // 5-digit random
                const deviceCode = `esp-${randomId}`;
                form.value = {
                    device_code: deviceCode,
                    name: '',
                    device_type_id: null,
                    barn_id: '',
                    mqtt_topic: `cfarm/${deviceCode}`
                };
            }
            showModal.value = true;
        }

        async function save() {
            try {
                if (form.value.id) { await API.devices.update(form.value.id, form.value); showToast('Đã cập nhật'); }
                else { await API.devices.create(form.value); showToast('Đã thêm thiết bị'); }
                showModal.value = false; await load();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function remove(d) {
            if (!confirm('Xóa thiết bị ' + d.name + '?')) return;
            try { await API.devices.del(d.id); showToast('Đã xóa'); await load(); }
            catch(e) { showToast(e.message, 'error'); }
        }

        async function testDevice(d) {
            try { await API.devices.test(d.id); showToast('Đã gửi test command tới ' + d.name); }
            catch(e) { showToast(e.message, 'error'); }
        }

        function openTypeForm(t) {
            typeForm.value = t ? { ...t } : { code: '', name: '', channel_count: 0, description: '' };
            showTypeModal.value = true;
        }

        async function saveType() {
            try {
                if (typeForm.value.id) { await API.devices.types.update(typeForm.value.id, typeForm.value); showToast('Đã cập nhật'); }
                else { await API.devices.types.create(typeForm.value); showToast('Đã thêm loại thiết bị'); }
                showTypeModal.value = false; await load();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function removeType(t) {
            if (!confirm('Xóa loại ' + t.name + '?')) return;
            try { await API.devices.types.del(t.id); showToast('Đã xóa'); await load(); }
            catch(e) { showToast(e.message, 'error'); }
        }

        onMounted(load);
        // Auto-refresh device status every 30 seconds
        const refreshInterval = setInterval(load, 30000);

        return {
            devices, types, barns, tab, showModal, showTypeModal, showFirmwareModal,
            form, typeForm, barnsWithDevices, activeDropdown, toggleDropdown,
            getRelayState, toggleRelay, timeAgo,
            openFirmwareModal, downloadFirmware, firmwareDevice, firmwareCode, firmwareLoading, firmwareError,
            openForm, save, remove, testDevice, openTypeForm, saveType, removeType
        };
    }
};

return component;
