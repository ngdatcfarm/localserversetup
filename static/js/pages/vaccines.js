/**
 * Vaccines Page - Vaccine Programs & Schedules (Quản lý vắc-xin)
 * - Semantic .cf-* CSS classes
 * - 3 tabs: Chương trình | Lịch tiêm | Sắp tới
 * - Modal forms for program, item, and schedule
 */
const { ref, reactive, onMounted, watch } = Vue;

export default{
    setup() {
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

        const programForm = reactive({ name: '', note: '', active: true });
        const itemForm = reactive({ vaccine_name: '', day_age: null, method: '', remind_days: 1, sort_order: 0 });
        const scheduleForm = reactive({ cycle_id: null, vaccine_name: '', scheduled_date: '', day_age_target: null, method: '', dosage: '', remind_days: 1 });

        const methods = ['chích dưới da', 'uống sủi', 'phun sương', 'nhỏ mắt', 'trộn thức ăn'];

        // ── API ─────────────────────────────────────────
        async function loadPrograms() {
            try { programs.value = await API.vaccines.programs.list(); }
            catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function loadProgramDetail(id) {
            try {
                const p = await API.vaccines.programs.get(id);
                selectedProgram.value = p;
                programItems.value = p.items || [];
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function loadCycles() {
            try { cycles.value = await API.cycles.list(); }
            catch (e) { cycles.value = []; }
        }

        async function loadSchedules() {
            if (!selectedCycleId.value) { schedules.value = []; return; }
            try { schedules.value = await API.vaccines.schedules.list(selectedCycleId.value); }
            catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function loadUpcoming() {
            try { upcoming.value = await API.vaccines.schedules.upcoming(14); }
            catch (e) { upcoming.value = []; }
        }

        watch(selectedCycleId, () => { loadSchedules(); });

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
                    if (typeof showToast === 'function') showToast('Đã cập nhật chương trình', 'success');
                } else {
                    await API.vaccines.programs.create({ ...programForm });
                    if (typeof showToast === 'function') showToast('Đã tạo chương trình mới', 'success');
                }
                closeModal();
                await loadPrograms();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function deleteProgram(p) {
            if (!confirm('Xóa chương trình "' + p.name + '"?')) return;
            try {
                await API.vaccines.programs.del(p.id);
                if (typeof showToast === 'function') showToast('Đã xóa chương trình', 'success');
                if (selectedProgram.value?.id === p.id) { selectedProgram.value = null; programItems.value = []; }
                await loadPrograms();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        // ── Item CRUD ───────────────────────────────────
        function openItemModal(item = null) {
            modalType.value = 'item';
            editingId.value = item ? item.id : null;
            if (item) {
                Object.assign(itemForm, { vaccine_name: item.vaccine_name, day_age: item.day_age, method: item.method || '', remind_days: item.remind_days || 1, sort_order: item.sort_order || 0 });
            } else {
                Object.assign(itemForm, { vaccine_name: '', day_age: null, method: '', remind_days: 1, sort_order: programItems.value.length + 1 });
            }
            showModal.value = true;
        }

        async function saveItem() {
            try {
                if (editingId.value) {
                    await API.vaccines.programs.updateItem(editingId.value, { ...itemForm });
                    if (typeof showToast === 'function') showToast('Đã cập nhật vaccine', 'success');
                } else {
                    await API.vaccines.programs.addItem(selectedProgram.value.id, { ...itemForm });
                    if (typeof showToast === 'function') showToast('Đã thêm vaccine', 'success');
                }
                closeModal();
                await loadProgramDetail(selectedProgram.value.id);
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function deleteItem(item) {
            if (!confirm('Xóa vaccine này khỏi chương trình?')) return;
            try {
                await API.vaccines.programs.delItem(item.id);
                if (typeof showToast === 'function') showToast('Đã gỡ vaccine', 'success');
                await loadProgramDetail(selectedProgram.value.id);
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        // ── Schedule Actions ────────────────────────────
        function openScheduleModal() {
            modalType.value = 'schedule';
            editingId.value = null;
            Object.assign(scheduleForm, {
                cycle_id: selectedCycleId.value,
                vaccine_name: '',
                scheduled_date: new Date().toISOString().slice(0, 10),
                day_age_target: null, method: '', dosage: '', remind_days: 1
            });
            showModal.value = true;
        }

        async function saveSchedule() {
            try {
                await API.vaccines.schedules.create({ ...scheduleForm });
                if (typeof showToast === 'function') showToast('Đã lập lịch tiêm', 'success');
                closeModal();
                await loadSchedules();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function applyProgram() {
            if (!selectedCycleId.value) { if (typeof showToast === 'function') showToast('Chọn đợt nuôi trước', 'error'); return; }
            const pid = prompt('Nhập ID chương trình vaccine muốn áp dụng:');
            if (!pid) return;
            try {
                const r = await API.vaccines.schedules.applyProgram(selectedCycleId.value, parseInt(pid));
                if (typeof showToast === 'function') showToast('Đã áp dụng ' + r.created + ' lịch tiêm', 'success');
                await loadSchedules();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function markDone(s) {
            try {
                await API.vaccines.schedules.done(s.id);
                if (typeof showToast === 'function') showToast('Đã đánh dấu hoàn thành', 'success');
                await loadSchedules();
                await loadUpcoming();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function markSkip(s) {
            const reason = prompt('Lý do bỏ qua:');
            try {
                await API.vaccines.schedules.skip(s.id, reason);
                if (typeof showToast === 'function') showToast('Đã bỏ qua mũi tiêm', 'success');
                await loadSchedules();
                await loadUpcoming();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function deleteSchedule(s) {
            if (!confirm('Xóa lịch tiêm này?')) return;
            try {
                await API.vaccines.schedules.del(s.id);
                if (typeof showToast === 'function') showToast('Đã xóa lịch tiêm', 'success');
                await loadSchedules();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        function closeModal() { showModal.value = false; }

        onMounted(() => { loadPrograms(); loadCycles(); loadUpcoming(); });

        return {
            tab, programs, selectedProgram, programItems, cycles, selectedCycleId,
            schedules, upcoming, showModal, modalType, editingId,
            programForm, itemForm, scheduleForm, methods,
            openProgramModal, closeModal, saveProgram, deleteProgram,
            loadProgramDetail, openItemModal, saveItem, deleteItem,
            openScheduleModal, saveSchedule, applyProgram, markDone, markSkip, deleteSchedule
        };
    },

    template: `
    <div class="cf-container">

        <!-- Header -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon" style="background-color: #7c3aed;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">Quản lý Vaccine</h1>
                    <p class="cf-subtitle">Chương trình & lịch tiêm cho đàn</p>
                </div>
            </div>
        </div>

        <!-- Tab Switcher -->
        <div class="cf-vacc-tabs">
            <button @click="tab = 'programs'" :class="['cf-vacc-tab-btn', tab === 'programs' ? 'active' : '']">
                📋 Chương trình
            </button>
            <button @click="tab = 'schedules'" :class="['cf-vacc-tab-btn', tab === 'schedules' ? 'active' : '']">
                📅 Lịch tiêm
            </button>
            <button @click="tab = 'upcoming'" :class="['cf-vacc-tab-btn', tab === 'upcoming' ? 'active' : '']">
                ⏰ Sắp tới ({{ upcoming.length }})
            </button>
        </div>

        <!-- ── TAB 1: PROGRAMS ── -->
        <div v-if="tab === 'programs'">
            <div class="cf-vacc-toolbar">
                <button @click="openProgramModal()" class="cf-btn-primary" style="background-color: #7c3aed;">
                    + Tạo chương trình mới
                </button>
            </div>

            <div class="cf-vacc-program-grid">
                <!-- Left: Program List -->
                <div class="cf-card" style="padding: 1rem;">
                    <h3 class="cf-vacc-section-title">📋 Danh sách chương trình mẫu</h3>
                    <div class="cf-vacc-program-list">
                        <div v-for="p in programs" :key="p.id"
                             @click="loadProgramDetail(p.id)"
                             :class="['cf-vacc-program-item', selectedProgram?.id === p.id ? 'selected' : '']">
                            <div>
                                <div class="cf-vacc-program-name">{{ p.name }}</div>
                                <div class="cf-vacc-program-note">{{ p.note || 'Không có ghi chú' }}</div>
                            </div>
                            <div class="cf-vacc-program-actions">
                                <button @click.stop="openProgramModal(p)" class="cf-btn-ghost-sm">✏️</button>
                                <button @click.stop="deleteProgram(p)" class="cf-btn-ghost-sm danger">🗑️</button>
                            </div>
                        </div>
                        <div v-if="!programs.length" class="cf-vacc-empty">Chưa có chương trình mẫu nào</div>
                    </div>
                </div>

                <!-- Right: Program Detail -->
                <div class="cf-card" style="padding: 1rem;">
                    <div v-if="selectedProgram">
                        <div class="cf-vacc-detail-header">
                            <h3 class="cf-vacc-section-title">💉 {{ selectedProgram.name }}</h3>
                            <button @click="openItemModal()" class="cf-btn-primary" style="background-color: #7c3aed; font-size: 11px; padding: 0.35rem 0.75rem;">
                                + Thêm vaccine
                            </button>
                        </div>
                        <div class="cf-table-wrapper" style="margin-top: 0.75rem;">
                            <table class="cf-table">
                                <thead>
                                    <tr>
                                        <th>Ngày tuổi</th>
                                        <th>Tên vaccine</th>
                                        <th>Phương thức</th>
                                        <th class="text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="item in programItems" :key="item.id" class="cf-table-tr">
                                        <td><span class="cf-vacc-day-badge">{{ item.day_age }} ngày</span></td>
                                        <td class="cf-primary-text">{{ item.vaccine_name }}</td>
                                        <td><span v-if="item.method" class="cf-vacc-method-badge">{{ item.method }}</span></td>
                                        <td>
                                            <div class="cf-feed-row-actions">
                                                <button @click="openItemModal(item)" class="cf-btn-ghost-sm">✏️</button>
                                                <button @click="deleteItem(item)" class="cf-btn-ghost-sm danger">🗑️</button>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr v-if="!programItems.length">
                                        <td colspan="4" class="cf-vacc-empty-cell">Chưa có vaccine nào trong chương trình</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div v-else class="cf-vacc-no-selection">
                        👈 Chọn một chương trình ở cột trái để xem chi tiết
                    </div>
                </div>
            </div>
        </div>

        <!-- ── TAB 2: SCHEDULES ── -->
        <div v-if="tab === 'schedules'">
            <div class="cf-vacc-schedule-toolbar">
                <select v-model="selectedCycleId" class="cf-input" style="max-width: 280px;">
                    <option :value="null">-- Chọn đợt nuôi --</option>
                    <option v-for="c in cycles" :key="c.id" :value="c.id">
                        {{ c.name || c.code }} ({{ c.barn_name || c.barn_id }})
                    </option>
                </select>
                <button v-if="selectedCycleId" @click="openScheduleModal()" class="cf-btn-primary" style="background-color: #7c3aed; font-size: 11px; padding: 0.4rem 0.8rem;">
                    + Thêm lịch lẻ
                </button>
                <button v-if="selectedCycleId" @click="applyProgram()" class="cf-btn-secondary" style="font-size: 11px; padding: 0.4rem 0.8rem;">
                    Áp dụng CT mẫu
                </button>
            </div>

            <div class="cf-card" style="padding: 0;">
                <div class="cf-table-wrapper">
                    <table class="cf-table">
                        <thead>
                            <tr>
                                <th>Ngày dự kiến</th>
                                <th>Độ tuổi</th>
                                <th>Tên vaccine</th>
                                <th>Phương thức</th>
                                <th>Trạng thái</th>
                                <th class="text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="s in schedules" :key="s.id" :class="['cf-table-tr', (s.done || s.skipped) ? 'cf-vacc-done-row' : '']">
                                <td><span class="cf-vacc-date">{{ fmtDate(s.scheduled_date) }}</span></td>
                                <td class="cf-text-mono">{{ s.day_age_target ? s.day_age_target + ' ngày' : '-' }}</td>
                                <td class="cf-primary-text">{{ s.vaccine_name }}</td>
                                <td><span v-if="s.method" class="cf-vacc-method-badge">{{ s.method }}</span></td>
                                <td>
                                    <span v-if="s.done" class="cf-badge-success">🟢 Đã hoàn thành</span>
                                    <span v-else-if="s.skipped" class="cf-badge-gray">⚪ Đã bỏ qua</span>
                                    <span v-else class="cf-badge-warning">🟡 Chờ thực hiện</span>
                                </td>
                                <td>
                                    <div class="cf-feed-row-actions">
                                        <template v-if="!s.done && !s.skipped">
                                            <button @click="markDone(s)" class="cf-btn-ghost-sm text-emerald">✔ Hoàn thành</button>
                                            <button @click="markSkip(s)" class="cf-btn-ghost-sm text-orange">⏭ Bỏ qua</button>
                                        </template>
                                        <button @click="deleteSchedule(s)" class="cf-btn-ghost-sm danger">🗑️</button>
                                    </div>
                                </td>
                            </tr>
                            <tr v-if="!schedules.length">
                                <td colspan="6" class="cf-vacc-empty-cell">
                                    {{ selectedCycleId ? 'Đợt nuôi này chưa có lịch tiêm' : 'Vui lòng chọn đợt nuôi để quản lý lịch tiêm' }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- ── TAB 3: UPCOMING ── -->
        <div v-if="tab === 'upcoming'">
            <div class="cf-card" style="padding: 1rem;">
                <h3 class="cf-vacc-section-title">📅 Lịch tiêm sắp tới (14 ngày tới)</h3>
                <div class="cf-table-wrapper" style="margin-top: 0.75rem;">
                    <table class="cf-table">
                        <thead>
                            <tr>
                                <th>Ngày dự kiến</th>
                                <th>Đợt nuôi</th>
                                <th>Chuồng</th>
                                <th>Tên vaccine</th>
                                <th>Phương thức</th>
                                <th class="text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="s in upcoming" :key="s.id" class="cf-table-tr">
                                <td><span class="cf-vacc-date">{{ fmtDate(s.scheduled_date) }}</span></td>
                                <td class="cf-text-mono">{{ s.cycle_code || s.cycle_id }}</td>
                                <td class="cf-text-muted">{{ s.barn_name || '-' }}</td>
                                <td class="cf-primary-text">{{ s.vaccine_name }}</td>
                                <td class="cf-text-muted">{{ s.method || '-' }}</td>
                                <td>
                                    <button @click="markDone(s)" class="cf-btn-primary" style="background-color: #7c3aed; font-size: 10px; padding: 0.3rem 0.6rem;">
                                        ✔ Hoàn thành
                                    </button>
                                </td>
                            </tr>
                            <tr v-if="!upcoming.length">
                                <td colspan="6" class="cf-vacc-empty-cell">
                                    Không có lịch tiêm nào trong 2 tuần tới!
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- ── MODAL: PROGRAM FORM ── -->
        <teleport to="body">
            <div v-if="showModal && modalType === 'program'" class="cf-modal-overlay" @click.self="closeModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #ede9fe; color: #7c3aed;">📋</div>
                            <h3 class="cf-modal-title">{{ editingId ? 'Sửa chương trình vaccine' : 'Tạo chương trình mới' }}</h3>
                        </div>
                        <button @click="closeModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="saveProgram">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Tên chương trình <span class="req">*</span></label>
                                <input v-model="programForm.name" type="text" class="cf-input" placeholder="VD: Lịch chuẩn cho heo con cai sữa" required>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Ghi chú</label>
                                <input v-model="programForm.note" type="text" class="cf-input" placeholder="Nhập ghi chú...">
                            </div>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeModal" class="cf-btn-secondary">Hủy bỏ</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #7c3aed;">Lưu chương trình</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

        <!-- ── MODAL: ITEM FORM ── -->
        <teleport to="body">
            <div v-if="showModal && modalType === 'item'" class="cf-modal-overlay" @click.self="closeModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #dcfce7; color: #16a34a;">💉</div>
                            <h3 class="cf-modal-title">{{ editingId ? 'Sửa vaccine' : 'Thêm vaccine vào chương trình' }}</h3>
                        </div>
                        <button @click="closeModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="saveItem">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Tên vaccine <span class="req">*</span></label>
                                <input v-model="itemForm.vaccine_name" type="text" class="cf-input" placeholder="VD: Tai xanh (PRRS)" required>
                            </div>
                            <div class="cf-col-grid-2">
                                <div class="cf-form-group">
                                    <label class="cf-label">Ngày tuổi tiêm <span class="req">*</span></label>
                                    <input v-model.number="itemForm.day_age" type="number" class="cf-input" placeholder="14" required>
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Cách dùng</label>
                                    <select v-model="itemForm.method" class="cf-input">
                                        <option value="">-- Chọn --</option>
                                        <option v-for="m in methods" :key="m" :value="m">{{ m }}</option>
                                    </select>
                                </div>
                            </div>
                            <div class="cf-col-grid-2">
                                <div class="cf-form-group">
                                    <label class="cf-label">Nhắc trước (ngày)</label>
                                    <input v-model.number="itemForm.remind_days" type="number" class="cf-input" placeholder="1">
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Thứ tự</label>
                                    <input v-model.number="itemForm.sort_order" type="number" class="cf-input" placeholder="0">
                                </div>
                            </div>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeModal" class="cf-btn-secondary">Hủy bỏ</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #7c3aed;">Lưu vaccine</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

        <!-- ── MODAL: SCHEDULE FORM ── -->
        <teleport to="body">
            <div v-if="showModal && modalType === 'schedule'" class="cf-modal-overlay" @click.self="closeModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #fef9c3; color: #d97706;">📅</div>
                            <h3 class="cf-modal-title">Lập lịch tiêm chủng lẻ</h3>
                        </div>
                        <button @click="closeModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="saveSchedule">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Tên vaccine <span class="req">*</span></label>
                                <input v-model="scheduleForm.vaccine_name" type="text" class="cf-input" placeholder="VD: Lở mồm long móng" required>
                            </div>
                            <div class="cf-col-grid-2">
                                <div class="cf-form-group">
                                    <label class="cf-label">Ngày tiêm</label>
                                    <input v-model="scheduleForm.scheduled_date" type="date" class="cf-input">
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Độ tuổi ước tính (ngày)</label>
                                    <input v-model.number="scheduleForm.day_age_target" type="number" class="cf-input" placeholder="14">
                                </div>
                            </div>
                            <div class="cf-col-grid-2">
                                <div class="cf-form-group">
                                    <label class="cf-label">Phương thức</label>
                                    <select v-model="scheduleForm.method" class="cf-input">
                                        <option value="">-- Chọn --</option>
                                        <option v-for="m in methods" :key="m" :value="m">{{ m }}</option>
                                    </select>
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Liều lượng</label>
                                    <input v-model="scheduleForm.dosage" type="text" class="cf-input" placeholder="VD: 2 ml">
                                </div>
                            </div>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeModal" class="cf-btn-secondary">Hủy bỏ</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #7c3aed;">Lập lịch ngay</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

    </div>
    `
};