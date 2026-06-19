const { ref, reactive, onMounted, onUnmounted } = Vue;

const PRESET_TYPES = ['ptz_position', 'snapshot', 'video', 'alert_trigger'];
const PRESET_TYPE_LABELS = { ptz_position: 'PTZ', snapshot: 'Snapshot', video: 'Video', alert_trigger: 'Alert' };
const PRESET_TYPE_ICONS = { ptz_position: '🎯', snapshot: '📷', video: '🎥', alert_trigger: '⚠️' };

const component = {
    template: `
    <div>
        <div class="page-header">
            <h2 class="page-title">Camera</h2>
            <div class="flex gap-2">
                <button class="btn btn-primary btn-sm" @click="openAddModal()">+ Thêm Camera</button>
                <button class="btn btn-secondary btn-sm" @click="refreshSnapshots">Refresh ảnh</button>
                <button class="btn btn-secondary btn-sm" @click="recAll(true)">Ghi hình tất cả</button>
                <button class="btn btn-danger btn-sm" @click="recAll(false)">Dừng ghi tất cả</button>
            </div>
        </div>

        <div v-if="cameras.length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div v-for="cam in cameras" :key="cam.id" class="card">
                <!-- Preview -->
                <div class="bg-black rounded-lg overflow-hidden mb-3 relative cursor-pointer" style="aspect-ratio:16/9"
                     @click="openStream(cam)">
                    <img v-if="cam.enabled" :src="snapshotUrl(cam.id)" class="w-full h-full object-contain"
                         @error="onImgError($event)" />
                    <div v-if="!cam.enabled" class="absolute inset-0 flex items-center justify-center text-gray-400">
                        Camera tắt
                    </div>
                    <div v-else class="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black bg-opacity-30">
                        <span class="text-white text-3xl">&#9654;</span>
                    </div>
                    <div class="absolute top-2 right-2">
                        <span :class="getStatus(cam.id).online ? 'badge badge-green' : 'badge badge-red'">
                            {{ getStatus(cam.id).online ? 'Online' : 'Offline' }}
                        </span>
                    </div>
                    <div v-if="getStatus(cam.id).recording" class="absolute top-2 left-2">
                        <span class="badge badge-red">REC</span>
                    </div>
                </div>

                <!-- Info -->
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <div class="font-semibold">{{ cam.name || cam.id }}</div>
                        <div class="text-xs text-gray-500">{{ cam.id }} | {{ getStatus(cam.id).fps || 0 }} fps</div>
                    </div>
                </div>

                <!-- Controls -->
                <div class="flex flex-wrap gap-1">
                    <a :href="'/stream/' + cam.id" target="_blank" class="btn btn-primary btn-sm">Xem stream</a>
                    <button v-if="!cam.enabled || !getStatus(cam.id).online" class="btn btn-primary btn-sm" @click="startCam(cam)">Bật</button>
                    <button v-if="cam.enabled && getStatus(cam.id).online" class="btn btn-danger btn-sm" @click="stopCam(cam)">Tắt</button>
                    <button class="btn btn-secondary btn-sm" @click="testCam(cam)">Test</button>
                    <button class="btn btn-secondary btn-sm" @click="openEditModal(cam)">Sửa</button>
                    <button class="btn btn-danger btn-sm" @click="deleteCam(cam)">Xóa</button>
                    <button v-if="!getStatus(cam.id).recording" class="btn btn-warning btn-sm" @click="startRec(cam)">Ghi hình</button>
                    <button v-if="getStatus(cam.id).recording" class="btn btn-danger btn-sm" @click="stopRec(cam)">Dừng ghi</button>
                </div>

                <!-- PTZ Controls + Presets -->
                <div v-if="cam.ptz_enabled || cam.ptz" class="mt-3 border-t pt-3">
                    <div class="flex justify-between items-center mb-2">
                        <div class="text-xs font-semibold text-gray-500">PRESETS</div>
                        <button class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:11px" @click="openAddPresetModal(cam)">+ Thêm</button>
                    </div>

                    <!-- Preset bar (giống stream_view.html - nhấn giữ 2s để lưu) -->
                    <div v-if="camPresets[cam.id] && camPresets[cam.id].length" class="flex flex-wrap gap-1 mb-3">
                        <button v-for="p in camPresets[cam.id]" :key="p.id"
                            class="preset-quick-btn"
                            :class="{ 'saving': p._saving }"
                            @click="goToPreset(cam, p)"
                            @mousedown="startSavePreset(cam, p)"
                            @mouseup="endSavePreset(cam, p)"
                            @mouseleave="cancelSavePreset(p)"
                            @touchstart="startSavePreset(cam, p)"
                            @touchend="endSavePreset(cam, p)"
                            @touchcancel="cancelSavePreset(p)">
                            <i class="fas fa-location-dot mr-1" style="font-size:10px"></i>{{ p.name }}
                        </button>
                    </div>
                    <div v-else class="text-xs text-gray-400 mb-3">Di chuyển camera xong nhấn giữ preset 2s để lưu</div>

                    <!-- Joystick -->
                    <div class="flex items-center justify-center gap-1">
                        <div class="grid grid-cols-3 gap-1" style="width:120px">
                            <div></div>
                            <button class="btn btn-secondary btn-sm justify-center" @mousedown="ptzMove(cam,'up')" @mouseup="ptzStop(cam)">&#9650;</button>
                            <div></div>
                            <button class="btn btn-secondary btn-sm justify-center" @mousedown="ptzMove(cam,'left')" @mouseup="ptzStop(cam)">&#9664;</button>
                            <button class="btn btn-secondary btn-sm justify-center text-xs" @click="ptzStop(cam)">&#9632;</button>
                            <button class="btn btn-secondary btn-sm justify-center" @mousedown="ptzMove(cam,'right')" @mouseup="ptzStop(cam)">&#9654;</button>
                            <div></div>
                            <button class="btn btn-secondary btn-sm justify-center" @mousedown="ptzMove(cam,'down')" @mouseup="ptzStop(cam)">&#9660;</button>
                            <div></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-else class="empty-state">
            <div class="icon">📹</div>
            <p>Chưa có camera nào được cấu hình</p>
            <p class="text-sm mt-1">Cấu hình camera trong config/cameras.yaml</p>
        </div>

        <!-- Add / Edit Camera Modal -->
        <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
            <div class="modal" style="max-width:36rem">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold">{{ editMode ? 'Sửa Camera' : 'Thêm Camera' }}</h3>
                    <button type="button" class="text-gray-500 hover:text-gray-700 text-xl" @click="showModal = false">&times;</button>
                </div>
                <form @submit.prevent="saveCamera">
                    <div class="grid grid-cols-2 gap-3">
                        <div class="form-group">
                            <label>ID *</label>
                            <input v-model="form.id" type="text" placeholder="VD: cam-01" :disabled="editMode" required>
                            <small v-if="editMode" class="text-gray-400">ID không thể đổi</small>
                        </div>
                        <div class="form-group">
                            <label>Tên *</label>
                            <input v-model="form.name" type="text" placeholder="VD: Camera cổng" required>
                        </div>
                        <div class="form-group">
                            <label>IP *</label>
                            <input v-model="form.ip" type="text" placeholder="192.168.1.100" required>
                        </div>
                        <div class="form-group">
                            <label>Port</label>
                            <input v-model.number="form.port" type="number" min="1" max="65535" placeholder="554">
                        </div>
                        <div class="form-group">
                            <label>Username</label>
                            <input v-model="form.username" type="text" placeholder="admin">
                        </div>
                        <div class="form-group">
                            <label>Password</label>
                            <input v-model="form.password" type="password" placeholder="••••••">
                        </div>
                        <div class="form-group col-span-2">
                            <label>RTSP Path</label>
                            <input v-model="form.rtsp_path" type="text" placeholder="/unicast/c1/s0/live">
                        </div>
                        <div class="form-group">
                            <label>Stream type</label>
                            <select v-model="form.stream_type">
                                <option value="main">Main</option>
                                <option value="sub">Sub</option>
                            </select>
                        </div>
                        <div class="form-group flex items-end">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input v-model="form.enabled" type="checkbox">
                                <span>Kích hoạt ngay</span>
                            </label>
                        </div>
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button type="button" class="btn btn-secondary flex-1" @click="showModal = false">Hủy</button>
                        <button type="submit" class="btn btn-primary flex-1">{{ editMode ? 'Cập nhật' : 'Lưu' }}</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Add Preset Modal -->
        <div v-if="showPresetModal" class="modal-overlay" @click.self="showPresetModal = false">
            <div class="modal">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold">Thêm Preset</h3>
                    <button class="text-gray-500 hover:text-gray-700 text-xl" @click="showPresetModal = false">&times;</button>
                </div>
                <form @submit.prevent="savePreset">
                    <div class="mb-3">
                        <label class="block text-xs font-medium text-gray-600 mb-1">Tên Preset *</label>
                        <input v-model="presetForm.name" type="text" class="input" placeholder="VD: Vị trí cổng" required>
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button type="button" class="btn btn-secondary flex-1" @click="showPresetModal = false">Hủy</button>
                        <button type="submit" class="btn btn-primary flex-1">Lưu</button>
                    </div>
                </form>
            </div>
        </div>
    </div>`,

    setup() {
        const cameras = ref([]);
        const statuses = ref({});
        const snapTs = ref(Date.now());
        const camPresets = ref({});  // camera_id -> presets array
        const showPresetModal = ref(false);
        const presetForm = ref({ name: '', camera_id: '' });
        let refreshTimer = null;
        let saveTimer = null;

        // Modal state
        const showModal = ref(false);
        const editMode = ref(false);
        const form = ref({
            id: '', name: '', ip: '', port: 554,
            username: '', password: '',
            rtsp_path: '/unicast/c1/s0/live',
            stream_type: 'main', enabled: true
        });

        function _emptyForm() {
            return {
                id: '', name: '', ip: '', port: 554,
                username: '', password: '',
                rtsp_path: '/unicast/c1/s0/live',
                stream_type: 'main', enabled: true
            };
        }

        function openAddModal() {
            form.value = _emptyForm();
            editMode.value = false;
            showModal.value = true;
        }

        function openEditModal(cam) {
            form.value = {
                id: cam.id,
                name: cam.name || '',
                ip: cam.ip || '',
                port: Number(cam.port) || 554,
                username: cam.username || '',
                password: cam.password || '',
                rtsp_path: cam.rtsp_path || '/unicast/c1/s0/live',
                stream_type: cam.stream_type || 'main',
                enabled: cam.enabled !== false
            };
            editMode.value = true;
            showModal.value = true;
        }

        async function saveCamera() {
            // Trim required fields
            const id = (form.value.id || '').trim();
            const name = (form.value.name || '').trim();
            const ip = (form.value.ip || '').trim();
            if (!id || !name || !ip) {
                showToast('Vui lòng nhập ID, Tên và IP', 'error');
                return;
            }
            const payload = {
                id,
                name,
                ip,
                port: parseInt(form.value.port) || 554,
                username: form.value.username,
                password: form.value.password,
                rtsp_path: form.value.rtsp_path || '/unicast/c1/s0/live',
                enabled: form.value.enabled,
                stream_type: form.value.stream_type
            };
            try {
                if (editMode.value) {
                    await API.cameras.update(id, payload);
                    showToast('Đã cập nhật camera ' + name);
                } else {
                    await API.cameras.create(payload);
                    showToast('Đã thêm camera ' + name);
                }
                showModal.value = false;
                await loadCameras();
                await loadStatuses();
            } catch(e) {
                showToast(e.message || 'Lỗi không xác định', 'error');
            }
        }

        async function deleteCam(cam) {
            if (!confirm(`Xóa camera "${cam.name || cam.id}"?\n\nCamera sẽ bị gỡ khỏi danh sách và dừng stream.`)) return;
            try {
                await API.cameras.delete(cam.id);
                showToast('Đã xóa camera ' + (cam.name || cam.id));
                await loadCameras();
            } catch(e) {
                showToast(e.message || 'Lỗi không xác định', 'error');
            }
        }

        function getStatus(id) {
            return statuses.value[id] || { online: false, fps: 0, recording: false };
        }

        function snapshotUrl(id) {
            return '/stream/' + id + '/snapshot?t=' + snapTs.value;
        }

        function onImgError(e) {
            e.target.style.opacity = '0.3';
        }

        function openStream(cam) {
            window.open('/stream/' + cam.id, '_blank');
        }

        function refreshSnapshots() {
            snapTs.value = Date.now();
            showToast('Đã refresh ảnh');
        }

        async function loadCameras() {
            try { cameras.value = await API.cameras.list(); } catch { cameras.value = []; }
            // Load presets for all PTZ cameras
            for (const cam of cameras.value) {
                if (cam.ptz_enabled || cam.ptz) {
                    await loadPresetsForCamera(cam.id);
                }
            }
        }

        async function loadPresetsForCamera(cameraId) {
            try {
                const data = await API.cameras.presets.list(cameraId);
                // API returns {local: [...], hardware: [...]} - use local presets
                const list = data.local || [];
                camPresets.value[cameraId] = list;
            } catch { camPresets.value[cameraId] = []; }
        }

        function openAddPresetModal(cam) {
            presetForm.value = { name: '', camera_id: cam.id };
            showPresetModal.value = true;
        }

        async function savePreset() {
            if (!presetForm.value.name.trim()) { showToast('Nhập tên preset', 'error'); return; }
            try {
                // Find next available preset number
                const existing = camPresets.value[presetForm.value.camera_id] || [];
                let nextNum = 1;
                while (existing.some(p => p.number === nextNum)) nextNum++;

                // Use set endpoint with new number (this creates if not exists)
                await API.cameras.presets.set(presetForm.value.camera_id, nextNum, presetForm.value.name.trim());
                showPresetModal.value = false;
                showToast('Đã thêm preset "' + presetForm.value.name + '"');
                await loadPresetsForCamera(presetForm.value.camera_id);
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function loadStatuses() {
            try {
                const all = await API.cameras.statusAll();
                const map = {};
                if (Array.isArray(all)) {
                    all.forEach(s => map[s.id || s.camera_id] = s);
                } else if (typeof all === 'object') {
                    Object.assign(map, all);
                }
                statuses.value = map;
            } catch { /* ignore */ }
        }

        async function startCam(cam) {
            try { await API.cameras.start(cam.id); showToast(cam.name + ' đã bật'); await loadStatuses(); snapTs.value = Date.now(); }
            catch(e) { showToast(e.message, 'error'); }
        }
        async function stopCam(cam) {
            try { await API.cameras.stop(cam.id); showToast(cam.name + ' đã tắt'); await loadStatuses(); }
            catch(e) { showToast(e.message, 'error'); }
        }
        async function testCam(cam) {
            try { const r = await API.cameras.test(cam.id); showToast('Test: ' + (r.success ? 'OK' : 'Failed')); }
            catch(e) { showToast(e.message, 'error'); }
        }

        async function startRec(cam) {
            try { await API.recording.start(cam.id); showToast('Bắt đầu ghi hình ' + cam.name); await loadStatuses(); }
            catch(e) { showToast(e.message, 'error'); }
        }
        async function stopRec(cam) {
            try { await API.recording.stop(cam.id); showToast('Dừng ghi hình ' + cam.name); await loadStatuses(); }
            catch(e) { showToast(e.message, 'error'); }
        }
        async function recAll(start) {
            try {
                if (start) await API.recording.startAll(); else await API.recording.stopAll();
                showToast(start ? 'Bắt đầu ghi tất cả' : 'Dừng ghi tất cả');
                await loadStatuses();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function ptzMove(cam, dir) {
            try { await API.cameras.ptz.move(cam.id, dir); } catch { /* ignore */ }
        }
        async function ptzStop(cam) {
            try { await API.cameras.ptz.stop(cam.id); } catch { /* ignore */ }
        }

        // ── Preset quick actions (giống stream_view.html) ──
        function startSavePreset(cam, p) {
            p._saving = false;
            p._longPressed = false;
            saveTimer = setTimeout(() => {
                p._saving = true;
                savePresetPosition(cam, p);
            }, 2000);
        }

        function endSavePreset(cam, p) {
            clearTimeout(saveTimer);
            if (!p._longPressed) {
                goToPreset(cam, p);
            }
            p._saving = false;
        }

        function cancelSavePreset(p) {
            clearTimeout(saveTimer);
            p._saving = false;
        }

        async function goToPreset(cam, p) {
            try {
                const r = await API.cameras.presets.goto(cam.id, p.number);
                showToast(r.success ? '→ ' + p.name : 'Lỗi: ' + r.message);
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function savePresetPosition(cam, p) {
            p._saving = true;
            try {
                const r = await API.cameras.presets.set(cam.id, p.number, p.name);
                showToast(r.success ? '💾 Đã lưu "' + p.name + '"' : 'Lỗi: ' + r.message);
                await loadPresetsForCamera(cam.id);
            } catch(e) { showToast(e.message, 'error'); }
            p._saving = false;
        }

        onMounted(async () => {
            await Promise.all([loadCameras(), loadStatuses()]);
            refreshTimer = setInterval(loadStatuses, 10000);
        });

        onUnmounted(() => {
            if (refreshTimer) clearInterval(refreshTimer);
            if (saveTimer) clearTimeout(saveTimer);
        });

        return { cameras, statuses, snapTs, getStatus, snapshotUrl, onImgError, openStream, refreshSnapshots,
            startCam, stopCam, testCam, startRec, stopRec, recAll, ptzMove, ptzStop,
            showModal, form, editMode, openAddModal, openEditModal, saveCamera, deleteCam,
            showPresetModal, presetForm, openAddPresetModal, savePreset,
            camPresets, goToPreset, startSavePreset, endSavePreset, cancelSavePreset, loadPresetsForCamera };
    }
};

export default component;
