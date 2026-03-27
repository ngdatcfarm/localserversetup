/**
 * Medications Page - Medication catalog management
 */
const { ref, reactive, onMounted } = Vue;

return {
    setup() {
        const meds = ref([]);
        const showModal = ref(false);
        const editingId = ref(null);
        const filterCat = ref('');

        const form = reactive({
            name: '', unit: '', category: '', manufacturer: '',
            price_per_unit: null, recommended_dose: '', note: '', status: 'active'
        });

        const categories = ['antibiotic', 'vaccine', 'vitamin', 'probiotic', 'disinfectant', 'other'];

        async function load() {
            try { meds.value = await API.medications.list(filterCat.value || undefined); }
            catch(e) { showToast(e.message, 'error'); }
        }

        function openModal(med = null) {
            editingId.value = med ? med.id : null;
            if (med) {
                Object.assign(form, {
                    name: med.name, unit: med.unit || '', category: med.category || '',
                    manufacturer: med.manufacturer || '', price_per_unit: med.price_per_unit,
                    recommended_dose: med.recommended_dose || '', note: med.note || '', status: med.status
                });
            } else {
                Object.assign(form, {
                    name: '', unit: 'g', category: '', manufacturer: '',
                    price_per_unit: null, recommended_dose: '', note: '', status: 'active'
                });
            }
            showModal.value = true;
        }

        async function save() {
            try {
                if (editingId.value) {
                    await API.medications.update(editingId.value, { ...form });
                    showToast('Da cap nhat thuoc');
                } else {
                    await API.medications.create({ ...form });
                    showToast('Da them thuoc');
                }
                showModal.value = false;
                await load();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function del(med) {
            if (!confirm(`Xoa "${med.name}"?`)) return;
            try {
                await API.medications.del(med.id);
                showToast('Da xoa');
                await load();
            } catch(e) { showToast(e.message, 'error'); }
        }

        onMounted(load);

        return { meds, showModal, editingId, filterCat, form, categories, load, openModal, save, del, fmtNum };
    },

    template: `
    <div>
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">Danh muc thuoc</h2>
            <button @click="openModal()" class="btn-primary">+ Them thuoc</button>
        </div>

        <div class="mb-3">
            <select v-model="filterCat" @change="load" class="form-input w-auto">
                <option value="">Tat ca loai</option>
                <option v-for="c in categories" :value="c">{{ c }}</option>
            </select>
        </div>

        <div class="card">
            <table class="w-full text-sm">
                <thead><tr class="text-left border-b">
                    <th class="pb-2">Ten</th><th class="pb-2">Loai</th><th class="pb-2">DVT</th>
                    <th class="pb-2">Hang SX</th><th class="pb-2">Gia</th><th class="pb-2">Lieu dung</th><th class="pb-2"></th>
                </tr></thead>
                <tbody>
                    <tr v-for="m in meds" :key="m.id" class="border-b last:border-0">
                        <td class="py-2 font-medium">{{ m.name }}</td>
                        <td><span v-if="m.category" class="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{{ m.category }}</span></td>
                        <td>{{ m.unit || '-' }}</td>
                        <td>{{ m.manufacturer || '-' }}</td>
                        <td>{{ m.price_per_unit ? fmtNum(m.price_per_unit, 0) : '-' }}</td>
                        <td class="text-gray-500 text-xs">{{ m.recommended_dose || '-' }}</td>
                        <td class="text-right">
                            <button @click="openModal(m)" class="text-blue-600 mr-2">Sua</button>
                            <button @click="del(m)" class="text-red-600">Xoa</button>
                        </td>
                    </tr>
                    <tr v-if="!meds.length"><td colspan="7" class="py-4 text-center text-gray-400">Chua co thuoc nao</td></tr>
                </tbody>
            </table>
        </div>

        <!-- Modal -->
        <div v-if="showModal" class="modal-backdrop" @click.self="showModal=false">
            <div class="modal-content">
                <h3 class="text-lg font-bold mb-4">{{ editingId ? 'Sua thuoc' : 'Them thuoc moi' }}</h3>
                <div class="space-y-3">
                    <div><label class="form-label">Ten thuoc *</label>
                        <input v-model="form.name" class="form-input" placeholder="VD: Sunpha Tiger"></div>
                    <div class="grid grid-cols-2 gap-3">
                        <div><label class="form-label">Loai</label>
                            <select v-model="form.category" class="form-input">
                                <option value="">-- Chon --</option>
                                <option v-for="c in categories" :value="c">{{ c }}</option>
                            </select></div>
                        <div><label class="form-label">Don vi</label>
                            <input v-model="form.unit" class="form-input" placeholder="g, ml, vien"></div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div><label class="form-label">Hang san xuat</label>
                            <input v-model="form.manufacturer" class="form-input"></div>
                        <div><label class="form-label">Gia/DVT (VND)</label>
                            <input v-model.number="form.price_per_unit" type="number" class="form-input"></div>
                    </div>
                    <div><label class="form-label">Lieu dung khuyen nghi</label>
                        <input v-model="form.recommended_dose" class="form-input"></div>
                    <div><label class="form-label">Ghi chu</label>
                        <input v-model="form.note" class="form-input"></div>
                    <div class="flex gap-3 pt-2">
                        <button @click="save" class="btn-primary flex-1">Luu</button>
                        <button @click="showModal=false" class="btn-secondary flex-1">Huy</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`
};
