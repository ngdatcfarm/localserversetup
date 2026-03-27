const { ref, onMounted } = Vue;

const component = {
    template: `
    <div>
        <div class="page-header">
            <h2 class="page-title">Quản lý kho</h2>
        </div>

        <div class="tabs mb-4">
            <div class="tab" :class="{active: tab==='warehouses'}" @click="tab='warehouses'">Kho</div>
            <div class="tab" :class="{active: tab==='products'}" @click="tab='products'">Sản phẩm</div>
            <div class="tab" :class="{active: tab==='stock'}" @click="tab='stock'">Tồn kho</div>
            <div class="tab" :class="{active: tab==='actions'}" @click="tab='actions'">Nhập/Xuất/Chuyển</div>
        </div>

        <!-- Warehouses -->
        <div v-if="tab==='warehouses'">
            <div class="mb-3"><button class="btn btn-primary btn-sm" @click="openWhForm()">+ Thêm kho</button></div>
            <div v-if="warehouses.length" class="table-wrap">
                <table>
                    <thead><tr><th>Tên kho</th><th>Loại</th><th>Chuồng</th><th>Thao tác</th></tr></thead>
                    <tbody>
                        <tr v-for="w in warehouses" :key="w.id">
                            <td class="font-medium">{{ w.name }}</td>
                            <td><span :class="w.type==='feed' ? 'badge badge-yellow' : 'badge badge-blue'">{{ w.type==='feed' ? 'Cám' : 'Thuốc' }}</span></td>
                            <td>{{ w.barn_id || 'Trung tâm' }}</td>
                            <td class="flex gap-1">
                                <button class="btn btn-secondary btn-sm" @click="openWhForm(w)">Sửa</button>
                                <button class="btn btn-danger btn-sm" @click="removeWh(w)">Xóa</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="empty-state"><div class="icon">📦</div><p>Chưa có kho</p></div>
        </div>

        <!-- Products -->
        <div v-if="tab==='products'">
            <div class="mb-3"><button class="btn btn-primary btn-sm" @click="openProdForm()">+ Thêm sản phẩm</button></div>
            <div v-if="products.length" class="table-wrap">
                <table>
                    <thead><tr><th>Tên</th><th>Loại</th><th>Đơn vị</th><th>Thao tác</th></tr></thead>
                    <tbody>
                        <tr v-for="p in products" :key="p.id">
                            <td class="font-medium">{{ p.name }}</td>
                            <td><span :class="p.type==='feed' ? 'badge badge-yellow' : 'badge badge-blue'">{{ p.type==='feed' ? 'Cám' : 'Thuốc' }}</span></td>
                            <td>{{ p.unit }}</td>
                            <td class="flex gap-1">
                                <button class="btn btn-secondary btn-sm" @click="openProdForm(p)">Sửa</button>
                                <button class="btn btn-danger btn-sm" @click="removeProd(p)">Xóa</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="empty-state"><p>Chưa có sản phẩm</p></div>
        </div>

        <!-- Stock -->
        <div v-if="tab==='stock'">
            <div class="mb-3">
                <select v-model="selectedWh" @change="loadStock" class="border rounded px-3 py-1.5 text-sm">
                    <option value="">-- Chọn kho --</option>
                    <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                </select>
            </div>
            <div v-if="stock.length" class="table-wrap">
                <table>
                    <thead><tr><th>Sản phẩm</th><th>Tồn kho</th><th>Đơn vị</th></tr></thead>
                    <tbody>
                        <tr v-for="s in stock" :key="s.product_id">
                            <td>{{ s.product_name || s.product_id }}</td>
                            <td class="font-semibold">{{ fmtNum(s.quantity, 2) }}</td>
                            <td>{{ s.unit || '-' }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else-if="selectedWh" class="empty-state"><p>Kho trống</p></div>
        </div>

        <!-- Import/Export/Transfer -->
        <div v-if="tab==='actions'" class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- Import -->
            <div class="card">
                <h3 class="font-semibold mb-3 text-green-700">Nhập kho</h3>
                <div class="form-group"><label>Kho</label>
                    <select v-model="importForm.warehouse_id"><option value="">--</option><option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option></select>
                </div>
                <div class="form-group"><label>Sản phẩm</label>
                    <select v-model="importForm.product_id"><option value="">--</option><option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option></select>
                </div>
                <div class="form-group"><label>Số lượng</label><input v-model.number="importForm.quantity" type="number" step="0.1"></div>
                <div class="form-group"><label>Ghi chú</label><input v-model="importForm.note"></div>
                <button class="btn btn-primary w-full" @click="doImport">Nhập kho</button>
            </div>

            <!-- Export -->
            <div class="card">
                <h3 class="font-semibold mb-3 text-red-700">Xuất kho</h3>
                <div class="form-group"><label>Kho</label>
                    <select v-model="exportForm.warehouse_id"><option value="">--</option><option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option></select>
                </div>
                <div class="form-group"><label>Sản phẩm</label>
                    <select v-model="exportForm.product_id"><option value="">--</option><option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option></select>
                </div>
                <div class="form-group"><label>Số lượng</label><input v-model.number="exportForm.quantity" type="number" step="0.1"></div>
                <div class="form-group"><label>Ghi chú</label><input v-model="exportForm.note"></div>
                <button class="btn btn-danger w-full" @click="doExport">Xuất kho</button>
            </div>

            <!-- Transfer -->
            <div class="card">
                <h3 class="font-semibold mb-3 text-blue-700">Chuyển kho</h3>
                <div class="form-group"><label>Từ kho</label>
                    <select v-model="transferForm.from_warehouse_id"><option value="">--</option><option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option></select>
                </div>
                <div class="form-group"><label>Đến kho</label>
                    <select v-model="transferForm.to_warehouse_id"><option value="">--</option><option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option></select>
                </div>
                <div class="form-group"><label>Sản phẩm</label>
                    <select v-model="transferForm.product_id"><option value="">--</option><option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option></select>
                </div>
                <div class="form-group"><label>Số lượng</label><input v-model.number="transferForm.quantity" type="number" step="0.1"></div>
                <button class="btn btn-primary w-full" @click="doTransfer">Chuyển kho</button>
            </div>
        </div>

        <!-- Warehouse Modal -->
        <div v-if="showWhModal" class="modal-overlay" @click.self="showWhModal=false">
            <div class="modal">
                <h3>{{ whForm.id ? 'Sửa kho' : 'Thêm kho' }}</h3>
                <div class="form-group"><label>Tên kho</label><input v-model="whForm.name" placeholder="VD: Kho cám trung tâm"></div>
                <div class="form-group"><label>Loại</label>
                    <select v-model="whForm.type"><option value="feed">Cám</option><option value="medicine">Thuốc</option></select>
                </div>
                <div class="form-group"><label>Chuồng (nếu là kho chuồng)</label><input v-model="whForm.barn_id" placeholder="Để trống = kho trung tâm"></div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-secondary" @click="showWhModal=false">Huỷ</button>
                    <button class="btn btn-primary" @click="saveWh">Lưu</button>
                </div>
            </div>
        </div>

        <!-- Product Modal -->
        <div v-if="showProdModal" class="modal-overlay" @click.self="showProdModal=false">
            <div class="modal">
                <h3>{{ prodForm.id ? 'Sửa sản phẩm' : 'Thêm sản phẩm' }}</h3>
                <div class="form-group"><label>Tên</label><input v-model="prodForm.name" placeholder="VD: Cám gà con C01"></div>
                <div class="form-group"><label>Loại</label>
                    <select v-model="prodForm.type"><option value="feed">Cám</option><option value="medicine">Thuốc</option></select>
                </div>
                <div class="form-group"><label>Đơn vị</label><input v-model="prodForm.unit" placeholder="VD: kg, lọ, viên"></div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-secondary" @click="showProdModal=false">Huỷ</button>
                    <button class="btn btn-primary" @click="saveProd">Lưu</button>
                </div>
            </div>
        </div>
    </div>`,

    setup() {
        const warehouses = ref([]);
        const products = ref([]);
        const stock = ref([]);
        const tab = ref('warehouses');
        const selectedWh = ref('');
        const showWhModal = ref(false);
        const showProdModal = ref(false);
        const whForm = ref({});
        const prodForm = ref({});
        const importForm = ref({ warehouse_id: '', product_id: '', quantity: 0, note: '' });
        const exportForm = ref({ warehouse_id: '', product_id: '', quantity: 0, note: '' });
        const transferForm = ref({ from_warehouse_id: '', to_warehouse_id: '', product_id: '', quantity: 0 });

        async function load() {
            [warehouses.value, products.value] = await Promise.all([
                API.warehouses.list().catch(() => []),
                API.products.list().catch(() => []),
            ]);
        }

        async function loadStock() {
            if (!selectedWh.value) { stock.value = []; return; }
            try { stock.value = await API.inventory.list(selectedWh.value); } catch { stock.value = []; }
        }

        function openWhForm(w) { whForm.value = w ? { ...w } : { name: '', type: 'feed', barn_id: '' }; showWhModal.value = true; }
        function openProdForm(p) { prodForm.value = p ? { ...p } : { name: '', type: 'feed', unit: 'kg' }; showProdModal.value = true; }

        async function saveWh() {
            try {
                if (whForm.value.id) await API.warehouses.update(whForm.value.id, whForm.value);
                else await API.warehouses.create(whForm.value);
                showWhModal.value = false; showToast('Đã lưu'); await load();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function saveProd() {
            try {
                if (prodForm.value.id) await API.products.update(prodForm.value.id, prodForm.value);
                else await API.products.create(prodForm.value);
                showProdModal.value = false; showToast('Đã lưu'); await load();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function removeWh(w) { if (!confirm('Xóa kho ' + w.name + '?')) return; try { await API.warehouses.del(w.id); showToast('Đã xóa'); await load(); } catch(e) { showToast(e.message, 'error'); } }
        async function removeProd(p) { if (!confirm('Xóa ' + p.name + '?')) return; try { await API.products.del(p.id); showToast('Đã xóa'); await load(); } catch(e) { showToast(e.message, 'error'); } }

        async function doImport() {
            try { await API.inventory.import(importForm.value); showToast('Nhập kho thành công'); importForm.value = { ...importForm.value, quantity: 0, note: '' }; }
            catch(e) { showToast(e.message, 'error'); }
        }
        async function doExport() {
            try { await API.inventory.export(exportForm.value); showToast('Xuất kho thành công'); exportForm.value = { ...exportForm.value, quantity: 0, note: '' }; }
            catch(e) { showToast(e.message, 'error'); }
        }
        async function doTransfer() {
            try { await API.inventory.transfer(transferForm.value); showToast('Chuyển kho thành công'); transferForm.value = { ...transferForm.value, quantity: 0 }; }
            catch(e) { showToast(e.message, 'error'); }
        }

        onMounted(load);
        return { warehouses, products, stock, tab, selectedWh, showWhModal, showProdModal, whForm, prodForm, importForm, exportForm, transferForm,
            load, loadStock, openWhForm, openProdForm, saveWh, saveProd, removeWh, removeProd, doImport, doExport, doTransfer, fmtNum };
    }
};

return component;
