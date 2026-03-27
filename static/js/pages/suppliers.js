/**
 * Suppliers Page - Supplier management
 */
const { ref, reactive, onMounted } = Vue;

return {
    setup() {
        const suppliers = ref([]);
        const showModal = ref(false);
        const editingId = ref(null);
        const form = reactive({ name: '', phone: '', address: '', note: '', status: 'active' });

        async function load() {
            try { suppliers.value = await API.suppliers.list(); }
            catch(e) { showToast(e.message, 'error'); }
        }

        function openModal(s = null) {
            editingId.value = s ? s.id : null;
            if (s) {
                Object.assign(form, { name: s.name, phone: s.phone || '', address: s.address || '', note: s.note || '', status: s.status });
            } else {
                Object.assign(form, { name: '', phone: '', address: '', note: '', status: 'active' });
            }
            showModal.value = true;
        }

        async function save() {
            try {
                if (editingId.value) {
                    await API.suppliers.update(editingId.value, { ...form });
                    showToast('Da cap nhat NCC');
                } else {
                    await API.suppliers.create({ ...form });
                    showToast('Da them NCC');
                }
                showModal.value = false;
                await load();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function del(s) {
            if (!confirm(`Xoa "${s.name}"?`)) return;
            try {
                await API.suppliers.del(s.id);
                showToast('Da xoa');
                await load();
            } catch(e) { showToast(e.message, 'error'); }
        }

        onMounted(load);

        return { suppliers, showModal, editingId, form, openModal, save, del };
    },

    template: `
    <div>
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold">Nha cung cap</h2>
            <button @click="openModal()" class="btn-primary">+ Them NCC</button>
        </div>

        <div class="card">
            <table class="w-full text-sm">
                <thead><tr class="text-left border-b">
                    <th class="pb-2">Ten</th><th class="pb-2">SDT</th><th class="pb-2">Dia chi</th>
                    <th class="pb-2">Ghi chu</th><th class="pb-2">Trang thai</th><th class="pb-2"></th>
                </tr></thead>
                <tbody>
                    <tr v-for="s in suppliers" :key="s.id" class="border-b last:border-0">
                        <td class="py-2 font-medium">{{ s.name }}</td>
                        <td>{{ s.phone || '-' }}</td>
                        <td class="text-gray-500">{{ s.address || '-' }}</td>
                        <td class="text-gray-500">{{ s.note || '-' }}</td>
                        <td><span :class="s.status==='active' ? 'text-green-600' : 'text-gray-400'">{{ s.status }}</span></td>
                        <td class="text-right">
                            <button @click="openModal(s)" class="text-blue-600 mr-2">Sua</button>
                            <button @click="del(s)" class="text-red-600">Xoa</button>
                        </td>
                    </tr>
                    <tr v-if="!suppliers.length"><td colspan="6" class="py-4 text-center text-gray-400">Chua co NCC</td></tr>
                </tbody>
            </table>
        </div>

        <!-- Modal -->
        <div v-if="showModal" class="modal-backdrop" @click.self="showModal=false">
            <div class="modal-content">
                <h3 class="text-lg font-bold mb-4">{{ editingId ? 'Sua NCC' : 'Them NCC moi' }}</h3>
                <div class="space-y-3">
                    <div><label class="form-label">Ten *</label>
                        <input v-model="form.name" class="form-input" placeholder="Ten nha cung cap"></div>
                    <div class="grid grid-cols-2 gap-3">
                        <div><label class="form-label">So dien thoai</label>
                            <input v-model="form.phone" class="form-input"></div>
                        <div><label class="form-label">Trang thai</label>
                            <select v-model="form.status" class="form-input">
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select></div>
                    </div>
                    <div><label class="form-label">Dia chi</label>
                        <input v-model="form.address" class="form-input"></div>
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
