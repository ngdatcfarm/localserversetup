const { ref, onMounted } = Vue;

const component = {
    props: ['id'],
    template: `
    <div>
        <div class="page-header">
            <div>
                <router-link to="/cycles" class="text-sm text-green-600 hover:underline">&larr; Đợt nuôi</router-link>
                <h2 class="page-title">{{ cycle.name || 'Đợt nuôi' }}</h2>
            </div>
        </div>

        <!-- KPI Cards -->
        <div class="kpi-grid mb-6" v-if="dash">
            <div class="card text-center">
                <div class="card-title">Còn sống</div>
                <div class="card-value text-green-600">{{ fmtNum(dash.alive_count) }}</div>
            </div>
            <div class="card text-center">
                <div class="card-title">Tỷ lệ chết</div>
                <div class="card-value text-red-600">{{ fmtNum(dash.mortality_rate, 1) }}%</div>
            </div>
            <div class="card text-center">
                <div class="card-title">Tổng cám (kg)</div>
                <div class="card-value text-blue-600">{{ fmtNum(dash.total_feed, 1) }}</div>
            </div>
            <div class="card text-center">
                <div class="card-title">FCR</div>
                <div class="card-value text-purple-600">{{ dash.fcr ? fmtNum(dash.fcr, 2) : '-' }}</div>
            </div>
            <div class="card text-center">
                <div class="card-title">Cám/con/ngày</div>
                <div class="card-value">{{ dash.feed_per_bird_day ? fmtNum(dash.feed_per_bird_day, 0) + 'g' : '-' }}</div>
            </div>
            <div class="card text-center">
                <div class="card-title">Trọng lượng TB</div>
                <div class="card-value">{{ dash.latest_weight ? fmtNum(dash.latest_weight, 0) + 'g' : '-' }}</div>
            </div>
            <div class="card text-center">
                <div class="card-title">Chết hôm nay</div>
                <div class="card-value text-red-500">{{ fmtNum(dash.today_deaths) }}</div>
            </div>
            <div class="card text-center">
                <div class="card-title">Cám hôm nay</div>
                <div class="card-value">{{ dash.today_feed ? fmtNum(dash.today_feed, 1) + 'kg' : '-' }}</div>
            </div>
        </div>

        <!-- Cycle Info -->
        <div class="card mb-6">
            <h3 class="font-semibold mb-3">Thông tin đợt nuôi</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span class="text-gray-500">Giống:</span> {{ cycle.breed || '-' }}</div>
                <div><span class="text-gray-500">Bắt đầu:</span> {{ fmtDate(cycle.start_date) }}</div>
                <div><span class="text-gray-500">Ban đầu:</span> {{ fmtNum(cycle.initial_count) }} con</div>
                <div><span class="text-gray-500">Trạng thái:</span>
                    <span :class="cycle.status==='active' ? 'badge badge-green' : 'badge badge-gray'">
                        {{ cycle.status === 'active' ? 'Đang nuôi' : 'Kết thúc' }}
                    </span>
                </div>
            </div>
        </div>

        <!-- Tabs: History -->
        <div class="tabs mb-4">
            <div class="tab" :class="{active: tab==='feed'}" @click="tab='feed'; loadTab()">Cho ăn</div>
            <div class="tab" :class="{active: tab==='death'}" @click="tab='death'; loadTab()">Tử vong</div>
            <div class="tab" :class="{active: tab==='medication'}" @click="tab='medication'; loadTab()">Thuốc/Vaccine</div>
            <div class="tab" :class="{active: tab==='weight'}" @click="tab='weight'; loadTab()">Cân</div>
            <div class="tab" :class="{active: tab==='sale'}" @click="tab='sale'; loadTab()">Bán</div>
        </div>

        <div class="table-wrap" v-if="history.length">
            <table>
                <thead>
                    <tr>
                        <th>Ngày</th>
                        <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="h in history" :key="h.id">
                        <td>{{ fmtDate(h.log_date || h.sale_date || h.created_at) }}</td>
                        <td v-for="col in columns" :key="col.key">{{ col.fmt ? col.fmt(h[col.key]) : (h[col.key] ?? '-') }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div v-else class="empty-state"><p>Chưa có dữ liệu</p></div>
    </div>`,

    setup(props) {
        const cycle = ref({});
        const dash = ref(null);
        const tab = ref('feed');
        const history = ref([]);

        const columns = Vue.computed(() => {
            switch(tab.value) {
                case 'feed': return [
                    { key: 'product_name', label: 'Sản phẩm' },
                    { key: 'quantity_kg', label: 'Số lượng (kg)', fmt: v => fmtNum(v, 1) },
                    { key: 'note', label: 'Ghi chú' },
                ];
                case 'death': return [
                    { key: 'quantity', label: 'Số con' },
                    { key: 'cause', label: 'Nguyên nhân' },
                    { key: 'note', label: 'Ghi chú' },
                ];
                case 'medication': return [
                    { key: 'product_name', label: 'Thuốc/Vaccine' },
                    { key: 'dosage', label: 'Liều lượng' },
                    { key: 'quantity_used', label: 'Số lượng', fmt: v => fmtNum(v, 2) },
                    { key: 'note', label: 'Ghi chú' },
                ];
                case 'weight': return [
                    { key: 'day_age', label: 'Ngày tuổi' },
                    { key: 'sample_count', label: 'Mẫu' },
                    { key: 'avg_weight', label: 'TB (g)', fmt: v => fmtNum(v, 0) },
                    { key: 'min_weight', label: 'Min (g)', fmt: v => fmtNum(v, 0) },
                    { key: 'max_weight', label: 'Max (g)', fmt: v => fmtNum(v, 0) },
                ];
                case 'sale': return [
                    { key: 'quantity', label: 'Số con' },
                    { key: 'total_weight_kg', label: 'Tổng kg', fmt: v => fmtNum(v, 1) },
                    { key: 'price_per_kg', label: 'Giá/kg', fmt: v => fmtNum(v, 0) },
                    { key: 'buyer', label: 'Người mua' },
                ];
                default: return [];
            }
        });

        async function loadTab() {
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

        return { cycle, dash, tab, history, columns, loadTab, fmtDate, fmtNum };
    }
};

return component;
