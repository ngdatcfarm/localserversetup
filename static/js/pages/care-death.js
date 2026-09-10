/**
 * Care Death - Mortality logging
 * Route: /care/death
 * Mobile-first, .cf-care-* CSS namespace
 *
 * Backend's delete_death atomically restores current_count via db.transaction().
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

        // ── Local helper (mirrors app.js fmtNum) ────────────
        // Exposed in setup return so templates can call {{ fmtNum(x) }} safely
        // via the component proxy.
        function fmtNum(n, dec = 0) {
            if (n === null || n === undefined) return '-';
            return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        }

        const deathLogs = ref([]);

        const deathForm = reactive({
            count: 1,
            cause: '',
            symptoms: '',
            notes: ''
        });

        const deathCauseLabels = {
            disease: 'Bệnh',
            predator: 'Kẻ thù tự nhiên',
            heat: 'Nóng',
            cold: 'Lạnh',
            other: 'Khác'
        };

        const totalDeathToday = computed(() =>
            deathLogs.value.reduce((s, l) => s + (Number(l.count) || 0), 0)
        );

        async function loadLogs() {
            if (!ctx.selectedCycleId.value) return;
            try {
                const data = await API.care.deathHistory(ctx.selectedCycleId.value, ctx.selectedDate.value, ctx.selectedDate.value);
                deathLogs.value = Array.isArray(data) ? data : [];
            } catch (e) {
                deathLogs.value = [];
            }
        }

        ctx.onCycleChange(loadLogs);
        ctx.onDateChange(loadLogs);

        async function saveDeath() {
            if (deathForm.count <= 0) { showToast('Nhập số lượng', 'error'); return; }
            const barnId = ctx.selectedCycle.value?.barn_id ? String(ctx.selectedCycle.value.barn_id) : '';
            try {
                await API.care.logDeath({
                    cycle_id: Number(ctx.selectedCycleId.value),
                    barn_id: barnId,
                    death_date: ctx.selectedDate.value,
                    count: deathForm.count,
                    cause: deathForm.cause || undefined,
                    symptoms: deathForm.symptoms || undefined,
                    notes: deathForm.notes || undefined
                });
                showToast('Đã ghi nhận tử vong: ' + deathForm.count + ' con', 'success');
                deathForm.count = 1;
                deathForm.cause = '';
                deathForm.symptoms = '';
                deathForm.notes = '';
                await loadLogs();
            } catch (e) { showToast(e.message, 'error'); }
        }

        async function deleteEntry(id) {
            ctx.askDelete('Xóa bản ghi tử vong? Backend sẽ tự động hoàn lại số con.', async () => {
                try {
                    await API.care.delDeath(id);
                    showToast('Đã xóa', 'success');
                    await loadLogs();
                } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
            });
        }

        onMounted(() => ctx.loadInitialData(loadLogs));

        return {
            // helpers
            fmtNum,
            // shared context state
            cycles: ctx.cycles, activeCycles: ctx.activeCycles, selectedCycleId: ctx.selectedCycleId, selectedDate: ctx.selectedDate,
            loading: ctx.loading, confirmDelete: ctx.confirmDelete,
            selectedCycle: ctx.selectedCycle, dayAge: ctx.dayAge, aliveCount: ctx.aliveCount,
            initialCount: ctx.initialCount, survivalRate: ctx.survivalRate,
            changeDate: ctx.changeDate, timeStr: ctx.timeStr,
            askDelete: ctx.askDelete, doConfirmDelete: ctx.doConfirmDelete, cancelDelete: ctx.cancelDelete,
            // page-specific
            deathLogs, deathForm, deathCauseLabels,
            totalDeathToday,
            saveDeath, deleteEntry,
        };
    },

    template: `
    <div class="cf-care-container">
        <!-- Header -->
        <div class="cf-care-header-bar">
            <div class="cf-care-header-left">
                <div class="cf-care-header-icon cf-care-icon-death">📉</div>
                <div>
                    <h1 class="cf-care-header-title">Ghi nhận tử vong</h1>
                    <p class="cf-care-header-subtitle">Backend tự động cập nhật số đàn khi thêm/xóa</p>
                </div>
            </div>
            <div class="cf-care-header-right">
                <router-link to="/care/history?type=death" class="cf-care-back-link">📋 Lịch sử</router-link>
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
                    <span class="cf-care-form-icon death-icon">📉</span>
                    <div>
                        <div class="cf-care-form-title">Ghi nhận tử vong</div>
                        <div class="cf-care-form-sub">{{ selectedDate }}</div>
                    </div>
                </div>
                <div class="cf-care-form-body">
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Số lượng chết</label>
                        <input v-model.number="deathForm.count" type="number" min="1"
                            class="cf-care-qty-input" placeholder="0">
                    </div>
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Nguyên nhân</label>
                        <select v-model="deathForm.cause" class="cf-care-form-input">
                            <option value="">-- Không rõ --</option>
                            <option v-for="(label, key) in deathCauseLabels" :key="key" :value="key">{{ label }}</option>
                        </select>
                    </div>
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Triệu chứng</label>
                        <input v-model="deathForm.symptoms" type="text" class="cf-care-form-input"
                            placeholder="Mô tả triệu chứng...">
                    </div>
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Ghi chú</label>
                        <input v-model="deathForm.notes" type="text" class="cf-care-form-input"
                            placeholder="Ghi chú thêm...">
                    </div>
                </div>
                <button @click="saveDeath" class="cf-care-save-btn death-btn">Ghi nhận tử vong</button>
            </div>
            <!-- Stats -->
            <div class="cf-care-stat-card cf-care-stat-wide">
                <span class="cf-care-stat-label">Tổng chết hôm nay</span>
                <span class="cf-care-stat-val val-rose">{{ fmtNum(totalDeathToday) }} con</span>
                <span class="cf-care-stat-sub">{{ deathLogs.length }} bản ghi</span>
            </div>
            <!-- History -->
            <div class="cf-care-history-card">
                <div class="cf-care-history-header">
                    <span class="cf-care-history-title">Tử vong hôm nay</span>
                    <span class="cf-care-history-count">{{ deathLogs.length }}</span>
                </div>
                <div class="cf-care-history-list">
                    <div v-if="!deathLogs.length" class="cf-care-empty-state">
                        <span>📉</span><p>Không có tử vong hôm nay</p>
                    </div>
                    <div v-for="log in deathLogs" :key="log.id" class="cf-care-log-item">
                        <div class="cf-care-log-main">
                            <div class="cf-care-log-info">
                                <span class="cf-care-log-product">
                                    {{ log.count }} con{{ log.cause ? ' · ' + (deathCauseLabels[log.cause] || log.cause) : '' }}
                                </span>
                                <span class="cf-care-log-time">{{ timeStr(log) }}</span>
                            </div>
                        </div>
                        <p v-if="log.symptoms" class="cf-care-log-note">Triệu chứng: {{ log.symptoms }}</p>
                        <p v-if="log.notes" class="cf-care-log-note">"{{ log.notes }}"</p>
                        <div class="cf-care-log-footer">
                            <span class="cf-care-log-id">ID: {{ log.id }}</span>
                            <button @click="deleteEntry(log.id)" class="cf-care-log-del">Xóa</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="!loading && !selectedCycle" class="cf-care-empty-box">
            <div class="cf-care-empty-icon-box">📉</div>
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
