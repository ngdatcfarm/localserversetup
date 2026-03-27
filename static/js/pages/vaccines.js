/**
 * Vaccines Page - Vaccine Programs & Schedules
 */
const { ref, reactive, onMounted, computed, watch } = Vue;

return {
    setup() {
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

        const methods = ['drink', 'inject', 'spray', 'eye_drop', 'feed'];

        async function loadPrograms() {
            try { programs.value = await API.vaccines.programs.list(); } catch(e) { showToast(e.message, 'error'); }
        }

        async function loadProgramDetail(id) {
            try {
                const p = await API.vaccines.programs.get(id);
                selectedProgram.value = p;
                programItems.value = p.items || [];
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function loadCycles() {
            try { cycles.value = await API.cycles.list(); } catch(e) {}
        }

        async function loadSchedules() {
            if (!selectedCycleId.value) { schedules.value = []; return; }
            try { schedules.value = await API.vaccines.schedules.list(selectedCycleId.value); }
            catch(e) { showToast(e.message, 'error'); }
        }

        async function loadUpcoming() {
            try { upcoming.value = await API.vaccines.schedules.upcoming(14); } catch(e) {}
        }

        watch(selectedCycleId, loadSchedules);

        // Program CRUD
        function openProgramModal(p = null) {
            modalType.value = 'program';
            editingId.value = p ? p.id : null;
            if (p) { Object.assign(programForm, { name: p.name, note: p.note || '', active: p.active }); }
            else { Object.assign(programForm, { name: '', note: '', active: true }); }
            showModal.value = true;
        }

        async function saveProgram() {
            try {
                if (editingId.value) {
                    await API.vaccines.programs.update(editingId.value, { ...programForm });
                    showToast('Da cap nhat chuong trinh');
                } else {
                    await API.vaccines.programs.create({ ...programForm });
                    showToast('Da tao chuong trinh');
                }
                showModal.value = false;
                await loadPrograms();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function deleteProgram(p) {
            if (!confirm('Xoa chuong trinh "' + p.name + '"?')) return;
            try { await API.vaccines.programs.del(p.id); showToast('Da xoa'); selectedProgram.value = null; await loadPrograms(); }
            catch(e) { showToast(e.message, 'error'); }
        }

        // Program Item CRUD
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
                    showToast('Da cap nhat');
                } else {
                    await API.vaccines.programs.addItem(selectedProgram.value.id, { ...itemForm });
                    showToast('Da them vaccine');
                }
                showModal.value = false;
                await loadProgramDetail(selectedProgram.value.id);
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function deleteItem(item) {
            if (!confirm('Xoa?')) return;
            try { await API.vaccines.programs.delItem(item.id); await loadProgramDetail(selectedProgram.value.id); }
            catch(e) { showToast(e.message, 'error'); }
        }

        // Schedule CRUD
        function openScheduleModal() {
            modalType.value = 'schedule';
            editingId.value = null;
            Object.assign(scheduleForm, { cycle_id: selectedCycleId.value, vaccine_name: '', scheduled_date: new Date().toISOString().slice(0,10), day_age_target: null, method: '', dosage: '', remind_days: 1 });
            showModal.value = true;
        }

        async function saveSchedule() {
            try {
                await API.vaccines.schedules.create({ ...scheduleForm });
                showToast('Da them lich tiem');
                showModal.value = false;
                await loadSchedules();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function applyProgram() {
            if (!selectedCycleId.value) { showToast('Chon dot nuoi truoc', 'error'); return; }
            const pid = prompt('Nhap ID chuong trinh vaccine:');
            if (!pid) return;
            try {
                const r = await API.vaccines.schedules.applyProgram(selectedCycleId.value, parseInt(pid));
                showToast('Da ap dung ' + r.created + ' lich tiem');
                await loadSchedules();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function markDone(s) {
            try { await API.vaccines.schedules.done(s.id); showToast('Da danh dau hoan thanh'); await loadSchedules(); await loadUpcoming(); }
            catch(e) { showToast(e.message, 'error'); }
        }

        async function markSkip(s) {
            const reason = prompt('Ly do bo qua:');
            try { await API.vaccines.schedules.skip(s.id, reason); showToast('Da bo qua'); await loadSchedules(); await loadUpcoming(); }
            catch(e) { showToast(e.message, 'error'); }
        }

        async function deleteSchedule(s) {
            if (!confirm('Xoa lich tiem nay?')) return;
            try { await API.vaccines.schedules.del(s.id); await loadSchedules(); }
            catch(e) { showToast(e.message, 'error'); }
        }

        onMounted(() => { loadPrograms(); loadCycles(); loadUpcoming(); });

        return { tab, programs, selectedProgram, programItems, cycles, selectedCycleId, schedules, upcoming,
                 showModal, modalType, editingId, programForm, itemForm, scheduleForm, methods,
                 openProgramModal, saveProgram, deleteProgram,
                 loadProgramDetail, openItemModal, saveItem, deleteItem,
                 openScheduleModal, saveSchedule, applyProgram, markDone, markSkip, deleteSchedule, fmtDate };
    },

    template: `
    <div>
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">Quan ly Vaccine</h2>
        </div>

        <!-- Tabs -->
        <div class="flex gap-2 mb-4">
            <button @click="tab='programs'" :class="tab==='programs' ? 'bg-green-600 text-white' : 'bg-gray-200'" class="px-4 py-2 rounded-lg font-medium">Chuong trinh</button>
            <button @click="tab='schedules'" :class="tab==='schedules' ? 'bg-green-600 text-white' : 'bg-gray-200'" class="px-4 py-2 rounded-lg font-medium">Lich tiem</button>
            <button @click="tab='upcoming'" :class="tab==='upcoming' ? 'bg-green-600 text-white' : 'bg-gray-200'" class="px-4 py-2 rounded-lg font-medium">Sap toi ({{ upcoming.length }})</button>
        </div>

        <!-- Programs Tab -->
        <div v-if="tab==='programs'">
            <div class="flex justify-end mb-3">
                <button @click="openProgramModal()" class="btn-primary">+ Tao chuong trinh</button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Program List -->
                <div class="card">
                    <h4 class="font-bold mb-3">Danh sach chuong trinh</h4>
                    <div v-for="p in programs" :key="p.id"
                         @click="loadProgramDetail(p.id)"
                         :class="selectedProgram?.id === p.id ? 'bg-green-50 border-green-500' : 'border-gray-200'"
                         class="p-3 border rounded-lg mb-2 cursor-pointer hover:bg-green-50">
                        <div class="flex justify-between items-center">
                            <div>
                                <div class="font-medium">{{ p.name }}</div>
                                <div class="text-xs text-gray-500">{{ p.note || '' }}</div>
                            </div>
                            <div class="flex gap-2">
                                <button @click.stop="openProgramModal(p)" class="text-blue-600 text-sm">Sua</button>
                                <button @click.stop="deleteProgram(p)" class="text-red-600 text-sm">Xoa</button>
                            </div>
                        </div>
                    </div>
                    <div v-if="!programs.length" class="text-gray-400 text-center py-4">Chua co chuong trinh</div>
                </div>

                <!-- Program Detail -->
                <div class="card">
                    <div v-if="selectedProgram">
                        <div class="flex justify-between items-center mb-3">
                            <h4 class="font-bold">{{ selectedProgram.name }} - Chi tiet</h4>
                            <button @click="openItemModal()" class="btn-primary text-sm">+ Them vaccine</button>
                        </div>
                        <table class="w-full text-sm">
                            <thead><tr class="text-left border-b">
                                <th class="pb-2">Ngay tuoi</th><th class="pb-2">Vaccine</th><th class="pb-2">Cach dung</th><th class="pb-2"></th>
                            </tr></thead>
                            <tbody>
                                <tr v-for="item in programItems" :key="item.id" class="border-b">
                                    <td class="py-2 font-mono">{{ item.day_age }}</td>
                                    <td class="font-medium">{{ item.vaccine_name }}</td>
                                    <td>{{ item.method || '-' }}</td>
                                    <td class="text-right">
                                        <button @click="openItemModal(item)" class="text-blue-600 mr-2">Sua</button>
                                        <button @click="deleteItem(item)" class="text-red-600">Xoa</button>
                                    </td>
                                </tr>
                                <tr v-if="!programItems.length"><td colspan="4" class="py-3 text-center text-gray-400">Chua co vaccine</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div v-else class="text-gray-400 text-center py-8">Chon 1 chuong trinh de xem chi tiet</div>
                </div>
            </div>
        </div>

        <!-- Schedules Tab -->
        <div v-if="tab==='schedules'">
            <div class="flex gap-3 mb-3 items-center">
                <select v-model="selectedCycleId" class="form-input w-auto">
                    <option :value="null">-- Chon dot nuoi --</option>
                    <option v-for="c in cycles" :value="c.id">{{ c.name || c.code }} ({{ c.barn_id }})</option>
                </select>
                <button v-if="selectedCycleId" @click="openScheduleModal()" class="btn-primary">+ Them lich</button>
                <button v-if="selectedCycleId" @click="applyProgram()" class="btn-secondary">Ap dung CT</button>
            </div>
            <div class="card">
                <table class="w-full text-sm">
                    <thead><tr class="text-left border-b">
                        <th class="pb-2">Ngay</th><th class="pb-2">Ngay tuoi</th><th class="pb-2">Vaccine</th>
                        <th class="pb-2">Cach dung</th><th class="pb-2">Trang thai</th><th class="pb-2"></th>
                    </tr></thead>
                    <tbody>
                        <tr v-for="s in schedules" :key="s.id" class="border-b" :class="s.done ? 'bg-green-50' : s.skipped ? 'bg-gray-50' : ''">
                            <td class="py-2">{{ fmtDate(s.scheduled_date) }}</td>
                            <td class="font-mono">{{ s.day_age_target || '-' }}</td>
                            <td class="font-medium">{{ s.vaccine_name }}</td>
                            <td>{{ s.method || '-' }}</td>
                            <td>
                                <span v-if="s.done" class="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Da tiem</span>
                                <span v-else-if="s.skipped" class="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">Bo qua</span>
                                <span v-else class="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">Chua tiem</span>
                            </td>
                            <td class="text-right">
                                <template v-if="!s.done && !s.skipped">
                                    <button @click="markDone(s)" class="text-green-600 mr-1 text-xs">Hoan thanh</button>
                                    <button @click="markSkip(s)" class="text-gray-500 mr-1 text-xs">Bo qua</button>
                                </template>
                                <button @click="deleteSchedule(s)" class="text-red-600 text-xs">Xoa</button>
                            </td>
                        </tr>
                        <tr v-if="!schedules.length"><td colspan="6" class="py-4 text-center text-gray-400">{{ selectedCycleId ? 'Chua co lich tiem' : 'Chon dot nuoi' }}</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Upcoming Tab -->
        <div v-if="tab==='upcoming'">
            <div class="card">
                <h4 class="font-bold mb-3">Lich tiem sap toi (14 ngay)</h4>
                <table class="w-full text-sm">
                    <thead><tr class="text-left border-b">
                        <th class="pb-2">Ngay</th><th class="pb-2">Dot nuoi</th><th class="pb-2">Chuong</th>
                        <th class="pb-2">Vaccine</th><th class="pb-2">Cach dung</th><th class="pb-2"></th>
                    </tr></thead>
                    <tbody>
                        <tr v-for="s in upcoming" :key="s.id" class="border-b">
                            <td class="py-2">{{ fmtDate(s.scheduled_date) }}</td>
                            <td>{{ s.cycle_code || s.cycle_id }}</td>
                            <td>{{ s.barn_name || '-' }}</td>
                            <td class="font-medium">{{ s.vaccine_name }}</td>
                            <td>{{ s.method || '-' }}</td>
                            <td class="text-right">
                                <button @click="markDone(s)" class="text-green-600 text-xs">Hoan thanh</button>
                            </td>
                        </tr>
                        <tr v-if="!upcoming.length"><td colspan="6" class="py-4 text-center text-gray-400">Khong co lich tiem sap toi</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Modal -->
        <div v-if="showModal" class="modal-backdrop" @click.self="showModal=false">
            <div class="modal-content">
                <!-- Program Form -->
                <div v-if="modalType==='program'">
                    <h3 class="text-lg font-bold mb-4">{{ editingId ? 'Sua chuong trinh' : 'Tao chuong trinh vaccine' }}</h3>
                    <div class="space-y-3">
                        <div><label class="form-label">Ten *</label>
                            <input v-model="programForm.name" class="form-input" placeholder="VD: Vaccine cho ga choi"></div>
                        <div><label class="form-label">Ghi chu</label>
                            <input v-model="programForm.note" class="form-input"></div>
                        <div class="flex gap-3 pt-2">
                            <button @click="saveProgram" class="btn-primary flex-1">Luu</button>
                            <button @click="showModal=false" class="btn-secondary flex-1">Huy</button>
                        </div>
                    </div>
                </div>
                <!-- Item Form -->
                <div v-if="modalType==='item'">
                    <h3 class="text-lg font-bold mb-4">{{ editingId ? 'Sua vaccine' : 'Them vaccine vao CT' }}</h3>
                    <div class="space-y-3">
                        <div><label class="form-label">Ten vaccine *</label>
                            <input v-model="itemForm.vaccine_name" class="form-input" placeholder="VD: Vaccine cau trung"></div>
                        <div class="grid grid-cols-2 gap-3">
                            <div><label class="form-label">Ngay tuoi *</label>
                                <input v-model.number="itemForm.day_age" type="number" class="form-input" placeholder="10"></div>
                            <div><label class="form-label">Cach dung</label>
                                <select v-model="itemForm.method" class="form-input">
                                    <option value="">-- Chon --</option>
                                    <option v-for="m in methods" :value="m">{{ m }}</option>
                                </select></div>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div><label class="form-label">Nhac truoc (ngay)</label>
                                <input v-model.number="itemForm.remind_days" type="number" class="form-input"></div>
                            <div><label class="form-label">Thu tu</label>
                                <input v-model.number="itemForm.sort_order" type="number" class="form-input"></div>
                        </div>
                        <div class="flex gap-3 pt-2">
                            <button @click="saveItem" class="btn-primary flex-1">Luu</button>
                            <button @click="showModal=false" class="btn-secondary flex-1">Huy</button>
                        </div>
                    </div>
                </div>
                <!-- Schedule Form -->
                <div v-if="modalType==='schedule'">
                    <h3 class="text-lg font-bold mb-4">Them lich tiem</h3>
                    <div class="space-y-3">
                        <div><label class="form-label">Vaccine *</label>
                            <input v-model="scheduleForm.vaccine_name" class="form-input"></div>
                        <div class="grid grid-cols-2 gap-3">
                            <div><label class="form-label">Ngay tiem</label>
                                <input v-model="scheduleForm.scheduled_date" type="date" class="form-input"></div>
                            <div><label class="form-label">Ngay tuoi</label>
                                <input v-model.number="scheduleForm.day_age_target" type="number" class="form-input"></div>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div><label class="form-label">Cach dung</label>
                                <select v-model="scheduleForm.method" class="form-input">
                                    <option value="">-- Chon --</option>
                                    <option v-for="m in methods" :value="m">{{ m }}</option>
                                </select></div>
                            <div><label class="form-label">Lieu luong</label>
                                <input v-model="scheduleForm.dosage" class="form-input"></div>
                        </div>
                        <div class="flex gap-3 pt-2">
                            <button @click="saveSchedule" class="btn-primary flex-1">Luu</button>
                            <button @click="showModal=false" class="btn-secondary flex-1">Huy</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`
};
