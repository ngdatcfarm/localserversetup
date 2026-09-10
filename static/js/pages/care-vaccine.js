/**
 * Care Vaccine - Vaccination schedule per cycle
 * Route: /care/vaccine
 * Mobile-first, .cf-care-* CSS namespace
 *
 * Shows upcoming + done vaccine schedule items for the selected cycle.
 * Mark done / skip actions; uses useCareContext() + <care-context-card>.
 */
import { useCareContext } from '../composables/useCareContext.js';
import CareCyclePill from '../components/care-cycle-pill.js';
const { ref, onMounted } = Vue;

export default {
    components: { CareCyclePill },
    setup() {
        const ctx = useCareContext();

        const vaccineSchedules = ref([]);

        async function loadLogs() {
            if (!ctx.selectedCycleId.value) return;
            try {
                const data = await API.vaccines.schedules.list(ctx.selectedCycleId.value);
                vaccineSchedules.value = Array.isArray(data) ? data : [];
            } catch (e) {
                vaccineSchedules.value = [];
            }
        }

        ctx.onCycleChange(loadLogs);

        async function markVaccineDone(v) {
            try {
                await API.vaccines.schedules.done(v.id);
                showToast('Đã đánh dấu đã tiêm', 'success');
                await loadLogs();
            } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
        }

        async function skipVaccine(v) {
            try {
                await API.vaccines.schedules.skip(v.id, 'skip');
                showToast('Đã bỏ qua', 'success');
                await loadLogs();
            } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
        }

        onMounted(() => ctx.loadInitialData(loadLogs));

        return {
            // shared context state
            cycles: ctx.cycles, activeCycles: ctx.activeCycles, selectedCycleId: ctx.selectedCycleId,
            loading: ctx.loading, confirmDelete: ctx.confirmDelete,
            selectedCycle: ctx.selectedCycle, dayAge: ctx.dayAge, aliveCount: ctx.aliveCount,
            initialCount: ctx.initialCount, survivalRate: ctx.survivalRate,
            askDelete: ctx.askDelete, doConfirmDelete: ctx.doConfirmDelete, cancelDelete: ctx.cancelDelete,
            // page-specific
            vaccineSchedules,
            markVaccineDone, skipVaccine,
        };
    },

    template: `
    <div class="cf-care-container">
        <!-- Header -->
        <div class="cf-care-header-bar">
            <div class="cf-care-header-left">
                <div class="cf-care-header-icon cf-care-icon-vaccine">💉</div>
                <div>
                    <h1 class="cf-care-header-title">Lịch Vaccine</h1>
                    <p class="cf-care-header-subtitle">Tiêm phòng theo đợt nuôi — đã tiêm · bỏ qua · sắp tới · trễ hẹn</p>
                </div>
            </div>
            <div class="cf-care-header-right">
                <router-link to="/care" class="cf-care-back-link">← Chăm sóc</router-link>
            </div>
        </div>

        <!-- Canonical cycle indicator (replaces the older care-context-card) -->
        <care-cycle-pill
            v-model:selectedCycleId="selectedCycleId"
            :cycles="activeCycles"
            :selected-cycle="selectedCycle"
            :day-age="dayAge"
            :alive-count="aliveCount"
            :survival-rate="survivalRate"
        />

        <div v-if="loading" class="cf-care-loading-center">
            <div class="cf-spinner"></div>
            <p class="cf-loading-text">Đang tải...</p>
        </div>

        <div class="cf-care-stack" v-if="!loading && selectedCycle">
            <!-- Schedule list -->
            <div class="cf-care-form-card">
                <div class="cf-care-form-header">
                    <span class="cf-care-form-icon" style="background: linear-gradient(135deg, #dcfce7, #bbf7d0);">💉</span>
                    <div>
                        <div class="cf-care-form-title">Lịch Vaccine</div>
                        <div class="cf-care-form-sub">{{ vaccineSchedules.length }} mũi</div>
                    </div>
                </div>

                <div v-if="!vaccineSchedules.length" class="cf-care-empty-state">
                    <p>Chưa có lịch vaccine cho đợt này</p>
                </div>

                <div v-else style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <div v-for="v in vaccineSchedules" :key="v.id" class="cf-care-vaccine-item">
                        <div class="cf-care-vaccine-info">
                            <div :class="['cf-care-vaccine-icon', v.done ? 'done' : v.skipped ? 'done' : v.day_age_target <= dayAge ? 'overdue' : 'pending']">
                                <span v-if="v.done">✓</span>
                                <span v-else-if="v.skipped">⏭</span>
                                <span v-else>💉</span>
                            </div>
                            <div>
                                <div class="cf-care-vaccine-name">{{ v.vaccine_name }}</div>
                                <div class="cf-care-vaccine-meta">
                                    Ngày {{ v.day_age_target }} · {{ v.method || 'Tiêu chuẩn' }}
                                    <span v-if="v.done" style="color: #15803d;"> · Đã tiêm</span>
                                    <span v-if="v.skipped" style="color: #94a3b8;"> · Đã bỏ</span>
                                </div>
                            </div>
                        </div>
                        <div v-if="!v.done && !v.skipped" style="display: flex; gap: 0.375rem;">
                            <button @click="markVaccineDone(v)" class="cf-care-save-btn" style="background: #10b981; padding: 0.375rem 0.75rem; font-size: 0.75rem; margin: 0; width: auto;">
                                Đã tiêm
                            </button>
                            <button @click="skipVaccine(v)" class="cf-care-save-btn" style="background: #94a3b8; padding: 0.375rem 0.75rem; font-size: 0.75rem; margin: 0; width: auto;">
                                Bỏ qua
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="!loading && !selectedCycle" class="cf-care-empty-box">
            <div class="cf-care-empty-icon-box">💉</div>
            <h3 class="cf-care-empty-title">Chọn đợt nuôi để xem lịch vaccine</h3>
        </div>
    </div>
    `
};
