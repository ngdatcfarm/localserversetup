/**
 * Care Records - Periodic/Sporadic Records
 * Weight, Medicine, Health - Periodic tracking
 */
const { ref, reactive, computed, watch, onMounted } = Vue;

export default{
    setup() {
        // ── Data Store ──────────────────────────────
        const cycles = ref([]);
        const products = ref([]);
        const warehouses = ref([]);
        const weightLogs = ref([]);
        const medLogs = ref([]);
        const healthNotes = ref([]);
        const vaccineSchedules = ref([]);

        // ── Selection State ─────────────────────────
        const selectedCycleId = ref('');
        const selectedDate = ref(new Date().toISOString().slice(0, 10));

        // ── Form States ─────────────────────────────
        const weightForm = reactive({ mode: 'aggregate', sample_count: '', total_weight: '', currentWeight: '', currentGender: 'female', samples: [], notes: '' });
        const medForm = reactive({ med_type: 'medicine', unit: 'g', quantity: '', product_id: '', custom_name: '', method: 'water', warehouse_id: '', notes: '' });
        const healthForm = reactive({ severity: 'normal', symptoms: '', health_flags: [], notes: '' });

        // ── UI State ───────────────────────────────
        const loading = ref(false);
        const submitting = ref(false);

        // ── Computed ───────────────────────────────
        const selectedCycle = computed(() => cycles.value.find(c => c.id == selectedCycleId.value) || null);

        const dayAge = computed(() => {
            if (!selectedCycle.value) return 0;
            const start = new Date(selectedCycle.value.start_date);
            const today = new Date(selectedDate.value);
            return Math.floor((today - start) / (1000 * 60 * 60 * 24));
        });

        // ── Today's Logs ─────────────────────────
        const todayWeights = computed(() => weightLogs.value.filter(l => l.weigh_date === selectedDate.value));
        const todayMeds = computed(() => medLogs.value.filter(l => l.med_date === selectedDate.value));
        const todayHealth = computed(() => healthNotes.value.filter(l => l.recorded_at === selectedDate.value));

        // ── Products ─────────────────────────────
        const medProducts = computed(() => products.value.filter(p => p.product_type === 'medicine'));

        // ── Methods ───────────────────────────────
        function resetForm(name) {
            if (name === 'weightForm') {
                weightForm.mode = 'aggregate';
                weightForm.sample_count = '';
                weightForm.total_weight = '';
                weightForm.currentWeight = '';
                weightForm.currentGender = 'female';
                weightForm.samples = [];
                weightForm.notes = '';
            } else if (name === 'medForm') {
                medForm.med_type = 'medicine';
                medForm.unit = 'g';
                medForm.quantity = '';
                medForm.product_id = '';
                medForm.custom_name = '';
                medForm.method = 'water';
                medForm.warehouse_id = '';
                medForm.notes = '';
            } else if (name === 'healthForm') {
                healthForm.severity = 'normal';
                healthForm.symptoms = '';
                healthForm.health_flags = [];
                healthForm.notes = '';
            }
        }

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
                    const active = cycles.value.find(cycle => !cycle.end_date);
                    if (active) selectedCycleId.value = active.id;
                }
                await loadLogs();
            } catch (e) {
                showToast('Lỗi tải dữ liệu: ' + e.message, 'error');
            } finally {
                loading.value = false;
            }
        }

        async function loadLogs() {
            if (!selectedCycleId.value) return;
            const cid = selectedCycleId.value;

            const [weights, meds, health, vaccines] = await Promise.all([
                API.care.weightHistory(cid),
                API.care.medHistory(cid),
                API.care.healthHistory(cid),
                API.vaccines.schedules.list(cid),
            ]);

            weightLogs.value = weights;
            medLogs.value = meds;
            healthNotes.value = health;
            vaccineSchedules.value = vaccines;
        }

        async function submitForm(type) {
            if (submitting.value) return;
            submitting.value = true;

            try {
                const cycleId = selectedCycleId.value;
                const barnId = selectedCycle.value?.barn_id;

                switch (type) {
                    case 'weight': {
                        if (weightForm.mode === 'aggregate') {
                            if (!weightForm.sample_count || !weightForm.total_weight) {
                                showToast('Nhập số con và tổng trọng lượng', 'error'); return;
                            }
                            await API.care.logWeight({
                                cycle_id: cycleId, barn_id: barnId,
                                weigh_date: selectedDate.value, gender: 'mixed',
                                sample_count: parseInt(weightForm.sample_count),
                                total_weight: parseFloat(weightForm.total_weight),
                                samples: [], notes: weightForm.notes,
                            });
                        } else {
                            if (weightForm.samples.length === 0) {
                                showToast('Thêm ít nhất 1 mẫu cân', 'error'); return;
                            }
                            await API.care.logWeight({
                                cycle_id: cycleId, barn_id: barnId,
                                weigh_date: selectedDate.value, gender: 'mixed',
                                sample_count: weightForm.samples.length,
                                total_weight: weightForm.samples.reduce((s, x) => s + x.weight_g, 0) / 1000,
                                samples: weightForm.samples, notes: weightForm.notes,
                            });
                        }
                        resetForm('weightForm');
                        break;
                    }
                    case 'med': {
                        if (!medForm.quantity) {
                            showToast('Nhập số lượng thuốc', 'error'); return;
                        }
                        await API.care.logMedication({
                            cycle_id: cycleId, barn_id: barnId,
                            med_date: selectedDate.value, shift: null,
                            med_type: medForm.med_type || 'medicine',
                            quantity: parseFloat(medForm.quantity),
                            unit: medForm.unit,
                            product_id: medForm.product_id || null,
                            custom_name: medForm.custom_name || null,
                            method: medForm.method,
                            warehouse_id: medForm.warehouse_id || null,
                            notes: medForm.notes,
                        });
                        resetForm('medForm');
                        break;
                    }
                    case 'health': {
                        await API.care.logHealth({
                            cycle_id: cycleId, barn_id: barnId,
                            severity: healthForm.severity,
                            symptoms: healthForm.symptoms || null,
                            health_flags: healthForm.health_flags,
                            notes: healthForm.notes,
                            recorded_at: selectedDate.value,
                        });
                        resetForm('healthForm');
                        break;
                    }
                }
                showToast('Đã lưu ✓');
                await loadLogs();
            } catch (e) {
                showToast('Lỗi: ' + e.message, 'error');
            } finally {
                submitting.value = false;
            }
        }

        async function deleteLog(type, id) {
            if (!confirm('Xóa bản ghi?')) return;
            try {
                switch (type) {
                    case 'weight': await API.del(`/api/farm/care/weight/${id}`); break;
                    case 'medication': await API.del(`/api/farm/care/medication/${id}`); break;
                    case 'health': await API.del(`/api/farm/care/health/${id}`); break;
                }
                showToast('Đã xóa');
                await loadLogs();
            } catch (e) {
                showToast('Lỗi xóa: ' + e.message, 'error');
            }
        }

        function changeDate(delta) {
            const d = new Date(selectedDate.value);
            d.setDate(d.getDate() + delta);
            selectedDate.value = d.toISOString().slice(0, 10);
        }

        function goToToday() { selectedDate.value = new Date().toISOString().slice(0, 10); }

        function toggleHealthFlag(flag) {
            const idx = healthForm.health_flags.indexOf(flag);
            if (idx === -1) healthForm.health_flags.push(flag);
            else healthForm.health_flags.splice(idx, 1);
        }

        function setWeightMode(mode) { weightForm.mode = mode; }

        function addWeightSample() {
            if (parseFloat(weightForm.currentWeight) > 0) {
                weightForm.samples.push({
                    weight_g: Math.round(parseFloat(weightForm.currentWeight) * 1000),
                    gender: weightForm.currentGender,
                });
                weightForm.currentWeight = '';
            }
        }

        function removeWeightSample(idx) { weightForm.samples.splice(idx, 1); }

        function weightStats() {
            if (weightForm.mode === 'aggregate') {
                if (!weightForm.sample_count || !weightForm.total_weight || parseFloat(weightForm.sample_count) === 0) return null;
                return { avg: (parseFloat(weightForm.total_weight) / parseFloat(weightForm.sample_count)).toFixed(2) };
            } else {
                if (weightForm.samples.length === 0) return null;
                const total = weightForm.samples.reduce((s, x) => s + x.weight_g, 0);
                return { avg: (total / weightForm.samples.length / 1000).toFixed(2), count: weightForm.samples.length };
            }
        }

        function getWeightAvg() {
            const stats = weightStats();
            return stats ? stats.avg : null;
        }

        function selectMedProduct(productId) {
            medForm.product_id = medForm.product_id === productId ? '' : productId;
            if (medForm.product_id === productId) {
                medForm.custom_name = '';
            }
        }

        async function markVaccineDone(v) {
            try {
                await API.vaccines.schedules.done(v.id);
                showToast('Đã đánh dấu đã tiêm');
                await loadLogs();
            } catch (e) {
                showToast('Lỗi: ' + e.message, 'error');
            }
        }

        async function skipVaccine(v, reason) {
            try {
                await API.vaccines.schedules.skip(v.id, reason);
                showToast('Đã bỏ qua vaccine');
                await loadLogs();
            } catch (e) {
                showToast('Lỗi: ' + e.message, 'error');
            }
        }

        // ── Watchers ─────────────────────────────
        watch(selectedDate, () => loadLogs());
        watch(selectedCycleId, () => loadLogs());

        // ── Lifecycle ─────────────────────────────
        onMounted(() => loadData());

        return {
            // State
            cycles, products, warehouses, weightLogs, medLogs, healthNotes, vaccineSchedules,
            selectedCycleId, selectedDate,
            weightForm, medForm, healthForm,
            loading, submitting,
            // Computed
            selectedCycle, dayAge,
            todayWeights, todayMeds, todayHealth,
            medProducts,
            // Methods
            resetForm, submitForm, deleteLog, changeDate, goToToday,
            toggleHealthFlag, setWeightMode, addWeightSample, removeWeightSample,
            weightStats, getWeightAvg, selectMedProduct,
            markVaccineDone, skipVaccine,
            // Utils
            fmtDate, fmtNum,
        };
    },

    template: `
    <div class="page">
        <!-- Header -->
        <div class="page-header">
            <h2 class="page-title">📋 Chăm sóc - Records</h2>
        </div>
    <div class="care-records">
        <!-- Header -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
            <div class="flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <select v-model="selectedCycleId" class="px-4 py-2 border border-gray-200 rounded-lg font-medium bg-gray-50 focus:ring-2 focus:ring-green-500">
                        <option value="">-- Chọn đợt nuôi --</option>
                        <option v-for="c in cycles" :key="c.id" :value="c.id">
                            {{ c.name || 'Đợt ' + c.id }} · {{ c.barn_id }}
                        </option>
                    </select>
                    <div v-if="selectedCycle" class="px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                        <span class="text-gray-600">Ngày</span>
                        <span class="font-semibold text-gray-800 ml-1">{{ dayAge }}</span>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <button @click="changeDate(-1)" class="w-9 h-9 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center">‹</button>
                    <input type="date" v-model="selectedDate" class="px-3 py-2 border border-gray-200 rounded-lg font-medium">
                    <button @click="changeDate(1)" class="w-9 h-9 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center">›</button>
                    <button @click="goToToday" class="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg">Hôm nay</button>
                </div>

                <router-link to="/care" class="flex items-center gap-2 px-4 py-2 text-sm text-green-600 hover:text-green-700">
                    <span>←</span>
                    <span>Quay lại Daily</span>
                </router-link>
            </div>
        </div>

        <!-- No Cycle -->
        <div v-if="!selectedCycleId && !loading" class="text-center py-20 bg-white rounded-xl shadow-sm">
            <div class="text-5xl mb-4">📋</div>
            <h3 class="text-lg font-semibold text-gray-700 mb-2">Chưa chọn đợt nuôi</h3>
            <p class="text-gray-400">Chọn đợt nuôi để xem/sửa records</p>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="text-center py-12 text-gray-400">
            <div class="text-3xl animate-spin">⏳</div>
            <p class="mt-2">Đang tải...</p>
        </div>

        <!-- Main -->
        <div v-else-if="selectedCycle" class="space-y-4">
            <!-- 3 Cards Grid -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <!-- Weight -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-2">
                            <span class="text-xl">⚖️</span>
                            <h3 class="font-semibold text-gray-800">Cân nặng</h3>
                        </div>
                    </div>

                    <div v-if="todayWeights.length" class="space-y-2">
                        <div class="p-3 bg-blue-50 rounded-lg text-sm mb-2 flex items-center justify-between">
                            <div class="flex items-center gap-2 text-blue-600">
                                <span class="text-lg">✓</span>
                                <span class="font-medium">Đã ghi hôm nay</span>
                            </div>
                            <button @click="resetForm('weightForm')" class="px-3 py-1.5 bg-blue-200 text-blue-700 text-xs rounded-lg hover:bg-blue-300">+ Thêm</button>
                        </div>
                        <div class="max-h-32 overflow-y-auto space-y-2">
                            <div v-for="w in todayWeights" :key="w.id" class="flex items-center justify-between p-2 bg-blue-50 rounded-lg text-sm">
                                <div>
                                    <span class="font-medium text-blue-700">{{ w.sample_count }} con</span>
                                    <span class="text-gray-500 ml-1">· TB {{ (w.total_weight / w.sample_count).toFixed(2) }} kg</span>
                                </div>
                                <button @click="deleteLog('weight', w.id)" class="text-red-400 hover:text-red-600 text-xs">✕</button>
                            </div>
                        </div>
                    </div>

                    <div v-else class="space-y-3">
                        <p class="text-sm text-gray-400 text-center">Chưa cân hôm nay</p>
                        <div class="flex rounded-lg border border-gray-200 overflow-hidden">
                            <button @click="setWeightMode('aggregate')"
                                :class="weightForm.mode === 'aggregate' ? 'bg-blue-500 text-white' : 'bg-gray-50'"
                                class="flex-1 py-2 text-xs font-medium">📊 Tổng hợp</button>
                            <button @click="setWeightMode('samples')"
                                :class="weightForm.mode === 'samples' ? 'bg-blue-500 text-white' : 'bg-gray-50'"
                                class="flex-1 py-2 text-xs font-medium border-l border-gray-200">📋 Từng con</button>
                        </div>

                        <div v-if="weightForm.mode === 'aggregate'" class="space-y-2">
                            <div class="grid grid-cols-2 gap-2">
                                <div>
                                    <label class="text-xs text-gray-500 mb-1 block">Số con</label>
                                    <input v-model="weightForm.sample_count" type="number" min="0"
                                        class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="0">
                                </div>
                                <div>
                                    <label class="text-xs text-gray-500 mb-1 block">Tổng kg</label>
                                    <input v-model="weightForm.total_weight" type="number" step="0.1" min="0"
                                        class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="0">
                                </div>
                            </div>
                            <div v-if="weightStats()" class="text-center text-sm text-blue-600 font-medium">
                                TB: {{ weightStats().avg }} kg/con
                            </div>
                        </div>

                        <div v-else class="space-y-2">
                            <div class="flex items-end gap-2">
                                <div class="flex-1">
                                    <input v-model="weightForm.currentWeight" type="number" step="0.01"
                                        class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Cân (kg)">
                                </div>
                                <select v-model="weightForm.currentGender" class="px-3 py-2 border border-gray-200 rounded-lg text-xs">
                                    <option value="female">♀</option>
                                    <option value="male">♂</option>
                                </select>
                                <button @click="addWeightSample" class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium">+</button>
                            </div>
                            <div v-if="weightForm.samples.length > 0" class="text-xs text-gray-500 text-center">
                                {{ weightForm.samples.length }} con · TB {{ getWeightAvg() }} kg
                            </div>
                        </div>

                        <button @click="submitForm('weight')" :disabled="submitting"
                            class="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition relative">
                            <span v-if="submitting" class="absolute inset-0 flex items-center justify-center">
                                <svg class="animate-spin h-5 w-5 text-white"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                            </span>
                            <span :class="{'invisible': submitting}">Lưu ✓</span>
                        </button>
                    </div>
                </div>

                <!-- Medicine -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-2">
                            <span class="text-xl">💊</span>
                            <h3 class="font-semibold text-gray-800">Thuốc</h3>
                        </div>
                    </div>

                    <div v-if="todayMeds.length" class="space-y-2">
                        <div class="p-3 bg-purple-50 rounded-lg text-sm mb-2 flex items-center justify-between">
                            <div class="flex items-center gap-2 text-purple-600">
                                <span class="text-lg">✓</span>
                                <span class="font-medium">Đã ghi hôm nay</span>
                            </div>
                            <button @click="resetForm('medForm')" class="px-3 py-1.5 bg-purple-200 text-purple-700 text-xs rounded-lg hover:bg-purple-300">+ Thêm</button>
                        </div>
                        <div class="max-h-32 overflow-y-auto space-y-2">
                            <div v-for="m in todayMeds" :key="m.id" class="flex items-center justify-between p-2 bg-purple-50 rounded-lg text-sm">
                                <div>
                                    <span class="font-medium text-purple-700">{{ m.quantity }} {{ m.unit }}</span>
                                    <span class="text-gray-500 ml-1">{{ m.custom_name || m.product_name || m.med_type }}</span>
                                </div>
                                <button @click="deleteLog('medication', m.id)" class="text-red-400 hover:text-red-600 text-xs">✕</button>
                            </div>
                        </div>
                    </div>

                    <div v-else class="space-y-3">
                        <p class="text-sm text-gray-400 text-center">Chưa ghi hôm nay</p>
                        <div>
                            <label class="text-xs text-gray-500 mb-1 block">Tên thuốc</label>
                            <div class="flex flex-wrap gap-1 mb-2">
                                <button v-for="p in medProducts" :key="p.id"
                                    @click="selectMedProduct(p.id)"
                                    :class="medForm.product_id === p.id ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
                                    class="px-2 py-1 rounded text-xs font-medium transition">
                                    {{ p.name }}
                                </button>
                            </div>
                            <input v-model="medForm.custom_name" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="...hoặc gõ tên khác">
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="text-xs text-gray-500 mb-1 block">Số lượng</label>
                                <input v-model="medForm.quantity" type="number" step="0.1" min="0"
                                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="0">
                            </div>
                            <div>
                                <label class="text-xs text-gray-500 mb-1 block">Đơn vị</label>
                                <div class="flex rounded-lg border border-gray-200 overflow-hidden">
                                    <button @click="medForm.unit = 'g'" :class="medForm.unit === 'g' ? 'bg-purple-500 text-white' : 'bg-gray-50'" class="flex-1 py-2 text-xs font-medium">g</button>
                                    <button @click="medForm.unit = 'ml'" :class="medForm.unit === 'ml' ? 'bg-purple-500 text-white' : 'bg-gray-50'" class="flex-1 py-2 text-xs font-medium border-l border-gray-200">ml</button>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label class="text-xs text-gray-500 mb-1 block">Cách dùng</label>
                            <select v-model="medForm.method" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                                <option value="water">Pha nước</option>
                                <option value="inject">Tiêm</option>
                                <option value="spray">Xịt</option>
                                <option value="feed">Trộn thức ăn</option>
                            </select>
                        </div>
                        <button @click="submitForm('med')" :disabled="submitting"
                            class="w-full py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg transition relative">
                            <span v-if="submitting" class="absolute inset-0 flex items-center justify-center">
                                <svg class="animate-spin h-5 w-5 text-white"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                            </span>
                            <span :class="{'invisible': submitting}">Lưu ✓</span>
                        </button>
                    </div>
                </div>

                <!-- Health -->
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-2">
                            <span class="text-xl">🩺</span>
                            <h3 class="font-semibold text-gray-800">Sức khỏe</h3>
                        </div>
                    </div>

                    <div v-if="todayHealth.length" class="space-y-2">
                        <div class="p-3 bg-orange-50 rounded-lg text-sm mb-2 flex items-center justify-between">
                            <div class="flex items-center gap-2 text-orange-600">
                                <span class="text-lg">✓</span>
                                <span class="font-medium">Đã ghi hôm nay</span>
                            </div>
                            <button @click="resetForm('healthForm')" class="px-3 py-1.5 bg-orange-200 text-orange-700 text-xs rounded-lg hover:bg-orange-300">+ Thêm</button>
                        </div>
                        <div class="max-h-32 overflow-y-auto space-y-2">
                            <div v-for="h in todayHealth" :key="h.id" class="p-2 bg-orange-50 rounded-lg text-sm">
                                <div class="flex items-center justify-between">
                                    <span class="font-medium text-orange-700">{{ h.severity }}</span>
                                    <button @click="deleteLog('health', h.id)" class="text-red-400 hover:text-red-600 text-xs">✕</button>
                                </div>
                                <div v-if="h.symptoms" class="text-gray-500 text-xs mt-1">{{ h.symptoms }}</div>
                            </div>
                        </div>
                    </div>

                    <div v-else class="space-y-3">
                        <p class="text-sm text-gray-400 text-center">Chưa ghi hôm nay</p>
                        <div>
                            <label class="text-xs text-gray-500 mb-1 block">Mức độ</label>
                            <div class="flex rounded-lg border border-gray-200 overflow-hidden">
                                <button v-for="opt in [{v:'normal',l:'BT'},{v:'mild',l:'Nhẹ'},{v:'severe',l:'Nặng'}]" :key="opt.v"
                                    @click="healthForm.severity = opt.v"
                                    :class="healthForm.severity === opt.v ? 'bg-orange-500 text-white' : 'bg-gray-50'"
                                    class="flex-1 py-2 text-xs font-medium">
                                    {{ opt.l }}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label class="text-xs text-gray-500 mb-1 block">Triệu chứng</label>
                            <div class="flex flex-wrap gap-1">
                                <button v-for="flag in [{v:'cough',l:'Ho'},{v:'diarrhea',l:'Tiêu chảy'},{v:'lethargy',l:'Uể oải'},{v:'respiratory',l:'Hô hấp'}]" :key="flag.v"
                                    @click="toggleHealthFlag(flag.v)"
                                    :class="healthForm.health_flags.includes(flag.v) ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'"
                                    class="px-2 py-1 rounded text-xs font-medium">
                                    {{ flag.l }}
                                </button>
                            </div>
                        </div>
                        <div>
                            <textarea v-model="healthForm.symptoms" rows="2" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" placeholder="Mô tả thêm..."></textarea>
                        </div>
                        <button @click="submitForm('health')" :disabled="submitting"
                            class="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition relative">
                            <span v-if="submitting" class="absolute inset-0 flex items-center justify-center">
                                <svg class="animate-spin h-5 w-5 text-white"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                            </span>
                            <span :class="{'invisible': submitting}">Lưu ✓</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Vaccine Schedule -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-xl">💉</span>
                    <h3 class="font-semibold text-gray-800">Lịch Vaccine</h3>
                </div>

                <div v-if="vaccineSchedules.length === 0" class="text-center py-8 text-gray-400">
                    <p>Chưa có lịch vaccine cho đợt này</p>
                </div>

                <div v-else class="space-y-2">
                    <div v-for="v in vaccineSchedules" :key="v.id" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center"
                                :class="v.done ? 'bg-green-100 text-green-600' : v.skipped ? 'bg-gray-200 text-gray-400' : v.day_age_target === dayAge ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-blue-100 text-blue-600'">
                                <span v-if="v.done">✓</span>
                                <span v-else-if="v.skipped">⏭</span>
                                <span v-else>💉</span>
                            </div>
                            <div>
                                <div class="font-medium text-gray-800">{{ v.vaccine_name }}</div>
                                <div class="text-xs text-gray-500">
                                    Ngày {{ v.day_age_target }} · {{ v.method || 'Tiêu chuẩn' }}
                                    <span v-if="v.done" class="text-green-600 ml-2">· Đã tiêm</span>
                                    <span v-if="v.skipped" class="text-gray-400 ml-2">· Đã bỏ</span>
                                </div>
                            </div>
                        </div>
                        <div v-if="!v.done && !v.skipped" class="flex gap-2">
                            <button @click="markVaccineDone(v)" class="px-3 py-1.5 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600">✓ Đã tiêm</button>
                            <button @click="skipVaccine(v, 'skip')" class="px-3 py-1.5 bg-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-300">Bỏ</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    </div>
    `
};