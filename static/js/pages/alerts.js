const { ref, onMounted } = Vue;

const component = {
    template: `
    <div>
        <div class="page-header">
            <h2 class="page-title">Cảnh báo</h2>
            <button v-if="alerts.length" class="btn btn-secondary" @click="ackAll">Đã đọc tất cả</button>
        </div>

        <div class="tabs mb-4">
            <div class="tab" :class="{active: tab==='alerts'}" @click="tab='alerts'">Cảnh báo</div>
            <div class="tab" :class="{active: tab==='rules'}" @click="tab='rules'">Quy tắc</div>
        </div>

        <!-- Alert List -->
        <div v-if="tab==='alerts'">
            <div class="flex gap-2 mb-3">
                <button class="btn btn-sm" :class="filter===false ? 'btn-primary' : 'btn-secondary'" @click="filter=false; loadAlerts()">Chưa đọc</button>
                <button class="btn btn-sm" :class="filter===true ? 'btn-primary' : 'btn-secondary'" @click="filter=true; loadAlerts()">Đã đọc</button>
                <button class="btn btn-sm" :class="filter===undefined ? 'btn-primary' : 'btn-secondary'" @click="filter=undefined; loadAlerts()">Tất cả</button>
            </div>
            <div v-if="alerts.length" class="space-y-2">
                <div v-for="a in alerts" :key="a.id" class="card flex items-start gap-3">
                    <span class="text-xl mt-0.5">{{ a.severity==='danger' ? '🔴' : a.severity==='warning' ? '🟡' : '🔵' }}</span>
                    <div class="flex-1">
                        <div class="text-sm font-medium">{{ a.message }}</div>
                        <div class="text-xs text-gray-400 mt-1">{{ fmtDate(a.created_at) }} | {{ a.sensor_type }} = {{ a.value }}</div>
                    </div>
                    <button v-if="!a.acknowledged" class="btn btn-sm btn-secondary" @click="ack(a)">OK</button>
                    <span v-else class="badge badge-green">Đã đọc</span>
                </div>
            </div>
            <div v-else class="empty-state"><div class="icon">🔔</div><p>Không có cảnh báo</p></div>
        </div>

        <!-- Rules -->
        <div v-if="tab==='rules'">
            <div class="mb-3"><button class="btn btn-primary btn-sm" @click="openRule()">+ Thêm quy tắc</button></div>
            <div v-if="rules.length" class="table-wrap">
                <table>
                    <thead><tr><th>Tên</th><th>Sensor</th><th>Min</th><th>Max</th><th>Mức độ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                    <tbody>
                        <tr v-for="r in rules" :key="r.id">
                            <td class="font-medium">{{ r.name }}</td>
                            <td>{{ r.sensor_type }}</td>
                            <td>{{ r.min_value ?? '-' }}</td>
                            <td>{{ r.max_value ?? '-' }}</td>
                            <td><span :class="'badge badge-' + (r.severity==='danger' ? 'red' : r.severity==='warning' ? 'yellow' : 'blue')">{{ r.severity }}</span></td>
                            <td><span :class="r.enabled ? 'badge badge-green' : 'badge badge-gray'">{{ r.enabled ? 'Bật' : 'Tắt' }}</span></td>
                            <td class="flex gap-1">
                                <button class="btn btn-secondary btn-sm" @click="openRule(r)">Sửa</button>
                                <button class="btn btn-danger btn-sm" @click="delRule(r)">Xóa</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="empty-state"><p>Chưa có quy tắc cảnh báo</p></div>
        </div>

        <!-- Rule Modal -->
        <div v-if="showModal" class="modal-overlay" @click.self="showModal=false">
            <div class="modal">
                <h3>{{ ruleForm.id ? 'Sửa quy tắc' : 'Thêm quy tắc' }}</h3>
                <div class="form-group"><label>Tên</label><input v-model="ruleForm.name" placeholder="VD: Nhiệt độ quá cao"></div>
                <div class="form-group"><label>Sensor type</label><input v-model="ruleForm.sensor_type" placeholder="VD: temperature, humidity"></div>
                <div class="form-group"><label>Chuồng (tuỳ chọn)</label><input v-model="ruleForm.barn_id"></div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="form-group"><label>Giá trị Min</label><input v-model.number="ruleForm.min_value" type="number" step="0.1"></div>
                    <div class="form-group"><label>Giá trị Max</label><input v-model.number="ruleForm.max_value" type="number" step="0.1"></div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="form-group"><label>Mức độ</label>
                        <select v-model="ruleForm.severity"><option value="info">Info</option><option value="warning">Warning</option><option value="danger">Danger</option></select>
                    </div>
                    <div class="form-group"><label>Cooldown (phút)</label><input v-model.number="ruleForm.cooldown_minutes" type="number"></div>
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-secondary" @click="showModal=false">Huỷ</button>
                    <button class="btn btn-primary" @click="saveRule">Lưu</button>
                </div>
            </div>
        </div>
    </div>`,

    setup() {
        const alerts = ref([]);
        const rules = ref([]);
        const tab = ref('alerts');
        const filter = ref(false);
        const showModal = ref(false);
        const ruleForm = ref({});

        async function loadAlerts() {
            try { alerts.value = await API.alerts.list(filter.value); } catch { alerts.value = []; }
        }
        async function loadRules() {
            try { rules.value = await API.alerts.rules.list(); } catch { rules.value = []; }
        }

        async function ack(a) {
            try { await API.alerts.ack(a.id); a.acknowledged = true; showToast('Đã đánh dấu đọc'); } catch(e) { showToast(e.message, 'error'); }
        }
        async function ackAll() {
            try { await API.alerts.ackAll(); showToast('Đã đọc tất cả'); await loadAlerts(); } catch(e) { showToast(e.message, 'error'); }
        }

        function openRule(r) {
            ruleForm.value = r ? { ...r } : { name: '', sensor_type: '', barn_id: '', min_value: null, max_value: null, severity: 'warning', cooldown_minutes: 15, enabled: true };
            showModal.value = true;
        }

        async function saveRule() {
            try {
                if (ruleForm.value.id) await API.alerts.rules.update(ruleForm.value.id, ruleForm.value);
                else await API.alerts.rules.create(ruleForm.value);
                showModal.value = false; showToast('Đã lưu'); await loadRules();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function delRule(r) {
            if (!confirm('Xóa quy tắc ' + r.name + '?')) return;
            try { await API.alerts.rules.del(r.id); showToast('Đã xóa'); await loadRules(); } catch(e) { showToast(e.message, 'error'); }
        }

        onMounted(() => { loadAlerts(); loadRules(); });
        return { alerts, rules, tab, filter, showModal, ruleForm, loadAlerts, ack, ackAll, openRule, saveRule, delRule, fmtDate };
    }
};

return component;
