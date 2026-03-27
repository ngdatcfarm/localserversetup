const { ref, onMounted } = Vue;

const component = {
    template: `
    <div>
        <div class="page-header">
            <h2 class="page-title">Chuồng trại</h2>
            <button class="btn btn-primary" @click="openForm()">+ Thêm chuồng</button>
        </div>

        <div v-if="barns.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="b in barns" :key="b.id" class="card">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <div class="font-semibold text-lg">{{ b.name }}</div>
                        <div class="text-sm text-gray-500">{{ b.code }}</div>
                    </div>
                    <div class="flex gap-1">
                        <button class="btn btn-secondary btn-sm" @click="openForm(b)">Sửa</button>
                        <button class="btn btn-danger btn-sm" @click="remove(b)">Xóa</button>
                    </div>
                </div>
                <div class="text-sm space-y-1">
                    <div v-if="b.description" class="text-gray-600">{{ b.description }}</div>
                    <div><span class="text-gray-500">Sức chứa:</span> {{ b.capacity || '-' }}</div>
                    <div v-if="b.active_cycle"><span class="badge badge-green">Đang nuôi</span></div>
                    <div v-else><span class="badge badge-gray">Trống</span></div>
                </div>
            </div>
        </div>

        <div v-else class="empty-state">
            <div class="icon">🏠</div>
            <p>Chưa có chuồng trại nào</p>
        </div>

        <!-- Modal -->
        <div v-if="showModal" class="modal-overlay" @click.self="showModal=false">
            <div class="modal">
                <h3>{{ form.id ? 'Sửa chuồng' : 'Thêm chuồng mới' }}</h3>
                <div class="form-group">
                    <label>Mã chuồng</label>
                    <input v-model="form.code" placeholder="VD: barn_01">
                </div>
                <div class="form-group">
                    <label>Tên chuồng</label>
                    <input v-model="form.name" placeholder="VD: Chuồng A1">
                </div>
                <div class="form-group">
                    <label>Mô tả</label>
                    <input v-model="form.description" placeholder="Mô tả (tuỳ chọn)">
                </div>
                <div class="form-group">
                    <label>Sức chứa</label>
                    <input v-model.number="form.capacity" type="number" placeholder="Số con tối đa">
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-secondary" @click="showModal=false">Huỷ</button>
                    <button class="btn btn-primary" @click="save">Lưu</button>
                </div>
            </div>
        </div>
    </div>`,

    setup() {
        const barns = ref([]);
        const showModal = ref(false);
        const form = ref({});

        async function load() {
            try { barns.value = await API.barns.list(); } catch(e) { showToast(e.message, 'error'); }
        }

        function openForm(b) {
            form.value = b ? { ...b } : { code: '', name: '', description: '', capacity: null };
            showModal.value = true;
        }

        async function save() {
            try {
                if (form.value.id) {
                    await API.barns.update(form.value.id, form.value);
                    showToast('Đã cập nhật chuồng');
                } else {
                    await API.barns.create(form.value);
                    showToast('Đã thêm chuồng mới');
                }
                showModal.value = false;
                await load();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function remove(b) {
            if (!confirm('Xóa chuồng ' + b.name + '?')) return;
            try { await API.barns.del(b.id); showToast('Đã xóa'); await load(); }
            catch(e) { showToast(e.message, 'error'); }
        }

        onMounted(load);
        return { barns, showModal, form, openForm, save, remove };
    }
};

return component;
