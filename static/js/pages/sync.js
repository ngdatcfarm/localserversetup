/**
 * Cloud Sync - Config, status, manual trigger, logs, queue viewer
 */
const { ref, reactive, onMounted, onUnmounted } = Vue;

return {
    setup() {
        const status = ref(null);
        const config = reactive({
            cloud_url: '', api_token: '', local_token: '',
            sync_interval: 60, push_batch_size: 100, enabled: false
        });
        const logs = ref([]);
        const queue = ref([]);
        const tab = ref('status');
        const syncing = ref(false);
        const saving = ref(false);
        const editMode = ref(false);
        let refreshTimer = null;

        async function loadStatus() {
            try { status.value = await API.sync.status(); }
            catch(e) { console.error(e); }
        }

        async function loadConfig() {
            try {
                const c = await API.sync.config();
                Object.assign(config, c);
            } catch(e) { console.error(e); }
        }

        async function loadLogs() {
            try {
                const r = await API.sync.logs(30);
                logs.value = r.logs || [];
            } catch(e) { logs.value = []; }
        }

        async function loadQueue() {
            try {
                const r = await API.sync.queue(50);
                queue.value = r.items || [];
            } catch(e) { queue.value = []; }
        }

        async function saveConfig() {
            saving.value = true;
            try {
                await API.sync.updateConfig({
                    cloud_url: config.cloud_url || null,
                    api_token: config.api_token || null,
                    local_token: config.local_token || null,
                    sync_interval: parseInt(config.sync_interval) || 60,
                    push_batch_size: parseInt(config.push_batch_size) || 100,
                    enabled: config.enabled,
                });
                showToast('Cau hinh da luu');
                editMode.value = false;
                await loadStatus();
            } catch(e) { showToast(e.message, 'error'); }
            saving.value = false;
        }

        async function triggerSync() {
            syncing.value = true;
            try {
                const r = await API.sync.now();
                showToast(`Sync xong: pushed ${r.pushed}, pulled ${r.pulled}`);
                await loadStatus();
                await loadLogs();
                await loadQueue();
            } catch(e) { showToast(e.message, 'error'); }
            syncing.value = false;
        }

        async function toggleEnabled() {
            try {
                await API.sync.updateConfig({ enabled: !config.enabled });
                config.enabled = !config.enabled;
                showToast(config.enabled ? 'Sync da bat' : 'Sync da tat');
                await loadStatus();
            } catch(e) { showToast(e.message, 'error'); }
        }

        onMounted(async () => {
            await Promise.all([loadStatus(), loadConfig()]);
            refreshTimer = setInterval(loadStatus, 15000);
        });

        onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer); });

        function loadTab() {
            if (tab.value === 'logs') loadLogs();
            else if (tab.value === 'queue') loadQueue();
        }

        async function fullSync() {
            syncing.value = true;
            try {
                const r = await API.sync.fullSync();
                showToast(`Full sync xong: pulled ${r.pulled}, pushed ${r.pushed}, errors ${r.errors}`);
                await loadStatus();
                await loadLogs();
            } catch(e) { showToast(e.message, 'error'); }
            syncing.value = false;
        }

        return { status, config, logs, queue, tab, syncing, saving, editMode,
                 saveConfig, triggerSync, fullSync, toggleEnabled, loadTab, fmtDate, fmtNum };
    },

    template: `
    <div>
        <h2 class="text-xl font-bold mb-4">Cloud Sync</h2>

        <!-- Status Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4" v-if="status">
            <div class="card p-3 text-center">
                <div class="text-xs text-gray-500 uppercase">Trang thai</div>
                <div class="text-lg font-bold" :class="status.enabled ? 'text-green-600' : 'text-gray-400'">
                    {{ status.enabled ? 'Bat' : 'Tat' }}
                </div>
            </div>
            <div class="card p-3 text-center">
                <div class="text-xs text-gray-500 uppercase">Da day len</div>
                <div class="text-2xl font-bold text-blue-600">{{ fmtNum(status.stats?.pushed) }}</div>
            </div>
            <div class="card p-3 text-center">
                <div class="text-xs text-gray-500 uppercase">Da keo ve</div>
                <div class="text-2xl font-bold text-green-600">{{ fmtNum(status.stats?.pulled) }}</div>
            </div>
            <div class="card p-3 text-center">
                <div class="text-xs text-gray-500 uppercase">Loi</div>
                <div class="text-2xl font-bold text-red-600">{{ fmtNum(status.stats?.errors) }}</div>
            </div>
        </div>

        <!-- Quick Actions -->
        <div class="flex gap-2 mb-4 flex-wrap">
            <button @click="toggleEnabled"
                    :class="config.enabled ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'"
                    class="text-white px-4 py-2 rounded-lg text-sm font-medium">
                {{ config.enabled ? 'Tat Sync' : 'Bat Sync' }}
            </button>
            <button @click="triggerSync" :disabled="syncing || !config.cloud_url"
                    class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {{ syncing ? 'Dang sync...' : 'Sync ngay' }}
            </button>
            <button @click="fullSync" :disabled="syncing || !config.cloud_url"
                    class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                Full Sync
            </button>
        </div>

        <!-- Last sync info -->
        <div v-if="status?.last_sync_at" class="text-sm text-gray-500 mb-4">
            Lan sync cuoi: {{ fmtDate(status.last_sync_at) }}
            <span v-if="status.stats?.last_error" class="text-red-500 ml-2">Loi: {{ status.stats.last_error }}</span>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 mb-4 flex-wrap">
            <button v-for="t in ['status','config','logs','queue']" :key="t"
                    @click="tab=t; loadTab()"
                    :class="tab===t ? 'bg-green-600 text-white' : 'bg-gray-200'"
                    class="px-3 py-1.5 rounded-lg text-sm font-medium">
                {{ {status:'Trang thai', config:'Cau hinh', logs:'Nhat ky', queue:'Hang doi'}[t] }}
            </button>
        </div>

        <!-- Status Tab -->
        <div v-if="tab==='status'" class="card">
            <h3 class="font-semibold mb-3">Thong tin ket noi</h3>
            <div class="space-y-2 text-sm">
                <div class="flex justify-between py-1 border-b">
                    <span class="text-gray-500">Cloud URL</span>
                    <span class="font-medium">{{ status?.cloud_url || 'Chua cau hinh' }}</span>
                </div>
                <div class="flex justify-between py-1 border-b">
                    <span class="text-gray-500">Background sync</span>
                    <span :class="status?.running ? 'text-green-600' : 'text-gray-400'" class="font-medium">
                        {{ status?.running ? 'Dang chay' : 'Dung' }}
                    </span>
                </div>
                <div class="flex justify-between py-1 border-b">
                    <span class="text-gray-500">Chu ky sync</span>
                    <span>{{ status?.sync_interval || 60 }}s</span>
                </div>
                <div class="flex justify-between py-1">
                    <span class="text-gray-500">Lan sync cuoi</span>
                    <span>{{ status?.last_sync_at ? fmtDate(status.last_sync_at) : 'Chua sync' }}</span>
                </div>
            </div>
        </div>

        <!-- Config Tab -->
        <div v-if="tab==='config'" class="card">
            <div class="flex justify-between items-center mb-3">
                <h3 class="font-semibold">Cau hinh dong bo</h3>
                <button @click="editMode=!editMode" class="text-sm text-green-600 hover:underline">
                    {{ editMode ? 'Huy' : 'Chinh sua' }}
                </button>
            </div>
            <div class="space-y-3">
                <div>
                    <label class="text-sm text-gray-600 block mb-1">Cloud URL</label>
                    <input v-model="config.cloud_url" :disabled="!editMode" placeholder="https://cfarm.vn"
                           class="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" />
                </div>
                <div>
                    <label class="text-sm text-gray-600 block mb-1">API Token (local goi cloud)</label>
                    <input v-model="config.api_token" :disabled="!editMode" type="password" placeholder="Token..."
                           class="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" />
                </div>
                <div>
                    <label class="text-sm text-gray-600 block mb-1">Local Token (cloud goi local)</label>
                    <input v-model="config.local_token" :disabled="!editMode" type="password" placeholder="Token..."
                           class="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" />
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-sm text-gray-600 block mb-1">Chu ky sync (giay)</label>
                        <input v-model.number="config.sync_interval" :disabled="!editMode" type="number" min="10"
                               class="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" />
                    </div>
                    <div>
                        <label class="text-sm text-gray-600 block mb-1">Batch size</label>
                        <input v-model.number="config.push_batch_size" :disabled="!editMode" type="number" min="10"
                               class="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50" />
                    </div>
                </div>
                <button v-if="editMode" @click="saveConfig" :disabled="saving"
                        class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium w-full disabled:opacity-50">
                    {{ saving ? 'Dang luu...' : 'Luu cau hinh' }}
                </button>
            </div>
        </div>

        <!-- Logs Tab -->
        <div v-if="tab==='logs'">
            <div v-if="logs.length" class="card overflow-x-auto">
                <table class="w-full text-sm">
                    <thead><tr class="text-left border-b">
                        <th class="pb-2">Thoi gian</th>
                        <th class="pb-2">Huong</th>
                        <th class="pb-2">So ban ghi</th>
                        <th class="pb-2">TT</th>
                        <th class="pb-2">Loi</th>
                    </tr></thead>
                    <tbody>
                        <tr v-for="l in logs" :key="l.id" class="border-b last:border-0">
                            <td class="py-1.5">{{ fmtDate(l.created_at) }}</td>
                            <td>
                                <span :class="l.direction==='push' ? 'text-blue-600' : 'text-green-600'" class="font-medium">
                                    {{ l.direction === 'push' ? 'Push' : 'Pull' }}
                                </span>
                            </td>
                            <td class="font-mono">{{ l.items_count }}</td>
                            <td>
                                <span :class="l.status==='ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
                                      class="px-2 py-0.5 rounded text-xs">{{ l.status }}</span>
                            </td>
                            <td class="text-red-500 text-xs max-w-xs truncate">{{ l.error_msg || '-' }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="text-center text-gray-400 py-8">Chua co nhat ky sync</div>
        </div>

        <!-- Queue Tab -->
        <div v-if="tab==='queue'">
            <div v-if="queue.length" class="card overflow-x-auto">
                <table class="w-full text-sm">
                    <thead><tr class="text-left border-b">
                        <th class="pb-2">Thoi gian</th>
                        <th class="pb-2">Bang</th>
                        <th class="pb-2">ID</th>
                        <th class="pb-2">Hanh dong</th>
                    </tr></thead>
                    <tbody>
                        <tr v-for="q in queue" :key="q.id" class="border-b last:border-0">
                            <td class="py-1.5 text-xs">{{ fmtDate(q.created_at) }}</td>
                            <td class="font-medium">{{ q.table_name }}</td>
                            <td class="font-mono text-xs">{{ q.record_id }}</td>
                            <td>
                                <span :class="{
                                    'bg-green-100 text-green-700': q.action==='insert',
                                    'bg-blue-100 text-blue-700': q.action==='update',
                                    'bg-red-100 text-red-700': q.action==='delete'
                                }" class="px-2 py-0.5 rounded text-xs">{{ q.action }}</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="text-center text-gray-400 py-8">Hang doi trong - Khong co ban ghi cho doi sync</div>
        </div>

        <!-- Help Text -->
        <div class="mt-4 text-xs text-gray-400">
            <p><strong>Huong dan:</strong> Cau hinh Cloud URL va API Token de bat dau dong bo.</p>
            <p>- <strong>Push:</strong> Du lieu local (cham soc, can, ban...) duoc day len cloud</p>
            <p>- <strong>Pull:</strong> Cau hinh (thuc an, thuoc, vaccine...) duoc keo ve tu cloud</p>
            <p>- <strong>Remote:</strong> Cloud co the dieu khien relay/man qua local MQTT</p>
        </div>
    </div>`
};
