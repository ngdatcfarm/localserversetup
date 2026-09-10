/**
 * Care - Quick Logging Page (Feed + Med side-by-side)
 * Route: /care
 * Sub-routes: /care/water, /care/death, /care/health, /care/weight, /care/history
 * Mobile-first, .cf-care-* CSS namespace
 *
 * Free-text product names: works even when inventory is empty.
 *
 * Refactored 2026-08-16: uses useCareContext() + <care-context-card>.
 * Page-specific: products fetch, autoShift, feed/med forms, parseFeedLog.
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
        // via the component proxy. See useCareContext.js:39 for the `with (_ctx)`
        // scope that bareword references resolve through.
        function fmtNum(n, dec = 0) {
            if (n === null || n === undefined) return '-';
            return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        }

        // ── Page-specific state ───────────────────────────
        const products = ref([]);
        const feedLogs = ref([]);
        const medLogs = ref([]);
        const currentShift = ref('sang');
        const editingFeedId = ref(null);
        const editingMedId = ref(null);
        // Recent med name suggestions (lazy-loaded)
        const recentMedSuggestions = ref([]);
        const suggestionsLoading = ref(false);

        const feedForm = reactive({
            bag_count: 0, manual_qty: 0,
            feed_name: '',
            notes: ''
        });
        const medForm = reactive({
            med_type: 'medicine',
            product_id: '', custom_name: '',
            quantity: 0, unit: 'g', method: 'water',
            notes: ''
        });

        // ── Labels ──────────────────────────────────────
        const medMethodLabels = { water: 'Pha nước uống', feed: 'Trộn cám', inject: 'Tiêm lườn', eye_drop: 'Nhỏ mắt/mũi' };
        const medTypeLabels = {
            medicine: 'Thuốc thường',
            vaccine: 'Phòng dịch',
            antibiotic: 'Kháng sinh',
            vitamin: 'Điện giải',
            probiotic: 'Men tiêu hóa'
        };
        const medTypeColour = {
            medicine: 'cf-care-med-default',
            vaccine: 'cf-care-med-vaccine', antibiotic: 'cf-care-med-antibiotic',
            vitamin: 'cf-care-med-vitamin', probiotic: 'cf-care-med-probiotic'
        };
        // Hardcoded feed codes — user picks one of these (no free-text, no inventory lookup)
        const FEED_TYPES = ['311H', '311', '312', '313'];

        // ── Page-specific computed ───────────────────────
        const medProducts = computed(() => products.value.filter(p =>
            p.product_type === 'medication' || p.product_type === 'medicine'
        ));
        const selectedMedProduct = computed(() =>
            medProducts.value.find(p => p.id === medForm.product_id) || null
        );
        const feedPreviewKg = computed(() => {
            if (!feedForm.bag_count) return 0;
            return feedForm.bag_count * 25;
        });
        const feedFinalQty = computed(() => {
            if (feedForm.bag_count > 0) return feedPreviewKg.value;
            return feedForm.manual_qty || 0;
        });
        const medFinalName = computed(() => {
            return (medForm.custom_name || '').trim() || selectedMedProduct.value?.name || '';
        });

        // ── Shift status: which shifts already have logs today? ──
        const sangHasFeed = computed(() => feedLogs.value.some(l => l.meal === 'sang'));
        const chieuHasFeed = computed(() => feedLogs.value.some(l => l.meal === 'chieu'));
        const sangHasMed = computed(() => medLogs.value.some(l => l.shift === 'sang'));
        const chieuHasMed = computed(() => medLogs.value.some(l => l.shift === 'chieu'));
        const sangHasRecord = computed(() => sangHasFeed.value || sangHasMed.value);
        const chieuHasRecord = computed(() => chieuHasFeed.value || chieuHasMed.value);

        // ── History card totals ──
        const feedTotalKg = computed(() =>
            feedLogs.value.reduce((s, l) => s + (Number(l.quantity) || 0), 0)
        );
        const medTotalDose = computed(() => medLogs.value.length);

        // ── Page-specific watcher: auto-fill unit + med_type when med product changes ──
        watch(() => medForm.product_id, (newId) => {
            const prod = medProducts.value.find(p => p.id === newId);
            if (prod) {
                // Unit (existing logic)
                if (prod.medication_unit_specs && prod.medication_unit_specs.length > 0) {
                    medForm.unit = prod.medication_unit_specs[0].base_unit || prod.unit || 'g';
                } else {
                    medForm.unit = prod.base_unit || prod.unit || 'g';
                }
                // Category → med_type (e.g. "antibiotic" → "Kháng sinh")
                _applyCategory(prod.category || prod.medication_category);
            }
        });

        // ── Helper: map medications.category → medForm.med_type ──
        // medTypeLabels keys: medicine | vaccine | antibiotic | vitamin | probiotic
        // Falls back silently if category doesn't match any (e.g. "disinfectant", "other")
        function _applyCategory(category) {
            if (!category) return;
            const valid = Object.keys(medTypeLabels);
            if (valid.includes(category)) {
                medForm.med_type = category;
            }
        }

        function autoShift() {
            const hour = new Date().getHours();
            currentShift.value = hour < 13 ? 'sang' : 'chieu';
        }

        // ── API loaders ──────────────────────────────────────
        async function loadLogs() {
            if (!ctx.selectedCycleId.value) return;
            const cid = ctx.selectedCycleId.value;
            const d = ctx.selectedDate.value;
            try {
                const [fl, ml] = await Promise.all([
                    API.care.feedHistory(cid, d, d),
                    API.care.medHistory(cid, d, d),
                ]);
                feedLogs.value = Array.isArray(fl) ? fl : [];
                medLogs.value = Array.isArray(ml) ? ml : [];
            } catch (e) {
                feedLogs.value = []; medLogs.value = [];
            }
        }
        ctx.onCycleChange(loadLogs);
        ctx.onDateChange(loadLogs);

        // ── Submit handlers ─────────────────────────────
        async function saveFeed() {
            const finalQty = feedFinalQty.value;
            if (!feedForm.feed_name) { showToast('Chọn loại cám', 'error'); return; }
            if (finalQty <= 0) { showToast('Nhập số lượng cám', 'error'); return; }

            const barnId = ctx.selectedCycle.value?.barn_id ? String(ctx.selectedCycle.value.barn_id) : '';
            const wasEditing = editingFeedId.value;
            try {
                // Edit = delete old log first, then create new (no PUT endpoint)
                if (wasEditing) {
                    await API.care.delFeed(editingFeedId.value);
                }
                await API.care.logFeed({
                    cycle_id: Number(ctx.selectedCycleId.value), barn_id: barnId,
                    feed_date: ctx.selectedDate.value, meal: currentShift.value,
                    quantity: finalQty,
                    notes: [feedForm.feed_name, feedForm.notes].filter(Boolean).join(' · ') || undefined
                });
                showToast(wasEditing ? 'Đã cập nhật: ' + finalQty + ' kg' : 'Đã ghi nhận: ' + finalQty + ' kg', 'success');
                feedForm.bag_count = 0; feedForm.manual_qty = 0;
                feedForm.feed_name = ''; feedForm.notes = '';
                editingFeedId.value = null;
                await loadLogs();
            } catch (e) { showToast(e.message, 'error'); }
        }

        async function saveMedication() {
            if (medForm.quantity <= 0) { showToast('Nhập liều lượng', 'error'); return; }
            const finalName = medFinalName.value;
            if (!finalName) { showToast('Nhập tên thuốc', 'error'); return; }

            const barnId = ctx.selectedCycle.value?.barn_id ? String(ctx.selectedCycle.value.barn_id) : '';
            const wasEditing = editingMedId.value;
            try {
                if (wasEditing) {
                    await API.care.delMedication(editingMedId.value);
                }
                await API.care.logMedication({
                    cycle_id: Number(ctx.selectedCycleId.value), barn_id: barnId,
                    med_date: ctx.selectedDate.value, med_type: medForm.med_type || 'medicine',
                    product_id: medForm.product_id ? Number(medForm.product_id) : undefined,
                    quantity: medForm.quantity, unit: medForm.unit,
                    method: medForm.method, shift: currentShift.value,
                    custom_name: finalName,
                    notes: medForm.notes || undefined
                });
                showToast(wasEditing ? 'Đã cập nhật thuốc' : 'Đã lưu thuốc', 'success');
                medForm.custom_name = ''; medForm.quantity = 0; medForm.notes = '';
                editingMedId.value = null;
                await loadLogs();
            } catch (e) { showToast(e.message, 'error'); }
        }

        // ── Edit handlers (delete-then-recreate) ─────
        function editFeed(log) {
            // Populate feed form from existing log
            const parsed = parseFeedLog(log);
            const isFeedCode = FEED_TYPES.includes(parsed.feedCode);
            feedForm.feed_name = isFeedCode ? parsed.feedCode : '';
            feedForm.notes = parsed.userNotes || '';
            // Populate bag/quantity: prefer bag_count when total cleanly divides 25, else raw
            const qty = Number(log.quantity) || 0;
            feedForm.bag_count = 0;
            feedForm.manual_qty = qty;
            editingFeedId.value = log.id;
            currentShift.value = log.meal || 'sang';
            // Scroll the feed form into view
            const el = document.querySelector('.cf-care-stack:first-of-type .cf-care-form-card');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function cancelFeedEdit() {
            editingFeedId.value = null;
            feedForm.bag_count = 0;
            feedForm.manual_qty = 0;
            feedForm.feed_name = '';
            feedForm.notes = '';
        }

        function editMed(log) {
            medForm.custom_name = log.custom_name || '';
            medForm.product_id = log.product_id ? String(log.product_id) : '';
            medForm.med_type = log.med_type || 'medicine';
            medForm.quantity = Number(log.quantity) || 0;
            medForm.unit = log.unit || 'g';
            medForm.method = log.method || 'water';
            medForm.notes = log.notes || '';
            editingMedId.value = log.id;
            currentShift.value = log.shift || 'sang';
            const el = document.querySelector('.cf-care-stack:nth-of-type(2) .cf-care-form-card');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function cancelMedEdit() {
            editingMedId.value = null;
            medForm.custom_name = '';
            medForm.product_id = '';
            medForm.quantity = 0;
            medForm.notes = '';
        }

        async function deleteEntry(type, id) {
            ctx.askDelete('Xóa dòng ghi nhận này?', async () => {
                try {
                    const delMap = {
                        feed: () => API.care.delFeed(id),
                        medication: () => API.care.delMedication(id),
                    };
                    const fn = delMap[type];
                    if (fn) await fn();
                    showToast('Đã xóa', 'success');
                    await loadLogs();
                } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
            });
        }

        // ── Feed log parsing ─────────────────────────────
        function parseFeedLog(log) {
            const raw = (log.notes || '').split(' · ');
            const first = raw[0] || '';
            const isFeedCode = FEED_TYPES.includes(first);
            return {
                feedCode: isFeedCode ? first : (log.product_name || ''),
                userNotes: isFeedCode ? raw.slice(1).join(' · ') : (log.notes || '')
            };
        }
        const parsedFeedLogs = computed(() => feedLogs.value.map(parseFeedLog));

        // ── Recent medication name suggestions (lazy-load after page interactive) ──
        async function loadRecentMeds() {
            suggestionsLoading.value = true;
            try {
                recentMedSuggestions.value = await API.medications.nameSuggestions(15);
            } catch (e) {
                recentMedSuggestions.value = [];
            } finally {
                suggestionsLoading.value = false;
            }
        }

        function pickRecentMed(s) {
            // Click → fills custom_name AND links medication_id (was: cleared product_id)
            medForm.custom_name = s.canonical_name;
            if (s.medication_id) medForm.product_id = s.medication_id;
            // Auto-fill unit + med_type from chip metadata (no need to wait for watcher)
            if (s.unit) medForm.unit = s.unit;
            _applyCategory(s.category);
            showToast(`Đã chọn "${s.canonical_name}"`, 'success');
        }

        // ── Real-time fuzzy suggestion dropdown (Layer 4) ────────
        const fuzzySuggestions = ref([]);     // top 3 from /resolve
        const showFuzzy = ref(false);
        const resolveSeq = ref(0);            // race-condition guard
        let fuzzyTimer = null;

        watch(() => medForm.custom_name, (newText) => {
            // Hide if user picked a catalog chip (product_id set + custom_name cleared)
            if (medForm.product_id && !newText) {
                fuzzySuggestions.value = [];
                showFuzzy.value = false;
                return;
            }
            const txt = (newText || '').trim();
            if (txt.length < 3) {
                fuzzySuggestions.value = [];
                showFuzzy.value = false;
                return;
            }
            clearTimeout(fuzzyTimer);
            fuzzyTimer = setTimeout(() => doResolve(txt), 200);  // debounce 200ms
        });

        async function doResolve(text) {
            const seq = ++resolveSeq.value;
            try {
                const r = await API.medications.resolve(text);
                if (seq !== resolveSeq.value) return;  // stale response
                fuzzySuggestions.value = r.suggestions || [];
                showFuzzy.value = (r.suggestions || []).length > 0;
                // Auto-apply exact alias match — silently link + fill med_type/unit
                if (r.exact) {
                    _applyExactMatch(r.exact);
                }
            } catch (e) {
                fuzzySuggestions.value = [];
                showFuzzy.value = false;
            }
        }

        function _applyExactMatch(exact) {
            // Exact alias match → fill canonical name + medication_id + unit + med_type.
            // No dropdown click needed; user just typed and got it right.
            if (medForm.custom_name !== exact.canonical_name) {
                medForm.custom_name = exact.canonical_name;
            }
            if (exact.medication_id) medForm.product_id = exact.medication_id;
            if (exact.unit) medForm.unit = exact.unit;
            _applyCategory(exact.category);
        }

        function applyFuzzySuggestion(s) {
            // 1. Use canonical name as the typed text (clean display in history)
            medForm.custom_name = s.canonical_name;
            // 2. Link medication_id — THE KEY FIX (was always cleared before)
            medForm.product_id = s.medication_id;
            // 3. Auto-fill unit + med_type directly from suggestion metadata
            if (s.unit) medForm.unit = s.unit;
            _applyCategory(s.category);
            // 4. Close dropdown
            showFuzzy.value = false;
            fuzzySuggestions.value = [];
            showToast(`Đã gắn vào "${s.canonical_name}"`, 'success');
        }

        // ── Initial load: products in parallel with cycle auto-select ──
        onMounted(() => ctx.loadInitialData(loadLogs, async () => {
            products.value = await API.products.list();
            autoShift();
            // Lazy-load recent med suggestions ~200ms after page interactive
            setTimeout(loadRecentMeds, 200);
        }));

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
            products, feedLogs, medLogs, currentShift,
            feedForm, medForm,
            feedPreviewKg, feedFinalQty, medFinalName, medProducts,
            FEED_TYPES, medMethodLabels, medTypeLabels, medTypeColour,
            saveFeed, saveMedication, deleteEntry,
            parsedFeedLogs,
            // shift status
            sangHasFeed, chieuHasFeed, sangHasMed, chieuHasMed,
            sangHasRecord, chieuHasRecord,
            feedTotalKg, medTotalDose,
            // edit mode
            editingFeedId, editingMedId,
            editFeed, cancelFeedEdit, editMed, cancelMedEdit,
            // recent meds (lazy)
            recentMedSuggestions, suggestionsLoading, pickRecentMed,
            // fuzzy dropdown (Layer 4)
            fuzzySuggestions, showFuzzy, applyFuzzySuggestion,
        };
    },

    template: `
    <div class="cf-care-container">

        <!-- ── HEADER ── -->
        <div class="cf-care-header-bar">
            <div class="cf-care-header-left">
                <div class="cf-care-header-icon">🩺</div>
                <div>
                    <h1 class="cf-care-header-title">Nhật ký chăm sóc</h1>
                    <p class="cf-care-header-subtitle">Ghi nhận nhanh ăn &amp; thuốc — nước, tử vong, sức khỏe, cân nặng, lịch sử ở menu bên</p>
                </div>
            </div>
            <div class="cf-care-header-right">
                <div class="cf-care-date-nav">
                    <button @click="changeDate(-1)" class="cf-care-date-btn">&larr;</button>
                    <input type="date" v-model="selectedDate" class="cf-care-date-input">
                    <button @click="changeDate(1)" class="cf-care-date-btn">&rarr;</button>
                </div>
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

        <!-- Shift toggle -->
        <div class="cf-care-shift-group cf-care-mt-3">
            <button @click="currentShift = 'sang'"
                :class="['cf-care-shift-btn',
                         currentShift === 'sang' ? 'active sang' : '',
                         sangHasRecord ? 'recorded' : '']">
                ☀️ Sáng
                <span v-if="sangHasRecord" class="cf-care-shift-tick">✓</span>
                <span v-else class="cf-care-shift-missing">⚠ Chưa ghi</span>
            </button>
            <button @click="currentShift = 'chieu'"
                :class="['cf-care-shift-btn',
                         currentShift === 'chieu' ? 'active chieu' : '',
                         chieuHasRecord ? 'recorded' : '']">
                🌆 Chiều
                <span v-if="chieuHasRecord" class="cf-care-shift-tick">✓</span>
                <span v-else class="cf-care-shift-missing">⚠ Chưa ghi</span>
            </button>
        </div>

        <!-- Quick links to other sub-pages -->
        <div class="cf-care-subnav">
            <router-link to="/care/water" class="cf-care-subnav-link">
                <span>💧</span> Nước uống
            </router-link>
            <router-link to="/care/death" class="cf-care-subnav-link">
                <span>📉</span> Tử vong
            </router-link>
            <router-link to="/care/health" class="cf-care-subnav-link">
                <span>🩺</span> Sức khỏe
            </router-link>
            <router-link to="/care/weight" class="cf-care-subnav-link">
                <span>⚖️</span> Cân nặng
            </router-link>
            <router-link to="/care/vaccine" class="cf-care-subnav-link">
                <span>💉</span> Vaccine
            </router-link>
            <router-link to="/care/history" class="cf-care-subnav-link">
                <span>📋</span> Lịch sử
            </router-link>
        </div>

        <!-- Loading spinner -->
        <div v-if="loading" class="cf-care-loading-center">
            <div class="cf-spinner"></div>
            <p class="cf-loading-text">Đang tải...</p>
        </div>

        <!-- ── FEED + MED side-by-side ── -->
        <div class="cf-care-dual-grid" v-if="!loading && selectedCycle">

            <!-- ── FEED FORM ── -->
            <div class="cf-care-stack">
                <!-- Feed history (PROMINENT — above form) -->
                <div :class="['cf-care-history-card',
                              feedLogs.length ? 'cf-care-history-prominent' : 'cf-care-history-prominent cf-care-history-empty']">
                    <div class="cf-care-history-header">
                        <span class="cf-care-history-title">Cho ăn hôm nay</span>
                        <span class="cf-care-history-count">{{ feedLogs.length }} lần</span>
                    </div>
                    <div class="cf-care-history-summary" v-if="feedLogs.length">
                        <span class="cf-care-history-summary-total">{{ fmtNum(feedTotalKg, 1) }} kg</span>
                        <span class="cf-care-history-summary-meta">· {{ feedLogs.length }} lần</span>
                        <span v-if="sangHasFeed && chieuHasFeed" class="cf-care-history-summary-meta">· ☀️ Sáng + 🌆 Chiều</span>
                        <span v-else-if="sangHasFeed" class="cf-care-history-summary-meta">· ☀️ Sáng</span>
                        <span v-else-if="chieuHasFeed" class="cf-care-history-summary-meta">· 🌆 Chiều</span>
                    </div>
                    <div class="cf-care-history-list">
                        <div v-if="!feedLogs.length" class="cf-care-empty-state"><span>🌾</span><p>Chưa ghi nhận hôm nay</p></div>
                        <div v-for="(log, i) in feedLogs" :key="log.id" class="cf-care-log-item">
                            <div class="cf-care-log-main">
                                <div class="cf-care-log-info">
                                    <span class="cf-care-log-product">{{ parsedFeedLogs[i].feedCode || 'Cám' }}</span>
                                    <span class="cf-care-log-time">{{ timeStr(log) }}</span>
                                </div>
                                <span class="cf-care-log-qty">+{{ fmtNum(log.quantity, 1) }} kg</span>
                            </div>
                            <p v-if="parsedFeedLogs[i].userNotes" class="cf-care-log-note">"{{ parsedFeedLogs[i].userNotes }}"</p>
                            <div class="cf-care-log-footer">
                                <span class="cf-care-log-id">{{ log.meal === 'sang' ? '☀️ Sáng' : log.meal === 'chieu' ? '🌆 Chiều' : 'Cả ngày' }}</span>
                                <div class="cf-care-log-actions">
                                    <button @click="editFeed(log)" class="cf-care-log-edit">Sửa</button>
                                    <button @click="deleteEntry('feed', log.id)" class="cf-care-log-del">Xóa</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="cf-care-form-card">
                    <div v-if="editingFeedId" class="cf-care-form-editing-banner">
                        ✏️ Đang sửa phiếu cám
                        <button @click="cancelFeedEdit" class="cf-care-form-editing-cancel">Huỷ</button>
                    </div>
                    <div class="cf-care-form-header">
                        <span class="cf-care-form-icon feed-icon">🌾</span>
                        <div>
                            <div class="cf-care-form-title">Cho ăn ca {{ currentShift === 'sang' ? 'sáng' : 'chiều' }}</div>
                            <div class="cf-care-form-sub">{{ selectedDate }}</div>
                        </div>
                    </div>
                    <div class="cf-care-form-body">
                        <div class="cf-care-form-group">
                            <label class="cf-care-form-label">Loại cám <span class="cf-care-form-required">*</span></label>
                            <div class="cf-care-product-grid cf-care-feed-grid">
                                <button v-for="code in FEED_TYPES" :key="code"
                                    @click="feedForm.feed_name = code"
                                    :class="['cf-care-product-btn', 'cf-care-feed-btn', feedForm.feed_name === code ? 'selected' : '']">
                                    <span class="cf-care-product-name">{{ code }}</span>
                                </button>
                            </div>
                        </div>
                        <div class="cf-care-qty-row">
                            <div class="cf-care-qty-group">
                                <label class="cf-care-qty-label">Theo bao</label>
                                <input v-model.number="feedForm.bag_count" type="number" min="0" class="cf-care-qty-input" placeholder="0">
                                <span v-if="feedForm.bag_count > 0" class="cf-care-qty-preview">
                                    = {{ feedPreviewKg }} kg
                                </span>
                            </div>
                            <div class="cf-care-qty-group">
                                <label class="cf-care-qty-label">Kg lẻ</label>
                                <input v-model.number="feedForm.manual_qty" type="number" min="0" step="0.1" class="cf-care-qty-input" placeholder="0">
                            </div>
                        </div>
                        <div class="cf-care-form-group">
                            <label class="cf-care-form-label">Ghi chú</label>
                            <input v-model="feedForm.notes" type="text" class="cf-care-form-input" placeholder="Đàn ăn khỏe...">
                        </div>
                    </div>
                    <button @click="saveFeed" class="cf-care-save-btn feed-btn">{{ editingFeedId ? 'Cập nhật' : 'Lưu phiếu cho ăn' }}</button>
                </div>
            </div>

            <!-- ── MEDICATION FORM ── -->
            <div class="cf-care-stack">
                <!-- Med history (PROMINENT — above form) -->
                <div :class="['cf-care-history-card',
                              'cf-care-history-med',
                              medLogs.length ? 'cf-care-history-prominent' : 'cf-care-history-prominent cf-care-history-empty']">
                    <div class="cf-care-history-header">
                        <span class="cf-care-history-title">Thuốc hôm nay</span>
                        <span class="cf-care-history-count">{{ medLogs.length }} lần</span>
                    </div>
                    <div class="cf-care-history-summary" v-if="medLogs.length">
                        <span class="cf-care-history-summary-total">{{ medTotalDose }} lần</span>
                        <span class="cf-care-history-summary-meta">· đã cấp thuốc</span>
                        <span v-if="sangHasMed && chieuHasMed" class="cf-care-history-summary-meta">· ☀️ + 🌆</span>
                        <span v-else-if="sangHasMed" class="cf-care-history-summary-meta">· ☀️ Sáng</span>
                        <span v-else-if="chieuHasMed" class="cf-care-history-summary-meta">· 🌆 Chiều</span>
                    </div>
                    <div class="cf-care-history-list">
                        <div v-if="!medLogs.length" class="cf-care-empty-state"><span>💊</span><p>Chưa dùng thuốc hôm nay</p></div>
                        <div v-for="log in medLogs" :key="log.id" class="cf-care-log-item">
                            <div class="cf-care-log-main">
                                <div class="cf-care-log-info">
                                    <span class="cf-care-log-product">{{ log.custom_name || log.product_name || log.med_type }}</span>
                                    <div class="cf-care-log-meta">
                                        <span v-if="log.med_type" :class="['cf-care-med-type-badge', medTypeColour[log.med_type] || 'cf-care-med-default']">
                                            {{ medTypeLabels[log.med_type] || log.med_type }}
                                        </span>
                                        <span class="cf-care-log-time">{{ timeStr(log) }}</span>
                                    </div>
                                </div>
                                <span class="cf-care-log-qty med-qty">{{ fmtNum(log.quantity) }} {{ log.unit }}</span>
                            </div>
                            <p v-if="log.notes" class="cf-care-log-note">"{{ log.notes }}"</p>
                            <div class="cf-care-log-footer">
                                <span class="cf-care-log-id">{{ medMethodLabels[log.method] || log.method || '' }}</span>
                                <div class="cf-care-log-actions">
                                    <button @click="editMed(log)" class="cf-care-log-edit">Sửa</button>
                                    <button @click="deleteEntry('medication', log.id)" class="cf-care-log-del">Xóa</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="cf-care-form-card">
                    <div v-if="editingMedId" class="cf-care-form-editing-banner">
                        ✏️ Đang sửa phiếu thuốc
                        <button @click="cancelMedEdit" class="cf-care-form-editing-cancel">Huỷ</button>
                    </div>
                    <div class="cf-care-form-header">
                        <span class="cf-care-form-icon med-icon">💊</span>
                        <div>
                            <div class="cf-care-form-title">Cấp thuốc thú y</div>
                            <div class="cf-care-form-sub">Ca {{ currentShift === 'sang' ? 'sáng' : 'chiều' }} · {{ selectedDate }}</div>
                        </div>
                    </div>
                    <div class="cf-care-form-body">
                        <div class="cf-care-form-group">
                            <label class="cf-care-form-label">Tên thuốc</label>
                            <input v-model="medForm.custom_name" type="text" class="cf-care-form-input"
                                placeholder="VD: Amoxicillin 500mg — bắt buộc">
                            <div v-if="showFuzzy && fuzzySuggestions.length" class="cf-care-fuzzy-dropdown">
                                <div class="cf-care-fuzzy-hint">💡 Ý bạn là:</div>
                                <button v-for="s in fuzzySuggestions" :key="s.medication_id"
                                    type="button"
                                    @click="applyFuzzySuggestion(s)"
                                    class="cf-care-fuzzy-item">
                                    <span class="cf-care-fuzzy-name">{{ s.canonical_name }}</span>
                                    <span v-if="s.unit" class="cf-care-fuzzy-unit">{{ s.unit }}</span>
                                    <span class="cf-care-fuzzy-score">{{ s.reason === 'fuzzy' ? 'gần đúng' : 'tương tự' }}</span>
                                </button>
                            </div>
                        </div>
                        <div v-if="medProducts.length" class="cf-care-product-section">
                            <div class="cf-care-product-label">Hoặc chọn từ kho</div>
                            <div class="cf-care-product-grid">
                                <button v-for="p in medProducts" :key="p.id"
                                    @click="medForm.product_id = p.id; medForm.custom_name = ''"
                                    :class="['cf-care-product-btn', medForm.product_id === p.id && !medForm.custom_name ? 'selected' : '']">
                                    <span class="cf-care-product-name">{{ p.name }}</span>
                                </button>
                            </div>
                        </div>
                        <div v-if="suggestionsLoading" class="cf-care-recent-loading">⏳ Đang tải gợi ý…</div>
                        <div v-else-if="recentMedSuggestions.length" class="cf-care-recent-meds">
                            <div class="cf-care-product-label">Đã dùng gần đây</div>
                            <div class="cf-care-product-grid">
                                <button v-for="s in recentMedSuggestions" :key="s.canonical_name"
                                    @click="pickRecentMed(s)"
                                    :class="['cf-care-product-btn', 'cf-care-recent-btn', medForm.custom_name === s.canonical_name ? 'selected' : '']">
                                    <span class="cf-care-product-name">{{ s.canonical_name }}</span>
                                    <span v-if="s.usage_count" class="cf-care-recent-count">×{{ s.usage_count }}</span>
                                </button>
                            </div>
                        </div>
                        <div class="cf-care-form-group">
                            <label class="cf-care-form-label">Đường dùng</label>
                            <select v-model="medForm.method" class="cf-care-form-input">
                                <option v-for="(label, key) in medMethodLabels" :key="key" :value="key">{{ label }}</option>
                            </select>
                        </div>
                        <div class="cf-care-form-group">
                            <label class="cf-care-form-label">Loại</label>
                            <select v-model="medForm.med_type" class="cf-care-form-input">
                                <option v-for="(label, key) in medTypeLabels" :key="key" :value="key">{{ label }}</option>
                            </select>
                        </div>
                        <div class="cf-care-qty-row">
                            <div class="cf-care-qty-group">
                                <label class="cf-care-qty-label">Liều lượng</label>
                                <input v-model.number="medForm.quantity" type="number" min="0" class="cf-care-qty-input" placeholder="0">
                            </div>
                            <div class="cf-care-qty-group">
                                <label class="cf-care-qty-label">Đơn vị</label>
                                <select v-model="medForm.unit" class="cf-care-qty-input">
                                    <option value="g">Gam (g)</option>
                                    <option value="ml">ml</option>
                                    <option value="viên">Viên</option>
                                    <option value="liều">Liều</option>
                                </select>
                            </div>
                        </div>
                        <div class="cf-care-form-group">
                            <label class="cf-care-form-label">Ghi chú</label>
                            <input v-model="medForm.notes" type="text" class="cf-care-form-input" placeholder="Pha loãng kỹ...">
                        </div>
                    </div>
                    <button @click="saveMedication" class="cf-care-save-btn med-btn">{{ editingMedId ? 'Cập nhật' : 'Xác nhận cấp thuốc' }}</button>
                </div>
            </div>
        </div>

        <!-- No cycle -->
        <div v-if="!loading && !selectedCycle" class="cf-care-empty-box">
            <div class="cf-care-empty-icon-box">🩺</div>
            <h3 class="cf-care-empty-title">Chọn đợt nuôi để bắt đầu</h3>
            <p class="cf-care-empty-desc">
                Tạo đợt nuôi mới từ menu <b>Đợt nuôi</b> hoặc chọn từ danh sách phía trên để ghi nhận chăm sóc hằng ngày.
            </p>
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
