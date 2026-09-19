/**
 * Brooder Profiles Page - Quản lý hồ sơ sưởi úm (Phase 1).
 *
 * Lists re-usable heating schedules (per breed/strategy) and lets admin
 * create new ones with an inline modal. Stage editing lives on the
 * detail page (brooder-profile-detail.js).
 *
 * UX follows barns.js conventions:
 *   - 3-tier loading: skeleton first load → spinner refresh → button submitting
 *   - Card grid via .cf-cards-grid + .cf-brooder-profile-card
 *   - Modal via .cf-modal-* classes (cf-modal-overlay, cf-modal-box, cf-modal-header…)
 *   - Vietnamese labels
 *   - Toast on success/error via showToast
 */
const { ref, reactive, computed, onMounted } = Vue;

export default {
    setup() {
        // ── State ──────────────────────────────────────────
        const profiles = ref([]);
        const loading = ref(true);
        const refreshing = ref(false);
        const submitting = ref(false);
        const activeOnly = ref(false);
        const searchQuery = ref('');

        const showCreateModal = ref(false);
        const form = reactive({
            code: '',
            name: '',
            species: '',
            description: '',
            emergency_cutoff_temp: 35.1,
            emergency_release_temp: 34.6,
            min_ambient_temp: 5.0,
            is_active: true,
        });

        // ── Computed ───────────────────────────────────────
        const filteredProfiles = computed(() => {
            let result = profiles.value || [];
            if (activeOnly.value) {
                result = result.filter(p => p.is_active);
            }
            if (searchQuery.value.trim()) {
                const q = searchQuery.value.trim().toLowerCase();
                result = result.filter(p =>
                    (p.code || '').toLowerCase().includes(q)
                    || (p.name || '').toLowerCase().includes(q)
                    || (p.species || '').toLowerCase().includes(q)
                );
            }
            return result;
        });

        const stageCount = (p) => Array.isArray(p.schedules) ? p.schedules.length : 0;

        const setpointRange = (p) => {
            if (!p.schedules || !p.schedules.length) return null;
            const sps = p.schedules.map(s => s.setpoint_target);
            return { min: Math.min(...sps), max: Math.max(...sps) };
        };

        const dayAgeRange = (p) => {
            if (!p.schedules || !p.schedules.length) return null;
            const start = Math.min(...p.schedules.map(s => s.day_range_start));
            const endMax = Math.max(...p.schedules.map(s => s.day_range_end));
            const end = endMax >= 999 ? '∞' : endMax;
            return `${start} → ${end}`;
        };

        // ── Methods ────────────────────────────────────────
        async function loadProfiles() {
            if (profiles.value.length === 0) {
                loading.value = true;
            } else {
                refreshing.value = true;
            }
            try {
                profiles.value = await API.brooderProfiles.list(activeOnly.value);
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast('Không tải được hồ sơ: ' + e.message, 'error');
                }
                profiles.value = [];
            }
            loading.value = false;
            refreshing.value = false;
        }

        function openCreateModal() {
            form.code = '';
            form.name = '';
            form.species = '';
            form.description = '';
            form.emergency_cutoff_temp = 35.1;
            form.emergency_release_temp = 34.6;
            form.min_ambient_temp = 5.0;
            form.is_active = true;
            showCreateModal.value = true;
        }

        function closeCreateModal() {
            showCreateModal.value = false;
        }

        async function submitCreate() {
            // Inline validation — pydantic will re-validate server-side too.
            if (!form.code.trim()) {
                if (typeof showToast === 'function') {
                    showToast('Vui lòng nhập mã hồ sơ', 'error');
                }
                return;
            }
            if (!form.name.trim()) {
                if (typeof showToast === 'function') {
                    showToast('Vui lòng nhập tên hiển thị', 'error');
                }
                return;
            }
            if (form.emergency_release_temp >= form.emergency_cutoff_temp) {
                if (typeof showToast === 'function') {
                    showToast('Nhiệt độ release phải NHỎ HƠN cutoff', 'error');
                }
                return;
            }
            submitting.value = true;
            try {
                const payload = {
                    code: form.code.trim(),
                    name: form.name.trim(),
                    species: form.species.trim() || null,
                    description: form.description.trim() || null,
                    is_active: form.is_active,
                    safety: {
                        emergency_cutoff_temp: Number(form.emergency_cutoff_temp),
                        emergency_release_temp: Number(form.emergency_release_temp),
                        min_ambient_temp: Number(form.min_ambient_temp),
                    },
                    schedules: [],   // admin adds stages via detail page
                };
                await API.brooderProfiles.create(payload);
                if (typeof showToast === 'function') {
                    showToast('Đã tạo hồ sơ mới ✔️');
                }
                closeCreateModal();
                await loadProfiles();
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast(e.message, 'error');
                }
            }
            submitting.value = false;
        }

        function goDetail(profile) {
            window.location.hash = `#/brooder/profiles/${profile.id}`;
        }

        // ── Lifecycle ──────────────────────────────────────
        onMounted(async () => {
            await loadProfiles();
        });

        // ── Template bindings ──────────────────────────────
        return {
            profiles,
            loading,
            refreshing,
            submitting,
            activeOnly,
            searchQuery,
            filteredProfiles,
            showCreateModal,
            form,
            stageCount,
            setpointRange,
            dayAgeRange,
            loadProfiles,
            openCreateModal,
            closeCreateModal,
            submitCreate,
            goDetail,
            fmtNum,
        };
    },

    template: `
    <div class="cf-container">
        <!-- Header -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">Hồ sơ sưởi úm</h1>
                    <p class="cf-subtitle">Lịch nhiệt độ theo ngày tuổi cho từng giống gà / chiến lược úm</p>
                </div>
            </div>
            <button @click="openCreateModal" class="cf-btn-primary">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                </svg>
                Tạo hồ sơ mới
            </button>
        </div>

        <!-- Filter Bar -->
        <div class="cf-filter-bar">
            <div class="cf-search-wrapper">
                <span class="cf-search-icon">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                </span>
                <input v-model="searchQuery" type="text" placeholder="Tìm theo mã, tên, giống..." class="cf-search-input"/>
            </div>

            <label class="cf-checkbox-label">
                <input v-model="activeOnly" @change="loadProfiles" type="checkbox" class="cf-checkbox"/>
                <span class="cf-checkbox-text">Chỉ hiển thị đang kích hoạt</span>
            </label>

            <div class="cf-badge-indicator">
                <span class="cf-badge-dot"></span>
                <span>Đang hiển thị <b>{{ filteredProfiles.length }}</b> / {{ profiles.length }} hồ sơ</span>
            </div>
        </div>

        <!-- Refresh spinner (after first load) -->
        <div v-if="refreshing" class="cf-loading-box" style="padding: 1rem;">
            <div class="cf-spinner"></div>
            <p class="cf-loading-text">Đang làm mới...</p>
        </div>

        <!-- Loading State (first load) -->
        <div v-if="loading" class="cf-loading-box">
            <div class="cf-spinner"></div>
            <p class="cf-loading-text">Đang tải xuống danh sách hồ sơ úm...</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="profiles.length === 0" class="cf-empty-box">
            <div class="cf-empty-icon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
            </div>
            <h3 class="cf-empty-title">Chưa có hồ sơ úm nào</h3>
            <p class="cf-empty-desc">Khởi tạo hồ sơ đầu tiên để gán vào đợt nuôi — hệ thống sẽ tự động chọn setpoint theo ngày tuổi.</p>
            <button @click="openCreateModal" class="cf-btn-primary">
                + Khởi tạo hồ sơ đầu tiên
            </button>
        </div>

        <!-- Empty Filtered State -->
        <div v-else-if="filteredProfiles.length === 0" class="cf-empty-box">
            <div class="cf-empty-icon" style="background-color: #f1f5f9; color: #94a3b8;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </div>
            <p class="cf-loading-text">Không có kết quả nào trùng khớp với bộ lọc.</p>
        </div>

        <!-- Profiles Grid -->
        <div v-else class="cf-cards-grid">
            <div v-for="p in filteredProfiles" :key="p.id"
                 @click="goDetail(p)"
                 class="cf-brooder-profile-card"
                 style="cursor: pointer;">

                <!-- Banner -->
                <div class="cf-card-banner" :class="{
                    'active-standard': p.is_active,
                    'inactive-state': !p.is_active
                }"></div>

                <!-- Content -->
                <div class="cf-card-content">
                    <div class="cf-card-top-row">
                        <div class="cf-card-identity">
                            <div class="cf-card-icon-box" :class="{
                                'active-standard': p.is_active,
                                'inactive-state': !p.is_active
                            }">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                                </svg>
                            </div>
                            <div class="min-w-0">
                                <h4 class="cf-card-title">{{ p.name }}</h4>
                                <div class="cf-card-meta-line">
                                    <span>Mã: <b>{{ p.code }}</b></span>
                                    <span v-if="p.species" class="cf-card-meta-bullet">•</span>
                                    <span v-if="p.species">{{ p.species }}</span>
                                </div>
                            </div>
                        </div>

                        <span class="cf-state-pill" :class="p.is_active ? 'ready' : 'inactive'">
                            {{ p.is_active ? 'Hoạt động' : 'Ngưng' }}
                        </span>
                    </div>

                    <!-- Stage summary -->
                    <div class="cf-metrics-subgrid">
                        <div class="cf-metric-mini-box">
                            <div class="cf-metric-subicon">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                                </svg>
                            </div>
                            <div class="cf-metric-details">
                                <span class="cf-metric-label">Giai đoạn</span>
                                <span class="cf-metric-value">{{ stageCount(p) }} gđ</span>
                            </div>
                        </div>

                        <div class="cf-metric-mini-box" v-if="setpointRange(p)">
                            <div class="cf-metric-subicon teal-theme">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6m0 0v-4a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                                </svg>
                            </div>
                            <div class="cf-metric-details">
                                <span class="cf-metric-label">Setpoint</span>
                                <span class="cf-metric-value">
                                    {{ setpointRange(p).min.toFixed(1) }}°–{{ setpointRange(p).max.toFixed(1) }}°C
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Day-age range -->
                    <div v-if="dayAgeRange(p)" class="cf-size-line">
                        <span class="cf-size-line-icon">📅</span>
                        <span>Phủ: ngày tuổi <b class="cf-size-bold">{{ dayAgeRange(p) }}</b></span>
                    </div>

                    <!-- Safety envelope -->
                    <div class="cf-notes-box">
                        <div class="cf-note-desc">
                            <span class="cf-note-desc-icon">🛡️</span>
                            <p class="cf-clamp-2">
                                Cutoff <b>{{ p.safety.emergency_cutoff_temp }}°C</b>
                                · Release <b>{{ p.safety.emergency_release_temp }}°C</b>
                                · Min ambient <b>{{ p.safety.min_ambient_temp }}°C</b>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Create Modal -->
        <div v-if="showCreateModal" class="cf-modal-overlay" @click.self="closeCreateModal">
            <div class="cf-modal-box">
                <div class="cf-modal-header">
                    <div class="cf-modal-header-left">
                        <div class="cf-modal-header-icon">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        </div>
                        <h3 class="cf-modal-title">Tạo hồ sơ úm mới</h3>
                    </div>
                    <button @click="closeCreateModal" class="cf-modal-close-btn">✕</button>
                </div>

                <form @submit.prevent="submitCreate" class="cf-modal-body">
                    <div class="cf-col-grid-2 cf-form-group">
                        <div>
                            <label class="cf-label">Mã hồ sơ <span class="req">*</span></label>
                            <input v-model="form.code" class="cf-input"
                                   placeholder="vd: hill_chicken_standard"
                                   maxlength="64" required pattern=" :"/>
                            <small class="cf-hint">Dùng chữ thường, gạch dưới. Duy nhất trong hệ thống.</small>
                        </div>
                        <div>
                            <label class="cf-label">Tên hiển thị <span class="req">*</span></label>
                            <input v-model="form.name" class="cf-input"
                                   placeholder="vd: Gà thả vườn tiêu chuẩn"
                                   maxlength="128" required/>
                        </div>
                    </div>

                    <div class="cf-form-group">
                        <label class="cf-label">Giống / loài</label>
                        <input v-model="form.species" class="cf-input"
                               placeholder="vd: Gà ta (free-range)"
                               maxlength="64"/>
                    </div>

                    <div class="cf-form-group">
                        <label class="cf-label">Mô tả chiến lược</label>
                        <textarea v-model="form.description" class="cf-textarea"
                                  placeholder="Mô tả ngắn về chiến lược úm, đặc điểm giống, vùng khí hậu..."
                                  rows="2" maxlength="2000"></textarea>
                    </div>

                    <div class="cf-form-group">
                        <label class="cf-label">Vỏ bảo vệ an toàn (firmware envelope)</label>
                        <div class="cf-col-grid-3">
                            <div>
                                <label class="cf-label-sub">Cutoff (°C)</label>
                                <input v-model.number="form.emergency_cutoff_temp"
                                       type="number" step="0.1" class="cf-input"
                                       min="10" max="35.1"/>
                            </div>
                            <div>
                                <label class="cf-label-sub">Release (°C)</label>
                                <input v-model.number="form.emergency_release_temp"
                                       type="number" step="0.1" class="cf-input"
                                       min="10" max="34.5"/>
                            </div>
                            <div>
                                <label class="cf-label-sub">Min ambient (°C)</label>
                                <input v-model.number="form.min_ambient_temp"
                                       type="number" step="0.5" class="cf-input"
                                       min="-10" max="30"/>
                            </div>
                        </div>
                        <small class="cf-hint">
                            Cutoff phải ≤ firmware cap 35.1°C. Release phải nhỏ hơn Cutoff.
                        </small>
                    </div>

                    <div class="cf-form-group" style="padding-top: 0.25rem;">
                        <label class="cf-checkbox-label">
                            <input v-model="form.is_active" type="checkbox" class="cf-checkbox"/>
                            <span class="cf-checkbox-text">Kích hoạt đưa vào sử dụng</span>
                        </label>
                    </div>

                    <div class="cf-modal-footer">
                        <button type="button" @click="closeCreateModal" class="cf-btn-secondary">
                            Đóng
                        </button>
                        <button type="submit" class="cf-btn-primary"
                                :disabled="submitting">
                            {{ submitting ? 'Đang tạo...' : 'Tạo hồ sơ' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `
};