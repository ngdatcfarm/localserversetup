/**
 * Barns Page - Chuồng trại management
 * Desktop: Grid of barn cards with farm filter
 * Mobile: Single column cards with sticky header
 */
const { ref, reactive, computed, onMounted } = Vue;

return {
    setup() {
        // ── State ──────────────────────────────────────
        const barns = ref([]);
        const farms = ref([]);
        const cycles = ref([]);
        const selectedFarmId = ref(null);
        const searchQuery = ref('');
        const showModal = ref(false);
        const showDeleteConfirm = ref(false);
        const barnToDelete = ref(null);
        const loading = ref(false);

        const form = reactive({
            id: null,
            farm_id: '',
            code: '',
            name: '',
            capacity: null,
            area_sqm: null,
            description: '',
            active: true
        });

        // ── Computed ───────────────────────────────────
        const filteredBarns = computed(() => {
            let result = barns.value;
            if (selectedFarmId.value) {
                result = result.filter(b => b.farm_id === selectedFarmId.value);
            }
            if (searchQuery.value) {
                const q = searchQuery.value.toLowerCase();
                result = result.filter(b =>
                    b.name?.toLowerCase().includes(q) ||
                    b.code?.toLowerCase().includes(q)
                );
            }
            return result;
        });

        const farmOptions = computed(() => {
            return [{ id: null, name: 'Tất cả farms' }, ...farms.value];
        });

        const selectedFarmName = computed(() => {
            if (!selectedFarmId.value) return 'Tất cả farms';
            const farm = farms.value.find(f => f.id === selectedFarmId.value);
            return farm?.name || selectedFarmId.value;
        });

        // ── Methods ───────────────────────────────────
        async function loadBarns() {
            loading.value = true;
            try {
                [barns.value, cycles.value] = await Promise.all([
                    API.barns.list(),
                    API.cycles.list().catch(() => [])
                ]);
            } catch (e) {
                showToast('Không thể tải danh sách chuồng: ' + e.message, 'error');
            }
            loading.value = false;
        }

        async function loadFarms() {
            try {
                farms.value = await API.farms.list();
            } catch (e) {
                console.error('Failed to load farms:', e);
            }
        }

        function getBarnCycleInfo(barnId) {
            const barnCycles = cycles.value.filter(c => c.barn_id == barnId || c.barn_id === barnId);
            const activeCycles = barnCycles.filter(c => c.status === 'active');
            return {
                hasActiveCycle: activeCycles.length > 0,
                cycleCount: activeCycles.length,
                totalCycles: barnCycles.length
            };
        }

        function openForm(barn = null) {
            if (barn) {
                form.id = barn.id;
                form.farm_id = barn.farm_id || '';
                form.code = barn.code || '';
                form.name = barn.name || '';
                form.capacity = barn.capacity || null;
                form.area_sqm = barn.area_sqm || null;
                form.description = barn.description || '';
                form.active = barn.active !== false;
            } else {
                form.id = null;
                form.farm_id = farms.value.length > 0 ? farms.value[0].id : '';
                form.code = '';
                form.name = '';
                form.capacity = null;
                form.area_sqm = null;
                form.description = '';
                form.active = true;
            }
            showModal.value = true;
        }

        function closeModal() {
            showModal.value = false;
        }

        async function save() {
            // Validation
            if (!form.farm_id) {
                showToast('Vui lòng chọn farm', 'error');
                return;
            }
            if (!form.code?.trim()) {
                showToast('Mã chuồng là bắt buộc', 'error');
                return;
            }
            if (!form.name?.trim()) {
                showToast('Tên chuồng là bắt buộc', 'error');
                return;
            }
            if (form.capacity !== null && form.capacity <= 0) {
                showToast('Sức chứa phải lớn hơn 0', 'error');
                return;
            }
            if (form.area_sqm !== null && form.area_sqm <= 0) {
                showToast('Diện tích phải lớn hơn 0', 'error');
                return;
            }

            try {
                const payload = {
                    farm_id: form.farm_id,
                    code: form.code.trim(),
                    name: form.name.trim(),
                    capacity: form.capacity || null,
                    area_sqm: form.area_sqm || null,
                    description: form.description?.trim() || null,
                    active: form.active
                };

                if (form.id) {
                    await API.barns.update(form.id, payload);
                    showToast('Đã cập nhật chuồng thành công');
                } else {
                    await API.barns.create(payload);
                    showToast('Đã thêm chuồng mới');
                }
                closeModal();
                await loadBarns();
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        function confirmDelete(barn) {
            barnToDelete.value = barn;
            showDeleteConfirm.value = true;
        }

        function closeDeleteConfirm() {
            showDeleteConfirm.value = false;
            barnToDelete.value = null;
        }

        async function remove() {
            if (!barnToDelete.value) return;
            try {
                await API.barns.del(barnToDelete.value.id);
                showToast('Đã xóa chuồng');
                closeDeleteConfirm();
                await loadBarns();
            } catch (e) {
                showToast(e.message, 'error');
            }
        }

        function onFarmFilterChange(event) {
            selectedFarmId.value = event.target.value || null;
        }

        function getFarmName(farmId) {
            const farm = farms.value.find(f => f.id === farmId);
            return farm?.name || farmId || '-';
        }

        // ── Lifecycle ─────────────────────────────────
        onMounted(async () => {
            await Promise.all([loadBarns(), loadFarms()]);
        });

        // ── Template ──────────────────────────────────
        return {
            barns,
            farms,
            selectedFarmId,
            selectedFarmName,
            searchQuery,
            filteredBarns,
            farmOptions,
            showModal,
            showDeleteConfirm,
            barnToDelete,
            form,
            loading,
            openForm,
            closeModal,
            save,
            confirmDelete,
            closeDeleteConfirm,
            remove,
            onFarmFilterChange,
            getFarmName,
            getBarnCycleInfo,
            fmtNum
        };
    },

    template: `
    <div class="barns-page">
        <!-- Header -->
        <div class="page-header">
            <h2 class="page-title flex items-center gap-2">
                <span>🏠</span> Chuồng trại
            </h2>
            <button @click="openForm()" class="btn btn-primary">
                + Thêm chuồng
            </button>
        </div>

        <!-- Filter Bar -->
        <div class="flex flex-wrap items-center gap-3 mb-4">
            <!-- Farm Filter -->
            <select v-model="selectedFarmId" @change="onFarmFilterChange"
                class="form-input max-w-48" style="height: 2.5rem;">
                <option value="">Tất cả farms</option>
                <option v-for="farm in farms" :key="farm.id" :value="farm.id">
                    {{ farm.name }}
                </option>
            </select>

            <!-- Search -->
            <div class="relative flex-1 max-w-xs">
                <input v-model="searchQuery" type="text"
                    placeholder="Tìm kiếm chuồng..."
                    class="form-input pl-9" style="height: 2.5rem;">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            </div>

            <!-- Results count -->
            <div class="text-sm text-gray-500 ml-auto">
                {{ filteredBarns.length }} chuồng
            </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="text-center py-12 text-gray-400">
            <div class="text-3xl mb-2 animate-spin">⏳</div>
            <p>Đang tải...</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="barns.length === 0" class="card text-center py-16">
            <div class="text-6xl mb-4">🏠</div>
            <h3 class="text-xl font-bold text-gray-900 mb-2">Chưa có chuồng trại nào</h3>
            <p class="text-gray-500 mb-6">Bắt đầu bằng cách tạo chuồng trại đầu tiên</p>
            <button @click="openForm()" class="btn btn-primary">
                + Thêm chuồng đầu tiên
            </button>
        </div>

        <!-- Empty Filtered -->
        <div v-else-if="filteredBarns.length === 0" class="card text-center py-12">
            <div class="text-4xl mb-2">🔍</div>
            <p class="text-gray-500">Không có chuồng nào phù hợp</p>
        </div>

        <!-- Barns Grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="barn in filteredBarns" :key="barn.id"
                class="card hover:shadow-md transition-shadow">

                <!-- Card Header -->
                <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-lg bg-green-100 text-green-600 flex items-center justify-center text-xl">
                            🏠
                        </div>
                        <div>
                            <div class="font-semibold text-gray-900">{{ barn.name }}</div>
                            <div class="text-xs text-gray-500 font-mono">{{ barn.code }}</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1">
                        <button @click="openForm(barn)"
                            class="btn btn-ghost btn-sm" title="Sửa">
                            ✏️
                        </button>
                        <button @click="confirmDelete(barn)"
                            class="btn btn-ghost btn-sm text-red-500 hover:bg-red-50" title="Xóa">
                            🗑️
                        </button>
                    </div>
                </div>

                <!-- Card Body -->
                <div class="space-y-2 text-sm">
                    <div class="flex items-center gap-2 text-gray-600">
                        <span class="text-gray-400">🏡</span>
                        <span>{{ getFarmName(barn.farm_id) }}</span>
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-1 text-gray-600">
                            <span class="text-gray-400">📊</span>
                            <span>{{ barn.capacity ? fmtNum(barn.capacity) + ' con' : '-' }}</span>
                        </div>
                        <div v-if="barn.area_sqm" class="flex items-center gap-1 text-gray-600">
                            <span class="text-gray-400">📐</span>
                            <span>{{ barn.area_sqm }} m²</span>
                        </div>
                    </div>
                    <div v-if="barn.description" class="text-gray-500 text-xs line-clamp-2">
                        {{ barn.description }}
                    </div>
                </div>

                <!-- Card Footer -->
                <div class="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                    <span v-if="getBarnCycleInfo(barn.id).hasActiveCycle"
                        class="badge badge-green flex items-center gap-1">
                        🔄 {{ getBarnCycleInfo(barn.id).cycleCount }} đợt nuôi
                    </span>
                    <span v-else class="badge badge-gray">✅ Trống</span>
                    <span v-if="!barn.active"
                        class="text-xs text-red-500 font-medium">Đã tắt</span>
                </div>
            </div>
        </div>

        <!-- Create/Edit Modal -->
        <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
            <div class="modal max-w-lg">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-lg font-bold">{{ form.id ? 'Sửa chuồng' : 'Thêm chuồng mới' }}</h3>
                    <button @click="closeModal" class="btn btn-ghost">✕</button>
                </div>

                <form @submit.prevent="save" class="space-y-4">
                    <!-- Farm -->
                    <div class="form-group">
                        <label class="form-label required">Farm</label>
                        <select v-model="form.farm_id" class="form-input" required>
                            <option value="" disabled>Chọn farm</option>
                            <option v-for="farm in farms" :key="farm.id" :value="farm.id">
                                {{ farm.name }}
                            </option>
                        </select>
                    </div>

                    <!-- Code + Name -->
                    <div class="grid grid-cols-2 gap-3">
                        <div class="form-group">
                            <label class="form-label required">Mã chuồng</label>
                            <input v-model="form.code" class="form-input" placeholder="VD: barn_a1"
                                maxlength="50" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label required">Tên chuồng</label>
                            <input v-model="form.name" class="form-input" placeholder="VD: Chuồng A1"
                                maxlength="200" required>
                        </div>
                    </div>

                    <!-- Capacity + Area -->
                    <div class="grid grid-cols-2 gap-3">
                        <div class="form-group">
                            <label class="form-label">Sức chứa (con)</label>
                            <input v-model.number="form.capacity" type="number"
                                class="form-input" placeholder="VD: 2000" min="1">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Diện tích (m²)</label>
                            <input v-model.number="form.area_sqm" type="number"
                                class="form-input" placeholder="VD: 150" min="0" step="0.1">
                        </div>
                    </div>

                    <!-- Description -->
                    <div class="form-group">
                        <label class="form-label">Mô tả</label>
                        <textarea v-model="form.description" class="form-input"
                            placeholder="Mô tả chi tiết (tuỳ chọn)" rows="2"
                            maxlength="1000"></textarea>
                    </div>

                    <!-- Active -->
                    <div class="form-group">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input v-model="form.active" type="checkbox" class="w-4 h-4 accent-green-600">
                            <span class="text-sm font-medium text-gray-700">Chuồng đang hoạt động</span>
                        </label>
                    </div>

                    <!-- Actions -->
                    <div class="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button type="button" @click="closeModal" class="btn btn-secondary">
                            Huỷ
                        </button>
                        <button type="submit" class="btn btn-primary">
                            {{ form.id ? 'Lưu thay đổi' : 'Thêm chuồng' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Delete Confirmation Modal -->
        <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="closeDeleteConfirm">
            <div class="modal max-w-sm">
                <div class="text-center">
                    <div class="text-5xl mb-4">⚠️</div>
                    <h3 class="text-lg font-bold text-gray-900 mb-2">Xóa chuồng?</h3>
                    <p class="text-gray-600 mb-2">
                        Bạn có chắc muốn xóa <strong>{{ barnToDelete?.name }}</strong>?
                    </p>
                    <p v-if="barnToDelete && getBarnCycleInfo(barnToDelete.id).hasActiveCycle" class="text-red-500 text-sm mb-4">
                        Không thể xóa chuồng đang có đợt nuôi đang hoạt động
                    </p>
                </div>
                <div class="flex justify-center gap-3 mt-6">
                    <button @click="closeDeleteConfirm" class="btn btn-secondary">
                        Huỷ
                    </button>
                    <button @click="remove" class="btn btn-danger"
                        :disabled="barnToDelete && getBarnCycleInfo(barnToDelete.id).hasActiveCycle">
                        Xóa
                    </button>
                </div>
            </div>
        </div>
    </div>
    `
};
