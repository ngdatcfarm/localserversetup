/**
 * Vaccines Page - Vaccine Programs & Schedules
 * Đã sửa lỗi redeclaration showToast
 */
const { ref, reactive, onMounted, computed, watch } = Vue;

return {
    setup() {
        // ── Fallback Helpers (đặt trong setup để tránh xung đột global) ──
        const _showToast = (msg, type = 'info') => {
            if (window.showToast) {
                window.showToast(msg, type);
            } else {
                console.log(`[${type}] ${msg}`);
                alert(msg);
            }
        };
        const _fmtDate = (dateStr) => {
            if (!dateStr) return '-';
            try {
                return new Date(dateStr).toLocaleDateString('vi-VN');
            } catch {
                return dateStr;
            }
        };
        const _fmtNum = (num) => {
            if (num == null) return '0';
            return Number(num).toLocaleString('vi-VN');
        };

        // ── State ──────────────────────────────────────
        const tab = ref('programs');
        const programs = ref([]);
        const selectedProgram = ref(null);
        const programItems = ref([]);
        const cycles = ref([]);
        const selectedCycleId = ref(null);
        const schedules = ref([]);
        const upcoming = ref([]);
        const showModal = ref(false);
        const modalType = ref('program');
        const editingId = ref(null);
        const loading = ref(false);

        const programForm = reactive({ name: '', note: '', active: true });
        const itemForm = reactive({ vaccine_name: '', day_age: null, method: '', remind_days: 1, sort_order: 0 });
        const scheduleForm = reactive({ cycle_id: null, vaccine_name: '', scheduled_date: '', day_age_target: null, method: '', dosage: '', remind_days: 1 });

        const methods = ['drink', 'inject', 'spray', 'eye_drop', 'feed'];

        // ── API Calls ─────────────────────────────────
        async function loadPrograms() {
            try { 
                programs.value = await API.vaccines.programs.list(); 
            } catch(e) { 
                _showToast('Lỗi tải chương trình: ' + e.message, 'error');
                programs.value = [];
            }
        }

        async function loadProgramDetail(id) {
            try {
                const p = await API.vaccines.programs.get(id);
                selectedProgram.value = p;
                programItems.value = p.items || [];
            } catch(e) { 
                _showToast('Lỗi tải chi tiết: ' + e.message, 'error');
            }
        }

        async function loadCycles() {
            try { 
                cycles.value = await API.cycles.list(); 
            } catch(e) { 
                console.warn('Không tải được cycles:', e);
                cycles.value = [];
            }
        }

        async function loadSchedules() {
            if (!selectedCycleId.value) { 
                schedules.value = []; 
                return; 
            }
            try { 
                schedules.value = await API.vaccines.schedules.list(selectedCycleId.value); 
            } catch(e) { 
                _showToast('Lỗi tải lịch tiêm: ' + e.message, 'error');
                schedules.value = [];
            }
        }

        async function loadUpcoming() {
            try { 
                upcoming.value = await API.vaccines.schedules.upcoming(14); 
            } catch(e) { 
                console.warn('Không tải được upcoming:', e);
                upcoming.value = [];
            }
        }

        watch(selectedCycleId, loadSchedules);

        // ── Program CRUD ────────────────────────────────
        function openProgramModal(p = null) {
            modalType.value = 'program';
            editingId.value = p ? p.id : null;
            if (p) Object.assign(programForm, { name: p.name, note: p.note || '', active: p.active });
            else Object.assign(programForm, { name: '', note: '', active: true });
            showModal.value = true;
        }

        async function saveProgram() {
            try {
                if (editingId.value) {
                    await API.vaccines.programs.update(editingId.value, { ...programForm });
                    _showToast('Đã cập nhật chương trình');
                } else {
                    await API.vaccines.programs.create({ ...programForm });
                    _showToast('Đã tạo chương trình');
                }
                showModal.value = false;
                await loadPrograms();
            } catch(e) { 
                _showToast(e.message, 'error');
            }
        }

        async function deleteProgram(p) {
            if (!confirm('Xóa chương trình "' + p.name + '"?')) return;
            try { 
                await API.vaccines.programs.del(p.id); 
                _showToast('Đã xóa'); 
                selectedProgram.value = null; 
                await loadPrograms(); 
            } catch(e) { 
                _showToast(e.message, 'error'); 
            }
        }

        // ── Item CRUD ───────────────────────────────────
        function openItemModal(item = null) {
            modalType.value = 'item';
            editingId.value = item ? item.id : null;
            if (item) {
                Object.assign(itemForm, { 
                    vaccine_name: item.vaccine_name, 
                    day_age: item.day_age, 
                    method: item.method || '', 
                    remind_days: item.remind_days || 1, 
                    sort_order: item.sort_order || 0 
                });
            } else {
                Object.assign(itemForm, { 
                    vaccine_name: '', 
                    day_age: null, 
                    method: '', 
                    remind_days: 1, 
                    sort_order: programItems.value.length + 1 
                });
            }
            showModal.value = true;
        }

        async function saveItem() {
            try {
                if (editingId.value) {
                    await API.vaccines.programs.updateItem(editingId.value, { ...itemForm });
                    _showToast('Đã cập nhật');
                } else {
                    await API.vaccines.programs.addItem(selectedProgram.value.id, { ...itemForm });
                    _showToast('Đã thêm vaccine');
                }
                showModal.value = false;
                await loadProgramDetail(selectedProgram.value.id);
            } catch(e) { 
                _showToast(e.message, 'error'); 
            }
        }

        async function deleteItem(item) {
            if (!confirm('Xóa?')) return;
            try { 
                await API.vaccines.programs.delItem(item.id); 
                await loadProgramDetail(selectedProgram.value.id); 
            } catch(e) { 
                _showToast(e.message, 'error'); 
            }
        }

        // ── Schedule Actions ────────────────────────────
        function openScheduleModal() {
            modalType.value = 'schedule';
            editingId.value = null;
            Object.assign(scheduleForm, { 
                cycle_id: selectedCycleId.value, 
                vaccine_name: '', 
                scheduled_date: new Date().toISOString().slice(0,10), 
                day_age_target: null, 
                method: '', 
                dosage: '', 
                remind_days: 1 
            });
            showModal.value = true;
        }

        async function saveSchedule() {
            try {
                await API.vaccines.schedules.create({ ...scheduleForm });
                _showToast('Đã thêm lịch tiêm');
                showModal.value = false;
                await loadSchedules();
            } catch(e) { 
                _showToast(e.message, 'error'); 
            }
        }

        async function applyProgram() {
            if (!selectedCycleId.value) { 
                _showToast('Chọn đợt nuôi trước', 'error'); 
                return; 
            }
            const pid = prompt('Nhập ID chương trình vaccine:');
            if (!pid) return;
            try {
                const r = await API.vaccines.schedules.applyProgram(selectedCycleId.value, parseInt(pid));
                _showToast('Đã áp dụng ' + r.created + ' lịch tiêm');
                await loadSchedules();
            } catch(e) { 
                _showToast(e.message, 'error'); 
            }
        }

        async function markDone(s) {
            try { 
                await API.vaccines.schedules.done(s.id); 
                _showToast('Đã đánh dấu hoàn thành'); 
                await loadSchedules(); 
                await loadUpcoming(); 
            } catch(e) { 
                _showToast(e.message, 'error'); 
            }
        }

        async function markSkip(s) {
            const reason = prompt('Lý do bỏ qua:');
            try { 
                await API.vaccines.schedules.skip(s.id, reason); 
                _showToast('Đã bỏ qua'); 
                await loadSchedules(); 
                await loadUpcoming(); 
            } catch(e) { 
                _showToast(e.message, 'error'); 
            }
        }

        async function deleteSchedule(s) {
            if (!confirm('Xóa lịch tiêm này?')) return;
            try { 
                await API.vaccines.schedules.del(s.id); 
                await loadSchedules(); 
            } catch(e) { 
                _showToast(e.message, 'error'); 
            }
        }

        // ── Lifecycle ─────────────────────────────────
        onMounted(() => { 
            loadPrograms(); 
            loadCycles(); 
            loadUpcoming(); 
        });

        // ── Return cho template ────────────────────────
        return { 
            tab, programs, selectedProgram, programItems, cycles, selectedCycleId, schedules, upcoming,
            showModal, modalType, editingId, programForm, itemForm, scheduleForm, methods,
            loading,
            openProgramModal, saveProgram, deleteProgram,
            loadProgramDetail, openItemModal, saveItem, deleteItem,
            openScheduleModal, saveSchedule, applyProgram, markDone, markSkip, deleteSchedule,
            // Truyền các helper vào template
            fmtDate: _fmtDate,
            fmtNum: _fmtNum
        };
    },

    template: `
    <div class="vaccines-page">
        <!-- Giữ nguyên template như trước, không thay đổi -->
        <div class="page-header">
            <div class="header-icon">💉</div>
            <div>
                <h2 class="page-title">Quản lý Vaccine</h2>
                <p class="page-subtitle">Chương trình và lịch tiêm cho đàn</p>
            </div>
        </div>

        <!-- Tabs -->
        <div class="tabs">
            <div @click="tab='programs'" :class="['tab', { active: tab === 'programs' }]">Chương trình</div>
            <div @click="tab='schedules'" :class="['tab', { active: tab === 'schedules' }]">Lịch tiêm</div>
            <div @click="tab='upcoming'" :class="['tab', { active: tab === 'upcoming' }]">Sắp tới ({{ upcoming.length }})</div>
        </div>

        <!-- Nội dung từng tab -->
        <div class="tab-content">
            <!-- Programs Tab -->
            <div v-if="tab === 'programs'" class="programs-layout">
                <div class="action-bar">
                    <button @click="openProgramModal()" class="btn btn-primary">+ Tạo chương trình</button>
                </div>
                <div class="two-columns">
                    <!-- Program List -->
                    <div class="card">
                        <h4 class="card-title">📋 Danh sách chương trình</h4>
                        <div class="program-list">
                            <div v-for="p in programs" :key="p.id"
                                 @click="loadProgramDetail(p.id)"
                                 :class="['program-item', { active: selectedProgram?.id === p.id }]">
                                <div class="program-info">
                                    <div class="program-name">{{ p.name }}</div>
                                    <div class="program-note">{{ p.note || 'Không có ghi chú' }}</div>
                                </div>
                                <div class="program-actions">
                                    <button @click.stop="openProgramModal(p)" class="btn-icon" title="Sửa">✏️</button>
                                    <button @click.stop="deleteProgram(p)" class="btn-icon danger" title="Xóa">🗑️</button>
                                </div>
                            </div>
                            <div v-if="!programs.length" class="empty-placeholder">Chưa có chương trình nào</div>
                        </div>
                    </div>

                    <!-- Program Detail -->
                    <div class="card">
                        <div v-if="selectedProgram">
                            <div class="detail-header">
                                <h4 class="card-title">💉 {{ selectedProgram.name }} - Chi tiết</h4>
                                <button @click="openItemModal()" class="btn btn-primary btn-sm">+ Thêm vaccine</button>
                            </div>
                            <div class="table-responsive">
                                <table class="data-table">
                                    <thead>
                                        <tr><th>Ngày tuổi</th><th>Vaccine</th><th>Cách dùng</th><th style="width:70px"></th></tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="item in programItems" :key="item.id">
                                            <td class="mono">{{ item.day_age }}</td>
                                            <td class="fw-500">{{ item.vaccine_name }}</td>
                                            <td>{{ item.method || '-' }}</td>
                                            <td class="actions">
                                                <button @click="openItemModal(item)" class="btn-icon" title="Sửa">✏️</button>
                                                <button @click="deleteItem(item)" class="btn-icon danger" title="Xóa">🗑️</button>
                                            </td>
                                        </tr>
                                        <tr v-if="!programItems.length"><td colspan="4" class="empty-table">Chưa có vaccine</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div v-else class="empty-detail">Chọn một chương trình để xem chi tiết</div>
                    </div>
                </div>
            </div>

            <!-- Schedules Tab -->
            <div v-if="tab === 'schedules'">
                <div class="action-bar">
                    <select v-model="selectedCycleId" class="select">
                        <option :value="null">-- Chọn đợt nuôi --</option>
                        <option v-for="c in cycles" :key="c.id" :value="c.id">{{ c.name || c.code }} ({{ c.barn_id }})</option>
                    </select>
                    <button v-if="selectedCycleId" @click="openScheduleModal()" class="btn btn-primary">+ Thêm lịch</button>
                    <button v-if="selectedCycleId" @click="applyProgram()" class="btn btn-secondary">Áp dụng CT</button>
                </div>
                <div class="card">
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead><tr><th>Ngày</th><th>Ngày tuổi</th><th>Vaccine</th><th>Cách dùng</th><th>Trạng thái</th><th style="width:160px"></th></tr></thead>
                            <tbody>
                                <tr v-for="s in schedules" :key="s.id" :class="{ rowDone: s.done, rowSkipped: s.skipped }">
                                    <td>{{ fmtDate(s.scheduled_date) }}</td>
                                    <td class="mono">{{ s.day_age_target || '-' }}</td>
                                    <td class="fw-500">{{ s.vaccine_name }}</td>
                                    <td>{{ s.method || '-' }}</td>
                                    <td>
                                        <span v-if="s.done" class="badge badge-success">Đã tiêm</span>
                                        <span v-else-if="s.skipped" class="badge badge-secondary">Bỏ qua</span>
                                        <span v-else class="badge badge-warning">Chưa tiêm</span>
                                    </td>
                                    <td class="actions">
                                        <template v-if="!s.done && !s.skipped">
                                            <button @click="markDone(s)" class="btn-link">Hoàn thành</button>
                                            <button @click="markSkip(s)" class="btn-link text-warning">Bỏ qua</button>
                                        </template>
                                        <button @click="deleteSchedule(s)" class="btn-icon danger" title="Xóa">🗑️</button>
                                    </td>
                                </tr>
                                <tr v-if="!schedules.length"><td colspan="6" class="empty-table">{{ selectedCycleId ? 'Chưa có lịch tiêm' : 'Chọn đợt nuôi' }}</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Upcoming Tab -->
            <div v-if="tab === 'upcoming'">
                <div class="card">
                    <h4 class="card-title">📅 Lịch tiêm sắp tới (14 ngày)</h4>
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead><tr><th>Ngày</th><th>Đợt nuôi</th><th>Chuồng</th><th>Vaccine</th><th>Cách dùng</th><th></th></tr></thead>
                            <tbody>
                                <tr v-for="s in upcoming" :key="s.id">
                                    <td>{{ fmtDate(s.scheduled_date) }}</td>
                                    <td>{{ s.cycle_code || s.cycle_id }}</td>
                                    <td>{{ s.barn_name || '-' }}</td>
                                    <td class="fw-500">{{ s.vaccine_name }}</td>
                                    <td>{{ s.method || '-' }}</td>
                                    <td class="actions"><button @click="markDone(s)" class="btn btn-primary btn-sm">Hoàn thành</button></td>
                                </tr>
                                <tr v-if="!upcoming.length"><td colspan="6" class="empty-table">Không có lịch tiêm sắp tới</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Modal -->
        <div v-if="showModal" class="modal-overlay" @click.self="showModal=false">
            <div class="modal">
                <div class="modal-header">
                    <h3>{{ modalType === 'program' ? (editingId ? '✏️ Sửa chương trình' : '➕ Tạo chương trình') : (modalType === 'item' ? (editingId ? '✏️ Sửa vaccine' : '➕ Thêm vaccine') : '➕ Thêm lịch tiêm') }}</h3>
                    <button @click="showModal=false" class="btn-icon">✕</button>
                </div>
                <div class="modal-body">
                    <!-- Program Form -->
                    <div v-if="modalType==='program'">
                        <div class="form-group"><label>Tên *</label><input v-model="programForm.name" class="form-input" placeholder="VD: Vaccine cho gà công nghiệp"></div>
                        <div class="form-group"><label>Ghi chú</label><input v-model="programForm.note" class="form-input"></div>
                    </div>
                    <!-- Item Form -->
                    <div v-if="modalType==='item'">
                        <div class="form-group"><label>Tên vaccine *</label><input v-model="itemForm.vaccine_name" class="form-input"></div>
                        <div class="form-row"><div class="form-group"><label>Ngày tuổi *</label><input v-model.number="itemForm.day_age" type="number" class="form-input"></div>
                        <div class="form-group"><label>Cách dùng</label><select v-model="itemForm.method" class="form-input"><option value="">-- Chọn --</option><option v-for="m in methods" :value="m">{{ m }}</option></select></div></div>
                        <div class="form-row"><div class="form-group"><label>Nhắc trước (ngày)</label><input v-model.number="itemForm.remind_days" type="number" class="form-input"></div>
                        <div class="form-group"><label>Thứ tự</label><input v-model.number="itemForm.sort_order" type="number" class="form-input"></div></div>
                    </div>
                    <!-- Schedule Form -->
                    <div v-if="modalType==='schedule'">
                        <div class="form-group"><label>Vaccine *</label><input v-model="scheduleForm.vaccine_name" class="form-input"></div>
                        <div class="form-row"><div class="form-group"><label>Ngày tiêm</label><input v-model="scheduleForm.scheduled_date" type="date" class="form-input"></div>
                        <div class="form-group"><label>Ngày tuổi</label><input v-model.number="scheduleForm.day_age_target" type="number" class="form-input"></div></div>
                        <div class="form-row"><div class="form-group"><label>Cách dùng</label><select v-model="scheduleForm.method" class="form-input"><option value="">-- Chọn --</option><option v-for="m in methods" :value="m">{{ m }}</option></select></div>
                        <div class="form-group"><label>Liều lượng</label><input v-model="scheduleForm.dosage" class="form-input"></div></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button @click="showModal=false" class="btn">Hủy</button>
                    <button @click="modalType==='program'?saveProgram():(modalType==='item'?saveItem():saveSchedule())" class="btn btn-primary">Lưu</button>
                </div>
            </div>
        </div>
    </div>
    `
};