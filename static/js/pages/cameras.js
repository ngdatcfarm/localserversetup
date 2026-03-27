const { ref, onMounted, onUnmounted } = Vue;

const component = {
    template: `
    <div>
        <div class="page-header">
            <h2 class="page-title">Camera</h2>
            <div class="flex gap-2">
                <button class="btn btn-primary btn-sm" @click="refreshAll">Refresh</button>
                <button class="btn btn-secondary btn-sm" @click="recAll(true)">Ghi hình tất cả</button>
                <button class="btn btn-danger btn-sm" @click="recAll(false)">Dừng ghi tất cả</button>
            </div>
        </div>

        <div v-if="cameras.length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div v-for="cam in cameras" :key="cam.id" class="card">
                <!-- Stream -->
                <div class="bg-black rounded-lg overflow-hidden mb-3 relative" style="aspect-ratio:16/9">
                    <img v-if="cam.enabled" :src="'/stream/' + cam.id + '/mjpeg'" class="w-full h-full object-contain"
                         @error="$event.target.style.display='none'" />
                    <div v-if="!cam.enabled" class="absolute inset-0 flex items-center justify-center text-gray-400">
                        Camera tắt
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
                    <a :href="'/stream/' + cam.id + '/mjpeg'" target="_blank" class="btn btn-secondary btn-sm">MJPEG</a>
                    <a :href="'/stream/' + cam.id + '/snapshot'" target="_blank" class="btn btn-secondary btn-sm">Snapshot</a>
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
        let refreshTimer = null;

        function getStatus(id) {
            return statuses.value[id] || { online: false, fps: 0, recording: false };
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

        async function refreshAll() {
            await Promise.all([loadCameras(), loadStatuses()]);
            showToast('Đã refresh');
        }

        async function startCam(cam) {
            try { await API.cameras.start(cam.id); showToast(cam.name + ' đã bật'); await loadStatuses(); }
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
            refreshTimer = setInterval(loadStatuses, 5000);
        });

        onUnmounted(() => {
            if (refreshTimer) clearInterval(refreshTimer);
        });

        return { cameras, statuses, getStatus, refreshAll, startCam, stopCam, testCam, startRec, stopRec, recAll, ptzMove, ptzStop };
    }
};

return component;
