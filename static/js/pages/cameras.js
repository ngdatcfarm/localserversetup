const { ref, reactive, onMounted, onUnmounted } = Vue;

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

        <!-- Add Camera Modal -->
        <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
            <div class="modal">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold">Thêm Camera</h3>
                    <button class="text-gray-500 hover:text-gray-700 text-xl" @click="showModal = false">&times;</button>
                </div>
                <form @submit.prevent="saveCamera">
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">ID *</label>
                            <input v-model="form.id" type="text" class="input" placeholder="cam_001" required>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Tên *</label>
                            <input v-model="form.name" type="text" class="input" placeholder="Camera cổng" required>
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-3 mt-3">
                        <div class="col-span-2">
                            <label class="block text-xs font-medium text-gray-600 mb-1">IP *</label>
                            <input v-model="form.ip" type="text" class="input" placeholder="192.168.1.72" required>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Port</label>
                            <input v-model="form.port" type="number" class="input" placeholder="554">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 mt-3">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Username *</label>
                            <input v-model="form.username" type="text" class="input" placeholder="admin" required>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Password *</label>
                            <input v-model="form.password" type="password" class="input" placeholder="••••••••" required>
                        </div>
                    </div>
                    <div class="mt-3">
                        <label class="block text-xs font-medium text-gray-600 mb-1">RTSP Path</label>
                        <input v-model="form.rtsp_path" type="text" class="input" placeholder="/unicast/c1/s0/live">
                    </div>
                    <div class="grid grid-cols-2 gap-3 mt-3">
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">Stream Type</label>
                            <select v-model="form.stream_type" class="input">
                                <option value="main">Main</option>
                                <option value="sub">Sub</option>
                            </select>
                        </div>
                        <div class="flex items-center h-full pt-4">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input v-model="form.enabled" type="checkbox" class="w-4 h-4 text-green-600">
                                <span class="text-sm">Kích hoạt</span>
                            </label>
                        </div>
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button type="button" class="btn btn-secondary flex-1" @click="showModal = false">Hủy</button>
                        <button type="submit" class="btn btn-primary flex-1">Lưu</button>
                    </div>
                </form>
            </div>
        </div>

        <div v-if="cameras.length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div v-for="cam in cameras" :key="cam.id" class="card">
                <!-- Preview: snapshot only, no live stream -->
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
                    <button v-if="!getStatus(cam.id).recording" class="btn btn-warning btn-sm" @click="startRec(cam)">Ghi hình</button>
                    <button v-if="getStatus(cam.id).recording" class="btn btn-danger btn-sm" @click="stopRec(cam)">Dừng ghi</button>
                </div>

                <!-- PTZ Controls -->
                <div v-if="cam.ptz_enabled || cam.ptz" class="mt-3 border-t pt-3">
                    <div class="text-xs font-semibold text-gray-500 mb-2">PTZ</div>
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
    </div>`,

    setup() {
        const cameras = ref([]);
        const statuses = ref({});
        const snapTs = ref(Date.now());
        let refreshTimer = null;

        // Modal state
        const showModal = ref(false);
        const form = ref({
            id: '', name: '', ip: '', port: 554,
            username: '', password: '',
            rtsp_path: '/unicast/c1/s0/live',
            stream_type: 'main', enabled: true
        });

        function openAddModal() {
            form.value = { id: '', name: '', ip: '', port: 554,
                username: '', password: '',
                rtsp_path: '/unicast/c1/s0/live',
                stream_type: 'main', enabled: true };
            showModal.value = true;
        }

        async function saveCamera() {
            try {
                const payload = {
                    id: form.value.id,
                    name: form.value.name,
                    ip: form.value.ip,
                    port: parseInt(form.value.port) || 554,
                    username: form.value.username,
                    password: form.value.password,
                    rtsp_path: form.value.rtsp_path || '/unicast/c1/s0/live',
                    enabled: form.value.enabled,
                    stream_type: form.value.stream_type
                };
                await fetch('/api/cameras', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                showModal.value = false;
                showToast('Đã thêm camera ' + form.value.name);
                await loadCameras();
            } catch(e) {
                showToast(e.message, 'error');
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

        onMounted(async () => {
            await Promise.all([loadCameras(), loadStatuses()]);
            refreshTimer = setInterval(loadStatuses, 10000);
        });

        onUnmounted(() => {
            if (refreshTimer) clearInterval(refreshTimer);
        });

        return { cameras, statuses, snapTs, getStatus, snapshotUrl, onImgError, openStream, refreshSnapshots,
            startCam, stopCam, testCam, startRec, stopRec, recAll, ptzMove, ptzStop,
            showModal, form, openAddModal, saveCamera };
    }
};

return component;
