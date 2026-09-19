/**
 * Brooder Profile Simulator Page - Áp dụng thử nghiệm hồ sơ (Phase 2).
 *
 * Route prop `id` → loads profile + active test (if any).
 *   - Profile header (read-only)
 *   - Áp dụng thử panel with 3-checkbox safety gate
 *   - Active test panel with countdown + "Hủy thử nghiệm"
 *   - Live preview: loop stagesResolved across day 1..30, plot setpoint curve
 */
const { ref, reactive, computed, onMounted, onUnmounted } = Vue;

export default {
    props: ['id'],
    setup(props) {
        // ── State ──────────────────────────────────────────
        const profile = ref(null);
        const cycles = ref([]);
        const activeTest = ref(null);

        const previewPoints = ref([]);   // {day, sp_day, sp_night}

        const loading = ref(true);
        const submitting = ref(false);

        const showCancelConfirm = ref(false);

        // Apply form
        const applyForm = reactive({
            cycle_id: null,
            hours: 2,
            note: '',
        });
        const safety = reactive({
            understood_real_barn: false,
            checked_firmware_cap: false,
            will_monitor_manually: false,
        });

        // Tick for countdown — refresh activeTest every 30s
        let tickTimer = null;

        // ── Computed ───────────────────────────────────────
        const safetyGatePassed = computed(() => {
            return safety.understood_real_barn
                && safety.checked_firmware_cap
                && safety.will_monitor_manually;
        });

        const canSubmit = computed(() => {
            return safetyGatePassed.value
                && applyForm.cycle_id
                && Number(applyForm.hours) >= 1
                && Number(applyForm.hours) <= 168
                && !activeTest.value;     // can't apply if one is already active
        });

        const activeCycles = computed(() => {
            return (cycles.value || []).filter(c => c.status === 'active');
        });

        // Countdown: ms until expiry
        const expiresInText = computed(() => {
            if (!activeTest.value || !activeTest.value.expires_at) return '';
            const now = Date.now();
            const exp = new Date(activeTest.value.expires_at).getTime();
            const ms = exp - now;
            if (ms <= 0) return 'Đã hết hạn (đang chờ sweep)';
            const h = Math.floor(ms / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            if (h > 0) return `${h}h ${m}m`;
            if (m > 0) return `${m}m ${s}s`;
            return `${s}s`;
        });

        // ── Methods ────────────────────────────────────────
        async function loadProfile() {
            try {
                profile.value = await API.brooderProfiles.get(Number(props.id));
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast('Không tải được hồ sơ: ' + e.message, 'error');
                }
                profile.value = null;
            }
        }

        async function loadCycles() {
            try {
                const data = await API.cycles.list();
                cycles.value = Array.isArray(data) ? data : [];
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast('Không tải được danh sách đợt nuôi: ' + e.message, 'error');
                }
                cycles.value = [];
            }
        }

        async function loadActiveTest() {
            if (!applyForm.cycle_id) {
                activeTest.value = null;
                return;
            }
            try {
                activeTest.value = await API.brooderProfiles.getTest(Number(applyForm.cycle_id));
            } catch (e) {
                activeTest.value = null;
            }
        }

        async function loadPreview() {
            if (!profile.value) return;
            const pts = [];
            for (let d = 1; d <= 30; d++) {
                try {
                    const day = await API.brooderProfiles.stagesResolved(Number(props.id), d, false);
                    const night = await API.brooderProfiles.stagesResolved(Number(props.id), d, true);
                    pts.push({
                        day: d,
                        sp_day: day.setpoint,
                        sp_night: night.setpoint,
                    });
                } catch (e) {
                    pts.push({ day: d, sp_day: null, sp_night: null });
                }
            }
            previewPoints.value = pts;
        }

        async function submitApply() {
            if (!canSubmit.value) return;
            submitting.value = true;
            try {
                const payload = {
                    cycle_id: Number(applyForm.cycle_id),
                    hours: Number(applyForm.hours),
                    note: applyForm.note.trim() || null,
                };
                await API.brooderProfiles.applyTest(Number(props.id), payload);
                if (typeof showToast === 'function') {
                    showToast('Đã áp dụng thử nghiệm ✔️');
                }
                await loadActiveTest();
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast(e.message, 'error');
                }
            }
            submitting.value = false;
        }

        function confirmCancel() {
            showCancelConfirm.value = true;
        }

        function closeCancelConfirm() {
            showCancelConfirm.value = false;
        }

        async function cancelTest() {
            if (!applyForm.cycle_id) return;
            try {
                await API.brooderProfiles.clearTest(Number(applyForm.cycle_id));
                if (typeof showToast === 'function') {
                    showToast('Đã hủy thử nghiệm');
                }
                activeTest.value = null;
                closeCancelConfirm();
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast(e.message, 'error');
                }
            }
        }

        function onCycleChange() {
            loadActiveTest();
        }

        function fmtCycleLabel(cyc) {
            if (!cyc) return '';
            const barn = cyc.barn_name || '';
            const start = cyc.start_date ? new Date(cyc.start_date).toLocaleDateString('vi-VN') : '';
            const dayAge = cyc.start_date
                ? Math.floor((Date.now() - new Date(cyc.start_date).getTime()) / 86400000) + 1
                : null;
            return `[#${cyc.id}] ${cyc.name || 'Đợt ' + cyc.id}${barn ? ' · ' + barn : ''}`
                + ` (bắt đầu: ${start}${dayAge !== null ? `, ngày ${dayAge}` : ''})`;
        }

        // Preview helpers
        const maxPreview = computed(() => {
            const all = previewPoints.value.flatMap(p => [p.sp_day, p.sp_night]).filter(v => v !== null);
            return all.length ? Math.max(...all) : 36;
        });
        const minPreview = computed(() => {
            const all = previewPoints.value.flatMap(p => [p.sp_day, p.sp_night]).filter(v => v !== null);
            return all.length ? Math.min(...all) - 1 : 18;
        });

        // ── Lifecycle ──────────────────────────────────────
        onMounted(async () => {
            loading.value = true;
            await Promise.all([loadProfile(), loadCycles(), loadPreview()]);
            loading.value = false;
            // Re-render countdown every second
            tickTimer = setInterval(() => {
                // trigger reactivity for expiresInText
                if (activeTest.value) {
                    // mutate a non-reactive timestamp? Just touch the value
                    activeTest.value = { ...activeTest.value };
                }
            }, 1000);
        });

        onUnmounted(() => {
            if (tickTimer) clearInterval(tickTimer);
        });

        return {
            profile,
            cycles,
            activeCycles,
            activeTest,
            previewPoints,
            loading,
            submitting,
            applyForm,
            safety,
            safetyGatePassed,
            canSubmit,
            expiresInText,
            showCancelConfirm,
            maxPreview,
            minPreview,
            loadActiveTest,
            submitApply,
            confirmCancel,
            closeCancelConfirm,
            cancelTest,
            onCycleChange,
            fmtCycleLabel,
            fmtNum,
        };
    },

    template: `
    <div class="cf-container">
        <!-- Loading -->
        <div v-if="loading" class="cf-loading-box">
            <div class="cf-spinner"></div>
            <p class="cf-loading-text">Đang tải...</p>
        </div>

        <!-- Not found -->
        <div v-else-if="!profile" class="cf-empty-box">
            <h3 class="cf-empty-title">Không tìm thấy hồ sơ</h3>
            <a href="#/brooder/profiles" class="cf-btn-secondary">← Quay lại</a>
        </div>

        <!-- Content -->
        <div v-else>
            <!-- Back link -->
            <div style="margin-bottom: 1rem;">
                <a :href="'#/brooder/profiles/' + profile.id"
                   style="color: #64748b; text-decoration: none;">
                    ← Quay lại chi tiết hồ sơ
                </a>
            </div>

            <!-- Profile header (read-only) -->
            <div class="cf-header-bar">
                <div class="cf-header-left">
                    <div class="cf-header-icon">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <div>
                        <h1 class="cf-h1">{{ profile.name }}</h1>
                        <p class="cf-subtitle">
                            Mô phỏng · Mã <b>{{ profile.code }}</b>
                            <span v-if="profile.species"> · {{ profile.species }}</span>
                        </p>
                    </div>
                </div>
                <span class="cf-state-pill" :class="profile.is_active ? 'ready' : 'inactive'">
                    {{ profile.is_active ? '● Hoạt động' : '○ Ngưng' }}
                </span>
            </div>

            <!-- Active Test Banner -->
            <div v-if="activeTest" class="cf-card-content"
                 style="margin-bottom: 1rem; background: #fef3c7; border: 1px solid #fde68a;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <h3 style="font-size: 1rem; font-weight: 700; color: #92400e;">
                            🧪 Đang áp dụng thử nghiệm
                        </h3>
                        <p style="color: #78350f; margin-top: 0.25rem;">
                            <b>{{ activeTest.profile_code || ('Profile #' + activeTest.profile_id) }}</b>
                            · Bắt đầu {{ new Date(activeTest.started_at).toLocaleString('vi-VN') }}
                            · Hết hạn {{ new Date(activeTest.expires_at).toLocaleString('vi-VN') }}
                            <br/>
                            Còn lại: <b>{{ expiresInText }}</b>
                            <span v-if="activeTest.note" style="display: block; margin-top: 0.25rem;">
                                📝 {{ activeTest.note }}
                            </span>
                        </p>
                    </div>
                    <button @click="confirmCancel" class="cf-btn-primary"
                            style="background-color: #b91c3c;">
                        Hủy thử nghiệm
                    </button>
                </div>
            </div>

            <!-- Apply Test Panel -->
            <div class="cf-card-content" style="margin-bottom: 1rem;">
                <h3 style="font-size: 1rem; font-weight: 700; color: #475569; margin-bottom: 0.75rem;">
                    ⚡ Áp dụng thử nghiệm cho một đợt nuôi
                </h3>
                <p style="color: #64748b; font-size: 0.875rem; margin-bottom: 1rem;">
                    Hồ sơ sẽ được áp dụng cho <b>chuồng thật</b> trong khoảng thời gian giới hạn (mặc định 2 giờ, tối đa 168 giờ = 7 ngày).
                    Sau khi hết hạn, hệ thống tự động khôi phục về hồ sơ vĩnh viễn của đợt (nếu có) hoặc lịch SETPOINT_TABLE mặc định.
                </p>

                <div class="cf-col-grid-2 cf-form-group">
                    <div>
                        <label class="cf-label">Đợt nuôi (đang active)</label>
                        <select v-model.number="applyForm.cycle_id" @change="onCycleChange"
                                class="cf-modal-select" :disabled="!!activeTest">
                            <option :value="null" disabled>— Chọn đợt —</option>
                            <option v-for="c in activeCycles" :key="c.id" :value="c.id">
                                {{ fmtCycleLabel(c) }}
                            </option>
                        </select>
                        <small v-if="activeCycles.length === 0" style="color: #b45309;">
                            Chưa có đợt nào đang active. Vào trang Đợt nuôi để khởi tạo.
                        </small>
                    </div>
                    <div>
                        <label class="cf-label">Thời gian áp dụng (giờ)</label>
                        <input v-model.number="applyForm.hours" type="number"
                               class="cf-input" min="1" max="168"
                               :disabled="!!activeTest"/>
                        <small style="color: #94a3b8;">Mặc định 2 giờ. Tối đa 168 giờ (7 ngày).</small>
                    </div>
                </div>

                <div class="cf-form-group">
                    <label class="cf-label">Ghi chú (lý do áp dụng)</label>
                    <textarea v-model="applyForm.note" class="cf-textarea" rows="2"
                              placeholder="vd: Test giảm nhiệt tuần 2 để tiết kiệm điện..."
                              maxlength="500" :disabled="!!activeTest"></textarea>
                </div>

                <!-- Safety gate — 3 mandatory checkboxes -->
                <div class="cf-form-group" style="background: #fef2f2; border: 1px solid #fecaca;
                                                    padding: 1rem; border-radius: 0.5rem; margin-top: 1rem;">
                    <h4 style="font-size: 0.875rem; font-weight: 700; color: #991b1b; margin-bottom: 0.5rem;">
                        🛑 Cam kết an toàn (bắt buộc trước khi áp dụng)
                    </h4>
                    <label class="cf-checkbox-label" style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <input type="checkbox" v-model="safety.understood_real_barn" :disabled="!!activeTest"/>
                        <span style="color: #7f1d1d;">
                            Tôi hiểu hồ sơ sẽ áp dụng cho chuồng <b>THẬT</b> trong
                            <span v-if="applyForm.hours">{{ applyForm.hours }} giờ</span>
                            <span v-else>? giờ</span>.
                        </span>
                    </label>
                    <label class="cf-checkbox-label" style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <input type="checkbox" v-model="safety.checked_firmware_cap" :disabled="!!activeTest"/>
                        <span style="color: #7f1d1d;">
                            Tôi đã kiểm tra setpoint không vượt firmware cap (34.6°C).
                        </span>
                    </label>
                    <label class="cf-checkbox-label" style="display: flex; gap: 0.5rem;">
                        <input type="checkbox" v-model="safety.will_monitor_manually" :disabled="!!activeTest"/>
                        <span style="color: #7f1d1d;">
                            Tôi sẽ theo dõi nhiệt độ thủ công trong suốt thời gian thử.
                        </span>
                    </label>
                </div>

                <div class="cf-modal-footer">
                    <button @click="submitApply" class="cf-btn-primary"
                            :disabled="!canSubmit || submitting">
                        {{ submitting ? 'Đang áp dụng...' : (activeTest ? 'Đã có test đang chạy' : 'Áp dụng') }}
                    </button>
                </div>
            </div>

            <!-- Live preview (simple SVG) -->
            <div class="cf-card-content">
                <h3 style="font-size: 1rem; font-weight: 700; color: #475569; margin-bottom: 0.75rem;">
                    📈 Đường cong setpoint dự kiến (ngày 1-30)
                </h3>
                <p style="color: #64748b; font-size: 0.875rem; margin-bottom: 1rem;">
                    Đường liền = setpoint ban ngày. Đường đứt = setpoint ban đêm (sau khi áp dụng night_boost_offset).
                </p>
                <div style="overflow-x: auto;">
                    <svg :width="900" :height="280" style="background: #f8fafc; border-radius: 0.5rem;
                                                              padding: 1rem;">
                        <!-- Y axis labels -->
                        <g>
                            <text v-for="t in 6" :key="'y' + t"
                                  :x="40" :y="40 + (t - 1) * 35"
                                  font-size="11" fill="#64748b" text-anchor="end">
                                {{ (maxPreview - (t - 1) * ((maxPreview - minPreview) / 5)).toFixed(1) }}°C
                            </text>
                            <line v-for="t in 6" :key="'grid' + t"
                                  :x1="50" :x2="880" :y1="40 + (t - 1) * 35 + 4"
                                  :y2="40 + (t - 1) * 35 + 4"
                                  stroke="#e2e8f0" stroke-dasharray="2,2"/>
                        </g>

                        <!-- Day curve -->
                        <polyline
                            :points="previewPoints.map((p, i) => {
                                const x = 50 + (i / 29) * 830;
                                if (p.sp_day === null) return '';
                                const yPx = maxPreview - p.sp_day;
                                const yRatio = (yPx - minPreview) / (maxPreview - minPreview);
                                return x + ',' + (40 + yRatio * 175);
                            }).join(' ')"
                            fill="none" stroke="#2563eb" stroke-width="2"/>

                        <!-- Night curve (dashed) -->
                        <polyline
                            :points="previewPoints.map((p, i) => {
                                const x = 50 + (i / 29) * 830;
                                if (p.sp_night === null) return '';
                                const yPx = maxPreview - p.sp_night;
                                const yRatio = (yPx - minPreview) / (maxPreview - minPreview);
                                return x + ',' + (40 + yRatio * 175);
                            }).join(' ')"
                            fill="none" stroke="#dc2626" stroke-width="2"
                            stroke-dasharray="4,3"/>

                        <!-- Day labels -->
                        <g>
                            <text v-for="d in [1, 5, 10, 15, 20, 25, 30]" :key="'x' + d"
                                  :x="50 + ((d - 1) / 29) * 830" :y="260"
                                  font-size="10" fill="#64748b" text-anchor="middle">
                                ngày {{ d }}
                            </text>
                        </g>

                        <!-- Legend -->
                        <g>
                            <line x1="700" y1="20" x2="720" y2="20" stroke="#2563eb" stroke-width="2"/>
                            <text x="725" y="24" font-size="10" fill="#475569">Ban ngày</text>
                            <line x1="780" y1="20" x2="800" y2="20" stroke="#dc2626" stroke-width="2"
                                  stroke-dasharray="4,3"/>
                            <text x="805" y="24" font-size="10" fill="#475569">Ban đêm</text>
                        </g>
                    </svg>
                </div>
            </div>

            <!-- Cancel Confirm Modal -->
            <div v-if="showCancelConfirm" class="cf-modal-overlay" @click.self="closeCancelConfirm">
                <div class="cf-modal-box cf-modal-narrow">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <h3 class="cf-modal-title">Hủy thử nghiệm?</h3>
                        </div>
                        <button @click="closeCancelConfirm" class="cf-modal-close-btn">✕</button>
                    </div>
                    <div class="cf-modal-body">
                        <p style="color: #475569;">
                            Hồ sơ <b>{{ activeTest?.profile_code || ('#' + activeTest?.profile_id) }}</b>
                            sẽ ngưng áp dụng cho đợt <b>#{{ activeTest?.cycle_id }}</b>.
                            Hệ thống sẽ khôi phục về hồ sơ vĩnh viễn của đợt (nếu có) hoặc lịch mặc định.
                        </p>
                    </div>
                    <div class="cf-modal-footer">
                        <button @click="closeCancelConfirm" class="cf-btn-secondary">Không</button>
                        <button @click="cancelTest" class="cf-btn-primary"
                                style="background-color: #b91c3c;">Hủy thử nghiệm</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `
};