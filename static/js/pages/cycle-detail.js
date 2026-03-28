/**
 * Cycle Detail Page - KPIs + history tabs + vaccines + health notes
 */
const { ref, onMounted, computed } = Vue;

return {
    props: ['id'],

    setup(props) {
        const cycle = ref({});
        const dash = ref(null);
        const tab = ref('feed');
        const history = ref([]);
        const vaccineSchedules = ref([]);
        const healthNotes = ref([]);

        const columns = computed(() => {
            switch(tab.value) {
                case 'feed': return [
                    { key: 'product_name', label: 'San pham' },
                    { key: 'quantity', label: 'Kg', fmt: v => fmtNum(v, 1) },
                    { key: 'notes', label: 'Ghi chu' },
                ];
                case 'death': return [
                    { key: 'count', label: 'So con' },
                    { key: 'cause', label: 'Nguyen nhan' },
                    { key: 'symptoms', label: 'Trieu chung' },
                ];
                case 'medication': return [
                    { key: 'product_name', label: 'Thuoc' },
                    { key: 'method', label: 'Cach dung' },
                    { key: 'quantity', label: 'So luong', fmt: v => fmtNum(v, 2) },
                ];
                case 'weight': return [
                    { key: 'day_age', label: 'Ngay tuoi' },
                    { key: 'sample_count', label: 'Mau' },
                    { key: 'total_weight', label: 'Tong (g)', fmt: v => fmtNum(v, 0) },
                    { key: 'min_weight', label: 'Min', fmt: v => fmtNum(v, 0) },
                    { key: 'max_weight', label: 'Max', fmt: v => fmtNum(v, 0) },
                ];
                case 'sale': return [
                    { key: 'count', label: 'So con' },
                    { key: 'total_weight', label: 'Kg', fmt: v => fmtNum(v, 1) },
                    { key: 'unit_price', label: 'Gia/kg', fmt: v => fmtNum(v, 0) },
                    { key: 'total_amount', label: 'Tong tien', fmt: v => fmtNum(v, 0) },
                ];
                default: return [];
            }
        });

        async function loadTab() {
            if (tab.value === 'vaccine') { await loadVaccines(); return; }
            if (tab.value === 'health') { await loadHealth(); return; }
            try {
                const id = props.id;
                switch(tab.value) {
                    case 'feed': history.value = await API.care.feedHistory(id); break;
                    case 'death': history.value = await API.care.deathHistory(id); break;
                    case 'medication': history.value = await API.care.medHistory(id); break;
                    case 'weight': history.value = await API.care.weightHistory(id); break;
                    case 'sale': history.value = await API.care.saleHistory(id); break;
                }
            } catch(e) { history.value = []; }
        }

        async function loadVaccines() {
            try { vaccineSchedules.value = await API.vaccines.schedules.list(props.id); }
            catch(e) { vaccineSchedules.value = []; }
        }

        async function loadHealth() {
            try { healthNotes.value = await API.healthNotes.list(props.id); }
            catch(e) { healthNotes.value = []; }
        }

        async function markVaccineDone(s) {
            try { await API.vaccines.schedules.done(s.id); showToast('Da hoan thanh'); await loadVaccines(); }
            catch(e) { showToast(e.message, 'error'); }
        }

        async function markVaccineSkip(s) {
            const reason = prompt('Ly do bo qua?');
            if (reason === null) return;
            try { await API.vaccines.schedules.skip(s.id, reason); showToast('Da bo qua'); await loadVaccines(); }
            catch(e) { showToast(e.message, 'error'); }
        }

        async function resolveNote(n) {
            try { await API.healthNotes.resolve(n.id); showToast('Da giai quyet'); await loadHealth(); }
            catch(e) { showToast(e.message, 'error'); }
        }

        onMounted(async () => {
            try {
                const [c, d] = await Promise.all([
                    API.cycles.get(props.id),
                    API.cycles.dashboard(props.id).catch(() => null),
                ]);
                cycle.value = c || {};
                dash.value = d;
            } catch(e) { showToast(e.message, 'error'); }
            loadTab();
        });

        return { cycle, dash, tab, history, columns, vaccineSchedules, healthNotes,
                 loadTab, markVaccineDone, markVaccineSkip, resolveNote, fmtDate, fmtNum };
    },

    template: `
    <div>
        <div class="mb-4">
            <router-link to="/cycles" class="text-sm text-green-600 hover:underline">&larr; Dot nuoi</router-link>
            <h2 class="text-xl font-bold">{{ cycle.name || cycle.code || 'Dot nuoi' }}</h2>
        </div>

        <!-- KPI Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4" v-if="dash">
            <div class="card text-center p-3">
                <div class="text-xs text-gray-500 uppercase">Con song</div>
                <div class="text-2xl font-bold text-green-600">{{ fmtNum(dash.alive_count) }}</div>
            </div>
            <div class="card text-center p-3">
                <div class="text-xs text-gray-500 uppercase">Ty le chet</div>
                <div class="text-2xl font-bold text-red-600">{{ fmtNum(dash.mortality_rate, 1) }}%</div>
            </div>
            <div class="card text-center p-3">
                <div class="text-xs text-gray-500 uppercase">Tong cam</div>
                <div class="text-2xl font-bold text-blue-600">{{ fmtNum(dash.total_feed, 1) }}kg</div>
            </div>
            <div class="card text-center p-3">
                <div class="text-xs text-gray-500 uppercase">FCR</div>
                <div class="text-2xl font-bold text-purple-600">{{ dash.fcr ? fmtNum(dash.fcr, 2) : '-' }}</div>
            </div>
            <div class="card text-center p-3">
                <div class="text-xs text-gray-500 uppercase">Cam/con/ngay</div>
                <div class="text-xl font-bold">{{ dash.feed_per_bird_day ? fmtNum(dash.feed_per_bird_day, 0) + 'g' : '-' }}</div>
            </div>
            <div class="card text-center p-3">
                <div class="text-xs text-gray-500 uppercase">TB trong luong</div>
                <div class="text-xl font-bold">{{ dash.latest_weight ? fmtNum(dash.latest_weight, 0) + 'g' : '-' }}</div>
            </div>
            <div class="card text-center p-3">
                <div class="text-xs text-gray-500 uppercase">Chet hom nay</div>
                <div class="text-xl font-bold text-red-500">{{ fmtNum(dash.today_deaths) }}</div>
            </div>
            <div class="card text-center p-3">
                <div class="text-xs text-gray-500 uppercase">Cam hom nay</div>
                <div class="text-xl font-bold">{{ dash.today_feed ? fmtNum(dash.today_feed, 1) + 'kg' : '-' }}</div>
            </div>
        </div>

        <!-- Cycle Info -->
        <div class="card mb-4">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span class="text-gray-500">Giong:</span> {{ cycle.breed || '-' }}</div>
                <div><span class="text-gray-500">Bat dau:</span> {{ fmtDate(cycle.start_date) }}</div>
                <div><span class="text-gray-500">Ban dau:</span> {{ fmtNum(cycle.initial_count) }} con</div>
                <div><span class="text-gray-500">TT:</span>
                    <span :class="cycle.status==='active' ? 'text-green-600 font-medium' : 'text-gray-400'">
                        {{ cycle.status === 'active' ? 'Dang nuoi' : 'Ket thuc' }}
                    </span>
                </div>
            </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 mb-4 flex-wrap">
            <button v-for="t in ['feed','death','medication','weight','sale','vaccine','health']" :key="t"
                    @click="tab=t; loadTab()"
                    :class="tab===t ? 'bg-green-600 text-white' : 'bg-gray-200'"
                    class="px-3 py-1.5 rounded-lg text-sm font-medium">
                {{ {feed:'Cho an', death:'Tu vong', medication:'Thuoc', weight:'Can', sale:'Ban', vaccine:'Vaccine', health:'Suc khoe'}[t] }}
            </button>
        </div>

        <!-- History Table (feed/death/medication/weight/sale) -->
        <div v-if="['feed','death','medication','weight','sale'].includes(tab)">
            <div v-if="history.length" class="card overflow-x-auto">
                <table class="w-full text-sm">
                    <thead><tr class="text-left border-b">
                        <th class="pb-2">Ngay</th>
                        <th v-for="col in columns" :key="col.key" class="pb-2">{{ col.label }}</th>
                    </tr></thead>
                    <tbody>
                        <tr v-for="h in history" :key="h.id" class="border-b last:border-0">
                            <td class="py-1.5">{{ fmtDate(h.feed_date || h.death_date || h.med_date || h.weigh_date || h.sale_date || h.created_at) }}</td>
                            <td v-for="col in columns" :key="col.key">{{ col.fmt ? col.fmt(h[col.key]) : (h[col.key] ?? '-') }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="text-center text-gray-400 py-8">Chua co du lieu</div>
        </div>

        <!-- Vaccine Schedule -->
        <div v-if="tab==='vaccine'">
            <div v-if="vaccineSchedules.length" class="card overflow-x-auto">
                <table class="w-full text-sm">
                    <thead><tr class="text-left border-b">
                        <th class="pb-2">Ngay</th><th class="pb-2">Tuoi</th><th class="pb-2">Vaccine</th><th class="pb-2">Cach</th><th class="pb-2">TT</th><th class="pb-2"></th>
                    </tr></thead>
                    <tbody>
                        <tr v-for="s in vaccineSchedules" :key="s.id" class="border-b last:border-0" :class="s.done ? 'opacity-50' : ''">
                            <td class="py-1.5">{{ fmtDate(s.scheduled_date) }}</td>
                            <td class="font-mono">{{ s.day_age_target || '-' }}</td>
                            <td class="font-medium">{{ s.vaccine_name }}</td>
                            <td>{{ s.method || '-' }}</td>
                            <td>
                                <span v-if="s.done" class="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">OK</span>
                                <span v-else-if="s.skipped" class="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">Skip</span>
                                <span v-else class="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">Chua</span>
                            </td>
                            <td class="text-right">
                                <template v-if="!s.done && !s.skipped">
                                    <button @click="markVaccineDone(s)" class="text-green-600 text-xs mr-1">Done</button>
                                    <button @click="markVaccineSkip(s)" class="text-gray-500 text-xs">Skip</button>
                                </template>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="text-center text-gray-400 py-8">Chua co lich vaccine</div>
        </div>

        <!-- Health Notes -->
        <div v-if="tab==='health'">
            <div v-if="healthNotes.length" class="space-y-2">
                <div v-for="n in healthNotes" :key="n.id" class="card p-3" :class="n.resolved ? 'opacity-50' : ''">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="text-xs text-gray-500">{{ fmtDate(n.recorded_at || n.created_at) }}</span>
                            <span v-if="n.day_age" class="text-xs ml-2 text-green-700 font-mono">D{{ n.day_age }}</span>
                            <span v-if="n.severity" class="ml-2 px-2 py-0.5 rounded text-xs"
                                  :class="n.severity==='high' ? 'bg-red-100 text-red-700' : n.severity==='medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'">
                                {{ n.severity }}
                            </span>
                            <span v-if="n.resolved" class="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Resolved</span>
                        </div>
                        <button v-if="!n.resolved" @click="resolveNote(n)" class="text-green-600 text-xs">Giai quyet</button>
                    </div>
                    <p class="mt-1 text-sm">{{ n.symptoms || '-' }}</p>
                </div>
            </div>
            <div v-else class="text-center text-gray-400 py-8">Chua co ghi chu suc khoe</div>
        </div>
    </div>`
};
