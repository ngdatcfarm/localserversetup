/**
 * Care History - Timeline view of all care events
 * Route: /care/history
 * Mobile-first, .cf-care-* CSS namespace
 *
 * Sort/filter enhancements:
 * - Date range picker (from → to)
 * - Sort: newest / oldest / by type
 * - Search box (matches notes/symptoms)
 * - Group by date with sticky headers
 * - Calendar heatmap (per-day classification with mixed-med overlay)
 *
 * Refactored 2026-08-16: uses useCareContext() for shared state/loading/
 * watcher wiring. Page-specific (filter chips, sort, search, timeline
 * formatting) stays here. Does NOT use <care-context-card> — has its own
 * header.
 */
import { useCareContext } from '../composables/useCareContext.js';
import CareCyclePill from '../components/care-cycle-pill.js';
const { ref, computed, watch, onMounted } = Vue;
const { useRoute } = VueRouter;

export default {
    components: { CareCyclePill },
    setup() {
        const ctx = useCareContext();
        const route = useRoute();

        // ── Local helper (mirrors app.js fmtNum) ────────────
        // Exposed in setup return so templates can call {{ fmtNum(x) }} safely
        // via the component proxy. Also needed for formatDetail() helper below,
        // which runs inside the setup scope (no module-level access to app.js's
        // fmtNum from inside a Vue page module).
        function fmtNum(n, dec = 0) {
            if (n === null || n === undefined) return '-';
            return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        }

        const timeline = ref([]);
        const activeFilter = ref('all');

        // ── Calendar heatmap state ─────────────────────────
        const calendarMonth = ref(null);      // Date = first day of viewed month
        const calendarData = ref({});         // { 'YYYY-MM-DD': dayObj }
        const calendarMeta = ref(null);       // { cycle_start, cycle_end, today_hcm }
        const calendarLoading = ref(false);
        const calendarRequestSeq = ref(0);    // race-condition guard for late responses
        const selectedDate = ref(null);       // 'YYYY-MM-DD' | null
        const dayDetail = ref(null);          // { feeds_sang, meds_*, deaths, water_*, mixed_med_* }
        const dayLoading = ref(false);

        // Filter keys supported by ?type= query param (allows deep-linking
        // from daily pages like /care/history?type=water).
        const VALID_TYPES = ['all', 'feed', 'medication', 'death', 'water', 'health', 'sale'];
        watch(() => route.query.type, (t) => {
            const key = Array.isArray(t) ? t[0] : t;
            if (key && VALID_TYPES.includes(key)) {
                activeFilter.value = key;
            } else if (!key && activeFilter.value !== 'all') {
                activeFilter.value = 'all';
            }
        }, { immediate: true });

        // Sort/filter state
        const dateFrom = ref('');
        const dateTo = ref('');
        const sortBy = ref('date_desc');
        const searchText = ref('');

        // ── Computed ───────────────────────────────
        const filters = [
            { key: 'all', label: 'Tất cả' },
            { key: 'feed', label: 'Cho ăn' },
            { key: 'medication', label: 'Thuốc' },
            { key: 'death', label: 'Tử vong' },
            { key: 'water', label: 'Nước' },
            { key: 'health', label: 'Sức khỏe' },
            { key: 'sale', label: 'Bán' },
        ];

        const typeIcons = {
            feed: '🌾', medication: '💊', death: '📉', water: '💧', health: '🩺', sale: '💰'
        };

        const typeLabels = {
            feed: 'Cho ăn', medication: 'Thuốc', death: 'Tử vong',
            water: 'Nước', health: 'Sức khỏe', sale: 'Bán'
        };

        // Hardcoded feed codes — must match FEED_TYPES in care.js
        const FEED_CODES = ['311H', '311', '312', '313'];

        const sortOptions = [
            { key: 'date_desc', label: 'Mới nhất trước' },
            { key: 'date_asc', label: 'Cũ nhất trước' },
            { key: 'type', label: 'Theo loại' },
        ];

        const filteredTimeline = computed(() => {
            let items = timeline.value;
            if (activeFilter.value !== 'all') {
                items = items.filter(e => e.type === activeFilter.value);
            }
            const q = (searchText.value || '').trim().toLowerCase();
            if (q) {
                items = items.filter(e => {
                    const haystack = [
                        e.notes, e.symptoms, e.product_name, e.custom_name,
                        e.cause, e.consumption_liters ? String(e.consumption_liters) : ''
                    ].filter(Boolean).join(' ').toLowerCase();
                    return haystack.includes(q);
                });
            }
            return items;
        });

        const groupedTimeline = computed(() => {
            let items = [...filteredTimeline.value];

            switch (sortBy.value) {
                case 'date_asc':
                    items.sort((a, b) => String(a.entry_date || '').localeCompare(String(b.entry_date || '')));
                    break;
                case 'type':
                    items.sort((a, b) => {
                        if (a.type !== b.type) return String(a.type).localeCompare(String(b.type));
                        return String(b.entry_date || '').localeCompare(String(a.entry_date || ''));
                    });
                    break;
                case 'date_desc':
                default:
                    items.sort((a, b) => String(b.entry_date || '').localeCompare(String(a.entry_date || '')));
            }

            const groups = {};
            for (const e of items) {
                const key = (e.entry_date || 'unknown').slice(0, 10);
                if (!groups[key]) groups[key] = [];
                groups[key].push(e);
            }

            const entries = Object.entries(groups);
            if (sortBy.value !== 'date_asc') {
                entries.sort(([a], [b]) => b.localeCompare(a));
            } else {
                entries.sort(([a], [b]) => a.localeCompare(b));
            }
            return entries;
        });

        const summary = computed(() => {
            const counts = {};
            for (const t of timeline.value) {
                counts[t.type] = (counts[t.type] || 0) + 1;
            }
            return { total: timeline.value.length, counts };
        });

        // ── Calendar computeds ────────────────────────────
        const calMonthLabel = computed(() => {
            if (!calendarMonth.value) return '';
            const m = calendarMonth.value.getMonth() + 1;
            const y = calendarMonth.value.getFullYear();
            return `Tháng ${m}/${y}`;
        });

        // Vietnamese weekday names, Monday-first (T2 = Thứ 2 = Monday)
        const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

        function computeColor(d) {
            // d: { has_feed_sang, has_feed_chieu, has_med_sang, has_med_chieu,
            //      has_mixed_med, death_count, water_liters, in_range }
            if (!d.in_range) return 'out-of-range';
            const hasFeedFull = d.has_feed_sang && d.has_feed_chieu;
            const hasAnyMed = d.has_med_sang || d.has_med_chieu;
            const green = hasFeedFull && hasAnyMed;
            const yellow =
                d.has_feed_sang || d.has_feed_chieu ||
                d.has_med_sang || d.has_med_chieu ||
                (d.death_count && d.death_count > 0) ||
                (d.water_liters && Number(d.water_liters) > 0);
            if (green) return 'green';
            if (yellow) return 'yellow';
            return 'white';
        }

        const calCells = computed(() => {
            const cells = [];
            if (!calendarMonth.value) return cells;
            // generate_series in SQL already returns month-1 to month_end,
            // so we just iterate calendarData in date order.
            const orderedDates = Object.keys(calendarData.value).sort();
            if (orderedDates.length === 0) return cells;

            // Compute leading blanks so day-1 lands under correct weekday.
            // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat. We want Mon-first:
            //   Mon→0, Tue→1, ..., Sat→5, Sun→6
            const firstIso = orderedDates[0];
            const firstDate = new Date(firstIso + 'T00:00:00');
            const jsDow = firstDate.getDay(); // 0..6, Sun=0
            const monFirstIdx = (jsDow + 6) % 7; // 0..6 with Mon=0
            for (let i = 0; i < monFirstIdx; i++) {
                cells.push({ blank: true, key: `blank-${i}` });
            }

            for (const iso of orderedDates) {
                const d = calendarData.value[iso];
                const cls = computeColor(d);
                const hasMixed = d.in_range && d.has_mixed_med;
                const dayNum = Number(iso.slice(8, 10));
                cells.push({
                    iso,
                    day: dayNum,
                    cls,
                    hasMixed,
                    in_range: d.in_range,
                    data: d,
                    key: iso,
                    // Tooltip text — use \\n in template literal to produce 'n' literal at runtime
                    title:
                        `Ngày ${iso}\n` +
                        (d.in_range
                            ? `Cho ăn: ${d.has_feed_sang ? 'sáng' : '—'}${d.has_feed_chieu ? ' chiều' : ''}\n` +
                              `Thuốc: ${d.has_med_sang ? 'sáng' : '—'}${d.has_med_chieu ? ' chiều' : ''}\n` +
                              (d.death_count > 0 ? `Tử vong: ${d.death_count}\n` : '') +
                              (Number(d.water_liters) > 0 ? `Nước: ${d.water_liters}L\n` : '') +
                              (hasMixed ? `Thuốc trộn cám: ${d.mixed_med_count}\n` : '')
                            : 'Ngoài khoảng đợt nuôi'),
                });
            }
            return cells;
        });

        const hasActiveFilters = computed(() =>
            !!(dateFrom.value || dateTo.value || searchText.value.trim() || activeFilter.value !== 'all')
        );

        // ── Methods ───────────────────────────────
        async function loadTimeline() {
            if (!ctx.selectedCycleId.value) { timeline.value = []; return; }
            try {
                const opts = { limit: 500 };
                if (activeFilter.value !== 'all') opts.type = activeFilter.value;
                if (dateFrom.value) opts.date_from = dateFrom.value;
                if (dateTo.value) opts.date_to = dateTo.value;
                const data = await API.care.timeline(ctx.selectedCycleId.value, opts);
                timeline.value = Array.isArray(data) ? data : [];
            } catch (e) {
                timeline.value = [];
            }
        }

        function clearFilters() {
            dateFrom.value = '';
            dateTo.value = '';
            searchText.value = '';
            activeFilter.value = 'all';
            sortBy.value = 'date_desc';
        }

        // ── Calendar methods ──────────────────────────────
        async function loadCalendar(monthIso) {
            if (!ctx.selectedCycleId.value) {
                calendarData.value = {};
                calendarMeta.value = null;
                return;
            }
            const seq = ++calendarRequestSeq.value;
            calendarLoading.value = true;
            try {
                const data = await API.care.calendar(ctx.selectedCycleId.value, monthIso);
                // Drop stale responses if user navigated months quickly
                if (seq !== calendarRequestSeq.value) return;
                const map = {};
                for (const d of (data.days || [])) map[d.date] = d;
                calendarData.value = map;
                calendarMeta.value = {
                    cycle_start: data.cycle_start,
                    cycle_end: data.cycle_end,
                    today_hcm: data.today_hcm,
                };
            } catch (e) {
                if (seq !== calendarRequestSeq.value) return;
                calendarData.value = {};
                showToast('Lỗi tải lịch: ' + e.message, 'error');
            } finally {
                if (seq === calendarRequestSeq.value) calendarLoading.value = false;
            }
        }

        async function selectDay(iso) {
            // Out-of-range days are no-op
            const d = calendarData.value[iso];
            if (!d || !d.in_range) return;
            selectedDate.value = iso;
            dayDetail.value = null;
            dayLoading.value = true;
            try {
                dayDetail.value = await API.care.dayDetail(ctx.selectedCycleId.value, iso);
            } catch (e) {
                showToast('Lỗi tải chi tiết ngày: ' + e.message, 'error');
                selectedDate.value = null;
            } finally {
                dayLoading.value = false;
            }
        }

        function closeDay() {
            selectedDate.value = null;
            dayDetail.value = null;
        }

        function calPrevMonth() {
            if (!calendarMonth.value) return;
            const d = new Date(calendarMonth.value);
            d.setMonth(d.getMonth() - 1);
            calendarMonth.value = d;
            const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
            loadCalendar(m);
        }

        function calNextMonth() {
            if (!calendarMonth.value) return;
            const d = new Date(calendarMonth.value);
            d.setMonth(d.getMonth() + 1);
            calendarMonth.value = d;
            const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
            loadCalendar(m);
        }

        function calGoToday() {
            const today = new Date();
            calendarMonth.value = new Date(today.getFullYear(), today.getMonth(), 1);
            const m = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
            loadCalendar(m);
            closeDay();
        }

        function calDayName(iso) {
            if (!iso) return '';
            const d = new Date(iso + 'T00:00:00');
            const dow = d.getDay();
            const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
            return names[dow];
        }

        function medLabel(m) {
            return m.custom_name || m.product_name || m.med_type || 'Thuốc';
        }

        async function deleteEntry(entry) {
            ctx.askDelete('Xóa bản ghi này?', async () => {
                try {
                    const delMap = {
                        feed: () => API.care.delFeed(entry.id),
                        medication: () => API.care.delMedication(entry.id),
                        death: () => API.care.delDeath(entry.id),
                        water: () => API.care.delWater(entry.id),
                        health: () => API.care.delHealth(entry.id),
                        sale: () => API.care.delSale(entry.id),
                    };
                    const fn = delMap[entry.type];
                    if (fn) await fn();
                    showToast('Đã xóa', 'success');
                    await loadTimeline();
                } catch (e) {
                    showToast('Lỗi: ' + e.message, 'error');
                }
            });
        }

        function formatDetail(entry) {
            switch (entry.type) {
                case 'feed': {
                    const first = (entry.notes || '').split(' · ')[0];
                    const name = entry.product_name || (FEED_CODES.includes(first) ? first : '') || 'Cám';
                    return `${name} — ${fmtNum(entry.quantity || 0, 1)} kg`;
                }
                case 'medication':
                    return `${entry.custom_name || entry.product_name || entry.med_type || 'Thuốc'}${entry.quantity ? ' — ' + entry.quantity + ' ' + (entry.unit || '') : ''}`;
                case 'death':
                    return `${entry.count} con${entry.cause ? ' · ' + entry.cause : ''}`;
                case 'water':
                    return `${entry.consumption_liters || 0} lít${entry.medicated ? ' (có thuốc)' : ''}`;
                case 'health':
                    return `${entry.severity === 'normal' ? 'Bình thường' : entry.severity === 'mild' ? 'Nhẹ' : entry.severity === 'severe' ? 'Nặng' : entry.severity}${entry.symptoms ? ' · ' + entry.symptoms : ''}`;
                case 'sale':
                    return `${entry.count} con${entry.total_weight ? ' · ' + entry.total_weight + ' kg' : ''}${entry.unit_price ? ' · ' + fmtNum(entry.unit_price) + 'đ/kg' : ''}`;
                default:
                    return entry.notes || '';
            }
        }

        function formatShift(entry) {
            if (!entry.shift || entry.shift === 'all_day') return '';
            return entry.shift === 'sang' ? '☀️ Sáng' : '🌆 Chiều';
        }

        function fmtDate(dateStr) {
            if (!dateStr) return '';
            const parts = dateStr.split('-');
            if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            return dateStr;
        }

        function dateGroupLabel(dateStr) {
            if (!dateStr || dateStr === 'unknown') return 'Không rõ ngày';
            const today = new Date().toISOString().slice(0, 10);
            const yesterday = (() => {
                const d = new Date();
                d.setDate(d.getDate() - 1);
                return d.toISOString().slice(0, 10);
            })();
            if (dateStr === today) return 'Hôm nay · ' + fmtDate(dateStr);
            if (dateStr === yesterday) return 'Hôm qua · ' + fmtDate(dateStr);
            return fmtDate(dateStr);
        }

        // ── Watchers ─────────────────────────────
        // Cycle changes: refetch timeline AND calendar (close any open day panel).
        ctx.onCycleChange(async () => {
            closeDay();
            const today = new Date();
            if (!calendarMonth.value) {
                calendarMonth.value = new Date(today.getFullYear(), today.getMonth(), 1);
            }
            const m = `${calendarMonth.value.getFullYear()}-${String(calendarMonth.value.getMonth() + 1).padStart(2, '0')}-01`;
            await Promise.all([loadTimeline(), loadCalendar(m)]);
        });

        // Filter/sort changes trigger server-side refetch (but only if cycle set).
        watch([activeFilter, dateFrom, dateTo], () => {
            if (ctx.selectedCycleId.value) loadTimeline();
        });

        // ── Lifecycle ─────────────────────────────
        onMounted(() => ctx.loadInitialData(
            loadTimeline,
            async () => {
                // Initialize calendar to today's HCM month and load it in parallel with timeline
                const today = new Date();
                calendarMonth.value = new Date(today.getFullYear(), today.getMonth(), 1);
                const m = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
                await loadCalendar(m);
            },
        ));

        return {
            // helpers
            fmtNum,
            // shared context state (no context-card, no selectedDate/keepage)
            cycles: ctx.cycles, selectedCycleId: ctx.selectedCycleId,
            loading: ctx.loading, confirmDelete: ctx.confirmDelete,
            selectedCycle: ctx.selectedCycle, dayAge: ctx.dayAge, aliveCount: ctx.aliveCount, survivalRate: ctx.survivalRate,
            askDelete: ctx.askDelete, doConfirmDelete: ctx.doConfirmDelete, cancelDelete: ctx.cancelDelete,
            // page-specific
            timeline, activeFilter, dateFrom, dateTo, sortBy, searchText,
            filters, typeIcons, typeLabels, sortOptions,
            filteredTimeline, groupedTimeline, summary, hasActiveFilters,
            deleteEntry, formatDetail, formatShift, fmtDate, dateGroupLabel,
            clearFilters, loadTimeline,
            // calendar
            WEEKDAYS,
            calendarMonth, calendarData, calendarMeta, calendarLoading,
            selectedDate, dayDetail, dayLoading,
            calMonthLabel, calCells,
            loadCalendar, selectDay, closeDay,
            calPrevMonth, calNextMonth, calGoToday,
            calDayName, medLabel,
        };
    },

    template: `
    <div class="cf-care-timeline-container">
        <!-- Header -->
        <div class="cf-care-timeline-header">
            <div class="cf-care-timeline-header-row">
                <div>
                    <div class="cf-care-badge cf-care-badge-history">LỊCH SỬ</div>
                    <h1 class="cf-care-timeline-title">Nhật ký chăm sóc</h1>
                </div>
                <router-link to="/care" class="cf-care-back-link">← Chăm sóc</router-link>
            </div>
            <select v-model="selectedCycleId" class="cf-care-cycle-select cf-care-w-full">
                <option value="">-- Chọn đợt nuôi --</option>
                <option v-for="c in cycles" :key="c.id" :value="c.id">
                    {{ c.name || 'Đợt ' + c.id }} ({{ c.barn_id }})
                </option>
            </select>
        </div>

        <!-- Inline cycle pill — always visible at-a-glance indicator -->
        <!-- Canonical cycle indicator -->
        <care-cycle-pill
            v-model:selectedCycleId="selectedCycleId"
            :cycles="cycles"
            :selected-cycle="selectedCycle"
            :day-age="dayAge"
            :alive-count="aliveCount"
            :survival-rate="survivalRate"
        />

        <!-- Filter chips -->
        <div class="cf-care-timeline-filters">
            <button v-for="f in filters" :key="f.key"
                @click="activeFilter = f.key"
                :class="['cf-care-filter-chip', activeFilter === f.key ? 'active' : '']">
                {{ f.label }}
            </button>
        </div>

        <!-- Calendar heatmap -->
        <div v-if="selectedCycle" class="cf-care-cal-card">
            <div class="cf-care-cal-nav">
                <button @click="calPrevMonth" class="cf-care-cal-nav-btn" title="Tháng trước">‹</button>
                <div class="cf-care-cal-nav-title">{{ calMonthLabel }}</div>
                <button @click="calNextMonth" class="cf-care-cal-nav-btn" title="Tháng sau">›</button>
                <button @click="calGoToday" class="cf-care-cal-today-btn">Hôm nay</button>
            </div>

            <div class="cf-care-cal-weekdays">
                <div v-for="w in WEEKDAYS" :key="w" class="cf-care-cal-weekday">{{ w }}</div>
            </div>

            <div v-if="calendarLoading" class="cf-care-cal-skeleton">
                <div v-for="i in 35" :key="i" class="cf-care-cal-skeleton-cell"></div>
            </div>

            <div v-else class="cf-care-cal-grid">
                <div v-for="cell in calCells" :key="cell.key"
                    :class="[
                        'cf-care-cal-day',
                        cell.blank ? 'blank' : '',
                        !cell.blank ? cell.cls : '',
                        !cell.blank && cell.hasMixed ? 'mixed' : '',
                        !cell.blank && selectedDate === cell.iso ? 'selected' : '',
                    ]"
                    :title="cell.title || ''"
                    @click="!cell.blank && selectDay(cell.iso)">
                    <template v-if="!cell.blank">
                        <span class="cf-care-cal-day-num">{{ cell.day }}</span>
                        <span v-if="cell.hasMixed" class="cf-care-cal-mixed-badge" title="Có thuốc trộn cám">🌾</span>
                    </template>
                </div>
            </div>

            <div class="cf-care-cal-legend">
                <div class="cf-care-cal-legend-item">
                    <span class="cf-care-cal-dot green"></span> Đủ ăn + thuốc
                </div>
                <div class="cf-care-cal-legend-item">
                    <span class="cf-care-cal-dot yellow"></span> Một phần
                </div>
                <div class="cf-care-cal-legend-item">
                    <span class="cf-care-cal-dot white"></span> Không có
                </div>
                <div class="cf-care-cal-legend-item">
                    <span class="cf-care-cal-dot gray"></span> Ngoài đợt
                </div>
                <div class="cf-care-cal-legend-item">
                    <span class="cf-care-cal-dot mixed"></span> Trộn cám
                </div>
            </div>
        </div>

        <!-- Inline day-detail panel (slides in below calendar) -->
        <div v-if="selectedDate" class="cf-care-cal-panel">
            <div class="cf-care-cal-panel-header">
                <div>
                    <strong>{{ fmtDate(selectedDate) }}</strong>
                    <span class="cf-care-cal-panel-dow"> · {{ calDayName(selectedDate) }}</span>
                </div>
                <button @click="closeDay" class="cf-care-cal-panel-close" title="Đóng">✕</button>
            </div>

            <div v-if="dayLoading" class="cf-care-cal-panel-loading">Đang tải...</div>

            <div v-else-if="dayDetail">
                <!-- Empty state -->
                <div v-if="!dayDetail.feeds_sang.length && !dayDetail.feeds_chieu.length
                         && !dayDetail.meds_sang.length && !dayDetail.meds_chieu.length
                         && !dayDetail.deaths.length
                         && !dayDetail.water_sang.length && !dayDetail.water_chieu.length"
                    class="cf-care-cal-panel-empty">
                    Không có dữ liệu ngày này.
                </div>

                <!-- Sáng -->
                <div v-if="dayDetail.feeds_sang.length || dayDetail.meds_sang.length
                         || dayDetail.mixed_med_sang.length || dayDetail.water_sang.length"
                    class="cf-care-cal-panel-section">
                    <div class="cf-care-cal-panel-section-title">☀️ Sáng</div>

                    <!-- Trộn cám block (highlighted at top) -->
                    <div v-for="m in dayDetail.mixed_med_sang" :key="'mix-s-' + m.id"
                        class="cf-care-cal-mixed-block">
                        <span class="cf-care-cal-mixed-icon">🌾</span>
                        <strong>Thuốc trộn cám:</strong>
                        {{ medLabel(m) }}<span v-if="m.quantity"> · {{ m.quantity }}{{ m.unit ? ' ' + m.unit : '' }}</span>
                        <span v-if="m.purpose" class="cf-care-cal-mixed-purpose">· {{ m.purpose }}</span>
                    </div>

                    <div v-for="f in dayDetail.feeds_sang" :key="'f-s-' + f.id" class="cf-care-cal-panel-row">
                        <span class="cf-care-cal-panel-icon">🌾</span>
                        {{ f.product_name || 'Cám' }} · {{ fmtNum(f.quantity, 1) }} kg
                        <span v-if="f.notes" class="cf-care-cal-panel-notes">· {{ f.notes }}</span>
                    </div>

                    <div v-for="m in dayDetail.meds_sang" :key="'m-s-' + m.id" class="cf-care-cal-panel-row">
                        <span class="cf-care-cal-panel-icon">💊</span>
                        {{ medLabel(m) }}<span v-if="m.quantity"> · {{ m.quantity }}{{ m.unit ? ' ' + m.unit : '' }}</span>
                    </div>

                    <div v-for="w in dayDetail.water_sang" :key="'w-s-' + w.id" class="cf-care-cal-panel-water">
                        <span class="cf-care-cal-panel-icon">💧</span>
                        {{ fmtNum(w.consumption_liters, 1) }} lít<span v-if="w.medicated"> (có thuốc)</span>
                    </div>
                </div>

                <!-- Chiều -->
                <div v-if="dayDetail.feeds_chieu.length || dayDetail.meds_chieu.length
                         || dayDetail.mixed_med_chieu.length || dayDetail.water_chieu.length"
                    class="cf-care-cal-panel-section">
                    <div class="cf-care-cal-panel-section-title">🌆 Chiều</div>

                    <div v-for="m in dayDetail.mixed_med_chieu" :key="'mix-c-' + m.id"
                        class="cf-care-cal-mixed-block">
                        <span class="cf-care-cal-mixed-icon">🌾</span>
                        <strong>Thuốc trộn cám:</strong>
                        {{ medLabel(m) }}<span v-if="m.quantity"> · {{ m.quantity }}{{ m.unit ? ' ' + m.unit : '' }}</span>
                        <span v-if="m.purpose" class="cf-care-cal-mixed-purpose">· {{ m.purpose }}</span>
                    </div>

                    <div v-for="f in dayDetail.feeds_chieu" :key="'f-c-' + f.id" class="cf-care-cal-panel-row">
                        <span class="cf-care-cal-panel-icon">🌾</span>
                        {{ f.product_name || 'Cám' }} · {{ fmtNum(f.quantity, 1) }} kg
                        <span v-if="f.notes" class="cf-care-cal-panel-notes">· {{ f.notes }}</span>
                    </div>

                    <div v-for="m in dayDetail.meds_chieu" :key="'m-c-' + m.id" class="cf-care-cal-panel-row">
                        <span class="cf-care-cal-panel-icon">💊</span>
                        {{ medLabel(m) }}<span v-if="m.quantity"> · {{ m.quantity }}{{ m.unit ? ' ' + m.unit : '' }}</span>
                    </div>

                    <div v-for="w in dayDetail.water_chieu" :key="'w-c-' + w.id" class="cf-care-cal-panel-water">
                        <span class="cf-care-cal-panel-icon">💧</span>
                        {{ fmtNum(w.consumption_liters, 1) }} lít<span v-if="w.medicated"> (có thuốc)</span>
                    </div>
                </div>

                <!-- Tử vong -->
                <div v-if="dayDetail.deaths.length" class="cf-care-cal-panel-deaths">
                    <div class="cf-care-cal-panel-section-title">📉 Tử vong</div>
                    <div v-for="d in dayDetail.deaths" :key="'d-' + d.id" class="cf-care-cal-panel-row">
                        <span class="cf-care-cal-panel-icon">📉</span>
                        <strong>{{ d.count }} con</strong><span v-if="d.cause"> · {{ d.cause }}</span>
                        <span v-if="d.symptoms" class="cf-care-cal-panel-notes">· {{ d.symptoms }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Sort / date-range / search -->
        <div class="cf-care-history-controls">
            <div class="cf-care-history-date-row">
                <div class="cf-care-history-date-group">
                    <label class="cf-care-history-date-label">Từ</label>
                    <input v-model="dateFrom" type="date" class="cf-care-date-input">
                </div>
                <div class="cf-care-history-date-group">
                    <label class="cf-care-history-date-label">Đến</label>
                    <input v-model="dateTo" type="date" class="cf-care-date-input">
                </div>
            </div>
            <div class="cf-care-history-search-row">
                <input v-model="searchText" type="search" class="cf-care-form-input"
                    placeholder="🔍 Tìm trong ghi chú, triệu chứng, tên...">
                <select v-model="sortBy" class="cf-care-form-input cf-care-sort-select">
                    <option v-for="o in sortOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
                </select>
            </div>
            <button v-if="hasActiveFilters" @click="clearFilters" class="cf-care-history-clear">
                ✕ Xoá bộ lọc
            </button>
        </div>

        <!-- Summary -->
        <div v-if="timeline.length" class="cf-care-timeline-summary">
            <div class="cf-care-timeline-stat"><strong>{{ summary.total }}</strong> bản ghi</div>
            <div v-for="(count, type) in summary.counts" :key="type" class="cf-care-timeline-stat">
                {{ typeIcons[type] || '' }} <strong>{{ count }}</strong>
            </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="cf-care-timeline-empty">Đang tải...</div>

        <!-- Grouped timeline list -->
        <div v-else-if="groupedTimeline.length" class="cf-care-timeline-list">
            <div v-for="[dateKey, items] in groupedTimeline" :key="dateKey" class="cf-care-timeline-group">
                <div class="cf-care-timeline-group-header">{{ dateGroupLabel(dateKey) }}</div>
                <div v-for="entry in items" :key="entry.type + '-' + entry.id" class="cf-care-timeline-item">
                    <div :class="['cf-care-timeline-badge', entry.type]">
                        {{ typeIcons[entry.type] || '?' }}
                    </div>
                    <div class="cf-care-timeline-content">
                        <div :class="['cf-care-timeline-type', entry.type]">{{ typeLabels[entry.type] || entry.type }}</div>
                        <div class="cf-care-timeline-detail">{{ formatDetail(entry) }}</div>
                        <div class="cf-care-timeline-date">
                            <span v-if="formatShift(entry)">{{ formatShift(entry) }} · </span>
                            {{ fmtDate(entry.entry_date) }}
                        </div>
                        <div v-if="entry.notes" class="cf-care-timeline-notes">"{{ entry.notes }}"</div>
                    </div>
                    <button @click="deleteEntry(entry)" class="cf-care-timeline-del" title="Xóa">✕</button>
                </div>
            </div>
        </div>

        <!-- Empty -->
        <div v-else class="cf-care-timeline-empty">
            <span class="cf-care-timeline-empty-icon">📋</span>
            <p>{{ selectedCycle ? 'Chưa có dữ liệu phù hợp' : 'Chọn đợt nuôi để xem lịch sử' }}</p>
            <button v-if="selectedCycle && hasActiveFilters" @click="clearFilters" class="cf-care-history-clear">
                ✕ Xoá bộ lọc
            </button>
        </div>

        <!-- Confirm delete modal -->
        <div v-if="confirmDelete" class="cf-modal-overlay" @click.self="cancelDelete">
            <div class="cf-modal-box cf-modal-narrow">
                <div class="cf-modal-body cf-care-modal-centered">
                    <p class="cf-care-modal-text">{{ confirmDelete.message }}</p>
                    <div class="cf-care-modal-actions">
                        <button @click="cancelDelete" class="cf-btn-secondary">Huỷ</button>
                        <button @click="doConfirmDelete" class="cf-btn-danger">Xoá</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `
};
