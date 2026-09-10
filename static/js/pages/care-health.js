/**
 * Care Health - Health assessment logging
 * Route: /care/health
 * Mobile-first, .cf-care-* CSS namespace
 *
 * health_flags is a JSONB column on backend (handled by care_service).
 *
 * Refactored 2026-08-16: uses useCareContext() + <care-context-card>.
 */
import { useCareContext } from '../composables/useCareContext.js';
import CareCyclePill from '../components/care-cycle-pill.js';
const { ref, reactive, computed, onMounted } = Vue;

export default {
    components: { CareCyclePill },
    setup() {
        const ctx = useCareContext();

        const healthNotes = ref([]);

        const healthForm = reactive({
            severity: 'normal',
            symptoms: '',
            health_flags: [],
            notes: ''
        });

        const healthFlagLabels = { cough: 'Ho', diarrhea: 'Tiêu chảy', lethargy: 'Uể oải', respiratory: 'Hô hấp' };
        const severityLabels = { normal: 'Bình thường', mild: 'Nhẹ', severe: 'Nặng' };

        const severityColor = {
            normal: 'cf-care-severity-normal',
            mild: 'cf-care-severity-mild',
            severe: 'cf-care-severity-severe'
        };

        async function loadLogs() {
            if (!ctx.selectedCycleId.value) return;
            try {
                const data = await API.care.healthHistory(ctx.selectedCycleId.value, ctx.selectedDate.value, ctx.selectedDate.value);
                healthNotes.value = Array.isArray(data) ? data : [];
            } catch (e) {
                healthNotes.value = [];
            }
        }

        ctx.onCycleChange(loadLogs);
        ctx.onDateChange(loadLogs);

        async function saveHealth() {
            const barnId = ctx.selectedCycle.value?.barn_id ? String(ctx.selectedCycle.value.barn_id) : '';
            try {
                await API.care.logHealth({
                    cycle_id: Number(ctx.selectedCycleId.value),
                    barn_id: barnId,
                    severity: healthForm.severity,
                    symptoms: healthForm.symptoms || null,
                    health_flags: healthForm.health_flags,
                    notes: healthForm.notes || undefined,
                    recorded_at: ctx.selectedDate.value,
                    day_age: ctx.dayAge.value
                });
                showToast('Đã ghi nhận sức khỏe', 'success');
                healthForm.severity = 'normal';
                healthForm.symptoms = '';
                healthForm.health_flags = [];
                healthForm.notes = '';
                await loadLogs();
            } catch (e) { showToast(e.message, 'error'); }
        }

        async function resolveHealth(id) {
            try {
                await API.care.resolveHealth(id);
                showToast('Đã đánh dấu đã xử lý', 'success');
                await loadLogs();
            } catch (e) { showToast(e.message, 'error'); }
        }

        async function deleteEntry(id) {
            ctx.askDelete('Xóa ghi nhận sức khỏe này?', async () => {
                try {
                    await API.care.delHealth(id);
                    showToast('Đã xóa', 'success');
                    await loadLogs();
                } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
            });
        }

        function toggleHealthFlag(flag) {
            const idx = healthForm.health_flags.indexOf(flag);
            if (idx === -1) healthForm.health_flags.push(flag);
            else healthForm.health_flags.splice(idx, 1);
        }

        onMounted(() => ctx.loadInitialData(loadLogs));

        return {
            // shared context state
            cycles: ctx.cycles, activeCycles: ctx.activeCycles, selectedCycleId: ctx.selectedCycleId, selectedDate: ctx.selectedDate,
            loading: ctx.loading, confirmDelete: ctx.confirmDelete,
            selectedCycle: ctx.selectedCycle, dayAge: ctx.dayAge, aliveCount: ctx.aliveCount,
            initialCount: ctx.initialCount, survivalRate: ctx.survivalRate,
            changeDate: ctx.changeDate, timeStr: ctx.timeStr,
            askDelete: ctx.askDelete, doConfirmDelete: ctx.doConfirmDelete, cancelDelete: ctx.cancelDelete,
            // page-specific
            healthNotes, healthForm, healthFlagLabels, severityLabels, severityColor,
            saveHealth, resolveHealth, deleteEntry, toggleHealthFlag,
        };
    },

    template: `
    <div class="cf-care-container">
        <!-- Header -->
        <div class="cf-care-header-bar">
            <div class="cf-care-header-left">
                <div class="cf-care-header-icon cf-care-icon-health">🌡</div>
                <div>
                    <h1 class="cf-care-header-title">Đánh giá sức khỏe</h1>
                    <p class="cf-care-header-subtitle">Triệu chứng &amp; mức độ — phục vụ theo dõi dài hạn</p>
                </div>
            </div>
            <div class="cf-care-header-right">
                <router-link to="/care/history?type=health" class="cf-care-back-link">📋 Lịch sử</router-link>
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

        <div class="cf-care-date-nav cf-care-mt-3">
            <button @click="changeDate(-1)" class="cf-care-date-btn">&larr;</button>
            <input type="date" v-model="selectedDate" class="cf-care-date-input">
            <button @click="changeDate(1)" class="cf-care-date-btn">&rarr;</button>
        </div>

        <div v-if="loading" class="cf-care-loading-center">
            <div class="cf-spinner"></div>
            <p class="cf-loading-text">Đang tải...</p>
        </div>

        <div class="cf-care-stack" v-if="!loading && selectedCycle">
            <!-- Form -->
            <div class="cf-care-form-card">
                <div class="cf-care-form-header">
                    <span class="cf-care-form-icon health-icon">🌡</span>
                    <div>
                        <div class="cf-care-form-title">Đánh giá sức khỏe</div>
                        <div class="cf-care-form-sub">Ngày {{ dayAge }} · {{ selectedDate }}</div>
                    </div>
                </div>
                <div class="cf-care-form-body">
                    <!-- Severity -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Mức độ</label>
                        <div class="cf-care-product-grid cf-care-severity-grid">
                            <button v-for="(label, key) in severityLabels" :key="key"
                                @click="healthForm.severity = key"
                                :class="['cf-care-product-btn', 'cf-care-severity-btn', healthForm.severity === key ? 'selected' : '']">
                                <span class="cf-care-product-name">{{ label }}</span>
                            </button>
                        </div>
                    </div>
                    <!-- Flags -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Triệu chứng (chọn nhiều)</label>
                        <div class="cf-care-suggestion-pills">
                            <button v-for="(label, flag) in healthFlagLabels" :key="flag"
                                @click="toggleHealthFlag(flag)"
                                :class="['cf-care-suggestion-pill', healthForm.health_flags.includes(flag) ? 'selected' : '']">
                                {{ label }}
                            </button>
                        </div>
                    </div>
                    <!-- Symptoms text -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Mô tả triệu chứng</label>
                        <textarea v-model="healthForm.symptoms" rows="2" class="cf-care-form-input cf-care-textarea-fixed"
                            placeholder="Mô tả thêm..."></textarea>
                    </div>
                    <!-- Notes -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Ghi chú</label>
                        <input v-model="healthForm.notes" type="text" class="cf-care-form-input"
                            placeholder="Ghi chú thêm...">
                    </div>
                </div>
                <button @click="saveHealth" class="cf-care-save-btn health-btn">Lưu đánh giá</button>
            </div>
            <!-- History -->
            <div class="cf-care-history-card">
                <div class="cf-care-history-header">
                    <span class="cf-care-history-title">Sức khỏe hôm nay</span>
                    <span class="cf-care-history-count">{{ healthNotes.length }}</span>
                </div>
                <div class="cf-care-history-list">
                    <div v-if="!healthNotes.length" class="cf-care-empty-state">
                        <span>🌡</span><p>Chưa ghi nhận hôm nay</p>
                    </div>
                    <div v-for="log in healthNotes" :key="log.id" class="cf-care-log-item">
                        <div class="cf-care-log-main">
                            <div class="cf-care-log-info">
                                <span class="cf-care-log-product">
                                    <span :class="['cf-care-severity-badge', severityColor[log.severity] || 'cf-care-severity-normal']">
                                        {{ severityLabels[log.severity] || log.severity }}
                                    </span>
                                </span>
                                <span class="cf-care-log-time">{{ timeStr(log) }}</span>
                            </div>
                        </div>
                        <p v-if="log.symptoms" class="cf-care-log-note">{{ log.symptoms }}</p>
                        <div v-if="log.health_flags && log.health_flags.length" class="cf-care-log-tags">
                            <span v-for="f in log.health_flags" :key="f" class="cf-care-log-tag">
                                {{ healthFlagLabels[f] || f }}
                            </span>
                        </div>
                        <p v-if="log.notes" class="cf-care-log-note">"{{ log.notes }}"</p>
                        <div class="cf-care-log-footer">
                            <span class="cf-care-log-id">ID: {{ log.id }}</span>
                            <div class="cf-care-log-actions">
                                <button v-if="!log.resolved_at" @click="resolveHealth(log.id)" class="cf-care-log-resolve">Đã xử lý</button>
                                <button @click="deleteEntry(log.id)" class="cf-care-log-del">Xóa</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="!loading && !selectedCycle" class="cf-care-empty-box">
            <div class="cf-care-empty-icon-box">🌡</div>
            <h3 class="cf-care-empty-title">Chọn đợt nuôi để bắt đầu</h3>
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
