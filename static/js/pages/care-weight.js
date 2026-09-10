/**
 * Care Weight - Weight logging + Vaccine schedule
 * Route: /care/weight
 * Mobile-first, .cf-care-* CSS namespace
 *
 * Refactored 2026-08-16: uses useCareContext() for shared state/computed/
 * helpers. Page-specific layout (own header, weight mode toggle, vaccine
 * schedule) stays here. weightHistory fetches all weights for the cycle
 * once; date filter is client-side via `todayWeights` computed.
 */
import { useCareContext } from '../composables/useCareContext.js';
import CareCyclePill from '../components/care-cycle-pill.js';
const { ref, reactive, computed, watch, onMounted } = Vue;

export default {
    components: { CareCyclePill },
    setup() {
        const ctx = useCareContext();

        // ── Local helper (mirrors app.js fmtNum) ────────────
        // Exposed in setup return so templates can call {{ fmtNum(x) }} safely
        // via the component proxy.
        function fmtNum(n, dec = 0) {
            if (n === null || n === undefined) return '-';
            return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        }

        const weightLogs = ref([]);
        const submitting = ref(false);

        const weightForm = reactive({
            mode: 'aggregate',
            sample_count: '',
            total_weight: '',
            currentWeight: '',
            currentGender: 'female',
            samples: [],
            notes: ''
        });

        // ── Page-specific computed ───────────────────────
        const todayWeights = computed(() =>
            weightLogs.value.filter(l => l.weigh_date === ctx.selectedDate.value)
        );

        const weightStats = computed(() => {
            if (weightForm.mode === 'aggregate') {
                const sc = parseFloat(weightForm.sample_count);
                const tw = parseFloat(weightForm.total_weight);
                if (!sc || !tw || sc === 0) return null;
                return { avg: (tw / sc).toFixed(2), count: sc, uniformity: null };
            } else {
                if (weightForm.samples.length === 0) return null;
                const weights = weightForm.samples.map(s => s.weight_g);
                const total = weights.reduce((s, w) => s + w, 0);
                const count = weights.length;
                const avg = total / count;
                const avgKg = (avg / 1000).toFixed(2);
                const withinRange = weights.filter(w => Math.abs(w - avg) / avg <= 0.10).length;
                const uniformity = ((withinRange / count) * 100).toFixed(0);
                const maleCount = weightForm.samples.filter(s => s.gender === 'male').length;
                const femaleCount = weightForm.samples.filter(s => s.gender === 'female').length;
                return { avg: avgKg, count, uniformity, maleCount, femaleCount };
            }
        });

        // ── Page-specific helpers ───────────────────────
        function resetWeightForm() {
            weightForm.mode = 'aggregate';
            weightForm.sample_count = '';
            weightForm.total_weight = '';
            weightForm.currentWeight = '';
            weightForm.currentGender = 'female';
            weightForm.samples = [];
            weightForm.notes = '';
        }

        function addSample() {
            const w = parseFloat(weightForm.currentWeight);
            if (w > 0) {
                weightForm.samples.push({
                    weight_g: Math.round(w * 1000),
                    gender: weightForm.currentGender
                });
                weightForm.currentWeight = '';
            }
        }

        function removeSample(idx) { weightForm.samples.splice(idx, 1); }

        async function loadLogs() {
            if (!ctx.selectedCycleId.value) return;
            const cid = ctx.selectedCycleId.value;
            try {
                const weights = await API.care.weightHistory(cid);
                weightLogs.value = Array.isArray(weights) ? weights : [];
            } catch (e) {
                weightLogs.value = [];
            }
        }

        // Only cycle changes trigger refetch; date filter is client-side.
        ctx.onCycleChange(loadLogs);

        async function submitWeight() {
            if (submitting.value) return;
            const cycleId = ctx.selectedCycleId.value;
            const barnId = ctx.selectedCycle.value?.barn_id;
            if (!cycleId) { showToast('Chọn đợt nuôi', 'error'); return; }

            submitting.value = true;
            try {
                if (weightForm.mode === 'aggregate') {
                    if (!weightForm.sample_count || !weightForm.total_weight) {
                        showToast('Nhập số con và tổng trọng lượng', 'error');
                        submitting.value = false;
                        return;
                    }
                    await API.care.logWeight({
                        cycle_id: cycleId, barn_id: barnId,
                        weigh_date: ctx.selectedDate.value, gender: 'mixed',
                        sample_count: parseInt(weightForm.sample_count),
                        total_weight: parseFloat(weightForm.total_weight),
                        samples: [], notes: weightForm.notes
                    });
                } else {
                    if (weightForm.samples.length === 0) {
                        showToast('Thêm ít nhất 1 mẫu cân', 'error');
                        submitting.value = false;
                        return;
                    }
                    await API.care.logWeight({
                        cycle_id: cycleId, barn_id: barnId,
                        weigh_date: ctx.selectedDate.value, gender: 'mixed',
                        sample_count: weightForm.samples.length,
                        total_weight: weightForm.samples.reduce((s, x) => s + x.weight_g, 0) / 1000,
                        samples: weightForm.samples, notes: weightForm.notes
                    });
                }
                showToast('Đã lưu cân nặng', 'success');
                resetWeightForm();
                await loadLogs();
            } catch (e) {
                showToast('Lỗi: ' + e.message, 'error');
            } finally {
                submitting.value = false;
            }
        }

        async function deleteWeight(id) {
            ctx.askDelete('Xóa bản ghi cân nặng?', async () => {
                try {
                    await API.care.delWeight(id);
                    showToast('Đã xóa', 'success');
                    await loadLogs();
                } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
            });
        }

        // ── Initial load ─────────────────────────────────
        onMounted(() => ctx.loadInitialData(loadLogs));

        return {
            // helpers
            fmtNum,
            // shared context state
            cycles: ctx.cycles, activeCycles: ctx.activeCycles,
            selectedCycleId: ctx.selectedCycleId, selectedDate: ctx.selectedDate,
            loading: ctx.loading, confirmDelete: ctx.confirmDelete,
            selectedCycle: ctx.selectedCycle, dayAge: ctx.dayAge, aliveCount: ctx.aliveCount, survivalRate: ctx.survivalRate,
            changeDate: ctx.changeDate,
            askDelete: ctx.askDelete, doConfirmDelete: ctx.doConfirmDelete, cancelDelete: ctx.cancelDelete,
            // page-specific
            weightLogs, submitting,
            weightForm, todayWeights, weightStats,
            resetWeightForm, addSample, removeSample,
            submitWeight, deleteWeight,
        };
    },

    template: `
    <div class="cf-care-weight-container">
        <!-- Header -->
        <div class="cf-care-header">
            <div class="cf-care-header-top">
                <div class="cf-care-header-left">
                    <div class="cf-care-badge" style="background: linear-gradient(135deg, #3b82f6, #60a5fa);">CÂN NẶNG</div>
                    <h1 class="cf-care-title">Cân trọng lượng</h1>
                </div>
                <div class="cf-care-date-nav">
                    <button @click="changeDate(-1)" class="cf-care-date-btn">&larr;</button>
                    <input type="date" v-model="selectedDate" class="cf-care-date-input">
                    <button @click="changeDate(1)" class="cf-care-date-btn">&rarr;</button>
                </div>
            </div>
            <div class="cf-care-cycle-row">
                <select v-model="selectedCycleId" class="cf-care-cycle-select">
                    <option value="">-- Chọn đợt nuôi --</option>
                    <option v-for="c in activeCycles" :key="c.id" :value="c.id">
                        {{ c.name || 'Đợt ' + c.id }} ({{ c.barn_id }})
                    </option>
                </select>
                <div v-if="selectedCycle" class="cf-care-cycle-info">
                    <span class="cf-care-day-age">Ngày {{ dayAge }}</span>
                    <span class="cf-care-count">{{ selectedCycle.current_count?.toLocaleString() || selectedCycle.initial_count?.toLocaleString() }} con</span>
                </div>
            </div>
        </div>

        <!-- Inline cycle pill — always visible at-a-glance indicator -->
        <!-- Canonical cycle indicator -->
        <care-cycle-pill
            v-model:selectedCycleId="selectedCycleId"
            :cycles="activeCycles"
            :selected-cycle="selectedCycle"
            :day-age="dayAge"
            :alive-count="aliveCount"
            :survival-rate="survivalRate"
        />

        <div v-if="loading" class="cf-care-timeline-empty">Đang tải...</div>

        <template v-else-if="selectedCycle">
            <!-- Today's existing weights -->
            <div v-if="todayWeights.length" class="cf-care-history-card" style="margin-bottom: 0.75rem;">
                <div class="cf-care-history-header">
                    <span class="cf-care-history-title">Đã cân hôm nay</span>
                    <span class="cf-care-history-count">{{ todayWeights.length }} lần</span>
                </div>
                <div class="cf-care-history-list">
                    <div v-for="w in todayWeights" :key="w.id" class="cf-care-log-item">
                        <div class="cf-care-log-main">
                            <div class="cf-care-log-info">
                                <span class="cf-care-log-product">{{ w.sample_count }} mẫu</span>
                                <span class="cf-care-log-time">TB {{ (w.total_weight / w.sample_count).toFixed(2) }} kg</span>
                            </div>
                            <span class="cf-care-log-qty">{{ fmtNum(w.total_weight, 1) }} kg</span>
                        </div>
                        <div class="cf-care-log-footer">
                            <span v-if="w.uniformity" class="cf-care-log-id">ĐB: {{ w.uniformity.toFixed(0) }}%</span>
                            <button @click="deleteWeight(w.id)" class="cf-care-log-del">Xóa</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Weight Form -->
            <div class="cf-care-form-card">
                <div class="cf-care-form-header">
                    <span class="cf-care-form-icon" style="background: linear-gradient(135deg, #dbeafe, #bfdbfe);">⚖️</span>
                    <div>
                        <div class="cf-care-form-title">Ghi nhận cân nặng</div>
                        <div class="cf-care-form-sub">{{ selectedDate }}</div>
                    </div>
                </div>

                <!-- Mode toggle -->
                <div class="cf-care-weight-mode-toggle">
                    <button @click="weightForm.mode = 'aggregate'" :class="['cf-care-weight-mode-btn', weightForm.mode === 'aggregate' ? 'active' : '']">
                        📊 Tổng hợp
                    </button>
                    <button @click="weightForm.mode = 'samples'" :class="['cf-care-weight-mode-btn', weightForm.mode === 'samples' ? 'active' : '']">
                        📋 Từng con
                    </button>
                </div>

                <!-- Live stats -->
                <div v-if="weightStats" class="cf-care-weight-stats">
                    <div class="cf-care-weight-stat">
                        <div class="cf-care-weight-stat-label">TB/con</div>
                        <div class="cf-care-weight-stat-value">{{ weightStats.avg }} kg</div>
                    </div>
                    <div class="cf-care-weight-stat">
                        <div class="cf-care-weight-stat-label">Mẫu</div>
                        <div class="cf-care-weight-stat-value">{{ weightStats.count }}</div>
                    </div>
                    <div class="cf-care-weight-stat">
                        <div class="cf-care-weight-stat-label">Đồng đều</div>
                        <div class="cf-care-weight-stat-value">{{ weightStats.uniformity || '-' }}%</div>
                    </div>
                </div>

                <div class="cf-care-form-body">
                    <!-- Aggregate mode -->
                    <template v-if="weightForm.mode === 'aggregate'">
                        <div class="cf-care-qty-row">
                            <div class="cf-care-qty-group">
                                <label class="cf-care-qty-label">Số con cân</label>
                                <input v-model.number="weightForm.sample_count" type="number" min="1"
                                    class="cf-care-qty-input" placeholder="VD: 30">
                            </div>
                            <div class="cf-care-qty-group">
                                <label class="cf-care-qty-label">Tổng trọng lượng (kg)</label>
                                <input v-model.number="weightForm.total_weight" type="number" step="0.1" min="0"
                                    class="cf-care-qty-input" placeholder="VD: 45.5">
                            </div>
                        </div>
                    </template>

                    <!-- Sample mode -->
                    <template v-else>
                        <div class="cf-care-qty-row">
                            <div class="cf-care-qty-group" style="flex: 2;">
                                <label class="cf-care-qty-label">Cân nặng (kg)</label>
                                <input v-model.number="weightForm.currentWeight" type="number" step="0.01" min="0"
                                    class="cf-care-qty-input" placeholder="VD: 1.52"
                                    @keyup.enter="addSample">
                            </div>
                            <div class="cf-care-qty-group">
                                <label class="cf-care-qty-label">Giới tính</label>
                                <select v-model="weightForm.currentGender" class="cf-care-qty-input">
                                    <option value="female">Cái</option>
                                    <option value="male">Đực</option>
                                </select>
                            </div>
                        </div>
                        <button @click="addSample" class="cf-care-save-btn" style="background: linear-gradient(135deg, #3b82f6, #60a5fa); margin-top: 0; padding: 0.5rem;">
                            + Thêm mẫu
                        </button>
                        <div v-if="weightForm.samples.length" style="display: flex; flex-direction: column; gap: 0.25rem;">
                            <div v-for="(s, i) in weightForm.samples" :key="i" class="cf-care-weight-sample-row">
                                <span class="cf-care-weight-sample-gender">{{ s.gender === 'male' ? '♂' : '♀' }}</span>
                                <span class="cf-care-weight-sample-val">{{ (s.weight_g / 1000).toFixed(2) }} kg</span>
                                <button @click="removeSample(i)" class="cf-care-weight-sample-del">✕</button>
                            </div>
                        </div>
                    </template>

                    <!-- Notes -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Ghi chú</label>
                        <input v-model="weightForm.notes" type="text" class="cf-care-form-input"
                            placeholder="VD: Cân sáng, đàn khỏe mạnh...">
                    </div>
                </div>

                <button @click="submitWeight" :disabled="submitting" class="cf-care-save-btn" style="background: linear-gradient(135deg, #3b82f6, #60a5fa);">
                    {{ submitting ? 'Đang lưu...' : 'Lưu cân nặng' }}
                </button>
            </div>

            <!-- Weight History -->
            <div v-if="weightLogs.length" class="cf-care-history-card">
                <div class="cf-care-history-header">
                    <span class="cf-care-history-title">Lịch sử cân nặng</span>
                    <span class="cf-care-history-count">{{ weightLogs.length }} lần</span>
                </div>
                <div class="cf-care-history-list">
                    <div v-for="w in weightLogs" :key="w.id" class="cf-care-log-item">
                        <div class="cf-care-log-main">
                            <div class="cf-care-log-info">
                                <span class="cf-care-log-product">{{ w.weigh_date }} · {{ w.day_age ? 'Ngày ' + w.day_age : '' }}</span>
                                <span class="cf-care-log-time">{{ w.sample_count }} mẫu · ĐB {{ w.uniformity ? w.uniformity.toFixed(0) + '%' : '-' }}</span>
                            </div>
                            <span class="cf-care-log-qty">{{ (w.total_weight / w.sample_count).toFixed(2) }} kg</span>
                        </div>
                        <div class="cf-care-log-footer">
                            <span class="cf-care-log-id">Tổng {{ fmtNum(w.total_weight, 1) }} kg</span>
                            <button @click="deleteWeight(w.id)" class="cf-care-log-del">Xóa</button>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <div v-else class="cf-care-empty-state" style="padding: 3rem;">
            <span style="font-size: 2rem;">⚖️</span>
            <p>Chọn đợt nuôi để bắt đầu</p>
        </div>

        <!-- Confirm delete modal -->
        <div v-if="confirmDelete" class="cf-modal-overlay" @click.self="cancelDelete">
            <div class="cf-modal-box cf-modal-narrow">
                <div class="cf-modal-body cf-care-modal-centered">
                    <p class="cf-care-modal-text">{{ confirmDelete.message }}</p>
                    <div class="cf-care-modal-actions">
                        <button @click="cancelDelete" class="cf-btn-secondary">Huỷ</button>
                        <button @click="doConfirmDelete" class="cf-btn-danger">Xoá</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `
};
