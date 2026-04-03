/**
 * Feeds Page - Feed Brands & Feed Types Management
 */
const { ref, reactive, onMounted, computed } = Vue;

return {
    setup() {
        const tab = ref('brands');
        const brands = ref([]);
        const types = ref([]);
        const showModal = ref(false);
        const modalType = ref('brand'); // 'brand' or 'type'
        const editingId = ref(null);

        const brandForm = reactive({ name: '', kg_per_bag: null, note: '', status: 'active' });
        const typeForm = reactive({ feed_brand_id: null, code: '', price_per_bag: null, name: '', suggested_stage: '', note: '', status: 'active' });

        const stages = ['chick', 'grower', 'adult', 'finisher'];

        async function loadBrands() {
            try { brands.value = await API.feedBrands.list(); } catch(e) { showToast(e.message, 'error'); }
        }
        async function loadTypes() {
            try { types.value = await API.feedTypes.list(); } catch(e) { showToast(e.message, 'error'); }
        }

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

        async function saveBrand() {
            try {
                if (editingId.value) {
                    await API.feedBrands.update(editingId.value, { ...brandForm });
                    showToast('Da cap nhat hang cam');
                } else {
                    await API.feedBrands.create({ ...brandForm });
                    showToast('Da them hang cam');
                }
                showModal.value = false;
                await loadBrands();
                await loadTypes();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function saveType() {
            try {
                if (editingId.value) {
                    await API.feedTypes.update(editingId.value, { ...typeForm });
                    showToast('Da cap nhat loai cam');
                } else {
                    await API.feedTypes.create({ ...typeForm });
                    showToast('Da them loai cam');
                }
                showModal.value = false;
                await loadTypes();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function deleteBrand(brand) {
            if (!confirm(`Xoa hang "${brand.name}"?`)) return;
            try {
                await API.feedBrands.del(brand.id);
                showToast('Da xoa');
                await loadBrands();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function deleteType(ft) {
            if (!confirm(`Xoa loai cam "${ft.name}"?`)) return;
            try {
                await API.feedTypes.del(ft.id);
                showToast('Da xoa');
                await loadTypes();
            } catch(e) { showToast(e.message, 'error'); }
        }

        onMounted(() => { loadBrands(); loadTypes(); });

        return { tab, brands, types, showModal, modalType, editingId, brandForm, typeForm, stages,
                 openBrandModal, openTypeModal, saveBrand, saveType, deleteBrand, deleteType, fmtNum };
    },

    template: `
    <div>
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">Quan ly thuc an</h2>
        </div>

        <!-- Tabs -->
        <div class="flex gap-2 mb-4">
            <button @click="tab='brands'" :class="tab==='brands' ? 'bg-green-600 text-white' : 'bg-gray-200'" class="px-4 py-2 rounded-lg font-medium">Hang cam</button>
            <button @click="tab='types'" :class="tab==='types' ? 'bg-green-600 text-white' : 'bg-gray-200'" class="px-4 py-2 rounded-lg font-medium">Loai cam</button>
        </div>

        <!-- Brands Tab -->
        <div v-if="tab==='brands'">
            <div class="flex justify-end mb-3">
                <button @click="openBrandModal()" class="btn-primary">+ Them hang</button>
            </div>
            <div class="card">
                <table class="w-full text-sm">
                    <thead><tr class="text-left border-b">
                        <th class="pb-2">Ten</th><th class="pb-2">Kg/bao</th><th class="pb-2">Ghi chu</th><th class="pb-2">Trang thai</th><th class="pb-2"></th>
                    </tr></thead>
                    <tbody>
                        <tr v-for="b in brands" :key="b.id" class="border-b last:border-0">
                            <td class="py-2 font-medium">{{ b.name }}</td>
                            <td>{{ b.kg_per_bag ? fmtNum(b.kg_per_bag, 1) : '-' }}</td>
                            <td class="text-gray-500">{{ b.note || '-' }}</td>
                            <td><span :class="b.status==='active' ? 'text-green-600' : 'text-gray-400'">{{ b.status }}</span></td>
                            <td class="text-right">
                                <button @click="openBrandModal(b)" class="text-blue-600 mr-2">Sua</button>
                                <button @click="deleteBrand(b)" class="text-red-600">Xoa</button>
                            </td>
                        </tr>
                        <tr v-if="!brands.length"><td colspan="5" class="py-4 text-center text-gray-400">Chua co hang cam</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Types Tab -->
        <div v-if="tab==='types'">
            <div class="flex justify-end mb-3">
                <button @click="openTypeModal()" class="btn-primary">+ Them loai cam</button>
            </div>
            <div class="card">
                <table class="w-full text-sm">
                    <thead><tr class="text-left border-b">
                        <th class="pb-2">Ma</th><th class="pb-2">Ten</th><th class="pb-2">Hang</th><th class="pb-2">Gia/bao</th><th class="pb-2">Giai doan</th><th class="pb-2"></th>
                    </tr></thead>
                    <tbody>
                        <tr v-for="ft in types" :key="ft.id" class="border-b last:border-0">
                            <td class="py-2 font-mono">{{ ft.code || '-' }}</td>
                            <td class="font-medium">{{ ft.name }}</td>
                            <td>{{ ft.brand_name || '-' }}</td>
                            <td>{{ ft.price_per_bag ? fmtNum(ft.price_per_bag, 0) : '-' }}</td>
                            <td><span v-if="ft.suggested_stage" class="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">{{ ft.suggested_stage }}</span></td>
                            <td class="text-right">
                                <button @click="openTypeModal(ft)" class="text-blue-600 mr-2">Sua</button>
                                <button @click="deleteType(ft)" class="text-red-600">Xoa</button>
                            </td>
                        </tr>
                        <tr v-if="!types.length"><td colspan="6" class="py-4 text-center text-gray-400">Chua co loai cam</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Modal -->
        <div v-if="showModal" class="modal-backdrop" @click.self="showModal=false">
            <div class="modal-content">
                <!-- Brand Form -->
                <div v-if="modalType==='brand'">
                    <h3 class="text-lg font-bold mb-4">{{ editingId ? 'Sua hang cam' : 'Them hang cam' }}</h3>
                    <div class="space-y-3">
                        <div><label class="form-label">Ten hang *</label>
                            <input v-model="brandForm.name" class="form-input" placeholder="VD: Tongwei"></div>
                        <div><label class="form-label">Kg/bao</label>
                            <input v-model.number="brandForm.kg_per_bag" type="number" step="0.1" class="form-input"></div>
                        <div><label class="form-label">Ghi chu</label>
                            <input v-model="brandForm.note" class="form-input"></div>
                        <div class="flex gap-3 pt-2">
                            <button @click="saveBrand" class="btn-primary flex-1">Luu</button>
                            <button @click="showModal=false" class="btn-secondary flex-1">Huy</button>
                        </div>
                    </div>
                </div>
                <!-- Type Form -->
                <div v-if="modalType==='type'">
                    <h3 class="text-lg font-bold mb-4">{{ editingId ? 'Sua loai cam' : 'Them loai cam' }}</h3>
                    <div class="space-y-3">
                        <div><label class="form-label">Hang cam *</label>
                            <select v-model="typeForm.feed_brand_id" class="form-input">
                                <option v-for="b in brands" :value="b.id">{{ b.name }}</option>
                            </select></div>
                        <div><label class="form-label">Ma cam</label>
                            <input v-model="typeForm.code" class="form-input" placeholder="VD: 311H"></div>
                        <div><label class="form-label">Ten *</label>
                            <input v-model="typeForm.name" class="form-input" placeholder="VD: Cam sua"></div>
                        <div><label class="form-label">Gia/bao (VND)</label>
                            <input v-model.number="typeForm.price_per_bag" type="number" class="form-input"></div>
                        <div><label class="form-label">Giai doan</label>
                            <select v-model="typeForm.suggested_stage" class="form-input">
                                <option value="">-- Chon --</option>
                                <option v-for="s in stages" :value="s">{{ s }}</option>
                            </select></div>
                        <div><label class="form-label">Ghi chu</label>
                            <input v-model="typeForm.note" class="form-input"></div>
                        <div class="flex gap-3 pt-2">
                            <button @click="saveType" class="btn-primary flex-1">Luu</button>
                            <button @click="showModal=false" class="btn-secondary flex-1">Huy</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`
};
