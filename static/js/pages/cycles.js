/**
 * Cycles Page - Đợt nuôi management
 * Desktop: Table view with stats
 * Mobile: Card view with stats
 */
const { ref, reactive, computed, onMounted } = Vue;

return {
    setup() {
        // ── State ──────────────────────────────────────
        const cycles = ref([]);
        const barns = ref([]);
        const farms = ref([]);
        const filterBarn = ref('');
        const filterStatus = ref(''); // '', 'active', 'closed'
        const searchQuery = ref('');
        const showModal = ref(false);
        const showCloseModal = ref(false);
        const cycleToClose = ref(null);
        const loading = ref(false);

        const form = reactive({
            barn_id: '',
            name: '',
            breed: '',
            initial_count: null,
            start_date: new Date().toISOString().slice(0, 10)
        });

        const closeForm = reactive({
            end_date: new Date().toISOString().slice(0, 10),
            notes: '',
            force: false
        });

        // ── Computed ───────────────────────────────────
        const filteredCycles = computed(() => {
            let result = cycles.value;
            if (filterBarn.value) {
                result = result.filter(c => c.barn_id == filterBarn.value);
            }
            if (filterStatus.value) {
                result = result.filter(c => c.status === filterStatus.value);
            }
            if (searchQuery.value) {
                const q = searchQuery.value.toLowerCase();
                result = result.filter(c => c.name?.toLowerCase().includes(q));
            }
            return result;
        });

        const availableBarns = computed(() => {
            return barns.value.filter(b => !hasActiveCycle(b.id) || b.id == form.barn_id);
        });

        // ── Methods ───────────────────────────────────
        async function loadCycles() {
            loading.value = true;
            try {
                cycles.value = await API.cycles.list();
            } catch (e) {
                showToast('Không thể tải danh sách đợt nuôi: ' + e.message, 'error');
            }
            loading.value = false;
        }

        async function loadBarnsAndFarms() {
            try {
                [barns.value, farms.value] = await Promise.all([
                    API.barns.list().catch(() => []),
                    API.farms.list().catch(() => [])
                ]);
            } catch (e) {
                console.error('Failed to load barns/farms:', e);
            }
        }

        function getBarnName(barnId) {
            const b = barns.value.find(x => x.id == barnId);
            return b?.name || barnId || '-';
        }

        function getFarmName(barnId) {
            const b = barns.value.find(x => x.id == barnId);
            return b?.farm_name || '-';
        }

        function hasActiveCycle(barnId) {
            return cycles.value.some(c =>
                (c.barn_id == barnId || c.barn_id === barnId) && c.status === 'active'
            );
        }

        function getDayAge(startDate) {
            if (!startDate) return '-';
            const days = Math.floor((new Date() - new Date(startDate)) / (1000 * 60 * 60 * 24));
            return days >= 0 ? days : '-';
        }

        function getMortalityRate(c) {
            if (!c.initial_count || c.initial_count === 0) return '-';
            const dead = (c.initial_count - (c.current_count || 0));
            const rate = (dead / c.initial_count * 100).toFixed(1);
            return rate + '%';
        }

        function setFilterStatus(status) {
            filterStatus.value = status;
        }

        function openForm() {
            form.barn_id = barns.value.length > 0 ? barns.value[0].id : '';
            form.name = '';
            form.breed = '';
            form.initial_count = null;
            form.start_date = new Date().toISOString().slice(0, 10);
            showModal.value = true;
        }

        function closeModal() {
            showModal.value = false;
        }

        async function save() {
            // Validation
            if (!form.barn_id) {
                showToast('Vui lòng chọn chuồng', 'error');
                return;
            }
            if (!form.initial_count || form.initial_count <= 0) {
                showToast('Số lượng ban đầu phải lớn hơn 0', 'error');
                return;
            }
            if (!form.start_date) {
                showToast('Ngày bắt đầu là bắt buộc', 'error');
                return;
            }

            try {
                const payload = {
                    barn_id: form.barn_id,
                    name: form.name?.trim() || undefined,
                    breed: form.breed?.trim() || undefined,
                    initial_count: form.initial_count,
                    start_date: form.start_date
                };

                await API.cycles.create(payload);
                showToast('Đã tạo đợt nuôi mới');
                closeModal();
                await Promise.all([loadCycles(), loadBarnsAndFarms()]);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        function openCloseModal(cycle) {
            cycleToClose.value = cycle;
            closeForm.end_date = new Date().toISOString().slice(0, 10);
            closeForm.notes = '';
            closeForm.force = false;
            showCloseModal.value = true;
        }

        function closeCloseModal() {
            showCloseModal.value = false;
            cycleToClose.value = null;
        }

        async function confirmClose() {
            if (!cycleToClose.value) return;
            if (closeForm.end_date < cycleToClose.value.start_date) {
                showToast('Ngày kết thúc phải >= ngày bắt đầu', 'error');
                return;
            }

            try {
                await API.cycles.close(cycleToClose.value.id, {
                    end_date: closeForm.end_date,
                    notes: closeForm.notes || undefined,
                    force: closeForm.force
                });
                showToast('Đã kết thúc đợt nuôi');
                closeCloseModal();
                await Promise.all([loadCycles(), loadBarnsAndFarms()]);
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        // ── Lifecycle ─────────────────────────────────
        onMounted(async () => {
            await Promise.all([loadCycles(), loadBarnsAndFarms()]);
        });

        // ── Template ──────────────────────────────────
        return {
            cycles,
            barns,
            farms,
            filterBarn,
            filterStatus,
            searchQuery,
            filteredCycles,
            availableBarns,
            showModal,
            showCloseModal,
            form,
            closeForm,
            cycleToClose,
            loading,
            openForm,
            closeModal,
            save,
            openCloseModal,
            closeCloseModal,
            confirmClose,
            getBarnName,
            getFarmName,
            hasActiveCycle,
            getDayAge,
            getMortalityRate,
            setFilterStatus,
            fmtDate,
            fmtNum
        };
    },

    template: `
    <div class="cycles-page">
        <!-- Header -->
        <div class="page-header">
            <h2 class="page-title flex items-center gap-2">
                <span>🔄</span> Đợt nuôi
            </h2>
            <button @click="openForm" class="btn btn-primary">
                + Tạo đợt mới
            </button>
        </div>

        <!-- Filter Bar -->
        <div class="flex flex-wrap items-center gap-3 mb-4">
            <!-- Barn Filter -->
            <select v-model="filterBarn" class="form-input max-w-48" style="height: 2.5rem;">
                <option value="">Tất cả chuồng</option>
                <option v-for="b in barns" :key="b.id" :value="b.id">
                    {{ b.name }}
                </option>
            </select>

            <!-- Search -->
            <div class="relative flex-1 max-w-xs">
                <input v-model="searchQuery" type="text"
                    placeholder="Tìm kiếm đợt nuôi..."
                    class="form-input pl-9" style="height: 2.5rem;">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            </div>

            <!-- Results count -->
            <div class="text-sm text-gray-500 ml-auto">
                {{ filteredCycles.length }} đợt nuôi
            </div>
        </div>

        <!-- Status Tabs -->
        <div class="tabs mb-4">
            <div class="tab" :class="{active: filterStatus===''}" @click="setFilterStatus('')">
                Tất cả
            </div>
            <div class="tab" :class="{active: filterStatus==='active'}" @click="setFilterStatus('active')">
                🔄 Đang nuôi
            </div>
            <div class="tab" :class="{active: filterStatus==='closed'}" @click="setFilterStatus('closed')">
                ✅ Đã kết thúc
            </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="text-center py-12 text-gray-400">
            <div class="text-3xl mb-2 animate-spin">⏳</div>
            <p>Đang tải...</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="cycles.length === 0" class="card text-center py-16">
            <div class="text-6xl mb-4">🔄</div>
            <h3 class="text-xl font-bold text-gray-900 mb-2">Chưa có đợt nuôi nào</h3>
            <p class="text-gray-500 mb-6">Bắt đầu bằng cách tạo đợt nuôi đầu tiên</p>
            <button @click="openForm" class="btn btn-primary">
                + Tạo đợt nuôi đầu tiên
            </button>
        </div>

        <!-- Empty Filtered -->
        <div v-else-if="filteredCycles.length === 0" class="card text-center py-12">
            <div class="text-4xl mb-2">🔍</div>
            <p class="text-gray-500">Không có đợt nuôi nào phù hợp</p>
        </div>

        <!-- Cycles Table (Desktop) / Cards (Mobile) -->
        <div v-else class="grid gap-4">
            <!-- Desktop Table -->
            <div class="hidden lg:block">
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Đợt nuôi</th>
                                <th>Chuồng / Farm</th>
                                <th>Giống</th>
                                <th>Ngày bắt đầu</th>
                                <th>Số lượng</th>
                                <th>Ngày tuổi</th>
                                <th>Tỷ lệ tử vong</th>
                                <th>Trạng thái</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="c in filteredCycles" :key="c.id">
                                <td>
                                    <div class="font-medium text-gray-900">{{ c.name || 'Đợt ' + c.id }}</div>
                                    <div class="text-xs text-gray-400 font-mono">{{ c.code }}</div>
                                </td>
                                <td>
                                    <div class="font-medium">{{ getBarnName(c.barn_id) }}</div>
                                    <div class="text-xs text-gray-400">{{ getFarmName(c.barn_id) }}</div>
                                </td>
                                <td>{{ c.breed || '-' }}</td>
                                <td>{{ fmtDate(c.start_date) }}</td>
                                <td>
                                    <span class="font-medium">{{ fmtNum(c.current_count || c.initial_count) }}</span>
                                    <span class="text-gray-400">/ {{ fmtNum(c.initial_count) }}</span>
                                </td>
                                <td>
                                    <span v-if="c.status === 'active'" class="badge badge-blue">
                                        Day {{ getDayAge(c.start_date) }}
                                    </span>
                                    <span v-else class="text-gray-500">
                                        {{ getDayAge(c.start_date) }} days
                                    </span>
                                </td>
                                <td>
                                    <span :class="{
                                        'text-red-500 font-medium': parseFloat(getMortalityRate(c)) > 5,
                                        'text-gray-500': parseFloat(getMortalityRate(c)) <= 5 || getMortalityRate(c) === '-'
                                    }">
                                        {{ getMortalityRate(c) }}
                                    </span>
                                </td>
                                <td>
                                    <span v-if="c.status === 'active'" class="badge badge-green">Đang nuôi</span>
                                    <span v-else class="badge badge-gray">Kết thúc</span>
                                </td>
                                <td>
                                    <div class="flex gap-1">
                                        <router-link :to="'/cycles/' + c.id"
                                            class="btn btn-primary btn-sm">
                                            Chi tiết
                                        </router-link>
                                        <button v-if="c.status === 'active'"
                                            @click="openCloseModal(c)"
                                            class="btn btn-warning btn-sm">
                                            Kết thúc
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Mobile Cards -->
            <div class="lg:hidden space-y-3">
                <div v-for="c in filteredCycles" :key="c.id"
                    class="card">
                    <!-- Card Header -->
                    <div class="flex items-start justify-between mb-3">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                                :class="c.status === 'active' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'">
                                🔄
                            </div>
                            <div>
                                <div class="font-semibold text-gray-900">{{ c.name || 'Đợt ' + c.id }}</div>
                                <div class="text-xs text-gray-400">{{ getBarnName(c.barn_id) }} • {{ getFarmName(c.barn_id) }}</div>
                            </div>
                        </div>
                        <span v-if="c.status === 'active'" class="badge badge-green">Active</span>
                        <span v-else class="badge badge-gray">Closed</span>
                    </div>

                    <!-- Card Stats -->
                    <div class="grid grid-cols-3 gap-2 mb-3 text-sm">
                        <div class="text-center p-2 bg-gray-50 rounded">
                            <div class="text-lg font-bold text-gray-900">
                                {{ fmtNum(c.current_count || c.initial_count) }}
                            </div>
                            <div class="text-xs text-gray-400">con</div>
                        </div>
                        <div class="text-center p-2 bg-gray-50 rounded">
                            <div class="text-lg font-bold text-gray-900">
                                {{ c.status === 'active' ? 'Day ' + getDayAge(c.start_date) : getDayAge(c.start_date) + 'd' }}
                            </div>
                            <div class="text-xs text-gray-400">tuổi</div>
                        </div>
                        <div class="text-center p-2 bg-gray-50 rounded">
                            <div class="text-lg font-bold"
                                :class="parseFloat(getMortalityRate(c)) > 5 ? 'text-red-500' : 'text-gray-900'">
                                {{ getMortalityRate(c) }}
                            </div>
                            <div class="text-xs text-gray-400">chết</div>
                        </div>
                    </div>

                    <!-- Card Footer -->
                    <div class="flex gap-2 pt-3 border-t border-gray-100">
                        <router-link :to="'/cycles/' + c.id"
                            class="btn btn-primary btn-sm flex-1 text-center">
                            Chi tiết
                        </router-link>
                        <button v-if="c.status === 'active'"
                            @click="openCloseModal(c)"
                            class="btn btn-warning btn-sm flex-1">
                            Kết thúc
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Create Modal -->
        <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
            <div class="modal max-w-lg">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-lg font-bold">Tạo đợt nuôi mới</h3>
                    <button @click="closeModal" class="btn btn-ghost">✕</button>
                </div>

                <form @submit.prevent="save" class="space-y-4">
                    <!-- Barn -->
                    <div class="form-group">
                        <label class="form-label required">Chuồng</label>
                        <select v-model="form.barn_id" class="form-input" required>
                            <option value="" disabled>Chọn chuồng</option>
                            <option v-for="b in availableBarns" :key="b.id" :value="b.id"
                                :disabled="hasActiveCycle(b.id) && b.id != form.barn_id">
                                {{ b.name }} {{ hasActiveCycle(b.id) ? '(đang nuôi)' : '' }}
                            </option>
                        </select>
                        <p v-if="form.barn_id && hasActiveCycle(form.barn_id)"
                            class="text-xs text-yellow-600 mt-1">
                            ⚠️ Chuồng này đang có đợt nuôi hoạt động
                        </p>
                    </div>

                    <!-- Name -->
                    <div class="form-group">
                        <label class="form-label">Tên đợt nuôi</label>
                        <input v-model="form.name" class="form-input"
                            placeholder="VD: Đợt 1 - T3/2026 (để trống để tự động tạo)">
                    </div>

                    <!-- Breed -->
                    <div class="form-group">
                        <label class="form-label">Giống</label>
                        <input v-model="form.breed" class="form-input"
                            placeholder="VD: Gà Ri, Gà Lương Phượng..." maxlength="200">
                    </div>

                    <!-- Initial Count + Start Date -->
                    <div class="grid grid-cols-2 gap-3">
                        <div class="form-group">
                            <label class="form-label required">Số lượng ban đầu</label>
                            <input v-model.number="form.initial_count" type="number"
                                class="form-input" placeholder="VD: 1200" min="1" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label required">Ngày bắt đầu</label>
                            <input v-model="form.start_date" type="date" class="form-input" required>
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button type="button" @click="closeModal" class="btn btn-secondary">
                            Huỷ
                        </button>
                        <button type="submit" class="btn btn-primary">
                            Tạo đợt nuôi
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Close Cycle Modal -->
        <div v-if="showCloseModal" class="modal-overlay" @click.self="closeCloseModal">
            <div class="modal max-w-md">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-lg font-bold">Kết thúc đợt nuôi</h3>
                    <button @click="closeCloseModal" class="btn btn-ghost">✕</button>
                </div>

                <div v-if="cycleToClose" class="space-y-4">
                    <!-- Cycle Summary -->
                    <div class="bg-gray-50 rounded-lg p-4 space-y-2">
                        <div class="font-medium text-gray-900">
                            {{ cycleToClose.name || 'Đợt ' + cycleToClose.id }}
                        </div>
                        <div class="text-sm text-gray-600">
                            {{ getBarnName(cycleToClose.barn_id) }} • {{ fmtDate(cycleToClose.start_date) }}
                        </div>
                        <div class="grid grid-cols-2 gap-2 mt-3 text-sm">
                            <div>
                                <span class="text-gray-500">Số lượng ban đầu:</span>
                                <span class="font-medium ml-1">{{ fmtNum(cycleToClose.initial_count) }}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Số lượng hiện tại:</span>
                                <span class="font-medium ml-1">{{ fmtNum(cycleToClose.current_count) }}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Ngày tuổi:</span>
                                <span class="font-medium ml-1">{{ getDayAge(cycleToClose.start_date) }}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Tỷ lệ tử vong:</span>
                                <span class="font-medium ml-1" :class="parseFloat(getMortalityRate(cycleToClose)) > 5 ? 'text-red-500' : ''">
                                    {{ getMortalityRate(cycleToClose) }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Close Form -->
                    <form @submit.prevent="confirmClose" class="space-y-4">
                        <div class="form-group">
                            <label class="form-label required">Ngày kết thúc</label>
                            <input v-model="closeForm.end_date" type="date" class="form-input" required>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Ghi chú</label>
                            <textarea v-model="closeForm.notes" class="form-input"
                                placeholder="Ghi chú kết thúc đợt nuôi (tuỳ chọn)"
                                rows="3" maxlength="1000"></textarea>
                        </div>

                        <div class="form-group">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input v-model="closeForm.force" type="checkbox" class="w-4 h-4 accent-yellow-500">
                                <span class="text-sm font-medium text-gray-700">
                                    Bỏ qua kiểm tra dữ liệu cho ăn
                                </span>
                            </label>
                            <p class="text-xs text-gray-400 mt-1">
                                Chỉ dùng khi đợt nuôi thực sự chưa có dữ liệu cho ăn
                            </p>
                        </div>

                        <div class="flex justify-end gap-3 pt-4 border-t border-gray-100">
                            <button type="button" @click="closeCloseModal" class="btn btn-secondary">
                                Huỷ
                            </button>
                            <button type="submit" class="btn btn-warning">
                                Kết thúc đợt nuôi
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
    `
};
