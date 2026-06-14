/**
 * Cycles Page V2 - Quản lý đợt nuôi chuyên nghiệp (Phiên bản Thiết kế Cao cấp Đã nâng cấp)
 * - Thống kê nhanh trên cùng dạng Bento Card cao cấp
 * - Tabs phân loại trạng thái lứa nuôi trực quan đi kèm huy hiệu số lượng
 * - Bảng điều khiển Desktop tinh gọn (không lạm dụng màu sắc chói, chữ rõ nét)
 * - Trình bày Mobile tinh xảo dạng luồng thời gian (Timeline) gọn gàng
 * - Biểu mẫu khởi tạo và kết thúc đợt nuôi phân chia bố cục chuẩn mực
 */
const { ref, reactive, computed, onMounted } = Vue;

export default{
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
            if (!cycles.value || !Array.isArray(cycles.value)) return [];
            let result = cycles.value;
            if (filterBarn.value) {
                result = result.filter(c => c && c.barn_id == filterBarn.value);
            }
            if (filterStatus.value) {
                result = result.filter(c => c && c.status === filterStatus.value);
            }
            if (searchQuery.value) {
                const q = searchQuery.value.toLowerCase();
                result = result.filter(c => c && c.name?.toLowerCase().includes(q));
            }
            return result;
        });

        const availableBarns = computed(() => {
            if (!barns.value || !Array.isArray(barns.value)) return [];
            return barns.value.filter(b => b && (!hasActiveCycle(b.id) || b.id == form.barn_id));
        });

        // Thống kê tổng quan dựa trên đợt nuôi hoạt động tích cực
        const stats = computed(() => {
            const list = Array.isArray(cycles.value) ? cycles.value : [];
            const active = list.filter(c => c && c.status === 'active');
            const totalBirds = active.reduce((sum, c) => sum + (c.current_count || 0), 0);
            const totalDeaths = active.reduce((sum, c) => {
                const init = c.initial_count || 0;
                const curr = c.current_count || 0;
                const progressDiff = init - curr;
                return sum + (progressDiff > 0 ? progressDiff : 0);
            }, 0);
            const avgMortality = totalBirds > 0 ? (totalDeaths / (totalBirds + totalDeaths) * 100).toFixed(1) : '0.0';
            return {
                activeCount: active.length,
                totalBirds,
                totalDeaths,
                avgMortality
            };
        });

        const activeCyclesCount = computed(() => {
            const list = Array.isArray(cycles.value) ? cycles.value : [];
            return list.filter(c => c && c.status === 'active').length;
        });

        const closedCyclesCount = computed(() => {
            const list = Array.isArray(cycles.value) ? cycles.value : [];
            return list.filter(c => c && c.status === 'closed').length;
        });

        // ── Methods ───────────────────────────────────
        async function loadCycles() {
            loading.value = true;
            try {
                cycles.value = await API.cycles.list().catch(() => []);
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast('Không thể tải danh sách đợt nuôi: ' + e.message, 'error');
                } else {
                    console.error('Không thể tải đợt nuôi:', e);
                }
            }
            loading.value = false;
        }

        async function loadBarnsAndFarms() {
            try {
                const barnsCall = API.barns.list().catch(() => []);
                const farmsCall = API.farms.list().catch(() => []);
                [barns.value, farms.value] = await Promise.all([barnsCall, farmsCall]);
            } catch (e) {
                console.error('Hệ thống thất bại tải dữ liệu phụ trợ chuồng/trang trại:', e);
            }
        }

        function getBarnName(barnId) {
            if (!barns.value || !Array.isArray(barns.value)) return barnId || '-';
            const b = barns.value.find(x => x && x.id == barnId);
            return b?.name || barnId || '-';
        }

        function getFarmName(barnId) {
            if (!barns.value || !Array.isArray(barns.value)) return '-';
            const b = barns.value.find(x => x && x.id == barnId);
            if (b && b.farm_name) return b.farm_name;
            if (b && b.farm_id && farms.value) {
                const f = farms.value.find(x => x && x.id === b.farm_id);
                return f?.name || '-';
            }
            return '-';
        }

        function hasActiveCycle(barnId) {
            if (!cycles.value || !Array.isArray(cycles.value)) return false;
            return cycles.value.some(c =>
                c && (c.barn_id == barnId || c.barn_id === barnId) && c.status === 'active'
            );
        }

        function getDayAge(startDate) {
            if (!startDate) return '-';
            const start = new Date(startDate);
            const now = new Date();
            start.setHours(0, 0, 0, 0);
            now.setHours(0, 0, 0, 0);
            const diffTime = now.getTime() - start.getTime();
            const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            return days >= 0 ? days : 0;
        }

        function getMortalityRate(c) {
            if (!c || !c.initial_count) return '-';
            const dead = (c.initial_count - (c.current_count || 0));
            if (dead <= 0) return '0.0%';
            const rate = (dead / c.initial_count * 100).toFixed(1);
            return rate + '%';
        }

        function setFilterStatus(status) {
            filterStatus.value = status;
        }

        function openForm() {
            const freeBarn = availableBarns.value.find(b => b && !hasActiveCycle(b.id));
            form.barn_id = freeBarn ? freeBarn.id : (barns.value.length > 0 ? barns.value[0].id : '');
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
                if (typeof showToast === 'function') showToast('Vui lòng lựa chọn chuồng chăn nuôi chủ quản', 'error');
                return;
            }
            if (!form.initial_count || form.initial_count <= 0) {
                if (typeof showToast === 'function') showToast('Số lượng đàn nhập chuồng ban đầu phải lớn hơn 0', 'error');
                return;
            }
            if (!form.start_date) {
                if (typeof showToast === 'function') showToast('Ngày bắt đầu ghi nhận là bắt buộc', 'error');
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
                if (typeof showToast === 'function') showToast('Đã khởi tạo đợt/lứa nuôi thành công vào hệ thống! 🌱');
                closeModal();
                await Promise.all([loadCycles(), loadBarnsAndFarms()]);
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
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
                if (typeof showToast === 'function') showToast('Ngày kết thúc chu kỳ nuôi phải lớn hơn hoặc bằng ngày bắt đầu', 'error');
                return;
            }

            try {
                await API.cycles.close(cycleToClose.value.id, {
                    end_date: closeForm.end_date,
                    notes: closeForm.notes || undefined,
                    force: closeForm.force
                });
                if (typeof showToast === 'function') showToast('Đã khóa sổ kết thúc đợt nuôi thành công! ✅');
                closeCloseModal();
                await Promise.all([loadCycles(), loadBarnsAndFarms()]);
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        function fmtNum(val) {
            if (val === undefined || val === null) return '0';
            return Number(val).toLocaleString('vi-VN');
        }

        function fmtDate(dateStr) {
            if (!dateStr) return '-';
            return new Date(dateStr).toLocaleDateString('vi-VN');
        }

        // ── Lifecycle ─────────────────────────────────
        onMounted(async () => {
            await Promise.all([loadCycles(), loadBarnsAndFarms()]);
        });

        // ── Template Return ───────────────────────────
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
            stats,
            activeCyclesCount,
            closedCyclesCount,
            loadCycles,
            loadBarnsAndFarms,
            getBarnName,
            getFarmName,
            hasActiveCycle,
            getDayAge,
            getMortalityRate,
            setFilterStatus,
            openForm,
            closeModal,
            save,
            openCloseModal,
            closeCloseModal,
            confirmClose,
            fmtNum,
            fmtDate,
            cycleToClose
        };
    },

    template: `
    <div class="cf-container">
        <!-- Header Section -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">Quản lý Đợt nuôi</h1>
                    <p class="cf-subtitle">Quản lý vòng đời gia cầm, kiểm soát chỉ số sinh trưởng và tỷ lệ hao hụt</p>
                </div>
            </div>
            <button @click="openForm" class="cf-btn-primary">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.375rem;">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Tạo đợt nuôi mới
            </button>
        </div>

        <!-- Bento Overview Statistics Panel -->
        <div class="cf-stats-grid">
            <div class="cf-stat-card">
                <span class="cf-stat-label">Đợt hoạt động</span>
                <div class="cf-stat-val-row">
                    <span class="cf-stat-val val-emerald">{{ stats.activeCount }}</span>
                    <span class="cf-stat-unit">lứa nuôi</span>
                </div>
                <div class="cf-stat-footer">
                    <span class="cf-stat-footer-dot pulse"></span>
                    Hệ thống cấp dưỡng tự động sẵn sàng
                </div>
            </div>

            <div class="cf-stat-card">
                <span class="cf-stat-label">Tổng đàn thực tế</span>
                <div class="cf-stat-val-row">
                    <span class="cf-stat-val val-blue">{{ fmtNum(stats.totalBirds) }}</span>
                    <span class="cf-stat-unit">con</span>
                </div>
                <p class="cf-stat-footer">Ghi nhận đang nuôi tích cực ngoài sàn</p>
            </div>

            <div class="cf-stat-card">
                <span class="cf-stat-label">Hao hụt lâm sàng</span>
                <div class="cf-stat-val-row">
                    <span class="cf-stat-val val-rose">{{ fmtNum(stats.totalDeaths) }}</span>
                    <span class="cf-stat-unit">con</span>
                </div>
                <p class="cf-stat-footer">Giảm bớt so với lứa ban đầu</p>
            </div>

            <div class="cf-stat-card">
                <span class="cf-stat-label">Hao hụt bình quân</span>
                <div class="cf-stat-val-row">
                    <span class="cf-stat-val val-amber">{{ stats.avgMortality }}%</span>
                    <span class="cf-stat-unit">toàn đàn</span>
                </div>
                <p class="cf-stat-footer" :class="parseFloat(stats.avgMortality) > 5 ? 'status-warning' : ''">
                    {{ parseFloat(stats.avgMortality) > 5 ? '⚠️ Vượt ngưỡng an toàn kỹ thuật (5%)' : '✓ Ở ngưỡng cực kỳ an toàn' }}
                </p>
            </div>
        </div>

        <!-- Filter Controls Bar -->
        <div class="cf-filter-bar">
            <!-- Barn Selector Dropdown -->
            <div class="cf-select-wrapper">
                <span class="cf-select-icon-left">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                </span>
                <select v-model="filterBarn" class="cf-select">
                    <option value="">🌿 Tất cả chuồng nuôi</option>
                    <option v-for="b in barns" :key="b.id" :value="b.id">
                        🏡 {{ b.name }}
                    </option>
                </select>
                <span class="cf-select-icon-right">▼</span>
            </div>

            <!-- Search Field Box -->
            <div class="cf-search-wrapper">
                <span class="cf-search-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                </span>
                <input v-model="searchQuery" type="text" placeholder="Tìm theo tên đợt chăn nuôi..." class="cf-search-input">
            </div>

            <div class="cf-badge-indicator">
                <span class="cf-badge-dot"></span>
                <span>Tìm thấy <b>{{ filteredCycles.length }}</b> lứa chăn nuôi</span>
            </div>
        </div>

        <!-- Tab Categories Status Switcher -->
        <div class="cf-tabs">
            <button @click="setFilterStatus('')"
                :class="{ active: filterStatus === '' }"
                class="cf-tab-btn">
                Tất cả đợt nuôi
                <span class="cf-tab-btn-badge">{{ cycles.length }}</span>
            </button>
            <button @click="setFilterStatus('active')"
                :class="{ active: filterStatus === 'active', 'tab-emerald': true }"
                class="cf-tab-btn">
                🔄 Đang nuôi dưỡng
                <span class="cf-tab-btn-badge">{{ activeCyclesCount }}</span>
            </button>
            <button @click="setFilterStatus('closed')"
                :class="{ active: filterStatus === 'closed' }"
                class="cf-tab-btn">
                ✅ Đã kết thúc chu kỳ
                <span class="cf-tab-btn-badge">{{ closedCyclesCount }}</span>
            </button>
        </div>

        <!-- General Loader Grid -->
        <div v-if="loading" class="cf-loading-box">
            <div class="cf-spinner"></div>
            <p class="cf-loading-text">Hệ thống đang đồng bộ dữ liệu nông trại...</p>
        </div>

        <!-- Standard Empty Database State -->
        <div v-else-if="cycles.length === 0" class="cf-empty-state">
            <div class="cf-empty-icon-box">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
            </div>
            <h3 class="cf-empty-title">Chưa ghi nhận đợt chăn nuôi nào</h3>
            <p class="cf-empty-desc">
                Hệ thống chưa tìm thấy chu kỳ nuôi gia cầm hoạn động trên cơ sở dữ liệu. Bắt đầu bằng cách tạo mới lứa nuôi.
            </p>
            <button @click="openForm" class="cf-btn-primary">
                + Tạo đợt nuôi đầu tiên
            </button>
        </div>

        <!-- Filter No Results Found State -->
        <div v-else-if="filteredCycles.length === 0" class="cf-empty-state">
            <div class="cf-empty-icon-box">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
            </div>
            <h3 class="cf-empty-title">Không tìm thấy lứa nuôi phù hợp</h3>
            <p class="cf-empty-desc">Thử đặt lại tham số lọc hoặc đổi chuồng quan sát.</p>
            <button @click="filterStatus = ''; filterBarn = ''; searchQuery = ''" class="cf-empty-reset">
                Khôi phục mặc định bộ lọc
            </button>
        </div>

        <!-- Table Grid List -->
        <div v-else>
            <!-- Desktop Layout Table View -->
            <div class="hidden md:block cf-table-container">
                <table class="cf-table">
                    <thead class="cf-table-thead">
                        <tr>
                            <th class="cf-table-th">Tên Đợt Nuôi</th>
                            <th class="cf-table-th">Chuồng nuôi</th>
                            <th class="cf-table-th">Loại Giống</th>
                            <th class="cf-table-th">Ngày Khởi Tạo</th>
                            <th class="cf-table-th text-right">Số Lượng Lũy Kế</th>
                            <th class="cf-table-th text-center">Tuổi Đời</th>
                            <th class="cf-table-th text-center">Độ Hao Hụt</th>
                            <th class="cf-table-th text-center">Hành vi</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="c in filteredCycles" :key="c.id" class="cf-table-tr">
                            <td class="cf-table-td">
                                <div class="cf-primary-text">{{ c.name || 'Đợt nuôi #' + c.id }}</div>
                                <div class="cf-secondary-text">Mã: {{ c.code || c.id }}</div>
                            </td>
                            <td class="cf-table-td">
                                <div class="cf-primary-text">🏡 {{ getBarnName(c.barn_id) }}</div>
                                <div class="cf-secondary-text">{{ getFarmName(c.barn_id) }}</div>
                            </td>
                            <td class="cf-table-td"><span class="cf-breed-tag">🧬 {{ c.breed || '-' }}</span></td>
                            <td class="cf-table-td"><span class="cf-date-text">{{ fmtDate(c.start_date) }}</span></td>
                            <td class="cf-table-td text-right">
                                <div class="cf-count-text-row">
                                    <span class="cf-count-val">{{ fmtNum(c.current_count || c.initial_count) }}</span>
                                    <span class="cf-count-slash">/</span>
                                    <span class="cf-count-total">{{ fmtNum(c.initial_count) }} con</span>
                                </div>
                            </td>
                            <td class="cf-table-td text-center">
                                <span v-if="c.status === 'active'" class="cf-age-pill">
                                    🌱 {{ getDayAge(c.start_date) }} ngày
                                </span>
                                <span v-else class="cf-age-text-plain">{{ getDayAge(c.start_date) }} ngày tuổi</span>
                            </td>
                            <td class="cf-table-td text-center">
                                <span :class="{ 'cf-mortality-badge': true, 'critical': parseFloat(getMortalityRate(c)) > 5 }">
                                    {{ getMortalityRate(c) }}
                                </span>
                            </td>
                            <td class="cf-table-td">
                                <div class="cf-row-actions-flex">
                                    <button v-if="c.status === 'active'" @click="openCloseModal(c)" class="cf-btn-close-cycle">
                                        Khóa sổ / Kết thúc
                                    </button>
                                    <span v-else class="cf-done-text">
                                        ✓ Hoàn thành
                                    </span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Mobile View responsive cards stack layout -->
            <div class="md:hidden cf-mobile-stack">
                <div v-for="c in filteredCycles" :key="c.id" class="cf-mobile-card">
                    <div class="cf-mobile-card-header">
                        <div class="cf-mobile-card-row-top">
                            <div class="cf-mobile-card-symbol" :class="{ 'active': c.status === 'active' }">
                                🔄
                            </div>
                            <div>
                                <div class="cf-primary-text">{{ c.name || 'Lứa nuôi #' + c.id }}</div>
                                <div class="cf-secondary-text">🏡 {{ getBarnName(c.barn_id) }}</div>
                            </div>
                        </div>
                        <span v-if="c.status === 'active'" class="cf-mobile-badge-state active">Đang nuôi</span>
                        <span v-else class="cf-mobile-badge-state closed">Đã đóng</span>
                    </div>

                    <!-- Layout grid for mobile details metrics -->
                    <div class="cf-mobile-stats-grid">
                        <div class="cf-mobile-stat-col">
                            <div class="cf-mobile-stat-lbl">Hiện có</div>
                            <div class="cf-mobile-stat-val">{{ fmtNum(c.current_count || c.initial_count) }}</div>
                        </div>
                        <div class="cf-mobile-stat-col">
                            <div class="cf-mobile-stat-lbl">Ngày tuổi</div>
                            <div class="cf-mobile-stat-val val-blue">{{ getDayAge(c.start_date) }}</div>
                        </div>
                        <div class="cf-mobile-stat-col">
                            <div class="cf-mobile-stat-lbl">Chết lọc</div>
                            <div class="cf-mobile-stat-val" :class="{ 'val-rose': parseFloat(getMortalityRate(c)) > 5 }">{{ getMortalityRate(c) }}</div>
                        </div>
                    </div>

                    <div class="cf-mobile-details-list">
                        <div class="cf-mobile-detail-row">
                            <span>🧬 Giống:</span>
                            <span class="cf-mobile-detail-val">{{ c.breed || '-' }}</span>
                        </div>
                        <div class="cf-mobile-detail-row">
                            <span>📅 Bắt đầu:</span>
                            <span class="cf-mobile-detail-val val-mono">{{ fmtDate(c.start_date) }}</span>
                        </div>
                        <div v-if="c.end_date" class="cf-mobile-detail-row">
                            <span>🚪 Kết thúc:</span>
                            <span class="cf-mobile-detail-val val-mono">{{ fmtDate(c.end_date) }}</span>
                        </div>
                    </div>

                    <button v-if="c.status === 'active'" @click="openCloseModal(c)" class="cf-mobile-card-btn">
                        Kết thúc chu kỳ nuôi
                    </button>
                </div>
            </div>
        </div>

        <!-- TELEPORTED FORM MODAL: START NEW CYCLE -->
        <teleport to="body">
            <div v-if="showModal" class="cf-modal-overlay" @click.self="closeModal">
                <div class="cf-modal-box">
                    <!-- Header -->
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                            </div>
                            <h3 class="cf-modal-title">Khởi tạo đợt/lứa nuôi mới</h3>
                        </div>
                        <button @click="closeModal" class="cf-modal-close-btn">✕</button>
                    </div>

                    <!-- Body -->
                    <form @submit.prevent="save">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">
                                    Chuồng đích tiếp nhận <span class="req">*</span>
                                </label>
                                <select v-model="form.barn_id" class="cf-modal-select" required>
                                    <option value="" disabled>--- Chọn chuồng chăn nuôi chuẩn danh mục ---</option>
                                    <option v-for="b in availableBarns" :key="b.id" :value="b.id">
                                        🏡 {{ b.name }} {{ hasActiveCycle(b.id) ? '(đang nuôi lứa phụ)' : '' }}
                                    </option>
                                </select>
                                <p v-if="form.barn_id && hasActiveCycle(form.barn_id)" class="cf-alert-message">
                                    ⚠️ Chuồng này hiện có một đợt nuôi chưa khóa sổ, xin thận trọng!
                                </p>
                            </div>

                            <div class="cf-form-group">
                                <label class="cf-label">Tên đợt gọi nhớ</label>
                                <input v-model="form.name" class="cf-input" placeholder="Ví dụ: Lứa gà ta thả đồi T4/2026">
                                <p class="cf-help-text">Để trống hệ thống sẽ tự sinh mã định danh</p>
                            </div>

                            <div class="cf-form-group">
                                <label class="cf-label">Loại gà giống / giống loài</label>
                                <input v-model="form.breed" class="cf-input" placeholder="Heo Landrace, Gà Tam Hoàng, Gà Úm Ri 1...">
                            </div>

                            <div class="cf-form-grid-2">
                                <div class="cf-form-group">
                                    <label class="cf-label">
                                        Quy mô nhập đàn <span class="req">*</span>
                                    </label>
                                    <input v-model.number="form.initial_count" type="number" class="cf-input" placeholder="Ví dụ: 1200" min="1" required>
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">
                                        Ngày bắt đầu nuôi <span class="req">*</span>
                                    </label>
                                    <input v-model="form.start_date" type="date" class="cf-input" required>
                                </div>
                            </div>
                        </div>

                        <!-- Footer actions -->
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeModal" class="cf-btn-secondary">Huỷ</button>
                            <button type="submit" class="cf-btn-primary">Khởi tạo lứa nuôi</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

        <!-- TELEPORTED FORM MODAL: CLOSE / END ACTIVE CYCLE -->
        <teleport to="body">
            <div v-if="showCloseModal" class="cf-modal-overlay" @click.self="closeCloseModal">
                <div class="cf-modal-box">
                    <!-- Header -->
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #fef3c7; color: #d97706;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            </div>
                            <h3 class="cf-modal-title">Xác nhận kết thúc đợt chăn nuôi</h3>
                        </div>
                        <button @click="closeCloseModal" class="cf-modal-close-btn">✕</button>
                    </div>

                    <!-- Content -->
                    <div v-if="cycleToClose">
                        <div class="cf-modal-body" style="padding-bottom: 0;">
                            <div class="cf-subinfo-box">
                                <div class="cf-subinfo-title">{{ cycleToClose.name || 'Đợt nuôi #' + cycleToClose.id }}</div>
                                <div class="cf-subinfo-meta">Chuồng nuôi hiện diện: <strong>🏡 {{ getBarnName(cycleToClose.barn_id) }}</strong></div>
                                <div class="cf-subinfo-grid-2">
                                    <div>• Khởi thủy: <strong>{{ fmtNum(cycleToClose.initial_count) }} con</strong></div>
                                    <div>• Hiện trạng: <strong>{{ fmtNum(cycleToClose.current_count) }} con</strong></div>
                                    <div>• Chu kỳ tuổi: <strong>{{ getDayAge(cycleToClose.start_date) }} ngày</strong></div>
                                    <div>• Hao hụt tỷ lệ: <strong :class="{ 'text-rose-600': parseFloat(getMortalityRate(cycleToClose)) > 5 }">{{ getMortalityRate(cycleToClose) }}</strong></div>
                                </div>
                            </div>
                        </div>

                        <form @submit.prevent="confirmClose">
                            <div class="cf-modal-body" style="padding-top: 1rem;">
                                <div class="cf-form-group">
                                    <label class="cf-label">
                                        Ngày xuất chuồng kết lứa <span class="req">*</span>
                                    </label>
                                    <input v-model="closeForm.end_date" type="date" class="cf-input" required>
                                </div>

                                <div class="cf-form-group">
                                    <label class="cf-label">Ghi chú xuất chuồng</label>
                                    <textarea v-model="closeForm.notes" class="cf-textarea" rows="3" placeholder="Sản lượng xuất đạt kết quả cực ưu thế, cân nặng đều..."></textarea>
                                </div>

                                <div class="cf-form-group" style="padding-top: 0.25rem;">
                                    <label for="force-prop" class="cf-checkbox-label">
                                        <input v-model="closeForm.force" type="checkbox" id="force-prop" class="cf-checkbox">
                                        <span class="cf-checkbox-text">Bỏ qua cảnh báo hệ thống kiểm tra cho ăn</span>
                                    </label>
                                    <p class="cf-help-text" style="color: #94a3b8; padding-left: 1.625rem;">Chỉ kích hoạt khi đợt nuôi được chốt dữ liệu khẩn cấp.</p>
                                </div>
                            </div>

                            <!-- Footer actions -->
                            <div class="cf-modal-footer">
                                <button type="button" @click="closeCloseModal" class="cf-btn-secondary">Bỏ qua</button>
                                <button type="submit" class="cf-btn-danger">Xác nhận đóng sổ</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </teleport>
    </div>
    `
};
