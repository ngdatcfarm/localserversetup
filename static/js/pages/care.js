/**
 * Care Page V3 - Tối ưu UX/UI cho thao tác nhanh
 * - Gom nhóm Tab hợp lý (7 tab giữ nguyên nhưng cuộn ngang đẹp hơn)
 * - Vaccine hiển thị nổi bật ở Header, không cần tab riêng
 * - Form cân nặng tách biệt 2 chế độ rõ ràng
 * - Loại bỏ meal thừa, tự động map theo Shift
 * - Preview dữ liệu trước khi lưu
 * - Toast thông báo tinh tế
 */
const { ref, reactive, onMounted, computed, watch } = Vue;

// Toast notification helper (tích hợp sẵn)
function showToast(message, type = 'success') {
    const event = new CustomEvent('show-toast', { detail: { message, type } });
    window.dispatchEvent(event);
}

export default{
    setup() {
        // ── State ──────────────────────────────────────
        const cycles = ref([]);
        const warehouses = ref([]);
        const products = ref([]);
        const vaccineSchedules = ref([]);

        const feedLogs = ref([]);
        const deathLogs = ref([]);
        const medLogs = ref([]);
        const weightLogs = ref([]);
        const saleLogs = ref([]);
        const waterLogs = ref([]);
        const healthNotes = ref([]);

        const selectedCycleId = ref('');
        const selectedDate = ref(new Date().toISOString().slice(0, 10));
        const currentShift = ref('sang'); // 'sang' | 'chieu'
        const currentTab = ref('feed'); // feed, death, med, weight, water, health
        const loading = ref(false);
        const submitting = ref(false);

        // ── Forms ────────────────────────────────────────
        const feedForm = reactive({
            bag_count: 0,
            quantity: 0,
            warehouse_id: '',
            product_id: '',
            notes: ''
        });

        const deathForm = reactive({
            count: 0,
            cause: '',
            symptoms: '',
            notes: ''
        });

        const medForm = reactive({
            med_type: 'medicine',
            product_id: '',
            custom_name: '',
            quantity: 0,
            unit: 'g',
            method: 'water',
            warehouse_id: '',
            notes: ''
        });

        const weightForm = reactive({
            mode: 'aggregate', // 'aggregate' hoặc 'samples'
            sample_count: 0,
            total_weight: 0,
            samples: [],
            currentWeight: 0,
            currentGender: 'female',
            notes: ''
        });

        const waterForm = reactive({
            consumption_liters: 0,
            medicated: false,
            notes: ''
        });

        const healthForm = reactive({
            severity: 'normal',
            symptoms: '',
            health_flags: [],
            notes: ''
        });

        // ── Options ──────────────────────────────────────
        const mealOptions = [
            { value: 'sang', label: 'Sáng' },
            { value: 'chieu', label: 'Chiều' },
            { value: 'toi', label: 'Tối' },
            { value: 'all_day', label: 'Cả ngày' }
        ];

        const deathCauseOptions = [
            { value: 'disease', label: 'Bệnh' },
            { value: 'predator', label: 'Thú dữ' },
            { value: 'heat', label: 'Nóng' },
            { value: 'cold', label: 'Lạnh' },
            { value: 'other', label: 'Khác' }
        ];

        const medTypeOptions = [
            { value: 'vaccine', label: 'Vaccine' },
            { value: 'medicine', label: 'Thuốc' },
            { value: 'antibiotic', label: 'Kháng sinh' },
            { value: 'vitamin', label: 'Vitamin' },
            { value: 'probiotic', label: 'Probiotic' }
        ];

        const medMethodOptions = [
            { value: 'water', label: 'Pha nước' },
            { value: 'inject', label: 'Tiêm' },
            { value: 'spray', label: 'Xịt' },
            { value: 'feed', label: 'Trộn thức ăn' }
        ];

        const healthFlagOptions = [
            { value: 'cough', label: 'Ho' },
            { value: 'diarrhea', label: 'Tiêu chảy' },
            { value: 'lethargy', label: 'Uể oải' },
            { value: 'respiratory', label: 'Hô hấp' }
        ];

        const severityOptions = [
            { value: 'normal', label: 'Bình thường' },
            { value: 'mild', label: 'Nhẹ' },
            { value: 'severe', label: 'Nặng' }
        ];

        // ── Computed ───────────────────────────────────
        const selectedCycle = computed(() =>
            cycles.value.find(c => c.id == selectedCycleId.value) || null
        );

        const dayAge = computed(() => {
            if (!selectedCycle.value) return 0;
            const start = new Date(selectedCycle.value.start_date);
            const today = new Date(selectedDate.value);
            return Math.floor((today - start) / (1000 * 60 * 60 * 24));
        });

        const currentAlive = computed(() => {
            if (!selectedCycle.value) return 0;
            const cycle = selectedCycle.value;
            const totalDeaths = deathLogs.value.reduce((sum, l) => sum + (l.count || 0), 0);
            const totalSales = saleLogs.value.reduce((sum, l) => sum + (l.count || 0), 0);
            return (cycle.initial_count || 0) - totalDeaths - totalSales;
        });

        // Day Status
        const dayStatus = computed(() => {
            const dateStr = selectedDate.value;
            const morningFeeds = feedLogs.value.filter(l =>
                l.feed_date === dateStr && (l.meal === 'sang' || l.meal === 'all_day')
            );
            const afternoonFeeds = feedLogs.value.filter(l =>
                l.feed_date === dateStr && l.meal === 'chieu'
            );
            const morningDeaths = deathLogs.value.filter(l =>
                l.death_date === dateStr && (l.shift === 'sang' || l.shift === 'all_day')
            );
            const afternoonDeaths = deathLogs.value.filter(l =>
                l.death_date === dateStr && l.shift === 'chieu'
            );

            const hasMorning = morningFeeds.length > 0 || morningDeaths.length > 0;
            const hasAfternoon = afternoonFeeds.length > 0 || afternoonDeaths.length > 0;

            if (hasMorning && hasAfternoon) {
                return { text: 'Đã nhập đủ', class: 'green', icon: '✅' };
            } else if (hasMorning || hasAfternoon) {
                return { text: 'Thiếu ca', class: 'yellow', icon: '⚠️' };
            }
            return { text: 'Chưa nhập', class: 'gray', icon: '⏳' };
        });

        // Logs by date
        const todayFeeds = computed(() => feedLogs.value.filter(l => l.feed_date === selectedDate.value));
        const todayDeaths = computed(() => deathLogs.value.filter(l => l.death_date === selectedDate.value));
        const todayMeds = computed(() => medLogs.value.filter(l => l.med_date === selectedDate.value));
        const todayWeights = computed(() => weightLogs.value.filter(l => l.weigh_date === selectedDate.value));
        const todayWater = computed(() => waterLogs.value.filter(l => l.water_date === selectedDate.value));
        const todayHealth = computed(() => healthNotes.value.filter(l => l.recorded_at === selectedDate.value || !l.recorded_at));

        // Vaccines cần tiêm hôm nay
        const vaccinesToday = computed(() => {
            if (!selectedCycle.value) return [];
            return vaccineSchedules.value.filter(v =>
                v.day_age_target === dayAge.value && !v.done && !v.skipped
            );
        });

        // Quick stats
        const quickStats = computed(() => {
            if (!selectedCycle.value) return null;
            const totalFeed = todayFeeds.value.reduce((sum, l) => sum + (l.quantity || 0), 0);
            const totalDead = todayDeaths.value.reduce((sum, l) => sum + (l.count || 0), 0);
            const latestWeight = todayWeights.value[0];
            const avgWeight = latestWeight && latestWeight.sample_count > 0
                ? (latestWeight.total_weight / latestWeight.sample_count).toFixed(1)
                : null;

            return {
                feed: totalFeed.toFixed(1),
                dead: totalDead,
                weight: avgWeight,
                alive: currentAlive.value,
                dayAge: dayAge.value
            };
        });

        const feedProducts = computed(() => products.value.filter(p => p.product_type === 'feed'));
        const medProducts = computed(() => products.value.filter(p => p.product_type === 'medicine'));

        const feedWarehouses = computed(() => warehouses.value.filter(w => w.warehouse_type === 'feed' || w.warehouse_type === 'mixed'));
        const medWarehouses = computed(() => warehouses.value.filter(w => w.warehouse_type === 'medication' || w.warehouse_type === 'mixed'));

        const defaultFeedWarehouse = computed(() => {
            if (!selectedCycle.value) return null;
            return feedWarehouses.value.find(w =>
                w.barn_id === selectedCycle.value.barn_id ||
                w.name?.toLowerCase().includes(selectedCycle.value.barn_id?.toLowerCase() || '')
            ) || feedWarehouses.value[0] || null;
        });

        const defaultMedWarehouse = computed(() => {
            if (!selectedCycle.value) return null;
            return medWarehouses.value.find(w =>
                w.barn_id === selectedCycle.value.barn_id ||
                w.name?.toLowerCase().includes(selectedCycle.value.barn_id?.toLowerCase() || '')
            ) || medWarehouses.value[0] || null;
        });

        // Feed in bags (25kg per bag)
        const feedInBags = computed(() => feedForm.quantity / 25);

        // Auto-shift suggestion
        const autoShift = computed(() => {
            const dateStr = selectedDate.value;
            const morningFeeds = feedLogs.value.filter(l =>
                l.feed_date === dateStr && (l.meal === 'sang' || l.meal === 'all_day')
            );
            const morningDeaths = deathLogs.value.filter(l =>
                l.death_date === dateStr && (l.shift === 'sang' || l.shift === 'all_day')
            );
            if (morningFeeds.length > 0 || morningDeaths.length > 0) {
                return 'chieu';
            }
            return 'sang';
        });

        // Preview dữ liệu trước khi lưu
        const formPreview = computed(() => {
            switch (currentTab.value) {
                case 'feed': {
                    const qty = feedForm.bag_count > 0 ? feedForm.bag_count * 25 : feedForm.quantity;
                    if (qty <= 0) return null;
                    const product = feedProducts.value.find(p => p.id == feedForm.product_id);
                    return {
                        icon: '🌾',
                        text: `${qty} kg ${product ? product.name : 'thức ăn'}`,
                        shift: currentShift.value === 'sang' ? 'Buổi sáng' : 'Buổi chiều'
                    };
                }
                case 'death': {
                    if (deathForm.count <= 0) return null;
                    return {
                        icon: '📉',
                        text: `${deathForm.count} con hao hụt`,
                        shift: currentShift.value === 'sang' ? 'Buổi sáng' : 'Buổi chiều'
                    };
                }
                case 'med': {
                    const qty = medForm.quantity;
                    if (qty <= 0) return null;
                    const name = medForm.custom_name || (medProducts.value.find(p => p.id == medForm.product_id)?.name) || 'thuốc';
                    return {
                        icon: '💊',
                        text: `${qty} ${medForm.unit} ${name}`,
                        shift: currentShift.value === 'sang' ? 'Buổi sáng' : 'Buổi chiều'
                    };
                }
                case 'weight': {
                    if (weightForm.mode === 'aggregate') {
                        if (weightForm.sample_count <= 0 || weightForm.total_weight <= 0) return null;
                        const avg = (weightForm.total_weight / weightForm.sample_count).toFixed(2);
                        return {
                            icon: '⚖️',
                            text: `${weightForm.sample_count} con, TB ${avg} kg`
                        };
                    } else {
                        if (weightForm.samples.length === 0) return null;
                        return {
                            icon: '⚖️',
                            text: `${weightForm.samples.length} con đã cân`
                        };
                    }
                }
                case 'water': {
                    if (waterForm.consumption_liters <= 0) return null;
                    return {
                        icon: '💧',
                        text: `${waterForm.consumption_liters} lít nước`,
                        shift: currentShift.value === 'sang' ? 'Buổi sáng' : 'Buổi chiều'
                    };
                }
                case 'health': {
                    if (healthForm.severity === 'normal' && healthForm.health_flags.length === 0) return null;
                    return {
                        icon: '🩺',
                        text: `Tình trạng: ${severityOptions.find(o => o.value === healthForm.severity)?.label || 'Bình thường'}`
                    };
                }
                default: return null;
            }
        });

        const canSubmit = computed(() => {
            if (!selectedCycleId.value) return false;
            switch (currentTab.value) {
                case 'feed': {
                    const qty = feedForm.bag_count > 0 ? feedForm.bag_count * 25 : feedForm.quantity;
                    return qty > 0;
                }
                case 'death': return deathForm.count > 0;
                case 'med': return (medForm.product_id || medForm.custom_name.trim()) && medForm.quantity > 0;
                case 'weight': {
                    if (weightForm.mode === 'aggregate') {
                        return weightForm.sample_count > 0 && weightForm.total_weight > 0;
                    } else {
                        return weightForm.samples.length > 0;
                    }
                }
                case 'water': return waterForm.consumption_liters > 0;
                case 'health': return healthForm.severity !== 'normal' || healthForm.health_flags.length > 0;
                default: return false;
            }
        });

        // ── Methods ───────────────────────────────────
        async function loadData() {
            loading.value = true;
            try {
                const [c, w, p] = await Promise.all([
                    API.cycles.list(),
                    API.warehouses.list(),
                    API.products.list()
                ]);
                cycles.value = c.filter(x => x.status === 'active');
                warehouses.value = w;
                products.value = p;

                if (cycles.value.length === 1) {
                    selectedCycleId.value = cycles.value[0].id;
                }
            } catch (e) {
                showToast('Không thể tải dữ liệu: ' + e.message, 'error');
            }
            loading.value = false;
        }

        // Set default warehouse khi chọn cycle
        watch(selectedCycleId, async () => {
            if (selectedCycleId.value) {
                const defFeedWh = defaultFeedWarehouse.value;
                if (defFeedWh) feedForm.warehouse_id = defFeedWh.id;
                const defMedWh = defaultMedWarehouse.value;
                if (defMedWh) medForm.warehouse_id = defMedWh.id;
                
                // Tự động chọn shift dựa trên dữ liệu hiện có
                currentShift.value = autoShift.value;
                
                await loadCycleLogs();
            }
        });

        async function loadCycleLogs() {
            if (!selectedCycleId.value) return;
            try {
                const cycleId = selectedCycleId.value;
                const [f, d, m, w, s, wc, h, vs] = await Promise.all([
                    API.care.feedHistory(cycleId),
                    API.care.deathHistory(cycleId),
                    API.care.medHistory(cycleId),
                    API.care.weightHistory(cycleId),
                    API.care.saleHistory(cycleId),
                    API.care.waterHistory(cycleId),
                    API.care.healthHistory(cycleId),
                    API.vaccines.schedules.list(cycleId)
                ]);
                feedLogs.value = f;
                deathLogs.value = d;
                medLogs.value = m;
                weightLogs.value = w;
                saleLogs.value = s;
                waterLogs.value = wc;
                healthNotes.value = h;
                vaccineSchedules.value = vs;
            } catch (e) {
                console.error('Error loading logs:', e);
            }
        }

        function getShiftLabel(shift) {
            const labels = { sang: 'Sáng', chieu: 'Chiều', toi: 'Tối', all_day: 'Cả ngày' };
            return labels[shift] || shift;
        }

        function toggleShift() {
            currentShift.value = currentShift.value === 'sang' ? 'chieu' : 'sang';
        }

        function setTab(tab) {
            currentTab.value = tab;
        }

        async function submitForm() {
            if (!canSubmit.value || submitting.value) return;
            submitting.value = true;

            const barnId = selectedCycle.value?.barn_id || '';
            const cycleId = parseInt(selectedCycleId.value);

            try {
                switch (currentTab.value) {
                    case 'feed': {
                        const qty = feedForm.bag_count > 0 ? feedForm.bag_count * 25 : feedForm.quantity;
                        const mealMapping = currentShift.value === 'sang' ? 'sang' : 'chieu';
                        const data = {
                            cycle_id: cycleId,
                            barn_id: barnId,
                            feed_date: selectedDate.value,
                            meal: mealMapping,
                            product_id: feedForm.product_id || null,
                            quantity: qty,
                            warehouse_id: feedForm.warehouse_id || null,
                            notes: feedForm.notes
                        };
                        await API.care.logFeed(data);
                        feedForm.bag_count = 0;
                        feedForm.quantity = 0;
                        feedForm.notes = '';
                        break;
                    }
                    case 'death': {
                        const data = {
                            cycle_id: cycleId,
                            barn_id: barnId,
                            death_date: selectedDate.value,
                            count: deathForm.count,
                            cause: deathForm.cause || null,
                            symptoms: deathForm.symptoms,
                            notes: deathForm.notes,
                            shift: currentShift.value
                        };
                        await API.care.logDeath(data);
                        deathForm.count = 0;
                        deathForm.cause = '';
                        deathForm.symptoms = '';
                        deathForm.notes = '';
                        break;
                    }
                    case 'med': {
                        const data = {
                            cycle_id: cycleId,
                            barn_id: barnId,
                            med_date: selectedDate.value,
                            med_type: medForm.med_type,
                            product_id: medForm.product_id || null,
                            custom_name: medForm.custom_name.trim() || null,
                            quantity: medForm.quantity || null,
                            unit: medForm.unit,
                            method: medForm.method || 'water',
                            warehouse_id: medForm.warehouse_id || null,
                            notes: medForm.notes,
                            shift: currentShift.value
                        };
                        await API.care.logMedication(data);
                        medForm.quantity = 0;
                        medForm.custom_name = '';
                        medForm.notes = '';
                        break;
                    }
                    case 'weight': {
                        let samples = [];
                        let sample_count = 0;
                        let total_weight = 0;
                        if (weightForm.mode === 'aggregate') {
                            sample_count = weightForm.sample_count;
                            total_weight = weightForm.total_weight;
                        } else {
                            samples = weightForm.samples;
                        }
                        const data = {
                            cycle_id: cycleId,
                            barn_id: barnId,
                            weigh_date: selectedDate.value,
                            gender: 'mixed', // có thể cải tiến sau
                            sample_count,
                            total_weight,
                            samples,
                            notes: weightForm.notes
                        };
                        await API.care.logWeight(data);
                        weightForm.samples = [];
                        weightForm.sample_count = 0;
                        weightForm.total_weight = 0;
                        weightForm.notes = '';
                        break;
                    }
                    case 'water': {
                        const data = {
                            cycle_id: cycleId,
                            barn_id: barnId,
                            water_date: selectedDate.value,
                            consumption_liters: waterForm.consumption_liters,
                            medicated: waterForm.medicated,
                            notes: waterForm.notes,
                            shift: currentShift.value
                        };
                        await API.care.logWater(data);
                        waterForm.consumption_liters = 0;
                        waterForm.medicated = false;
                        waterForm.notes = '';
                        break;
                    }
                    case 'health': {
                        const data = {
                            cycle_id: cycleId,
                            barn_id: barnId,
                            severity: healthForm.severity,
                            symptoms: healthForm.symptoms,
                            health_flags: healthForm.health_flags,
                            notes: healthForm.notes,
                            recorded_at: selectedDate.value
                        };
                        await API.care.logHealth(data);
                        healthForm.severity = 'normal';
                        healthForm.symptoms = '';
                        healthForm.health_flags = [];
                        healthForm.notes = '';
                        break;
                    }
                }
                showToast('Đã ghi nhận thành công');
                await loadCycleLogs();
            } catch (e) {
                showToast('Lỗi: ' + e.message, 'error');
            }
            submitting.value = false;
        }

        async function deleteLog(type, id) {
            if (!confirm('Xóa bản ghi này?')) return;
            try {
                switch (type) {
                    case 'feed': await API.del(`/api/farm/care/feed/${id}`); break;
                    case 'death': await API.del(`/api/farm/care/death/${id}`); break;
                    case 'medication': await API.del(`/api/farm/care/medication/${id}`); break;
                    case 'weight': await API.del(`/api/farm/care/weight/${id}`); break;
                    case 'sale': await API.del(`/api/farm/care/sale/${id}`); break;
                    case 'water': await API.del(`/api/farm/care/water/${id}`); break;
                    case 'health': await API.del(`/api/farm/care/health/${id}`); break;
                }
                showToast('Đã xóa bản ghi');
                await loadCycleLogs();
            } catch (e) {
                showToast('Lỗi xóa: ' + e.message, 'error');
            }
        }

        async function markVaccineDone(vaccine) {
            try {
                await API.vaccines.schedules.done(vaccine.id);
                showToast('Đã đánh dấu đã tiêm');
                await loadCycleLogs();
            } catch (e) {
                showToast('Lỗi: ' + e.message, 'error');
            }
        }

        async function skipVaccine(vaccine, reason) {
            try {
                await API.vaccines.schedules.skip(vaccine.id, reason);
                showToast('Đã bỏ qua vaccine');
                await loadCycleLogs();
            } catch (e) {
                showToast('Lỗi: ' + e.message, 'error');
            }
        }

        function toggleHealthFlag(flag) {
            const idx = healthForm.health_flags.indexOf(flag);
            if (idx === -1) {
                healthForm.health_flags.push(flag);
            } else {
                healthForm.health_flags.splice(idx, 1);
            }
        }

        // Weight helpers
        function addWeightSample() {
            if (weightForm.currentWeight > 0) {
                weightForm.samples.push({
                    weight_g: Math.round(weightForm.currentWeight * 1000),
                    gender: weightForm.currentGender
                });
                weightForm.currentWeight = 0;
            }
        }

        function removeWeightSample(idx) {
            weightForm.samples.splice(idx, 1);
        }

        function clearWeightSamples() {
            weightForm.samples = [];
        }

        function setWeightMode(mode) {
            weightForm.mode = mode;
        }

        const weightStats = computed(() => {
            if (weightForm.mode === 'aggregate') {
                if (weightForm.sample_count > 0 && weightForm.total_weight > 0) {
                    const avg = weightForm.total_weight / weightForm.sample_count;
                    return { count: weightForm.sample_count, avg, unit: 'kg' };
                }
                return null;
            } else {
                if (weightForm.samples.length === 0) return null;
                const weights = weightForm.samples.map(s => s.weight_g);
                const total = weights.reduce((a, b) => a + b, 0);
                const count = weights.length;
                const avg = total / count / 1000;
                const maleSamples = weightForm.samples.filter(s => s.gender === 'male');
                const femaleSamples = weightForm.samples.filter(s => s.gender === 'female');
                const avgMale = maleSamples.length > 0
                    ? maleSamples.reduce((a, b) => a + b.weight_g, 0) / maleSamples.length / 1000 : null;
                const avgFemale = femaleSamples.length > 0
                    ? femaleSamples.reduce((a, b) => a + b.weight_g, 0) / femaleSamples.length / 1000 : null;
                return {
                    count,
                    avg,
                    unit: 'kg',
                    male: { count: maleSamples.length, avg: avgMale },
                    female: { count: femaleSamples.length, avg: avgFemale }
                };
            }
        });

        // Watch date changes
        watch(selectedDate, () => {
            // Tự động cập nhật shift khi đổi ngày
            currentShift.value = autoShift.value;
        });

        // Navigate date
        function changeDate(delta) {
            const d = new Date(selectedDate.value);
            d.setDate(d.getDate() + delta);
            selectedDate.value = d.toISOString().slice(0, 10);
        }

        function goToToday() {
            selectedDate.value = new Date().toISOString().slice(0, 10);
        }

        // ── Lifecycle ─────────────────────────────────
        onMounted(() => {
            loadData();
        });

        // ── Template ──────────────────────────────────
        return {
            cycles,
            warehouses,
            products,
            selectedCycleId,
            selectedCycle,
            selectedDate,
            currentShift,
            currentTab,
            loading,
            submitting,
            quickStats,
            canSubmit,
            dayStatus,
            dayAge,
            currentAlive,
            formPreview,
            // Forms
            feedForm,
            deathForm,
            medForm,
            weightForm,
            waterForm,
            healthForm,
            // Options
            mealOptions,
            deathCauseOptions,
            medTypeOptions,
            medMethodOptions,
            healthFlagOptions,
            severityOptions,
            // Logs
            todayFeeds,
            todayDeaths,
            todayMeds,
            todayWeights,
            todayWater,
            todayHealth,
            vaccinesToday,
            feedProducts,
            medProducts,
            feedWarehouses,
            medWarehouses,
            feedInBags,
            defaultFeedWarehouse,
            defaultMedWarehouse,
            autoShift,
            weightStats,
            // Methods
            loadData,
            loadCycleLogs,
            submitForm,
            deleteLog,
            markVaccineDone,
            skipVaccine,
            toggleShift,
            setTab,
            getShiftLabel,
            toggleHealthFlag,
            addWeightSample,
            removeWeightSample,
            clearWeightSamples,
            setWeightMode,
            changeDate,
            goToToday,
            fmtNum,
            fmtDate
        };
    },

    template: `
    <div class="care-page care-v3">
        <!-- Cycle Selector - TOP -->
        <div class="card mb-4 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 shadow-sm">
            <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div class="flex-1 w-full">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Đợt nuôi đang chăm sóc</label>
                    <select v-model="selectedCycleId" class="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition">
                        <option value="">-- Chọn đợt nuôi --</option>
                        <option v-for="c in cycles" :key="c.id" :value="c.id">
                            {{ c.name || 'Đợt ' + c.id }} ({{ c.barn_id }})
                        </option>
                    </select>
                </div>
                <div class="flex items-center gap-2">
                    <div class="text-center px-4 py-2 bg-white rounded-lg shadow-sm border border-green-100">
                        <div class="text-lg font-bold text-green-600">{{ fmtNum(currentAlive) }}</div>
                        <div class="text-xs text-gray-500">con sống</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Day Status Header -->
        <div v-if="selectedCycle" class="card mb-4 bg-white border-l-4 border-l-green-500 shadow-sm overflow-hidden">
            <div class="flex flex-wrap items-center justify-between gap-4">
                <!-- Cycle Info -->
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-xl shadow-inner">
                        🔄
                    </div>
                    <div>
                        <div class="font-bold text-gray-900 text-lg">{{ selectedCycle.name || 'Đợt ' + selectedCycle.id }}</div>
                        <div class="text-sm text-gray-500 flex items-center gap-1">
                            <span>{{ selectedCycle.barn_name || selectedCycle.barn_id }}</span>
                            <span class="w-1 h-1 bg-gray-300 rounded-full"></span>
                            <span>Ngày tuổi: <strong>{{ dayAge }}</strong></span>
                        </div>
                    </div>
                </div>

                <!-- Quick Stats -->
                <div class="flex items-center gap-2 flex-wrap">
                    <div v-if="quickStats" class="flex items-center gap-2">
                        <div class="text-center px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
                            <div class="text-sm font-semibold text-blue-700">{{ quickStats.feed }} kg</div>
                            <div class="text-xs text-blue-500">thức ăn</div>
                        </div>
                        <div v-if="quickStats.dead > 0" class="text-center px-3 py-1.5 bg-red-50 rounded-lg border border-red-100">
                            <div class="text-sm font-semibold text-red-700">{{ quickStats.dead }}</div>
                            <div class="text-xs text-red-500">hao hụt</div>
                        </div>
                    </div>
                </div>

                <!-- Day Status Badge -->
                <div class="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-lg">
                    <span class="text-2xl">{{ dayStatus.icon }}</span>
                    <div>
                        <div class="font-semibold text-sm" :class="{
                            'text-green-600': dayStatus.class === 'green',
                            'text-yellow-600': dayStatus.class === 'yellow',
                            'text-gray-500': dayStatus.class === 'gray'
                        }">
                            {{ dayStatus.text }}
                        </div>
                        <div class="text-xs text-gray-400">{{ fmtDate(selectedDate) }}</div>
                    </div>
                </div>
            </div>

            <!-- Date Navigator -->
            <div class="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                <div class="flex items-center gap-2">
                    <button @click="changeDate(-1)" class="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center transition">←</button>
                    <input type="date" v-model="selectedDate" class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500">
                    <button @click="changeDate(1)" class="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center transition">→</button>
                    <button @click="goToToday" class="ml-2 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition">Hôm nay</button>
                </div>
                
                <!-- Vaccine Alert Compact -->
                <div v-if="vaccinesToday.length > 0" class="flex items-center gap-2">
                    <span class="relative flex h-3 w-3">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                    <span class="text-sm font-medium text-red-600">{{ vaccinesToday.length }} vaccine cần tiêm hôm nay</span>
                </div>
            </div>
        </div>

        <!-- No Cycle Selected -->
        <div v-if="!selectedCycleId && !loading" class="card text-center py-16 bg-white rounded-xl shadow-sm">
            <div class="text-6xl mb-4">🔄</div>
            <h3 class="text-xl font-bold text-gray-900 mb-2">Chưa có đợt nuôi nào</h3>
            <p class="text-gray-500 mb-6">Vui lòng chọn đợt nuôi để ghi nhận</p>
            <select v-model="selectedCycleId" class="form-input max-w-xs mx-auto">
                <option value="">-- Chọn đợt nuôi --</option>
                <option v-for="c in cycles" :key="c.id" :value="c.id">
                    {{ c.name || 'Đợt ' + c.id }}
                </option>
            </select>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="text-center py-12 text-gray-400">
            <div class="text-3xl mb-2 animate-spin">⏳</div>
            <p>Đang tải dữ liệu...</p>
        </div>

        <!-- Main Content -->
        <div v-else-if="selectedCycle" class="space-y-4">
            <!-- Shift Toggle + Tabs -->
            <div class="card bg-white shadow-sm">
                <!-- Shift Toggle -->
                <div class="flex items-center justify-between mb-4">
                    <div class="flex gap-1 p-1 bg-gray-100 rounded-xl">
                        <button @click="currentShift = 'sang'"
                            :class="currentShift === 'sang' 
                                ? 'bg-white shadow text-yellow-700' 
                                : 'text-gray-600 hover:bg-gray-200'"
                            class="px-5 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-1">
                            <span>🌅</span> Sáng
                        </button>
                        <button @click="currentShift = 'chieu'"
                            :class="currentShift === 'chieu' 
                                ? 'bg-white shadow text-orange-700' 
                                : 'text-gray-600 hover:bg-gray-200'"
                            class="px-5 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-1">
                            <span>🌇</span> Chiều
                        </button>
                    </div>
                    <div class="text-xs text-gray-400 italic">
                        Ca làm việc hiện tại
                    </div>
                </div>

                <!-- Tabs with horizontal scroll on mobile -->
                <div class="border-b border-gray-200 pb-1">
                    <div class="flex gap-0.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                        <button @click="setTab('feed')" 
                            :class="currentTab === 'feed' 
                                ? 'bg-green-600 text-white shadow-sm' 
                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'"
                            class="flex-shrink-0 px-4 py-2 rounded-t-lg text-sm font-medium transition-all flex items-center gap-1">
                            <span>🌾</span> Cho ăn
                        </button>
                        <button @click="setTab('water')" 
                            :class="currentTab === 'water' 
                                ? 'bg-cyan-600 text-white shadow-sm' 
                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'"
                            class="flex-shrink-0 px-4 py-2 rounded-t-lg text-sm font-medium transition-all flex items-center gap-1">
                            <span>💧</span> Nước
                        </button>
                        <button @click="setTab('death')" 
                            :class="currentTab === 'death' 
                                ? 'bg-red-600 text-white shadow-sm' 
                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'"
                            class="flex-shrink-0 px-4 py-2 rounded-t-lg text-sm font-medium transition-all flex items-center gap-1">
                            <span>📉</span> Hao hụt
                        </button>
                        <button @click="setTab('med')" 
                            :class="currentTab === 'med' 
                                ? 'bg-purple-600 text-white shadow-sm' 
                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'"
                            class="flex-shrink-0 px-4 py-2 rounded-t-lg text-sm font-medium transition-all flex items-center gap-1">
                            <span>💊</span> Thuốc
                        </button>
                        <button @click="setTab('weight')" 
                            :class="currentTab === 'weight' 
                                ? 'bg-blue-600 text-white shadow-sm' 
                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'"
                            class="flex-shrink-0 px-4 py-2 rounded-t-lg text-sm font-medium transition-all flex items-center gap-1">
                            <span>⚖️</span> Cân
                        </button>
                        
                        <button @click="setTab('health')" 
                            :class="currentTab === 'health' 
                                ? 'bg-orange-600 text-white shadow-sm' 
                                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'"
                            class="flex-shrink-0 px-4 py-2 rounded-t-lg text-sm font-medium transition-all flex items-center gap-1">
                            <span>🩺</span> Sức khỏe
                        </button>
                    </div>
                </div>

                <!-- Tab Content -->
                <div class="mt-5">
                    <!-- FEED TAB -->
                    <div v-if="currentTab === 'feed'">
                        <div class="flex items-center gap-2 mb-3">
                            <span class="text-xl">🌾</span>
                            <h3 class="font-semibold text-gray-800">Ghi nhận cho ăn - {{ currentShift === 'sang' ? 'Buổi Sáng' : 'Buổi Chiều' }}</h3>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="space-y-1">
                                <label class="text-sm font-medium text-gray-700">Số bao (25kg/bao)</label>
                                <input v-model.number="feedForm.bag_count" type="number" 
                                    class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500" 
                                    placeholder="VD: 2" min="0" step="1">
                                <div v-if="feedForm.bag_count > 0" class="text-sm text-green-600 mt-1">
                                    = {{ (feedForm.bag_count * 25).toFixed(0) }} kg
                                </div>
                            </div>
                            <div class="space-y-1">
                                <label class="text-sm font-medium text-gray-700">Hoặc nhập kg trực tiếp</label>
                                <input v-model.number="feedForm.quantity" type="number" 
                                    class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500" 
                                    placeholder="VD: 50" min="0" step="0.1">
                            </div>
                            <div class="space-y-1">
                                <label class="text-sm font-medium text-gray-700">Kho ({{ defaultFeedWarehouse?.name || 'Mặc định' }})</label>
                                <select v-model="feedForm.warehouse_id" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
                                    <option value="">-- Kho mặc định --</option>
                                    <option v-for="w in feedWarehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                                </select>
                            </div>
                            <div class="md:col-span-2 space-y-2">
                                <label class="text-sm font-medium text-gray-700">Loại thức ăn</label>
                                <div class="flex flex-wrap gap-2">
                                    <button v-for="p in feedProducts" :key="p.id"
                                        @click="feedForm.product_id = p.id"
                                        :class="feedForm.product_id === p.id ? 'bg-green-600 text-white shadow-sm' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'"
                                        class="px-3 py-2 rounded-lg text-sm font-medium transition-all">
                                        {{ p.name }}
                                    </button>
                                </div>
                            </div>
                            <div class="md:col-span-2 space-y-1">
                                <label class="text-sm font-medium text-gray-700">Ghi chú</label>
                                <input v-model="feedForm.notes" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg" placeholder="Ghi chú (tuỳ chọn)">
                            </div>
                        </div>
                    </div>

                    <!-- DEATH TAB -->
                    <div v-if="currentTab === 'death'">
                        <div class="flex items-center gap-2 mb-3">
                            <span class="text-xl">📉</span>
                            <h3 class="font-semibold text-gray-800">Ghi nhận hao hụt - {{ currentShift === 'sang' ? 'Buổi Sáng' : 'Buổi Chiều' }}</h3>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="space-y-1">
                                <label class="text-sm font-medium text-gray-700">Số con hao hụt <span class="text-red-500">*</span></label>
                                <input v-model.number="deathForm.count" type="number" 
                                    class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500" 
                                    placeholder="VD: 2" min="0">
                            </div>
                            <div class="space-y-1">
                                <label class="text-sm font-medium text-gray-700">Nguyên nhân</label>
                                <select v-model="deathForm.cause" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg">
                                    <option value="">-- Chọn nguyên nhân --</option>
                                    <option v-for="opt in deathCauseOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                                </select>
                            </div>
                            <div class="md:col-span-2 space-y-1">
                                <label class="text-sm font-medium text-gray-700">Triệu chứng</label>
                                <input v-model="deathForm.symptoms" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg" placeholder="Mô tả triệu chứng">
                            </div>
                            <div class="md:col-span-2 space-y-1">
                                <label class="text-sm font-medium text-gray-700">Ghi chú</label>
                                <input v-model="deathForm.notes" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg" placeholder="Ghi chú (tuỳ chọn)">
                            </div>
                        </div>
                    </div>

                    <!-- MEDICATION TAB -->
                    <div v-if="currentTab === 'med'">
                        <div class="flex items-center gap-2 mb-3">
                            <span class="text-xl">💊</span>
                            <h3 class="font-semibold text-gray-800">Ghi nhận thuốc - {{ currentShift === 'sang' ? 'Buổi Sáng' : 'Buổi Chiều' }}</h3>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="space-y-1">
                                <label class="text-sm font-medium text-gray-700">Loại</label>
                                <select v-model="medForm.med_type" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg">
                                    <option v-for="opt in medTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                                </select>
                            </div>
                            <div class="space-y-1">
                                <label class="text-sm font-medium text-gray-700">Đơn vị</label>
                                <div class="flex gap-2">
                                    <button @click="medForm.unit = 'g'"
                                        :class="medForm.unit === 'g' ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100'"
                                        class="flex-1 px-4 py-2 rounded-lg font-medium text-sm">Gam (g)</button>
                                    <button @click="medForm.unit = 'ml'"
                                        :class="medForm.unit === 'ml' ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100'"
                                        class="flex-1 px-4 py-2 rounded-lg font-medium text-sm">ML (ml)</button>
                                </div>
                            </div>
                            <div class="space-y-1">
                                <label class="text-sm font-medium text-gray-700">Kho thuốc</label>
                                <select v-model="medForm.warehouse_id" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg">
                                    <option value="">-- Kho mặc định --</option>
                                    <option v-for="w in medWarehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                                </select>
                            </div>
                            <div class="md:col-span-2 space-y-2">
                                <label class="text-sm font-medium text-gray-700">Tên thuốc</label>
                                <div class="flex flex-wrap gap-2 mb-2">
                                    <button v-for="p in medProducts" :key="p.id"
                                        @click="medForm.product_id = p.id; medForm.custom_name = ''"
                                        :class="medForm.product_id === p.id && !medForm.custom_name ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 hover:bg-gray-200'"
                                        class="px-3 py-2 rounded-lg text-sm font-medium">
                                        {{ p.name }}
                                    </button>
                                </div>
                                <input v-model="medForm.custom_name" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg" placeholder="...hoặc gõ tên thuốc mới">
                            </div>
                            <div class="space-y-1">
                                <label class="text-sm font-medium text-gray-700">Số lượng ({{ medForm.unit }})</label>
                                <input v-model.number="medForm.quantity" type="number" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg" placeholder="VD: 100" min="0" step="0.1">
                            </div>
                            <div class="space-y-1">
                                <label class="text-sm font-medium text-gray-700">Cách dùng</label>
                                <select v-model="medForm.method" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg">
                                    <option v-for="opt in medMethodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                                </select>
                            </div>
                            <div class="md:col-span-2 space-y-1">
                                <label class="text-sm font-medium text-gray-700">Ghi chú</label>
                                <input v-model="medForm.notes" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg" placeholder="Ghi chú (tuỳ chọn)">
                            </div>
                        </div>
                    </div>

                    <!-- WEIGHT TAB -->
                    <div v-if="currentTab === 'weight'">
                        <div class="flex items-center gap-2 mb-3">
                            <span class="text-xl">⚖️</span>
                            <h3 class="font-semibold text-gray-800">Ghi nhận cân nặng</h3>
                        </div>

                        <!-- Mode Selector -->
                        <div class="flex gap-2 mb-4">
                            <button @click="setWeightMode('aggregate')"
                                :class="weightForm.mode === 'aggregate' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
                                class="flex-1 px-4 py-2 rounded-lg font-medium text-sm transition">
                                📊 Nhập tổng hợp
                            </button>
                            <button @click="setWeightMode('samples')"
                                :class="weightForm.mode === 'samples' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
                                class="flex-1 px-4 py-2 rounded-lg font-medium text-sm transition">
                                📋 Cân từng con
                            </button>
                        </div>

                        <!-- Aggregate Mode -->
                        <div v-if="weightForm.mode === 'aggregate'">
                            <div class="grid grid-cols-2 gap-4">
                                <div class="space-y-1">
                                    <label class="text-sm font-medium text-gray-700">Số con cân</label>
                                    <input v-model.number="weightForm.sample_count" type="number" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg" placeholder="50" min="0">
                                </div>
                                <div class="space-y-1">
                                    <label class="text-sm font-medium text-gray-700">Tổng trọng lượng (kg)</label>
                                    <input v-model.number="weightForm.total_weight" type="number" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg" placeholder="125" min="0" step="0.1">
                                </div>
                            </div>
                            <div v-if="weightStats" class="mt-3 p-3 bg-blue-50 rounded-lg text-center">
                                <span class="text-blue-700 font-medium">Trung bình: {{ weightStats.avg.toFixed(2) }} kg/con</span>
                            </div>
                        </div>

                        <!-- Samples Mode -->
                        <div v-else>
                            <div class="bg-blue-50 rounded-lg p-4 mb-4">
                                <div class="flex items-end gap-2">
                                    <div class="flex-1">
                                        <label class="text-sm font-medium text-gray-700">Cân nặng (kg)</label>
                                        <input v-model.number="weightForm.currentWeight" type="number" 
                                            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg" 
                                            placeholder="1.5" step="0.01" min="0">
                                    </div>
                                    <div class="w-32">
                                        <label class="text-sm font-medium text-gray-700">Giới tính</label>
                                        <select v-model="weightForm.currentGender" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg">
                                            <option value="female">🐔 Mái</option>
                                            <option value="male">🐓 Trống</option>
                                        </select>
                                    </div>
                                    <button @click="addWeightSample" class="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                                        + Thêm
                                    </button>
                                </div>

                                <!-- Sample List -->
                                <div v-if="weightForm.samples.length > 0" class="mt-3">
                                    <div class="flex items-center justify-between mb-2">
                                        <span class="text-sm font-medium text-blue-700">
                                            Đã cân: {{ weightForm.samples.length }} con
                                        </span>
                                        <button @click="clearWeightSamples" class="text-sm text-red-600 hover:underline">
                                            Xóa tất cả
                                        </button>
                                    </div>
                                    <div class="flex flex-wrap gap-1">
                                        <span v-for="(s, idx) in weightForm.samples" :key="idx"
                                            @click="removeWeightSample(idx)"
                                            :class="s.gender === 'male' ? 'bg-orange-200 text-orange-800' : 'bg-pink-100 text-pink-800'"
                                            class="px-2 py-1 rounded-full text-xs border cursor-pointer hover:opacity-70"
                                            title="Click để xóa">
                                            {{ (s.weight_g / 1000).toFixed(2) }}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <!-- Stats -->
                            <div v-if="weightStats" class="grid grid-cols-2 gap-2">
                                <div class="p-3 bg-green-100 rounded-lg text-center">
                                    <div class="text-xl font-bold text-green-700">{{ weightStats.count }}</div>
                                    <div class="text-xs text-green-600">Tổng con</div>
                                </div>
                                <div class="p-3 bg-blue-100 rounded-lg text-center">
                                    <div class="text-xl font-bold text-blue-700">{{ weightStats.avg.toFixed(2) }} kg</div>
                                    <div class="text-xs text-blue-600">Trung bình</div>
                                </div>
                                <div v-if="weightStats.male.count > 0" class="p-3 bg-orange-100 rounded-lg text-center">
                                    <div class="text-xl font-bold text-orange-700">{{ weightStats.male.count }}</div>
                                    <div class="text-xs text-orange-600">Trống ({{ weightStats.male.avg?.toFixed(2) }}kg)</div>
                                </div>
                                <div v-if="weightStats.female.count > 0" class="p-3 bg-pink-100 rounded-lg text-center">
                                    <div class="text-xl font-bold text-pink-700">{{ weightStats.female.count }}</div>
                                    <div class="text-xs text-pink-600">Mái ({{ weightStats.female.avg?.toFixed(2) }}kg)</div>
                                </div>
                            </div>
                        </div>

                        <div class="mt-4 space-y-1">
                            <label class="text-sm font-medium text-gray-700">Ghi chú</label>
                            <input v-model="weightForm.notes" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg" placeholder="Ghi chú (tuỳ chọn)">
                        </div>
                    </div>

                    <!-- WATER TAB -->
                    <div v-if="currentTab === 'water'">
                        <div class="flex items-center gap-2 mb-3">
                            <span class="text-xl">💧</span>
                            <h3 class="font-semibold text-gray-800">Ghi nhận nước uống - {{ currentShift === 'sang' ? 'Buổi Sáng' : 'Buổi Chiều' }}</h3>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="space-y-1">
                                <label class="text-sm font-medium text-gray-700">Lượng nước (lít) <span class="text-red-500">*</span></label>
                                <input v-model.number="waterForm.consumption_liters" type="number" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg" placeholder="VD: 200" min="0" step="0.1">
                            </div>
                            <div class="flex items-center space-x-2 pt-6">
                                <input v-model="waterForm.medicated" type="checkbox" id="medicated" class="w-5 h-5 text-cyan-600 rounded focus:ring-cyan-500">
                                <label for="medicated" class="text-sm font-medium text-gray-700">Có pha thuốc</label>
                            </div>
                            <div class="md:col-span-2 space-y-1">
                                <label class="text-sm font-medium text-gray-700">Ghi chú</label>
                                <input v-model="waterForm.notes" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg" placeholder="Ghi chú (tuỳ chọn)">
                            </div>
                        </div>
                    </div>

                    <!-- HEALTH TAB -->
                    <div v-if="currentTab === 'health'">
                        <div class="flex items-center gap-2 mb-3">
                            <span class="text-xl">🩺</span>
                            <h3 class="font-semibold text-gray-800">Ghi nhận sức khỏe đàn</h3>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="space-y-1">
                                <label class="text-sm font-medium text-gray-700">Mức độ</label>
                                <select v-model="healthForm.severity" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg">
                                    <option v-for="opt in severityOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                                </select>
                            </div>
                            <div class="md:col-span-2 space-y-2">
                                <label class="text-sm font-medium text-gray-700">Triệu chứng</label>
                                <div class="flex flex-wrap gap-2">
                                    <button v-for="flag in healthFlagOptions" :key="flag.value"
                                        @click="toggleHealthFlag(flag.value)"
                                        :class="healthForm.health_flags.includes(flag.value) ? 'bg-orange-500 text-white shadow-sm' : 'bg-gray-100 hover:bg-gray-200'"
                                        class="px-3 py-1.5 rounded-full text-sm font-medium transition">
                                        {{ flag.label }}
                                    </button>
                                </div>
                            </div>
                            <div class="md:col-span-2 space-y-1">
                                <label class="text-sm font-medium text-gray-700">Mô tả chi tiết</label>
                                <textarea v-model="healthForm.symptoms" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg" rows="2" placeholder="Mô tả tình trạng..."></textarea>
                            </div>
                            <div class="md:col-span-2 space-y-1">
                                <label class="text-sm font-medium text-gray-700">Ghi chú</label>
                                <input v-model="healthForm.notes" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg" placeholder="Ghi chú (tuỳ chọn)">
                            </div>
                        </div>
                    </div>

                    <!-- Preview & Submit -->
                    <div class="mt-6 pt-4 border-t border-gray-200">
                        <div v-if="formPreview" class="mb-4 p-3 bg-blue-50 rounded-lg flex items-center gap-3">
                            <span class="text-2xl">{{ formPreview.icon }}</span>
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-700">{{ formPreview.text }}</div>
                                <div v-if="formPreview.shift" class="text-xs text-gray-500">{{ formPreview.shift }}</div>
                            </div>
                            <span class="text-blue-600 text-sm">Sẵn sàng lưu</span>
                        </div>
                        <button @click="submitForm" :disabled="!canSubmit || submitting"
                            class="w-full md:w-auto px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2">
                            <span v-if="submitting" class="animate-spin">⏳</span>
                            <span v-else>💾</span>
                            {{ submitting ? 'Đang lưu...' : 'Lưu dữ liệu' }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Vaccine Reminder Card (if any today) -->
            <div v-if="vaccinesToday.length > 0" class="card bg-red-50 border border-red-200">
                <div class="flex items-center gap-3 mb-3">
                    <span class="text-2xl">💉</span>
                    <h3 class="font-semibold text-red-800">Vaccine cần tiêm hôm nay (Ngày {{ dayAge }})</h3>
                </div>
                <div class="space-y-2">
                    <div v-for="v in vaccinesToday" :key="v.id" class="flex items-center justify-between p-3 bg-white rounded-lg border border-red-100">
                        <div>
                            <div class="font-medium text-gray-900">{{ v.vaccine_name }}</div>
                            <div class="text-sm text-gray-500">{{ v.method || 'Tiêu chuẩn' }} · {{ v.dosage || 'Liều tiêu chuẩn' }}</div>
                        </div>
                        <div class="flex gap-2">
                            <button @click="markVaccineDone(v)" class="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">✓ Đã tiêm</button>
                            <button @click="skipVaccine(v, 'Skip')" class="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300">Bỏ qua</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Today's Logs Summary -->
            <div class="card bg-white shadow-sm">
                <h3 class="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <span>📋</span> Nhật ký hôm nay ({{ fmtDate(selectedDate) }})
                </h3>

                <!-- Feed Logs -->
                <div v-if="todayFeeds.length > 0" class="mb-4">
                    <div class="font-medium text-green-700 mb-2 text-sm">🌾 Cho ăn</div>
                    <div class="space-y-1">
                        <div v-for="f in todayFeeds" :key="f.id" class="flex items-center justify-between p-2.5 bg-green-50 rounded-lg">
                            <div class="flex items-center gap-2">
                                <span :class="f.meal === 'sang' || f.meal === 'all_day' ? 'bg-yellow-400' : 'bg-orange-400'"
                                    class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white">
                                    {{ f.meal === 'sang' || f.meal === 'all_day' ? '☀️' : '🌇' }}
                                </span>
                                <span class="text-sm">{{ getShiftLabel(f.meal) }}</span>
                            </div>
                            <div class="text-sm font-medium">{{ f.quantity }} kg</div>
                            <button @click="deleteLog('feed', f.id)" class="text-red-500 hover:text-red-700 p-1">✕</button>
                        </div>
                    </div>
                </div>

                <!-- Death Logs -->
                <div v-if="todayDeaths.length > 0" class="mb-4">
                    <div class="font-medium text-red-700 mb-2 text-sm">📉 Hao hụt</div>
                    <div class="space-y-1">
                        <div v-for="d in todayDeaths" :key="d.id" class="flex items-center justify-between p-2.5 bg-red-50 rounded-lg">
                            <div class="flex items-center gap-2">
                                <span :class="d.shift === 'sang' ? 'bg-yellow-400' : 'bg-orange-400'"
                                    class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white">
                                    {{ d.shift === 'sang' ? '☀️' : '🌇' }}
                                </span>
                                <span class="text-sm">{{ d.shift === 'sang' ? 'Sáng' : 'Chiều' }}</span>
                            </div>
                            <div class="text-sm font-medium">{{ d.count }} con</div>
                            <button @click="deleteLog('death', d.id)" class="text-red-500 hover:text-red-700 p-1">✕</button>
                        </div>
                    </div>
                </div>

                <!-- Med Logs -->
                <div v-if="todayMeds.length > 0" class="mb-4">
                    <div class="font-medium text-purple-700 mb-2 text-sm">💊 Thuốc</div>
                    <div class="space-y-1">
                        <div v-for="m in todayMeds" :key="m.id" class="flex items-center justify-between p-2.5 bg-purple-50 rounded-lg">
                            <div class="flex items-center gap-2">
                                <span :class="m.shift === 'sang' ? 'bg-yellow-400' : 'bg-orange-400'"
                                    class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white">
                                    {{ m.shift === 'sang' ? '☀️' : '🌇' }}
                                </span>
                                <span class="text-sm">{{ m.custom_name || m.product_name || m.med_type }}</span>
                            </div>
                            <div class="text-sm font-medium">{{ m.quantity }} {{ m.unit || 'g' }}</div>
                            <button @click="deleteLog('medication', m.id)" class="text-red-500 hover:text-red-700 p-1">✕</button>
                        </div>
                    </div>
                </div>

                <!-- Water Logs -->
                <div v-if="todayWater.length > 0" class="mb-4">
                    <div class="font-medium text-cyan-700 mb-2 text-sm">💧 Nước</div>
                    <div class="space-y-1">
                        <div v-for="w in todayWater" :key="w.id" class="flex items-center justify-between p-2.5 bg-cyan-50 rounded-lg">
                            <div class="flex items-center gap-2">
                                <span :class="w.shift === 'sang' ? 'bg-yellow-400' : 'bg-orange-400'"
                                    class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white">
                                    {{ w.shift === 'sang' ? '☀️' : '🌇' }}
                                </span>
                                <span class="text-sm">{{ w.shift === 'sang' ? 'Sáng' : 'Chiều' }}</span>
                            </div>
                            <div class="text-sm font-medium">{{ w.consumption_liters }} lít{{ w.medicated ? ' (có thuốc)' : '' }}</div>
                            <button @click="deleteLog('water', w.id)" class="text-red-500 hover:text-red-700 p-1">✕</button>
                        </div>
                    </div>
                </div>

                <!-- Health Logs -->
                <div v-if="todayHealth.length > 0" class="mb-4">
                    <div class="font-medium text-orange-700 mb-2 text-sm">🩺 Sức khỏe</div>
                    <div class="space-y-1">
                        <div v-for="h in todayHealth" :key="h.id" class="flex items-center justify-between p-2.5 bg-orange-50 rounded-lg">
                            <div class="text-sm">{{ h.severity }} · {{ h.symptoms?.substring(0, 30) }}</div>
                            <button @click="deleteLog('health', h.id)" class="text-red-500 hover:text-red-700 p-1">✕</button>
                        </div>
                    </div>
                </div>

                <!-- Empty state -->
                <div v-if="todayFeeds.length === 0 && todayDeaths.length === 0 && todayMeds.length === 0 && todayWater.length === 0 && todayHealth.length === 0" 
                    class="text-center py-8 text-gray-400">
                    <div class="text-4xl mb-2">📝</div>
                    <p>Chưa có nhật ký nào hôm nay</p>
                </div>
            </div>
        </div>
    </div>
    `
};