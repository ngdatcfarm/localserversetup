const { ref, onMounted } = Vue;

const component = {
    template: `
    <div>
        <div class="page-header">
            <h2 class="page-title">Chăm sóc</h2>
        </div>

        <!-- Select cycle -->
        <div class="card mb-4">
            <div class="form-group mb-0">
                <label>Chọn đợt nuôi</label>
                <select v-model="cycleId" @change="onCycleChange" class="border rounded px-3 py-1.5 text-sm">
                    <option value="">-- Chọn đợt nuôi --</option>
                    <option v-for="c in cycles" :key="c.id" :value="c.id">{{ c.name }} ({{ c.barn_id }})</option>
                </select>
            </div>
        </div>

        <div v-if="cycleId">
            <div class="tabs mb-4">
                <div class="tab" :class="{active: tab==='feed'}" @click="tab='feed'">Cho ăn</div>
                <div class="tab" :class="{active: tab==='death'}" @click="tab='death'">Tử vong</div>
                <div class="tab" :class="{active: tab==='medication'}" @click="tab='medication'">Thuốc/Vaccine</div>
                <div class="tab" :class="{active: tab==='weight'}" @click="tab='weight'">Cân</div>
                <div class="tab" :class="{active: tab==='sale'}" @click="tab='sale'">Bán</div>
            </div>

            <!-- Feed -->
            <div v-if="tab==='feed'" class="card">
                <h3 class="font-semibold mb-3">Ghi nhận cho ăn</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="form-group"><label>Kho cám</label>
                        <select v-model="feedForm.warehouse_id"><option value="">--</option><option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option></select>
                    </div>
                    <div class="form-group"><label>Sản phẩm cám</label>
                        <select v-model="feedForm.product_id"><option value="">--</option><option v-for="p in feedProducts" :key="p.id" :value="p.id">{{ p.name }}</option></select>
                    </div>
                    <div class="form-group"><label>Số lượng (kg)</label><input v-model.number="feedForm.quantity_kg" type="number" step="0.1"></div>
                    <div class="form-group"><label>Ngày</label><input v-model="feedForm.log_date" type="date"></div>
                    <div class="form-group md:col-span-2"><label>Ghi chú</label><input v-model="feedForm.note"></div>
                </div>
                <button class="btn btn-primary mt-3" @click="logFeed">Ghi nhận</button>
            </div>

            <!-- Death -->
            <div v-if="tab==='death'" class="card">
                <h3 class="font-semibold mb-3">Ghi nhận tử vong</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="form-group"><label>Số con</label><input v-model.number="deathForm.quantity" type="number"></div>
                    <div class="form-group"><label>Ngày</label><input v-model="deathForm.log_date" type="date"></div>
                    <div class="form-group"><label>Nguyên nhân</label><input v-model="deathForm.cause" placeholder="VD: bệnh, thời tiết..."></div>
                    <div class="form-group"><label>Ghi chú</label><input v-model="deathForm.note"></div>
                </div>
                <button class="btn btn-danger mt-3" @click="logDeath">Ghi nhận</button>
            </div>

            <!-- Medication -->
            <div v-if="tab==='medication'" class="card">
                <h3 class="font-semibold mb-3">Ghi nhận thuốc/vaccine</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="form-group"><label>Kho thuốc</label>
                        <select v-model="medForm.warehouse_id"><option value="">--</option><option v-for="w in medWarehouses" :key="w.id" :value="w.id">{{ w.name }}</option></select>
                    </div>
                    <div class="form-group"><label>Thuốc/Vaccine</label>
                        <select v-model="medForm.product_id"><option value="">--</option><option v-for="p in medProducts" :key="p.id" :value="p.id">{{ p.name }}</option></select>
                    </div>
                    <div class="form-group"><label>Liều lượng</label><input v-model="medForm.dosage" placeholder="VD: 1ml/con"></div>
                    <div class="form-group"><label>Số lượng dùng</label><input v-model.number="medForm.quantity_used" type="number" step="0.01"></div>
                    <div class="form-group"><label>Ngày</label><input v-model="medForm.log_date" type="date"></div>
                    <div class="form-group"><label>Ghi chú</label><input v-model="medForm.note"></div>
                </div>
                <button class="btn btn-primary mt-3" @click="logMed">Ghi nhận</button>
            </div>

            <!-- Weight -->
            <div v-if="tab==='weight'" class="card">
                <h3 class="font-semibold mb-3">Cân trọng lượng</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="form-group"><label>Số mẫu cân</label><input v-model.number="weightForm.sample_count" type="number"></div>
                    <div class="form-group"><label>Tổng trọng lượng (g)</label><input v-model.number="weightForm.total_weight" type="number"></div>
                    <div class="form-group"><label>Min (g)</label><input v-model.number="weightForm.min_weight" type="number"></div>
                    <div class="form-group"><label>Max (g)</label><input v-model.number="weightForm.max_weight" type="number"></div>
                    <div class="form-group"><label>Ngày</label><input v-model="weightForm.log_date" type="date"></div>
                    <div class="form-group"><label>Ghi chú</label><input v-model="weightForm.note"></div>
                </div>
                <button class="btn btn-primary mt-3" @click="logWeight">Ghi nhận</button>
            </div>

            <!-- Sale -->
            <div v-if="tab==='sale'" class="card">
                <h3 class="font-semibold mb-3">Ghi nhận bán</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="form-group"><label>Số con</label><input v-model.number="saleForm.quantity" type="number"></div>
                    <div class="form-group"><label>Tổng kg</label><input v-model.number="saleForm.total_weight_kg" type="number" step="0.1"></div>
                    <div class="form-group"><label>Giá/kg</label><input v-model.number="saleForm.price_per_kg" type="number"></div>
                    <div class="form-group"><label>Người mua</label><input v-model="saleForm.buyer"></div>
                    <div class="form-group"><label>Ngày</label><input v-model="saleForm.sale_date" type="date"></div>
                    <div class="form-group"><label>Ghi chú</label><input v-model="saleForm.note"></div>
                </div>
                <button class="btn btn-warning mt-3" @click="logSale">Ghi nhận</button>
            </div>
        </div>

        <div v-else class="empty-state"><div class="icon">🩺</div><p>Chọn đợt nuôi để ghi nhận chăm sóc</p></div>
    </div>`,

    setup() {
        const cycles = ref([]);
        const warehouses = ref([]);
        const products = ref([]);
        const cycleId = ref('');
        const tab = ref('feed');
        const today = new Date().toISOString().slice(0, 10);

        const feedForm = ref({ warehouse_id: '', product_id: '', quantity_kg: 0, log_date: today, note: '' });
        const deathForm = ref({ quantity: 0, log_date: today, cause: '', note: '' });
        const medForm = ref({ warehouse_id: '', product_id: '', dosage: '', quantity_used: 0, log_date: today, note: '' });
        const weightForm = ref({ sample_count: 0, total_weight: 0, min_weight: 0, max_weight: 0, log_date: today, note: '' });
        const saleForm = ref({ quantity: 0, total_weight_kg: 0, price_per_kg: 0, buyer: '', sale_date: today, note: '' });

        const feedProducts = Vue.computed(() => products.value.filter(p => p.type === 'feed'));
        const medProducts = Vue.computed(() => products.value.filter(p => p.type === 'medicine'));
        const medWarehouses = Vue.computed(() => warehouses.value.filter(w => w.type === 'medicine'));

        function onCycleChange() {}

        async function logFeed() {
            try { await API.care.logFeed({ cycle_id: cycleId.value, ...feedForm.value }); showToast('Đã ghi nhận cho ăn'); feedForm.value.quantity_kg = 0; }
            catch(e) { showToast(e.message, 'error'); }
        }
        async function logDeath() {
            try { await API.care.logDeath({ cycle_id: cycleId.value, ...deathForm.value }); showToast('Đã ghi nhận tử vong'); deathForm.value.quantity = 0; }
            catch(e) { showToast(e.message, 'error'); }
        }
        async function logMed() {
            try { await API.care.logMedication({ cycle_id: cycleId.value, ...medForm.value }); showToast('Đã ghi nhận thuốc/vaccine'); medForm.value.quantity_used = 0; }
            catch(e) { showToast(e.message, 'error'); }
        }
        async function logWeight() {
            try { await API.care.logWeight({ cycle_id: cycleId.value, ...weightForm.value }); showToast('Đã ghi nhận cân'); }
            catch(e) { showToast(e.message, 'error'); }
        }
        async function logSale() {
            try { await API.care.logSale({ cycle_id: cycleId.value, ...saleForm.value }); showToast('Đã ghi nhận bán'); saleForm.value.quantity = 0; }
            catch(e) { showToast(e.message, 'error'); }
        }

        onMounted(async () => {
            [cycles.value, warehouses.value, products.value] = await Promise.all([
                API.cycles.list().catch(() => []),
                API.warehouses.list().catch(() => []),
                API.products.list().catch(() => []),
            ]);
            cycles.value = cycles.value.filter(c => c.status === 'active');
        });

        return { cycles, warehouses, products, cycleId, tab, feedForm, deathForm, medForm, weightForm, saleForm,
            feedProducts, medProducts, medWarehouses, onCycleChange, logFeed, logDeath, logMed, logWeight, logSale };
    }
};

return component;
