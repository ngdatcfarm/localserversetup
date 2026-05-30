/**
 * Care Daily - Daily Feed & Medication Logging
 * - Mobile-first: Worker uses on phone to log feed + medication per shift
 * - 2 tabs: Feed | Medication
 * - Semantic .cf-care-* CSS (no Tailwind)
 * - Route: /care-daily — registered in app.js
 */
const { ref, reactive, computed, watch, onMounted } = Vue;

return {
    setup() {
        // ── State ──────────────────────────────────────
        const cycles = ref([]);
        const products = ref([]);
        const warehouses = ref([]);
        const feedLogs = ref([]);
        const medLogs = ref([]);

        const selectedCycleId = ref('');
        const selectedDate = ref(new Date().toISOString().slice(0, 10));
        const currentShift = ref('sang'); // 'sang' | 'chieu'
        const activeTab = ref('feed');    // 'feed' | 'medication'
        const loading = ref(false);

        const feedForm = reactive({
            bag_count: 0,
            manual_qty: 0,
            warehouse_id: '',
            product_id: '',
            notes: ''
        });

        const medForm = reactive({
            med_type: 'medicine',
            product_id: '',
            custom_name: '',
            quantity: 0,
            unit: 'g',
            method: 'water',
            notes: ''
        });

        const medMethodLabels = {
            water: 'Pha nước uống',
            feed: 'Trộn cám',
            inject: 'Tiêm lườn',
            eye_drop: 'Nhỏ mắt/mũi'
        };

        const medTypeLabels = {
            vaccine: 'Phòng dịch',
            antibiotic: 'Kháng sinh',
            vitamin: 'Điện giải',
            probiotic: 'Men tiêu hóa'
        };

        // ── Computed ────────────────────────────────────
        const selectedCycle = computed(() =>
            cycles.value.find(c => c.id == selectedCycleId.value) || cycles.value[0] || null
        );

        const dayAge = computed(() => {
            if (!selectedCycle.value) return 0;
            const start = new Date(selectedCycle.value.start_date);
            const today = new Date(selectedDate.value);
            return Math.max(0, Math.floor((today - start) / (1000 * 60 * 60 * 24)));
        });

        const feedProducts = computed(() => products.value.filter(p => p.product_type === 'feed'));
        const medProducts = computed(() => products.value.filter(p => p.product_type === 'medication' || p.product_type === 'medicine'));
        const feedWarehouses = computed(() => warehouses.value.filter(w => w.warehouse_type === 'feed' || w.warehouse_type === 'mixed'));
        const medWarehouses = computed(() => warehouses.value.filter(w => w.warehouse_type === 'medication' || w.warehouse_type === 'mixed'));

        // Filter logs by cycle + date
        const currentFeedLogs = computed(() =>
            feedLogs.value.filter(log => log.cycle_id === selectedCycleId.value && log.feed_date === selectedDate.value)
        );
        const currentMedLogs = computed(() =>
            medLogs.value.filter(log => log.cycle_id == selectedCycleId.value && log.med_date === selectedDate.value)
        );

        // Filter logs by cycle + date + shift
        const shiftFeedLogs = computed(() =>
            currentFeedLogs.value.filter(l => l.meal === currentShift.value || l.meal === 'all_day')
        );
        const shiftMedLogs = computed(() =>
            currentMedLogs.value.filter(l => l.shift === currentShift.value || l.shift === 'all_day')
        );

        // Whether current shift has any data logged
        const shiftHasFeedData = computed(() => shiftFeedLogs.value.length > 0);
        const shiftHasMedData = computed(() => shiftMedLogs.value.length > 0);

        // Per-shift data flags (independent of currentShift selection)
        const sangHasFeed = computed(() =>
            currentFeedLogs.value.filter(l => l.meal === 'sang').length > 0
        );
        const chieuHasFeed = computed(() =>
            currentFeedLogs.value.filter(l => l.meal === 'chieu').length > 0
        );
        const sangHasMed = computed(() =>
            currentMedLogs.value.filter(l => l.shift === 'sang').length > 0
        );
        const chieuHasMed = computed(() =>
            currentMedLogs.value.filter(l => l.shift === 'chieu').length > 0
        );

        // Totals for widgets
        const totalKgToday = computed(() =>
            currentFeedLogs.value.reduce((sum, log) => sum + (log.quantity || 0), 0)
        );
        const totalMedToday = computed(() => currentMedLogs.value.length);

        const medTypeColour = {
            vaccine: 'cf-care-med-vaccine',
            antibiotic: 'cf-care-med-antibiotic',
            vitamin: 'cf-care-med-vitamin',
            probiotic: 'cf-care-med-probiotic'
        };

        // Auto-set default feed warehouse & product
        watch(() => selectedCycleId.value, () => {
            if (feedWarehouses.value.length && !feedForm.warehouse_id) {
                feedForm.warehouse_id = feedWarehouses.value[0].id;
            }
            if (feedProducts.value.length && !feedForm.product_id) {
                feedForm.product_id = feedProducts.value[0].id;
            }
        }, { immediate: true });

        // Auto-set unit when med product changes
        watch(() => medForm.product_id, (newId) => {
            const prod = medProducts.value.find(p => p.id === newId);
            if (prod) {
                medForm.unit = prod.unit || 'g';
            }
        });

        // ── API ────────────────────────────────────────
        async function loadData() {
            loading.value = true;
            try {
                const [c, p, w] = await Promise.all([
                    API.cycles.list(),
                    API.products.list(),
                    API.warehouses.list(),
                ]);
                cycles.value = c;
                products.value = p;
                warehouses.value = w;

                if (!selectedCycleId.value && cycles.value.length > 0) {
                    const active = cycles.value.find(c => !c.end_date);
                    if (active) selectedCycleId.value = active.id;
                }

                if (feedWarehouses.value.length && !feedForm.warehouse_id) {
                    feedForm.warehouse_id = feedWarehouses.value[0].id;
                }
                if (feedProducts.value.length && !feedForm.product_id) {
                    feedForm.product_id = feedProducts.value[0].id;
                }
                if (medProducts.value.length && !medForm.product_id) {
                    medForm.product_id = medProducts.value[0].id;
                }

                await loadLogs();
            } catch (e) {
                if (typeof showToast === 'function') showToast('Lỗi tải dữ liệu: ' + e.message, 'error');
            } finally {
                loading.value = false;
            }
        }

        async function loadLogs() {
            if (!selectedCycleId.value) return;
            try {
                const [fl, ml] = await Promise.all([
                    API.care.feedHistory(selectedCycleId.value),
                    API.care.medHistory(selectedCycleId.value),
                ]);
                feedLogs.value = Array.isArray(fl) ? fl : [];
                medLogs.value = Array.isArray(ml) ? ml : [];
            } catch (e) {
                feedLogs.value = [];
                medLogs.value = [];
            }
        }

        async function saveFeed() {
            const prod = feedProducts.value.find(p => p.id === feedForm.product_id);
            if (!prod) {
                if (typeof showToast === 'function') showToast('Vui lòng chọn sản phẩm cám', 'error');
                return;
            }

            let finalQty = feedForm.manual_qty;
            if (feedForm.bag_count > 0) {
                const wpb = prod.capacity_kg || prod.kg_per_bag || 25;
                finalQty = feedForm.bag_count * wpb;
            }

            if (finalQty <= 0) {
                if (typeof showToast === 'function') showToast('Vui lòng nhập số lượng cám!', 'error');
                return;
            }

            const barnId = selectedCycle.value?.barn_id ? String(selectedCycle.value.barn_id) : '';

            try {
                await API.care.logFeed({
                    cycle_id: Number(selectedCycleId.value),
                    barn_id: barnId,
                    feed_date: selectedDate.value,
                    meal: currentShift.value,
                    quantity: finalQty,
                    product_id: feedForm.product_id ? Number(feedForm.product_id) : undefined,
                    warehouse_id: feedForm.warehouse_id ? Number(feedForm.warehouse_id) : undefined,
                    notes: feedForm.notes
                });
                if (typeof showToast === 'function') showToast('Đã ghi nhận cho ăn: ' + finalQty + ' kg', 'success');
                feedForm.bag_count = 0;
                feedForm.manual_qty = 0;
                feedForm.notes = '';
                await loadLogs();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function saveMedication() {
            let prodName = medForm.custom_name;
            if (!prodName) {
                const prod = medProducts.value.find(p => p.id === medForm.product_id);
                prodName = prod ? prod.name : 'Dược phẩm thú y';
            }

            if (medForm.quantity <= 0) {
                if (typeof showToast === 'function') showToast('Vui lòng nhập liều lượng!', 'error');
                return;
            }

            const barnId = selectedCycle.value?.barn_id ? String(selectedCycle.value.barn_id) : '';

            try {
                await API.care.logMedication({
                    cycle_id: Number(selectedCycleId.value),
                    barn_id: barnId,
                    med_date: selectedDate.value,
                    med_type: medForm.med_type || 'medicine',
                    product_id: medForm.product_id ? Number(medForm.product_id) : undefined,
                    quantity: medForm.quantity,
                    unit: medForm.unit,
                    method: medForm.method,
                    shift: currentShift.value,
                    warehouse_id: medForm.warehouse_id ? Number(medForm.warehouse_id) : undefined,
                    notes: medForm.notes || undefined,
                });
                if (typeof showToast === 'function') showToast('Đã lưu cấp thuốc thú y!', 'success');
                medForm.custom_name = '';
                medForm.quantity = 0;
                medForm.notes = '';
                await loadLogs();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function deleteLog(type, id) {
            if (!confirm('Xóa dòng ghi nhận này?')) return;
            try {
                if (type === 'feed') {
                    feedLogs.value = feedLogs.value.filter(x => x.id !== id);
                } else {
                    medLogs.value = medLogs.value.filter(x => x.id !== id);
                }
                if (typeof showToast === 'function') showToast('Đã xóa', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
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

        onMounted(() => { loadData(); });

        return {
            cycles, products, warehouses, feedLogs, medLogs,
            selectedCycleId, selectedDate, currentShift, activeTab,
            feedForm, medForm,
            selectedCycle, dayAge,
            feedProducts, medProducts, feedWarehouses, medWarehouses,
            currentFeedLogs, currentMedLogs, shiftFeedLogs, shiftMedLogs,
            totalKgToday, totalMedToday,
            shiftHasFeedData, shiftHasMedData,
            sangHasFeed, chieuHasFeed, sangHasMed, chieuHasMed,
            saveFeed, saveMedication, deleteLog, changeDate,
            medMethodLabels, medTypeLabels, medTypeColour,
            fmtNum
        };
    },

    template: `
    <div class="cf-care-container">

        <!-- ── HEADER BAR ── -->
        <div class="cf-care-header">
            <div class="cf-care-header-top">
                <div class="cf-care-header-left">
                    <div class="cf-care-badge">🐔 CARE NHANH</div>
                    <h1 class="cf-care-title">Nhật ký hàng ngày</h1>
                </div>
                <div class="cf-care-header-right">
                    <!-- Date picker -->
                    <div class="cf-care-date-nav">
                        <button @click="changeDate(-1)" class="cf-care-date-btn">←</button>
                        <input type="date" v-model="selectedDate" class="cf-care-date-input">
                        <button @click="changeDate(1)" class="cf-care-date-btn">→</button>
                    </div>
                    
                </div>
            </div>

            <!-- Cycle selector -->
            <div class="cf-care-cycle-row">
                <select v-model="selectedCycleId" class="cf-care-cycle-select">
                    <option value="">-- Chọn đợt nuôi --</option>
                    <option v-for="c in cycles" :key="c.id" :value="c.id">
                        {{ c.name }} ({{ c.initial_count }} con)
                    </option>
                </select>
                <div v-if="selectedCycle" class="cf-care-cycle-info">
                    <span class="cf-care-day-age">Ngày {{ dayAge }}</span>
                    <span class="cf-care-count">{{ selectedCycle.initial_count?.toLocaleString() }} con</span>
                </div>
            </div>
        </div>

        <!-- ── HEALTH ADVISORY ── -->
        <div v-if="selectedCycle && selectedCycle.species !== 'heo'" class="cf-care-advisory">
            <div class="cf-care-advisory-inner">
                <span class="cf-care-advisory-icon">🏆</span>
                <div class="cf-care-advisory-text">
                    <div class="cf-care-advisory-title">Hướng dẫn mốc {{ dayAge }} ngày tuổi</div>
                    <p class="cf-care-advisory-desc">
                        <span v-if="dayAge <= 15">Đàn úm mẫn cảm. Sưởi ấm chuồng tốt, dùng cám hạt mịn, bổ sung men tiêu hóa Probio.</span>
                        <span v-else>Đàn thả sân cỏ ngoài trời. Duy trì nước sạch, pha Gluco-K-C giải độc trưa nắng.</span>
                    </p>
                </div>
                <span class="cf-care-advisory-tag">Khuyên dùng</span>
            </div>
        </div>


        

        <!-- ── TOTALS WIDGETS ── -->
        <div class="cf-care-totals-row">
            <div class="cf-care-total-card feed-total">
                <div class="cf-care-total-label">TỔNG ĂN HÔM NAY</div>
                <div class="cf-care-total-value">{{ fmtNum(totalKgToday, 1) }} kg</div>
                <div class="cf-care-total-sub">{{ currentFeedLogs.length }} lần ghi nhận</div>
            </div>
            <div class="cf-care-total-card med-total">
                <div class="cf-care-total-label">TỔNG CẤP THUỐC HÔM NAY</div>
                <div class="cf-care-total-value">{{ totalMedToday }}</div>
                <div class="cf-care-total-sub">lượt dùng thú y</div>
            </div>
        </div>
    <!-- Shift switcher -->
            <div class="cf-care-shift-group">
                        <button @click="currentShift = 'sang'"
                            :class="['cf-care-shift-btn', currentShift === 'sang' ? 'active sang' : '']">
                            ☀️ Ca sáng
                            <span v-if="sangHasFeed" class="cf-care-shift-tick feed-tick">✓</span>
                        </button>
                        <button @click="currentShift = 'chieu'"
                            :class="['cf-care-shift-btn', currentShift === 'chieu' ? 'active chieu' : '']">
                            🌆 Ca chiều
                            <span v-if="chieuHasFeed" class="cf-care-shift-tick feed-tick">✓</span>
                        </button>
            </div>
        <!-- ── TAB SWITCHER ── -->
        <div class="cf-care-tabs">
            <button @click="activeTab = 'feed'" :class="['cf-care-tab', activeTab === 'feed' ? 'active' : '']">
                🌾 Cho ăn
            </button>
            <button @click="activeTab = 'medication'" :class="['cf-care-tab', activeTab === 'medication' ? 'active' : '']">
                💊 Cấp thuốc
            </button>
        </div>

        <!-- ── FEED TAB ── -->
        <div v-if="activeTab === 'feed'" class="cf-care-tab-body">

            <!-- Feed Form -->
            <div class="cf-care-form-card">
                <div class="cf-care-form-header">
                    <span class="cf-care-form-icon feed-icon">🌾</span>
                    <div>
                        <div class="cf-care-form-title">Phiếu ghi cho ăn ca {{ currentShift === 'sang' ? 'sáng' : 'chiều' }}</div>
                        <div class="cf-care-form-sub">Ghi nhận lượng cám tiêu thụ trong ca</div>
                    </div>
                </div>

                <div class="cf-care-form-body">
                    <!-- Product grid -->
                    <div class="cf-care-product-section">
                        <div class="cf-care-product-label">Chọn loại cám</div>
                        <div class="cf-care-product-grid">
                            <button v-for="p in feedProducts" :key="p.id"
                                @click="feedForm.product_id = p.id"
                                :class="['cf-care-product-btn', feedForm.product_id === p.id ? 'selected' : '']">
                                <span class="cf-care-product-name">{{ p.name }}</span>
                                <span v-if="p.kg_per_bag || p.capacity_kg" class="cf-care-product-wpb">
                                    {{ p.kg_per_bag || p.capacity_kg || 25 }}kg/bao
                                </span>
                            </button>
                        </div>
                        <div v-if="!feedProducts.length" class="cf-care-empty-list">
                            Chưa có sản phẩm cám nào trong danh mục
                        </div>
                    </div>

                    <!-- Quantity inputs -->
                    <div class="cf-care-qty-row">
                        <div class="cf-care-qty-group">
                            <label class="cf-care-qty-label">Theo bao (25kg/bao)</label>
                            <input v-model.number="feedForm.bag_count" type="number" min="0"
                                class="cf-care-qty-input"
                                placeholder="VD: 3 bao">
                            <span v-if="feedForm.bag_count > 0" class="cf-care-qty-preview">
                                = {{ feedForm.bag_count * (feedProducts.find(p=>p.id===feedForm.product_id)?.kg_per_bag || 25) }} kg
                            </span>
                        </div>
                        <div class="cf-care-qty-group">
                            <label class="cf-care-qty-label">Kg lẻ tinh</label>
                            <input v-model.number="feedForm.manual_qty" type="number" min="0" step="0.1"
                                class="cf-care-qty-input"
                                placeholder="VD: 12.5">
                        </div>
                    </div>

                    <!-- Notes -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Ghi chú bữa ăn</label>
                        <input v-model="feedForm.notes" type="text" class="cf-care-form-input"
                            placeholder="VD: Đàn gà ăn hăng, dọn sạch máng...">
                    </div>
                </div>

                <!-- Shift indicator below form body -->
                <div class="cf-care-shift-indicator-bottom">
                    <span :class="['cf-care-shift-badge', currentShift]">
                        {{ currentShift === 'sang' ? '☀️ Ca sáng' : '🌆 Ca chiều' }}
                    </span>
                    <span class="cf-care-shift-date">{{ selectedDate }}</span>
                </div>

                <button @click="saveFeed" class="cf-care-save-btn feed-btn">
                    ✓ Lưu phiếu cho ăn
                </button>
            </div>

            <!-- Feed History -->
            <div class="cf-care-history-card">
                <div class="cf-care-history-header">
                    <span class="cf-care-history-title">Lịch sử ca {{ currentShift === 'sang' ? 'sáng' : 'chiều' }}</span>
                    <span class="cf-care-history-count">{{ shiftFeedLogs.length }} lần</span>
                </div>
                <div class="cf-care-history-list">
                    <div v-if="!shiftFeedLogs.length" class="cf-care-empty-state">
                        <span>🌾</span>
                        <p>Chưa ghi nhận bữa ăn ca này</p>
                    </div>
                    <div v-for="log in shiftFeedLogs" :key="log.id" class="cf-care-log-item">
                        <div class="cf-care-log-main">
                            <div class="cf-care-log-info">
                                <span class="cf-care-log-product">{{ log.product_name || log.product_id }}</span>
                                <span class="cf-care-log-time">Lúc {{ log.recorded_at || log.created_at }}</span>
                            </div>
                            <span class="cf-care-log-qty">+{{ fmtNum(log.quantity, 1) }} kg</span>
                        </div>
                        <p v-if="log.notes" class="cf-care-log-note">"{{ log.notes }}"</p>
                        <div class="cf-care-log-footer">
                            <span class="cf-care-log-id">ID: {{ (log.id+'').slice(-5) }}</span>
                            <button @click="deleteLog('feed', log.id)" class="cf-care-log-del">✕ Xóa</button>
                        </div>
                    </div>
                </div>
                <div v-if="currentFeedLogs.length > 0" class="cf-care-history-agg">
                    Tổng ngày: {{ fmtNum(totalKgToday, 1) }} kg ({{ currentFeedLogs.length }} lần)
                </div>
            </div>
        </div>

        <!-- ── MEDICATION TAB ── -->
        <div v-if="activeTab === 'medication'" class="cf-care-tab-body">

            <!-- Med Form -->
            <div class="cf-care-form-card">
                <div class="cf-care-form-header">
                    <span class="cf-care-form-icon med-icon">💊</span>
                    <div>
                        <div class="cf-care-form-title">Phiếu cấp thuốc thú y</div>
                        <div class="cf-care-form-sub">Bồi bổ hoặc phòng bệnh cho đàn</div>
                    </div>
                </div>

                <div class="cf-care-form-body">
                    <!-- Method select -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Đường dùng lâm sàng</label>
                        <select v-model="medForm.method" class="cf-care-form-input">
                            <option v-for="(label, key) in medMethodLabels" :key="key" :value="key">{{ label }}</option>
                        </select>
                    </div>

                    <!-- Product grid -->
                    <div class="cf-care-product-section">
                        <div class="cf-care-product-label">Chọn thuốc thú y</div>
                        <div class="cf-care-product-grid">
                            <button v-for="p in medProducts" :key="p.id"
                                @click="medForm.product_id = p.id; medForm.custom_name = ''"
                                :class="['cf-care-product-btn', medForm.product_id === p.id && !medForm.custom_name ? 'selected' : '']">
                                <span class="cf-care-product-name">{{ p.name }}</span>
                                <span class="cf-care-product-type">{{ p.product_type }}</span>
                            </button>
                        </div>
                        <div v-if="!medProducts.length" class="cf-care-empty-list">
                            Chưa có thuốc nào trong danh mục
                        </div>
                    </div>

                    <!-- Custom name override -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Hoặc ghi tên thuốc tự khai</label>
                        <input v-model="medForm.custom_name" type="text" class="cf-care-form-input"
                            placeholder="VD: Thuốc bồi dưỡng gà đặc cấp...">
                    </div>

                    <!-- Quantity + unit -->
                    <div class="cf-care-qty-row">
                        <div class="cf-care-qty-group">
                            <label class="cf-care-qty-label">Liều sử dụng</label>
                            <input v-model.number="medForm.quantity" type="number" min="0"
                                class="cf-care-qty-input"
                                placeholder="VD: 100">
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

                    <!-- Notes -->
                    <div class="cf-care-form-group">
                        <label class="cf-care-form-label">Ghi chú thú y</label>
                        <input v-model="medForm.notes" type="text" class="cf-care-form-input"
                            placeholder="VD: Pha loãng kĩ tránh vón cục...">
                    </div>
                </div>

                <!-- Shift indicator below form body -->
                <div class="cf-care-shift-indicator-bottom">
                    <span :class="['cf-care-shift-badge', currentShift]">
                        {{ currentShift === 'sang' ? '☀️ Ca sáng' : '🌆 Ca chiều' }}
                    </span>
                    <span class="cf-care-shift-date">{{ selectedDate }}</span>
                </div>

                <button @click="saveMedication" class="cf-care-save-btn med-btn">
                    ✓ Xác nhận cấp thuốc thú y
                </button>
            </div>

            <!-- Med History -->
            <div class="cf-care-history-card">
                <div class="cf-care-history-header">
                    <span class="cf-care-history-title">Lịch sử thuốc ca {{ currentShift === 'sang' ? 'sáng' : 'chiều' }}</span>
                    <span class="cf-care-history-count">{{ shiftMedLogs.length }} lần</span>
                </div>
                <div class="cf-care-history-list">
                    <div v-if="!shiftMedLogs.length" class="cf-care-empty-state">
                        <span>💉</span>
                        <p>Chưa dùng thuốc ca này</p>
                    </div>
                    <div v-for="log in shiftMedLogs" :key="log.id" class="cf-care-log-item">
                        <div class="cf-care-log-main">
                            <div class="cf-care-log-info">
                                <span class="cf-care-log-product">{{ log.product_name }}</span>
                                <div class="cf-care-log-meta">
                                    <span v-if="log.med_type" :class="['cf-care-med-type-badge', medTypeColour[log.med_type] || 'cf-care-med-default']">
                                        {{ medTypeLabels[log.med_type] || log.med_type }}
                                    </span>
                                    <span class="cf-care-log-time">Lúc {{ log.recorded_at || log.created_at }}</span>
                                </div>
                            </div>
                            <span class="cf-care-log-qty med-qty">{{ fmtNum(log.quantity) }} {{ log.unit }}</span>
                        </div>
                        <p v-if="log.notes" class="cf-care-log-note">"{{ log.notes }}"</p>
                        <div class="cf-care-log-footer">
                            <span class="cf-care-log-id">ID: {{ (log.id+'').slice(-5) }}</span>
                            <button @click="deleteLog('medication', log.id)" class="cf-care-log-del">✕ Xóa</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    </div>
    `
};
