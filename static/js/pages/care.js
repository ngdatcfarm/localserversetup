/**
 * Care Page - Daily farm operations (cloud-aligned)
 */
const { ref, onMounted, computed } = Vue;

return {
    setup() {
        const cycles = ref([]);
        const feedTypes = ref([]);
        const medications = ref([]);
        const warehouses = ref([]);
        const products = ref([]);
        const cycleId = ref('');
        const selectedCycle = ref(null);
        const tab = ref('feed');
        const today = new Date().toISOString().slice(0, 10);

        const feedForm = ref({ feed_type_id: '', bags: 1, kg_actual: 0, remaining_pct: null, session: 'all_day', warehouse_id: '', product_id: '', log_date: today, note: '' });
        const deathForm = ref({ quantity: 0, log_date: today, cause: '', death_category: '', symptoms: '', note: '' });
        const medForm = ref({ medication_id: '', medication_name: '', dosage: '', unit: '', method: '', warehouse_id: '', product_id: '', quantity_used: 0, log_date: today, note: '' });
        const weightForm = ref({ sample_count: 0, total_weight: 0, min_weight: 0, max_weight: 0, log_date: today, note: '' });
        const saleForm = ref({ quantity: 0, gender: '', total_weight_kg: 0, price_per_kg: 0, buyer: '', sale_date: today, note: '' });

        const feedProducts = computed(() => products.value.filter(p => p.product_type === 'feed'));
        const medProducts = computed(() => products.value.filter(p => p.product_type === 'medicine'));
        const medWarehouses = computed(() => warehouses.value.filter(w => w.warehouse_type === 'medicine'));
        const feedWarehouses = computed(() => warehouses.value.filter(w => w.warehouse_type === 'feed'));

        const deathCategories = ['disease', 'weak', 'accident', 'predator', 'unknown'];
        const feedSessions = ['morning', 'afternoon', 'evening', 'all_day'];
        const medMethods = ['water', 'inject', 'spray', 'eye_drop', 'feed', 'other'];
        const genders = ['', 'male', 'female', 'mixed'];

        function onCycleChange() {
            selectedCycle.value = cycles.value.find(c => c.id == cycleId.value) || null;
        }

        function onMedSelect() {
            const med = medications.value.find(m => m.id == medForm.value.medication_id);
            if (med) {
                medForm.value.medication_name = med.name;
                medForm.value.unit = med.unit || '';
            }
        }

        async function logFeed() {
            try {
                const data = {
                    cycle_id: parseInt(cycleId.value),
                    barn_id: selectedCycle.value?.barn_id || '',
                    feed_date: feedForm.value.log_date,
                    meal: feedForm.value.session,
                    product_id: feedForm.value.product_id || null,
                    quantity: feedForm.value.kg_actual || (feedForm.value.bags * 25),
                    remaining: feedForm.value.remaining_pct,
                    warehouse_id: feedForm.value.warehouse_id || null,
                    notes: feedForm.value.note,
                };
                await API.care.logFeed(data);
                showToast('Da ghi nhan cho an');
                feedForm.value.bags = 1; feedForm.value.kg_actual = 0;
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function logDeath() {
            try {
                const data = {
                    cycle_id: parseInt(cycleId.value),
                    barn_id: selectedCycle.value?.barn_id || '',
                    death_date: deathForm.value.log_date,
                    count: deathForm.value.quantity,
                    cause: deathForm.value.cause,
                    symptoms: deathForm.value.symptoms,
                    notes: deathForm.value.note,
                };
                await API.care.logDeath(data);
                showToast('Da ghi nhan tu vong');
                deathForm.value.quantity = 0;
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function logMed() {
            try {
                const data = {
                    cycle_id: parseInt(cycleId.value),
                    barn_id: selectedCycle.value?.barn_id || '',
                    med_date: medForm.value.log_date,
                    med_type: 'medicine',
                    product_id: medForm.value.product_id || null,
                    quantity: medForm.value.quantity_used || null,
                    method: medForm.value.method,
                    warehouse_id: medForm.value.warehouse_id || null,
                    notes: medForm.value.note,
                };
                await API.care.logMedication(data);
                showToast('Da ghi nhan thuoc');
                medForm.value.quantity_used = 0;
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function logWeight() {
            try {
                const data = {
                    cycle_id: parseInt(cycleId.value),
                    barn_id: selectedCycle.value?.barn_id || '',
                    weigh_date: weightForm.value.log_date,
                    sample_count: weightForm.value.sample_count,
                    total_weight: weightForm.value.total_weight,
                    min_weight: weightForm.value.min_weight || null,
                    max_weight: weightForm.value.max_weight || null,
                    notes: weightForm.value.note,
                };
                await API.care.logWeight(data);
                showToast('Da ghi nhan can');
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function logSale() {
            try {
                const data = {
                    cycle_id: parseInt(cycleId.value),
                    barn_id: selectedCycle.value?.barn_id || '',
                    sale_date: saleForm.value.sale_date,
                    count: saleForm.value.quantity,
                    total_weight: saleForm.value.total_weight_kg || null,
                    unit_price: saleForm.value.price_per_kg || null,
                    total_amount: (saleForm.value.total_weight_kg || 0) * (saleForm.value.price_per_kg || 0) || null,
                    buyer: saleForm.value.buyer,
                    notes: saleForm.value.note,
                };
                await API.care.logSale(data);
                showToast('Da ghi nhan ban');
                saleForm.value.quantity = 0;
            } catch(e) { showToast(e.message, 'error'); }
        }

        onMounted(async () => {
            const [c, w, p, ft, med] = await Promise.all([
                API.cycles.list().catch(() => []),
                API.warehouses.list().catch(() => []),
                API.products.list().catch(() => []),
                API.feedTypes.list().catch(() => []),
                API.medications.list().catch(() => []),
            ]);
            cycles.value = c.filter(x => x.status === 'active');
            warehouses.value = w;
            products.value = p;
            feedTypes.value = ft;
            medications.value = med;
        });

        return { cycles, feedTypes, medications, warehouses, products, cycleId, selectedCycle, tab,
                 feedForm, deathForm, medForm, weightForm, saleForm,
                 feedProducts, medProducts, medWarehouses, feedWarehouses,
                 deathCategories, feedSessions, medMethods, genders,
                 onCycleChange, onMedSelect, logFeed, logDeath, logMed, logWeight, logSale, fmtNum };
    },

    template: `
    <div>
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">Cham soc</h2>
        </div>

        <!-- Select cycle -->
        <div class="card mb-4">
            <label class="form-label">Chon dot nuoi</label>
            <select v-model="cycleId" @change="onCycleChange" class="form-input">
                <option value="">-- Chon --</option>
                <option v-for="c in cycles" :key="c.id" :value="c.id">{{ c.name || c.code }} ({{ c.barn_id }})</option>
            </select>
        </div>

        <div v-if="cycleId">
            <!-- Tabs -->
            <div class="flex gap-1 mb-4 flex-wrap">
                <button @click="tab='feed'" :class="tab==='feed' ? 'bg-green-600 text-white' : 'bg-gray-200'" class="px-3 py-1.5 rounded-lg text-sm font-medium">Cho an</button>
                <button @click="tab='death'" :class="tab==='death' ? 'bg-red-600 text-white' : 'bg-gray-200'" class="px-3 py-1.5 rounded-lg text-sm font-medium">Tu vong</button>
                <button @click="tab='medication'" :class="tab==='medication' ? 'bg-purple-600 text-white' : 'bg-gray-200'" class="px-3 py-1.5 rounded-lg text-sm font-medium">Thuoc</button>
                <button @click="tab='weight'" :class="tab==='weight' ? 'bg-blue-600 text-white' : 'bg-gray-200'" class="px-3 py-1.5 rounded-lg text-sm font-medium">Can</button>
                <button @click="tab='sale'" :class="tab==='sale' ? 'bg-yellow-600 text-white' : 'bg-gray-200'" class="px-3 py-1.5 rounded-lg text-sm font-medium">Ban</button>
            </div>

            <!-- Feed -->
            <div v-if="tab==='feed'" class="card">
                <h3 class="font-semibold mb-3">Ghi nhan cho an</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label class="form-label">Loai cam</label>
                        <select v-model="feedForm.feed_type_id" class="form-input">
                            <option value="">-- Chon loai cam --</option>
                            <option v-for="ft in feedTypes" :key="ft.id" :value="ft.id">{{ ft.code ? ft.code + ' - ' : '' }}{{ ft.name }}</option>
                        </select></div>
                    <div><label class="form-label">Buoi</label>
                        <select v-model="feedForm.session" class="form-input">
                            <option v-for="s in feedSessions" :value="s">{{ s }}</option>
                        </select></div>
                    <div><label class="form-label">So bao</label>
                        <input v-model.number="feedForm.bags" type="number" step="0.5" min="0" class="form-input"></div>
                    <div><label class="form-label">Kg thuc te</label>
                        <input v-model.number="feedForm.kg_actual" type="number" step="0.1" class="form-input" placeholder="De trong = so bao x 25kg"></div>
                    <div><label class="form-label">Cam du (%)</label>
                        <input v-model.number="feedForm.remaining_pct" type="number" min="0" max="100" class="form-input" placeholder="VD: 10"></div>
                    <div><label class="form-label">Kho xuat</label>
                        <select v-model="feedForm.warehouse_id" class="form-input">
                            <option value="">-- Khong chon --</option>
                            <option v-for="w in feedWarehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                        </select></div>
                    <div><label class="form-label">San pham kho</label>
                        <select v-model="feedForm.product_id" class="form-input">
                            <option value="">--</option>
                            <option v-for="p in feedProducts" :key="p.id" :value="p.id">{{ p.name }}</option>
                        </select></div>
                    <div><label class="form-label">Ngay</label>
                        <input v-model="feedForm.log_date" type="date" class="form-input"></div>
                    <div class="md:col-span-2"><label class="form-label">Ghi chu</label>
                        <input v-model="feedForm.note" class="form-input"></div>
                </div>
                <button @click="logFeed" class="btn-primary mt-3">Ghi nhan</button>
            </div>

            <!-- Death -->
            <div v-if="tab==='death'" class="card">
                <h3 class="font-semibold mb-3">Ghi nhan tu vong</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label class="form-label">So con *</label>
                        <input v-model.number="deathForm.quantity" type="number" min="0" class="form-input"></div>
                    <div><label class="form-label">Ngay</label>
                        <input v-model="deathForm.log_date" type="date" class="form-input"></div>
                    <div><label class="form-label">Phan loai</label>
                        <select v-model="deathForm.death_category" class="form-input">
                            <option value="">-- Chon --</option>
                            <option v-for="c in deathCategories" :value="c">{{ c }}</option>
                        </select></div>
                    <div><label class="form-label">Nguyen nhan</label>
                        <input v-model="deathForm.cause" class="form-input"></div>
                    <div class="md:col-span-2"><label class="form-label">Trieu chung</label>
                        <input v-model="deathForm.symptoms" class="form-input" placeholder="Mo ta trieu chung"></div>
                    <div class="md:col-span-2"><label class="form-label">Ghi chu</label>
                        <input v-model="deathForm.note" class="form-input"></div>
                </div>
                <button @click="logDeath" class="bg-red-600 text-white px-4 py-2 rounded-lg mt-3">Ghi nhan</button>
            </div>

            <!-- Medication -->
            <div v-if="tab==='medication'" class="card">
                <h3 class="font-semibold mb-3">Ghi nhan thuoc</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label class="form-label">Thuoc (danh muc)</label>
                        <select v-model="medForm.medication_id" @change="onMedSelect" class="form-input">
                            <option value="">-- Chon thuoc --</option>
                            <option v-for="m in medications" :key="m.id" :value="m.id">{{ m.name }} ({{ m.category }})</option>
                        </select></div>
                    <div><label class="form-label">Cach dung</label>
                        <select v-model="medForm.method" class="form-input">
                            <option value="">--</option>
                            <option v-for="m in medMethods" :value="m">{{ m }}</option>
                        </select></div>
                    <div><label class="form-label">Lieu luong</label>
                        <input v-model="medForm.dosage" class="form-input" placeholder="VD: 1g/lit nuoc"></div>
                    <div><label class="form-label">So luong dung</label>
                        <input v-model.number="medForm.quantity_used" type="number" step="0.01" class="form-input"></div>
                    <div><label class="form-label">Kho thuoc</label>
                        <select v-model="medForm.warehouse_id" class="form-input">
                            <option value="">--</option>
                            <option v-for="w in medWarehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                        </select></div>
                    <div><label class="form-label">Ngay</label>
                        <input v-model="medForm.log_date" type="date" class="form-input"></div>
                    <div class="md:col-span-2"><label class="form-label">Ghi chu</label>
                        <input v-model="medForm.note" class="form-input"></div>
                </div>
                <button @click="logMed" class="bg-purple-600 text-white px-4 py-2 rounded-lg mt-3">Ghi nhan</button>
            </div>

            <!-- Weight -->
            <div v-if="tab==='weight'" class="card">
                <h3 class="font-semibold mb-3">Can trong luong</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label class="form-label">So mau *</label>
                        <input v-model.number="weightForm.sample_count" type="number" min="1" class="form-input"></div>
                    <div><label class="form-label">Tong trong luong (g)</label>
                        <input v-model.number="weightForm.total_weight" type="number" class="form-input"></div>
                    <div><label class="form-label">Min (g)</label>
                        <input v-model.number="weightForm.min_weight" type="number" class="form-input"></div>
                    <div><label class="form-label">Max (g)</label>
                        <input v-model.number="weightForm.max_weight" type="number" class="form-input"></div>
                    <div><label class="form-label">Ngay</label>
                        <input v-model="weightForm.log_date" type="date" class="form-input"></div>
                    <div><label class="form-label">Ghi chu</label>
                        <input v-model="weightForm.note" class="form-input"></div>
                </div>
                <p v-if="weightForm.sample_count > 0 && weightForm.total_weight > 0" class="text-sm text-green-700 mt-2 font-medium">
                    TB: {{ fmtNum(weightForm.total_weight / weightForm.sample_count, 0) }}g/con
                </p>
                <button @click="logWeight" class="bg-blue-600 text-white px-4 py-2 rounded-lg mt-3">Ghi nhan</button>
            </div>

            <!-- Sale -->
            <div v-if="tab==='sale'" class="card">
                <h3 class="font-semibold mb-3">Ghi nhan ban</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label class="form-label">So con *</label>
                        <input v-model.number="saleForm.quantity" type="number" min="0" class="form-input"></div>
                    <div><label class="form-label">Gioi tinh</label>
                        <select v-model="saleForm.gender" class="form-input">
                            <option v-for="g in genders" :value="g">{{ g || 'Khong chon' }}</option>
                        </select></div>
                    <div><label class="form-label">Tong kg</label>
                        <input v-model.number="saleForm.total_weight_kg" type="number" step="0.1" class="form-input"></div>
                    <div><label class="form-label">Gia/kg (VND)</label>
                        <input v-model.number="saleForm.price_per_kg" type="number" class="form-input"></div>
                    <div><label class="form-label">Nguoi mua</label>
                        <input v-model="saleForm.buyer" class="form-input"></div>
                    <div><label class="form-label">Ngay</label>
                        <input v-model="saleForm.sale_date" type="date" class="form-input"></div>
                    <div class="md:col-span-2"><label class="form-label">Ghi chu</label>
                        <input v-model="saleForm.note" class="form-input"></div>
                </div>
                <p v-if="saleForm.total_weight_kg > 0 && saleForm.price_per_kg > 0" class="text-sm text-green-700 mt-2 font-medium">
                    Thanh tien: {{ fmtNum(saleForm.total_weight_kg * saleForm.price_per_kg, 0) }} VND
                </p>
                <button @click="logSale" class="bg-yellow-600 text-white px-4 py-2 rounded-lg mt-3">Ghi nhan</button>
            </div>
        </div>

        <div v-else class="text-center text-gray-400 py-12">Chon dot nuoi de ghi nhan cham soc</div>
    </div>`
};
