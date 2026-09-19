/**
 * Brooder Profile Detail Page - Sửa hồ sơ úm (Phase 2).
 *
 * Route prop `id` → loads profile + nested schedules.
 *   - Header: name + code + active/inactive + actions (Sửa hồ sơ, Mô phỏng, Xóa)
 *   - Schedule table: stage_order, day_range, setpoint, heater_limit, humidity,
 *     night_boost, notes; edit/delete per row
 *   - "Thêm giai đoạn" button → modal
 *   - Read-only safety envelope panel
 *   - "Mô phỏng" → navigates to /brooder/profiles/:id/simulator
 */
const { ref, reactive, computed, onMounted } = Vue;

export default {
    props: ['id'],
    setup(props) {
        // ── State ──────────────────────────────────────────
        const profile = ref(null);
        const loading = ref(true);
        const refreshing = ref(false);
        const submitting = ref(false);

        const showEditProfileModal = ref(false);
        const showAddStageModal = ref(false);
        const showEditStageModal = ref(false);
        const showDeleteProfileConfirm = ref(false);
        const editingStage = ref(null);

        const profileForm = reactive({
            name: '',
            species: '',
            description: '',
            emergency_cutoff_temp: 35.1,
            emergency_release_temp: 34.6,
            min_ambient_temp: 5.0,
            is_active: true,
        });

        const stageForm = reactive({
            stage_order: 1,
            day_range_start: 1,
            day_range_end: 7,
            setpoint_target: 33.0,
            heater_zone_limit: 35.0,
            humidity_min_pct: 60,
            humidity_max_pct: 70,
            night_boost_offset: 0.5,
            notes: '',
        });

        // ── Computed ───────────────────────────────────────
        const sortedSchedules = computed(() => {
            if (!profile.value || !profile.value.schedules) return [];
            return [...profile.value.schedules].sort((a, b) => a.stage_order - b.stage_order);
        });

        // Heater limit exceeding firmware cap? Show warning chip.
        const exceedsFirmwareCap = computed(() => {
            if (!profile.value || !profile.value.schedules) return false;
            return profile.value.schedules.some(s => s.heater_zone_limit > 35.1);
        });

        // ── Methods ────────────────────────────────────────
        async function loadProfile() {
            if (profile.value === null) {
                loading.value = true;
            } else {
                refreshing.value = true;
            }
            try {
                profile.value = await API.brooderProfiles.get(Number(props.id));
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast('Không tải được hồ sơ: ' + e.message, 'error');
                }
                profile.value = null;
            }
            loading.value = false;
            refreshing.value = false;
        }

        function openEditProfile() {
            if (!profile.value) return;
            profileForm.name = profile.value.name || '';
            profileForm.species = profile.value.species || '';
            profileForm.description = profile.value.description || '';
            profileForm.emergency_cutoff_temp = profile.value.safety.emergency_cutoff_temp;
            profileForm.emergency_release_temp = profile.value.safety.emergency_release_temp;
            profileForm.min_ambient_temp = profile.value.safety.min_ambient_temp;
            profileForm.is_active = profile.value.is_active;
            showEditProfileModal.value = true;
        }

        function closeEditProfile() {
            showEditProfileModal.value = false;
        }

        async function submitEditProfile() {
            if (!profileForm.name.trim()) {
                if (typeof showToast === 'function') {
                    showToast('Vui lòng nhập tên', 'error');
                }
                return;
            }
            submitting.value = true;
            try {
                const payload = {
                    name: profileForm.name.trim(),
                    species: profileForm.species.trim() || null,
                    description: profileForm.description.trim() || null,
                    is_active: profileForm.is_active,
                    safety: {
                        emergency_cutoff_temp: Number(profileForm.emergency_cutoff_temp),
                        emergency_release_temp: Number(profileForm.emergency_release_temp),
                        min_ambient_temp: Number(profileForm.min_ambient_temp),
                    },
                };
                await API.brooderProfiles.update(Number(props.id), payload);
                if (typeof showToast === 'function') {
                    showToast('Đã cập nhật hồ sơ ✔️');
                }
                closeEditProfile();
                await loadProfile();
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast(e.message, 'error');
                }
            }
            submitting.value = false;
        }

        function openAddStage() {
            // Pre-fill stage_order = max(existing) + 1
            const next = (profile.value?.schedules?.length || 0) + 1;
            stageForm.stage_order = next;
            // Pre-fill day_range_start = last stage's end + 1
            if (sortedSchedules.value.length > 0) {
                const last = sortedSchedules.value[sortedSchedules.value.length - 1];
                stageForm.day_range_start = (last.day_range_end || 0) + 1;
            } else {
                stageForm.day_range_start = 1;
            }
            stageForm.day_range_end = Math.min(stageForm.day_range_start + 6, 999);
            stageForm.setpoint_target = 30.0;
            stageForm.heater_zone_limit = 32.0;
            stageForm.humidity_min_pct = 55;
            stageForm.humidity_max_pct = 65;
            stageForm.night_boost_offset = 0.0;
            stageForm.notes = '';
            showAddStageModal.value = true;
        }

        function closeAddStage() {
            showAddStageModal.value = false;
        }

        async function submitAddStage() {
            if (stageForm.day_range_start > stageForm.day_range_end) {
                if (typeof showToast === 'function') {
                    showToast('Ngày bắt đầu phải ≤ ngày kết thúc', 'error');
                }
                return;
            }
            submitting.value = true;
            try {
                const payload = {
                    stage_order: Number(stageForm.stage_order),
                    day_range_start: Number(stageForm.day_range_start),
                    day_range_end: Number(stageForm.day_range_end),
                    setpoint_target: Number(stageForm.setpoint_target),
                    heater_zone_limit: Number(stageForm.heater_zone_limit),
                    humidity_min_pct: stageForm.humidity_min_pct !== null && stageForm.humidity_min_pct !== '' ? Number(stageForm.humidity_min_pct) : null,
                    humidity_max_pct: stageForm.humidity_max_pct !== null && stageForm.humidity_max_pct !== '' ? Number(stageForm.humidity_max_pct) : null,
                    night_boost_offset: Number(stageForm.night_boost_offset),
                    notes: stageForm.notes.trim() || null,
                };
                await API.brooderProfiles.addStage(Number(props.id), payload);
                if (typeof showToast === 'function') {
                    showToast('Đã thêm giai đoạn ✔️');
                }
                closeAddStage();
                await loadProfile();
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast(e.message, 'error');
                }
            }
            submitting.value = false;
        }

        function openEditStage(stage) {
            editingStage.value = stage;
            stageForm.stage_order = stage.stage_order;
            stageForm.day_range_start = stage.day_range_start;
            stageForm.day_range_end = stage.day_range_end;
            stageForm.setpoint_target = stage.setpoint_target;
            stageForm.heater_zone_limit = stage.heater_zone_limit;
            stageForm.humidity_min_pct = stage.humidity_min_pct ?? '';
            stageForm.humidity_max_pct = stage.humidity_max_pct ?? '';
            stageForm.night_boost_offset = stage.night_boost_offset;
            stageForm.notes = stage.notes || '';
            showEditStageModal.value = true;
        }

        function closeEditStage() {
            showEditStageModal.value = false;
            editingStage.value = null;
        }

        async function submitEditStage() {
            if (!editingStage.value) return;
            submitting.value = true;
            try {
                const payload = {
                    stage_order: Number(stageForm.stage_order),
                    day_range_start: Number(stageForm.day_range_start),
                    day_range_end: Number(stageForm.day_range_end),
                    setpoint_target: Number(stageForm.setpoint_target),
                    heater_zone_limit: Number(stageForm.heater_zone_limit),
                    humidity_min_pct: stageForm.humidity_min_pct !== '' ? Number(stageForm.humidity_min_pct) : null,
                    humidity_max_pct: stageForm.humidity_max_pct !== '' ? Number(stageForm.humidity_max_pct) : null,
                    night_boost_offset: Number(stageForm.night_boost_offset),
                    notes: stageForm.notes.trim() || null,
                };
                await API.brooderProfiles.updateStage(
                    Number(props.id), editingStage.value.id, payload
                );
                if (typeof showToast === 'function') {
                    showToast('Đã cập nhật giai đoạn ✔️');
                }
                closeEditStage();
                await loadProfile();
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast(e.message, 'error');
                }
            }
            submitting.value = false;
        }

        async function deleteStage(stage) {
            if (!confirm(`Xóa giai đoạn ${stage.stage_order} (ngày ${stage.day_range_start}-${stage.day_range_end})?`)) return;
            try {
                await API.brooderProfiles.deleteStage(Number(props.id), stage.id);
                if (typeof showToast === 'function') {
                    showToast('Đã xóa giai đoạn');
                }
                await loadProfile();
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast(e.message, 'error');
                }
            }
        }

        function confirmDeleteProfile() {
            showDeleteProfileConfirm.value = true;
        }

        function closeDeleteProfile() {
            showDeleteProfileConfirm.value = false;
        }

        async function deleteProfile() {
            try {
                await API.brooderProfiles.delete(Number(props.id), false);
                if (typeof showToast === 'function') {
                    showToast('Đã ngưng kích hoạt hồ sơ');
                }
                window.location.hash = '#/brooder/profiles';
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast(e.message, 'error');
                }
            }
        }

        function goSimulator() {
            window.location.hash = `#/brooder/profiles/${props.id}/simulator`;
        }

        function goBack() {
            window.location.hash = '#/brooder/profiles';
        }

        // ── Lifecycle ──────────────────────────────────────
        onMounted(async () => {
            await loadProfile();
        });

        return {
            profile,
            loading,
            refreshing,
            submitting,
            sortedSchedules,
            exceedsFirmwareCap,
            showEditProfileModal,
            profileForm,
            openEditProfile,
            closeEditProfile,
            submitEditProfile,
            showAddStageModal,
            stageForm,
            openAddStage,
            closeAddStage,
            submitAddStage,
            showEditStageModal,
            editingStage,
            openEditStage,
            closeEditStage,
            submitEditStage,
            deleteStage,
            showDeleteProfileConfirm,
            confirmDeleteProfile,
            closeDeleteProfile,
            deleteProfile,
            goSimulator,
            goBack,
            fmtNum,
        };
    },

    template: `
    <div class="cf-container">
        <!-- Loading State -->
        <div v-if="loading" class="cf-loading-box">
            <div class="cf-spinner"></div>
            <p class="cf-loading-text">Đang tải hồ sơ...</p>
        </div>

        <!-- Not Found -->
        <div v-else-if="!profile" class="cf-empty-box">
            <h3 class="cf-empty-title">Không tìm thấy hồ sơ</h3>
            <button @click="goBack" class="cf-btn-secondary">← Quay lại</button>
        </div>

        <!-- Content -->
        <div v-else>
            <!-- Back link -->
            <div style="margin-bottom: 1rem;">
                <a href="#/brooder/profiles" style="color: #64748b; text-decoration: none;">
                    ← Quay lại danh sách hồ sơ
                </a>
            </div>

            <!-- Header strip -->
            <div class="cf-header-bar">
                <div class="cf-header-left">
                    <div class="cf-header-icon">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        </svg>
                    </div>
                    <div>
                        <h1 class="cf-h1">{{ profile.name }}</h1>
                        <p class="cf-subtitle">
                            Mã: <b>{{ profile.code }}</b>
                            <span v-if="profile.species"> · {{ profile.species }}</span>
                        </p>
                    </div>
                </div>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <span class="cf-state-pill" :class="profile.is_active ? 'ready' : 'inactive'">
                        {{ profile.is_active ? '● Đang hoạt động' : '○ Ngưng' }}
                    </span>
                    <button @click="openEditProfile" class="cf-btn-secondary">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
                        </svg>
                        Sửa hồ sơ
                    </button>
                    <button @click="goSimulator" class="cf-btn-primary">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        Mô phỏng
                    </button>
                    <button @click="confirmDeleteProfile" class="cf-btn-secondary"
                            style="color: #b91c3c; border-color: #fca5a5;">
                        🗑 Xóa
                    </button>
                </div>
            </div>

            <!-- Firmware cap warning -->
            <div v-if="exceedsFirmwareCap" class="cf-notes-box"
                 style="margin-bottom: 1rem; background: #fef3c7; border-color: #fde68a;">
                <div class="cf-note-urgent">
                    <span class="cf-note-urgent-icon">⚠️</span>
                    <span>
                        <b>Giới hạn heater vượt firmware cap (35.1°C).</b>
                        Một hoặc nhiều giai đoạn có heater_zone_limit &gt; 35.1.
                        Firmware sẽ tự kẹp ở 35.1°C bất kể giá trị này.
                        Cân nhắc chỉnh về ≤ 35.1 để tránh hiểu nhầm về vai trò "an toàn" của con số.
                    </span>
                </div>
            </div>

            <!-- Refresh spinner -->
            <div v-if="refreshing" class="cf-loading-box" style="padding: 1rem;">
                <div class="cf-spinner"></div>
                <p class="cf-loading-text">Đang làm mới...</p>
            </div>

            <!-- Safety Envelope (read-only panel) -->
            <div class="cf-card-content" style="margin-bottom: 1rem;">
                <h3 style="font-size: 0.875rem; font-weight: 700; color: #475569; margin-bottom: 0.75rem;">
                    🛡️ Vỏ bảo vệ an toàn (firmware envelope)
                </h3>
                <div class="cf-metrics-subgrid">
                    <div class="cf-metric-mini-box">
                        <div class="cf-metric-details">
                            <span class="cf-metric-label">Emergency cutoff</span>
                            <span class="cf-metric-value">{{ profile.safety.emergency_cutoff_temp }}°C</span>
                            <small style="color: #94a3b8;">Firmware latch at this temp</small>
                        </div>
                    </div>
                    <div class="cf-metric-mini-box">
                        <div class="cf-metric-details">
                            <span class="cf-metric-label">Emergency release</span>
                            <span class="cf-metric-value">{{ profile.safety.emergency_release_temp }}°C</span>
                            <small style="color: #94a3b8;">Firmware re-engage after drop</small>
                        </div>
                    </div>
                    <div class="cf-metric-mini-box">
                        <div class="cf-metric-details">
                            <span class="cf-metric-label">Min ambient</span>
                            <span class="cf-metric-value">{{ profile.safety.min_ambient_temp }}°C</span>
                            <small style="color: #94a3b8;">Below = forced heat</small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Schedule table -->
            <div class="cf-card-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3 style="font-size: 0.875rem; font-weight: 700; color: #475569;">
                        📅 Lịch theo ngày tuổi ({{ profile.schedules.length }} giai đoạn)
                    </h3>
                    <button @click="openAddStage" class="cf-btn-primary">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                        </svg>
                        Thêm giai đoạn
                    </button>
                </div>

                <div v-if="profile.schedules.length === 0" class="cf-empty-box">
                    <p>Chưa có giai đoạn nào. Bấm <b>Thêm giai đoạn</b> để bắt đầu.</p>
                </div>

                <div v-else style="overflow-x: auto;">
                    <table class="cf-table" style="width: 100%;">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Ngày tuổi</th>
                                <th>Setpoint</th>
                                <th>Heater limit</th>
                                <th>Độ ẩm</th>
                                <th>Boost (+)</th>
                                <th>Ghi chú</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="s in sortedSchedules" :key="s.id">
                                <td><b>{{ s.stage_order }}</b></td>
                                <td>{{ s.day_range_start }} → {{ s.day_range_end >= 999 ? '∞' : s.day_range_end }}</td>
                                <td><b>{{ s.setpoint_target.toFixed(1) }}°C</b></td>
                                <td>
                                    {{ s.heater_zone_limit.toFixed(1) }}°C
                                    <span v-if="s.heater_zone_limit > 35.1"
                                          style="color: #b45309; font-weight: 700; margin-left: 0.25rem;"
                                          title="Vượt firmware cap 35.1°C">⚠</span>
                                </td>
                                <td>
                                    <span v-if="s.humidity_min_pct !== null && s.humidity_max_pct !== null">
                                        {{ s.humidity_min_pct }}–{{ s.humidity_max_pct }}%
                                    </span>
                                    <span v-else style="color: #94a3b8;">—</span>
                                </td>
                                <td>+{{ s.night_boost_offset.toFixed(1) }}°C</td>
                                <td style="max-width: 200px;">
                                    <span v-if="s.notes" style="color: #475569; font-size: 0.875rem;">
                                        {{ s.notes }}
                                    </span>
                                    <span v-else style="color: #94a3b8;">—</span>
                                </td>
                                <td>
                                    <button @click="openEditStage(s)" class="cf-action-btn" title="Sửa">
                                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
                                        </svg>
                                    </button>
                                    <button @click="deleteStage(s)" class="cf-action-btn btn-remove" title="Xóa">
                                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-4.478.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 11.667 0 00-7.5 0"/>
                                        </svg>
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Edit Profile Modal -->
            <div v-if="showEditProfileModal" class="cf-modal-overlay" @click.self="closeEditProfile">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <h3 class="cf-modal-title">Sửa hồ sơ</h3>
                        </div>
                        <button @click="closeEditProfile" class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="submitEditProfile" class="cf-modal-body">
                        <div class="cf-form-group">
                            <label class="cf-label">Tên hiển thị</label>
                            <input v-model="profileForm.name" class="cf-input" required/>
                        </div>
                        <div class="cf-form-group">
                            <label class="cf-label">Giống / loài</label>
                            <input v-model="profileForm.species" class="cf-input"/>
                        </div>
                        <div class="cf-form-group">
                            <label class="cf-label">Mô tả</label>
                            <textarea v-model="profileForm.description" class="cf-textarea" rows="3"></textarea>
                        </div>
                        <div class="cf-form-group">
                            <label class="cf-label">Vỏ bảo vệ an toàn</label>
                            <div class="cf-col-grid-3">
                                <div>
                                    <label class="cf-label-sub">Cutoff (°C)</label>
                                    <input v-model.number="profileForm.emergency_cutoff_temp"
                                           type="number" step="0.1" class="cf-input"
                                           min="10" max="35.1"/>
                                </div>
                                <div>
                                    <label class="cf-label-sub">Release (°C)</label>
                                    <input v-model.number="profileForm.emergency_release_temp"
                                           type="number" step="0.1" class="cf-input"
                                           min="10" max="34.5"/>
                                </div>
                                <div>
                                    <label class="cf-label-sub">Min ambient (°C)</label>
                                    <input v-model.number="profileForm.min_ambient_temp"
                                           type="number" step="0.5" class="cf-input"
                                           min="-10" max="30"/>
                                </div>
                            </div>
                        </div>
                        <div class="cf-form-group" style="padding-top: 0.25rem;">
                            <label class="cf-checkbox-label">
                                <input v-model="profileForm.is_active" type="checkbox" class="cf-checkbox"/>
                                <span class="cf-checkbox-text">Kích hoạt</span>
                            </label>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeEditProfile" class="cf-btn-secondary">Đóng</button>
                            <button type="submit" class="cf-btn-primary" :disabled="submitting">
                                {{ submitting ? 'Đang lưu...' : 'Lưu thay đổi' }}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Add/Edit Stage Modal -->
            <div v-if="showAddStageModal || showEditStageModal" class="cf-modal-overlay"
                 @click.self="showAddStageModal ? closeAddStage() : closeEditStage()">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <h3 class="cf-modal-title">
                                {{ showEditStageModal ? 'Sửa giai đoạn' : 'Thêm giai đoạn' }}
                            </h3>
                        </div>
                        <button @click="showAddStageModal ? closeAddStage() : closeEditStage()"
                                class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="showEditStageModal ? submitEditStage() : submitAddStage()" class="cf-modal-body">
                        <div class="cf-col-grid-2 cf-form-group">
                            <div>
                                <label class="cf-label">Số thứ tự giai đoạn</label>
                                <input v-model.number="stageForm.stage_order" type="number" class="cf-input" min="1" max="20"/>
                            </div>
                            <div>
                                <label class="cf-label">Night boost (°C)</label>
                                <input v-model.number="stageForm.night_boost_offset"
                                       type="number" step="0.1" class="cf-input"
                                       min="0" max="2"/>
                            </div>
                        </div>
                        <div class="cf-col-grid-2 cf-form-group">
                            <div>
                                <label class="cf-label">Ngày bắt đầu</label>
                                <input v-model.number="stageForm.day_range_start"
                                       type="number" class="cf-input" min="1" max="365"/>
                            </div>
                            <div>
                                <label class="cf-label">Ngày kết thúc</label>
                                <input v-model.number="stageForm.day_range_end"
                                       type="number" class="cf-input" min="1" max="999"/>
                                <small style="color: #94a3b8;">999 = vô hạn</small>
                            </div>
                        </div>
                        <div class="cf-col-grid-2 cf-form-group">
                            <div>
                                <label class="cf-label">Setpoint (°C)</label>
                                <input v-model.number="stageForm.setpoint_target"
                                       type="number" step="0.1" class="cf-input"
                                       min="15" max="34.6"/>
                                <small style="color: #94a3b8;">Cap firmware: ≤ 34.6°C</small>
                            </div>
                            <div>
                                <label class="cf-label">Heater zone limit (°C)</label>
                                <input v-model.number="stageForm.heater_zone_limit"
                                       type="number" step="0.1" class="cf-input"
                                       min="15" max="35.1"/>
                                <small style="color: #94a3b8;">Cap firmware: ≤ 35.1°C</small>
                            </div>
                        </div>
                        <div class="cf-col-grid-2 cf-form-group">
                            <div>
                                <label class="cf-label">Độ ẩm min (%)</label>
                                <input v-model.number="stageForm.humidity_min_pct"
                                       type="number" class="cf-input" min="0" max="100"/>
                            </div>
                            <div>
                                <label class="cf-label">Độ ẩm max (%)</label>
                                <input v-model.number="stageForm.humidity_max_pct"
                                       type="number" class="cf-input" min="0" max="100"/>
                            </div>
                        </div>
                        <div class="cf-form-group">
                            <label class="cf-label">Ghi chú</label>
                            <textarea v-model="stageForm.notes" class="cf-textarea" rows="2"
                                      maxlength="500"
                                      placeholder="vd: Tuần 1: bắt đầu mở rèm ban ngày..."></textarea>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button"
                                    @click="showAddStageModal ? closeAddStage() : closeEditStage()"
                                    class="cf-btn-secondary">Đóng</button>
                            <button type="submit" class="cf-btn-primary" :disabled="submitting">
                                {{ submitting ? 'Đang lưu...' : (showEditStageModal ? 'Cập nhật' : 'Thêm') }}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Delete Profile Confirm Modal -->
            <div v-if="showDeleteProfileConfirm" class="cf-modal-overlay" @click.self="closeDeleteProfile">
                <div class="cf-modal-box cf-modal-narrow">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <h3 class="cf-modal-title">Ngưng kích hoạt hồ sơ?</h3>
                        </div>
                        <button @click="closeDeleteProfile" class="cf-modal-close-btn">✕</button>
                    </div>
                    <div class="cf-modal-body">
                        <p style="color: #475569;">
                            Hồ sơ <b>{{ profile.name }}</b> sẽ được đánh dấu ngưng hoạt động
                            (is_active=FALSE). Dữ liệu vẫn còn, có thể kích hoạt lại từ Sửa hồ sơ.
                        </p>
                    </div>
                    <div class="cf-modal-footer">
                        <button @click="closeDeleteProfile" class="cf-btn-secondary">Hủy</button>
                        <button @click="deleteProfile" class="cf-btn-primary"
                                style="background-color: #b91c3c;">Ngưng kích hoạt</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `
};