/**
 * Medications Page - Danh mục thuốc và tồn kho
 */
const { ref, reactive, onMounted, computed } = Vue;

return {
    setup() {
        // ── Helpers ───────────────────────────────────
        const _showToast = (msg, type = 'info') => {
            if (window.showToast) window.showToast(msg, type);
            else console.log(`[${type}] ${msg}`);
        };
        const _fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '-';
        const _fmtNum = (n, d = 0) => n != null ? Number(n).toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-';

        // ── State ──────────────────────────────────────
        const meds = ref([]);
        const warehouses = ref([]);
        const inventoryByMed = ref({});
        const loading = ref(false);
        const loadingStock = ref({});

        const showModal = ref(false);
        const editingId = ref(null);
        const filterCat = ref('');
        const searchText = ref('');
        const showStockModal = ref(false);
        const selectedMed = ref(null);

        const form = reactive({
            name: '', unit: '', category: '', manufacturer: '',
            price_per_unit: null, recommended_dose: '', note: '', status: 'active'
        });

        const categories = ['antibiotic', 'vaccine', 'vitamin', 'probiotic', 'disinfectant', 'other'];

        // ── Computed ────────────────────────────────────
        const filteredMeds = computed(() => {
            let list = meds.value;
            if (filterCat.value) list = list.filter(m => m.category === filterCat.value);
            if (searchText.value) {
                const q = searchText.value.toLowerCase();
                list = list.filter(m => m.name.toLowerCase().includes(q) || (m.manufacturer || '').toLowerCase().includes(q));
            }
            return list;
        });

        // ── API ────────────────────────────────────────
        async function loadMeds() {
            loading.value = true;
            try { meds.value = await API.medications.list(filterCat.value || undefined); }
            catch(e) { _showToast(e.message, 'error'); }
            finally { loading.value = false; }
        }

        async function loadWarehouses() {
            try { warehouses.value = await API.warehouses.list(); }
            catch(e) { console.warn('Không tải được kho:', e); }
        }

        async function loadStockForMed(medId) {
            if (inventoryByMed.value[medId]) return;
            loadingStock.value[medId] = true;
            try {
                const all = await API.inventory.list();
                const med = meds.value.find(m => m.id === medId);
                if (!med) return;
                const stocks = all.filter(inv => inv.product_name && inv.product_name.toLowerCase().includes(med.name.toLowerCase()));
                inventoryByMed.value[medId] = stocks.map(inv => ({
                    warehouse_id: inv.warehouse_id,
                    warehouse_name: inv.warehouse_name || 'Kho ' + inv.warehouse_id,
                    quantity: inv.quantity,
                    unit: inv.unit || ''
                }));
            } catch(e) {
                console.warn('Không tải được tồn kho:', e);
                inventoryByMed.value[medId] = [];
            } finally {
                loadingStock.value[medId] = false;
            }
        }

        function openStockModal(med) {
            selectedMed.value = med;
            loadStockForMed(med.id);
            showStockModal.value = true;
        }

        function openModal(med = null) {
            editingId.value = med ? med.id : null;
            if (med) {
                Object.assign(form, {
                    name: med.name, unit: med.unit || '', category: med.category || '',
                    manufacturer: med.manufacturer || '', price_per_unit: med.price_per_unit,
                    recommended_dose: med.recommended_dose || '', note: med.note || '', status: med.status
                });
            } else {
                Object.assign(form, {
                    name: '', unit: 'g', category: '', manufacturer: '',
                    price_per_unit: null, recommended_dose: '', note: '', status: 'active'
                });
            }
            showModal.value = true;
        }

        async function save() {
            if (!form.name.trim()) { _showToast('Tên thuốc không được trống', 'error'); return; }
            try {
                if (editingId.value) {
                    await API.medications.update(editingId.value, { ...form });
                    _showToast('Đã cập nhật thuốc');
                } else {
                    await API.medications.create({ ...form });
                    _showToast('Đã thêm thuốc mới');
                }
                showModal.value = false;
                await loadMeds();
            } catch(e) { _showToast(e.message, 'error'); }
        }

        async function del(med) {
            if (!confirm(`Xóa thuốc "${med.name}"?`)) return;
            try {
                await API.medications.del(med.id);
                _showToast('Đã xóa');
                await loadMeds();
            } catch(e) { _showToast(e.message, 'error'); }
        }

        onMounted(() => { loadMeds(); loadWarehouses(); });

        return {
            meds: filteredMeds, warehouses, inventoryByMed, loading, loadingStock,
            showModal, editingId, filterCat, searchText, showStockModal, selectedMed,
            form, categories,
            loadMeds, openModal, save, del, openStockModal,
            fmtDate: _fmtDate, fmtNum: _fmtNum
        };
    },

    template: `
    <div class="medications-page">
        <!-- Header -->
        <div class="page-header">
            <div class="header-icon">💊</div>
            <div>
                <h2 class="page-title">Quản lý Thuốc</h2>
                <p class="page-subtitle">Danh mục thuốc và tồn kho theo kho</p>
            </div>
        </div>

        <!-- Toolbar -->
        <div class="action-bar">
            <input v-model="searchText" class="form-input" placeholder="🔍 Tìm tên thuốc..." style="max-width: 240px;">
            <select v-model="filterCat" @change="loadMeds" class="select">
                <option value="">Tất cả loại</option>
                <option v-for="c in categories" :value="c">{{ c }}</option>
            </select>
            <button @click="openModal()" class="btn btn-primary">+ Thêm thuốc</button>
        </div>

        <!-- Table -->
        <div class="card">
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Tên thuốc</th>
                            <th>Loại</th>
                            <th>ĐVT</th>
                            <th class="text-right">Giá (VND)</th>
                            <th>Liều dùng</th>
                            <th class="text-center">Tồn kho</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="m in meds" :key="m.id">
                            <td class="fw-500">{{ m.name }}</td>
                            <td>
                                <span v-if="m.category" class="badge badge-purple">{{ m.category }}</span>
                                <span v-else class="text-gray-400">-</span>
                            </td>
                            <td>{{ m.unit || '-' }}</td>
                            <td class="text-right">{{ m.price_per_unit ? fmtNum(m.price_per_unit, 0) : '-' }}</td>
                            <td class="text-gray-500 text-xs">{{ m.recommended_dose || '-' }}</td>
                            <td class="text-center">
                                <button @click="openStockModal(m)"
                                    class="btn btn-sm"
                                    :class="inventoryByMed[m.id]?.length ? 'btn-outline' : 'btn-ghost'">
                                    <span v-if="loadingStock[m.id]">...</span>
                                    <span v-else-if="inventoryByMed[m.id]?.length">
                                        {{ inventoryByMed[m.id].length }} kho
                                    </span>
                                    <span v-else>Kiểm tra</span>
                                </button>
                            </td>
                            <td class="actions">
                                <button @click="openModal(m)" class="btn-icon" title="Sửa">✏️</button>
                                <button @click="del(m)" class="btn-icon danger" title="Xóa">🗑️</button>
                            </td>
                        </tr>
                        <tr v-if="!meds.length">
                            <td colspan="7" class="empty-table">
                                <div class="text-4xl mb-2">💊</div>
                                <p>Chưa có thuốc nào trong danh mục</p>
                                <button @click="openModal()" class="btn btn-primary mt-3">+ Thêm thuốc đầu tiên</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Modal Thêm/Sửa thuốc -->
        <div v-if="showModal" class="modal-overlay" @click.self="showModal=false">
            <div class="modal">
                <div class="modal-header">
                    <h3>{{ editingId ? '✏️ Sửa thuốc' : '➕ Thêm thuốc mới' }}</h3>
                    <button @click="showModal=false" class="btn-icon">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group"><label>Tên thuốc *</label>
                        <input v-model="form.name" class="form-input" placeholder="VD: Sunpha Tiger"></div>
                    <div class="form-row">
                        <div class="form-group"><label>Loại</label>
                            <select v-model="form.category" class="form-input">
                                <option value="">-- Chọn --</option>
                                <option v-for="c in categories" :value="c">{{ c }}</option>
                            </select></div>
                        <div class="form-group"><label>Đơn vị</label>
                            <input v-model="form.unit" class="form-input" placeholder="g, ml, viên"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>Hãng sản xuất</label>
                            <input v-model="form.manufacturer" class="form-input"></div>
                        <div class="form-group"><label>Giá/ĐVT (VND)</label>
                            <input v-model.number="form.price_per_unit" type="number" class="form-input"></div>
                    </div>
                    <div class="form-group"><label>Liều dùng khuyến nghị</label>
                        <input v-model="form.recommended_dose" class="form-input" placeholder="VD: 1g/10L nước"></div>
                    <div class="form-group"><label>Ghi chú</label>
                        <input v-model="form.note" class="form-input"></div>
                </div>
                <div class="modal-footer">
                    <button @click="showModal=false" class="btn">Hủy</button>
                    <button @click="save" class="btn btn-primary">Lưu</button>
                </div>
            </div>
        </div>

        <!-- Modal Xem tồn kho -->
        <div v-if="showStockModal" class="modal-overlay" @click.self="showStockModal=false">
            <div class="modal">
                <div class="modal-header">
                    <h3>📦 Tồn kho: {{ selectedMed?.name }}</h3>
                    <button @click="showStockModal=false" class="btn-icon">✕</button>
                </div>
                <div class="modal-body">
                    <div v-if="loadingStock[selectedMed?.id]" class="text-center py-4 text-gray-400">
                        Đang tải dữ liệu...
                    </div>
                    <div v-else-if="!inventoryByMed[selectedMed?.id]?.length" class="text-center py-4 text-gray-400">
                        <div class="text-4xl mb-2">📭</div>
                        Không tìm thấy tồn kho cho thuốc này
                    </div>
                    <div v-else class="space-y-2">
                        <div v-for="stock in inventoryByMed[selectedMed.id]" :key="stock.warehouse_id"
                            class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div>
                                <div class="font-medium">{{ stock.warehouse_name }}</div>
                                <div class="text-xs text-gray-400">Mã kho: {{ stock.warehouse_id }}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-2xl font-bold" :class="stock.quantity > 0 ? 'text-green-600' : 'text-red-500'">
                                    {{ fmtNum(stock.quantity) }}
                                </div>
                                <div class="text-xs text-gray-400">{{ stock.unit || selectedMed?.unit }}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button @click="showStockModal=false" class="btn">Đóng</button>
                </div>
            </div>
        </div>
    </div>
    `
};
