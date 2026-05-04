/**
 * Cycles Page V2 - Quản lý đợt nuôi chuyên nghiệp
 * - Thống kê nhanh trên cùng
 * - Tabs trạng thái có badge số lượng
 * - Bảng desktop tinh gọn (ẩn bớt cột, gộp thông tin)
 * - Card mobile hiện đại
 * - Modal tạo/kết thúc đẹp hơn
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

        // Thống kê tổng quan
        const stats = computed(() => {
            const active = cycles.value.filter(c => c.status === 'active');
            const totalBirds = active.reduce((sum, c) => sum + (c.current_count || 0), 0);
            const totalDeaths = active.reduce((sum, c) => sum + ((c.initial_count || 0) - (c.current_count || 0)), 0);
            const avgMortality = totalBirds > 0 ? (totalDeaths / (totalBirds + totalDeaths) * 100).toFixed(1) : '0.0';
            return {
                activeCount: active.length,
                totalBirds,
                totalDeaths,
                avgMortality
            };
        });

        const activeCyclesCount = computed(() => cycles.value.filter(c => c.status === 'active').length);
        const closedCyclesCount = computed(() => cycles.value.filter(c => c.status === 'closed').length);

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
            stats,
            activeCyclesCount,
            closedCyclesCount,
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
        <!-- Header + Quick Stats -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center text-xl">
                    🔄
                </div>
                <h2 class="text-2xl font-bold text-gray-800">Quản lý đợt nuôi</h2>
            </div>
            <button @click="openForm" class="btn btn-primary px-5 py-2.5 rounded-xl shadow-sm">
                + Tạo đợt nuôi mới
            </button>
        </div>

        <!-- Thống kê nhanh -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div class="text-xs text-gray-500 mb-1">Đang hoạt động</div>
                <div class="text-2xl font-bold text-green-600">{{ stats.activeCount }}</div>
                <div class="text-xs text-gray-400">đợt nuôi</div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div class="text-xs text-gray-500 mb-1">Tổng gia cầm</div>
                <div class="text-2xl font-bold text-blue-600">{{ fmtNum(stats.totalBirds) }}</div>
                <div class="text-xs text-gray-400">con</div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div class="text-xs text-gray-500 mb-1">Tổng hao hụt</div>
                <div class="text-2xl font-bold text-red-500">{{ fmtNum(stats.totalDeaths) }}</div>
                <div class="text-xs text-gray-400">con</div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div class="text-xs text-gray-500 mb-1">Tỷ lệ chết TB</div>
                <div class="text-2xl font-bold text-orange-500">{{ stats.avgMortality }}%</div>
                <div class="text-xs text-gray-400">trên tổng đàn</div>
            </div>
        </div>

        <!-- Filter Bar -->
        <div class="flex flex-wrap items-center gap-3 mb-4">
            <select v-model="filterBarn" class="form-input w-48 md:w-56 bg-white">
                <option value="">Tất cả chuồng</option>
                <option v-for="b in barns" :key="b.id" :value="b.id">
                    {{ b.name }}
                </option>
            </select>

            <div class="relative flex-1 max-w-xs">
                <input v-model="searchQuery" type="text"
                    placeholder="Tìm kiếm theo tên..."
                    class="form-input pl-9 pr-4 bg-white w-full">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            </div>

            <div class="text-sm text-gray-500 ml-auto">
                {{ filteredCycles.length }} đợt nuôi
            </div>
        </div>

        <!-- Tabs Trạng thái với Badge -->
        <div class="flex gap-2 border-b border-gray-200 pb-1 mb-5">
            <button @click="setFilterStatus('')"
                :class="filterStatus === '' 
                    ? 'border-b-2 border-green-500 text-green-700 font-medium' 
                    : 'text-gray-500 hover:text-gray-700'"
                class="px-4 py-2 -mb-px transition-colors flex items-center gap-2">
                Tất cả
                <span class="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">{{ cycles.length }}</span>
            </button>
            <button @click="setFilterStatus('active')"
                :class="filterStatus === 'active' 
                    ? 'border-b-2 border-green-500 text-green-700 font-medium' 
                    : 'text-gray-500 hover:text-gray-700'"
                class="px-4 py-2 -mb-px transition-colors flex items-center gap-2">
                🔄 Đang nuôi
                <span class="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">{{ activeCyclesCount }}</span>
            </button>
            <button @click="setFilterStatus('closed')"
                :class="filterStatus === 'closed' 
                    ? 'border-b-2 border-green-500 text-green-700 font-medium' 
                    : 'text-gray-500 hover:text-gray-700'"
                class="px-4 py-2 -mb-px transition-colors flex items-center gap-2">
                ✅ Đã kết thúc
                <span class="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{{ closedCyclesCount }}</span>
            </button>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="text-center py-16 text-gray-400">
            <div class="inline-block animate-spin text-4xl mb-3">⏳</div>
            <p class="text-gray-500">Đang tải dữ liệu...</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="cycles.length === 0" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <div class="text-6xl mb-4">🔄</div>
            <h3 class="text-xl font-bold text-gray-800 mb-2">Chưa có đợt nuôi nào</h3>
            <p class="text-gray-500 mb-6">Bắt đầu bằng cách tạo đợt nuôi đầu tiên</p>
            <button @click="openForm" class="btn btn-primary px-6 py-2.5 rounded-xl">
                + Tạo đợt nuôi đầu tiên
            </button>
        </div>

        <!-- Empty Filtered -->
        <div v-else-if="filteredCycles.length === 0" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
            <div class="text-4xl mb-3">🔍</div>
            <p class="text-gray-500">Không tìm thấy đợt nuôi phù hợp</p>
            <button @click="filterStatus = ''; filterBarn = ''; searchQuery = ''" class="mt-3 text-green-600 hover:underline text-sm">
                Xóa bộ lọc
            </button>
        </div>

        <!-- Danh sách đợt nuôi -->
        <div v-else>
            <!-- Desktop Table (từ md trở lên) -->
            <div class="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Đợt nuôi</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vị trí</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Giống</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ngày bắt đầu</th>
                                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Số lượng</th>
                                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Ngày tuổi</th>
                                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Tỷ lệ chết</th>
                                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            <tr v-for="c in filteredCycles" :key="c.id" class="hover:bg-gray-50 transition">
                                <td class="px-4 py-3">
                                    <div class="font-semibold text-gray-900">{{ c.name || 'Đợt ' + c.id }}</div>
                                    <div class="text-xs text-gray-400 font-mono">{{ c.code }}</div>
                                </td>
                                <td class="px-4 py-3">
                                    <div class="font-medium text-gray-800">{{ getBarnName(c.barn_id) }}</div>
                                    <div class="text-xs text-gray-400">{{ getFarmName(c.barn_id) }}</div>
                                </td>
                                <td class="px-4 py-3 text-gray-700">{{ c.breed || '-' }}</td>
                                <td class="px-4 py-3 text-gray-700">{{ fmtDate(c.start_date) }}</td>
                                <td class="px-4 py-3 text-right">
                                    <span class="font-semibold">{{ fmtNum(c.current_count || c.initial_count) }}</span>
                                    <span class="text-gray-400 text-sm"> / {{ fmtNum(c.initial_count) }}</span>
                                </td>
                                <td class="px-4 py-3 text-center">
                                    <span v-if="c.status === 'active'" class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                                        Day {{ getDayAge(c.start_date) }}
                                    </span>
                                    <span v-else class="text-gray-500 text-sm">{{ getDayAge(c.start_date) }} ngày</span>
                                </td>
                                <td class="px-4 py-3 text-center">
                                    <span :class="{
                                        'text-red-600 font-medium': parseFloat(getMortalityRate(c)) > 5,
                                        'text-gray-600': parseFloat(getMortalityRate(c)) <= 5 || getMortalityRate(c) === '-'
                                    }">
                                        {{ getMortalityRate(c) }}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-center">
                                    <span v-if="c.status === 'active'" class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                        Đang nuôi
                                    </span>
                                    <span v-else class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                        Kết thúc
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-right">
                                    <div class="flex items-center justify-end gap-2">
                                        <router-link :to="'/cycles/' + c.id"
                                            class="text-sm bg-green-50 hover:bg-green-100 text-green-700 px-3 py-1.5 rounded-lg transition">
                                            Chi tiết
                                        </router-link>
                                        <button v-if="c.status === 'active'"
                                            @click="openCloseModal(c)"
                                            class="text-sm bg-amber-50 hover:bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg transition">
                                            Kết thúc
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Mobile Cards (dưới md) -->
            <div class="md:hidden space-y-3">
                <div v-for="c in filteredCycles" :key="c.id"
                    class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div class="flex items-start justify-between mb-3">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
                                :class="c.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'">
                                🔄
                            </div>
                            <div>
                                <div class="font-bold text-gray-900">{{ c.name || 'Đợt ' + c.id }}</div>
                                <div class="text-sm text-gray-500">{{ getBarnName(c.barn_id) }} • {{ getFarmName(c.barn_id) }}</div>
                            </div>
                        </div>
                        <span v-if="c.status === 'active'" class="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Đang nuôi</span>
                        <span v-else class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">Kết thúc</span>
                    </div>

                    <div class="grid grid-cols-3 gap-2 mb-4 text-sm">
                        <div class="text-center p-2 bg-gray-50 rounded-lg">
                            <div class="text-lg font-bold text-gray-800">{{ fmtNum(c.current_count || c.initial_count) }}</div>
                            <div class="text-xs text-gray-500">con</div>
                        </div>
                        <div class="text-center p-2 bg-gray-50 rounded-lg">
                            <div class="text-lg font-bold text-gray-800">{{ getDayAge(c.start_date) }}</div>
                            <div class="text-xs text-gray-500">ngày tuổi</div>
                        </div>
                        <div class="text-center p-2 bg-gray-50 rounded-lg">
                            <div class="text-lg font-bold" :class="parseFloat(getMortalityRate(c)) > 5 ? 'text-red-500' : 'text-gray-800'">
                                {{ getMortalityRate(c) }}
                            </div>
                            <div class="text-xs text-gray-500">chết</div>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 text-xs text-gray-500 mb-3">
                        <span>Giống: {{ c.breed || '-' }}</span>
                        <span class="w-1 h-1 bg-gray-300 rounded-full"></span>
                        <span>Bắt đầu: {{ fmtDate(c.start_date) }}</span>
                    </div>

                    <div class="flex gap-2">
                        <router-link :to="'/cycles/' + c.id"
                            class="flex-1 text-center bg-green-50 hover:bg-green-100 text-green-700 font-medium py-2.5 rounded-lg transition text-sm">
                            Chi tiết
                        </router-link>
                        <button v-if="c.status === 'active'"
                            @click="openCloseModal(c)"
                            class="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium py-2.5 rounded-lg transition text-sm">
                            Kết thúc
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Modal Tạo đợt nuôi mới -->
        <Teleport to="body">
            <div v-if="showModal" class="fixed inset-0 z-50 overflow-y-auto">
                <div class="flex min-h-screen items-center justify-center p-4">
                    <div class="fixed inset-0 bg-black/30 backdrop-blur-sm" @click="closeModal"></div>
                    
                    <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-lg transform transition-all">
                        <div class="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                            <h3 class="text-xl font-bold text-gray-800">Tạo đợt nuôi mới</h3>
                            <button @click="closeModal" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
                        </div>

                        <form @submit.prevent="save" class="p-6 space-y-5">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Chuồng <span class="text-red-500">*</span></label>
                                <select v-model="form.barn_id" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500" required>
                                    <option value="" disabled>Chọn chuồng</option>
                                    <option v-for="b in availableBarns" :key="b.id" :value="b.id">
                                        {{ b.name }} {{ hasActiveCycle(b.id) ? '(đang nuôi)' : '' }}
                                    </option>
                                </select>
                                <p v-if="form.barn_id && hasActiveCycle(form.barn_id)" class="text-xs text-amber-600 mt-1">
                                    ⚠️ Chuồng này đang có đợt nuôi hoạt động
                                </p>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Tên đợt nuôi</label>
                                <input v-model="form.name" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500" placeholder="VD: Đợt 1 - T3/2026">
                                <p class="text-xs text-gray-400 mt-1">Để trống để tự động tạo mã</p>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Giống</label>
                                <input v-model="form.breed" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500" placeholder="VD: Gà Ri, Gà Lương Phượng...">
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Số lượng <span class="text-red-500">*</span></label>
                                    <input v-model.number="form.initial_count" type="number" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500" placeholder="1200" min="1" required>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu <span class="text-red-500">*</span></label>
                                    <input v-model="form.start_date" type="date" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500" required>
                                </div>
                            </div>

                            <div class="flex justify-end gap-3 pt-4">
                                <button type="button" @click="closeModal" class="px-5 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition">
                                    Huỷ
                                </button>
                                <button type="submit" class="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl shadow-sm transition">
                                    Tạo đợt nuôi
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </Teleport>

        <!-- Modal Kết thúc đợt nuôi -->
        <Teleport to="body">
            <div v-if="showCloseModal" class="fixed inset-0 z-50 overflow-y-auto">
                <div class="flex min-h-screen items-center justify-center p-4">
                    <div class="fixed inset-0 bg-black/30 backdrop-blur-sm" @click="closeCloseModal"></div>
                    
                    <div class="relative bg-white rounded-2xl shadow-xl w-full max-w-md transform transition-all">
                        <div class="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                            <h3 class="text-xl font-bold text-gray-800">Kết thúc đợt nuôi</h3>
                            <button @click="closeCloseModal" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
                        </div>

                        <div v-if="cycleToClose" class="p-6 space-y-5">
                            <div class="bg-gray-50 rounded-xl p-4 space-y-3">
                                <div class="font-semibold text-gray-800 text-lg">
                                    {{ cycleToClose.name || 'Đợt ' + cycleToClose.id }}
                                </div>
                                <div class="text-sm text-gray-600">
                                    {{ getBarnName(cycleToClose.barn_id) }} • Bắt đầu: {{ fmtDate(cycleToClose.start_date) }}
                                </div>
                                <div class="grid grid-cols-2 gap-3 text-sm">
                                    <div><span class="text-gray-500">Ban đầu:</span> <span class="font-medium">{{ fmtNum(cycleToClose.initial_count) }}</span></div>
                                    <div><span class="text-gray-500">Hiện tại:</span> <span class="font-medium">{{ fmtNum(cycleToClose.current_count) }}</span></div>
                                    <div><span class="text-gray-500">Ngày tuổi:</span> <span class="font-medium">{{ getDayAge(cycleToClose.start_date) }}</span></div>
                                    <div><span class="text-gray-500">Tỷ lệ chết:</span> 
                                        <span class="font-medium" :class="parseFloat(getMortalityRate(cycleToClose)) > 5 ? 'text-red-500' : ''">
                                            {{ getMortalityRate(cycleToClose) }}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <form @submit.prevent="confirmClose" class="space-y-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc <span class="text-red-500">*</span></label>
                                    <input v-model="closeForm.end_date" type="date" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500" required>
                                </div>

                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                                    <textarea v-model="closeForm.notes" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500" rows="3" placeholder="Ghi chú kết thúc đợt nuôi (tuỳ chọn)"></textarea>
                                </div>

                                <div class="flex items-start gap-2">
                                    <input v-model="closeForm.force" type="checkbox" id="force" class="mt-1 w-4 h-4 text-amber-500 rounded focus:ring-amber-500">
                                    <label for="force" class="text-sm text-gray-700">
                                        Bỏ qua kiểm tra dữ liệu cho ăn <br>
                                        <span class="text-xs text-gray-400">Chỉ dùng khi đợt nuôi thực sự chưa có dữ liệu</span>
                                    </label>
                                </div>

                                <div class="flex justify-end gap-3 pt-4">
                                    <button type="button" @click="closeCloseModal" class="px-5 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50">
                                        Huỷ
                                    </button>
                                    <button type="submit" class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-xl shadow-sm">
                                        Xác nhận kết thúc
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
    `
};