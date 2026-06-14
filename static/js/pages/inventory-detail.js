/**
 * Inventory Detail Page - Chi tiết kho theo warehouse ID
 * URL: /inventory/:warehouseId
 *
 * Layout (3 hành động song song):
 *   ┌─────────┬─────────┬─────────┐
 *   │ Nhập kho│ Xuất kho│Chuyển kho│
 *   └─────────┴─────────┴─────────┘
 *   Stock table
 *   History tabs: Nhập | Xuất | Chuyển | Cảnh báo
 *
 * Transfer flow (chuyển kho) dùng API.inventory.transfer — atomic ở backend.
 * Không còn 2-step "thu_hoi" cũ (export + import) — tránh mất hàng nếu request 2 fail.
 */
const { ref, computed, onMounted, watch } = Vue;

const component = {
    template: `
    <div class="inventory-detail-page space-y-4">
        <!-- ── Header ── -->
        <div class="flex items-center gap-3">
            <button @click="$router.push('/inventory')" class="btn-ghost px-3 py-1.5 rounded-lg text-sm">
                ← Danh sách kho
            </button>
            <div class="flex-1 min-w-0">
                <h2 class="text-lg font-bold truncate">{{ detailWh?.name || 'Chi tiết kho' }}</h2>
                <p v-if="detailWh" class="text-xs text-gray-500 mt-0.5">
                    <span v-if="detailWh.warehouse_type === 'feed'" class="cf-inv-status-pill ok">Cám</span>
                    <span v-else-if="detailWh.warehouse_type === 'medication'" class="cf-inv-status-pill warn">Thuốc</span>
                    <span v-else class="cf-inv-status-pill">Hợp nhất</span>
                    <span class="ml-2">{{ detailWh.is_central ? 'Kho trung tâm' : 'Kho chuồng ' + detailWh.barn_id }}</span>
                </p>
            </div>
        </div>

        <!-- ── 3 Action Cards ── -->
        <div v-if="detailWh" class="cf-inv-actions">
            <!-- ══ IMPORT CARD ══ -->
            <div class="cf-inv-action-card import">
                <div class="cf-inv-action-header">
                    <div class="cf-inv-action-icon">📥</div>
                    <div>
                        <div class="cf-inv-action-title">Nhập kho</div>
                        <div class="cf-inv-action-sub">Thêm hàng vào kho</div>
                    </div>
                </div>

                <div v-if="detailWh.warehouse_type === 'feed'" class="space-y-2">
                    <div class="cf-inv-field">
                        <label>Loại cám <span v-if="currentImportStockBadge" :class="['cf-inv-stock-badge', currentImportStockBadge.cls]">{{ currentImportStockBadge.text }}</span></label>
                        <select v-model="importForm.feed_type_id" @change="onFeedTypeChange('import')" class="form-input">
                            <option value="">-- Chọn loại cám --</option>
                            <option v-for="ft in feedTypes" :key="ft.id" :value="ft.id">{{ ft.name }} ({{ ft.brand_name }})</option>
                        </select>
                    </div>
                    <div class="cf-inv-field">
                        <label>Số lượng (bao)</label>
                        <input v-model.number="importForm.quantity" type="number" min="0" step="1" class="form-input">
                    </div>
                    <div v-if="importForm.feed_kg_per_bag && importForm.quantity" class="cf-inv-hint calc">
                        = {{ fmtNum(importForm.quantity * importForm.feed_kg_per_bag, 1) }} kg
                    </div>
                    <div class="cf-inv-field">
                        <label>Ghi chú</label>
                        <input v-model="importForm.note" class="form-input" placeholder="Lô hàng, nhà cung cấp...">
                    </div>
                    <button :disabled="!canImport" class="btn btn-primary w-full" @click="doDetailImport">📥 Nhập kho</button>
                </div>

                <div v-else-if="detailWh.warehouse_type === 'medication'" class="space-y-2">
                    <div class="cf-inv-field">
                        <label>Thuốc <span v-if="currentImportStockBadge" :class="['cf-inv-stock-badge', currentImportStockBadge.cls]">{{ currentImportStockBadge.text }}</span></label>
                        <select v-model="importForm.medication_id" @change="onMedicationSelect('import')" class="form-input">
                            <option value="">-- Chọn thuốc --</option>
                            <option v-for="m in medications" :key="m.id" :value="m.id">{{ m.name }}</option>
                        </select>
                    </div>
                    <div class="cf-inv-field-row">
                        <div class="cf-inv-field">
                            <label>Số lượng</label>
                            <input v-model.number="importForm.quantity" type="number" min="0" class="form-input" placeholder="VD: 10">
                        </div>
                        <div class="cf-inv-field">
                            <label>Đơn vị</label>
                            <select v-model="importForm.unit" class="form-input">
                                <option value="">-- Đơn vị --</option>
                                <option v-for="u in unitOptions" :key="u" :value="u">{{ u }}</option>
                            </select>
                        </div>
                    </div>
                    <div class="cf-inv-field-row">
                        <div class="cf-inv-field">
                            <label>Dung tích/KL đơn vị</label>
                            <input v-model.number="importForm.unit_size" type="number" min="0" step="0.1" class="form-input" placeholder="VD: 100">
                        </div>
                        <div class="cf-inv-field">
                            <label>Đơn vị đo</label>
                            <select v-model="importForm.unit_size_type" class="form-input">
                                <option v-for="u in sizeUnitOptions" :key="u" :value="u">{{ u }}</option>
                            </select>
                        </div>
                    </div>
                    <div class="cf-inv-field">
                        <label>Tổng tiền (VND)</label>
                        <input v-model.number="importForm.total_price" type="number" min="0" class="form-input" placeholder="VD: 500000">
                    </div>
                    <div v-if="importForm.quantity && importForm.total_price" class="cf-inv-hint calc">
                        Đơn giá: <strong>{{ fmtNum(importForm.total_price / importForm.quantity) }} VND/{{ importForm.unit || 'đv' }}</strong>
                    </div>
                    <div class="cf-inv-field">
                        <label>Nhà cung cấp</label>
                        <input v-model="importForm.supplier" list="supplier-datalist" class="form-input" placeholder="Gõ để chọn NCC...">
                        <datalist id="supplier-datalist">
                            <option v-for="s in suppliers" :key="s.id" :value="s.name">
                        </datalist>
                    </div>
                    <div class="cf-inv-field">
                        <label>Ghi chú</label>
                        <input v-model="importForm.note" class="form-input" placeholder="Lô hàng, hạn SD...">
                    </div>
                    <button :disabled="!canImport" class="btn btn-primary w-full" @click="doDetailImport">📥 Nhập kho</button>
                </div>

                <div v-else class="text-xs text-gray-400 text-center py-4">
                    Kho này không hỗ trợ nhập/xuất/chuyển riêng
                </div>
            </div>

            <!-- ══ EXPORT CARD ══ -->
            <div class="cf-inv-action-card export">
                <div class="cf-inv-action-header">
                    <div class="cf-inv-action-icon">📤</div>
                    <div>
                        <div class="cf-inv-action-title">Xuất kho</div>
                        <div class="cf-inv-action-sub">Bán / sử dụng / hết hạn</div>
                    </div>
                </div>

                <div v-if="detailWh.warehouse_type === 'feed'" class="space-y-2">
                    <div class="cf-inv-field">
                        <label>Loại cám <span v-if="currentExportStockBadge" :class="['cf-inv-stock-badge', currentExportStockBadge.cls]">{{ currentExportStockBadge.text }}</span></label>
                        <select v-model="exportForm.feed_type_id" @change="onFeedTypeChange('export')" class="form-input">
                            <option value="">-- Chọn loại cám --</option>
                            <option v-for="ft in feedTypes" :key="ft.id" :value="ft.id">{{ ft.name }} ({{ ft.brand_name }})</option>
                        </select>
                    </div>
                    <div class="cf-inv-field">
                        <label>Số lượng (bao)</label>
                        <input v-model.number="exportForm.quantity" type="number" min="0" class="form-input">
                    </div>
                    <div v-if="exportForm.feed_kg_per_bag && exportForm.quantity" class="cf-inv-hint calc">
                        = {{ fmtNum(exportForm.quantity * exportForm.feed_kg_per_bag, 1) }} kg
                    </div>
                    <div class="cf-inv-field">
                        <label>Ghi chú</label>
                        <input v-model="exportForm.note" class="form-input" placeholder="Lý do xuất...">
                    </div>
                    <button :disabled="!canExport" class="btn btn-danger w-full" @click="doDetailExport">📤 Xuất kho</button>
                </div>

                <div v-else-if="detailWh.warehouse_type === 'medication'" class="space-y-2">
                    <div class="cf-inv-field">
                        <label>Thuốc <span v-if="currentExportStockBadge" :class="['cf-inv-stock-badge', currentExportStockBadge.cls]">{{ currentExportStockBadge.text }}</span></label>
                        <select v-model="exportForm.medication_id" @change="onMedicationSelect('export')" class="form-input">
                            <option value="">-- Chọn thuốc --</option>
                            <option v-for="m in medications" :key="m.id" :value="m.id">{{ m.name }}</option>
                        </select>
                    </div>
                    <div class="cf-inv-field">
                        <label>Lý do xuất</label>
                        <select v-model="exportForm.export_type" class="form-input">
                            <option value="">-- Chọn lý do --</option>
                            <option value="ban">Bán hàng</option>
                            <option value="het_han">Hết hạn / Đổ bỏ</option>
                            <option value="dung">Sử dụng nội bộ</option>
                        </select>
                    </div>
                    <div class="cf-inv-field">
                        <label>Số lượng</label>
                        <div class="flex gap-1.5">
                            <input v-model.number="exportForm.quantity" type="number" min="0" class="form-input flex-1" placeholder="0">
                            <button v-if="exportForm.medication_id" @click="autoFillExportQty" class="btn btn-ghost btn-xs whitespace-nowrap" title="Lấy tồn hiện tại">Tự động</button>
                        </div>
                    </div>
                    <div class="cf-inv-field">
                        <label>Ghi chú</label>
                        <input v-model="exportForm.note" class="form-input" placeholder="VD: Bán cho khách X...">
                    </div>
                    <button :disabled="!canExport" class="btn btn-danger w-full" @click="doDetailExport">📤 Xuất kho</button>
                </div>

                <div v-else class="text-xs text-gray-400 text-center py-4">
                    Kho này không hỗ trợ nhập/xuất/chuyển riêng
                </div>
            </div>

            <!-- ══ TRANSFER CARD ══ -->
            <div :class="['cf-inv-action-card transfer', !canTransferAtAll && 'disabled']">
                <div class="cf-inv-action-header">
                    <div class="cf-inv-action-icon">🔄</div>
                    <div>
                        <div class="cf-inv-action-title">Chuyển kho</div>
                        <div class="cf-inv-action-sub">Chuyển sang kho khác cùng loại</div>
                    </div>
                </div>

                <div v-if="!otherWarehouses.length" class="text-xs text-gray-400 text-center py-4">
                    Không có kho khác cùng loại để chuyển
                </div>

                <div v-else-if="detailWh.warehouse_type === 'feed'" class="space-y-2">
                    <div class="cf-inv-field">
                        <label>Loại cám <span v-if="currentTransferStockBadge" :class="['cf-inv-stock-badge', currentTransferStockBadge.cls]">{{ currentTransferStockBadge.text }}</span></label>
                        <select v-model="transferForm.feed_type_id" @change="onFeedTypeChange('transfer')" class="form-input">
                            <option value="">-- Chọn loại cám --</option>
                            <option v-for="ft in feedTypes" :key="ft.id" :value="ft.id">{{ ft.name }} ({{ ft.brand_name }})</option>
                        </select>
                    </div>
                    <div class="cf-inv-field">
                        <label>Số lượng (bao)</label>
                        <input v-model.number="transferForm.quantity" type="number" min="0" class="form-input">
                    </div>
                    <div v-if="transferForm.feed_kg_per_bag && transferForm.quantity" class="cf-inv-hint calc">
                        = {{ fmtNum(transferForm.quantity * transferForm.feed_kg_per_bag, 1) }} kg
                    </div>
                    <div class="cf-inv-field">
                        <label>Kho đích</label>
                        <select v-model="transferForm.target_warehouse_id" class="form-input">
                            <option value="">-- Chọn kho --</option>
                            <option v-for="w in otherWarehouses" :key="w.id" :value="w.id">
                                {{ w.name }} ({{ w.is_central ? 'TT' : 'Chuồng ' + w.barn_id }})
                            </option>
                        </select>
                    </div>
                    <div class="cf-inv-field">
                        <label>Ghi chú</label>
                        <input v-model="transferForm.note" class="form-input" placeholder="Lý do chuyển...">
                    </div>
                    <button :disabled="!canTransfer" class="btn btn-info w-full" @click="doDetailTransfer">🔄 Chuyển kho</button>
                </div>

                <div v-else-if="detailWh.warehouse_type === 'medication'" class="space-y-2">
                    <div class="cf-inv-field">
                        <label>Thuốc <span v-if="currentTransferStockBadge" :class="['cf-inv-stock-badge', currentTransferStockBadge.cls]">{{ currentTransferStockBadge.text }}</span></label>
                        <select v-model="transferForm.medication_id" @change="onMedicationSelect('transfer')" class="form-input">
                            <option value="">-- Chọn thuốc --</option>
                            <option v-for="m in medications" :key="m.id" :value="m.id">{{ m.name }}</option>
                        </select>
                    </div>
                    <div class="cf-inv-field">
                        <label>Số lượng</label>
                        <div class="flex gap-1.5">
                            <input v-model.number="transferForm.quantity" type="number" min="0" class="form-input flex-1" placeholder="0">
                            <button v-if="transferForm.medication_id" @click="autoFillTransferQty" class="btn btn-ghost btn-xs whitespace-nowrap" title="Lấy tồn hiện tại">Tự động</button>
                        </div>
                    </div>
                    <div class="cf-inv-field">
                        <label>Kho đích</label>
                        <select v-model="transferForm.target_warehouse_id" class="form-input">
                            <option value="">-- Chọn kho --</option>
                            <option v-for="w in otherWarehouses" :key="w.id" :value="w.id">
                                {{ w.name }} ({{ w.is_central ? 'TT' : 'Chuồng ' + w.barn_id }})
                            </option>
                        </select>
                    </div>
                    <div class="cf-inv-field">
                        <label>Ghi chú</label>
                        <input v-model="transferForm.note" class="form-input" placeholder="Lý do chuyển...">
                    </div>
                    <button :disabled="!canTransfer" class="btn btn-info w-full" @click="doDetailTransfer">🔄 Chuyển kho</button>
                </div>

                <div v-else class="text-xs text-gray-400 text-center py-4">
                    Kho này không hỗ trợ chuyển
                </div>
            </div>
        </div>

        <!-- ── Current Stock Table ── -->
        <div v-if="detailWh" class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <h3 class="font-semibold mb-3 text-sm">📦 Tồn kho hiện tại</h3>
            <div v-if="detailWhStock.length" class="overflow-x-auto">
                <table class="cf-inv-stock-table">
                    <thead><tr>
                        <th>Sản phẩm</th>
                        <th>Đơn vị</th>
                        <th class="text-right">Số lượng</th>
                        <th class="text-right">Tối thiểu</th>
                        <th>Tình trạng</th>
                    </tr></thead>
                    <tbody>
                        <tr v-for="s in detailWhStock" :key="s.product_id"
                            :class="rowClass(s)">
                            <td class="font-medium">{{ s.product_name }}</td>
                            <td class="text-gray-500">{{ detailWh.warehouse_type === 'feed' ? 'kg' : (s.unit || '-') }}</td>
                            <td class="text-right font-semibold" :class="qtyClass(s)">{{ fmtStockQty(s) }}</td>
                            <td class="text-right text-gray-500">{{ s.min_stock_alert ? fmtNum(s.min_stock_alert) : '-' }}</td>
                            <td><span :class="['cf-inv-status-pill', statusPillCls(s)]">{{ statusPillText(s) }}</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else-if="!loadingStock" class="text-sm text-gray-400 py-6 text-center">Kho trống</div>
            <div v-else class="text-sm text-gray-400 py-6 text-center">Đang tải...</div>
        </div>

        <!-- ── History Tabs ── -->
        <div v-if="detailWh" class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div class="flex gap-1 mb-3 border-b border-gray-200 overflow-x-auto">
                <button @click="whHistoryTab='imports'" :class="tabClass('imports')">📥 Lịch sử nhập</button>
                <button @click="whHistoryTab='exports'" :class="tabClass('exports')">📤 Lịch sử xuất</button>
                <button @click="whHistoryTab='transfers'" :class="tabClass('transfers')">🔄 Chuyển kho</button>
                <button @click="whHistoryTab='alerts'" :class="tabClass('alerts')">🔔 Cảnh báo</button>
            </div>

            <!-- Tab: Imports -->
            <div v-if="whHistoryTab==='imports'">
                <div v-if="filterByType('import').length" class="overflow-x-auto">
                    <table class="cf-inv-stock-table">
                        <thead><tr>
                            <th>Thời gian</th><th>Sản phẩm</th><th class="text-right">SL</th>
                            <th>ĐV</th><th>Dung tích</th><th class="text-right">Đơn giá</th>
                            <th class="text-right">Tổng tiền</th><th>NCC</th><th>Ghi chú</th><th></th>
                        </tr></thead>
                        <tbody>
                            <tr v-for="t in filterByType('import')" :key="t.id">
                                <td class="text-xs text-gray-500 whitespace-nowrap">{{ fmtDate(t.created_at) }}</td>
                                <td>{{ t.product_name || t.product_id }}</td>
                                <td class="text-right font-semibold text-green-600">+{{ fmtNum(t.quantity, 2) }}</td>
                                <td class="text-xs">{{ t.unit || '-' }}</td>
                                <td class="text-xs">{{ t.unit_size ? t.unit_size + (t.unit_size_type || '') : '-' }}</td>
                                <td class="text-xs text-right">{{ t.unit_price ? fmtNum(t.unit_price) : '-' }}</td>
                                <td class="text-xs text-right">{{ t.total_price ? fmtNum(t.total_price) : '-' }}</td>
                                <td class="text-xs">{{ t.supplier || '-' }}</td>
                                <td class="text-xs text-gray-500">{{ t.notes || '-' }}</td>
                                <td><button @click="deleteTransaction(t)" class="btn btn-ghost btn-xs text-red-600">✕</button></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="text-sm text-gray-400 py-6 text-center">Chưa có lịch sử nhập</div>
            </div>

            <!-- Tab: Exports -->
            <div v-if="whHistoryTab==='exports'">
                <div v-if="filterByType('export').length" class="overflow-x-auto">
                    <table class="cf-inv-stock-table">
                        <thead><tr>
                            <th>Thời gian</th><th>Sản phẩm</th><th class="text-right">SL</th>
                            <th>Lý do</th><th>Ghi chú</th><th></th>
                        </tr></thead>
                        <tbody>
                            <tr v-for="t in filterByType('export')" :key="t.id">
                                <td class="text-xs text-gray-500 whitespace-nowrap">{{ fmtDate(t.created_at) }}</td>
                                <td>{{ t.product_name || t.product_id }}</td>
                                <td class="text-right font-semibold text-red-600">-{{ fmtNum(Math.abs(t.quantity), 2) }}</td>
                                <td class="text-xs">{{ exportTypeLabel(t.export_type) }}</td>
                                <td class="text-xs text-gray-500">{{ t.notes || '-' }}</td>
                                <td><button @click="deleteTransaction(t)" class="btn btn-ghost btn-xs text-red-600">✕</button></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="text-sm text-gray-400 py-6 text-center">Chưa có lịch sử xuất</div>
            </div>

            <!-- Tab: Transfers -->
            <div v-if="whHistoryTab==='transfers'">
                <div v-if="transferRows.length" class="overflow-x-auto">
                    <table class="cf-inv-stock-table">
                        <thead><tr>
                            <th>Thời gian</th><th>Sản phẩm</th><th class="text-right">SL</th>
                            <th>Hướng</th><th>Từ kho</th><th>Đến kho</th><th>Ghi chú</th><th></th>
                        </tr></thead>
                        <tbody>
                            <tr v-for="row in transferRows" :key="row.id" class="cf-inv-transfer-row">
                                <td class="text-xs text-gray-500 whitespace-nowrap">{{ fmtDate(row.created_at) }}</td>
                                <td>{{ row.product_name || row.product_id }}</td>
                                <td class="text-right font-semibold text-blue-600">{{ fmtNum(Math.abs(row.quantity), 2) }}</td>
                                <td>
                                    <span v-if="row.direction === 'out'" class="cf-inv-status-pill" style="background:#fee2e2;color:#b91c1c">↗ Xuất</span>
                                    <span v-else class="cf-inv-status-pill" style="background:#dbeafe;color:#1d4ed8">↙ Nhận</span>
                                </td>
                                <td><span class="cf-inv-transfer-source">{{ row.from_name }}</span></td>
                                <td><span class="cf-inv-transfer-dest">{{ row.to_name }}</span></td>
                                <td class="text-xs text-gray-500">{{ row.notes || '-' }}</td>
                                <td><button @click="deleteTransaction(row)" class="btn btn-ghost btn-xs text-red-600">✕</button></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="text-sm text-gray-400 py-6 text-center">Chưa có giao dịch chuyển kho</div>
            </div>

            <!-- Tab: Alerts -->
            <div v-if="whHistoryTab==='alerts'">
                <div class="flex justify-between items-center mb-3">
                    <p class="text-xs text-gray-500">Cảnh báo khi tồn kho dưới ngưỡng hoặc hết hàng</p>
                    <button class="btn btn-primary btn-xs" @click="openAlertRuleForm()">+ Thêm quy tắc</button>
                </div>
                <div v-if="alertRules.length" class="overflow-x-auto">
                    <table class="cf-inv-stock-table">
                        <thead><tr>
                            <th>Sản phẩm</th><th>Loại</th><th>Ngưỡng</th>
                            <th>Tần suất</th><th>Trạng thái</th><th></th>
                        </tr></thead>
                        <tbody>
                            <tr v-for="r in alertRules" :key="r.id" :class="!r.enabled && 'opacity-50'">
                                <td>{{ r.product_name || 'Tất cả' }}</td>
                                <td>
                                    <span v-if="r.alert_type === 'low_stock'" class="cf-inv-status-pill warn">Tồn thấp</span>
                                    <span v-else-if="r.alert_type === 'out_of_stock'" class="cf-inv-status-pill low">Hết hàng</span>
                                    <span v-else class="cf-inv-status-pill">{{ r.alert_type }}</span>
                                </td>
                                <td>{{ r.threshold ? fmtNum(r.threshold) : '(mặc định)' }}</td>
                                <td>{{ r.frequency_minutes ? r.frequency_minutes + ' phút' : 'thủ công' }}</td>
                                <td>
                                    <span v-if="r.enabled" class="cf-inv-status-pill ok">Bật</span>
                                    <span v-else class="cf-inv-status-pill">Tắt</span>
                                </td>
                                <td class="flex gap-1">
                                    <button class="btn btn-ghost btn-xs" @click="toggleAlertRule(r)">{{ r.enabled ? 'Tắt' : 'Bật' }}</button>
                                    <button class="btn btn-ghost btn-xs text-red-600" @click="deleteAlertRule(r)">Xóa</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="text-sm text-gray-400 py-6 text-center">Chưa có quy tắc nào cho kho này</div>
            </div>
        </div>

        <!-- ── Alert Rule Modal ── -->
        <div v-if="showAlertRuleModal" class="cf-modal-overlay" @click.self="showAlertRuleModal=false">
            <div class="cf-modal-box" style="max-width: 28rem;">
                <div class="cf-modal-header">
                    <div class="cf-modal-header-left">
                        <div class="cf-modal-header-icon" style="background-color: #fef3c7; color: #b45309;">🔔</div>
                        <h3 class="cf-modal-title">{{ alertRuleForm.id ? 'Sửa quy tắc' : 'Thêm quy tắc cảnh báo' }}</h3>
                    </div>
                </div>
                <div class="cf-modal-body space-y-2">
                    <div class="cf-inv-field"><label>Sản phẩm</label>
                        <select v-model="alertRuleForm.product_id" class="form-input">
                            <option value="">-- Tất cả sản phẩm --</option>
                            <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                        </select>
                    </div>
                    <div class="cf-inv-field"><label>Loại cảnh báo</label>
                        <select v-model="alertRuleForm.alert_type" class="form-input">
                            <option value="low_stock">Tồn kho thấp</option>
                            <option value="out_of_stock">Hết hàng</option>
                        </select>
                    </div>
                    <div class="cf-inv-field"><label>Ngưỡng tối thiểu</label>
                        <input v-model.number="alertRuleForm.threshold" type="number" step="0.1" class="form-input" placeholder="VD: 100">
                    </div>
                    <div class="cf-inv-field"><label>Tần suất (phút)</label>
                        <input v-model.number="alertRuleForm.frequency_minutes" type="number" step="5" class="form-input" placeholder="60">
                    </div>
                    <div class="cf-inv-field">
                        <label class="flex items-center gap-2">
                            <input type="checkbox" v-model="alertRuleForm.enabled"> Bật cảnh báo
                        </label>
                    </div>
                    <div class="cf-inv-field"><label>Ghi chú</label>
                        <input v-model="alertRuleForm.note" class="form-input" placeholder="Ghi chú thêm...">
                    </div>
                </div>
                <div class="cf-modal-footer">
                    <button @click="showAlertRuleModal=false" class="btn btn-ghost flex-1">Hủy</button>
                    <button @click="saveAlertRule" class="btn btn-primary flex-1">Lưu</button>
                </div>
            </div>
        </div>
    </div>
    `,

    props: {
        warehouseId: { type: [String, Number], required: true }
    },

    setup(props) {
        // ── State ──
        const detailWh = ref(null);
        const whHistoryTab = ref('imports');
        const detailWhStock = ref([]);
        const allTransactions = ref([]);  // unfiltered
        const feedTypes = ref([]);
        const feedBrands = ref([]);
        const medications = ref([]);
        const suppliers = ref([]);
        const products = ref([]);
        const alertRules = ref([]);
        const loadingStock = ref(false);
        const otherWarehouses = ref([]);

        const showAlertRuleModal = ref(false);
        const alertRuleForm = ref({
            warehouse_id: '', product_id: '', alert_type: 'low_stock',
            threshold: null, frequency_minutes: 60, severity: 'warning',
            enabled: true, note: ''
        });

        // ── 3 Forms (clean, no shared state) ──
        const importForm = ref({
            feed_type_id: '', medication_id: '', quantity: 0, note: '',
            feed_kg_per_bag: null, supplier: '', unit: '', unit_size: '',
            unit_size_type: 'ml', total_price: null
        });
        const exportForm = ref({
            feed_type_id: '', medication_id: '', quantity: 0, note: '',
            feed_kg_per_bag: null, unit: '', export_type: ''
        });
        const transferForm = ref({
            feed_type_id: '', medication_id: '', quantity: 0, note: '',
            feed_kg_per_bag: null, target_warehouse_id: ''
        });

        // Constants
        const unitOptions = ['chai', 'lọc', 'gói', 'viên', 'liều', 'ml', 'g', 'kg'];
        const sizeUnitOptions = ['ml', 'g', 'kg', 'lít', 'liều'];

        // ── Helpers ──
        function fmtNum(n, decimals = 0) {
            if (n === null || n === undefined) return '-';
            return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        }
        function fmtDate(d) {
            if (!d) return '-';
            return new Date(d).toLocaleString('vi-VN');
        }
        function getProductIdForFeedType(feedTypeId) {
            const ft = feedTypes.value.find(t => t.id == feedTypeId);
            return ft?.product_id || 1;
        }
        function getProductIdForMedication(medId) {
            const m = medications.value.find(x => x.id == medId);
            return m?.product_id;
        }
        // Lấy product_id hiện tại đang chọn trong 1 form
        function getSelectedProductId(form) {
            if (!detailWh.value) return null;
            if (detailWh.value.warehouse_type === 'feed') {
                if (!form.feed_type_id) return null;
                return getProductIdForFeedType(form.feed_type_id);
            } else if (detailWh.value.warehouse_type === 'medication') {
                if (!form.medication_id) return null;
                return getProductIdForMedication(form.medication_id);
            }
            return null;
        }
        // Lấy tồn kho realtime của product trong kho hiện tại
        function getCurrentStock(productId) {
            if (!productId) return 0;
            const item = detailWhStock.value.find(s => s.product_id === productId);
            return item?.quantity || 0;
        }
        // Trả về { text, cls } cho badge tồn kho
        function makeStockBadge(productId) {
            if (!productId) return null;
            const qty = getCurrentStock(productId);
            if (qty <= 0) return { text: 'Hết hàng', cls: 'empty' };
            if (qty < 10) return { text: `Tồn: ${fmtNum(qty, 1)}`, cls: 'warn' };
            return { text: `Tồn: ${fmtNum(qty, 1)}`, cls: 'ok' };
        }

        // Computed badges
        const currentImportStockBadge = computed(() => makeStockBadge(getSelectedProductId(importForm.value)));
        const currentExportStockBadge = computed(() => makeStockBadge(getSelectedProductId(exportForm.value)));
        const currentTransferStockBadge = computed(() => makeStockBadge(getSelectedProductId(transferForm.value)));

        // Computed can-flg
        const canTransferAtAll = computed(() => otherWarehouses.value.length > 0);
        const canImport = computed(() => {
            if (!importForm.value.quantity) return false;
            if (detailWh.value?.warehouse_type === 'feed') return !!importForm.value.feed_type_id;
            if (detailWh.value?.warehouse_type === 'medication') {
                return !!importForm.value.medication_id && !!importForm.value.total_price;
            }
            return false;
        });
        const canExport = computed(() => {
            if (!exportForm.value.quantity) return false;
            if (detailWh.value?.warehouse_type === 'feed') return !!exportForm.value.feed_type_id;
            if (detailWh.value?.warehouse_type === 'medication') return !!exportForm.value.medication_id;
            return false;
        });
        const canTransfer = computed(() => {
            if (!transferForm.value.quantity || !transferForm.value.target_warehouse_id) return false;
            if (detailWh.value?.warehouse_type === 'feed') return !!transferForm.value.feed_type_id;
            if (detailWh.value?.warehouse_type === 'medication') return !!transferForm.value.medication_id;
            return false;
        });

        // Filtered transactions: loại bỏ transfer ra khỏi tab nhập/xuất
        function filterByType(type) {
            return allTransactions.value.filter(t =>
                t.transaction_type === type && t.reference_type !== 'transfer'
            );
        }
        // Rows cho tab chuyển kho:
        //   - SQL đã filter sẵn chỉ trả transactions ở kho hiện tại
        //   - Ở kho nguồn: thấy export (outgoing) với from=this, to=đích
        //   - Ở kho đích:   thấy import  (incoming) với from=nguồn, to=this
        //   → Mỗi transfer hiển thị ở đúng 1 kho, không trùng
        const transferRows = computed(() => {
            return allTransactions.value
                .filter(t => t.reference_type === 'transfer')
                .map(t => {
                    const isOutgoing = t.transaction_type === 'export';
                    return {
                        ...t,
                        direction: isOutgoing ? 'out' : 'in',
                        from_name: t.from_warehouse_name || (t.from_warehouse_id ? `Kho #${t.from_warehouse_id}` : '-'),
                        to_name: t.to_warehouse_name || (t.warehouse_name || `Kho #${t.warehouse_id}`),
                    };
                })
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        });

        // ── Loaders ──
        async function loadWarehouse() {
            try {
                const warehouses = await API.warehouses.list();
                detailWh.value = warehouses.find(w => w.id == props.warehouseId) || null;
                if (!detailWh.value) return;

                const tasks = [loadStock(), loadTransactions(), loadProducts(), loadAlertRules()];
                if (detailWh.value.warehouse_type === 'feed') {
                    tasks.push(loadFeedData());
                } else if (detailWh.value.warehouse_type === 'medication') {
                    tasks.push(loadMedications(), loadSuppliers(), loadOtherWarehouses());
                }
                await Promise.all(tasks);
            } catch(e) { console.error('Load warehouse error:', e); }
        }

        async function loadFeedData() {
            try {
                [feedBrands.value, feedTypes.value] = await Promise.all([
                    API.feedBrands.list().catch(() => []),
                    API.feedTypes.list().catch(() => []),
                ]);
            } catch { feedBrands.value = []; feedTypes.value = []; }
        }

        async function loadMedications() {
            try { medications.value = await API.medications.list().catch(() => []); }
            catch { medications.value = []; }
        }

        async function loadSuppliers() {
            try { suppliers.value = await API.suppliers.list().catch(() => []); }
            catch { suppliers.value = []; }
        }

        async function loadProducts() {
            try { products.value = await API.products.list().catch(() => []); }
            catch { products.value = []; }
        }

        async function loadAlertRules() {
            try { alertRules.value = await API.inventory.alertRules().catch(() => []); }
            catch { alertRules.value = []; }
        }

        async function loadStock() {
            loadingStock.value = true;
            try { detailWhStock.value = await API.inventory.list(props.warehouseId).catch(() => []); }
            catch { detailWhStock.value = []; }
            finally { loadingStock.value = false; }
        }

        async function loadTransactions() {
            try {
                // Lấy TẤT CẢ transactions, không filter type. Cần reference_type để biết transfer.
                const txns = await API.inventory.transactions(props.warehouseId, 200).catch(() => []);
                allTransactions.value = txns || [];
            } catch { allTransactions.value = []; }
        }

        async function loadOtherWarehouses() {
            try {
                const all = await API.warehouses.list();
                otherWarehouses.value = all.filter(w =>
                    w.id != props.warehouseId &&
                    w.warehouse_type === detailWh.value?.warehouse_type &&
                    w.active !== false
                );
            } catch { otherWarehouses.value = []; }
        }

        // ── Form event handlers ──
        function onFeedTypeChange(formKey) {
            const form = formKey === 'import' ? importForm.value
                       : formKey === 'export' ? exportForm.value
                       : transferForm.value;
            const ft = feedTypes.value.find(t => t.id == form.feed_type_id);
            const kgPerBag = ft?.kg_per_bag || feedBrands.value.find(b => b.id == ft?.feed_brand_id)?.kg_per_bag || 25;
            form.feed_kg_per_bag = kgPerBag;
        }

        function onMedicationSelect(formKey) {
            // Hiện tại chỉ cần set unit hint khi chọn (tương lai có thể auto-fill price)
            // Không làm gì đặc biệt
        }

        function autoFillExportQty() {
            const pid = getSelectedProductId(exportForm.value);
            if (!pid) return;
            const item = detailWhStock.value.find(s => s.product_id === pid);
            if (item) {
                exportForm.value.quantity = item.quantity;
                exportForm.value.unit = item.unit || 'g';
            }
        }

        function autoFillTransferQty() {
            const pid = getSelectedProductId(transferForm.value);
            if (!pid) return;
            const item = detailWhStock.value.find(s => s.product_id === pid);
            if (item) {
                transferForm.value.quantity = item.quantity;
            }
        }

        // ── Actions: IMPORT ──
        async function doDetailImport() {
            if (!detailWh.value || !canImport.value) return;
            try {
                let product_id, qty = importForm.value.quantity;
                if (detailWh.value.warehouse_type === 'feed') {
                    const ft = feedTypes.value.find(t => t.id == importForm.value.feed_type_id);
                    if (!ft) { showToast('Loại cám không tồn tại', 'error'); return; }
                    product_id = ft.product_id || 1;
                    if (importForm.value.feed_kg_per_bag) qty = qty * importForm.value.feed_kg_per_bag;
                } else if (detailWh.value.warehouse_type === 'medication') {
                    const med = medications.value.find(m => m.id == importForm.value.medication_id);
                    if (!med) { showToast('Thuốc không tồn tại', 'error'); return; }
                    if (!med.product_id) { showToast('Thuốc chưa có product mapping', 'error'); return; }
                    product_id = med.product_id;
                } else { return; }

                const importData = {
                    warehouse_id: props.warehouseId,
                    product_id, quantity: qty,
                    notes: importForm.value.note,
                    unit: importForm.value.unit,
                    unit_size: importForm.value.unit_size,
                    unit_size_type: importForm.value.unit_size_type,
                    unit_price: importForm.value.total_price && importForm.value.quantity
                        ? importForm.value.total_price / importForm.value.quantity : null,
                    total_price: importForm.value.total_price,
                };
                if (detailWh.value.warehouse_type === 'medication' && importForm.value.supplier) {
                    importData.supplier = importForm.value.supplier;
                }
                await API.inventory.importStock(importData);
                showToast('Đã nhập kho', 'success');
                resetForm('import');
                await Promise.all([loadStock(), loadTransactions()]);
            } catch(e) { showToast('Lỗi: ' + e.message, 'error'); }
        }

        // ── Actions: EXPORT (không bao gồm transfer, transfer có form riêng) ──
        async function doDetailExport() {
            if (!detailWh.value || !canExport.value) return;
            try {
                let product_id, qty = exportForm.value.quantity;
                if (detailWh.value.warehouse_type === 'feed') {
                    const ft = feedTypes.value.find(t => t.id == exportForm.value.feed_type_id);
                    if (!ft) { showToast('Loại cám không tồn tại', 'error'); return; }
                    product_id = ft.product_id || 1;
                    if (exportForm.value.feed_kg_per_bag) qty = qty * exportForm.value.feed_kg_per_bag;
                } else if (detailWh.value.warehouse_type === 'medication') {
                    const med = medications.value.find(m => m.id == exportForm.value.medication_id);
                    if (!med) { showToast('Thuốc không tồn tại', 'error'); return; }
                    if (!med.product_id) { showToast('Thuốc chưa có product mapping', 'error'); return; }
                    product_id = med.product_id;
                } else { return; }

                // Validate tồn trước khi xuất
                const currentStock = getCurrentStock(product_id);
                if (currentStock < qty) {
                    showToast(`Không đủ tồn (hiện có: ${fmtNum(currentStock, 1)})`, 'error');
                    return;
                }

                await API.inventory.exportStock({
                    warehouse_id: props.warehouseId,
                    product_id, quantity: qty,
                    export_type: exportForm.value.export_type || undefined,
                    notes: exportForm.value.note,
                });
                showToast('Đã xuất kho', 'success');
                resetForm('export');
                await Promise.all([loadStock(), loadTransactions()]);
            } catch(e) { showToast('Lỗi: ' + e.message, 'error'); }
        }

        // ── Actions: TRANSFER (atomic, single API call) ──
        async function doDetailTransfer() {
            if (!detailWh.value || !canTransfer.value) return;
            if (Number(transferForm.value.target_warehouse_id) === Number(props.warehouseId)) {
                showToast('Kho đích phải khác kho hiện tại', 'error');
                return;
            }
            try {
                let product_id, qty = transferForm.value.quantity;
                if (detailWh.value.warehouse_type === 'feed') {
                    const ft = feedTypes.value.find(t => t.id == transferForm.value.feed_type_id);
                    if (!ft) { showToast('Loại cám không tồn tại', 'error'); return; }
                    product_id = ft.product_id || 1;
                    if (transferForm.value.feed_kg_per_bag) qty = qty * transferForm.value.feed_kg_per_bag;
                } else if (detailWh.value.warehouse_type === 'medication') {
                    const med = medications.value.find(m => m.id == transferForm.value.medication_id);
                    if (!med) { showToast('Thuốc không tồn tại', 'error'); return; }
                    if (!med.product_id) { showToast('Thuốc chưa có product mapping', 'error'); return; }
                    product_id = med.product_id;
                } else { return; }

                // Validate tồn trước khi gọi
                const currentStock = getCurrentStock(product_id);
                if (currentStock < qty) {
                    showToast(`Không đủ tồn để chuyển (hiện có: ${fmtNum(currentStock, 1)})`, 'error');
                    return;
                }

                // Gọi 1 API duy nhất — atomic ở backend
                await API.inventory.transfer({
                    from_warehouse_id: props.warehouseId,
                    to_warehouse_id: transferForm.value.target_warehouse_id,
                    product_id, quantity: qty,
                    notes: transferForm.value.note || 'Chuyển kho',
                });
                const targetName = otherWarehouses.value.find(w => w.id == transferForm.value.target_warehouse_id)?.name || 'kho đích';
                showToast(`Đã chuyển sang ${targetName}`, 'success');
                resetForm('transfer');
                await Promise.all([loadStock(), loadTransactions()]);
            } catch(e) { showToast('Lỗi: ' + e.message, 'error'); }
        }

        function resetForm(name) {
            if (name === 'import') {
                importForm.value = { feed_type_id: '', medication_id: '', quantity: 0, note: '', feed_kg_per_bag: null, supplier: '', unit: '', unit_size: '', unit_size_type: 'ml', total_price: null };
            } else if (name === 'export') {
                exportForm.value = { feed_type_id: '', medication_id: '', quantity: 0, note: '', feed_kg_per_bag: null, unit: '', export_type: '' };
            } else if (name === 'transfer') {
                transferForm.value = { feed_type_id: '', medication_id: '', quantity: 0, note: '', feed_kg_per_bag: null, target_warehouse_id: '' };
            }
        }

        // ── Alert rules ──
        function openAlertRuleForm(r) {
            if (r) {
                alertRuleForm.value = { ...r, warehouse_id: props.warehouseId };
            } else {
                alertRuleForm.value = { warehouse_id: props.warehouseId, product_id: '', alert_type: 'low_stock', threshold: null, frequency_minutes: 60, severity: 'warning', enabled: true, note: '' };
            }
            showAlertRuleModal.value = true;
        }
        async function saveAlertRule() {
            try {
                const d = { ...alertRuleForm.value };
                if (d.id) {
                    await API.inventory.updateAlertRule(d.id, d);
                } else {
                    await API.inventory.createAlertRule(d);
                }
                showAlertRuleModal.value = false;
                showToast('Đã lưu');
                await loadAlertRules();
            } catch(e) { showToast('Lỗi: ' + e.message, 'error'); }
        }
        async function toggleAlertRule(r) {
            try {
                await API.inventory.toggleAlertRule(r.id, !r.enabled);
                showToast(r.enabled ? 'Đã tắt' : 'Đã bật');
                await loadAlertRules();
            } catch(e) { showToast('Lỗi: ' + e.message, 'error'); }
        }
        async function deleteAlertRule(r) {
            if (!confirm('Xóa quy tắc này?')) return;
            try {
                await API.inventory.deleteAlertRule(r.id);
                showToast('Đã xóa');
                await loadAlertRules();
            } catch(e) { showToast('Lỗi: ' + e.message, 'error'); }
        }

        // ── Table helpers ──
        function rowClass(s) {
            if (!s.min_stock_alert) return '';
            if (s.quantity <= s.min_stock_alert) return 'low-stock';
            if (s.quantity <= s.min_stock_alert * 1.5) return 'warn-stock';
            return '';
        }
        function qtyClass(s) {
            if (!s.min_stock_alert) return 'text-gray-700';
            if (s.quantity <= s.min_stock_alert) return 'text-red-600';
            if (s.quantity <= s.min_stock_alert * 1.5) return 'text-yellow-600';
            return 'text-green-600';
        }
        function fmtStockQty(s) {
            if (detailWh.value?.warehouse_type === 'feed') {
                return fmtNum(s.quantity / (feedBrands.value[0]?.kg_per_bag || 25), 2) + ' bao';
            }
            return fmtNum(s.quantity, 2);
        }
        function statusPillCls(s) {
            if (!s.min_stock_alert) return 'ok';
            if (s.quantity <= s.min_stock_alert) return 'low';
            if (s.quantity <= s.min_stock_alert * 1.5) return 'warn';
            return 'ok';
        }
        function statusPillText(s) {
            if (!s.min_stock_alert) return 'Bình thường';
            if (s.quantity <= s.min_stock_alert) return 'Dưới tối thiểu';
            if (s.quantity <= s.min_stock_alert * 1.5) return 'Gần tối thiểu';
            return 'Bình thường';
        }

        // ── Tab helpers ──
        function tabClass(name) {
            const base = 'px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap';
            if (whHistoryTab.value === name) {
                if (name === 'imports') return `${base} border-green-600 text-green-700`;
                if (name === 'exports') return `${base} border-red-600 text-red-700`;
                if (name === 'transfers') return `${base} border-blue-600 text-blue-700`;
                if (name === 'alerts') return `${base} border-yellow-600 text-yellow-700`;
            }
            return `${base} border-transparent text-gray-500 hover:text-gray-700`;
        }
        function exportTypeLabel(t) {
            return { ban: 'Bán hàng', het_han: 'Hết hạn', dung: 'Nội bộ' }[t] || t || '-';
        }

        // ── Delete transaction ──
        async function deleteTransaction(t) {
            if (!confirm('Xóa giao dịch này? Số lượng sẽ được trả về kho.')) return;
            try {
                await API.inventory.deleteTransaction(t.id);
                showToast('Đã xóa giao dịch');
                await Promise.all([loadStock(), loadTransactions()]);
            } catch(e) { showToast('Lỗi: ' + e.message, 'error'); }
        }

        // Watch route change
        watch(() => props.warehouseId, () => {
            whHistoryTab.value = 'imports';
            loadWarehouse();
        });

        onMounted(() => loadWarehouse());

        return {
            detailWh, whHistoryTab, detailWhStock,
            feedTypes, feedBrands, medications, suppliers, products, alertRules,
            loadingStock, otherWarehouses,
            showAlertRuleModal, alertRuleForm,
            importForm, exportForm, transferForm,
            unitOptions, sizeUnitOptions,
            currentImportStockBadge, currentExportStockBadge, currentTransferStockBadge,
            canImport, canExport, canTransfer, canTransferAtAll,
            transferRows, filterByType,
            onFeedTypeChange, onMedicationSelect,
            autoFillExportQty, autoFillTransferQty,
            doDetailImport, doDetailExport, doDetailTransfer,
            openAlertRuleForm, saveAlertRule, toggleAlertRule, deleteAlertRule,
            deleteTransaction, resetForm,
            tabClass, rowClass, qtyClass, fmtStockQty, statusPillCls, statusPillText, exportTypeLabel,
            fmtNum, fmtDate,
        };
    }
};

export default component;
