/**
 * Equipment Page V2 - Quản lý thiết bị cơ cấu (Phiên bản Thiết kế Cao cấp)
 * - Quản lý loại thiết bị và cơ danh mục vật lý lắp đặt
 * - Giao diện trực quan phân chia bố cục Desktop/Mobile chuẩn tinh tế
 * - Tính năng gán kênh rơ-le điều khiển cho tủ thông minh ESP32
 * - Thiết kế đồng bộ hoàn hảo với Phong cách Nông nghiệp Công nghệ cao
 */
const { ref, reactive, computed, onMounted } = Vue;

return {
    setup() {
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

        // Form Gán kênh
        const assignForm = reactive({
            device_id: '',
            channel_number: '1'
        });

        // ── Computed ───────────────────────────────────
        const selectedBarn = computed(() =>
            barns.value.find(b => b.id == selectedBarnId.value)
        );

        const availableDevices = computed(() =>
            devices.value.filter(d => d.is_online)
        );

        // ── Methods ────────────────────────────────────
        async function loadBarns() {
            try {
                barns.value = await API.barns.list();
                if (barns.value.length > 0 && !selectedBarnId.value) {
                    selectedBarnId.value = barns.value[0].id;
                }
            } catch (e) {
                if (typeof showToast === 'function') {
                    showToast('Không thể tải danh sách chuồng nuôi', 'error');
                }
            }
        }

        async function loadEquipmentTypes() {
            try {
                equipmentTypes.value = await API.equipment.listTypes();
            } catch (e) {
                console.error('Lỗi tải loại thiết bị:', e);
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
                if (typeof showToast === 'function') {
                    showToast('Không thể tải danh sách cơ cấu thành phần', 'error');
                }
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
                devices.value = await API.devices.list(selectedBarnId.value);
            } catch (e) {
                console.error('Lỗi tải thiết bị điều khiển:', e);
            }
        }

        async function onBarnChange() {
            selectedEquip.value = null;
            await Promise.all([loadEquipment(), loadDevices()]);
        }

        // ── Loại Thiết Bị (Equipment Types) ─────────────
        function openTypeModal(type = null) {
            editingType.value = type ? { ...type } : {
                code: '', name: '', power_watts: null,
                voltage_v: null, current_amp: null, description: ''
            };
            showTypeModal.value = true;
        }

        function closeTypeModal() {
            showTypeModal.value = false;
            editingType.value = null;
        }

        async function saveType() {
            const data = editingType.value;
            if (!data.code || !data.name) {
                if (typeof showToast === 'function') showToast('Mã loại và tên loại không được để trống', 'error');
                return;
            }
            try {
                if (data.id) {
                    await API.equipment.updateType(data.id, data);
                    if (typeof showToast === 'function') showToast('Cập nhật loại thiết bị thành công!', 'success');
                } else {
                    await API.equipment.createType(data);
                    if (typeof showToast === 'function') showToast('Thêm mới loại thiết bị thành công!', 'success');
                }
                closeTypeModal();
                await loadEquipmentTypes();
                await loadEquipment();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message || 'Lỗi lưu thông tin', 'error');
            }
        }

        async function deleteType(type) {
            if (!confirm(`Xác nhận xóa bỏ hoàn toàn loại thiết bị "${type.name}"?`)) return;
            try {
                await API.equipment.deleteType(type.id);
                if (typeof showToast === 'function') showToast('Đã xóa bỏ loại thiết bị thành công!', 'success');
                await loadEquipmentTypes();
                await loadEquipment();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message || 'Lỗi khi xóa', 'error');
            }
        }

        // ── Thiết Bị Lắp Đặt (Equipment Instance) ────────
        function openEquipModal(equip = null) {
            editingEquip.value = equip ? { ...equip } : {
                barn_id: selectedBarnId.value, equipment_type_id: '', name: '',
                model: '', serial_no: '', power_watts: null, status: 'active',
                install_date: new Date().toISOString().slice(0, 10), warranty_until: '', notes: ''
            };
            showEquipModal.value = true;
        }

        function closeEquipModal() {
            showEquipModal.value = false;
            editingEquip.value = null;
        }

        async function saveEquip() {
            const data = editingEquip.value;
            if (!data.name) {
                if (typeof showToast === 'function') showToast('Vui lòng điền tên định danh thiết bị', 'error');
                return;
            }
            try {
                if (data.id) {
                    await API.equipment.update(data.id, data);
                    if (typeof showToast === 'function') showToast('Cập nhật thông tin thiết bị thành công!', 'success');
                } else {
                    data.barn_id = selectedBarnId.value;
                    await API.equipment.create(data);
                    if (typeof showToast === 'function') showToast('Lắp ráp lắp đặt thiết bị mới thành công!', 'success');
                }
                closeEquipModal();
                await loadEquipment();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message || 'Lỗi lưu thiết bị', 'error');
            }
        }

        async function deleteEquip(equip) {
            if (!confirm(`Bạn chắc chắn muốn gỡ bỏ hoàn toàn thiết bị "${equip.name}" khỏi hệ thống chăn nuôi?`)) return;
            try {
                await API.equipment.delete(equip.id);
                if (typeof showToast === 'function') showToast('Đã gỡ bỏ hạ đặt thiết bị thành công!', 'success');
                if (selectedEquip.value && selectedEquip.value.id === equip.id) {
                    selectedEquip.value = null;
                }
                await loadEquipment();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message || 'Lỗi khi xóa thiết bị', 'error');
            }
        }

        // ── Gán Kênh Rơ-le (Channel Assignment) ──────────
        function openAssignModal(equip) {
            selectedEquip.value = equip;
            assignForm.device_id = equip.device_id ? String(equip.device_id) : '';
            assignForm.channel_number = equip.channel_number ? String(equip.channel_number) : '1';
            showAssignModal.value = true;
        }

        function closeAssignModal() {
            showAssignModal.value = false;
        }

        async function doAssignChannel() {
            if (!selectedEquip.value || !assignForm.device_id) {
                if (typeof showToast === 'function') showToast('Vui lòng chỉ định thiết bị ESP32 thu nhận', 'error');
                return;
            }
            try {
                await API.equipment.assign(selectedEquip.value.id, {
                    device_id: parseInt(assignForm.device_id),
                    channel_number: parseInt(assignForm.channel_number),
                    changed_by: 'admin'
                });
                if (typeof showToast === 'function') showToast('Gán liên kết rơ-le thông minh thành công!', 'success');
                closeAssignModal();
                await loadEquipment();
                if (selectedEquip.value) {
                    await onEquipClick(selectedEquip.value);
                }
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message || 'Lỗi khi gán kênh điều khiển', 'error');
            }
        }

        async function unassignChannel(equip) {
            if (!confirm(`Hủy gỡ liên kết điều khiển cơ cấu của thiết bị "${equip.name}"?`)) return;
            try {
                await API.equipment.unassign(equip.id);
                if (typeof showToast === 'function') showToast('Đã hủy bỏ liên kết rơ-le điều khiển thành công!', 'success');
                await loadEquipment();
                if (selectedEquip.value && selectedEquip.value.id === equip.id) {
                    await onEquipClick(selectedEquip.value);
                }
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message || 'Lỗi hủy gán kết nối', 'error');
            }
        }

        // ── Logs Lịch Sử ──────────────────────────────────
        async function loadLogs(id) {
            try {
                logs.value = await API.equipment.logs(id);
            } catch (e) {
                logs.value = [];
            }
        }

        async function loadCommandLogs(id) {
            try {
                commandLogs.value = await API.equipment.commands(id);
            } catch (e) {
                commandLogs.value = [];
            }
        }

        async function onEquipClick(equip) {
            selectedEquip.value = equip;
            await Promise.all([loadLogs(equip.id), loadCommandLogs(equip.id)]);
        }

        function fmtNum(val) {
            if (val === undefined || val === null) return '0';
            return Number(val).toLocaleString('vi-VN');
        }

        function fmtDate(dateStr) {
            if (!dateStr) return '-';
            return new Date(dateStr).toLocaleDateString('vi-VN');
        }

        onMounted(async () => {
            await Promise.all([loadBarns(), loadEquipmentTypes()]);
            if (selectedBarnId.value) {
                await onBarnChange();
            }
        });

        return {
            barns, selectedBarnId, selectedBarn,
            equipmentTypes, equipment,
            devices, availableDevices,
            selectedEquip, logs, commandLogs,
            loading,
            showTypeModal, showEquipModal, showAssignModal,
            editingType, editingEquip, assignForm,
            onBarnChange,
            openTypeModal, closeTypeModal, saveType, deleteType,
            openEquipModal, closeEquipModal, saveEquip, deleteEquip,
            openAssignModal, closeAssignModal, doAssignChannel, unassignChannel,
            onEquipClick,
            fmtNum,
            fmtDate
        };
    },

    template: `
    <div class="cf-container">

        <!-- Header Section -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon" style="background-color: #4f46e5;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A7 7 0 0 0 4 8c0 1.3.5 2.6 1.5 3.5.7.8 1.3 1.5 1.5 2.5"/>
                        <path d="M9 18h6M10 22h4"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">Quản lý Thiết bị Cơ cấu</h1>
                    <p class="cf-subtitle">Định hình cơ cấu chấp hành vật lý, liên kết rơ-le thông minh điều khiển tự động</p>
                </div>
            </div>

            <div class="cf-select-wrapper" style="min-width: 14rem;">
                <select v-model="selectedBarnId" @change="onBarnChange" class="cf-select" style="height: 2.625rem;">
                    <option value="" disabled>-- Chọn chuồng quan sát --</option>
                    <option v-for="b in barns" :key="b.id" :value="b.id">
                        🏡 {{ b.name }} ({{ b.status === 'active' ? 'Đang nuôi' : 'Tạm dừng/Bảo trì' }})
                    </option>
                </select>
                <div class="cf-select-icon-right">▼</div>
            </div>
        </div>

        <!-- Empty state when no barn is chosen -->
        <div v-if="!selectedBarnId" class="cf-empty-state" style="padding: 5rem 2rem;">
            <div class="cf-empty-icon-box" style="background-color: #e0e7ff; color: #4338ca;">🏡</div>
            <h3 class="cf-empty-title">Chuồng nuôi chưa được chọn</h3>
            <p class="cf-empty-desc">Vui lòng chọn một chuồng chăn nuôi từ danh sách bộ lọc để tiếp tục giám sát cơ cấu chấp hành</p>
        </div>

        <!-- Main Workspace -->
        <div v-else>

            <!-- ── SECTION 1: EQUIPMENT TYPES REGISTRY ── -->
            <div class="cf-card" style="padding: 1.5rem; margin-bottom: 1.5rem;">
                <div class="cf-section-header">
                    <div class="cf-section-header-left">
                        <span class="cf-section-icon">📋</span>
                        <h2 class="cf-section-title">Danh mục Loại thiết bị chấp hành</h2>
                        <span class="cf-tab-btn-badge" style="background-color: #eef2ff; color: #4f46e5;">{{ equipmentTypes.length }} chủng loại</span>
                    </div>
                    <button @click="openTypeModal()" class="cf-btn-primary" style="background-color: #4f46e5;">
                        + Thêm chủng loại
                    </button>
                </div>

                <div v-if="equipmentTypes.length === 0" class="cf-empty-inline">
                    Hệ thống chưa ghi nhận chủng loại thiết bị kỹ thuật nào.
                </div>
                <div v-else class="cf-types-grid">
                    <div v-for="t in equipmentTypes" :key="t.id" class="cf-type-card">
                        <div class="cf-type-card-header">
                            <div class="cf-type-icon">⚙️</div>
                            <div class="cf-type-info">
                                <div class="cf-type-name">{{ t.name }}</div>
                                <div class="cf-type-code">{{ t.code }}</div>
                            </div>
                            <div class="cf-type-card-actions">
                                <button @click.stop="openTypeModal(t)" title="Sửa">✏️</button>
                                <button @click.stop="deleteType(t)" title="Xóa">🗑️</button>
                            </div>
                        </div>
                        <div class="cf-type-card-footer">
                            <span class="cf-type-label">Công suất định mức:</span>
                            <span v-if="t.power_watts" class="cf-type-power">{{ t.power_watts }} W</span>
                            <span v-else class="cf-type-none">-</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── SECTION 2: INSTALLED EQUIPMENT IN THE BARN ── -->
            <div class="cf-equip-main-grid">

                <!-- Equipment List Column (Left) -->
                <div class="cf-card" style="padding: 1.5rem;">
                    <div class="cf-section-header">
                        <div class="cf-section-header-left">
                            <span class="cf-section-icon">🔌</span>
                            <h2 class="cf-section-title">Cơ cấu chấp hành vật lý lắp đặt</h2>
                            <span class="cf-tab-btn-badge">{{ equipment.length }} thiết bị</span>
                        </div>
                        <button @click="openEquipModal()" class="cf-btn-primary">
                            + Lắp đặt thiết bị
                        </button>
                    </div>

                    <div v-if="loading" class="cf-loading-box">
                        <div class="cf-spinner"></div>
                        <p class="cf-loading-text">Đang nạp dữ liệu cơ cấu vật tư...</p>
                    </div>
                    <div v-else-if="equipment.length === 0" class="cf-empty-inline">
                        🏡 Chưa lắp đặt bất kỳ phụ tải cơ cấu cơ sở nào trong chuồng này.
                    </div>
                    <div v-else class="cf-equip-list">
                        <div v-for="e in equipment" :key="e.id"
                             @click="onEquipClick(e)"
                             :class="['cf-equip-card', selectedEquip && selectedEquip.id === e.id ? 'selected' : '']">

                            <div class="cf-equip-card-row">
                                <div class="cf-equip-left">
                                    <div class="cf-equip-icon-wrap">
                                        <div class="cf-equip-icon">⚙️</div>
                                        <span :class="['cf-status-dot',
                                            e.status === 'active' ? 'online' :
                                            e.status === 'maintenance' ? 'maintenance' : 'offline']"></span>
                                    </div>
                                    <div class="cf-equip-info">
                                        <div class="cf-equip-name-row">
                                            <span class="cf-primary-text">{{ e.name }}</span>
                                            <span :class="['cf-badge-status', e.status]">
                                                {{ e.status === 'active' ? 'Đang bật' : e.status === 'maintenance' ? 'Bảo trì' : 'Đang tắt' }}
                                            </span>
                                        </div>
                                        <div class="cf-equip-meta">
                                            <span>Loại: <b>{{ e.type_name || e.equipment_type || 'Chưa định nghĩa' }}</b></span>
                                            <span v-if="e.power_watts" class="cf-equip-power">{{ e.power_watts }}W</span>
                                        </div>
                                    </div>
                                </div>

                                <div class="cf-equip-actions">
                                    <div v-if="e.device_id" class="cf-device-links">
                                        <span class="cf-device-chip device">{{ e.device_name || 'ESP32' }}</span>
                                        <span class="cf-device-chip channel">Kênh {{ e.channel_number }}</span>
                                        <button @click.stop="unassignChannel(e)" class="cf-btn-sm cf-btn-unassign" title="Bỏ gán">✕</button>
                                    </div>
                                    <div v-else>
                                        <button @click.stop="openAssignModal(e)" class="cf-btn-sm cf-btn-assign">🔗 Gán kênh</button>
                                    </div>
                                    <div class="cf-row-actions">
                                        <button @click.stop="openEquipModal(e)" class="cf-btn-ghost-sm">✏️</button>
                                        <button @click.stop="deleteEquip(e)" class="cf-btn-ghost-sm danger">🗑️</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Right Details Inspection Sidebar Column -->
                <div class="cf-equip-sidebar">
                    <div v-if="!selectedEquip" class="cf-card" style="text-align: center; padding: 3rem 1.5rem;">
                        <span style="font-size: 2rem; display: block; margin-bottom: 0.75rem;">🔍</span>
                        <h3 class="cf-empty-title" style="font-size: 0.75rem;">Thông tin giám định cơ cấu</h3>
                        <p class="cf-empty-desc">Ấn chọn trực tiếp vào một phụ tải cơ cấu bên trái để truy xuất lịch sử điều khiển.</p>
                    </div>

                    <div v-else class="cf-card" style="padding: 1.5rem;">
                        <div class="cf-detail-header">
                            <h3 class="cf-detail-title">
                                <span>⚡ Giám định:</span>
                                <span class="cf-detail-name">{{ selectedEquip.name }}</span>
                            </h3>
                            <button @click="selectedEquip = null" class="cf-modal-close-btn">✕</button>
                        </div>

                        <div class="cf-info-grid-4">
                            <div class="cf-info-cell">
                                <div class="cf-info-cell-label">Chủng loại</div>
                                <div class="cf-info-cell-val">{{ selectedEquip.type_name || selectedEquip.equipment_type || '-' }}</div>
                            </div>
                            <div class="cf-info-cell">
                                <div class="cf-info-cell-label">Model</div>
                                <div class="cf-info-cell-val">{{ selectedEquip.model || '-' }}</div>
                            </div>
                            <div class="cf-info-cell">
                                <div class="cf-info-cell-label">Ký hiệu Serial</div>
                                <div class="cf-info-cell-val mono">{{ selectedEquip.serial_no || '-' }}</div>
                            </div>
                            <div class="cf-info-cell">
                                <div class="cf-info-cell-label">Hệ số tiêu thụ</div>
                                <div class="cf-info-cell-val power">{{ selectedEquip.power_watts ? selectedEquip.power_watts + ' Watt' : '-' }}</div>
                            </div>
                        </div>

                        <div class="cf-detail-meta">
                            <div class="cf-detail-meta-row">
                                <span class="cf-meta-label">📅 Ngày lắp đặt:</span>
                                <span class="cf-meta-val mono">{{ fmtDate(selectedEquip.install_date) }}</span>
                            </div>
                            <div class="cf-detail-meta-row">
                                <span class="cf-meta-label">🛡️ Bảo hành đến:</span>
                                <span class="cf-meta-val mono">{{ selectedEquip.warranty_until ? fmtDate(selectedEquip.warranty_until) : 'Không rõ' }}</span>
                            </div>
                            <div v-if="selectedEquip.notes" class="cf-detail-notes">
                                <span class="cf-meta-label">📝 Ghi chú:</span>
                                <p class="cf-notes-text">{{ selectedEquip.notes }}</p>
                            </div>
                        </div>

                        <div class="cf-logs-section">
                            <div class="cf-logs-section-header">
                                <span>🔗 Lịch sử kết cấu kênh rơ-le</span>
                                <span class="cf-log-count">({{ logs.length }})</span>
                            </div>
                            <div class="cf-logs-box">
                                <div v-for="log in logs" :key="log.id" class="cf-log-row">
                                    <div class="cf-log-row-left">
                                        <span :class="['cf-log-action', log.action]">{{ log.action === 'assign' ? 'Gán' : 'Gỡ' }}</span>
                                        <span class="cf-log-device">Tủ: {{ log.device_name || 'ESP32' }} (C:{{ log.device_channel_id }})</span>
                                    </div>
                                    <span class="cf-log-date">{{ fmtDate(log.changed_at) }}</span>
                                </div>
                                <div v-if="logs.length === 0" class="cf-log-empty">Chưa có hoạt động liên kết thiết bị.</div>
                            </div>
                        </div>

                        <div class="cf-logs-section">
                            <div class="cf-logs-section-header">
                                <span>🎛️ Nhật ký điều khiển cơ tử</span>
                                <span class="cf-log-count">({{ commandLogs.length }})</span>
                            </div>
                            <div class="cf-logs-box">
                                <div v-for="cmd in commandLogs" :key="cmd.id" class="cf-log-row">
                                    <div class="cf-log-row-left">
                                        <span :class="['cf-log-cmd', cmd.command === 'ON' ? 'on' : 'off']">{{ cmd.command }}</span>
                                        <span v-if="cmd.value" class="cf-log-value">Giá trị: {{ cmd.value }}</span>
                                        <span class="cf-log-meta">Bởi: {{ cmd.triggered_by }}</span>
                                    </div>
                                    <span class="cf-log-date">{{ fmtDate(cmd.recorded_at) }}</span>
                                </div>
                                <div v-if="commandLogs.length === 0" class="cf-log-empty">Chưa ghi nhận lệnh chấp hành điện tử nào.</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── TELEPORTED MODAL: EQUIPMENT TYPE CREATE/EDIT ── -->
        <teleport to="body">
            <div v-if="showTypeModal" class="cf-modal-overlay" @click.self="closeTypeModal">
                <div class="cf-modal-box" style="max-width: 28rem;">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #e0e7ff; color: #4338ca;">⚙️</div>
                            <h3 class="cf-modal-title">{{ editingType.id ? 'Sửa thông số loại cơ cấu' : 'Thêm mới loại cơ cấu' }}</h3>
                        </div>
                        <button @click="closeTypeModal" class="cf-modal-close-btn">✕</button>
                    </div>

                    <form @submit.prevent="saveType">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Mã chủng loại <span class="req">*</span></label>
                                <input v-model="editingType.code" type="text" class="cf-input font-mono uppercase" placeholder="Ví dụ: FAN_150W_A1" required :disabled="!!editingType.id">
                            </div>

                            <div class="cf-form-group">
                                <label class="cf-label">Tên gọi loại thiết bị <span class="req">*</span></label>
                                <input v-model="editingType.name" type="text" class="cf-input" placeholder="Ví dụ: Quạt mát khép kín công nghiệp" required>
                            </div>

                            <div class="cf-col-grid-3">
                                <div class="cf-form-group">
                                    <label class="cf-label">Công suất (W)</label>
                                    <input v-model.number="editingType.power_watts" type="number" class="cf-input font-mono" placeholder="250">
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Điện áp (V)</label>
                                    <input v-model.number="editingType.voltage_v" type="number" class="cf-input font-mono" placeholder="220">
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Dòng điện (A)</label>
                                    <input v-model.number="editingType.current_amp" type="number" step="0.01" class="cf-input font-mono" placeholder="1.15">
                                </div>
                            </div>

                            <div class="cf-form-group">
                                <label class="cf-label">Mô tả đặc điểm kỹ thuật</label>
                                <textarea v-model="editingType.description" class="cf-textarea" rows="3" placeholder="Sử dụng động cơ lõi đồng, tiêu chuẩn tiết kiệm điện năng..."></textarea>
                            </div>
                        </div>

                        <div class="cf-modal-footer">
                            <button type="button" @click="closeTypeModal" class="cf-btn-secondary">Bỏ qua</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #4f46e5;">Lưu thông số</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

        <!-- ── TELEPORTED MODAL: EQUIPMENT INSTANCE CREATE/EDIT ── -->
        <teleport to="body">
            <div v-if="showEquipModal" class="cf-modal-overlay" @click.self="closeEquipModal">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon">🔌</div>
                            <h3 class="cf-modal-title">{{ editingEquip.id ? 'Cập nhật thông tin thiết bị phụ tải' : 'Thêm thiết bị phụ tải lắp đặt' }}</h3>
                        </div>
                        <button @click="closeEquipModal" class="cf-modal-close-btn">✕</button>
                    </div>

                    <form @submit.prevent="saveEquip">
                        <div class="cf-modal-body">
                            <div class="cf-form-group">
                                <label class="cf-label">Bí danh/Tên gọi thiết bị lắp <span class="req">*</span></label>
                                <input v-model="editingEquip.name" type="text" class="cf-input" placeholder="Ví dụ: Quạt phun sương dãy trái số 1" required>
                            </div>

                            <div class="cf-form-group">
                                <label class="cf-label">Chủng loại danh mục</label>
                                <select v-model="editingEquip.equipment_type_id" class="cf-modal-select">
                                    <option value="">-- Chọn loại danh mục cấp --</option>
                                    <option v-for="t in equipmentTypes" :key="t.id" :value="t.id">{{ t.name }} ({{ t.code }})</option>
                                </select>
                            </div>

                            <div class="cf-col-grid-2">
                                <div class="cf-form-group">
                                    <label class="cf-label">Mã Model</label>
                                    <input v-model="editingEquip.model" type="text" class="cf-input" placeholder="Ví dụ: SF-2026">
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Số Serial sản xuất</label>
                                    <input v-model="editingEquip.serial_no" type="text" class="cf-input font-mono" placeholder="Ví dụ: SN-928421">
                                </div>
                            </div>

                            <div class="cf-col-grid-2">
                                <div class="cf-form-group">
                                    <label class="cf-label">Công suất thực (W)</label>
                                    <input v-model.number="editingEquip.power_watts" type="number" class="cf-input font-mono" placeholder="150">
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Trạng thái kỹ thuật</label>
                                    <select v-model="editingEquip.status" class="cf-modal-select">
                                        <option value="active">Hoạt động tự do</option>
                                        <option value="inactive">Đang tạm tắt</option>
                                        <option value="maintenance">Đang bảo trì định kỳ</option>
                                    </select>
                                </div>
                            </div>

                            <div class="cf-col-grid-2">
                                <div class="cf-form-group">
                                    <label class="cf-label">Ngày triển khai lắp</label>
                                    <input v-model="editingEquip.install_date" type="date" class="cf-input font-mono">
                                </div>
                                <div class="cf-form-group">
                                    <label class="cf-label">Ngày hết hạn bảo hành</label>
                                    <input v-model="editingEquip.warranty_until" type="date" class="cf-input font-mono">
                                </div>
                            </div>

                            <div class="cf-form-group">
                                <label class="cf-label">Ghi chú lắp đặt & vận hành</label>
                                <textarea v-model="editingEquip.notes" class="cf-textarea" rows="2" placeholder="Ghi chú vị trí lắp đặt ở kèo thép số 4, gần ô nạp gió..."></textarea>
                            </div>
                        </div>

                        <div class="cf-modal-footer">
                            <button type="button" @click="closeEquipModal" class="cf-btn-secondary">Huỷ bỏ</button>
                            <button type="submit" class="cf-btn-primary">Xác nhận lưu</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

        <!-- ── TELEPORTED MODAL: ASSIGN CONTROL ELEMENT CHANNEL ── -->
        <teleport to="body">
            <div v-if="showAssignModal" class="cf-modal-overlay" @click.self="closeAssignModal">
                <div class="cf-modal-box" style="max-width: 25rem;">
                    <div class="cf-modal-header" style="background-color: #f8fafc;">
                        <div class="cf-modal-header-left">
                            <div class="cf-modal-header-icon" style="background-color: #eff6ff; color: #1d4ed8;">🔗</div>
                            <h3 class="cf-modal-title">Liên kết rơ-le điều khiển</h3>
                        </div>
                        <button @click="closeAssignModal" class="cf-modal-close-btn">✕</button>
                    </div>

                    <form @submit.prevent="doAssignChannel">
                        <div class="cf-modal-body">
                            <p class="cf-assign-desc">
                                Chỉ định cổng rơ-le chấp hành trên tủ điện kết nối ESP32 cho riêng cơ cấu:
                                <span class="cf-assign-equip-name">"{{ selectedEquip?.name }}"</span>
                            </p>

                            <div class="cf-form-group">
                                <label class="cf-label">Hộp tủ điều khiển ESP32 <span class="req">*</span></label>
                                <select v-model="assignForm.device_id" class="cf-modal-select" required>
                                    <option value="" disabled>-- Chọn hộp điều khiển trung tâm --</option>
                                    <option v-for="d in devices" :key="d.id" :value="d.id" :disabled="!d.is_online">
                                        📲 {{ d.name }} (Topic: {{ d.mqtt_topic }}) [{{ d.is_online ? 'ONLINE' : 'OFFLINE' }}]
                                    </option>
                                </select>
                            </div>

                            <div class="cf-form-group">
                                <label class="cf-label">Kênh cổng rơ-le <span class="req">*</span></label>
                                <select v-model="assignForm.channel_number" class="cf-modal-select" required>
                                    <option value="1">Kênh số 1 (Relay Port 1)</option>
                                    <option value="2">Kênh số 2 (Relay Port 2)</option>
                                    <option value="3">Kênh số 3 (Relay Port 3)</option>
                                    <option value="4">Kênh số 4 (Relay Port 4)</option>
                                    <option value="5">Kênh số 5 (Relay Port 5)</option>
                                    <option value="6">Kênh số 6 (Relay Port 6)</option>
                                    <option value="7">Kênh số 7 (Relay Port 7)</option>
                                    <option value="8">Kênh số 8 (Relay Port 8)</option>
                                </select>
                            </div>
                        </div>

                        <div class="cf-modal-footer">
                            <button type="button" @click="closeAssignModal" class="cf-btn-secondary">Đóng lại</button>
                            <button type="submit" class="cf-btn-primary" style="background-color: #1d4ed8;">Thiết lập liên kết</button>
                        </div>
                    </form>
                </div>
            </div>
        </teleport>

    </div>
    `
};
