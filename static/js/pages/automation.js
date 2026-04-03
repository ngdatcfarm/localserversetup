const { ref, onMounted } = Vue;

const component = {
    template: `
    <div>
        <div class="page-header">
            <h2 class="page-title">Tự động hóa</h2>
            <button class="btn btn-primary" @click="openForm()">+ Thêm quy tắc</button>
        </div>

        <div v-if="rules.length" class="table-wrap">
            <table>
                <thead><tr><th>Tên</th><th>Loại</th><th>Chi tiết</th><th>Hành động</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                <tbody>
                    <tr v-for="r in rules" :key="r.id">
                        <td class="font-medium">{{ r.name }}</td>
                        <td><span :class="r.trigger_type==='schedule' ? 'badge badge-blue' : 'badge badge-yellow'">{{ r.trigger_type==='schedule' ? 'Hẹn giờ' : 'Điều kiện' }}</span></td>
                        <td class="text-sm text-gray-600">
                            <span v-if="r.trigger_type==='schedule'">{{ r.cron_expression }}</span>
                            <span v-else>{{ r.sensor_type }} {{ r.operator }} {{ r.threshold }}</span>
                        </td>
                        <td class="text-sm">{{ r.action_topic }} ch{{ r.action_channel }} → {{ r.action_state }}
                            <span v-if="r.action_duration_seconds"> ({{ r.action_duration_seconds }}s)</span>
                        </td>
                        <td><span :class="r.enabled ? 'badge badge-green' : 'badge badge-gray'">{{ r.enabled ? 'Bật' : 'Tắt' }}</span></td>
                        <td class="flex gap-1">
                            <button class="btn btn-secondary btn-sm" @click="openForm(r)">Sửa</button>
                            <button class="btn btn-danger btn-sm" @click="remove(r)">Xóa</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-else class="empty-state"><div class="icon">⚡</div><p>Chưa có quy tắc tự động</p></div>

        <!-- Modal -->
        <div v-if="showModal" class="modal-overlay" @click.self="showModal=false">
            <div class="modal">
                <h3>{{ form.id ? 'Sửa quy tắc' : 'Thêm quy tắc tự động' }}</h3>
                <div class="form-group"><label>Tên</label><input v-model="form.name" placeholder="VD: Bật quạt lúc 6h sáng"></div>
                <div class="form-group"><label>Loại trigger</label>
                    <select v-model="form.trigger_type">
                        <option value="schedule">Hẹn giờ (Cron)</option>
                        <option value="sensor">Điều kiện sensor</option>
                    </select>
                </div>

                <!-- Schedule fields -->
                <div v-if="form.trigger_type==='schedule'" class="form-group">
                    <label>Cron expression</label>
                    <input v-model="form.cron_expression" placeholder="VD: 0 6 * * * (6h hàng ngày)">
                    <p class="text-xs text-gray-400 mt-1">Phút Giờ Ngày Tháng Thứ</p>
                </div>

                <!-- Sensor fields -->
                <div v-if="form.trigger_type==='sensor'">
                    <div class="grid grid-cols-3 gap-4">
                        <div class="form-group"><label>Sensor type</label><input v-model="form.sensor_type" placeholder="temperature"></div>
                        <div class="form-group"><label>Toán tử</label>
                            <select v-model="form.operator"><option value=">">&gt;</option><option value="<">&lt;</option><option value=">=">&gt;=</option><option value="<=">&lt;=</option><option value="==">==</option></select>
                        </div>
                        <div class="form-group"><label>Ngưỡng</label><input v-model.number="form.threshold" type="number" step="0.1"></div>
                    </div>
                    <div class="form-group"><label>Cooldown (giây)</label><input v-model.number="form.cooldown_seconds" type="number"></div>
                </div>

                <hr class="my-3">
                <h4 class="font-medium mb-2">Hành động</h4>
                <div class="grid grid-cols-2 gap-4">
                    <div class="form-group"><label>MQTT Topic</label><input v-model="form.action_topic" placeholder="cfarm/esp32_01"></div>
                    <div class="form-group"><label>Kênh relay</label><input v-model.number="form.action_channel" type="number"></div>
                    <div class="form-group"><label>Trạng thái</label>
                        <select v-model="form.action_state"><option value="on">Bật (ON)</option><option value="off">Tắt (OFF)</option></select>
                    </div>
                    <div class="form-group"><label>Thời gian (giây, 0 = vĩnh viễn)</label><input v-model.number="form.action_duration_seconds" type="number"></div>
                </div>

                <div class="form-group"><label>
                    <input type="checkbox" v-model="form.enabled" class="mr-2"> Kích hoạt
                </label></div>

                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-secondary" @click="showModal=false">Huỷ</button>
                    <button class="btn btn-primary" @click="save">Lưu</button>
                </div>
            </div>
        </div>
    </div>`,

    setup() {
        const rules = ref([]);
        const showModal = ref(false);
        const form = ref({});

        async function load() {
            try { rules.value = await API.automation.list(); } catch { rules.value = []; }
        }

        function openForm(r) {
            form.value = r ? { ...r } : {
                name: '', trigger_type: 'schedule', cron_expression: '', sensor_type: '', operator: '>', threshold: 0,
                cooldown_seconds: 300, action_topic: '', action_channel: 1, action_state: 'on', action_duration_seconds: 0, enabled: true,
            };
            showModal.value = true;
        }

        async function save() {
            try {
                if (form.value.id) await API.automation.update(form.value.id, form.value);
                else await API.automation.create(form.value);
                showModal.value = false; showToast('Đã lưu'); await load();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function remove(r) {
            if (!confirm('Xóa quy tắc ' + r.name + '?')) return;
            try { await API.automation.del(r.id); showToast('Đã xóa'); await load(); } catch(e) { showToast(e.message, 'error'); }
        }

        onMounted(load);
        return { rules, showModal, form, openForm, save, remove };
    }
};

return component;
