/**
 * Care Water - Water consumption logging
 * Route: /care/water
 * Mobile-first, .cf-care-* CSS namespace
 *
 * Refactored 2026-08-16: now uses useCareContext() composable + <care-context-card>
 * for shared state/header. Page-specific logic (currentShift, shift toggles,
 * water history) stays here.
 */
import { useCareContext } from '../composables/useCareContext.js';
import CareCyclePill from '../components/care-cycle-pill.js';
const { ref, reactive, computed, onMounted } = Vue;

export default {
    components: { CareCyclePill },
    setup() {
        // ── Shared state (cycles, selectedCycleId, selectedDate, loading,
        //    confirmDelete, dayAge, aliveCount, survivalRate, ...) ──────────
        const ctx = useCareContext();

        // ── Local helper (mirrors app.js fmtNum) ────────────
        // Exposed in setup return so templates can call {{ fmtNum(x) }} safely
        // via the component proxy.
        function fmtNum(n, dec = 0) {
            if (n === null || n === undefined) return '-';
            return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        }

        // ── Page-specific state ─────────────────────────────
        const currentShift = ref('sang');
        const waterLogs = ref([]);
        const editingWaterId = ref(null);

        const waterForm = reactive({
            consumption_liters: 0,
            medicated: false,
            notes: ''
        });

        // ── Page-specific computed ──────────────────────────
        const totalLitersToday = computed(() =>
            waterLogs.value.reduce((s, l) => s + (Number(l.consumption_liters) || 0), 0)
        );
        const sangHasWater = computed(() => waterLogs.value.some(l => l.shift === 'sang'));
        const chieuHasWater = computed(() => waterLogs.value.some(l => l.shift === 'chieu'));

        // ── Page-specific helpers ───────────────────────────
        function autoShift() {
            const hour = new Date().getHours();
            currentShift.value = hour < 13 ? 'sang' : 'chieu';
        }

        async function loadLogs() {
            if (!ctx.selectedCycleId.value) return;
            try {
                const data = await API.care.waterHistory(ctx.selectedCycleId.value, ctx.selectedDate.value, ctx.selectedDate.value);
                waterLogs.value = Array.isArray(data) ? data : [];
            } catch (e) {
                waterLogs.value = [];
            }
        }

        ctx.onCycleChange(loadLogs);
        ctx.onDateChange(loadLogs);

        async function saveWater() {
            if (waterForm.consumption_liters <= 0) {
                showToast('Nhập lượng nước', 'error');
                return;
            }
            const barnId = ctx.selectedCycle.value?.barn_id ? String(ctx.selectedCycle.value.barn_id) : '';
            const wasEditing = editingWaterId.value;
            try {
                if (wasEditing) {
                    await API.care.delWater(editingWaterId.value);
                }
                await API.care.logWater({
                    cycle_id: Number(ctx.selectedCycleId.value),
                    barn_id: barnId,
                    water_date: ctx.selectedDate.value,
                    shift: currentShift.value,
                    consumption_liters: waterForm.consumption_liters,
                    medicated: waterForm.medicated,
                    notes: waterForm.notes || undefined
                });
                showToast(wasEditing ? 'Đã cập nhật nước' : 'Đã ghi nhận nước: ' + waterForm.consumption_liters + ' lít', 'success');
                waterForm.consumption_liters = 0;
                waterForm.medicated = false;
                waterForm.notes = '';
                editingWaterId.value = null;
                await loadLogs();
            } catch (e) { showToast(e.message, 'error'); }
        }

        // ── Edit handler (delete-then-recreate) ─────
        function editWater(log) {
            waterForm.consumption_liters = Number(log.consumption_liters) || 0;
            waterForm.medicated = !!log.medicated;
            waterForm.notes = log.notes || '';
            editingWaterId.value = log.id;
            currentShift.value = log.shift || 'sang';
            const el = document.querySelector('.cf-care-stack .cf-care-form-card');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function cancelWaterEdit() {
            editingWaterId.value = null;
            waterForm.consumption_liters = 0;
            waterForm.medicated = false;
            waterForm.notes = '';
        }

        async function deleteEntry(id) {
            ctx.askDelete('Xóa dòng ghi nhận này?', async () => {
                try {
                    await API.care.delWater(id);
                    showToast('Đã xóa', 'success');
                    await loadLogs();
                } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
            });
        }

        // ── Initial load: auto-shift first, then ctx.loadInitialData ──
        async function loadData() {
            autoShift();
            await ctx.loadInitialData(loadLogs);
        }
        onMounted(() => loadData());

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
            currentShift, waterLogs, waterForm,
            totalLitersToday, sangHasWater, chieuHasWater,
            saveWater, deleteEntry,
            // edit mode
            editingWaterId, editWater, cancelWaterEdit,
        };
    },

    template: `
    <div class="cf-care-container">
        <!-- Header -->
        <div class="cf-care-header-bar">
            <div class="cf-care-header-left">
                <div class="cf-care-header-icon cf-care-icon-water">💧</div>
                <div>
                    <h1 class="cf-care-header-title">Nước uống</h1>
                    <p class="cf-care-header-subtitle">Ghi nhận lượng nước theo ca — có thể đánh dấu pha thuốc</p>
                </div>
            </div>
            <div class="cf-care-header-right">
                <router-link to="/care/history?type=water" class="cf-care-back-link">📋 Lịch sử</router-link>
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

        <div class="cf-care-shift-group cf-care-mt-3">
            <button @click="currentShift = 'sang'"
                :class="['cf-care-shift-btn',
                         currentShift === 'sang' ? 'active sang' : '',
                         sangHasWater ? 'recorded' : '']">
                ☀️ Sáng
                <span v-if="sangHasWater" class="cf-care-shift-tick">✓</span>
                <span v-else class="cf-care-shift-missing">⚠ Chưa ghi</span>
            </button>
            <button @click="currentShift = 'chieu'"
                :class="['cf-care-shift-btn',
                         currentShift === 'chieu' ? 'active chieu' : '',
                         chieuHasWater ? 'recorded' : '']">
                🌆 Chiều
                <span v-if="chieuHasWater" class="cf-care-shift-tick">✓</span>
                <span v-else class="cf-care-shift-missing">⚠ Chưa ghi</span>
            </button>
        </div>

        <div v-if="loading" class="cf-care-loading-center">
            <div class="cf-spinner"></div>
            <p class="cf-loading-text">Đang tải...</p>
        </div>

        <div class="cf-care-stack" v-if="!loading && selectedCycle">
            <!-- History (PROMINENT — above form), stats merged into summary -->
            <div :class="['cf-care-history-card',
                          'cf-care-history-water',
                          waterLogs.length ? 'cf-care-history-prominent' : 'cf-care-history-prominent cf-care-history-empty']">
                <div class="cf-care-history-header">
                    <span class="cf-care-history-title">Nước uống hôm nay</span>
                    <span class="cf-care-history-count">{{ waterLogs.length }} lần</span>
                </div>
                <div class="cf-care-history-summary" v-if="waterLogs.length">
                    <span class="cf-care-history-summary-total">{{ fmtNum(totalLitersToday, 1) }} lít</span>
                    <span class="cf-care-history-summary-meta">· {{ waterLogs.length }} lần ghi</span>
                    <span v-if="sangHasWater && chieuHasWater" class="cf-care-history-summary-meta">· ☀️ + 🌆</span>
                    <span v-else-if="sangHasWater" class="cf-care-history-summary-meta">· ☀️ Sáng</span>
                    <span v-else-if="chieuHasWater" class="cf-care-history-summary-meta">· 🌆 Chiều</span>
                </div>
                <div class="cf-care-history-list">
                    <div v-if="!waterLogs.length" class="cf-care-empty-state">
                        <span>💧</span><p>Chưa ghi nhận nước hôm nay</p>
                    </div>
                    <div v-for="log in waterLogs" :key="log.id" class="cf-care-log-item">
                        <div class="cf-care-log-main">
                            <div class="cf-care-log-info">
                                <span class="cf-care-log-product">
                                    {{ log.consumption_liters }} lít{{ log.medicated ? ' (có thuốc)' : '' }}
                                </span>
                                <span class="cf-care-log-time">{{ timeStr(log) }} · {{ log.shift === 'sang' ? '☀️ Sáng' : '🌆 Chiều' }}</span>
                            </div>
                        </div>
                        <p v-if="log.notes" class="cf-care-log-note">"{{ log.notes }}"</p>
                        <div class="cf-care-log-footer">
                            <span class="cf-care-log-id">ID: {{ log.id }}</span>
                            <div class="cf-care-log-actions">
                                <button @click="editWater(log)" class="cf-care-log-edit">Sửa</button>
                                <button @click="deleteEntry(log.id)" class="cf-care-log-del">Xóa</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Form -->
            <div class="cf-care-form-card">
                <div v-if="editingWaterId" class="cf-care-form-editing-banner">
                    ✏️ Đang sửa phiếu nước
                    <button @click="cancelWaterEdit" class="cf-care-form-editing-cancel">Huỷ</button>
                </div>
                <div class="cf-care-form-header">
                    <span class="cf-care-form-icon water-icon">💧</span>
                    <div>
                        <div class="cf-care-form-title">Nước uống ca {{ currentShift === 'sang' ? 'sáng' : 'chiều' }}</div>
                        <div class="cf-care-form-sub">{{ selectedDate }}</div>
                    </div>
                </div>
                <div class="cf-care-form-body">
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Lượng nước (lít)</label>
                        <input v-model.number="waterForm.consumption_liters" type="number" min="0" step="0.5"
                            class="cf-care-qty-input" placeholder="0">
                    </div>
                    <div class="cf-care-form-group">
                        <div class="cf-care-checkbox-row">
                            <input type="checkbox" v-model="waterForm.medicated" id="water-medicated" class="cf-care-checkbox">
                            <label for="water-medicated" class="cf-care-form-label cf-care-checkbox-label">Có pha thuốc</label>
                        </div>
                    </div>
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Ghi chú</label>
                        <input v-model="waterForm.notes" type="text" class="cf-care-form-input"
                            placeholder="VD: Thêm điện giải...">
                    </div>
                </div>
                <button @click="saveWater" class="cf-care-save-btn water-btn">{{ editingWaterId ? 'Cập nhật' : 'Lưu nước uống' }}</button>
            </div>
        </div>

        <div v-if="!loading && !selectedCycle" class="cf-care-empty-box">
            <div class="cf-care-empty-icon-box">💧</div>
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
