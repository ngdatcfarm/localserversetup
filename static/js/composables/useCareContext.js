/**
 * useCareContext — shared state + helpers for all care-* pages.
 *
 * Each care page belongs to one cycle on one date, and the same five
 * computeds (selectedCycle, dayAge, aliveCount, initialCount, survivalRate)
 * show up in every one of them. Layout also uses a suppress-flag trick to
 * avoid double-fetching when loadInitialData() auto-selects the active cycle.
 *
 * This composable owns:
 *   - state:        cycles, selectedCycleId, selectedDate, loading, confirmDelete
 *   - computed:     selectedCycle, dayAge, aliveCount, initialCount, survivalRate
 *   - watch plumbing: onCycleChange / onDateChange callbacks with suppress flag
 *   - loadInitialData(loadLogsFn): fetch cycles, pick active, call loadLogs once
 *   - helpers:      changeDate, timeStr, askDelete, doConfirmDelete, cancelDelete
 *
 * Persistence: selectedCycleId + selectedDate are stored in localStorage so
 * navigation between care-* pages (and tab refreshes) keeps the user on the
 * cycle they were working on. Without this, loadInitialData()'s auto-select
 * picks the cycle with the newest start_date — which is rarely the cycle
 * the user is actively logging for, and produces an empty history view.
 *
 * Usage:
 *   const ctx = useCareContext();
 *   ctx.onCycleChange(loadLogs);
 *   ctx.onDateChange(loadLogs);
 *   onMounted(() => ctx.loadInitialData(loadLogs));
 *   return { ...ctx, ...pageSpecific };
 *
 * Dependencies (page globals):
 *   - Vue (ref, computed, watch)
 *   - API.cycles.list()
 *   - showToast(msg, type)
 */
const { ref, computed, watch } = Vue;

// localStorage keys — versioned so future schema changes can invalidate cleanly.
const LS_CYCLE_KEY = 'cfarm_care_cycle_id_v1';
const LS_DATE_KEY = 'cfarm_care_date_v1';

export function useCareContext() {
    // ── State ──────────────────────────────────────────
    const cycles = ref([]);
    // Hydrate from localStorage; otherwise empty so loadInitialData() can auto-pick.
    const selectedCycleId = ref(localStorage.getItem(LS_CYCLE_KEY) || '');
    const selectedDate = ref(localStorage.getItem(LS_DATE_KEY) || new Date().toISOString().slice(0, 10));
    const loading = ref(false);
    const confirmDelete = ref(null);

    // Persist on change. Guard against writing the empty string on initial hydration.
    watch(selectedCycleId, (newId) => {
        if (newId) localStorage.setItem(LS_CYCLE_KEY, String(newId));
        else localStorage.removeItem(LS_CYCLE_KEY);
    });
    watch(selectedDate, (newDate) => {
        if (newDate) localStorage.setItem(LS_DATE_KEY, newDate);
    });

    // ── Computed ───────────────────────────────────────
    const selectedCycle = computed(() =>
        cycles.value.find(c => c.id == selectedCycleId.value) || null
    );

    // Filter for write-side care pages: only cycles that are still open.
    // Closed cycles should not be selectable when logging new records (feed,
    // death, water, weight, etc.). Read-only history pages keep the full list.
    const activeCycles = computed(() =>
        cycles.value.filter(c => c && (c.status === 'active' || !c.end_date))
    );

    const dayAge = computed(() => {
        if (!selectedCycle.value) return 0;
        const start = new Date(selectedCycle.value.start_date);
        const today = new Date(selectedDate.value);
        return Math.max(0, Math.floor((today - start) / (1000 * 60 * 60 * 24)));
    });

    const aliveCount = computed(() =>
        selectedCycle.value?.current_count ?? selectedCycle.value?.initial_count ?? 0
    );
    const initialCount = computed(() => selectedCycle.value?.initial_count ?? 0);
    const survivalRate = computed(() => {
        if (!initialCount.value) return null;
        return Math.round((aliveCount.value / initialCount.value) * 100);
    });

    // ── Watcher plumbing ───────────────────────────────
    // loadInitialData() sets selectedCycleId programmatically. Without the
    // suppress flag, the watcher would fire and re-fetch even though we
    // already called loadLogsFn() explicitly. Flag skips the next fire.
    let suppressNextCycleWatch = false;
    let onCycleChange = null;
    let onDateChange = null;

    watch(selectedCycleId, async (newId) => {
        if (!newId) return;
        if (suppressNextCycleWatch) { suppressNextCycleWatch = false; return; }
        if (onCycleChange) {
            loading.value = true;
            try { await onCycleChange(newId); }
            finally { loading.value = false; }
        }
    });

    watch(selectedDate, async () => {
        if (!selectedCycleId.value) return;
        if (onDateChange) {
            loading.value = true;
            try { await onDateChange(); }
            finally { loading.value = false; }
        }
    });

    // ── Helpers ────────────────────────────────────────
    function changeDate(delta) {
        const d = new Date(selectedDate.value);
        d.setDate(d.getDate() + delta);
        selectedDate.value = d.toISOString().slice(0, 10);
    }

    function timeStr(log) {
        const t = log.recorded_at || log.created_at;
        if (!t) return '';
        if (typeof t === 'string' && t.includes('T')) return t.split('T')[1]?.substring(0, 5) || '';
        if (typeof t === 'string' && t.length > 10) return t.substring(11, 16);
        return '';
    }

    function askDelete(message, onConfirm) {
        confirmDelete.value = { message, onConfirm };
    }
    function doConfirmDelete() {
        if (confirmDelete.value) {
            confirmDelete.value.onConfirm();
            confirmDelete.value = null;
        }
    }
    function cancelDelete() { confirmDelete.value = null; }

    // ── Initial load ───────────────────────────────────
    /**
     * Fetch cycles, auto-select active cycle (if none selected), then run
     * `loadLogsFn()`. The auto-select is suppressed from the cycle watcher
     * so we don't fetch twice.
     *
     * @param {() => Promise<void>} loadLogsFn - page-specific log fetcher
     * @param {() => Promise<void>} [beforeLoadLogs] - optional hook for extra
     *   parallel fetches (e.g., products) or side-effects (e.g., autoShift).
     *   Runs AFTER cycle auto-select, BEFORE loadLogsFn.
     */
    async function loadInitialData(loadLogsFn, beforeLoadLogs) {
        loading.value = true;
        try {
            const c = await API.cycles.list();
            cycles.value = c;
            // Validate the persisted cycleId is still in the cycle list.
            // If it was deleted (or never set), fall through to auto-select.
            if (selectedCycleId.value && !c.find(cl => String(cl.id) === String(selectedCycleId.value))) {
                selectedCycleId.value = '';
            }
            if (!selectedCycleId.value && c.length > 0) {
                const active = c.find(cl => !cl.end_date);
                suppressNextCycleWatch = true;
                selectedCycleId.value = active ? active.id : c[0].id;
            }
            if (beforeLoadLogs) await beforeLoadLogs();
            await loadLogsFn();
        } catch (e) {
            showToast('Lỗi tải dữ liệu: ' + e.message, 'error');
        } finally {
            loading.value = false;
        }
    }

    return {
        // state
        cycles, selectedCycleId, selectedDate, loading, confirmDelete,
        // computed
        selectedCycle, dayAge, aliveCount, initialCount, survivalRate,
        activeCycles,
        // helpers
        changeDate, timeStr, askDelete, doConfirmDelete, cancelDelete,
        // lifecycle
        loadInitialData,
        // watcher hooks (call once during setup)
        onCycleChange(cb) { onCycleChange = cb; },
        onDateChange(cb) { onDateChange = cb; },
    };
}
