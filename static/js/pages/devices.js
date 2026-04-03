const { ref, onMounted } = Vue;

const component = {
    template: `
    <div>
        <div class="page-header">
            <h2 class="page-title">Thiết bị IoT</h2>
            <button class="btn btn-primary" @click="openForm()">+ Thêm thiết bị</button>
        </div>

        <div class="tabs mb-4">
            <div class="tab" :class="{active: tab==='list'}" @click="tab='list'">Danh sách</div>
            <div class="tab" :class="{active: tab==='types'}" @click="tab='types'">Loại thiết bị</div>
        </div>

        <!-- Device List -->
        <div v-if="tab==='list'">
            <div v-if="devices.length" class="table-wrap">
                <table>
                    <thead><tr>
                        <th>Trạng thái</th><th>Mã</th><th>Tên</th><th>Loại</th><th>Chuồng</th><th>MQTT Topic</th><th>Thao tác</th>
                    </tr></thead>
                    <tbody>
                        <tr v-for="d in devices" :key="d.id">
                            <td><span class="online-dot" :class="d.is_online ? 'on' : 'off'"></span> {{ d.is_online ? 'Online' : 'Offline' }}</td>
                            <td class="font-mono text-xs">{{ d.device_code }}</td>
                            <td class="font-medium">{{ d.name }}</td>
                            <td>{{ d.type_name || '-' }}</td>
                            <td>{{ d.barn_id || '-' }}</td>
                            <td class="font-mono text-xs">{{ d.mqtt_topic }}</td>
                            <td class="flex gap-1">
                                <button class="btn btn-primary btn-sm" @click="testDevice(d)">Test</button>
                                <button class="btn btn-secondary btn-sm" @click="openForm(d)">Sửa</button>
                                <button class="btn btn-danger btn-sm" @click="remove(d)">Xóa</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="empty-state"><div class="icon">📡</div><p>Chưa có thiết bị</p></div>
        </div>

        <!-- Device Types -->
        <div v-if="tab==='types'">
            <div class="mb-3"><button class="btn btn-primary btn-sm" @click="openTypeForm()">+ Thêm loại</button></div>
            <div v-if="types.length" class="table-wrap">
                <table>
                    <thead><tr><th>Code</th><th>Tên</th><th>Số kênh</th><th>Mô tả</th><th>Thao tác</th></tr></thead>
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

        <!-- Device Modal -->
        <div v-if="showModal" class="modal-overlay" @click.self="showModal=false">
            <div class="modal">
                <h3>{{ form.id ? 'Sửa thiết bị' : 'Thêm thiết bị' }}</h3>
                <div class="form-group"><label>Mã thiết bị</label><input v-model="form.device_code" placeholder="VD: esp32_relay_01"></div>
                <div class="form-group"><label>Tên</label><input v-model="form.name" placeholder="Tên thiết bị"></div>
                <div class="form-group"><label>Loại</label>
                    <select v-model="form.device_type_id"><option :value="null">-- Chọn --</option>
                        <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
                    </select>
                </div>
                <div class="form-group"><label>Chuồng</label><input v-model="form.barn_id" placeholder="ID chuồng (tuỳ chọn)"></div>
                <div class="form-group"><label>MQTT Topic</label><input v-model="form.mqtt_topic" placeholder="VD: cfarm/esp32_relay_01"></div>
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
        const tab = ref('list');
        const showModal = ref(false);
        const showTypeModal = ref(false);
        const form = ref({});
        const typeForm = ref({});

        async function load() {
            [devices.value, types.value] = await Promise.all([
                API.devices.list().catch(() => []),
                API.devices.types.list().catch(() => []),
            ]);
        }

        function openForm(d) {
            form.value = d ? { ...d } : { device_code: '', name: '', device_type_id: null, barn_id: '', mqtt_topic: '' };
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
        return { devices, types, tab, showModal, showTypeModal, form, typeForm, openForm, save, remove, testDevice, openTypeForm, saveType, removeType };
    }
};

return component;
