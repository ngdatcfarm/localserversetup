/**
 * Medications Page - Danh mục thuốc và tồn kho
 * - Semantic .cf-* CSS classes (no Tailwind)
 * - Modal form for create/edit
 * - Stock modal per medication
 * - showToast called with typeof guard
 */
const { ref, reactive, onMounted, computed } = Vue;

export default{
    setup() {
        // ── State ──────────────────────────────────────
        const meds = ref([]);
        const warehouses = ref([]);
        const inventoryByMed = ref({});
        const loading = ref(false);
        const loadingStock = ref({});
        const showModal = ref(false);
        const showStockModal = ref(false);
        const editingId = ref(null);
        const selectedMed = ref(null);
        const filterCat = ref('');
        const searchText = ref('');

        const form = reactive({
            name: '', unit: 'g', packaging: '', unit_spec: '', category: '', manufacturer: '',
            price_per_unit: null, recommended_dose: '', note: '', status: 'active'
        });

        // ── AI alias-suggestion state ────────────────────────
        const aliasGroups = ref([]);
        const aliasAiMessage = ref('');
        const aliasAiLoading = ref(false);
        const aliasApplyLoading = ref(false);
        const aliasApplyUpdateExisting = ref(true);

        // ── Manual cleanup state (admin) ───────────────────────
        const freeTextRows = ref([]);
        const freeTextLoading = ref(false);
        const freeTextSearch = ref('');
        const freeTextFilter = ref('all');   // 'all' | 'unassigned' | 'assigned'
        const freeTextPage = ref(1);
        const freeTextPerPage = 20;
        // Assignment picker state: rowIndex → chosen medication_id (string)
        const freeTextPick = reactive({});   // name → canonical_medication_id (string)
        const freeTextAssigning = reactive({});   // rowIndex → bool (per-row spinner)
        const medsAll = ref([]);             // unfiltered catalog for dropdowns

        // ── Auto-suggest NEW catalog entries state (admin) ──
        const newCatalogSuggestions = ref([]);     // [{canonical_name, unit, category, variants[], usage_count, ...}]
        const newCatalogLoading = ref(false);
        const newCatalogMessage = ref('');
        const newCatalogCreating = reactive({});   // canonical_name → bool (per-row spinner)
        const newCatalogMinUsage = ref(2);

        const categories = ['antibiotic', 'vaccine', 'vitamin', 'probiotic', 'disinfectant', 'other'];

        // ── Parse unit_spec from packaging text ──────────
        // "Túi 100g" → "100g", "Chai 1L" → "1000ml", "Hộp 10 chai" → "10 chai"
        function parseUnitSpec(packaging) {
            if (!packaging) return '';
            const text = packaging.trim();
            // Try to find a number followed by a unit
            const match = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|con|chai|túi|gói|hộp|viên|lọ)/i);
            if (!match) return '';
            let qty = parseFloat(match[1].replace(',', '.'));
            const unit = match[2].toLowerCase().trim();
            // Normalize to base units
            if (unit === 'kg') qty = qty * 1000;          // kg → g
            else if (unit === 'l') qty = qty * 1000;       // L → ml
            else if (unit === 'túi' || unit === 'gói' || unit === 'chai' || unit === 'hộp' || unit === 'viên' || unit === 'lọ' || unit === 'con') {
                return qty + ' ' + unit;               // keep as-fabricated unit
            }
            return qty + ' ' + unit;
        }

        // ── Computed ────────────────────────────────────
        const filteredMeds = computed(() => {
            let list = meds.value;
            if (filterCat.value) list = list.filter(m => m.category === filterCat.value);
            if (searchText.value) {
                const q = searchText.value.toLowerCase();
                list = list.filter(m =>
                    m.name.toLowerCase().includes(q) ||
                    (m.manufacturer || '').toLowerCase().includes(q) ||
                    (m.packaging || '').toLowerCase().includes(q)
                );
            }
            return list;
        });

        // ── API ────────────────────────────────────────
        async function loadMeds() {
            loading.value = true;
            try {
                meds.value = await API.medications.list(filterCat.value || undefined);
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            } finally {
                loading.value = false;
            }
        }

        async function loadWarehouses() {
            try { warehouses.value = await API.warehouses.list(); }
            catch (e) { console.warn('Không tải được kho:', e); }
        }

        async function loadStockForMed(medId) {
            if (inventoryByMed.value[medId]) return;
            loadingStock.value[medId] = true;
            try {
                const med = meds.value.find(m => m.id === medId);
                if (!med) return;
                const all = await API.inventory.list();
                const stocks = all.filter(inv =>
                    inv.product_name && inv.product_name.toLowerCase().includes(med.name.toLowerCase())
                );
                inventoryByMed.value[medId] = stocks.map(inv => ({
                    warehouse_id: inv.warehouse_id,
                    warehouse_name: inv.warehouse_name || 'Kho ' + inv.warehouse_id,
                    quantity: inv.quantity,
                    unit: inv.unit || ''
                }));
            } catch (e) {
                console.warn('Không tải được tồn kho:', e);
                inventoryByMed.value[medId] = [];
            } finally {
                loadingStock.value[medId] = false;
            }
        }

        // ── Modal helpers ───────────────────────────────
        function openModal(med = null) {
            editingId.value = med ? med.id : null;
            if (med) {
                Object.assign(form, {
                    name: med.name, unit: med.unit || 'g', packaging: med.packaging || '',
                    unit_spec: med.unit_spec || '',   // restore from DB
                    category: med.category || '', manufacturer: med.manufacturer || '',
                    price_per_unit: med.price_per_unit, recommended_dose: med.recommended_dose || '',
                    note: med.note || '', status: med.status
                });
            } else {
                Object.assign(form, {
                    name: '', unit: 'g', packaging: '', unit_spec: '',
                    category: '', manufacturer: '',
                    price_per_unit: null, recommended_dose: '', note: '', status: 'active'
                });
            }
            showModal.value = true;
        }

        function openStockModal(med) {
            selectedMed.value = med;
            loadStockForMed(med.id);
            showStockModal.value = true;
        }

        function closeModal() { showModal.value = false; }
        function closeStockModal() { showStockModal.value = false; }

        // ── Save / Delete ────────────────────────────────
        async function save() {
            if (!form.name.trim()) {
                if (typeof showToast === 'function') showToast('Tên thuốc không được trống', 'error');
                return;
            }
            try {
                if (editingId.value) {
                    await API.medications.update(editingId.value, { ...form });
                    if (typeof showToast === 'function') showToast('Đã cập nhật thuốc', 'success');
                } else {
                    await API.medications.create({ ...form });
                    if (typeof showToast === 'function') showToast('Đã thêm thuốc mới', 'success');
                }
                closeModal();
                await loadMeds();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function delMed(med) {
            if (!confirm('Xóa thuốc "' + med.name + '"?')) return;
            try {
                await API.medications.del(med.id);
                if (typeof showToast === 'function') showToast('Đã xóa thành công', 'success');
                await loadMeds();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Helpers ─────────────────────────────────────
        function fmtDate(d) {
            if (!d) return '-';
            return new Date(d).toLocaleDateString('vi-VN');
        }

        // ── AI alias-suggestion functions ────────────────
        async function runAiAliasAnalysis() {
            aliasAiLoading.value = true;
            aliasAiMessage.value = '';
            try {
                const resp = await API.medications.aiSuggestAliases(100, 2);
                // Default: approve all groups
                aliasGroups.value = (resp.groups || []).map(g => ({ ...g, approved: true }));
                aliasAiMessage.value = resp.message || '';
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
                aliasAiMessage.value = e.message;
            } finally {
                aliasAiLoading.value = false;
            }
        }

        function toggleAliasGroup(idx) {
            if (!aliasGroups.value[idx]) return;
            aliasGroups.value[idx].approved = !aliasGroups.value[idx].approved;
        }

        function removeAliasGroup(idx) {
            aliasGroups.value.splice(idx, 1);
        }

        async function applyAliasGroups() {
            const approved = aliasGroups.value.filter(g => g.approved);
            if (!approved.length) {
                if (typeof showToast === 'function') showToast('Chọn ít nhất 1 nhóm để áp dụng', 'error');
                return;
            }
            aliasApplyLoading.value = true;
            try {
                const items = approved.map(g => ({
                    alias_name: g.aliases.join('|'),   // backend will split if needed; we pass first only
                    canonical_medication_id: g.canonical_medication_id,
                    approved: true
                }));
                // Backend expects one alias per item; flatten if group has multiple aliases
                const flatItems = [];
                for (const g of approved) {
                    for (const a of g.aliases) {
                        flatItems.push({
                            alias_name: a,
                            canonical_medication_id: g.canonical_medication_id,
                            approved: true
                        });
                    }
                }
                const resp = await API.medications.applyAliases(flatItems, aliasApplyUpdateExisting.value);
                if (typeof showToast === 'function') showToast(resp.message || 'Đã áp dụng', 'success');
                // Remove applied groups from the preview
                aliasGroups.value = aliasGroups.value.filter(g => !g.approved);
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            } finally {
                aliasApplyLoading.value = false;
            }
        }

        function confidenceClass(c) {
            return c >= 0.9 ? 'cf-med-ai-conf-high' : 'cf-med-ai-conf-low';
        }

        // ── Manual cleanup: load all free-text custom_name distinct rows ──
        async function loadFreeTextNames() {
            freeTextLoading.value = true;
            try {
                freeTextRows.value = await API.medications.freeTextNames(500);
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
                freeTextRows.value = [];
            } finally {
                freeTextLoading.value = false;
            }
        }

        // ── Auto-suggest new catalog entries ──────────────
        async function loadNewCatalogSuggestions() {
            newCatalogLoading.value = true;
            newCatalogMessage.value = '';
            try {
                const resp = await API.medications.autoSuggestCatalog(newCatalogMinUsage.value, 50);
                newCatalogSuggestions.value = resp.suggestions || [];
                newCatalogMessage.value = resp.message || '';
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
                newCatalogSuggestions.value = [];
                newCatalogMessage.value = 'Lỗi khi tải gợi ý.';
            } finally {
                newCatalogLoading.value = false;
            }
        }

        async function createNewCatalogEntry(s, idx) {
            if (!s.canonical_name || !s.canonical_name.trim()) {
                if (typeof showToast === 'function') showToast('Tên thuốc bắt buộc', 'error');
                return;
            }
            newCatalogCreating[s.canonical_name] = true;
            try {
                const resp = await API.medications.createFromFreetext({
                    canonical_name: s.canonical_name.trim(),
                    unit: s.unit || null,
                    category: s.category || null,
                    variants: (s.variants || []).filter(v => v && v.trim() && v.trim() !== s.canonical_name.trim()),
                    update_existing: true,
                });
                if (!resp.ok) {
                    if (typeof showToast === 'function') showToast(resp.message || 'Lỗi', 'error');
                    return;
                }
                if (typeof showToast === 'function') {
                    showToast(resp.message || `Đã tạo "${s.canonical_name}"`, 'success');
                }
                // Remove from suggestions and refresh the canonical meds list
                newCatalogSuggestions.value.splice(idx, 1);
                // Refresh meds list so dropdowns pick up the new entry
                medsAll.value = await API.medications.list();
                loadMeds();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            } finally {
                delete newCatalogCreating[s.canonical_name];
            }
        }

        function dismissNewCatalogSuggestion(idx) {
            newCatalogSuggestions.value.splice(idx, 1);
        }

        async function loadAllMedsForDropdown() {
            try {
                medsAll.value = await API.medications.list();
            } catch (e) {
                medsAll.value = meds.value || [];
            }
        }

        // ── Manual cleanup: filtered + paginated computed ──
        const filteredFreeTextRows = computed(() => {
            let rows = freeTextRows.value;
            // Filter by assignment status
            if (freeTextFilter.value === 'unassigned') {
                rows = rows.filter(r => !r.alias_id);
            } else if (freeTextFilter.value === 'assigned') {
                rows = rows.filter(r => r.alias_id);
            }
            // Search by name
            const q = (freeTextSearch.value || '').toLowerCase().trim();
            if (q) {
                rows = rows.filter(r =>
                    (r.name || '').toLowerCase().includes(q) ||
                    (r.canonical_name || '').toLowerCase().includes(q)
                );
            }
            return rows;
        });

        const freeTextTotalPages = computed(() =>
            Math.max(1, Math.ceil(filteredFreeTextRows.value.length / freeTextPerPage))
        );

        const pagedFreeTextRows = computed(() => {
            const start = (freeTextPage.value - 1) * freeTextPerPage;
            return filteredFreeTextRows.value.slice(start, start + freeTextPerPage);
        });

        // Count of pending (picked but not yet assigned) free-text rows
        const pendingFreeTextPicks = computed(() => {
            return Object.entries(freeTextPick)
                .filter(([name, medId]) => medId && freeTextRows.value.some(r => r.name === name && !r.alias_id))
                .length;
        });

        const bulkAssignLoading = ref(false);

        async function bulkAssignFreeText() {
            const items = Object.entries(freeTextPick)
                .filter(([name, medId]) => medId && freeTextRows.value.some(r => r.name === name && !r.alias_id))
                .map(([name, medId]) => ({
                    alias_name: name,
                    canonical_medication_id: Number(medId),
                    approved: true
                }));
            if (!items.length) {
                if (typeof showToast === 'function') showToast('Chưa có dòng nào được chọn thuốc chuẩn', 'error');
                return;
            }
            bulkAssignLoading.value = true;
            try {
                const resp = await API.medications.applyAliases(items, true);
                if (typeof showToast === 'function') showToast(resp.message || `Đã lưu ${items.length} alias`, 'success');
                // Clear all picks
                for (const k of Object.keys(freeTextPick)) freeTextPick[k] = '';
                await loadFreeTextNames();
                await loadMeds();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            } finally {
                bulkAssignLoading.value = false;
            }
        }

        // Reset page when filter/search changes
        function setFreeTextFilter(v) {
            freeTextFilter.value = v;
            freeTextPage.value = 1;
        }
        function setFreeTextSearch() {
            freeTextPage.value = 1;
        }

        function aliasSourceLabel(r) {
            if (!r.alias_id) return null;
            return r.auto_generated ? 'AI' : 'Tay';
        }

        async function assignFreeText(row, canonicalMedId) {
            if (!canonicalMedId) {
                if (typeof showToast === 'function') showToast(`Chọn thuốc chuẩn cho "${row.name}" trước khi gán`, 'error');
                return;
            }
            // Use index as key — find the row in the unfiltered list
            const idx = freeTextRows.value.findIndex(r => r.name === row.name);
            if (idx >= 0) freeTextAssigning[idx] = true;
            try {
                const resp = await API.medications.applyAliases([{
                    alias_name: row.name,
                    canonical_medication_id: Number(canonicalMedId),
                    approved: true
                }], true);
                if (typeof showToast === 'function') showToast(resp.message, 'success');
                // Clear pick for this row
                freeTextPick[row.name] = '';
                await loadFreeTextNames();
                await loadMeds();   // refresh main table too (stock may have changed)
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            } finally {
                if (idx >= 0) freeTextAssigning[idx] = false;
            }
        }

        async function removeFreeTextAlias(row) {
            if (!row.alias_id) return;
            if (!confirm(`Xóa alias "${row.name}"? ${row.assigned_rows || 0} phiếu sẽ trở về free-text.`)) return;
            try {
                const resp = await API.medications.deleteAlias(row.name);
                if (typeof showToast === 'function') showToast(resp.message, 'success');
                await loadFreeTextNames();
                await loadMeds();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        function fmtNum(n, decimals = 0) {
            if (n == null) return '-';
            return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        }

        onMounted(() => {
            loadMeds();
            loadWarehouses();
            loadFreeTextNames();
            loadAllMedsForDropdown();
        });

        return {
            meds: filteredMeds, warehouses, inventoryByMed, loading, loadingStock,
            showModal, showStockModal, editingId, selectedMed,
            filterCat, searchText, form, categories,
            loadMeds, openModal, openStockModal, closeModal, closeStockModal,
            save, delMed,
            fmtDate, fmtNum,
            // AI alias
            aliasGroups, aliasAiMessage, aliasAiLoading, aliasApplyLoading, aliasApplyUpdateExisting,
            runAiAliasAnalysis, toggleAliasGroup, removeAliasGroup, applyAliasGroups, confidenceClass,
            // Manual cleanup
            freeTextRows, freeTextLoading, freeTextSearch, freeTextFilter, freeTextPage, freeTextPerPage,
            // new-catalog suggestions (admin)
            newCatalogSuggestions, newCatalogLoading, newCatalogMessage,
            newCatalogCreating, newCatalogMinUsage,
            loadNewCatalogSuggestions, createNewCatalogEntry, dismissNewCatalogSuggestion,
            freeTextPick, freeTextAssigning, medsAll,
            filteredFreeTextRows, freeTextTotalPages, pagedFreeTextRows,
            setFreeTextFilter, setFreeTextSearch, aliasSourceLabel,
            assignFreeText, removeFreeTextAlias,
            pendingFreeTextPicks, bulkAssignLoading, bulkAssignFreeText,
        };
    },

    template: `
    <div class="cf-container">

        <!-- Header -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon" style="background-color: #7c3aed;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10.5 20.5L3 13l1.4-1.4 6.1 6.1 12.6-12.6L21.7 6.5z"/>
                        <path d="M8.5 8.5l3 3"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">Quản lý Thuốc</h1>
                    <p class="cf-subtitle">Danh mục thuốc và tồn kho theo kho</p>
                </div>
            </div>
        </div>

        <!-- AI alias-suggestion section -->
        <div class="cf-med-ai-section">
            <div class="cf-med-ai-header">
                <div class="cf-med-ai-header-left">
                    <span class="cf-med-ai-icon">🤖</span>
                    <div>
                        <h3 class="cf-med-ai-title">AI gợi ý gộp tên thuốc</h3>
                        <p class="cf-med-ai-sub">
                            Phân tích các tên free-text đang lặp/sai chính tả → gom về tên chuẩn trong danh mục.
                        </p>
                    </div>
                </div>
                <button @click="runAiAliasAnalysis" :disabled="aliasAiLoading"
                    class="cf-btn-primary" style="background-color: #7c3aed;">
                    <span v-if="aliasAiLoading">⏳ Đang phân tích...</span>
                    <span v-else>🤖 Phân tích bằng AI</span>
                </button>
            </div>

            <p v-if="aliasAiMessage" class="cf-med-ai-message">{{ aliasAiMessage }}</p>

            <table v-if="aliasGroups.length" class="cf-med-ai-preview">
                <thead>
                    <tr>
                        <th>Aliases (free-text)</th>
                        <th>Canonical (danh mục chuẩn)</th>
                        <th class="text-center">Độ tin cậy</th>
                        <th>Lý do</th>
                        <th class="text-center">Hành động</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(g, idx) in aliasGroups" :key="idx">
                        <td>
                            <div v-for="a in g.aliases" :key="a" class="cf-med-ai-alias-chip">
                                "{{ a }}"
                            </div>
                        </td>
                        <td class="cf-med-ai-canonical">{{ g.canonical_name }}</td>
                        <td class="text-center">
                            <span :class="['cf-med-ai-conf', confidenceClass(g.confidence)]">
                                {{ Math.round(g.confidence * 100) }}%
                            </span>
                        </td>
                        <td class="cf-med-ai-reason">{{ g.reason || '-' }}</td>
                        <td class="text-center">
                            <div class="cf-med-ai-row-actions">
                                <button @click="toggleAliasGroup(idx)"
                                    :title="g.approved ? 'Bỏ duyệt' : 'Duyệt'"
                                    :class="['cf-btn-icon-sm', g.approved ? 'approved' : '']">
                                    {{ g.approved ? '✅' : '⬜' }}
                                </button>
                                <button @click="removeAliasGroup(idx)" class="cf-btn-icon-sm danger" title="Bỏ qua">❌</button>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div v-if="aliasGroups.length" class="cf-med-ai-actions">
                <label class="cf-med-ai-checkbox">
                    <input type="checkbox" v-model="aliasApplyUpdateExisting">
                    Cập nhật luôn các phiếu cũ (gán <code>medication_id</code> cho dòng free-text trùng alias)
                </label>
                <button @click="applyAliasGroups" :disabled="aliasApplyLoading"
                    class="cf-btn-primary" style="background-color: #15803d; margin-left: auto;">
                    <span v-if="aliasApplyLoading">⏳ Đang lưu...</span>
                    <span v-else>✅ Áp dụng các alias đã chọn</span>
                </button>
            </div>
        </div>

        <!-- Auto-suggest NEW catalog entries from repeated free-text names (admin) -->
        <div class="cf-med-newsug-section">
            <div class="cf-med-newsug-header">
                <div>
                    <h3 class="cf-med-newsug-title">🆕 Gợi ý tạo thuốc mới trong danh mục</h3>
                    <p class="cf-med-newsug-sub">
                        Hệ thống quét các tên free-text được ghi lặp lại nhiều lần trong <code>/care</code> mà chưa có trong danh mục.
                        Unit / category được tự điền từ log thực tế. Admin chỉ cần chỉnh tên (nếu cần) rồi bấm Tạo.
                    </p>
                </div>
                <div class="cf-med-newsug-actions">
                    <label class="cf-med-newsug-minusage">
                        Lặp tối thiểu
                        <input type="number" v-model.number="newCatalogMinUsage" min="1" max="10"
                            class="cf-input-sm" style="width: 4rem;">
                        lần
                    </label>
                    <button @click="loadNewCatalogSuggestions" :disabled="newCatalogLoading"
                        class="cf-btn-sm cf-btn-outline">
                        <span v-if="newCatalogLoading">⏳ Đang quét...</span>
                        <span v-else>🔍 Phân tích gợi ý</span>
                    </button>
                </div>
            </div>
            <p v-if="newCatalogMessage" class="cf-med-newsug-message">{{ newCatalogMessage }}</p>
            <div v-if="newCatalogSuggestions.length" class="cf-med-newsug-table-wrapper">
                <table class="cf-med-newsug-table">
                    <thead>
                        <tr>
                            <th>Tên thuốc gợi ý (sửa được)</th>
                            <th>Đơn vị</th>
                            <th>Loại</th>
                            <th>Biến thể đã ghi</th>
                            <th class="text-center">Lượt</th>
                            <th class="text-center">Hành động</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(s, idx) in newCatalogSuggestions" :key="s.canonical_name" class="cf-med-newsug-row">
                            <td>
                                <input v-model="s.canonical_name" type="text" class="cf-input cf-med-newsug-name-input"
                                    :title="'Sửa tên trước khi tạo. Lần dùng: ' + s.usage_count">
                                <div v-if="s.first_seen || s.last_seen" class="cf-med-newsug-dates">
                                    <span v-if="s.first_seen">Lần đầu: {{ s.first_seen }}</span>
                                    <span v-if="s.last_seen"> · Gần nhất: {{ s.last_seen }}</span>
                                </div>
                            </td>
                            <td>
                                <select v-model="s.unit" class="cf-select cf-med-newsug-unit-select">
                                    <option value="">—</option>
                                    <option value="g">g</option>
                                    <option value="kg">kg</option>
                                    <option value="ml">ml</option>
                                    <option value="l">l</option>
                                    <option value="viên">viên</option>
                                    <option value="liều">liều</option>
                                    <option value="chai">chai</option>
                                    <option value="gói">gói</option>
                                </select>
                            </td>
                            <td>
                                <select v-model="s.category" class="cf-select cf-med-newsug-cat-select">
                                    <option value="">—</option>
                                    <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
                                </select>
                            </td>
                            <td>
                                <div class="cf-med-newsug-variants">
                                    <span v-for="v in s.variants" :key="v" class="cf-med-newsug-variant-chip"
                                        :class="{ 'cf-med-newsug-variant-main': v === s.canonical_name }">
                                        {{ v }}
                                    </span>
                                </div>
                            </td>
                            <td class="text-center cf-med-newsug-count">{{ s.usage_count }}</td>
                            <td>
                                <div class="cf-med-newsug-row-actions">
                                    <button @click="createNewCatalogEntry(s, idx)"
                                        :disabled="newCatalogCreating[s.canonical_name]"
                                        class="cf-btn-sm cf-btn-save"
                                        :title="'Tạo ' + s.canonical_name + ' + alias cho ' + s.variants.length + ' biến thể'">
                                        <span v-if="newCatalogCreating[s.canonical_name]">⏳</span>
                                        <span v-else>✅ Tạo</span>
                                    </button>
                                    <button @click="dismissNewCatalogSuggestion(idx)"
                                        class="cf-btn-icon-sm" title="Bỏ qua gợi ý này">❌</button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else-if="!newCatalogLoading && !newCatalogMessage" class="cf-med-newsug-empty">
                Bấm <b>🔍 Phân tích gợi ý</b> để quét các tên free-text lặp lại chưa có trong danh mục.
            </div>
        </div>

        <!-- Manual cleanup section: distinct free-text custom_name + assignment UI -->
        <div class="cf-med-freetext-section">
            <div class="cf-med-freetext-header">
                <div>
                    <h3 class="cf-med-freetext-title">📋 Tên free-text đã ghi nhận</h3>
                    <p class="cf-med-freetext-sub">
                        Admin gán thủ công — đặc biệt hữu ích khi AI token chưa cấu hình, hoặc cho những quyết định cần xác nhận người.
                        Mỗi lần gán sẽ tạo <code>medication_name_aliases</code> + cập nhật luôn các <code>care_medications</code> cũ.
                    </p>
                </div>
                <button @click="loadFreeTextNames" :disabled="freeTextLoading"
                    class="cf-btn-sm cf-btn-outline" style="margin-left: auto;">
                    <span v-if="freeTextLoading">⏳ Đang tải...</span>
                    <span v-else>🔄 Tải lại</span>
                </button>
                <button v-if="freeTextRows.some(r => !r.alias_id)"
                    @click="bulkAssignFreeText"
                    :disabled="bulkAssignLoading || pendingFreeTextPicks === 0"
                    :class="pendingFreeTextPicks > 0 ? 'cf-btn-sm cf-btn-save' : 'cf-btn-sm cf-btn-outline'"
                    style="margin-left: 0.5rem;"
                    :title="pendingFreeTextPicks > 0 ? ('Lưu ' + pendingFreeTextPicks + ' alias đã chọn') : 'Chọn thuốc chuẩn cho ít nhất 1 dòng trước'">
                    <span v-if="bulkAssignLoading">⏳ Đang lưu...</span>
                    <span v-else-if="pendingFreeTextPicks > 0">💾 Lưu tất cả ({{ pendingFreeTextPicks }})</span>
                    <span v-else>💾 Lưu tất cả</span>
                </button>
            </div>

            <div class="cf-med-freetext-toolbar">
                <input v-model="freeTextSearch" @input="setFreeTextSearch"
                    type="text" class="cf-search-input"
                    placeholder="🔍 Tìm tên free-text hoặc canonical..."
                    style="max-width: 320px;">
                <div class="cf-med-freetext-filter-chips">
                    <button @click="setFreeTextFilter('all')"
                        :class="['cf-med-freetext-chip', freeTextFilter === 'all' ? 'active' : '']">
                        Tất cả ({{ freeTextRows.length }})
                    </button>
                    <button @click="setFreeTextFilter('unassigned')"
                        :class="['cf-med-freetext-chip', 'cf-med-freetext-chip-warn', freeTextFilter === 'unassigned' ? 'active' : '']">
                        ⚠ Chưa gán ({{ freeTextRows.filter(r => !r.alias_id).length }})
                    </button>
                    <button @click="setFreeTextFilter('assigned')"
                        :class="['cf-med-freetext-chip', 'cf-med-freetext-chip-ok', freeTextFilter === 'assigned' ? 'active' : '']">
                        ✓ Đã gán ({{ freeTextRows.filter(r => r.alias_id).length }})
                    </button>
                </div>
            </div>

            <div v-if="freeTextLoading" class="cf-med-freetext-loading">⏳ Đang tải...</div>
            <div v-else-if="!freeTextRows.length" class="cf-med-freetext-empty">
                <div class="cf-med-empty-icon">📭</div>
                <p>Chưa có dữ liệu free-text nào trong <code>care_medications.custom_name</code>.</p>
                <p class="cf-med-freetext-empty-hint">Hãy ghi nhận vài thuốc trong <code>/care</code> trước.</p>
            </div>
            <div v-else-if="!filteredFreeTextRows.length" class="cf-med-freetext-empty">
                <p>Không có kết quả phù hợp với filter / search hiện tại.</p>
            </div>
            <div v-else class="cf-med-freetext-table-wrapper">
                <table class="cf-med-freetext-table">
                    <thead>
                        <tr>
                            <th>Free-text name</th>
                            <th class="text-center">Lượt dùng</th>
                            <th>Dùng gần nhất</th>
                            <th>Canonical</th>
                            <th>Trạng thái</th>
                            <th class="text-right">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(r, idx) in pagedFreeTextRows" :key="r.name" class="cf-med-freetext-row">
                            <td class="cf-med-freetext-name">
                                <span>"{{ r.name }}"</span>
                                <span v-if="r.unassigned_rows > 0 && r.assigned_rows > 0" class="cf-med-freetext-partial">
                                    ({{ r.unassigned_rows }} free-text / {{ r.assigned_rows }} đã gán)
                                </span>
                            </td>
                            <td class="text-center cf-med-freetext-count">{{ r.usage_count }}</td>
                            <td class="cf-text-muted">{{ r.last_used ? new Date(r.last_used).toLocaleDateString('vi-VN') : '-' }}</td>
                            <td>
                                <select v-if="!r.alias_id"
                                    v-model="freeTextPick[r.name]"
                                    class="cf-select cf-med-freetext-pick">
                                    <option value="">-- Chọn thuốc chuẩn --</option>
                                    <option v-for="m in medsAll" :key="m.id" :value="String(m.id)">
                                        {{ m.name }}{{ m.category ? ' (' + m.category + ')' : '' }}
                                    </option>
                                </select>
                                <span v-else class="cf-med-freetext-canonical-name">
                                    <strong>{{ r.canonical_name || '?' }}</strong>
                                    <small class="cf-text-muted">(id={{ r.canonical_medication_id }})</small>
                                </span>
                            </td>
                            <td>
                                <span v-if="!r.alias_id" class="cf-badge cf-badge-warn">⚠ Chưa gán</span>
                                <span v-else-if="aliasSourceLabel(r) === 'AI'" class="cf-badge cf-badge-blue">✓ AI</span>
                                <span v-else class="cf-badge cf-badge-green">✓ Tay</span>
                            </td>
                            <td class="text-right">
                                <div class="cf-med-freetext-row-actions">
                                    <button v-if="!r.alias_id"
                                        @click="assignFreeText(r, freeTextPick[r.name])"
                                        :disabled="freeTextAssigning[idx]"
                                        :title="freeTextPick[r.name] ? 'Gán thuốc chuẩn cho free-text này' : 'Chọn thuốc chuẩn trong dropdown trước'"
                                        :class="['cf-btn-sm', freeTextPick[r.name] ? 'cf-btn-primary' : 'cf-btn-outline']"
                                        :style="freeTextPick[r.name] ? 'background-color: #15803d;' : ''">
                                        <span v-if="freeTextAssigning[idx]">⏳</span>
                                        <span v-else-if="!freeTextPick[r.name]">Chọn thuốc →</span>
                                        <span v-else>Gán</span>
                                    </button>
                                    <button v-if="!r.alias_id"
                                        @click="freeTextPick[r.name] = ''"
                                        class="cf-btn-icon-sm"
                                        v-show="freeTextPick[r.name]"
                                        title="Hủy chọn">✕</button>
                                    <button v-if="r.alias_id"
                                        @click="removeFreeTextAlias(r)"
                                        class="cf-btn-icon-sm danger"
                                        title="Xóa alias">🗑️</button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <!-- Pagination -->
                <div v-if="freeTextTotalPages > 1" class="cf-med-freetext-pagination">
                    <button @click="freeTextPage = Math.max(1, freeTextPage - 1)"
                        :disabled="freeTextPage === 1"
                        class="cf-btn-sm cf-btn-outline">← Trước</button>
                    <span class="cf-med-freetext-page-info">
                        Trang {{ freeTextPage }} / {{ freeTextTotalPages }}
                        ({{ filteredFreeTextRows.length }} dòng)
                    </span>
                    <button @click="freeTextPage = Math.min(freeTextTotalPages, freeTextPage + 1)"
                        :disabled="freeTextPage === freeTextTotalPages"
                        class="cf-btn-sm cf-btn-outline">Sau →</button>
                </div>
            </div>
        </div>

        <!-- Toolbar -->
        <div class="cf-med-toolbar">
            <input v-model="searchText" type="text" class="cf-search-input" placeholder="🔍 Tìm tên thuốc..." style="max-width: 240px;">
            <select v-model="filterCat" @change="loadMeds" class="cf-select">
                <option value="">Tất cả loại</option>
                <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
            </select>
            <button @click="openModal()" class="cf-btn-primary" style="background-color: #7c3aed; margin-left: auto;">
                + Thêm thuốc
            </button>
        </div>

        <!-- Table -->
        <div class="cf-card" style="padding: 0;">
            <div class="cf-table-wrapper">
                <table class="cf-table">
                    <thead>
                        <tr>
                            <th>Tên thuốc</th>
                            <th>Quy cách đóng gói</th>
                            <th>Loại</th>
                            <th>ĐVT</th>
                            <th class="text-right">Giá (VND)</th>
                            <th>Liều dùng</th>
                            <th class="text-center">Tồn kho</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="m in meds" :key="m.id" class="cf-table-tr">
                            <td class="cf-med-name">{{ m.name }}</td>
                            <td>
                                <span class="cf-med-packaging">
                                    📦 {{ m.packaging || 'Chưa rõ' }}
                                </span>
                            </td>
                            <td>
                                <span v-if="m.category" class="cf-badge cf-badge-purple">{{ m.category }}</span>
                                <span v-else class="cf-text-muted">-</span>
                            </td>
                            <td class="cf-text-muted">{{ m.unit || '-' }}</td>
                            <td class="text-right cf-med-price">
                                {{ m.price_per_unit ? fmtNum(m.price_per_unit, 0) + ' đ' : '-' }}
                            </td>
                            <td class="cf-med-dose">{{ m.recommended_dose || '-' }}</td>
                            <td class="text-center">
                                <button @click="openStockModal(m)"
                                    class="cf-btn-sm"
                                    :class="inventoryByMed[m.id]?.length ? 'cf-btn-outline' : 'cf-btn-ghost'">
                                    <span v-if="loadingStock[m.id]">...</span>
                                    <span v-else-if="inventoryByMed[m.id]?.length">
                                        {{ inventoryByMed[m.id].length }} kho
                                    </span>
                                    <span v-else>Kiểm tra</span>
                                </button>
                            </td>
                            <td>
                                <div class="cf-med-row-actions">
                                    <button @click="openModal(m)" class="cf-btn-icon-sm" title="Sửa">✏️</button>
                                    <button @click="delMed(m)" class="cf-btn-icon-sm danger" title="Xóa">🗑️</button>
                                </div>
                            </td>
                        </tr>
                        <tr v-if="!meds.length">
                            <td colspan="8" class="cf-table-empty">
                                <div class="cf-med-empty-icon">💊</div>
                                <p>Chưa có thuốc nào trong danh mục</p>
                                <button @click="openModal()" class="cf-btn-primary mt-3" style="background-color: #7c3aed;">
                                    + Thêm thuốc đầu tiên
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- ── MODAL: ADD/EDIT MEDICATION ── -->
        <teleport to="body">
            <div v-if="showModal" class="cf-modal-overlay" @click.self="closeModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #f3e8ff; color: #7c3aed;">💊</div>
                            <h3 class="cf-modal-title">{{ editingId ? 'Sửa thuốc' : 'Thêm thuốc mới' }}</h3>
                        </div>
                        <button @click="closeModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="save">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Tên thuốc <span class="req">*</span></label>
                                <input v-model="form.name" type="text" class="cf-input" placeholder="VD: Sunpha Tiger" required>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Quy cách đóng gói nhập kho</label>
                                <input v-model="form.packaging" type="text" class="cf-input" placeholder="VD: Gói 1kg, Túi 100g, Hộp 10 chai">
                            </div>
                            <div class="cf-form-row">
                                <div class="cf-form-group">
                                    <label class="cf-label">Loại</label>
                                    <select v-model="form.category" class="cf-input">
                                        <option value="">-- Chọn --</option>
                                        <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
                                    </select>
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Đơn vị định lượng lẻ</label>
                                    <input v-model="form.unit" type="text" class="cf-input" placeholder="g, ml, viên">
                                </div>
                            </div>
                            <div class="cf-form-row">
                                <div class="cf-form-group">
                                    <label class="cf-label">Hãng sản xuất</label>
                                    <input v-model="form.manufacturer" type="text" class="cf-input">
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Giá/ĐVT (VND)</label>
                                    <input v-model.number="form.price_per_unit" type="number" class="cf-input">
                                </div>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Liều dùng khuyến nghị</label>
                                <input v-model="form.recommended_dose" type="text" class="cf-input" placeholder="VD: 1g/10L nước">
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Ghi chú</label>
                                <input v-model="form.note" type="text" class="cf-input">
                            </div>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeModal" class="cf-btn-secondary">Hủy bỏ</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #7c3aed;">Lưu thuốc</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

        <!-- ── MODAL: STOCK PER MEDICATION ── -->
        <teleport to="body">
            <div v-if="showStockModal" class="cf-modal-overlay" @click.self="closeStockModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #dcfce7; color: #15803d;">📦</div>
                            <h3 class="cf-modal-title">Tồn kho: {{ selectedMed?.name }}</h3>
                        </div>
                        <button @click="closeStockModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <div class="cf-modal-body">
                        <div v-if="loadingStock[selectedMed?.id]" class="cf-med-stock-loading">
                            Đang tải dữ liệu...
                        </div>
                        <div v-else-if="!inventoryByMed[selectedMed?.id]?.length" class="cf-med-stock-empty">
                            <div class="cf-med-empty-icon">📭</div>
                            <p>Không tìm thấy tồn kho cho thuốc này</p>
                        </div>
                        <div v-else class="cf-med-stock-list">
                            <div v-for="stock in inventoryByMed[selectedMed.id]" :key="stock.warehouse_id"
                                class="cf-med-stock-item">
                                <div class="cf-med-stock-wh">
                                    <div class="cf-med-stock-wh-name">{{ stock.warehouse_name }}</div>
                                    <div class="cf-med-stock-wh-code">Mã kho: {{ stock.warehouse_id }}</div>
                                </div>
                                <div class="cf-med-stock-qty">
                                    <div class="cf-med-stock-number">{{ fmtNum(stock.quantity) }}</div>
                                    <div class="cf-med-stock-unit">{{ stock.unit || selectedMed?.unit }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="cf-modal-footer">
                        <button @click="closeStockModal" class="cf-btn-secondary">Đóng</button>
                    </div>
                </div>
            </div>
        </teleport>

    </div>
    `
};
