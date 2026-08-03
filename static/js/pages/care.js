/**
 * Care - Quick Logging Page
 * 5 tabs: Feed | Medication | Death | Water | Health
 * Mobile-first, .cf-care-* CSS namespace
 * Route: /care
 */
const { ref, reactive, computed, watch, onMounted } = Vue;

export default {
    setup() {
        // ── State ──────────────────────────────────────
        const cycles = ref([]);
        const products = ref([]);

        const feedLogs = ref([]);
        const medLogs = ref([]);
        const deathLogs = ref([]);
        const waterLogs = ref([]);
        const healthNotes = ref([]);
        const medSuggestions = ref([]);

        const selectedCycleId = ref('');
        const selectedDate = ref(new Date().toISOString().slice(0, 10));
        const currentShift = ref('sang');
        const activeTab = ref('feed');
        const loading = ref(false);
        const submitting = ref(false);
        const confirmDelete = ref(null);

        // ── Forms ────────────────────────────────────────
        const feedForm = reactive({ bag_count: 0, manual_qty: 0, product_id: '', notes: '' });
        const medForm = reactive({
            med_type: 'medicine', product_id: '', custom_name: '',
            quantity: 0, unit: 'g', method: 'water', notes: ''
        });
        const deathForm = reactive({ count: 1, cause: '', symptoms: '', notes: '' });
        const waterForm = reactive({ consumption_liters: 0, medicated: false, notes: '' });
        const healthForm = reactive({ severity: 'normal', symptoms: '', health_flags: [], notes: '' });

        // ── Labels ──────────────────────────────────────
        const medMethodLabels = { water: 'Pha nước uống', feed: 'Trộn cám', inject: 'Tiêm lườn', eye_drop: 'Nhỏ mắt/mũi' };
        const medTypeLabels = { vaccine: 'Phòng dịch', antibiotic: 'Kháng sinh', vitamin: 'Điện giải', probiotic: 'Men tiêu hóa' };
        const deathCauseLabels = { disease: 'Bệnh', predator: 'Kẻ thù tự nhiên', heat: 'Nóng', cold: 'Lạnh', other: 'Khác' };
        const healthFlagLabels = { cough: 'Ho', diarrhea: 'Tiêu chảy', lethargy: 'Uể oải', respiratory: 'Hô hấp' };
        const medTypeColour = {
            vaccine: 'cf-care-med-vaccine', antibiotic: 'cf-care-med-antibiotic',
            vitamin: 'cf-care-med-vitamin', probiotic: 'cf-care-med-probiotic'
        };

        // ── Computed ────────────────────────────────────
        const selectedCycle = computed(() =>
            cycles.value.find(c => c.id == selectedCycleId.value) || null
        );

        const dayAge = computed(() => {
            if (!selectedCycle.value) return 0;
            const start = new Date(selectedCycle.value.start_date);
            const today = new Date(selectedDate.value);
            return Math.max(0, Math.floor((today - start) / (1000 * 60 * 60 * 24)));
        });

        const aliveCount = computed(() =>
            selectedCycle.value?.current_count ?? selectedCycle.value?.initial_count ?? 0
        );

        const feedProducts = computed(() => products.value.filter(p => p.product_type === 'feed'));
        const medProducts = computed(() => products.value.filter(p =>
            p.product_type === 'medication' || p.product_type === 'medicine'
        ));

        // Feed preview kg (unified calculation)
        const feedPreviewKg = computed(() => {
            if (!feedForm.bag_count) return 0;
            const prod = feedProducts.value.find(p => p.id === feedForm.product_id);
            const wpb = prod?.kg_per_bag || prod?.capacity_kg || 25;
            return feedForm.bag_count * wpb;
        });

        // Data from API is already filtered by cycle + date (server-side)
        const todayFeedLogs = computed(() => feedLogs.value);
        const todayMedLogs = computed(() => medLogs.value);
        const todayDeathLogs = computed(() => deathLogs.value);
        const todayWaterLogs = computed(() => waterLogs.value);
        const todayHealthNotes = computed(() => healthNotes.value);

        // Shift-filtered
        const shiftFeedLogs = computed(() =>
            todayFeedLogs.value.filter(l => l.meal === currentShift.value || l.meal === 'all_day')
        );
        const shiftMedLogs = computed(() =>
            todayMedLogs.value.filter(l => l.shift === currentShift.value || l.shift === 'all_day')
        );
        const shiftWaterLogs = computed(() =>
            todayWaterLogs.value.filter(l => l.shift === currentShift.value || l.shift === 'all_day')
        );

        const totalKgToday = computed(() =>
            todayFeedLogs.value.reduce((s, l) => s + (l.quantity || 0), 0)
        );

        // Auto-shift detection based on existing data
        const sangHasFeed = computed(() => todayFeedLogs.value.some(l => l.meal === 'sang'));
        const chieuHasFeed = computed(() => todayFeedLogs.value.some(l => l.meal === 'chieu'));
        const sangHasMed = computed(() => todayMedLogs.value.some(l => l.shift === 'sang'));
        const chieuHasMed = computed(() => todayMedLogs.value.some(l => l.shift === 'chieu'));

        // Tab counts for badges
        const tabCounts = computed(() => ({
            feed: todayFeedLogs.value.length,
            medication: todayMedLogs.value.length,
            death: todayDeathLogs.value.length,
            water: todayWaterLogs.value.length,
            health: todayHealthNotes.value.length,
        }));

        // ── Watchers ────────────────────────────────────
        watch(selectedCycleId, async (newId) => {
            if (!newId) return;
            loading.value = true;
            try {
                await loadLogs();
                loadMedSuggestions();
            } finally {
                loading.value = false;
            }
        });

        watch(selectedDate, async () => {
            if (!selectedCycleId.value) return;
            await loadLogs();
        });

        // Auto-set unit when med product changes
        watch(() => medForm.product_id, (newId) => {
            const prod = medProducts.value.find(p => p.id === newId);
            if (prod) {
                if (prod.medication_unit_specs && prod.medication_unit_specs.length > 0) {
                    medForm.unit = prod.medication_unit_specs[0].base_unit || prod.unit || 'g';
                } else {
                    medForm.unit = prod.base_unit || prod.unit || 'g';
                }
            }
        });

        // Auto-shift based on time of day
        function autoShift() {
            const hour = new Date().getHours();
            currentShift.value = hour < 13 ? 'sang' : 'chieu';
        }

        // ── API ────────────────────────────────────────
        async function loadData() {
            loading.value = true;
            try {
                const [c, p] = await Promise.all([API.cycles.list(), API.products.list()]);
                cycles.value = c;
                products.value = p;

                if (!selectedCycleId.value && cycles.value.length > 0) {
                    const active = cycles.value.find(cl => !cl.end_date);
                    selectedCycleId.value = active ? active.id : cycles.value[0].id;
                }
                autoShift();
                await loadLogs();
                loadMedSuggestions();
            } catch (e) {
                showToast('Lỗi tải dữ liệu: ' + e.message, 'error');
            } finally {
                loading.value = false;
            }
        }

        async function loadLogs() {
            if (!selectedCycleId.value) return;
            const cid = selectedCycleId.value;
            const d = selectedDate.value;
            try {
                const [fl, ml, dl, wl, hl] = await Promise.all([
                    API.care.feedHistory(cid, d, d),
                    API.care.medHistory(cid, d, d),
                    API.care.deathHistory(cid, d, d),
                    API.care.waterHistory(cid, d, d),
                    API.care.healthHistory(cid, d, d),
                ]);
                feedLogs.value = Array.isArray(fl) ? fl : [];
                medLogs.value = Array.isArray(ml) ? ml : [];
                deathLogs.value = Array.isArray(dl) ? dl : [];
                waterLogs.value = Array.isArray(wl) ? wl : [];
                healthNotes.value = Array.isArray(hl) ? hl : [];
            } catch (e) {
                feedLogs.value = []; medLogs.value = []; deathLogs.value = [];
                waterLogs.value = []; healthNotes.value = [];
            }
        }

        async function loadMedSuggestions() {
            const barnId = selectedCycle.value?.barn_id;
            if (!barnId) { medSuggestions.value = []; return; }
            try {
                const data = await API.care.medSuggestions(barnId);
                medSuggestions.value = Array.isArray(data) ? data : [];
            } catch (e) {
                medSuggestions.value = [];
            }
        }

        function applySuggestion(s) {
            medForm.custom_name = s.name;
            if (s.med_type) medForm.med_type = s.med_type;
            if (s.method) medForm.method = s.method;
            if (s.unit) medForm.unit = s.unit;
            medForm.product_id = '';
        }

        // ── Submit handlers ─────────────────────────────
        async function saveFeed() {
            const prod = feedProducts.value.find(p => p.id === feedForm.product_id);
            if (!prod) { showToast('Chọn loại cám', 'error'); return; }

            let finalQty = feedForm.manual_qty;
            if (feedForm.bag_count > 0) finalQty = feedPreviewKg.value;

            if (finalQty <= 0) { showToast('Nhập số lượng cám', 'error'); return; }

            const barnId = selectedCycle.value?.barn_id ? String(selectedCycle.value.barn_id) : '';
            try {
                await API.care.logFeed({
                    cycle_id: Number(selectedCycleId.value), barn_id: barnId,
                    feed_date: selectedDate.value, meal: currentShift.value,
                    quantity: finalQty,
                    product_id: feedForm.product_id ? Number(feedForm.product_id) : undefined,
                    notes: feedForm.notes
                });
                showToast('Đã ghi nhận: ' + finalQty + ' kg', 'success');
                feedForm.bag_count = 0; feedForm.manual_qty = 0; feedForm.notes = '';
                await loadLogs();
            } catch (e) { showToast(e.message, 'error'); }
        }

        async function saveMedication() {
            if (medForm.quantity <= 0) { showToast('Nhập liều lượng', 'error'); return; }

            const barnId = selectedCycle.value?.barn_id ? String(selectedCycle.value.barn_id) : '';
            try {
                await API.care.logMedication({
                    cycle_id: Number(selectedCycleId.value), barn_id: barnId,
                    med_date: selectedDate.value, med_type: medForm.med_type || 'medicine',
                    product_id: medForm.product_id ? Number(medForm.product_id) : undefined,
                    quantity: medForm.quantity, unit: medForm.unit,
                    method: medForm.method, shift: currentShift.value,
                    custom_name: medForm.custom_name || undefined,
                    notes: medForm.notes || undefined
                });
                showToast('Đã lưu thuốc', 'success');
                medForm.custom_name = ''; medForm.quantity = 0; medForm.notes = '';
                await loadLogs();
            } catch (e) { showToast(e.message, 'error'); }
        }

        async function saveDeath() {
            if (deathForm.count <= 0) { showToast('Nhập số lượng', 'error'); return; }

            const barnId = selectedCycle.value?.barn_id ? String(selectedCycle.value.barn_id) : '';
            try {
                await API.care.logDeath({
                    cycle_id: Number(selectedCycleId.value), barn_id: barnId,
                    death_date: selectedDate.value, count: deathForm.count,
                    cause: deathForm.cause || undefined,
                    symptoms: deathForm.symptoms || undefined,
                    notes: deathForm.notes || undefined
                });
                showToast('Đã ghi nhận tử vong: ' + deathForm.count + ' con', 'success');
                deathForm.count = 1; deathForm.cause = ''; deathForm.symptoms = ''; deathForm.notes = '';
                await loadLogs();
            } catch (e) { showToast(e.message, 'error'); }
        }

        async function saveWater() {
            if (waterForm.consumption_liters <= 0) { showToast('Nhập lượng nước', 'error'); return; }

            const barnId = selectedCycle.value?.barn_id ? String(selectedCycle.value.barn_id) : '';
            try {
                await API.care.logWater({
                    cycle_id: Number(selectedCycleId.value), barn_id: barnId,
                    water_date: selectedDate.value, shift: currentShift.value,
                    consumption_liters: waterForm.consumption_liters,
                    medicated: waterForm.medicated,
                    notes: waterForm.notes || undefined
                });
                showToast('Đã ghi nhận nước: ' + waterForm.consumption_liters + ' lít', 'success');
                waterForm.consumption_liters = 0; waterForm.medicated = false; waterForm.notes = '';
                await loadLogs();
            } catch (e) { showToast(e.message, 'error'); }
        }

        async function saveHealth() {
            const barnId = selectedCycle.value?.barn_id ? String(selectedCycle.value.barn_id) : '';
            try {
                await API.care.logHealth({
                    cycle_id: Number(selectedCycleId.value), barn_id: barnId,
                    severity: healthForm.severity,
                    symptoms: healthForm.symptoms || null,
                    health_flags: healthForm.health_flags,
                    notes: healthForm.notes || undefined,
                    recorded_at: selectedDate.value,
                    day_age: dayAge.value
                });
                showToast('Đã ghi nhận sức khỏe', 'success');
                healthForm.severity = 'normal'; healthForm.symptoms = '';
                healthForm.health_flags = []; healthForm.notes = '';
                await loadLogs();
            } catch (e) { showToast(e.message, 'error'); }
        }

        // ── Delete handlers ─────────────────────────────
        function askDelete(message, onConfirm) {
            confirmDelete.value = { message, onConfirm };
        }
        function doConfirmDelete() {
            confirmDelete.value.onConfirm();
            confirmDelete.value = null;
        }
        function cancelDelete() { confirmDelete.value = null; }

        async function deleteEntry(type, id) {
            askDelete('Xóa dòng ghi nhận này?', async () => {
                try {
                    const delMap = {
                        feed: () => API.care.delFeed(id),
                        medication: () => API.care.delMedication(id),
                        death: () => API.care.delDeath(id),
                        water: () => API.care.delWater(id),
                        health: () => API.care.delHealth(id),
                    };
                    const fn = delMap[type];
                    if (fn) await fn();
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

        function changeDate(delta) {
            const d = new Date(selectedDate.value);
            d.setDate(d.getDate() + delta);
            selectedDate.value = d.toISOString().slice(0, 10);
        }

        function fmtNum(n, d = 0) {
            if (n == null) return '-';
            return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
        }

        function timeStr(log) {
            const t = log.recorded_at || log.created_at;
            if (!t) return '';
            // Extract HH:MM from datetime
            if (typeof t === 'string' && t.includes('T')) return t.split('T')[1]?.substring(0, 5) || '';
            if (typeof t === 'string' && t.length > 10) return t.substring(11, 16);
            return '';
        }

        // ── Lifecycle ─────────────────────────────
        onMounted(() => loadData());

        return {
            cycles, products, feedLogs, medLogs, deathLogs, waterLogs, healthNotes, medSuggestions,
            selectedCycleId, selectedDate, currentShift, activeTab, loading, submitting,
            feedForm, medForm, deathForm, waterForm, healthForm,
            selectedCycle, dayAge, aliveCount, feedPreviewKg,
            feedProducts, medProducts,
            todayFeedLogs, todayMedLogs, todayDeathLogs, todayWaterLogs, todayHealthNotes,
            shiftFeedLogs, shiftMedLogs, shiftWaterLogs,
            totalKgToday, sangHasFeed, chieuHasFeed, sangHasMed, chieuHasMed, tabCounts,
            medMethodLabels, medTypeLabels, medTypeColour, deathCauseLabels, healthFlagLabels,
            saveFeed, saveMedication, saveDeath, saveWater, saveHealth,
            deleteEntry, applySuggestion, toggleHealthFlag,
            changeDate, fmtNum, timeStr, autoShift,
            confirmDelete, askDelete, doConfirmDelete, cancelDelete
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
                    <p class="cf-care-header-subtitle">Ghi nhận nhanh ăn, thuốc, nước, sức khỏe theo ca</p>
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

        <div class="cf-care-cycle-row">
            <select v-model="selectedCycleId" class="cf-care-cycle-select">
                <option value="">-- Chọn đợt nuôi --</option>
                <option v-for="c in cycles" :key="c.id" :value="c.id">
                    {{ c.name || 'Đợt ' + c.id }} ({{ c.barn_id }})
                </option>
            </select>
            <div v-if="selectedCycle" class="cf-care-cycle-info">
                <span class="cf-care-day-age">Ngày {{ dayAge }}</span>
                <span class="cf-care-count">{{ fmtNum(aliveCount) }} con</span>
            </div>
        </div>

        <!-- Shift toggle -->
        <div class="cf-care-shift-group" style="margin-top: 0.75rem;">
            <button @click="currentShift = 'sang'"
                :class="['cf-care-shift-btn', currentShift === 'sang' ? 'active sang' : '']">
                ☀️ Sáng
                <span v-if="sangHasFeed || sangHasMed" class="cf-care-shift-tick feed-tick">✓</span>
            </button>
            <button @click="currentShift = 'chieu'"
                :class="['cf-care-shift-btn', currentShift === 'chieu' ? 'active chieu' : '']">
                🌆 Chiều
                <span v-if="chieuHasFeed || chieuHasMed" class="cf-care-shift-tick feed-tick">✓</span>
            </button>
        </div>

        <!-- Loading spinner -->
        <div v-if="loading" style="text-align:center;padding:2rem">
            <div class="cf-spinner"></div>
            <p class="cf-loading-text">Đang tải...</p>
        </div>

        <!-- ── QUICK STATS ── -->
        <div class="cf-care-stats-grid">
            <div class="cf-care-stat-card">
                <span class="cf-care-stat-label">Tổng ăn</span>
                <span class="cf-care-stat-val val-amber">{{ fmtNum(totalKgToday, 1) }} kg</span>
                <span class="cf-care-stat-sub">{{ todayFeedLogs.length }} lần hôm nay</span>
            </div>
            <div class="cf-care-stat-card">
                <span class="cf-care-stat-label">Thuốc</span>
                <span class="cf-care-stat-val val-violet">{{ todayMedLogs.length }}</span>
                <span class="cf-care-stat-sub">lượt cấp</span>
            </div>
            <div class="cf-care-stat-card">
                <span class="cf-care-stat-label">Hao hụt</span>
                <span class="cf-care-stat-val val-rose">{{ todayDeathLogs.length }}</span>
                <span class="cf-care-stat-sub">con chết</span>
            </div>
        </div>

        <!-- ── TAB BAR ── -->
        <div class="cf-care-tabs">
            <button @click="activeTab = 'feed'"
                :class="['cf-care-tab-btn', activeTab === 'feed' ? 'active' : '']">
                🌾 Ăn
                <span class="cf-care-tab-btn-badge">{{ tabCounts.feed }}</span>
            </button>
            <button @click="activeTab = 'medication'"
                :class="['cf-care-tab-btn', activeTab === 'medication' ? 'active' : '']">
                💊 Thuốc
                <span class="cf-care-tab-btn-badge">{{ tabCounts.medication }}</span>
            </button>
            <button @click="activeTab = 'death'"
                :class="['cf-care-tab-btn', activeTab === 'death' ? 'active' : '']">
                📉 Tử vong
                <span class="cf-care-tab-btn-badge">{{ tabCounts.death }}</span>
            </button>
            <button @click="activeTab = 'water'"
                :class="['cf-care-tab-btn', activeTab === 'water' ? 'active' : '']">
                💧 Nước
                <span class="cf-care-tab-btn-badge">{{ tabCounts.water }}</span>
            </button>
            <button @click="activeTab = 'health'"
                :class="['cf-care-tab-btn', activeTab === 'health' ? 'active' : '']">
                🩺 Sức khỏe
                <span class="cf-care-tab-btn-badge">{{ tabCounts.health }}</span>
            </button>
        </div>

        <!-- ── FEED TAB ── -->
        <div v-if="activeTab === 'feed'" class="cf-care-tab-body">
            <div class="cf-care-form-card">
                <div class="cf-care-form-header">
                    <span class="cf-care-form-icon feed-icon">🌾</span>
                    <div>
                        <div class="cf-care-form-title">Cho ăn ca {{ currentShift === 'sang' ? 'sáng' : 'chiều' }}</div>
                        <div class="cf-care-form-sub">{{ selectedDate }}</div>
                    </div>
                </div>
                <div class="cf-care-form-body">
                    <div class="cf-care-product-section">
                        <div class="cf-care-product-label">Loại cám</div>
                        <div class="cf-care-product-grid">
                            <button v-for="p in feedProducts" :key="p.id"
                                @click="feedForm.product_id = p.id"
                                :class="['cf-care-product-btn', feedForm.product_id === p.id ? 'selected' : '']">
                                <span class="cf-care-product-name">{{ p.name }}</span>
                                <span v-if="p.kg_per_bag || p.capacity_kg" class="cf-care-product-wpb">
                                    {{ p.kg_per_bag || p.capacity_kg }}kg/bao
                                </span>
                            </button>
                        </div>
                        <div v-if="!feedProducts.length" class="cf-care-empty-list">Chưa có cám trong danh mục</div>
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
                <button @click="saveFeed" class="cf-care-save-btn feed-btn">Lưu phiếu cho ăn</button>
            </div>
            <!-- Feed history -->
            <div class="cf-care-history-card">
                <div class="cf-care-history-header">
                    <span class="cf-care-history-title">Cho ăn hôm nay</span>
                    <span class="cf-care-history-count">{{ shiftFeedLogs.length }} lần</span>
                </div>
                <div class="cf-care-history-list">
                    <div v-if="!shiftFeedLogs.length" class="cf-care-empty-state"><span>🌾</span><p>Chưa ghi nhận ca này</p></div>
                    <div v-for="log in shiftFeedLogs" :key="log.id" class="cf-care-log-item">
                        <div class="cf-care-log-main">
                            <div class="cf-care-log-info">
                                <span class="cf-care-log-product">{{ log.product_name || 'Cám' }}</span>
                                <span class="cf-care-log-time">{{ timeStr(log) }}</span>
                            </div>
                            <span class="cf-care-log-qty">+{{ fmtNum(log.quantity, 1) }} kg</span>
                        </div>
                        <p v-if="log.notes" class="cf-care-log-note">"{{ log.notes }}"</p>
                        <div class="cf-care-log-footer">
                            <span class="cf-care-log-id">ID: {{ log.id }}</span>
                            <button @click="deleteEntry('feed', log.id)" class="cf-care-log-del">Xóa</button>
                        </div>
                    </div>
                </div>
                <div v-if="todayFeedLogs.length > 0" class="cf-care-history-agg">
                    Tổng ngày: {{ fmtNum(totalKgToday, 1) }} kg ({{ todayFeedLogs.length }} lần)
                </div>
            </div>
        </div>

        <!-- ── MEDICATION TAB ── -->
        <div v-if="activeTab === 'medication'" class="cf-care-tab-body">
            <div class="cf-care-form-card">
                <div class="cf-care-form-header">
                    <span class="cf-care-form-icon med-icon">💊</span>
                    <div>
                        <div class="cf-care-form-title">Cấp thuốc thú y</div>
                        <div class="cf-care-form-sub">Ca {{ currentShift === 'sang' ? 'sáng' : 'chiều' }} · {{ selectedDate }}</div>
                    </div>
                </div>
                <div class="cf-care-form-body">
                    <!-- Method -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Đường dùng</label>
                        <select v-model="medForm.method" class="cf-care-form-input">
                            <option v-for="(label, key) in medMethodLabels" :key="key" :value="key">{{ label }}</option>
                        </select>
                    </div>

                    <!-- Suggestions -->
                    <div v-if="medSuggestions.length" class="cf-care-suggestions">
                        <div class="cf-care-suggestions-label">Thuốc đã dùng ({{ selectedCycle?.barn_id }})</div>
                        <div class="cf-care-suggestion-pills">
                            <button v-for="s in medSuggestions" :key="s.name + s.med_type"
                                @click="applySuggestion(s)"
                                class="cf-care-suggestion-pill">
                                {{ s.name }}
                                <span class="cf-care-suggestion-count">({{ s.use_count }}x)</span>
                            </button>
                        </div>
                    </div>

                    <!-- Product grid -->
                    <div class="cf-care-product-section">
                        <div class="cf-care-product-label">Chọn từ kho</div>
                        <div class="cf-care-product-grid">
                            <button v-for="p in medProducts" :key="p.id"
                                @click="medForm.product_id = p.id; medForm.custom_name = ''"
                                :class="['cf-care-product-btn', medForm.product_id === p.id && !medForm.custom_name ? 'selected' : '']">
                                <span class="cf-care-product-name">{{ p.name }}</span>
                            </button>
                        </div>
                        <div v-if="!medProducts.length" class="cf-care-empty-list">Chưa có thuốc trong kho</div>
                    </div>

                    <!-- Custom name -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Tên thuốc (tự khai)</label>
                        <input v-model="medForm.custom_name" type="text" class="cf-care-form-input" placeholder="VD: Amoxicillin 500mg...">
                    </div>

                    <!-- Type -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Loại</label>
                        <select v-model="medForm.med_type" class="cf-care-form-input">
                            <option v-for="(label, key) in medTypeLabels" :key="key" :value="key">{{ label }}</option>
                        </select>
                    </div>

                    <!-- Qty + Unit -->
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
                <button @click="saveMedication" class="cf-care-save-btn med-btn">Xác nhận cấp thuốc</button>
            </div>
            <!-- Med history -->
            <div class="cf-care-history-card">
                <div class="cf-care-history-header">
                    <span class="cf-care-history-title">Thuốc hôm nay</span>
                    <span class="cf-care-history-count">{{ shiftMedLogs.length }} lần</span>
                </div>
                <div class="cf-care-history-list">
                    <div v-if="!shiftMedLogs.length" class="cf-care-empty-state"><span>💊</span><p>Chưa dùng thuốc ca này</p></div>
                    <div v-for="log in shiftMedLogs" :key="log.id" class="cf-care-log-item">
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
                            <button @click="deleteEntry('medication', log.id)" class="cf-care-log-del">Xóa</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── DEATH TAB ── -->
        <div v-if="activeTab === 'death'" class="cf-care-tab-body">
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
                        <input v-model.number="deathForm.count" type="number" min="1" class="cf-care-qty-input" placeholder="0">
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
                        <input v-model="deathForm.symptoms" type="text" class="cf-care-form-input" placeholder="Mô tả triệu chứng...">
                    </div>
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Ghi chú</label>
                        <input v-model="deathForm.notes" type="text" class="cf-care-form-input" placeholder="Ghi chú thêm...">
                    </div>
                </div>
                <button @click="saveDeath" class="cf-care-save-btn death-btn">Ghi nhận tử vong</button>
            </div>
            <!-- Death history -->
            <div class="cf-care-history-card">
                <div class="cf-care-history-header">
                    <span class="cf-care-history-title">Tử vong hôm nay</span>
                    <span class="cf-care-history-count">{{ todayDeathLogs.length }}</span>
                </div>
                <div class="cf-care-history-list">
                    <div v-if="!todayDeathLogs.length" class="cf-care-empty-state"><span>📉</span><p>Không có tử vong hôm nay</p></div>
                    <div v-for="log in todayDeathLogs" :key="log.id" class="cf-care-log-item">
                        <div class="cf-care-log-main">
                            <div class="cf-care-log-info">
                                <span class="cf-care-log-product">{{ log.count }} con{{ log.cause ? ' · ' + deathCauseLabels[log.cause] : '' }}</span>
                                <span class="cf-care-log-time">{{ timeStr(log) }}</span>
                            </div>
                        </div>
                        <p v-if="log.symptoms" class="cf-care-log-note">Triệu chứng: {{ log.symptoms }}</p>
                        <div class="cf-care-log-footer">
                            <span class="cf-care-log-id">ID: {{ log.id }}</span>
                            <button @click="deleteEntry('death', log.id)" class="cf-care-log-del">Xóa</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── WATER TAB ── -->
        <div v-if="activeTab === 'water'" class="cf-care-tab-body">
            <div class="cf-care-form-card">
                <div class="cf-care-form-header">
                    <span class="cf-care-form-icon water-icon">💧</span>
                    <div>
                        <div class="cf-care-form-title">Nước uống</div>
                        <div class="cf-care-form-sub">Ca {{ currentShift === 'sang' ? 'sáng' : 'chiều' }} · {{ selectedDate }}</div>
                    </div>
                </div>
                <div class="cf-care-form-body">
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Lượng nước (lít)</label>
                        <input v-model.number="waterForm.consumption_liters" type="number" min="0" step="0.5" class="cf-care-qty-input" placeholder="0">
                    </div>
                    <div class="cf-care-form-group">
                        <div class="cf-care-checkbox-row">
                            <input type="checkbox" v-model="waterForm.medicated" id="water-medicated" class="cf-care-checkbox">
                            <label for="water-medicated" class="cf-care-form-label cf-care-checkbox-label">Có pha thuốc</label>
                        </div>
                    </div>
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Ghi chú</label>
                        <input v-model="waterForm.notes" type="text" class="cf-care-form-input" placeholder="VD: Thêm điện giải...">
                    </div>
                </div>
                <button @click="saveWater" class="cf-care-save-btn water-btn">Lưu nước uống</button>
            </div>
            <!-- Water history -->
            <div class="cf-care-history-card">
                <div class="cf-care-history-header">
                    <span class="cf-care-history-title">Nước hôm nay</span>
                    <span class="cf-care-history-count">{{ shiftWaterLogs.length }} lần</span>
                </div>
                <div class="cf-care-history-list">
                    <div v-if="!shiftWaterLogs.length" class="cf-care-empty-state"><span>💧</span><p>Chưa ghi nhận ca này</p></div>
                    <div v-for="log in shiftWaterLogs" :key="log.id" class="cf-care-log-item">
                        <div class="cf-care-log-main">
                            <div class="cf-care-log-info">
                                <span class="cf-care-log-product">{{ log.consumption_liters }} lít{{ log.medicated ? ' (có thuốc)' : '' }}</span>
                                <span class="cf-care-log-time">{{ timeStr(log) }}</span>
                            </div>
                        </div>
                        <p v-if="log.notes" class="cf-care-log-note">"{{ log.notes }}"</p>
                        <div class="cf-care-log-footer">
                            <span class="cf-care-log-id">ID: {{ log.id }}</span>
                            <button @click="deleteEntry('water', log.id)" class="cf-care-log-del">Xóa</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── HEALTH TAB ── -->
        <div v-if="activeTab === 'health'" class="cf-care-tab-body">
            <div class="cf-care-form-card">
                <div class="cf-care-form-header">
                    <span class="cf-care-form-icon health-icon">🩺</span>
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
                            <button v-for="opt in [{v:'normal',l:'Bình thường'},{v:'mild',l:'Nhẹ'},{v:'severe',l:'Nặng'}]" :key="opt.v"
                                @click="healthForm.severity = opt.v"
                                :class="['cf-care-product-btn', 'cf-care-severity-btn', healthForm.severity === opt.v ? 'selected' : '']">
                                <span class="cf-care-product-name">{{ opt.l }}</span>
                            </button>
                        </div>
                    </div>
                    <!-- Flags -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Triệu chứng</label>
                        <div class="cf-care-suggestion-pills">
                            <button v-for="(label, flag) in healthFlagLabels" :key="flag"
                                @click="toggleHealthFlag(flag)"
                                :class="['cf-care-suggestion-pill', healthForm.health_flags.includes(flag) ? 'selected' : '']">
                                {{ label }}
                            </button>
                        </div>
                    </div>
                    <!-- Symptoms -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Mô tả triệu chứng</label>
                        <textarea v-model="healthForm.symptoms" rows="2" class="cf-care-form-input" placeholder="Mô tả thêm..." style="resize: none;"></textarea>
                    </div>
                    <!-- Notes -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Ghi chú</label>
                        <input v-model="healthForm.notes" type="text" class="cf-care-form-input" placeholder="Ghi chú thêm...">
                    </div>
                </div>
                <button @click="saveHealth" class="cf-care-save-btn health-btn">Lưu đánh giá</button>
            </div>
            <!-- Health history -->
            <div class="cf-care-history-card">
                <div class="cf-care-history-header">
                    <span class="cf-care-history-title">Sức khỏe hôm nay</span>
                    <span class="cf-care-history-count">{{ todayHealthNotes.length }}</span>
                </div>
                <div class="cf-care-history-list">
                    <div v-if="!todayHealthNotes.length" class="cf-care-empty-state"><span>🩺</span><p>Chưa ghi nhận hôm nay</p></div>
                    <div v-for="log in todayHealthNotes" :key="log.id" class="cf-care-log-item">
                        <div class="cf-care-log-main">
                            <div class="cf-care-log-info">
                                <span class="cf-care-log-product">
                                    {{ log.severity === 'normal' ? 'Bình thường' : log.severity === 'mild' ? 'Nhẹ' : 'Nặng' }}
                                </span>
                                <span class="cf-care-log-time">{{ timeStr(log) }}</span>
                            </div>
                        </div>
                        <p v-if="log.symptoms" class="cf-care-log-note">{{ log.symptoms }}</p>
                        <div class="cf-care-log-footer">
                            <span class="cf-care-log-id">ID: {{ log.id }}</span>
                            <button @click="deleteEntry('health', log.id)" class="cf-care-log-del">Xóa</button>
                        </div>
                    </div>
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
            <div class="cf-modal-box" style="max-width:20rem">
                <div class="cf-modal-body" style="text-align:center;padding:1.5rem">
                    <p style="margin-bottom:1rem">{{ confirmDelete.message }}</p>
                    <div style="display:flex;gap:0.5rem;justify-content:center">
                        <button @click="cancelDelete" class="cf-btn-secondary">Huỷ</button>
                        <button @click="doConfirmDelete" class="cf-btn-danger">Xoá</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `
};
