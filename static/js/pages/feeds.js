/**
 * Feeds Page - Feed Brands & Feed Types Management
 * - Semantic .cf-* CSS classes
 * - Tab switcher: Brands vs Types
 * - Modal form for create/edit
 */
const { ref, reactive, onMounted } = Vue;

export default{
    setup() {
        // ── State ──────────────────────────────────────
        const tab = ref('brands');
        const brands = ref([]);
        const types = ref([]);
        const showModal = ref(false);
        const modalType = ref('brand');
        const editingId = ref(null);

        const brandForm = reactive({ name: '', kg_per_bag: null, note: '', status: 'active' });
        const typeForm = reactive({ feed_brand_id: null, code: '', price_per_bag: null, name: '', suggested_stage: '', note: '', status: 'active' });
        const stages = ['chick', 'grower', 'adult', 'finisher'];

        // ── API ────────────────────────────────────────
        async function loadBrands() {
            try { brands.value = await API.feedBrands.list(); }
            catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function loadTypes() {
            try { types.value = await API.feedTypes.list(); }
            catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function saveBrand() {
            try {
                if (editingId.value) {
                    await API.feedBrands.update(editingId.value, { ...brandForm });
                    if (typeof showToast === 'function') showToast('Đã cập nhật hãng cám', 'success');
                } else {
                    await API.feedBrands.create({ ...brandForm });
                    if (typeof showToast === 'function') showToast('Đã thêm hãng cám mới', 'success');
                }
                closeModal();
                await loadBrands();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function saveType() {
            try {
                if (editingId.value) {
                    await API.feedTypes.update(editingId.value, { ...typeForm });
                    if (typeof showToast === 'function') showToast('Đã cập nhật loại cám', 'success');
                } else {
                    await API.feedTypes.create({ ...typeForm });
                    if (typeof showToast === 'function') showToast('Đã thêm loại cám mới', 'success');
                }
                closeModal();
                await loadTypes();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function deleteBrand(brand) {
            if (!confirm('Xóa hãng cám "' + brand.name + '"?')) return;
            try {
                await API.feedBrands.del(brand.id);
                if (typeof showToast === 'function') showToast('Đã xóa hãng cám', 'success');
                await loadBrands();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        async function deleteType(ft) {
            if (!confirm('Xóa loại cám "' + ft.name + '"?')) return;
            try {
                await API.feedTypes.del(ft.id);
                if (typeof showToast === 'function') showToast('Đã xóa loại cám', 'success');
                await loadTypes();
            } catch (e) { if (typeof showToast === 'function') showToast(e.message, 'error'); }
        }

        // ── Modal helpers ───────────────────────────────
        function openBrandModal(brand = null) {
            modalType.value = 'brand';
            editingId.value = brand ? brand.id : null;
            if (brand) {
                Object.assign(brandForm, { name: brand.name, kg_per_bag: brand.kg_per_bag, note: brand.note || '', status: brand.status });
            } else {
                Object.assign(brandForm, { name: '', kg_per_bag: null, note: '', status: 'active' });
            }
            showModal.value = true;
        }

        function openTypeModal(ft = null) {
            modalType.value = 'type';
            editingId.value = ft ? ft.id : null;
            if (ft) {
                Object.assign(typeForm, { feed_brand_id: ft.feed_brand_id, code: ft.code || '', price_per_bag: ft.price_per_bag, name: ft.name, suggested_stage: ft.suggested_stage || '', note: ft.note || '', status: ft.status });
            } else {
                Object.assign(typeForm, { feed_brand_id: brands.value[0]?.id || null, code: '', price_per_bag: null, name: '', suggested_stage: '', note: '', status: 'active' });
            }
            showModal.value = true;
        }

        function closeModal() { showModal.value = false; }

        function fmtNum(n, dec = 0) {
            if (n === null || n === undefined) return '-';
            return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        }

        onMounted(() => { loadBrands(); loadTypes(); });

        return {
            tab, brands, types, showModal, modalType, editingId,
            brandForm, typeForm, stages,
            openBrandModal, openTypeModal, closeModal,
            saveBrand, saveType, deleteBrand, deleteType,
            fmtNum
        };
    },

    template: `
    <div class="cf-container">

        <!-- Header -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon" style="background-color: #16a34a;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
                        <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">Quản lý thức ăn</h1>
                    <p class="cf-subtitle">Hãng cám và loại cám cho đợt nuôi</p>
                </div>
            </div>
        </div>

        <!-- Tab Switcher -->
        <div class="cf-feed-tabs">
            <button @click="tab = 'brands'" :class="['cf-feed-tab-btn', tab === 'brands' ? 'active' : '']">
                🏭 Hãng cám
            </button>
            <button @click="tab = 'types'" :class="['cf-feed-tab-btn', tab === 'types' ? 'active' : '']">
                📦 Loại cám
            </button>
        </div>

        <!-- ── TAB: BRANDS ── -->
        <div v-if="tab === 'brands'">
            <div class="cf-feed-toolbar">
                <button @click="openBrandModal()" class="cf-btn-primary" style="background-color: #16a34a;">
                    + Thêm hãng cám
                </button>
            </div>
            <div class="cf-card" style="padding: 0;">
                <div class="cf-table-wrapper">
                    <table class="cf-table">
                        <thead>
                            <tr>
                                <th>Tên</th>
                                <th>Kg/bao</th>
                                <th>Ghi chú</th>
                                <th>Trạng thái</th>
                                <th class="text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="b in brands" :key="b.id" class="cf-table-tr">
                                <td class="cf-feed-brand-name">{{ b.name }}</td>
                                <td><span class="cf-feed-kg">{{ b.kg_per_bag ? fmtNum(b.kg_per_bag, 1) : '-' }}</span></td>
                                <td class="cf-text-muted">{{ b.note || '-' }}</td>
                                <td>
                                    <span :class="['cf-feed-status', b.status === 'active' ? 'active' : 'inactive']">
                                        {{ b.status }}
                                    </span>
                                </td>
                                <td>
                                    <div class="cf-feed-row-actions">
                                        <button @click="openBrandModal(b)" class="cf-btn-ghost-sm">✏️ Sửa</button>
                                        <button @click="deleteBrand(b)" class="cf-btn-ghost-sm danger">🗑️ Xóa</button>
                                    </div>
                                </td>
                            </tr>
                            <tr v-if="!brands.length">
                                <td colspan="5" class="cf-feed-empty-row">Chưa có hãng cám nào</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- ── TAB: TYPES ── -->
        <div v-if="tab === 'types'">
            <div class="cf-feed-toolbar">
                <button @click="openTypeModal()" class="cf-btn-primary" style="background-color: #16a34a;">
                    + Thêm loại cám
                </button>
            </div>
            <div class="cf-card" style="padding: 0;">
                <div class="cf-table-wrapper">
                    <table class="cf-table">
                        <thead>
                            <tr>
                                <th>Mã</th>
                                <th>Tên</th>
                                <th>Hãng</th>
                                <th>Giá/bao</th>
                                <th>Giai đoạn</th>
                                <th class="text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="ft in types" :key="ft.id" class="cf-table-tr">
                                <td><span class="cf-feed-type-code">{{ ft.code || '-' }}</span></td>
                                <td class="cf-feed-type-name">{{ ft.name }}</td>
                                <td class="cf-text-muted">{{ ft.brand_name || '-' }}</td>
                                <td><span class="cf-feed-price">{{ ft.price_per_bag ? fmtNum(ft.price_per_bag, 0) + ' đ' : '-' }}</span></td>
                                <td>
                                    <span v-if="ft.suggested_stage" class="cf-feed-stage-badge">{{ ft.suggested_stage }}</span>
                                </td>
                                <td>
                                    <div class="cf-feed-row-actions">
                                        <button @click="openTypeModal(ft)" class="cf-btn-ghost-sm">✏️ Sửa</button>
                                        <button @click="deleteType(ft)" class="cf-btn-ghost-sm danger">🗑️ Xóa</button>
                                    </div>
                                </td>
                            </tr>
                            <tr v-if="!types.length">
                                <td colspan="6" class="cf-feed-empty-row">Chưa có loại cám nào</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- ── MODAL: BRAND FORM ── -->
        <teleport to="body">
            <div v-if="showModal && modalType === 'brand'" class="cf-modal-overlay" @click.self="closeModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #dcfce7; color: #166534;">🏭</div>
                            <h3 class="cf-modal-title">{{ editingId ? 'Sửa hãng cám' : 'Thêm hãng cám' }}</h3>
                        </div>
                        <button @click="closeModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="saveBrand">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Tên hãng <span class="req">*</span></label>
                                <input v-model="brandForm.name" type="text" class="cf-input" placeholder="VD: Tongwei" required>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Kg/bao</label>
                                <input v-model.number="brandForm.kg_per_bag" type="number" step="0.1" class="cf-input" placeholder="25">
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Ghi chú</label>
                                <input v-model="brandForm.note" type="text" class="cf-input" placeholder="Nhập ghi chú...">
                            </div>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeModal" class="cf-btn-secondary">Hủy bỏ</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #16a34a;">Lưu hãng cám</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

        <!-- ── MODAL: TYPE FORM ── -->
        <teleport to="body">
            <div v-if="showModal && modalType === 'type'" class="cf-modal-overlay" @click.self="closeModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #fef9c3; color: #854d0e;">📦</div>
                            <h3 class="cf-modal-title">{{ editingId ? 'Sửa loại cám' : 'Thêm loại cám' }}</h3>
                        </div>
                        <button @click="closeModal" class="cf-modal-close-btn">✕</button>
                    </div>
                    <form @submit.prevent="saveType">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Hãng cám <span class="req">*</span></label>
                                <select v-model="typeForm.feed_brand_id" class="cf-input" required>
                                    <option value="" disabled>-- Chọn hãng --</option>
                                    <option v-for="b in brands" :key="b.id" :value="b.id">{{ b.name }}</option>
                                </select>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Mã cám</label>
                                <input v-model="typeForm.code" type="text" class="cf-input font-mono" placeholder="VD: 311H">
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Tên <span class="req">*</span></label>
                                <input v-model="typeForm.name" type="text" class="cf-input" placeholder="VD: Cám sữa" required>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Giá/bao (VND)</label>
                                <input v-model.number="typeForm.price_per_bag" type="number" class="cf-input" placeholder="Nhập đơn giá...">
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Giai đoạn</label>
                                <select v-model="typeForm.suggested_stage" class="cf-input">
                                    <option value="">-- Chọn --</option>
                                    <option v-for="s in stages" :key="s" :value="s">{{ s }}</option>
                                </select>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Ghi chú</label>
                                <input v-model="typeForm.note" type="text" class="cf-input" placeholder="Nhập ghi chú...">
                            </div>
                        </div>
                        <div class="cf-modal-footer">
                            <button type="button" @click="closeModal" class="cf-btn-secondary">Hủy bỏ</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #16a34a;">Lưu loại cám</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

    </div>
    `
};