/**
 * Equipment Page - Quản lý thiết bị cơ cấu
 */
const { ref, reactive, onMounted, computed, onUnmounted } = Vue;

return {
    setup() {
        // ── Helpers ───────────────────────────────────
        const __showToast = (msg, type = 'info') => {
            if (window._showToast) window._showToast(msg, type);
            else console.log(`[${type}] ${msg}`);
        };
        const _fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '-';
        const _fmtNum = (n, d = 2) => n ? Number(n).toFixed(d) : '-';

        // ── State ──────────────────────────────────────
        const barns = ref([]);
        const selectedBarnId = ref('');
        const equipmentTypes = ref([]);
        const equipment = ref([]);
        const devices = ref([]);
        const selectedEquip = ref(null);
        const logs = ref([]);
        const commandLogs = ref([]);
        const loading = ref(false);
        const showTypeModal = ref(false);
        const showEquipModal = ref(false);
        const showAssignModal = ref(false);
        const editingType = ref(null);
        const editingEquip = ref(null);

        const selectedBarn = computed(() =>
            barns.value.find(b => b.id == selectedBarnId.value)
        );

        const availableDevices = computed(() =>
            devices.value.filter(d => d.is_online)
        );

        async function loadBarns() {
            try {
                barns.value = await API.barns.list();
            } catch (e) {
                _showToast('Không thể tải danh sách chuồng', 'error');
            }
        }

        async function loadEquipmentTypes() {
            try {
                equipmentTypes.value = await API.equipment.listTypes();
            } catch (e) {
                console.error('Failed to load equipment types', e);
            }
        }

        async function loadEquipment() {
            if (!selectedBarnId.value) {
                equipment.value = [];
                return;
            }
            try {
                loading.value = true;
                equipment.value = await API.equipment.list(selectedBarnId.value);
            } catch (e) {
                _showToast('Không thể tải thiết bị', 'error');
            } finally {
                loading.value = false;
            }
        }

        async function loadDevices() {
            if (!selectedBarnId.value) {
                devices.value = [];
                return;
            }
            try {
                const all = await API.devices.list(selectedBarnId.value);
                devices.value = all;
            } catch (e) {
                console.error('Failed to load devices', e);
            }
        }

        async function onBarnChange() {
            await loadEquipment();
            await loadDevices();
        }

        function openTypeModal(type = null) {
            editingType.value = type ? { ...type } : {
                code: '', name: '', power_watts: null,
                voltage_v: null, current_amp: null, description: '', mqtt_protocol: null
            };
            showTypeModal.value = true;
        }

        async function saveType() {
            const data = editingType.value;
            if (!data.code || !data.name) {
                _showToast('Mã và tên không được trống', 'error');
                return;
            }
            try {
                if (data.id) {
                    await API.equipment.updateType(data.id, data);
                    _showToast('Đã cập nhật loại thiết bị', 'success');
                } else {
                    await API.equipment.createType(data);
                    _showToast('Đã tạo loại thiết bị mới', 'success');
                }
                showTypeModal.value = false;
                await loadEquipmentTypes();
            } catch (e) {
                _showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        async function deleteType(type) {
            if (!confirm(`Xóa loại thiết bị "${type.name}"?`)) return;
            try {
                const result = await API.equipment.deleteType(type.id);
                if (!result.ok) { _showToast(result.message, 'error'); return; }
                _showToast('Đã xóa loại thiết bị', 'success');
                await loadEquipmentTypes();
            } catch (e) {
                _showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        function openEquipModal(equip = null) {
            editingEquip.value = equip ? { ...equip } : {
                barn_id: selectedBarnId.value, equipment_type_id: null, name: '',
                equipment_type: '', model: '', serial_no: '', power_watts: null,
                status: 'active', install_date: null, warranty_until: null,
                purchase_price: null, maintenance_interval_days: null, notes: ''
            };
            showEquipModal.value = true;
        }

        async function saveEquip() {
            const data = editingEquip.value;
            if (!data.name) {
                _showToast('Tên thiết bị không được trống', 'error');
                return;
            }
            try {
                if (data.id) {
                    await API.equipment.update(data.id, data);
                    _showToast('Đã cập nhật thiết bị', 'success');
                } else {
                    data.barn_id = selectedBarnId.value;
                    await API.equipment.create(data);
                    _showToast('Đã tạo thiết bị mới', 'success');
                }
                showEquipModal.value = false;
                await loadEquipment();
            } catch (e) {
                _showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        async function deleteEquip(equip) {
            if (!confirm(`Xóa thiết bị "${equip.name}"?`)) return;
            try {
                const result = await API.equipment.delete(equip.id);
                if (!result.ok) { _showToast(result.message, 'error'); return; }
                _showToast('Đã xóa thiết bị', 'success');
                await loadEquipment();
            } catch (e) {
                _showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        function openAssignModal(equip) {
            selectedEquip.value = equip;
            showAssignModal.value = true;
        }

        async function assignChannel(deviceId, channelNumber) {
            if (!selectedEquip.value) return;
            try {
                await API.equipment.assign(selectedEquip.value.id, {
                    device_id: parseInt(deviceId),
                    channel_number: parseInt(channelNumber),
                    changed_by: 'admin'
                });
                _showToast('Đã gán kênh thành công', 'success');
                showAssignModal.value = false;
                await loadEquipment();
                await loadLogs(selectedEquip.value.id);
            } catch (e) {
                _showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        async function unassignChannel(equip) {
            if (!confirm(`Bỏ gán thiết bị "${equip.name}" khỏi kênh?`)) return;
            try {
                await API.equipment.unassign(equip.id);
                _showToast('Đã bỏ gán kênh', 'success');
                await loadEquipment();
                await loadLogs(equip.id);
            } catch (e) {
                _showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        async function loadLogs(equipmentId) {
            try { logs.value = await API.equipment.logs(equipmentId); }
            catch (e) { console.error('Failed to load assignment logs', e); }
        }

        async function loadCommandLogs(equipmentId) {
            try { commandLogs.value = await API.equipment.commands(equipmentId); }
            catch (e) { console.error('Failed to load command logs', e); }
        }

        async function onEquipClick(equip) {
            selectedEquip.value = equip;
            await loadLogs(equip.id);
            await loadCommandLogs(equip.id);
        }

        onMounted(async () => {
            await loadBarns();
            await loadEquipmentTypes();
            if (selectedBarnId.value) {
                await loadEquipment();
                await loadDevices();
            }
        });

        return {
            barns, selectedBarnId, selectedBarn,
            equipmentTypes, equipment,
            devices, availableDevices,
            selectedEquip, logs, commandLogs,
            loading,
            showTypeModal, showEquipModal, showAssignModal,
            editingType, editingEquip,
            onBarnChange,
            openTypeModal, saveType, deleteType,
            openEquipModal, saveEquip, deleteEquip,
            openAssignModal, assignChannel, unassignChannel,
            loadLogs, loadCommandLogs, onEquipClick,
            fmtDate: _fmtDate,
            fmtNum: _fmtNum,
        };
    },

    template: `
    <div class="equipment-page" style="padding: 1.5rem; min-height: 100vh; background: var(--bg-page);">
        <!-- Header -->
        <div class="page-header">
            <div style="display: flex; align-items: center; gap: 1rem;">
                <div style="width: 3rem; height: 3rem; border-radius: 0.75rem; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
                    ⚙️
                </div>
                <div>
                    <h2 class="page-title">Quản lý Cơ cấu</h2>
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.125rem;">Thiết bị chấp hành trong chuồng trại</p>
                </div>
            </div>
            <select v-model="selectedBarnId" @change="onBarnChange"
                style="padding: 0.5rem 1rem; border-radius: var(--radius); border: 1px solid var(--border); background: white; font-size: 0.8125rem; cursor: pointer;">
                <option value="">-- Chọn chuồng --</option>
                <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
        </div>

        <!-- Empty State -->
        <div v-if="!selectedBarnId" class="empty-state">
            <div class="icon">🏠</div>
            <p>Vui lòng chọn chuồng để xem thiết bị cơ cấu</p>
        </div>

        <!-- Main Content -->
        <div v-else>
            <!-- Equipment Types Card -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span style="font-size: 1.25rem;">📋</span>
                        <h3 style="font-weight: 700; color: var(--text-primary);">Loại thiết bị</h3>
                        <span class="badge badge-gray">{{ equipmentTypes.length }}</span>
                    </div>
                    <button @click="openTypeModal()" class="btn btn-primary">
                        <span>+</span> Thêm loại
                    </button>
                </div>
                <div v-if="equipmentTypes.length === 0" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    Chưa có loại thiết bị nào
                </div>
                <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
                    <div v-for="t in equipmentTypes" :key="t.id" class="card" style="padding: 1rem; cursor: pointer; transition: all 0.15s;">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <div style="width: 2.5rem; height: 2.5rem; border-radius: 0.5rem; background: var(--primary-50); display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">🔧</div>
                                <div>
                                    <div style="font-weight: 600; color: var(--text-primary);">{{ t.name }}</div>
                                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
                                        <span class="badge badge-gray font-mono" style="font-size: 0.625rem;">{{ t.code }}</span>
                                        <span v-if="t.power_watts" class="badge badge-yellow" style="font-size: 0.625rem;">{{ t.power_watts }}W</span>
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 0.25rem;">
                                <button @click.stop="openTypeModal(t)" class="btn btn-ghost" title="Sửa">✏️</button>
                                <button @click.stop="deleteType(t)" class="btn btn-ghost" style="color: #dc2626;" title="Xóa">🗑️</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Equipment List Card -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span style="font-size: 1.25rem;">🔌</span>
                        <h3 style="font-weight: 700; color: var(--text-primary);">Thiết bị trong chuồng</h3>
                        <span class="badge badge-gray">{{ equipment.length }}</span>
                    </div>
                    <button @click="openEquipModal()" class="btn btn-primary">
                        <span>+</span> Thêm thiết bị
                    </button>
                </div>
                <div v-if="loading" style="text-align: center; padding: 2rem;">
                    <div style="width: 2rem; height: 2rem; border: 3px solid var(--primary); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block;"></div>
                </div>
                <div v-else-if="equipment.length === 0" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    Chưa có thiết bị nào trong chuồng này
                </div>
                <div v-else style="display: flex; flex-direction: column; gap: 0.75rem;">
                    <div v-for="e in equipment" :key="e.id"
                        @click="onEquipClick(e)"
                        class="card" style="padding: 1rem; cursor: pointer; transition: all 0.15s;">
                        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <div style="position: relative;">
                                    <div style="width: 3rem; height: 3rem; border-radius: 0.75rem; background: var(--primary-50); display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">⚙️</div>
                                    <div v-if="e.status === 'active'" style="position: absolute; top: -2px; right: -2px; width: 0.75rem; height: 0.75rem; background: var(--primary-light); border-radius: 50%; border: 2px solid white;"></div>
                                </div>
                                <div>
                                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                                        <span style="font-weight: 600; color: var(--text-primary);">{{ e.name }}</span>
                                        <span :class="{
                                            'badge': true,
                                            'badge-green': e.status === 'active',
                                            'badge-red': e.status === 'inactive',
                                            'badge-yellow': e.status === 'maintenance'
                                        }">
                                            {{ e.status === 'active' ? 'Hoạt động' : e.status === 'inactive' ? 'Dừng' : 'Bảo trì' }}
                                        </span>
                                    </div>
                                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">{{ e.type_name || e.equipment_type || 'Chưa phân loại' }}</div>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <template v-if="e.device_id">
                                    <span class="badge badge-blue">{{ e.device_name || 'Device' }}</span>
                                    <span class="badge badge-blue" style="background: #cffafe; color: #0e7490;">Kênh {{ e.channel_number }}</span>
                                    <button @click.stop="unassignChannel(e)" class="btn btn-sm" style="color: #dc2626;">Bỏ gán</button>
                                </template>
                                <template v-else>
                                    <span style="color: var(--text-muted); font-size: 0.75rem;">Chưa gán kênh</span>
                                    <button @click.stop="openAssignModal(e)" class="btn btn-primary btn-sm">Gán kênh</button>
                                </template>
                                <div style="display: flex; gap: 0.25rem;">
                                    <button @click.stop="openEquipModal(e)" class="btn btn-ghost">✏️</button>
                                    <button @click.stop="deleteEquip(e)" class="btn btn-ghost" style="color: #dc2626;">🗑️</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Detail Panel -->
            <div v-if="selectedEquip" class="card" style="position: sticky; top: 1rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 1rem; border-bottom: 1px solid var(--border-light); margin-bottom: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span style="font-size: 1.25rem;">📄</span>
                        <h3 style="font-weight: 700; color: var(--text-primary);">Chi tiết: {{ selectedEquip.name }}</h3>
                    </div>
                    <button @click="selectedEquip = null" class="btn btn-ghost">✕</button>
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.5rem;">
                    <div style="padding: 0.75rem; background: var(--bg-page); border-radius: var(--radius);">
                        <div style="font-size: 0.6875rem; color: var(--text-muted); margin-bottom: 0.25rem;">Loại</div>
                        <div style="font-weight: 600; color: var(--text-primary); font-size: 0.8125rem;">{{ selectedEquip.type_name || '-' }}</div>
                    </div>
                    <div style="padding: 0.75rem; background: var(--bg-page); border-radius: var(--radius);">
                        <div style="font-size: 0.6875rem; color: var(--text-muted); margin-bottom: 0.25rem;">Model</div>
                        <div style="font-weight: 600; color: var(--text-primary); font-size: 0.8125rem;">{{ selectedEquip.model || '-' }}</div>
                    </div>
                    <div style="padding: 0.75rem; background: var(--bg-page); border-radius: var(--radius);">
                        <div style="font-size: 0.6875rem; color: var(--text-muted); margin-bottom: 0.25rem;">Serial</div>
                        <div style="font-weight: 600; color: var(--text-primary); font-size: 0.8125rem;">{{ selectedEquip.serial_no || '-' }}</div>
                    </div>
                    <div style="padding: 0.75rem; background: var(--bg-page); border-radius: var(--radius);">
                        <div style="font-size: 0.6875rem; color: var(--text-muted); margin-bottom: 0.25rem;">Công suất</div>
                        <div style="font-weight: 600; color: var(--text-primary); font-size: 0.8125rem;">{{ selectedEquip.power_watts ? selectedEquip.power_watts + 'W' : '-' }}</div>
                    </div>
                </div>
                <div style="margin-bottom: 1rem;">
                    <h4 style="font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem;">📜 Lịch sử gán kênh</h4>
                    <div style="background: var(--bg-page); border-radius: var(--radius); padding: 0.75rem; max-height: 150px; overflow-y: auto;">
                        <div v-for="log in logs" :key="log.id" style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border-light);">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <span :class="{'badge': true, 'badge-green': log.action === 'assign', 'badge-red': log.action === 'unassign'}">
                                    {{ log.action === 'assign' ? 'Gán' : 'Bỏ gán' }}
                                </span>
                                <span style="font-size: 0.75rem; color: var(--text-secondary);">Kênh {{ log.device_channel_id }}</span>
                            </div>
                            <span style="font-size: 0.6875rem; color: var(--text-muted);">{{ fmtDate(log.changed_at) }}</span>
                        </div>
                        <div v-if="logs.length === 0" style="text-align: center; padding: 1rem; color: var(--text-muted);">Chưa có lịch sử</div>
                    </div>
                </div>
                <div>
                    <h4 style="font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem;">🎛️ Lịch sử điều khiển</h4>
                    <div style="background: var(--bg-page); border-radius: var(--radius); padding: 0.75rem; max-height: 150px; overflow-y: auto;">
                        <div v-for="cmd in commandLogs" :key="cmd.id" style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border-light);">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <span class="badge badge-blue" style="font-size: 0.625rem;">{{ cmd.command }}</span>
                                <span v-if="cmd.value" style="font-size: 0.75rem; color: var(--text-secondary);">{{ cmd.value }}</span>
                                <span style="font-size: 0.6875rem; color: var(--text-muted);">{{ cmd.triggered_by }}</span>
                            </div>
                            <span style="font-size: 0.6875rem; color: var(--text-muted);">{{ fmtDate(cmd.recorded_at) }}</span>
                        </div>
                        <div v-if="commandLogs.length === 0" style="text-align: center; padding: 1rem; color: var(--text-muted);">Chưa có lệnh nào</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Type Modal -->
        <div v-if="showTypeModal" class="modal-overlay" @click.self="showTypeModal = false">
            <div class="modal">
                <h3 style="margin-bottom: 1.25rem;">{{ editingType.id ? '✏️ Sửa loại thiết bị' : '➕ Thêm loại thiết bị' }}</h3>
                <div class="form-group">
                    <label>Mã loại *</label>
                    <input v-model="editingType.code" type="text" placeholder="VD: FAN_150W" :disabled="editingType.id">
                </div>
                <div class="form-group">
                    <label>Tên loại *</label>
                    <input v-model="editingType.name" type="text" placeholder="VD: Quạt công nghiệp 150W">
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;">
                    <div class="form-group">
                        <label>Công suất (W)</label>
                        <input v-model="editingType.power_watts" type="number" placeholder="150">
                    </div>
                    <div class="form-group">
                        <label>Điện áp (V)</label>
                        <input v-model="editingType.voltage_v" type="number" placeholder="220">
                    </div>
                    <div class="form-group">
                        <label>Dòng (A)</label>
                        <input v-model="editingType.current_amp" type="number" step="0.1" placeholder="2.5">
                    </div>
                </div>
                <div class="form-group">
                    <label>Mô tả</label>
                    <textarea v-model="editingType.description" placeholder="Mô tả chi tiết..." rows="3"></textarea>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
                    <button @click="showTypeModal = false" class="btn btn-secondary">Hủy</button>
                    <button @click="saveType" class="btn btn-primary">Lưu</button>
                </div>
            </div>
        </div>

        <!-- Equipment Modal -->
        <div v-if="showEquipModal" class="modal-overlay" @click.self="showEquipModal = false">
            <div class="modal" style="max-width: 36rem;">
                <h3 style="margin-bottom: 1.25rem;">{{ editingEquip.id ? '✏️ Sửa thiết bị' : '➕ Thêm thiết bị' }}</h3>
                <div class="form-group">
                    <label>Tên thiết bị *</label>
                    <input v-model="editingEquip.name" type="text" placeholder="VD: Quạt số 1 - Chuồng A">
                </div>
                <div class="form-group">
                    <label>Loại thiết bị</label>
                    <select v-model="editingEquip.equipment_type_id">
                        <option value="">-- Chọn loại --</option>
                        <option v-for="t in equipmentTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
                    </select>
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
                    <div class="form-group">
                        <label>Model</label>
                        <input v-model="editingEquip.model" type="text" placeholder="Model">
                    </div>
                    <div class="form-group">
                        <label>Số serial</label>
                        <input v-model="editingEquip.serial_no" type="text" placeholder="Serial No">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
                    <div class="form-group">
                        <label>Công suất (W)</label>
                        <input v-model="editingEquip.power_watts" type="number" placeholder="150">
                    </div>
                    <div class="form-group">
                        <label>Trạng thái</label>
                        <select v-model="editingEquip.status">
                            <option value="active">Hoạt động</option>
                            <option value="inactive">Dừng</option>
                            <option value="maintenance">Bảo trì</option>
                        </select>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
                    <div class="form-group">
                        <label>Ngày lắp đặt</label>
                        <input v-model="editingEquip.install_date" type="date">
                    </div>
                    <div class="form-group">
                        <label>Hết bảo hành</label>
                        <input v-model="editingEquip.warranty_until" type="date">
                    </div>
                </div>
                <div class="form-group">
                    <label>Ghi chú</label>
                    <textarea v-model="editingEquip.notes" placeholder="Ghi chú..." rows="2"></textarea>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
                    <button @click="showEquipModal = false" class="btn btn-secondary">Hủy</button>
                    <button @click="saveEquip" class="btn btn-primary">Lưu</button>
                </div>
            </div>
        </div>

        <!-- Assign Modal -->
        <div v-if="showAssignModal" class="modal-overlay" @click.self="showAssignModal = false">
            <div class="modal" style="max-width: 28rem;">
                <h3 style="margin-bottom: 1.25rem;">🔗 Gán kênh cho "{{ selectedEquip?.name }}"</h3>
                <div class="form-group">
                    <label>Thiết bị ESP32</label>
                    <select id="assignDevice">
                        <option value="">-- Chọn thiết bị --</option>
                        <option v-for="d in availableDevices" :key="d.id" :value="d.id">
                            {{ d.name }} ({{ d.mqtt_topic }})
                        </option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Kênh relay (1-8)</label>
                    <select id="assignChannel">
                        <option value="1">Kênh 1</option>
                        <option value="2">Kênh 2</option>
                        <option value="3">Kênh 3</option>
                        <option value="4">Kênh 4</option>
                        <option value="5">Kênh 5</option>
                        <option value="6">Kênh 6</option>
                        <option value="7">Kênh 7</option>
                        <option value="8">Kênh 8</option>
                    </select>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
                    <button @click="showAssignModal = false" class="btn btn-secondary">Hủy</button>
                    <button @click="assignChannel(document.getElementById('assignDevice').value, document.getElementById('assignChannel').value)" class="btn btn-primary">Gán</button>
                </div>
            </div>
        </div>
    </div>
    `
};