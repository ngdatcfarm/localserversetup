/**
 * Inventory Detail Page - Chi tiết kho theo warehouse ID
 * URL: /inventory/:warehouseId
 */
const { ref, computed, onMounted, watch } = Vue;

const component = {
    template: `
    <div class="inventory-detail-page space-y-4">
        <!-- Back button & Header -->
        <div class="flex items-center gap-3">
            <button @click="$router.push('/inventory')" class="btn btn-sm btn-secondary">← Danh sach kho</button>
            <div class="flex-1">
                <h2 class="page-title">{{ detailWh?.name || 'Chi tiet kho' }}</h2>
                <p v-if="detailWh" class="text-sm text-gray-500">
                    <span v-if="detailWh.warehouse_type === 'feed'" class="badge badge-yellow">Cam</span>
                    <span v-else-if="detailWh.warehouse_type === 'medication'" class="badge badge-blue">Thuoc</span>
                    <span v-else class="badge badge-gray">Hop nhat</span>
                    <span class="ml-2">{{ detailWh.is_central ? 'Kho trung tam' : 'Kho chuong ' + detailWh.barn_id }}</span>
                </p>
            </div>
        </div>

        <!-- Import/Export Cards Grid -->
        <div v-if="detailWh" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Import Card -->
            <div class="card border-l-4 border-green-500">
                <h3 class="font-semibold mb-3 text-green-700">Nhap kho</h3>
                <div v-if="detailWh.warehouse_type === 'feed'" class="space-y-3">
                    <div class="form-group"><label>Loai cam</label>
                        <select v-model="detailImport.feed_type_id" @change="updateDetailFeedKg('import')" class="form-input">
                            <option value="">-- Chon loai cam --</option>
                            <option v-for="ft in feedTypes" :key="ft.id" :value="ft.id">{{ ft.name }} ({{ ft.brand_name }})</option>
                        </select>
                    </div>
                    <div class="form-group"><label>So luong (bao)</label>
                        <input v-model.number="detailImport.quantity" type="number" class="form-input">
                    </div>
                    <div v-if="detailImport.feed_kg_per_bag" class="text-xs text-gray-500">
                        = {{ detailImport.quantity * detailImport.feed_kg_per_bag }} kg
                    </div>
                    <div class="form-group"><label>Ghi chu</label><input v-model="detailImport.note" class="form-input"></div>
                    <button :disabled="!detailImport.feed_type_id || !detailImport.quantity" class="btn btn-primary w-full" @click="doDetailImport">Nhap kho</button>
                </div>
                <div v-else-if="detailWh.warehouse_type === 'medication'" class="space-y-3">
                    <div class="form-group"><label>Thuoc</label>
                        <select v-model="detailImport.medication_id" @change="onMedicationSelect('import')" class="form-input">
                            <option value="">-- Chon thuoc --</option>
                            <option v-for="m in medications" :key="m.id" :value="m.id">{{ m.name }}</option>
                        </select>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>So luong</label>
                            <input v-model.number="detailImport.quantity" type="number" class="form-input" placeholder="VD: 10">
                        </div>
                        <div class="form-group"><label>Don vi</label>
                            <select v-model="detailImport.unit" class="form-input">
                                <option value="">-- Don vi --</option>
                                <option value="chai">Chai</option>
                                <option value="loc">Loc</option>
                                <option value="goi">Goi</option>
                                <option value="vie">Vie</option>
                                <option value="liều">Liều</option>
                                <option value="ml">ml</option>
                                <option value="g">g</option>
                                <option value="kg">kg</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>Dung tich / Khoi luong don vi</label>
                            <input v-model.number="detailImport.unit_size" type="number" step="0.1" class="form-input" placeholder="VD: 100">
                        </div>
                        <div class="form-group"><label>Don vi tinh</label>
                            <select v-model="detailImport.unit_size_type" class="form-input">
                                <option value="ml">ml</option>
                                <option value="g">g</option>
                                <option value="kg">kg</option>
                                <option value="liu">Lít</option>
                                <option value="liu">Liều</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group"><label>Tong tien nhap kho (VND)</label>
                        <input v-model.number="detailImport.total_price" type="number" class="form-input" placeholder="VD: 500000">
                    </div>
                    <div v-if="detailImport.quantity && detailImport.total_price" class="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                        Don gia: <strong>{{ fmtNum(detailImport.total_price / detailImport.quantity) }} VND/{{ detailImport.unit || 'dv' }}</strong>
                    </div>
                    <div class="form-group"><label>Nha cung cap</label>
                        <input v-model="detailImport.supplier" list="supplier-datalist" class="form-input" placeholder="Bat dau goi de chon NCC...">
                        <datalist id="supplier-datalist">
                            <option v-for="s in suppliers" :key="s.id" :value="s.name">
                        </datalist>
                    </div>
                    <div class="form-group"><label>Ghi chu</label><input v-model="detailImport.note" class="form-input" placeholder="VD: Lot 001"></div>
                    <button :disabled="!detailImport.medication_id || !detailImport.quantity || !detailImport.total_price" class="btn btn-primary w-full" @click="doDetailImport">Nhap kho</button>
                </div>
            </div>

            <!-- Export Card -->
            <div class="card border-l-4 border-red-500">
                <h3 class="font-semibold mb-3 text-red-700">Xuat kho</h3>
                <div v-if="detailWh.warehouse_type === 'feed'" class="space-y-3">
                    <div class="form-group"><label>Loai cam</label>
                        <select v-model="detailExport.feed_type_id" @change="updateDetailFeedKg('export')" class="form-input">
                            <option value="">-- Chon loai cam --</option>
                            <option v-for="ft in feedTypes" :key="ft.id" :value="ft.id">{{ ft.name }} ({{ ft.brand_name }})</option>
                        </select>
                    </div>
                    <div class="form-group"><label>So luong (bao)</label>
                        <input v-model.number="detailExport.quantity" type="number" class="form-input">
                    </div>
                    <div v-if="detailExport.feed_kg_per_bag" class="text-xs text-gray-500">
                        = {{ detailExport.quantity * detailExport.feed_kg_per_bag }} kg
                    </div>
                    <div class="form-group"><label>Ghi chu</label><input v-model="detailExport.note" class="form-input"></div>
                    <button :disabled="!detailExport.feed_type_id || !detailExport.quantity" class="btn btn-danger w-full" @click="doDetailExport">Xuat kho</button>
                </div>
                <div v-else-if="detailWh.warehouse_type === 'medication'" class="space-y-3">
                    <div class="form-group"><label>Thuoc</label>
                        <select v-model="detailExport.medication_id" @change="onMedicationSelect('export')" class="form-input">
                            <option value="">-- Chon thuoc --</option>
                            <option v-for="m in medications" :key="m.id" :value="m.id">{{ m.name }}</option>
                        </select>
                    </div>
                    <div class="form-group"><label>Ly do xuat</label>
                        <select v-model="detailExport.export_type" class="form-input" @change="onExportTypeChange">
                            <option value="">--</option>
                            <option value="ban">Ban hang</option>
                            <option value="chuyen">Chuyen kho khac</option>
                            <option value="thu_hoi">Thu hoi ve kho trung tam</option>
                            <option value="het_han">Het han / Do di</option>
                        </select>
                    </div>
                    <!-- Chon kho dich khi chuyen -->
                    <div v-if="detailExport.export_type === 'chuyen'" class="form-group">
                        <label>Chuyen sang kho</label>
                        <select v-model="detailExport.target_warehouse_id" class="form-input">
                            <option value="">-- Chon kho --</option>
                            <option v-for="w in otherWarehouses" :key="w.id" :value="w.id">{{ w.name }} ({{ w.warehouse_type }})</option>
                        </select>
                    </div>
                    <div class="form-group"><label>So luong</label>
                        <div class="flex gap-2">
                            <input v-model.number="detailExport.quantity" type="number" class="form-input flex-1" placeholder="0">
                            <button v-if="detailExport.medication_id" @click="autoFillExportQty" class="btn btn-sm btn-secondary" title="Lay so luong ton kho">Tu dong</button>
                        </div>
                    </div>
                    <div class="form-group"><label>Ghi chu</label><input v-model="detailExport.note" class="form-input" placeholder="VD: Ban cho khach X, Ly do..."></div>
                    <button :disabled="!canExport" class="btn btn-danger w-full" @click="doDetailExport">Xuat kho</button>
                </div>
            </div>
        </div>

        <!-- Current Stock -->
        <div v-if="detailWhStock.length" class="card">
            <h3 class="font-semibold mb-3">Ton kho hien tai</h3>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>San pham</th><th>Don vi</th><th>So luong</th><th>Muc toi thieu</th><th>Tinh trang</th></tr></thead>
                    <tbody>
                        <tr v-for="s in detailWhStock" :key="s.product_id" :class="s.min_stock_alert && s.quantity <= s.min_stock_alert ? 'bg-red-50' : ''">
                            <td class="font-medium">{{ s.product_name }}</td>
                            <td>{{ detailWh?.warehouse_type === 'feed' ? 'kg' : s.unit }}</td>
                            <td class="font-semibold" :class="s.min_stock_alert && s.quantity <= s.min_stock_alert ? 'text-red-600' : 'text-green-600'">
                                {{ detailWh?.warehouse_type === 'feed' ? fmtNum(s.quantity / (defaultKgPerBag || 25), 2) : fmtNum(s.quantity, 2) }}
                            </td>
                            <td>{{ s.min_stock_alert ? fmtNum(s.min_stock_alert) : '-' }}</td>
                            <td>
                                <span v-if="s.min_stock_alert && s.quantity <= s.min_stock_alert" class="badge badge-red">Duoi toi thieu</span>
                                <span v-else-if="s.min_stock_alert && s.quantity <= s.min_stock_alert * 1.5" class="badge badge-yellow">Gan toi thieu</span>
                                <span v-else class="badge badge-green">Binh thuong</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        <div v-else-if="detailWh && !loadingStock" class="card empty-state"><p>Kho trong</p></div>
        <div v-else-if="loadingStock" class="card empty-state"><p>Dang tai...</p></div>

        <!-- History Tabs -->
        <div v-if="detailWh" class="card">
            <div class="flex gap-2 mb-3 border-b pb-2">
                <button @click="whHistoryTab='imports'" :class="whHistoryTab==='imports' ? 'border-b-2 border-green-600 text-green-700 font-semibold' : 'text-gray-500'" class="pb-1 px-2">Lich su nhap</button>
                <button @click="whHistoryTab='exports'" :class="whHistoryTab==='exports' ? 'border-b-2 border-red-600 text-red-700 font-semibold' : 'text-gray-500'" class="pb-1 px-2">Lich su xuat</button>
                <button v-if="detailWh.is_central && detailWh.warehouse_type === 'medication'" @click="whHistoryTab='distribute'" :class="whHistoryTab==='distribute' ? 'border-b-2 border-blue-600 text-blue-700 font-semibold' : 'text-gray-500'" class="pb-1 px-2">Phan phoi</button>
            </div>
            <div v-if="whHistoryTab==='imports' && transactions?.imports?.length" class="table-wrap">
                <table><thead><tr><th>Thoi gian</th><th>San pham</th><th>So luong</th><th>Don vi</th><th>Dung tich</th><th>Don gia</th><th>Tong tien</th><th>NCC</th><th>Ghi chu</th><th></th></tr></thead>
                    <tbody>
                        <tr v-for="t in transactions.imports" :key="t.id" class="border-b last:border-0">
                            <td class="text-sm text-gray-500">{{ fmtDate(t.created_at) }}</td>
                            <td>{{ t.product_name || t.product_id }}</td>
                            <td class="font-medium text-green-600">{{ fmtNum(t.quantity, 2) }}</td>
                            <td class="text-sm">{{ t.unit || '-' }}</td>
                            <td class="text-sm">{{ t.unit_size ? t.unit_size + (t.unit_size_type || '') : '-' }}</td>
                            <td class="text-sm">{{ t.unit_price ? fmtNum(t.unit_price) + ' VND' : '-' }}</td>
                            <td class="text-sm">{{ t.total_price ? fmtNum(t.total_price) + ' VND' : '-' }}</td>
                            <td class="text-sm">{{ t.supplier || '-' }}</td>
                            <td class="text-sm text-gray-500">{{ t.notes || '-' }}</td>
                            <td><button @click="deleteTransaction(t, 'import')" class="btn btn-xs btn-danger">Xoa</button></td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else-if="whHistoryTab==='imports'" class="text-sm text-gray-400 py-4 text-center">Chua co lich su nhap</div>

            <div v-if="whHistoryTab==='exports' && transactions?.exports?.length" class="table-wrap">
                <table><thead><tr><th>Thoi gian</th><th>San pham</th><th>So luong</th><th>Ghi chu</th><th></th></tr></thead>
                    <tbody>
                        <tr v-for="t in transactions.exports" :key="t.id" class="border-b last:border-0">
                            <td class="text-sm text-gray-500">{{ fmtDate(t.created_at) }}</td>
                            <td>{{ t.product_name || t.product_id }}</td>
                            <td class="font-medium text-red-600">{{ fmtNum(t.quantity, 2) }}</td>
                            <td class="text-sm text-gray-500">{{ t.notes || '-' }}</td>
                            <td><button @click="deleteTransaction(t, 'export')" class="btn btn-xs btn-danger">Xoa</button></td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else-if="whHistoryTab==='exports'" class="text-sm text-gray-400 py-4 text-center">Chua co lich su xuat</div>

            <div v-if="whHistoryTab==='distribute' && detailWh.is_central" class="space-y-4">
                <div class="p-4 bg-blue-50 rounded-lg">
                    <h4 class="font-semibold text-blue-700 mb-3">Phan phoi thuoc toi kho khac</h4>
                    <div class="form-group">
                        <label>Thuoc</label>
                        <select v-model="distributeForm.medication_id" class="form-input">
                            <option value="">-- Chon thuoc --</option>
                            <option v-for="m in medications" :key="m.id" :value="m.id">{{ m.name }}</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Kho dich</label>
                        <select v-model="distributeForm.target_warehouse_id" class="form-input">
                            <option value="">-- Chon kho --</option>
                            <option v-for="w in otherWarehouses" :key="w.id" :value="w.id">{{ w.name }} ({{ w.is_central ? 'Kho trung tam' : 'Kho chuong ' + w.barn_id }})</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>So luong</label>
                        <input v-model.number="distributeForm.quantity" type="number" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Ghi chu</label>
                        <input v-model="distributeForm.note" class="form-input" placeholder="VD: Chuyen cho chuong 1">
                    </div>
                    <button :disabled="!distributeForm.medication_id || !distributeForm.target_warehouse_id || !distributeForm.quantity"
                        @click="doDistribute" class="btn btn-primary">Phan phoi</button>
                </div>
                <div v-if="detailWhStock.length" class="space-y-2">
                    <h4 class="font-medium">Ton kho hien tai</h4>
                    <div v-for="s in detailWhStock" :key="s.product_id" class="flex justify-between items-center p-3 bg-gray-50 rounded">
                        <div>
                            <div class="font-medium">{{ s.product_name }}</div>
                            <div class="text-xs text-gray-400">{{ s.unit || 'dv' }}</div>
                        </div>
                        <div class="text-xl font-bold text-green-600">{{ fmtNum(s.quantity, 0) }}</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Alert Rules for this Warehouse -->
        <div v-if="detailWh" class="card">
            <div class="flex justify-between items-center mb-3">
                <h3 class="font-semibold">Canh bao ton kho</h3>
                <button class="btn btn-primary btn-sm" @click="openAlertRuleForm()">+ Them quy tac</button>
            </div>
            <div v-if="alertRules.length" class="table-wrap">
                <table>
                    <thead><tr><th>San pham</th><th>Loai</th><th>Nguong</th><th>Tan suat</th><th>Trang thai</th><th>Thao tac</th></tr></thead>
                    <tbody>
                        <tr v-for="r in alertRules" :key="r.id" :class="r.enabled ? '' : 'opacity-50'">
                            <td>{{ r.product_name || 'Tat ca' }}</td>
                            <td>
                                <span v-if="r.alert_type === 'low_stock'" class="badge badge-yellow">Ton thap</span>
                                <span v-else-if="r.alert_type === 'out_of_stock'" class="badge badge-red">Het hang</span>
                                <span v-else class="badge badge-gray">{{ r.alert_type }}</span>
                            </td>
                            <td>{{ r.threshold ? fmtNum(r.threshold) : '(mac dinh)' }}</td>
                            <td>{{ r.frequency_minutes ? r.frequency_minutes + ' phut' : 'thu cong' }}</td>
                            <td>
                                <span v-if="r.enabled" class="badge badge-green">Bat</span>
                                <span v-else class="badge badge-gray">Tat</span>
                            </td>
                            <td class="flex gap-1">
                                <button class="btn btn-xs btn-secondary" @click="toggleAlertRule(r)">{{ r.enabled ? 'Tat' : 'Bat' }}</button>
                                <button class="btn btn-xs btn-danger" @click="deleteAlertRule(r)">Xoa</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="text-sm text-gray-400 py-4 text-center">Chua co quy tac nao cho kho nay</div>
        </div>

        <!-- Alert Rule Modal -->
        <div v-if="showAlertRuleModal" class="modal-overlay" @click.self="showAlertRuleModal=false">
            <div class="modal">
                <h3>{{ alertRuleForm.id ? 'Sua quy tac' : 'Them quy tac canh bao' }}</h3>
                <div class="form-group"><label>San pham</label>
                    <select v-model="alertRuleForm.product_id" class="form-input">
                        <option value="">-- Tat ca san pham --</option>
                        <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                </div>
                <div class="form-group"><label>Loai canh bao</label>
                    <select v-model="alertRuleForm.alert_type" class="form-input">
                        <option value="low_stock">Ton kho thap</option>
                        <option value="out_of_stock">Het hang</option>
                    </select>
                </div>
                <div class="form-group"><label>Nguong toi thieu</label>
                    <input v-model.number="alertRuleForm.threshold" type="number" step="0.1" class="form-input" placeholder="VD: 100">
                </div>
                <div class="form-group"><label>Tan suat (phut)</label>
                    <input v-model.number="alertRuleForm.frequency_minutes" type="number" step="5" class="form-input" placeholder="60">
                </div>
                <div class="form-group">
                    <label class="flex items-center gap-2">
                        <input type="checkbox" v-model="alertRuleForm.enabled"> Bat canh bao
                    </label>
                </div>
                <div class="form-group"><label>Ghi chu</label>
                    <input v-model="alertRuleForm.note" class="form-input" placeholder="Ghi chu them...">
                </div>
                <div class="flex gap-2 mt-4">
                    <button @click="showAlertRuleModal=false" class="btn">Huy</button>
                    <button @click="saveAlertRule" class="btn btn-primary">Luu</button>
                </div>
            </div>
        </div>
    </div>
    `,

    props: {
        warehouseId: { type: [String, Number], required: true }
    },

    setup(props) {
        const detailWh = ref(null);
        const whHistoryTab = ref('imports');
        const detailWhStock = ref([]);
        const transactions = ref({ imports: [], exports: [] });
        const feedTypes = ref([]);
        const feedBrands = ref([]);
        const medications = ref([]);
        const suppliers = ref([]);
        const selectedMedUnit = ref('');
        const selectedMedPrice = ref(null);
        const loadingStock = ref(false);
        const products = ref([]);
        const alertRules = ref([]);
        const showAlertRuleModal = ref(false);
        const alertRuleForm = ref({ warehouse_id: '', product_id: '', alert_type: 'low_stock', threshold: null, frequency_minutes: 60, severity: 'warning', enabled: true, note: '' });

        const detailImport = ref({ feed_type_id: '', medication_id: '', quantity: 0, note: '', feed_kg_per_bag: null, supplier: '', unit: '', unit_size: '', unit_size_type: 'ml', total_price: null });
        const detailExport = ref({ feed_type_id: '', medication_id: '', quantity: 0, note: '', feed_kg_per_bag: null, unit: '', export_type: '', target_warehouse_id: '' });
        const otherWarehouses = ref([]);
        const distributeForm = ref({ target_warehouse_id: '', medication_id: '', quantity: 0, note: '' });

        const defaultKgPerBag = computed(() => feedBrands.value[0]?.kg_per_bag || 25);

        // Computed: kho trung tam (de thu hoi ve)
        const centralWarehouse = computed(() => {
            return warehouses.value.find(w => w.is_central && w.warehouse_type === detailWh.value?.warehouse_type) || null;
        });

        // Computed: kiem tra du lieu xuat kho
        const canExport = computed(() => {
            if (!detailExport.value.medication_id || !detailExport.value.quantity) return false;
            if (detailExport.value.export_type === 'chuyen' && !detailExport.value.target_warehouse_id) return false;
            return true;
        });

        async function loadWarehouse() {
            try {
                const warehouses = await API.warehouses.list();
                detailWh.value = warehouses.find(w => w.id == props.warehouseId) || null;
                if (!detailWh.value) return;
                if (detailWh.value.warehouse_type === 'feed') {
                    await Promise.all([loadFeedData(), loadStock()]);
                } else if (detailWh.value.warehouse_type === 'medication') {
                    await Promise.all([loadMedications(), loadSuppliers(), loadStock(), loadOtherWarehouses()]);
                } else {
                    await loadStock();
                }
                await Promise.all([loadTransactions(), loadProducts(), loadAlertRules()]);
            } catch(e) { console.error('Load warehouse error:', e); }
        }

        async function loadFeedData() {
            try {
                [feedBrands.value, feedTypes.value] = await Promise.all([
                    API.feedBrands.list().catch(() => []),
                    API.feedTypes.list().catch(() => []),
                ]);
            } catch { feedBrands.value = []; feedTypes.value = []; }
        }

        async function loadMedications() {
            try { medications.value = await API.medications.list().catch(() => []); }
            catch { medications.value = []; }
        }

        async function loadSuppliers() {
            try { suppliers.value = await API.suppliers.list().catch(() => []); }
            catch { suppliers.value = []; }
        }

        async function loadProducts() {
            try { products.value = await API.products.list().catch(() => []); }
            catch { products.value = []; }
        }

        async function loadAlertRules() {
            try { alertRules.value = await API.inventory.alertRules().catch(() => []); }
            catch { alertRules.value = []; }
        }

        function openAlertRuleForm(r) {
            if (r) {
                alertRuleForm.value = { ...r, warehouse_id: props.warehouseId };
            } else {
                alertRuleForm.value = { warehouse_id: props.warehouseId, product_id: '', alert_type: 'low_stock', threshold: null, frequency_minutes: 60, severity: 'warning', enabled: true, note: '' };
            }
            showAlertRuleModal.value = true;
        }

        async function saveAlertRule() {
            try {
                const d = { ...alertRuleForm.value };
                if (d.id) {
                    await API.inventory.updateAlertRule(d.id, d);
                } else {
                    await API.inventory.createAlertRule(d);
                }
                showAlertRuleModal.value = false;
                showToast('Da luu');
                await loadAlertRules();
            } catch(e) { showToast('Loi: ' + e.message, 'error'); }
        }

        async function toggleAlertRule(r) {
            try {
                await API.inventory.toggleAlertRule(r.id, !r.enabled);
                showToast(r.enabled ? 'Da tat' : 'Da bat');
                await loadAlertRules();
            } catch(e) { showToast('Loi: ' + e.message, 'error'); }
        }

        async function deleteAlertRule(r) {
            if (!confirm('Xoa quy tac nay?')) return;
            try {
                await API.inventory.deleteAlertRule(r.id);
                showToast('Da xoa');
                await loadAlertRules();
            } catch(e) { showToast('Loi: ' + e.message, 'error'); }
        }

        async function loadStock() {
            loadingStock.value = true;
            try { detailWhStock.value = await API.inventory.list(props.warehouseId).catch(() => []); }
            catch { detailWhStock.value = []; }
            finally { loadingStock.value = false; }
        }

        async function loadTransactions() {
            try {
                const txns = await API.inventory.transactions(props.warehouseId, 100).catch(() => []);
                transactions.value = {
                    imports: txns.filter(t => t.transaction_type === 'import'),
                    exports: txns.filter(t => t.transaction_type === 'export'),
                };
            } catch { transactions.value = { imports: [], exports: [] }; }
        }

        function onMedicationSelect(type) {
            const meds = medications.value;
            if (type === 'import') {
                const m = meds.find(x => x.id == detailImport.value.medication_id);
                selectedMedPrice.value = m?.price_per_unit || null;
            } else {
                const m = meds.find(x => x.id == detailExport.value.medication_id);
            }
        }

        function updateDetailFeedKg(type) {
            const ft = feedTypes.value.find(t => t.id == (type === 'import' ? detailImport.value.feed_type_id : detailExport.value.feed_type_id));
            const kgPerBag = ft?.kg_per_bag || feedBrands.value.find(b => b.id == ft?.feed_brand_id)?.kg_per_bag || 25;
            if (type === 'import') {
                detailImport.value.feed_kg_per_bag = kgPerBag;
            } else {
                detailExport.value.feed_kg_per_bag = kgPerBag;
            }
        }

        async function doDetailImport() {
            if (!detailWh.value || !detailImport.value.quantity) return;
            try {
                let product_id, qty = detailImport.value.quantity;
                if (detailWh.value.warehouse_type === 'feed') {
                    if (!detailImport.value.feed_type_id) return;
                    const ft = feedTypes.value.find(t => t.id == detailImport.value.feed_type_id);
                    if (!ft) { showToast('Loai cam khong ton tai', 'error'); return; }
                    product_id = ft.product_id || 1;
                    if (detailImport.value.feed_kg_per_bag) qty = qty * detailImport.value.feed_kg_per_bag;
                } else if (detailWh.value.warehouse_type === 'medication') {
                    if (!detailImport.value.medication_id) return;
                    const med = medications.value.find(m => m.id == detailImport.value.medication_id);
                    if (!med) { showToast('Thuoc khong ton tai', 'error'); return; }
                    if (!med.product_id) { showToast('Thuoc chua co san pham mapping. Vui long lien he quan tri.', 'error'); return; }
                    product_id = med.product_id;
                } else { return; }
                const importData = {
                    warehouse_id: props.warehouseId,
                    product_id,
                    quantity: qty,
                    notes: detailImport.value.note,
                    unit: detailImport.value.unit,
                    unit_size: detailImport.value.unit_size,
                    unit_size_type: detailImport.value.unit_size_type,
                    unit_price: detailImport.value.total_price ? detailImport.value.total_price / detailImport.value.quantity : null,
                    total_price: detailImport.value.total_price,
                };
                if (detailWh.value.warehouse_type === 'medication' && detailImport.value.supplier) {
                    importData.supplier = detailImport.value.supplier;
                }
                await API.inventory.importStock(importData);
                showToast('Da nhap kho', 'success');
                detailImport.value = { feed_type_id: '', medication_id: '', quantity: 0, note: '', feed_kg_per_bag: null, supplier: '', unit: '', unit_size: '', unit_size_type: 'ml', total_price: null };
                await Promise.all([loadStock(), loadTransactions()]);
            } catch(e) { showToast('Loi: ' + e.message, 'error'); }
        }

        async function doDetailExport() {
            if (!detailWh.value || !detailExport.value.quantity) return;
            try {
                let product_id, qty = detailExport.value.quantity;
                if (detailWh.value.warehouse_type === 'feed') {
                    if (!detailExport.value.feed_type_id) return;
                    const ft = feedTypes.value.find(t => t.id == detailExport.value.feed_type_id);
                    if (!ft) { showToast('Loai cam khong ton tai', 'error'); return; }
                    product_id = ft.product_id || 1;
                    if (detailExport.value.feed_kg_per_bag) qty = qty * detailExport.value.feed_kg_per_bag;
                } else if (detailWh.value.warehouse_type === 'medication') {
                    if (!detailExport.value.medication_id) return;
                    const med = medications.value.find(m => m.id == detailExport.value.medication_id);
                    if (!med) { showToast('Thuoc khong ton tai', 'error'); return; }
                    if (!med.product_id) { showToast('Thuoc chua co san pham mapping. Vui long lien he quan tri.', 'error'); return; }
                    product_id = med.product_id;
                } else { return; }

                const exportType = detailExport.value.export_type;

                // Xu ly theo loai xuat
                if (exportType === 'chuyen') {
                    // Chuyen kho: su dung transfer
                    if (!detailExport.value.target_warehouse_id) {
                        showToast('Chon kho dich', 'error'); return;
                    }
                    await API.inventory.transfer({
                        from_warehouse_id: props.warehouseId,
                        to_warehouse_id: detailExport.value.target_warehouse_id,
                        product_id,
                        quantity: qty,
                        notes: detailExport.value.note || 'Chuyen kho',
                    });
                    showToast('Da chuyen kho', 'success');
                } else if (exportType === 'thu_hoi') {
                    // Thu hoi ve kho trung tam: xuat tu kho hien tai, nhap vao kho trung tam
                    const central = centralWarehouse.value;
                    if (!central) { showToast('Khong tim thay kho trung tam', 'error'); return; }
                    // Export tu kho hien tai
                    await API.inventory.exportStock({
                        warehouse_id: props.warehouseId,
                        product_id,
                        quantity: qty,
                        export_type: 'thu_hoi',
                        notes: detailExport.value.note || 'Thu hoi ve kho trung tam',
                    });
                    // Import vao kho trung tam (voi cung don vi, da la base units)
                    await API.inventory.importStock({
                        warehouse_id: central.id,
                        product_id,
                        quantity: qty,
                        notes: detailExport.value.note || `Thu hoi tu kho ${detailWh.value.name}`,
                    });
                    showToast('Da thu hoi ve kho trung tam', 'success');
                } else {
                    // Ban hang hoac het han: chi xuat kho
                    await API.inventory.exportStock({
                        warehouse_id: props.warehouseId,
                        product_id,
                        quantity: qty,
                        export_type: exportType || undefined,
                        notes: detailExport.value.note,
                    });
                    showToast('Da xuat kho', 'success');
                }

                detailExport.value = { feed_type_id: '', medication_id: '', quantity: 0, note: '', feed_kg_per_bag: null, unit: '', export_type: '', target_warehouse_id: '' };
                await Promise.all([loadStock(), loadTransactions()]);
            } catch(e) { showToast('Loi: ' + e.message, 'error'); }
        }

        async function loadOtherWarehouses() {
            try {
                const all = await API.warehouses.list();
                // Chi hien thi kho cung loai (medication) va khac kho hien tai
                otherWarehouses.value = all.filter(w =>
                    w.id != props.warehouseId &&
                    w.warehouse_type === detailWh.value?.warehouse_type &&
                    w.active !== false
                );
            } catch { otherWarehouses.value = []; }
        }

        function onExportTypeChange() {
            // Reset target warehouse khi doi loai xuat
            detailExport.value.target_warehouse_id = '';
            // Tu dong dien kho dich cho thu hoi
            if (detailExport.value.export_type === 'thu_hoi') {
                const central = centralWarehouse.value;
                if (central) {
                    detailExport.value.target_warehouse_id = central.id;
                }
            }
        }

        function autoFillExportQty() {
            if (!detailExport.value.medication_id) return;
            const med = medications.value.find(m => m.id == detailExport.value.medication_id);
            if (!med?.product_id) return;
            const item = detailWhStock.value.find(s => s.product_id === med.product_id);
            if (item) {
                detailExport.value.quantity = item.quantity;
                detailExport.value.unit = item.unit || 'g';
            }
        }

        async function doDistribute() {
            if (!distributeForm.value.target_warehouse_id || !distributeForm.value.medication_id || !distributeForm.value.quantity) return;
            try {
                const med = medications.value.find(m => m.id == distributeForm.value.medication_id);
                if (!med?.product_id) { showToast('Thuoc chua co san pham mapping', 'error'); return; }
                // Transfer from central to target warehouse
                await API.inventory.transfer({
                    from_warehouse_id: props.warehouseId,
                    to_warehouse_id: distributeForm.value.target_warehouse_id,
                    product_id: med.product_id,
                    quantity: distributeForm.value.quantity,
                    notes: distributeForm.value.note || 'Phan phoi tu kho trung tam',
                });
                showToast('Da phan phoi thanh cong');
                distributeForm.value = { target_warehouse_id: '', medication_id: '', quantity: 0, note: '' };
                await Promise.all([loadStock(), loadTransactions()]);
            } catch(e) { showToast('Loi: ' + e.message, 'error'); }
        }

        async function deleteTransaction(t, type) {
            if (!confirm('Xoa giao dich nay? So luong se duoc tra ve kho.')) return;
            try {
                await API.inventory.deleteTransaction(t.id);
                showToast('Da xoa giao dich');
                await Promise.all([loadStock(), loadTransactions()]);
            } catch(e) { showToast('Loi: ' + e.message, 'error'); }
        }

        function fmtNum(n, decimals = 0) {
            if (n === null || n === undefined) return '-';
            return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        }

        function fmtDate(d) {
            if (!d) return '-';
            return new Date(d).toLocaleString('vi-VN');
        }

        // Reload when warehouseId prop changes
        watch(() => props.warehouseId, () => loadWarehouse());

        onMounted(() => loadWarehouse());

        return {
            detailWh, whHistoryTab, detailWhStock, transactions,
            feedTypes, feedBrands, medications, suppliers, selectedMedPrice, loadingStock,
            products, alertRules, showAlertRuleModal, alertRuleForm,
            detailImport, detailExport, defaultKgPerBag,
            onMedicationSelect, updateDetailFeedKg, doDetailImport, doDetailExport, deleteTransaction, autoFillExportQty, onExportTypeChange,
            openAlertRuleForm, saveAlertRule, toggleAlertRule, deleteAlertRule,
            otherWarehouses, distributeForm, loadOtherWarehouses, doDistribute,
            centralWarehouse, canExport,
            fmtNum, fmtDate
        };
    }
};

return component;
