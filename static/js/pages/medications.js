/**
 * Medications Page - Danh mục thuốc và tồn kho
 * - Semantic .cf-* CSS classes (no Tailwind)
 * - Modal form for create/edit
 * - Stock modal per medication
 * - showToast called with typeof guard
 */
const { ref, reactive, onMounted, computed } = Vue;

export default{
    setup() {
        // ── State ──────────────────────────────────────
        const meds = ref([]);
        const warehouses = ref([]);
        const inventoryByMed = ref({});
        const loading = ref(false);
        const loadingStock = ref({});
        const showModal = ref(false);
        const showStockModal = ref(false);
        const editingId = ref(null);
        const selectedMed = ref(null);
        const filterCat = ref('');
        const searchText = ref('');

        const form = reactive({
            name: '', unit: 'g', packaging: '', unit_spec: '', category: '', manufacturer: '',
            price_per_unit: null, recommended_dose: '', note: '', status: 'active'
        });

        const categories = ['antibiotic', 'vaccine', 'vitamin', 'probiotic', 'disinfectant', 'other'];

        // ── Parse unit_spec from packaging text ──────────
        // "Túi 100g" → "100g", "Chai 1L" → "1000ml", "Hộp 10 chai" → "10 chai"
        function parseUnitSpec(packaging) {
            if (!packaging) return '';
            const text = packaging.trim();
            // Try to find a number followed by a unit
            const match = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|con|chai|túi|gói|hộp|viên|lọ)/i);
            if (!match) return '';
            let qty = parseFloat(match[1].replace(',', '.'));
            const unit = match[2].toLowerCase().trim();
            // Normalize to base units
            if (unit === 'kg') qty = qty * 1000;          // kg → g
            else if (unit === 'l') qty = qty * 1000;       // L → ml
            else if (unit === 'túi' || unit === 'gói' || unit === 'chai' || unit === 'hộp' || unit === 'viên' || unit === 'lọ' || unit === 'con') {
                return qty + ' ' + unit;               // keep as-fabricated unit
            }
            return qty + ' ' + unit;
        }

        // ── Computed ────────────────────────────────────
        const filteredMeds = computed(() => {
            let list = meds.value;
            if (filterCat.value) list = list.filter(m => m.category === filterCat.value);
            if (searchText.value) {
                const q = searchText.value.toLowerCase();
                list = list.filter(m =>
                    m.name.toLowerCase().includes(q) ||
                    (m.manufacturer || '').toLowerCase().includes(q) ||
                    (m.packaging || '').toLowerCase().includes(q)
                );
            }
            return list;
        });

        // ── API ────────────────────────────────────────
        async function loadMeds() {
            loading.value = true;
            try {
                meds.value = await API.medications.list(filterCat.value || undefined);
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            } finally {
                loading.value = false;
            }
        }

        async function loadWarehouses() {
            try { warehouses.value = await API.warehouses.list(); }
            catch (e) { console.warn('Không tải được kho:', e); }
        }

        async function loadStockForMed(medId) {
            if (inventoryByMed.value[medId]) return;
            loadingStock.value[medId] = true;
            try {
                const med = meds.value.find(m => m.id === medId);
                if (!med) return;
                const all = await API.inventory.list();
                const stocks = all.filter(inv =>
                    inv.product_name && inv.product_name.toLowerCase().includes(med.name.toLowerCase())
                );
                inventoryByMed.value[medId] = stocks.map(inv => ({
                    warehouse_id: inv.warehouse_id,
                    warehouse_name: inv.warehouse_name || 'Kho ' + inv.warehouse_id,
                    quantity: inv.quantity,
                    unit: inv.unit || ''
                }));
            } catch (e) {
                console.warn('Không tải được tồn kho:', e);
                inventoryByMed.value[medId] = [];
            } finally {
                loadingStock.value[medId] = false;
            }
        }

        // ── Modal helpers ───────────────────────────────
        function openModal(med = null) {
            editingId.value = med ? med.id : null;
            if (med) {
                Object.assign(form, {
                    name: med.name, unit: med.unit || 'g', packaging: med.packaging || '',
                    unit_spec: med.unit_spec || '',   // restore from DB
                    category: med.category || '', manufacturer: med.manufacturer || '',
                    price_per_unit: med.price_per_unit, recommended_dose: med.recommended_dose || '',
                    note: med.note || '', status: med.status
                });
            } else {
                Object.assign(form, {
                    name: '', unit: 'g', packaging: '', unit_spec: '',
                    category: '', manufacturer: '',
                    price_per_unit: null, recommended_dose: '', note: '', status: 'active'
                });
            }
            showModal.value = true;
        }

        function openStockModal(med) {
            selectedMed.value = med;
            loadStockForMed(med.id);
            showStockModal.value = true;
        }

        function closeModal() { showModal.value = false; }
        function closeStockModal() { showStockModal.value = false; }

        // ── Save / Delete ────────────────────────────────
        async function save() {
            if (!form.name.trim()) {
                if (typeof showToast === 'function') showToast('Tên thuốc không được trống', 'error');
                return;
            }
            try {
                if (editingId.value) {
                    await API.medications.update(editingId.value, { ...form });
                    if (typeof showToast === 'function') showToast('Đã cập nhật thuốc', 'success');
                } else {
                    await API.medications.create({ ...form });
                    if (typeof showToast === 'function') showToast('Đã thêm thuốc mới', 'success');
                }
                closeModal();
                await loadMeds();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function delMed(med) {
            if (!confirm('Xóa thuốc "' + med.name + '"?')) return;
            try {
                await API.medications.del(med.id);
                if (typeof showToast === 'function') showToast('Đã xóa thành công', 'success');
                await loadMeds();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Helpers ─────────────────────────────────────
        function fmtDate(d) {
            if (!d) return '-';
            return new Date(d).toLocaleDateString('vi-VN');
        }

        function fmtNum(n, decimals = 0) {
            if (n == null) return '-';
            return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        }

        onMounted(() => { loadMeds(); loadWarehouses(); });

        return {
            meds: filteredMeds, warehouses, inventoryByMed, loading, loadingStock,
            showModal, showStockModal, editingId, selectedMed,
            filterCat, searchText, form, categories,
            loadMeds, openModal, openStockModal, closeModal, closeStockModal,
            save, delMed,
            fmtDate, fmtNum
        };
    },

    template: `
    <div class="cf-container">

        <!-- Header -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon" style="background-color: #7c3aed;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10.5 20.5L3 13l1.4-1.4 6.1 6.1 12.6-12.6L21.7 6.5z"/>
                        <path d="M8.5 8.5l3 3"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">Quản lý Thuốc</h1>
                    <p class="cf-subtitle">Danh mục thuốc và tồn kho theo kho</p>
                </div>
            </div>
        </div>

        <!-- Toolbar -->
        <div class="cf-med-toolbar">
            <input v-model="searchText" type="text" class="cf-search-input" placeholder="🔍 Tìm tên thuốc..." style="max-width: 240px;">
            <select v-model="filterCat" @change="loadMeds" class="cf-select">
                <option value="">Tất cả loại</option>
                <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
            </select>
            <button @click="openModal()" class="cf-btn-primary" style="background-color: #7c3aed; margin-left: auto;">
                + Thêm thuốc
            </button>
        </div>

        <!-- Table -->
        <div class="cf-card" style="padding: 0;">
            <div class="cf-table-wrapper">
                <table class="cf-table">
                    <thead>
                        <tr>
                            <th>Tên thuốc</th>
                            <th>Quy cách đóng gói</th>
                            <th>Loại</th>
                            <th>ĐVT</th>
                            <th class="text-right">Giá (VND)</th>
                            <th>Liều dùng</th>
                            <th class="text-center">Tồn kho</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="m in meds" :key="m.id" class="cf-table-tr">
                            <td class="cf-med-name">{{ m.name }}</td>
                            <td>
                                <span class="cf-med-packaging">
                                    📦 {{ m.packaging || 'Chưa rõ' }}
                                </span>
                            </td>
                            <td>
                                <span v-if="m.category" class="cf-badge cf-badge-purple">{{ m.category }}</span>
                                <span v-else class="cf-text-muted">-</span>
                            </td>
                            <td class="cf-text-muted">{{ m.unit || '-' }}</td>
                            <td class="text-right cf-med-price">
                                {{ m.price_per_unit ? fmtNum(m.price_per_unit, 0) + ' đ' : '-' }}
                            </td>
                            <td class="cf-med-dose">{{ m.recommended_dose || '-' }}</td>
                            <td class="text-center">
                                <button @click="openStockModal(m)"
                                    class="cf-btn-sm"
                                    :class="inventoryByMed[m.id]?.length ? 'cf-btn-outline' : 'cf-btn-ghost'">
                                    <span v-if="loadingStock[m.id]">...</span>
                                    <span v-else-if="inventoryByMed[m.id]?.length">
                                        {{ inventoryByMed[m.id].length }} kho
                                    </span>
                                    <span v-else>Kiểm tra</span>
                                </button>
                            </td>
                            <td>
                                <div class="cf-med-row-actions">
                                    <button @click="openModal(m)" class="cf-btn-icon-sm" title="Sửa">✏️</button>
                                    <button @click="delMed(m)" class="cf-btn-icon-sm danger" title="Xóa">🗑️</button>
                                </div>
                            </td>
                        </tr>
                        <tr v-if="!meds.length">
                            <td colspan="8" class="cf-table-empty">
                                <div class="cf-med-empty-icon">💊</div>
                                <p>Chưa có thuốc nào trong danh mục</p>
                                <button @click="openModal()" class="cf-btn-primary mt-3" style="background-color: #7c3aed;">
                                    + Thêm thuốc đầu tiên
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- ── MODAL: ADD/EDIT MEDICATION ── -->
        <teleport to="body">
            <div v-if="showModal" class="cf-modal-overlay" @click.self="closeModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #f3e8ff; color: #7c3aed;">💊</div>
                            <h3 class="cf-modal-title">{{ editingId ? 'Sửa thuốc' : 'Thêm thuốc mới' }}</h3>
                        </div>
                        <button @click="closeModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="save">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Tên thuốc <span class="req">*</span></label>
                                <input v-model="form.name" type="text" class="cf-input" placeholder="VD: Sunpha Tiger" required>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Quy cách đóng gói nhập kho</label>
                                <input v-model="form.packaging" type="text" class="cf-input" placeholder="VD: Gói 1kg, Túi 100g, Hộp 10 chai">
                            </div>
                            <div class="cf-form-row">
                                <div class="cf-form-group">
                                    <label class="cf-label">Loại</label>
                                    <select v-model="form.category" class="cf-input">
                                        <option value="">-- Chọn --</option>
                                        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
                                    </select>
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Đơn vị định lượng lẻ</label>
                                    <input v-model="form.unit" type="text" class="cf-input" placeholder="g, ml, viên">
                                </div>
                            </div>
                            <div class="cf-form-row">
                                <div class="cf-form-group">
                                    <label class="cf-label">Hãng sản xuất</label>
                                    <input v-model="form.manufacturer" type="text" class="cf-input">
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Giá/ĐVT (VND)</label>
                                    <input v-model.number="form.price_per_unit" type="number" class="cf-input">
                                </div>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Liều dùng khuyến nghị</label>
                                <input v-model="form.recommended_dose" type="text" class="cf-input" placeholder="VD: 1g/10L nước">
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Ghi chú</label>
                                <input v-model="form.note" type="text" class="cf-input">
                            </div>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeModal" class="cf-btn-secondary">Hủy bỏ</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #7c3aed;">Lưu thuốc</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

        <!-- ── MODAL: STOCK PER MEDICATION ── -->
        <teleport to="body">
            <div v-if="showStockModal" class="cf-modal-overlay" @click.self="closeStockModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #dcfce7; color: #15803d;">📦</div>
                            <h3 class="cf-modal-title">Tồn kho: {{ selectedMed?.name }}</h3>
                        </div>
                        <button @click="closeStockModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <div class="cf-modal-body">
                        <div v-if="loadingStock[selectedMed?.id]" class="cf-med-stock-loading">
                            Đang tải dữ liệu...
                        </div>
                        <div v-else-if="!inventoryByMed[selectedMed?.id]?.length" class="cf-med-stock-empty">
                            <div class="cf-med-empty-icon">📭</div>
                            <p>Không tìm thấy tồn kho cho thuốc này</p>
                        </div>
                        <div v-else class="cf-med-stock-list">
                            <div v-for="stock in inventoryByMed[selectedMed.id]" :key="stock.warehouse_id"
                                class="cf-med-stock-item">
                                <div class="cf-med-stock-wh">
                                    <div class="cf-med-stock-wh-name">{{ stock.warehouse_name }}</div>
                                    <div class="cf-med-stock-wh-code">Mã kho: {{ stock.warehouse_id }}</div>
                                </div>
                                <div class="cf-med-stock-qty">
                                    <div class="cf-med-stock-number">{{ fmtNum(stock.quantity) }}</div>
                                    <div class="cf-med-stock-unit">{{ stock.unit || selectedMed?.unit }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="cf-modal-footer">
                        <button @click="closeStockModal" class="cf-btn-secondary">Đóng</button>
                    </div>
                </div>
            </div>
        </teleport>

    </div>
    `
};
