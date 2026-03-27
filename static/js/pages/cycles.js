const { ref, onMounted } = Vue;

const component = {
    template: `
    <div>
        <div class="page-header">
            <h2 class="page-title">Đợt nuôi</h2>
            <button class="btn btn-primary" @click="openForm()">+ Tạo đợt mới</button>
        </div>

        <!-- Filter -->
        <div class="flex gap-3 mb-4 flex-wrap">
            <select v-model="filterBarn" class="border rounded px-3 py-1.5 text-sm" @change="load">
                <option value="">Tất cả chuồng</option>
                <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
            <div class="tabs">
                <div class="tab" :class="{active: filterStatus===''}" @click="filterStatus=''; load()">Tất cả</div>
                <div class="tab" :class="{active: filterStatus==='active'}" @click="filterStatus='active'; load()">Đang nuôi</div>
                <div class="tab" :class="{active: filterStatus==='closed'}" @click="filterStatus='closed'; load()">Đã kết thúc</div>
            </div>
        </div>

        <div v-if="cycles.length" class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Tên</th>
                        <th>Chuồng</th>
                        <th>Ngày bắt đầu</th>
                        <th>Số lượng</th>
                        <th>Trạng thái</th>
                        <th>Thao tác</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="c in filteredCycles" :key="c.id">
                        <td class="font-medium">{{ c.name }}</td>
                        <td>{{ barnName(c.barn_id) }}</td>
                        <td>{{ fmtDate(c.start_date) }}</td>
                        <td>{{ fmtNum(c.current_count) }} / {{ fmtNum(c.initial_count) }}</td>
                        <td>
                            <span :class="c.status==='active' ? 'badge badge-green' : 'badge badge-gray'">
                                {{ c.status === 'active' ? 'Đang nuôi' : 'Kết thúc' }}
                            </span>
                        </td>
                        <td class="flex gap-1">
                            <router-link :to="'/cycles/' + c.id" class="btn btn-primary btn-sm">Chi tiết</router-link>
                            <button v-if="c.status==='active'" class="btn btn-warning btn-sm" @click="closeCycle(c)">Kết thúc</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-else class="empty-state">
            <div class="icon">🔄</div>
            <p>Chưa có đợt nuôi</p>
        </div>

        <!-- Create Modal -->
        <div v-if="showModal" class="modal-overlay" @click.self="showModal=false">
            <div class="modal">
                <h3>Tạo đợt nuôi mới</h3>
                <div class="form-group">
                    <label>Tên đợt</label>
                    <input v-model="form.name" placeholder="VD: Đợt 1 - T3/2026">
                </div>
                <div class="form-group">
                    <label>Chuồng</label>
                    <select v-model="form.barn_id">
                        <option value="">-- Chọn chuồng --</option>
                        <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Giống</label>
                    <input v-model="form.breed" placeholder="VD: Gà Ri, Gà Lương Phượng...">
                </div>
                <div class="form-group">
                    <label>Số lượng ban đầu</label>
                    <input v-model.number="form.initial_count" type="number">
                </div>
                <div class="form-group">
                    <label>Ngày bắt đầu</label>
                    <input v-model="form.start_date" type="date">
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-secondary" @click="showModal=false">Huỷ</button>
                    <button class="btn btn-primary" @click="save">Tạo</button>
                </div>
            </div>
        </div>
    </div>`,

    setup() {
        const cycles = ref([]);
        const barns = ref([]);
        const filterBarn = ref('');
        const filterStatus = ref('');
        const showModal = ref(false);
        const form = ref({});

        function barnName(id) {
            const b = barns.value.find(x => x.id == id);
            return b ? b.name : id || '-';
        }

        const filteredCycles = Vue.computed(() => {
            return cycles.value.filter(c => {
                if (filterStatus.value && c.status !== filterStatus.value) return false;
                return true;
            });
        });

        async function load() {
            try {
                [barns.value, cycles.value] = await Promise.all([
                    API.barns.list().catch(() => []),
                    API.cycles.list(filterBarn.value || undefined).catch(() => []),
                ]);
            } catch(e) { showToast(e.message, 'error'); }
        }

        function openForm() {
            const today = new Date().toISOString().slice(0, 10);
            form.value = { name: '', barn_id: '', breed: '', initial_count: 0, start_date: today };
            showModal.value = true;
        }

        async function save() {
            try {
                await API.cycles.create(form.value);
                showToast('Đã tạo đợt nuôi mới');
                showModal.value = false;
                await load();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function closeCycle(c) {
            if (!confirm('Kết thúc đợt nuôi "' + c.name + '"?')) return;
            try {
                const today = new Date().toISOString().slice(0, 10);
                await API.cycles.close(c.id, { end_date: today });
                showToast('Đã kết thúc đợt nuôi');
                await load();
            } catch(e) { showToast(e.message, 'error'); }
        }

        onMounted(load);
        return { cycles, barns, filterBarn, filterStatus, filteredCycles, showModal, form, openForm, save, closeCycle, barnName, fmtDate, fmtNum };
    }
};

return component;
