/**
 * Barns Page - Giao diện quản lý Chuồng trại (Phiên bản Thiết kế Cao cấp Đã nâng cấp)
 * Desktop: Grid 3 cột sang trọng, cấu trúc thẻ tinh gọn, bộ lọc trực quan
 * Mobile: Thẻ tràn viền dạng cột đơn, tiêu đề cuộn mượt mà
 */
const { ref, reactive, computed, onMounted } = Vue;

export default{
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
            id: '',
            farm_id: '',
            name: '',
            number: null,
            capacity: null,
            area_sqm: null,
            length_m: null,
            width_m: null,
            height_m: null,
            status: 'active',
            description: '',
            note: '',
            active: true
        });

        // ── Computed ───────────────────────────────────
        const filteredBarns = computed(() => {
            if (!barns.value || !Array.isArray(barns.value)) return [];
            let result = barns.value;
            if (selectedFarmId.value) {
                result = result.filter(b => b && b.farm_id === selectedFarmId.value);
            }
            if (searchQuery.value) {
                const q = searchQuery.value.toLowerCase();
                result = result.filter(b => b && (
                    b.name?.toLowerCase().includes(q) ||
                    b.id?.toLowerCase().includes(q)
                ));
            }
            return result;
        });

        const farmOptions = computed(() => {
            return [{ id: null, name: 'Tất cả trang trại' }, ...farms.value];
        });

        const selectedFarmName = computed(() => {
            if (!selectedFarmId.value) return 'Tất cả trang trại';
            const farm = farms.value.find(f => f.id === selectedFarmId.value);
            return farm?.name || selectedFarmId.value;
        });

        // ── Methods ───────────────────────────────────
        async function loadBarns() {
            loading.value = true;
            try {
                const barnsData = await API.barns.list();
                const cyclesData = await API.cycles.list().catch(() => []);

                barns.value = Array.isArray(barnsData) ? barnsData : [];
                cycles.value = Array.isArray(cyclesData) ? cyclesData : [];
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast('Không thể tải danh sách chuồng: ' + e.message, 'error');
                } else {
                    console.error('Không thể tải chuồng:', e);
                }
                barns.value = [];
                cycles.value = [];
            }
            loading.value = false;
        }

        async function loadFarms() {
            try {
                farms.value = await API.farms.list();
            } catch (e) {
                console.error('Hệ thống không tải được danh sách trang trại:', e);
            }
        }

        function getBarnCycleInfo(barnId) {
            if (!barnId || !cycles.value || !Array.isArray(cycles.value)) {
                return { hasActiveCycle: false, cycleCount: 0, totalCycles: 0 };
            }
            const barnCycles = cycles.value.filter(c => c && (c.barn_id == barnId || c.barn_id === barnId));
            const activeCycles = barnCycles.filter(c => c.status === 'active');
            return {
                hasActiveCycle: activeCycles.length > 0,
                cycleCount: activeCycles.length,
                totalCycles: barnCycles.length
            };
        }

        function openForm(barn = null) {
            if (barn) {
                form.id = barn.id || '';
                form.farm_id = barn.farm_id || '';
                form.name = barn.name || '';
                form.number = barn.number || null;
                form.capacity = barn.capacity || null;
                form.area_sqm = barn.area_sqm || null;
                form.length_m = barn.length_m || null;
                form.width_m = barn.width_m || null;
                form.height_m = barn.height_m || null;
                form.status = barn.status || 'active';
                form.description = barn.description || '';
                form.note = barn.note || '';
                form.active = barn.active !== false;
            } else {
                form.id = '';
                form.farm_id = farms.value.length > 0 ? farms.value[0].id : '';
                form.name = '';
                form.number = null;
                form.capacity = null;
                form.area_sqm = null;
                form.length_m = null;
                form.width_m = null;
                form.height_m = null;
                form.status = 'active';
                form.description = '';
                form.note = '';
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
                if (typeof showToast === 'function') showToast('Vui lòng chọn farm', 'error');
                return;
            }
            if (!form.id?.trim()) {
                if (typeof showToast === 'function') showToast('ID chuồng là bắt buộc', 'error');
                return;
            }
            if (!form.name?.trim()) {
                if (typeof showToast === 'function') showToast('Tên chuồng là bắt buộc', 'error');
                return;
            }
            if (form.capacity !== null && form.capacity <= 0) {
                if (typeof showToast === 'function') showToast('Sức chứa phải lớn hơn 0', 'error');
                return;
            }
            if (form.area_sqm !== null && form.area_sqm <= 0) {
                if (typeof showToast === 'function') showToast('Diện tích phải lớn hơn 0', 'error');
                return;
            }

            try {
                const payload = {
                    id: form.id.trim(),
                    farm_id: form.farm_id,
                    name: form.name.trim(),
                    number: form.number || null,
                    capacity: form.capacity || null,
                    area_sqm: form.area_sqm || null,
                    length_m: form.length_m || null,
                    width_m: form.width_m || null,
                    height_m: form.height_m || null,
                    status: form.status,
                    description: form.description?.trim() || null,
                    note: form.note?.trim() || null,
                    active: form.active
                };

                if (barns.value.some(b => b.id === payload.id) && showModal.value && form.id === payload.id) {
                    await API.barns.update(form.id, payload);
                    if (typeof showToast === 'function') showToast('Cập nhật thông tin chuồng thành công ✔️');
                } else {
                    await API.barns.create(payload);
                    if (typeof showToast === 'function') showToast('Đã thêm chuồng nuôi mới thành công 🌱');
                }
                closeModal();
                await loadBarns();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
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
                if (typeof showToast === 'function') showToast('Đã xóa chuồng khỏi danh sách');
                closeDeleteConfirm();
                await loadBarns();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
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
    <div class="cf-container">
        <!-- Header -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0V11m0 5H9m5 0h1m2 0h1m-7 4h12a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">Quản lý Chuồng trại</h1>
                    <p class="cf-subtitle">Bố trí sơ đồ nuôi dưỡng, quản lí thông số kỹ thuật mật độ nuôi</p>
                </div>
            </div>
            <button @click="openForm()" class="cf-btn-primary">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
                Thêm chuồng nuôi
            </button>
        </div>

        <!-- Filter Bar -->
        <div class="cf-filter-bar">
            <!-- Farm Filter -->
            <div class="cf-select-wrapper">
                <span class="cf-select-icon-left">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                </span>
                <select v-model="selectedFarmId" @change="onFarmFilterChange" class="cf-select">
                    <option :value="null">Tất cả trang trại</option>
                    <option v-for="farm in farms" :key="farm.id" :value="farm.id">
                        {{ farm.name }}
                    </option>
                </select>
                <span class="cf-select-icon-right">▼</span>
            </div>

            <!-- Search input -->
            <div class="cf-search-wrapper">
                <span class="cf-search-icon">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </span>
                <input v-model="searchQuery" type="text" placeholder="Tìm theo tên chuồng, mã ID..." class="cf-search-input">
            </div>

            <!-- Results count -->
            <div class="cf-badge-indicator">
                <span class="cf-badge-dot"></span>
                <span>Đang hiển thị <b>{{ filteredBarns.length }}</b> chuồng</span>
            </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="cf-loading-box">
            <div class="cf-spinner"></div>
            <p class="cf-loading-text">Đang tải xuống dữ liệu sơ đồ chuồng nuôi...</p>
        </div>

        <!-- Empty State (No barns at all) -->
        <div v-else-if="barns.length === 0" class="cf-empty-box">
            <div class="cf-empty-icon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 21h19.5M3 10h18M3 14h18M3 18h18m-11-8v11m4-11v11M5.25 5.25h13.5A2.25 2.25 0 0121 7.5v11.25H3V7.5A2.25 2.25 0 015.25 5.25z"/>
                </svg>
            </div>
            <h3 class="cf-empty-title">Chưa có thông tin chuồng trại</h3>
            <p class="cf-empty-desc">Hãy khởi tạo định danh chuồng trại đầu tiên để phân phối hạt nuôi, thức ăn và theo dõi chỉ số nhiệt độ.</p>
            <button @click="openForm()" class="cf-btn-primary">
                + Khởi tạo chuồng trại đầu tiên
            </button>
        </div>

        <!-- Empty Filtered State -->
        <div v-else-if="filteredBarns.length === 0" class="cf-empty-box">
            <div class="cf-empty-icon" style="background-color: #f1f5f9; color: #94a3b8;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <p class="cf-loading-text">Không có kết quả nào trùng khớp với bộ lọc dữ liệu.</p>
        </div>

        <!-- Barns Grid -->
        <div v-else class="cf-cards-grid">
            <div v-for="barn in filteredBarns" :key="barn.id" class="cf-barn-card">

                <!-- Status bar top decor based on status -->
                <div class="cf-card-banner" :class="{
                    'active-standard': barn.active && barn.status === 'active',
                    'active-maintenance': barn.active && barn.status === 'maintenance',
                    'inactive-state': !barn.active || barn.status === 'inactive'
                }"></div>

                <!-- Card Header -->
                <div class="cf-card-content">
                    <div class="cf-card-top-row">
                        <div class="cf-card-identity">
                            <div class="cf-card-icon-box" :class="{
                                'active-standard': barn.active && barn.status === 'active',
                                'active-maintenance': barn.active && barn.status === 'maintenance',
                                'inactive-state': !barn.active || barn.status === 'inactive'
                            }">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"/>
                                </svg>
                            </div>
                            <div class="min-w-0">
                                <h4 class="cf-card-title">{{ barn.name }}</h4>
                                <div class="cf-card-meta-line">
                                    <span>ID: {{ barn.id }}</span>
                                    <span v-if="barn.number" class="cf-card-meta-bullet">•</span>
                                    <span v-if="barn.number" class="cf-card-meta-number">#{{ barn.number }}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Card actions -->
                        <div class="cf-card-actions-pill">
                            <button @click="openForm(barn)" class="cf-action-btn" title="Cập nhật">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
                                </svg>
                            </button>
                            <button @click="confirmDelete(barn)" class="cf-action-btn btn-remove" title="Xóa bỏ">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 11.667 0 00-7.5 0"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Line info belonging Farm -->
                    <div class="cf-farm-line">
                        <span class="cf-farm-line-icon">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25s-7.5-4.108-7.5-11.25a7.5 7.5 0 1115 0z"/>
                            </svg>
                        </span>
                        <span class="cf-farm-label">Trang trại:</span>
                        <span class="cf-farm-value">{{ getFarmName(barn.farm_id) }}</span>
                    </div>

                    <!-- Specs mini info bar -->
                    <div class="cf-metrics-subgrid">
                        <div class="cf-metric-mini-box">
                            <div class="cf-metric-subicon">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.97 5.97 0 00-.75-2.906m-.179-1.973a5 5 0 00-7.143 0M12 7a5 5 0 0110 0c0 1.29-.487 2.47-1.3 3.3l-2.07 2.07a1 1 0 01-1.414 0l-2.07-2.07A4.97 4.97 0 0112 7zm0 0a5 5 0 00-5 5v3m0 0h10H7z"/>
                                </svg>
                            </div>
                            <div class="cf-metric-details">
                                <span class="cf-metric-label">Sức chứa</span>
                                <span class="cf-metric-value">{{ barn.capacity ? fmtNum(barn.capacity) + ' con' : '-' }}</span>
                            </div>
                        </div>

                        <div class="cf-metric-mini-box">
                            <div class="cf-metric-subicon teal-theme">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
                                </svg>
                            </div>
                            <div class="cf-metric-details">
                                <span class="cf-metric-label">Diện tích</span>
                                <span class="cf-metric-value">{{ barn.area_sqm ? barn.area_sqm + ' m²' : '-' }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Size layout standard text -->
                    <div v-if="barn.length_m || barn.width_m || barn.height_m" class="cf-size-line">
                        <span class="cf-size-line-icon">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h11.25a2.25 2.25 0 012.25 2.25M21 21h-5.25a2.25 2.25 0 01-2.25-2.25V15M3.75 3L21 21"/>
                            </svg>
                        </span>
                        <span>kích thước phủ bì: </span>
                        <b class="cf-size-bold">
                            {{ barn.length_m ? barn.length_m + 'm' : '?' }} ×
                            {{ barn.width_m ? barn.width_m + 'm' : '?' }} ×
                            {{ barn.height_m ? barn.height_m + 'm' : '?' }}
                        </b>
                    </div>

                    <!-- Notes & description block -->
                    <div v-if="barn.note || barn.description" class="cf-notes-box">
                        <div v-if="barn.note" class="cf-note-urgent">
                            <span class="cf-note-urgent-icon">⚠️</span>
                            <span class="cf-clamp-2"><span class="font-bold">Lưu ý:</span> {{ barn.note }}</span>
                        </div>
                        <div v-if="barn.description" class="cf-note-desc">
                            <span class="cf-note-desc-icon">📝</span>
                            <p class="cf-clamp-2">{{ barn.description }}</p>
                        </div>
                    </div>
                </div>

                <!-- Card Footer (Full Border T on bottom) -->
                <div class="cf-card-footer">
                    <!-- Feed cycles badge status -->
                    <span v-if="getBarnCycleInfo(barn.id).hasActiveCycle" class="cf-cycle-badge status-active">
                        <span class="cf-cycle-dot dot-active"></span>
                        🔄 {{ getBarnCycleInfo(barn.id).cycleCount }} đợt active
                    </span>
                    <span v-else class="cf-cycle-badge status-empty">
                        <span class="cf-cycle-dot dot-empty"></span>
                        Trống chuồng
                    </span>

                    <!-- Main active/inactive state text pill -->
                    <div class="flex items-center">
                        <span v-if="!barn.active" class="cf-state-pill inactive">
                            Ngưng hoạt động
                        </span>
                        <span v-else-if="barn.status === 'maintenance'" class="cf-state-pill maintenance">
                            Bảo trì
                        </span>
                        <span v-else class="cf-state-pill ready">
                            Ready
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Create/Edit Modal -->
        <div v-if="showModal" class="cf-modal-overlay" @click.self="closeModal">
            <div class="cf-modal-box">
                <!-- Modal Head -->
                <div class="cf-modal-header">
                    <div class="cf-modal-header-left">
                        <div class="cf-modal-header-icon">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        </div>
                        <h3 class="cf-modal-title">{{ form.id ? 'Cập nhật thông tin chuồng' : 'Khởi tạo chuồng trại mới' }}</h3>
                    </div>
                    <button @click="closeModal" class="cf-modal-close-btn">✕</button>
                </div>

                <form @submit.prevent="save" class="cf-modal-body">
                    <!-- Farm selector -->
                    <div class="cf-form-group">
                        <label class="cf-label">Trang trại quản hạt <span class="req">*</span></label>
                        <select v-model="form.farm_id" class="cf-modal-select" required>
                            <option value="" disabled>Chọn trang trại trực thuộc</option>
                            <option v-for="farm in farms" :key="farm.id" :value="farm.id">
                                {{ farm.name }}
                            </option>
                        </select>
                    </div>

                    <!-- ID + Number grid -->
                    <div class="cf-col-grid-2 cf-form-group">
                        <div>
                            <label class="cf-label">Mã định danh (ID) <span class="req">*</span></label>
                            <input v-model="form.id" class="cf-input" placeholder="Ví dụ: barn_a1" maxlength="50" required :disabled="!!form.id && barns.some(b => b.id === form.id)">
                        </div>
                        <div>
                            <label class="cf-label">Số thứ tự chuồng</label>
                            <input v-model.number="form.number" type="number" class="cf-input" placeholder="Ví dụ: 1" min="1">
                        </div>
                    </div>

                    <!-- Name field -->
                    <div class="cf-form-group">
                        <label class="cf-label">Tên mô tả chuồng <span class="req">*</span></label>
                        <input v-model="form.name" class="cf-input" placeholder="Ví dụ: Chuồng Úm Heo Con A1" maxlength="200" required>
                    </div>

                    <!-- Capacity + Area grid -->
                    <div class="cf-col-grid-2 cf-form-group">
                        <div>
                            <label class="cf-label">Sức chứa tối đa (con)</label>
                            <input v-model.number="form.capacity" type="number" class="cf-input" placeholder="Ví dụ: 2500" min="1">
                        </div>
                        <div>
                            <label class="cf-label">Tổng diện tích mặt sàn (m²)</label>
                            <input v-model.number="form.area_sqm" type="number" class="cf-input" placeholder="Ví dụ: 350.5" min="0" step="0.1">
                        </div>
                    </div>

                    <!-- Dimensions 3 cols -->
                    <div class="cf-form-group">
                        <label class="cf-label">Hệ số kích thước bao gồm móng (Chiều mét)</label>
                        <div class="cf-col-grid-3">
                            <input v-model.number="form.length_m" type="number" class="cf-input" placeholder="Chiều dài (m)" min="0" step="0.1">
                            <input v-model.number="form.width_m" type="number" class="cf-input" placeholder="Chiều rộng (m)" min="0" step="0.1">
                            <input v-model.number="form.height_m" type="number" class="cf-input" placeholder="Chiều cao (m)" min="0" step="0.1">
                        </div>
                    </div>

                    <!-- Status select -->
                    <div class="cf-form-group">
                        <label class="cf-label">Trạng thái hạ tầng kỹ thuật</label>
                        <select v-model="form.status" class="cf-modal-select">
                            <option value="active">Đang hoạt động tiêu chuẩn</option>
                            <option value="inactive">Tạm thời ngừng vận hành</option>
                            <option value="maintenance">Đang sửa chữa, phun khử độc định kỳ</option>
                        </select>
                    </div>

                    <!-- Notes -->
                    <div class="cf-form-group">
                        <label class="cf-label">Ghi chú lưu ý cấp bách</label>
                        <textarea v-model="form.note" class="cf-textarea" placeholder="Nhập ghi chú quan trọng cho công nhân nông trại..." rows="2" maxlength="1000"></textarea>
                    </div>

                    <!-- Description -->
                    <div class="cf-form-group">
                        <label class="cf-label">Mô tả cấu trúc chuồng lồng</label>
                        <textarea v-model="form.description" class="cf-textarea" placeholder="Ví dụ: Trang bị quạt thông gió sưởi sàn, vòi phun sương tự động..." rows="2" maxlength="1000"></textarea>
                    </div>

                    <!-- Active checkbox -->
                    <div class="cf-form-group" style="padding-top: 0.25rem;">
                        <label class="cf-checkbox-label">
                            <input v-model="form.active" type="checkbox" class="cf-checkbox">
                            <span class="cf-checkbox-text">Kích hoạt đưa vào quản lý vận hành từ hôm nay</span>
                        </label>
                    </div>

                    <!-- Actions -->
                    <div class="cf-modal-footer">
                        <button type="button" @click="closeModal" class="cf-btn-secondary">
                            Đóng quay lại
                        </button>
                        <button type="submit" class="cf-btn-primary">
                            {{ form.id ? 'Cập nhật chuồng' : 'Khởi tạo ngay' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Delete Confirmation Modal -->
        <div v-if="showDeleteConfirm" class="cf-modal-overlay" @click.self="closeDeleteConfirm">
            <div class="cf-modal-box" style="max-width: 25rem; padding: 1.5rem;">
                <div class="cf-text-center">
                    <div class="cf-delete-icon-box">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                    </div>
                    <h3 class="cf-empty-title cf-mb-2">Xác nhận gỡ bỏ chuồng trại?</h3>
                    <p class="cf-delete-desc">
                        Bạn có chắc chắn muốn giải trừ hệ thống của chuồng nuôi <strong>"{{ barnToDelete?.name }}"</strong>? Dữ liệu này sau khi mất sẽ không thể thu hồi.
                    </p>
                    <div v-if="barnToDelete && getBarnCycleInfo(barnToDelete.id).hasActiveCycle" class="cf-warning-callout">
                        🔴 CHÚ Ý: Không cho phép gỡ bỏ chuồng vì hiện vẫn đang tồn tại chu kỳ chăn nuôi đang hoạt động tích cực!
                    </div>
                </div>
                <div class="cf-modal-footer" style="padding: 1rem 0 0 0; background-color: transparent; border-top: none;">
                    <button @click="closeDeleteConfirm" class="cf-btn-secondary">
                        Suy nghĩ lại
                    </button>
                    <button @click="remove" class="cf-btn-danger" :disabled="barnToDelete && getBarnCycleInfo(barnToDelete.id).hasActiveCycle">
                        Đồng ý xóa bỏ
                    </button>
                </div>
            </div>
        </div>
    </div>
    `
};
