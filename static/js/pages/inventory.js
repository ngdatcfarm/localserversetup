const { ref, computed, onMounted, watch } = Vue;

const component = {
    template: `
    <div>
        <div class="page-header">
            <h2 class="page-title">Quan ly kho</h2>
            <div class="flex gap-2">
                <button class="btn btn-sm" :class="alertsPanelOpen ? 'btn-danger' : 'btn-secondary'" @click="alertsPanelOpen = !alertsPanelOpen">
                    <span v-if="activeAlertCount > 0" class="badge badge-red animate-pulse">{{ activeAlertCount }}</span>
                    Canh bao ton kho
                </button>
            </div>
        </div>

        <!-- Low Stock Alerts Panel -->
        <div v-if="alertsPanelOpen" class="card mb-4 border-l-4 border-red-500">
            <div class="flex justify-between items-center mb-3">
                <h3 class="font-semibold text-red-700">Canh bao ton kho thap</h3>
                <div class="flex gap-2">
                    <button class="btn btn-sm btn-secondary" @click="checkAlerts">Kiem tra lai</button>
                    <button class="btn btn-sm btn-ghost" @click="alertsPanelOpen = false">Dong</button>
                </div>
            </div>
            <div v-if="alerts.length" class="space-y-2">
                <div v-for="a in alerts" :key="a.id" class="flex items-center justify-between p-2 rounded" :class="a.severity === 'critical' ? 'bg-red-50' : 'bg-yellow-50'">
                    <div>
                        <span class="font-medium">{{ a.product_name }}</span>
                        <span class="text-sm text-gray-600 ml-2">- {{ a.warehouse_name }}</span>
                        <span class="text-sm text-gray-500 ml-2">({{ fmtNum(a.quantity) }}/{{ fmtNum(a.threshold_value) }})</span>
                    </div>
                    <div class="flex gap-2">
                        <span class="badge" :class="a.severity === 'critical' ? 'badge-red' : 'badge-yellow'">
                            {{ a.alert_type }}
                        </span>
                        <button class="btn btn-xs btn-secondary" @click="ackAlert(a)">Dong y</button>
                    </div>
                </div>
            </div>
            <div v-else class="text-gray-500 text-sm">Khong co canh bao nao</div>
        </div>

        <div class="tabs mb-4">
            <div class="tab" :class="{active: tab==='warehouses'}" @click="tab='warehouses'">Kho</div>
            <div class="tab" :class="{active: tab==='barn-assignment'}" @click="tab='barn-assignment'">Gán kho mac dinh</div>
            <div class="tab" :class="{active: tab==='products'}" @click="tab='products'">San pham</div>
            <div class="tab" :class="{active: tab==='stock'}" @click="tab='stock'">Ton kho</div>
            <div class="tab" :class="{active: tab==='actions'}" @click="tab='actions'">Nhap/Xuat/Chuyen</div>
            <div class="tab" :class="{active: tab==='alerts'}" @click="tab='alerts'">
                Canh bao
                <span v-if="activeAlertCount > 0" class="badge badge-red ml-1">{{ activeAlertCount }}</span>
            </div>
        </div>

        <!-- Warehouses -->
        <div v-if="tab==='warehouses'">
            <div class="mb-3 flex gap-2">
                <button class="btn btn-primary btn-sm" @click="openWhForm()">+ Them kho</button>
                <select v-model="filterType" class="border rounded px-2 py-1 text-sm">
                    <option value="">Tat ca loai</option>
                    <option value="feed">Cam</option>
                    <option value="medication">Thuoc</option>
                    <option value="mixed">Hop nhat</option>
                </select>
            </div>
            <div v-if="filteredWarehouses.length" class="table-wrap">
                <table>
                    <thead><tr><th>Tên kho</th><th>Loai</th><th>Loai kho</th><th>Chuong</th><th>Trang thai</th><th>Thao tac</th></tr></thead>
                    <tbody>
                        <tr v-for="w in filteredWarehouses" :key="w.id" class="cursor-pointer" @click="openWhDetail(w)">
                            <td class="font-medium">{{ w.name }}</td>
                            <td>
                                <span v-if="w.warehouse_type === 'feed'" class="badge badge-yellow">Cam</span>
                                <span v-else-if="w.warehouse_type === 'medication'" class="badge badge-blue">Thuoc</span>
                                <span v-else class="badge badge-gray">Hop nhat</span>
                            </td>
                            <td>
                                <span v-if="w.is_central" class="badge badge-purple">Trung tam</span>
                                <span v-else class="badge badge-gray">Chuong</span>
                            </td>
                            <td>{{ w.barn_id || '-' }}</td>
                            <td>
                                <span v-if="w.active !== false" class="badge badge-green">Hoat dong</span>
                                <span v-else class="badge badge-red">Khong hoat dong</span>
                            </td>
                            <td class="flex gap-1" @click.stop>
                                <button class="btn btn-secondary btn-sm" @click="openWhForm(w)">Sua</button>
                                <button class="btn btn-danger btn-sm" @click="removeWh(w)">Xoa</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="empty-state"><div class="icon">📦</div><p>Chua co kho</p></div>
        </div>

        <!-- Barn Default Warehouse Assignment -->
        <div v-if="tab==='barn-assignment'">
            <p class="text-sm text-gray-600 mb-4">Gan kho mac dinh cho tung chuong. Kho mac dinh se tu dong duoc su dung khi ghi nhan thuc an/thuoc.</p>
            <div class="mb-3 flex gap-2 items-center">
                <select v-model="selectedBarn" class="border rounded px-3 py-1.5 text-sm flex-1">
                    <option value="">-- Chon chuong --</option>
                    <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }} ({{ b.farm_id }})</option>
                </select>
                <button v-if="selectedBarn" class="btn btn-sm btn-secondary" @click="loadSuggestedWarehouses">Tai kho duc nghi</button>
            </div>

            <div v-if="selectedBarn && suggestedWh" class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div class="card border-l-4 border-yellow-500">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="font-semibold text-yellow-700">Kho cam mac dinh</h4>
                        <button v-if="suggestedWh.feed_warehouse" class="btn btn-xs btn-secondary" @click="removeDefaultWh(selectedBarn, 'feed')">Go bo</button>
                    </div>
                    <div v-if="suggestedWh.feed_warehouse">
                        <div class="font-medium">{{ suggestedWh.feed_warehouse.name }}</div>
                        <div class="text-sm text-gray-500">{{ suggestedWh.feed_warehouse.code }}</div>
                        <div class="mt-2 text-sm">
                            <span class="text-green-600">Tong ton: {{ fmtNum(suggestedWh.feed_warehouse.total_quantity) }} kg</span>
                            <span v-if="suggestedWh.feed_warehouse.low_stock_items > 0" class="text-red-600 ml-2">
                                {{ suggestedWh.feed_warehouse.low_stock_items }} mon duoi muc toi thieu
                            </span>
                        </div>
                        <button class="btn btn-sm btn-primary mt-2" @click="openSetDefaultWh('feed', suggestedWh.feed_warehouse.id)">Doi kho</button>
                    </div>
                    <div v-else>
                        <p class="text-gray-500 text-sm">Chua co kho cam mac dinh</p>
                        <button class="btn btn-sm btn-primary mt-2" @click="openSetDefaultWh('feed')">+ Gan kho cam</button>
                    </div>
                </div>
                <div class="card border-l-4 border-blue-500">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="font-semibold text-blue-700">Kho thuoc mac dinh</h4>
                        <button v-if="suggestedWh.medication_warehouse" class="btn btn-xs btn-secondary" @click="removeDefaultWh(selectedBarn, 'medication')">Go bo</button>
                    </div>
                    <div v-if="suggestedWh.medication_warehouse">
                        <div class="font-medium">{{ suggestedWh.medication_warehouse.name }}</div>
                        <div class="text-sm text-gray-500">{{ suggestedWh.medication_warehouse.code }}</div>
                        <div class="mt-2 text-sm">
                            <span class="text-green-600">Tong ton: {{ fmtNum(suggestedWh.medication_warehouse.total_quantity) }}</span>
                            <span v-if="suggestedWh.medication_warehouse.low_stock_items > 0" class="text-red-600 ml-2">
                                {{ suggestedWh.medication_warehouse.low_stock_items }} mon duoi muc toi thieu
                            </span>
                        </div>
                        <button class="btn btn-sm btn-primary mt-2" @click="openSetDefaultWh('medication', suggestedWh.medication_warehouse.id)">Doi kho</button>
                    </div>
                    <div v-else>
                        <p class="text-gray-500 text-sm">Chua co kho thuoc mac dinh</p>
                        <button class="btn btn-sm btn-primary mt-2" @click="openSetDefaultWh('medication')">+ Gan kho thuoc</button>
                    </div>
                </div>
            </div>
            <div v-else-if="selectedBarn" class="empty-state"><p>Chon kho de gan</p></div>
            <div v-else class="empty-state"><p>Vui long chon mot chuong</p></div>
        </div>

        <!-- Products -->
        <div v-if="tab==='products'">
            <div class="mb-3"><button class="btn btn-primary btn-sm" @click="openProdForm()">+ Them san pham</button></div>
            <div v-if="products.length" class="table-wrap">
                <table>
                    <thead><tr><th>Tên</th><th>Loai</th><th>Don vi</th><th>Muc toi thieu</th><th>Thao tac</th></tr></thead>
                    <tbody>
                        <tr v-for="p in products" :key="p.id">
                            <td class="font-medium">{{ p.name }}</td>
                            <td>
                                <span v-if="p.product_type === 'feed'" class="badge badge-yellow">Cam</span>
                                <span v-else-if="p.product_type === 'medication' || p.product_type === 'medicine'" class="badge badge-blue">Thuoc</span>
                                <span v-else class="badge badge-gray">{{ p.product_type }}</span>
                            </td>
                            <td>{{ p.unit }}</td>
                            <td>
                                <span v-if="p.min_stock_alert" :class="p.min_stock_alert > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'">
                                    {{ fmtNum(p.min_stock_alert) }}
                                </span>
                                <span v-else class="text-gray-400">-</span>
                            </td>
                            <td class="flex gap-1">
                                <button class="btn btn-secondary btn-sm" @click="openProdForm(p)">Sua</button>
                                <button class="btn btn-danger btn-sm" @click="removeProd(p)">Xoa</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="empty-state"><p>Chua co san pham</p></div>
        </div>

        <!-- Stock -->
        <div v-if="tab==='stock'">
            <div class="mb-3 flex gap-2 items-center">
                <select v-model="selectedStockBarn" @change="onStockBarnChange" class="border rounded px-3 py-1.5 text-sm flex-1">
                    <option value="">-- Kho trung tam --</option>
                    <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
                <select v-model="selectedWh" @change="loadStock" class="border rounded px-3 py-1.5 text-sm flex-1">
                    <option value="">-- Chon kho --</option>
                    <option v-for="w in stockWarehouseOptions" :key="w.id" :value="w.id">{{ w.name }} ({{ w.warehouse_type }})</option>
                </select>
                <button v-if="selectedWh" class="btn btn-sm btn-secondary" @click="loadTransactions">Lich su</button>
            </div>
            <div v-if="stock.length" class="table-wrap">
                <table>
                    <thead><tr><th>San pham</th><th>Don vi</th><th>Ton kho</th><th>Muc toi thieu</th><th>Tinh trang</th></tr></thead>
                    <tbody>
                        <tr v-for="s in stock" :key="s.product_id" :class="s.min_stock_alert && s.quantity <= s.min_stock_alert ? 'bg-red-50' : ''">
                            <td>{{ s.product_name || s.product_id }}</td>
                            <td>{{ s.unit || '-' }}</td>
                            <td class="font-semibold" :class="s.min_stock_alert && s.quantity <= s.min_stock_alert ? 'text-red-600' : ''">
                                {{ fmtNum(s.quantity, 2) }}
                            </td>
                            <td>{{ s.min_stock_alert ? fmtNum(s.min_stock_alert) : '-' }}</td>
                            <td>
                                <span v-if="s.min_stock_alert && s.quantity <= s.min_stock_alert" class="badge badge-red">Duoi toi thieu</span>
                                <span v-else-if="s.min_stock_alert && s.quantity <= s.min_stock_alert * 1.5" class="badge badge-yellow">Gan toi thieu</span>
                                <span v-else class="badge badge-green">Binh thuong</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else-if="selectedWh" class="empty-state"><p>Kho trong</p></div>
        </div>

        <!-- Import/Export/Transfer -->
        <div v-if="tab==='actions'" class="space-y-4">
            <div class="flex gap-2 items-center">
                <select v-model="selectedStockBarn" class="border rounded px-3 py-1.5 text-sm flex-1">
                    <option value="">-- Kho trung tam --</option>
                    <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
                <span class="text-sm text-gray-500">Chon barn de loc kho tu dong</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="card">
                    <h3 class="font-semibold mb-3 text-green-700">Nhap kho</h3>
                    <div class="form-group"><label>Kho</label><select v-model="importForm.warehouse_id"><option value="">--</option><option v-for="w in stockWarehouseOptions" :key="w.id" :value="w.id">{{ w.name }}</option></select></div>
                    <div class="form-group"><label>San pham</label><select v-model="importForm.product_id"><option value="">--</option><option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
                    <div class="form-group"><label>So luong</label><input v-model.number="importForm.quantity" type="number" step="0.1"></div>
                    <div class="form-group"><label>Ghi chu</label><input v-model="importForm.note"></div>
                    <button class="btn btn-primary w-full" @click="doImport">Nhap kho</button>
                </div>
                <div class="card">
                    <h3 class="font-semibold mb-3 text-red-700">Xuat kho</h3>
                    <div class="form-group"><label>Kho</label><select v-model="exportForm.warehouse_id"><option value="">--</option><option v-for="w in stockWarehouseOptions" :key="w.id" :value="w.id">{{ w.name }}</option></select></div>
                    <div class="form-group"><label>San pham</label><select v-model="exportForm.product_id"><option value="">--</option><option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
                    <div class="form-group"><label>So luong</label><input v-model.number="exportForm.quantity" type="number" step="0.1"></div>
                    <div class="form-group"><label>Ghi chu</label><input v-model="exportForm.note"></div>
                    <button class="btn btn-danger w-full" @click="doExport">Xuat kho</button>
                </div>
                <div class="card">
                    <h3 class="font-semibold mb-3 text-blue-700">Chuyen kho</h3>
                    <div class="form-group"><label>Tu kho</label><select v-model="transferForm.from_warehouse_id"><option value="">--</option><option v-for="w in stockWarehouseOptions" :key="w.id" :value="w.id">{{ w.name }}</option></select></div>
                    <div class="form-group"><label>Den kho</label><select v-model="transferForm.to_warehouse_id"><option value="">--</option><option v-for="w in stockWarehouseOptions" :key="w.id" :value="w.id">{{ w.name }}</option></select></div>
                    <div class="form-group"><label>San pham</label><select v-model="transferForm.product_id"><option value="">--</option><option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
                    <div class="form-group"><label>So luong</label><input v-model.number="transferForm.quantity" type="number" step="0.1"></div>
                    <button class="btn btn-primary w-full" @click="doTransfer">Chuyen kho</button>
                </div>
            </div>
        </div>

        <!-- Alerts Tab -->
        <div v-if="tab==='alerts'" class="space-y-4">
            <!-- Active Alerts Panel -->
            <div class="card border-l-4 border-red-500">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-semibold text-red-700">Canh bao hien tai</h3>
                    <div class="flex gap-2">
                        <button class="btn btn-sm btn-secondary" @click="checkAlerts">Kiem tra lai</button>
                    </div>
                </div>
                <div v-if="alerts.length" class="space-y-2">
                    <div v-for="a in alerts" :key="a.id" class="flex items-center justify-between p-3 rounded" :class="a.severity === 'critical' ? 'bg-red-50' : 'bg-yellow-50'">
                        <div>
                            <span class="font-medium">{{ a.product_name }}</span>
                            <span class="text-sm text-gray-600 ml-2">- {{ a.warehouse_name }}</span>
                            <span class="text-sm text-gray-500 ml-2">({{ fmtNum(a.current_quantity) }}/{{ fmtNum(a.threshold_value) }})</span>
                            <div class="text-sm text-gray-500 mt-1">{{ a.message }}</div>
                        </div>
                        <div class="flex gap-2 items-center">
                            <span class="badge" :class="a.severity === 'critical' ? 'badge-red' : 'badge-yellow'">
                                {{ a.alert_type }}
                            </span>
                            <button class="btn btn-xs btn-secondary" @click="ackAlert(a)">Dong y</button>
                            <button class="btn btn-xs btn-danger" @click="delAlert(a)">Xoa</button>
                        </div>
                    </div>
                </div>
                <div v-else class="text-gray-500 text-sm py-4 text-center">Khong co canh bao nao</div>
            </div>

            <!-- Alert Rules Section -->
            <div class="card">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-semibold">Quy tac canh bao</h3>
                    <button class="btn btn-primary btn-sm" @click="openAlertRuleForm()">+ Them quy tac</button>
                </div>
                <p class="text-sm text-gray-600 mb-4">Quy tac giup tuy chinh nguong va tan suat canh bao cho tung kho/san pham cu the.</p>

                <div v-if="alertRules.length" class="table-wrap">
                    <table>
                        <thead><tr><th>Kho</th><th>San pham</th><th>Loai</th><th>Nguong</th><th>Tan suat</th><th>Trang thai</th><th>Thao tac</th></tr></thead>
                        <tbody>
                            <tr v-for="r in alertRules" :key="r.id" :class="r.enabled ? '' : 'opacity-50'">
                                <td>{{ r.warehouse_name || 'Tat ca' }}</td>
                                <td>{{ r.product_name || 'Tat ca' }}</td>
                                <td>
                                    <span v-if="r.alert_type === 'low_stock'" class="badge badge-yellow">Ton thap</span>
                                    <span v-else-if="r.alert_type === 'out_of_stock'" class="badge badge-red">Het hang</span>
                                    <span v-else class="badge badge-gray">{{ r.alert_type }}</span>
                                </td>
                                <td>{{ r.threshold ? fmtNum(r.threshold) : '(mac dinh)' }}</td>
                                <td>{{ r.frequency_minutes ? r.frequency_minutes + ' phut' : 'thu cong' }}</td>
                                <td>
                                    <span v-if="r.enabled" class="badge badge-green">Bat</span>
                                    <span v-else class="badge badge-gray">Tat</span>
                                </td>
                                <td class="flex gap-1">
                                    <button class="btn btn-xs btn-secondary" @click="toggleAlertRule(r)">{{ r.enabled ? 'Tat' : 'Bat' }}</button>
                                    <button class="btn btn-xs btn-secondary" @click="openAlertRuleForm(r)">Sua</button>
                                    <button class="btn btn-xs btn-danger" @click="deleteAlertRule(r)">Xoa</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="text-gray-500 text-sm py-4 text-center">Chua co quy tac nao</div>
            </div>
        </div>

        <!-- Warehouse Detail Modal -->
        <div v-if="showWhDetail" class="modal-overlay" @click.self="showWhDetail=false">
            <div class="modal modal-lg">
                <div class="flex justify-between items-center mb-4">
                    <h3>{{ whDetail.name }}</h3>
                    <button class="btn btn-ghost btn-sm" @click="showWhDetail=false">Dong</button>
                </div>
                <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
                    <div><span class="text-gray-500">Ma kho:</span> {{ whDetail.code }}</div>
                    <div><span class="text-gray-500">Loai:</span> {{ whDetail.warehouse_type }}</div>
                    <div><span class="text-gray-500">Loai kho:</span> {{ whDetail.is_central ? 'Trung tam' : 'Chuong' }}</div>
                    <div><span class="text-gray-500">Trang thai:</span> {{ whDetail.active !== false ? 'Hoat dong' : 'Khong hoat dong' }}</div>
                    <div><span class="text-gray-500">Chuong:</span> {{ whDetail.barn_id || '-' }}</div>
                    <div><span class="text-gray-500">Farm:</span> {{ whDetail.farm_id }}</div>
                    <div v-if="whDetail.address"><span class="text-gray-500">Dia chi:</span> {{ whDetail.address }}</div>
                    <div v-if="whDetail.capacity_kg"><span class="text-gray-500">Dung tich:</span> {{ whDetail.capacity_kg }} kg</div>
                </div>

                <h4 class="font-semibold mb-2">Ton kho hien tai</h4>
                <div v-if="whDetailStock.length" class="table-wrap mb-4">
                    <table>
                        <thead><tr><th>San pham</th><th>Don vi</th><th>So luong</th><th>Duoi muc toi thieu?</th></tr></thead>
                        <tbody>
                            <tr v-for="s in whDetailStock" :key="s.product_id" :class="s.min_stock_alert && s.quantity <= s.min_stock_alert ? 'bg-red-50' : ''">
                                <td>{{ s.product_name }}</td>
                                <td>{{ s.unit }}</td>
                                <td class="font-semibold">{{ fmtNum(s.quantity, 2) }}</td>
                                <td>
                                    <span v-if="s.min_stock_alert && s.quantity <= s.min_stock_alert" class="badge badge-red">Duoi</span>
                                    <span v-else class="text-green-600 text-sm">OK</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="text-gray-500 text-sm mb-4">Kho trong</div>

                <div v-if="whDetailZones.length">
                    <h4 class="font-semibold mb-2">Cac vung kho</h4>
                    <div class="flex flex-wrap gap-2">
                        <span v-for="z in whDetailZones" :key="z.id" class="badge badge-gray">{{ z.name }} ({{ z.zone_type }})</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Warehouse Form Modal -->
        <div v-if="showWhModal" class="modal-overlay" @click.self="showWhModal=false">
            <div class="modal">
                <h3>{{ whForm.id ? 'Sua kho' : 'Them kho' }}</h3>
                <div class="form-group"><label>Ma kho</label><input v-model="whForm.code" placeholder="VD: WH-FEED-01"></div>
                <div class="form-group"><label>Ten kho</label><input v-model="whForm.name" placeholder="VD: Kho cam trung tam"></div>
                <div class="form-group"><label>Loai</label>
                    <select v-model="whForm.warehouse_type">
                        <option value="feed">Cam</option>
                        <option value="medication">Thuoc</option>
                        <option value="mixed">Hop nhat</option>
                        <option value="equipment">Thiet bi</option>
                        <option value="consumable">Tieu hao</option>
                    </select>
                </div>
                <div class="form-group"><label>Chuong (neu la kho chuong)</label>
                    <select v-model="whForm.barn_id" class="border rounded w-full px-2 py-1">
                        <option value="">-- Kho trung tam --</option>
                        <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }} ({{ b.id }})</option>
                    </select>
                </div>
                <div class="form-group"><label>Farm</label><input v-model="whForm.farm_id" placeholder="farm-01"></div>
                <div class="form-group"><label>Dia chi</label><input v-model="whForm.address" placeholder="Dia diem kho"></div>
                <div class="form-group">
                    <label class="flex items-center gap-2">
                        <input type="checkbox" v-model="whForm.active" class="rounded">
                        Hoat dong
                    </label>
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-secondary" @click="showWhModal=false">Huy</button>
                    <button class="btn btn-primary" @click="saveWh">Luu</button>
                </div>
            </div>
        </div>

        <!-- Product Modal -->
        <div v-if="showProdModal" class="modal-overlay" @click.self="showProdModal=false">
            <div class="modal">
                <h3>{{ prodForm.id ? 'Sua san pham' : 'Them san pham' }}</h3>
                <div class="form-group"><label>Ma san pham</label><input v-model="prodForm.code" placeholder="VD: FEED-001"></div>
                <div class="form-group"><label>Ten</label><input v-model="prodForm.name" placeholder="VD: Cam ga con C01"></div>
                <div class="form-group"><label>Loai</label>
                    <select v-model="prodForm.product_type">
                        <option value="feed">Cam</option>
                        <option value="medication">Thuoc</option>
                        <option value="medicine">Thuoc (chinh)</option>
                        <option value="equipment">Thiet bi</option>
                        <option value="consumable">Tieu hao</option>
                    </select>
                </div>
                <div class="form-group"><label>Don vi</label><input v-model="prodForm.unit" placeholder="VD: kg, lo, vien"></div>
                <div class="form-group"><label>Muc toi thieu (thap hon se canh bao)</label><input v-model.number="prodForm.min_stock_alert" type="number" step="0.1" placeholder="VD: 100"></div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-secondary" @click="showProdModal=false">Huy</button>
                    <button class="btn btn-primary" @click="saveProd">Luu</button>
                </div>
            </div>
        </div>

        <!-- Set Default Warehouse Modal -->
        <div v-if="showSetDefaultWhModal" class="modal-overlay" @click.self="showSetDefaultWhModal=false">
            <div class="modal">
                <h3>Gan kho {{ setDefaultWhType === 'feed' ? 'cam' : 'thuoc' }} mac dinh</h3>
                <div class="form-group"><label>Chon kho</label>
                    <select v-model="setDefaultWhId">
                        <option value="">-- Chon kho --</option>
                        <option v-for="w in whForType" :key="w.id" :value="w.id">{{ w.name }} ({{ w.code }})</option>
                    </select>
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-secondary" @click="showSetDefaultWhModal=false">Huy</button>
                    <button class="btn btn-primary" @click="saveDefaultWh">Luu</button>
                </div>
            </div>
        </div>

        <!-- Alert Rule Form Modal -->
        <div v-if="showAlertRuleModal" class="modal-overlay" @click.self="showAlertRuleModal=false">
            <div class="modal">
                <h3>{{ alertRuleForm.id ? 'Sua quy tac' : 'Them quy tac canh bao' }}</h3>
                <div class="form-group">
                    <label>Kho *</label>
                    <select v-model="alertRuleForm.warehouse_id" class="border rounded w-full px-2 py-1">
                        <option value="">-- Chon kho --</option>
                        <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>San pham *</label>
                    <select v-model="alertRuleForm.product_id" class="border rounded w-full px-2 py-1">
                        <option value="">-- Chon san pham --</option>
                        <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Loai canh bao *</label>
                    <select v-model="alertRuleForm.alert_type" class="border rounded w-full px-2 py-1">
                        <option value="low_stock">Ton kho thap</option>
                        <option value="out_of_stock">Het hang</option>
                        <option value="overstock">Qua nhieu</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Nguong (bo trong = dung nguong mac dinh cua san pham)</label>
                    <input v-model.number="alertRuleForm.threshold" type="number" step="0.1" placeholder="VD: 100" class="border rounded w-full px-2 py-1">
                </div>
                <div class="form-group">
                    <label>Tan suat kiem tra (phut, 0 hoac de trong = thu cong)</label>
                    <input v-model.number="alertRuleForm.frequency_minutes" type="number" step="5" min="0" placeholder="60" class="border rounded w-full px-2 py-1">
                </div>
                <div class="form-group">
                    <label>Muc do</label>
                    <select v-model="alertRuleForm.severity" class="border rounded w-full px-2 py-1">
                        <option value="info">Thong tin</option>
                        <option value="warning">Canh chu y</option>
                        <option value="critical">Nguy hiem</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="flex items-center gap-2">
                        <input type="checkbox" v-model="alertRuleForm.enabled" class="rounded">
                        Bat hien tai
                    </label>
                </div>
                <div class="form-group">
                    <label>Ghi chu</label>
                    <input v-model="alertRuleForm.note" placeholder="Ghi chu them..." class="border rounded w-full px-2 py-1">
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-secondary" @click="showAlertRuleModal=false">Huy</button>
                    <button class="btn btn-primary" @click="saveAlertRule">Luu</button>
                </div>
            </div>
        </div>

        <!-- Transactions Modal -->
        <div v-if="showTxModal" class="modal-overlay" @click.self="showTxModal=false">
            <div class="modal modal-lg">
                <h3>Lich su kho - {{ selectedWhName }}</h3>
                <div v-if="transactions.length" class="table-wrap max-h-96 overflow-y-auto">
                    <table>
                        <thead><tr><th>Thoi gian</th><th>San pham</th><th>Loai</th><th>So luong</th><th>Ghi chu</th></tr></thead>
                        <tbody>
                            <tr v-for="t in transactions" :key="t.id">
                                <td class="text-sm">{{ fmtDate(t.created_at) }}</td>
                                <td>{{ t.product_name }}</td>
                                <td>
                                    <span v-if="t.transaction_type === 'import'" class="badge badge-green">Nhap</span>
                                    <span v-else-if="t.transaction_type === 'export'" class="badge badge-red">Xuat</span>
                                    <span v-else class="badge badge-gray">{{ t.transaction_type }}</span>
                                </td>
                                <td :class="t.quantity > 0 ? 'text-green-600' : 'text-red-600'">{{ fmtNum(t.quantity) }}</td>
                                <td class="text-sm text-gray-500">{{ t.notes || '-' }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="text-gray-500 text-sm">Khong co lich su</div>
                <div class="flex justify-end mt-4">
                    <button class="btn btn-secondary" @click="showTxModal=false">Dong</button>
                </div>
            </div>
        </div>
    </div>`,

    setup() {
        const warehouses = ref([]);
        const products = ref([]);
        const barns = ref([]);
        const stock = ref([]);
        const alerts = ref([]);
        const transactions = ref([]);
        const tab = ref('warehouses');
        const filterType = ref('');
        const selectedWh = ref('');
        const selectedWhName = ref('');
        const selectedBarn = ref('');
        const selectedStockBarn = ref('');
        const suggestedWh = ref(null);
        const showWhModal = ref(false);
        const showProdModal = ref(false);
        const showWhDetail = ref(false);
        const showSetDefaultWhModal = ref(false);
        const showTxModal = ref(false);
        const whDetail = ref({});
        const whDetailStock = ref([]);
        const whDetailZones = ref([]);
        const whForm = ref({});
        const prodForm = ref({});
        const alertsPanelOpen = ref(false);
        const setDefaultWhType = ref('');
        const setDefaultWhId = ref('');
        const importForm = ref({ warehouse_id: '', product_id: '', quantity: 0, note: '' });
        const exportForm = ref({ warehouse_id: '', product_id: '', quantity: 0, note: '' });
        const transferForm = ref({ from_warehouse_id: '', to_warehouse_id: '', product_id: '', quantity: 0 });
        // Alert Rules state
        const alertRules = ref([]);
        const showAlertRuleModal = ref(false);
        const alertRuleForm = ref({
            warehouse_id: '', product_id: '', alert_type: 'low_stock',
            threshold: null, frequency_minutes: 60, severity: 'warning', enabled: true, note: ''
        });

        const filteredWarehouses = computed(() => {
            if (!filterType.value) return warehouses.value;
            return warehouses.value.filter(w => w.warehouse_type === filterType.value);
        });

        const whForType = computed(() => {
            return warehouses.value.filter(w => {
                if (setDefaultWhType.value === 'feed') {
                    return w.warehouse_type === 'feed' || w.warehouse_type === 'mixed';
                } else {
                    return w.warehouse_type === 'medication' || w.warehouse_type === 'mixed';
                }
            });
        });

        const stockWarehouseOptions = computed(() => {
            if (!selectedStockBarn.value) {
                // No barn selected - show only central warehouses
                return warehouses.value.filter(w => w.is_central && w.active !== false);
            }
            // Barn selected - show barn-level warehouses + central warehouses
            return warehouses.value.filter(w => (w.barn_id === selectedStockBarn.value || w.is_central) && w.active !== false);
        });

        const activeAlertCount = computed(() => alerts.value.length);

        // Reload alert rules when switching to alerts tab
        watch(() => tab.value, (newTab) => {
            if (newTab === 'alerts') loadAlertRules();
        });

        async function load() {
            try {
                [warehouses.value, products.value, barns.value] = await Promise.all([
                    API.warehouses.list().catch(() => []),
                    API.products.list().catch(() => []),
                    API.barns.list().catch(() => []),
                ]);
            } catch(e) { console.error('Load error:', e); }
        }

        async function loadStock() {
            if (!selectedWh.value) { stock.value = []; return; }
            try {
                stock.value = await API.inventory.list(selectedWh.value);
                const wh = warehouses.value.find(w => w.id == selectedWh.value);
                selectedWhName.value = wh ? wh.name : '';
            } catch { stock.value = []; }
        }

        async function loadSuggestedWarehouses() {
            if (!selectedBarn.value) return;
            try {
                suggestedWh.value = await API.barns.suggestedWarehouses(selectedBarn.value);
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function onStockBarnChange() {
            selectedWh.value = '';
            stock.value = [];
            // Auto-select default warehouse for this barn if available
            if (selectedStockBarn.value) {
                try {
                    const suggested = await API.barns.suggestedWarehouses(selectedStockBarn.value);
                    if (suggested.feed_warehouse && suggested.feed_warehouse.id) {
                        selectedWh.value = suggested.feed_warehouse.id;
                        await loadStock();
                    }
                } catch(e) { console.error('Auto-select warehouse error:', e); }
            }
        }

        async function loadTransactions() {
            if (!selectedWh.value) return;
            try {
                transactions.value = await API.inventory.transactions(selectedWh.value, 50);
                showTxModal.value = true;
            } catch { transactions.value = []; }
        }

        async function checkAlerts() {
            try {
                const triggered = await API.inventory.checkAlerts();
                alerts.value = triggered;
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function loadAlerts() {
            try {
                alerts.value = await API.inventory.alerts();
            } catch { alerts.value = []; }
        }

        function openWhForm(w) {
            whForm.value = w ? { ...w } : { name: '', code: '', warehouse_type: 'feed', barn_id: '', farm_id: 'farm-01', active: true };
            showWhModal.value = true;
        }

        function openWhDetail(w) {
            whDetail.value = w;
            // Load stock for this warehouse
            whDetailStock.value = [];
            whDetailZones.value = [];
            showWhDetail.value = true;
            // Load stock
            loadWhDetailStock(w.id);
            // Load zones
            loadWhDetailZones(w.id);
        }

        async function loadWhDetailStock(whId) {
            try {
                whDetailStock.value = await API.inventory.list(whId);
            } catch { whDetailStock.value = []; }
        }

        async function loadWhDetailZones(whId) {
            try {
                const zones = await API.get(`/api/farm/warehouse-zones?warehouse_id=${whId}`);
                whDetailZones.value = zones || [];
            } catch { whDetailZones.value = []; }
        }

        function openProdForm(p) {
            prodForm.value = p ? { ...p } : { name: '', code: '', product_type: 'feed', unit: 'kg', min_stock_alert: null };
            showProdModal.value = true;
        }

        function openSetDefaultWh(type, currentId) {
            setDefaultWhType.value = type;
            setDefaultWhId.value = currentId || '';
            showSetDefaultWhModal.value = true;
        }

        async function saveWh() {
            try {
                if (whForm.value.id) await API.warehouses.update(whForm.value.id, whForm.value);
                else await API.warehouses.create(whForm.value);
                showWhModal.value = false;
                showToast('Da luu');
                await load();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function saveProd() {
            try {
                if (prodForm.value.id) await API.products.update(prodForm.value.id, prodForm.value);
                else await API.products.create(prodForm.value);
                showProdModal.value = false;
                showToast('Da luu');
                await load();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function saveDefaultWh() {
            if (!setDefaultWhId.value || !selectedBarn.value) return;
            try {
                await API.barns.setDefaultWarehouse(selectedBarn.value, {
                    warehouse_type: setDefaultWhType.value,
                    warehouse_id: parseInt(setDefaultWhId.value)
                });
                showSetDefaultWhModal.value = false;
                showToast('Da luu');
                await loadSuggestedWarehouses();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function removeDefaultWh(barnId, whType) {
            if (!confirm('Bo gan kho ' + whType + ' mac dinh?')) return;
            try {
                await API.barns.deleteDefaultWarehouse(barnId, whType);
                showToast('Da bo');
                await loadSuggestedWarehouses();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function removeWh(w) { if (!confirm('Xoa kho ' + w.name + '?')) return; try { await API.warehouses.del(w.id); showToast('Da xoa'); await load(); } catch(e) { showToast(e.message, 'error'); } }
        async function removeProd(p) { if (!confirm('Xoa ' + p.name + '?')) return; try { await API.products.del(p.id); showToast('Da xoa'); await load(); } catch(e) { showToast(e.message, 'error'); } }

        async function doImport() {
            try { await API.inventory.import(importForm.value); showToast('Nhap kho thanh cong'); importForm.value = { ...importForm.value, quantity: 0, note: '' }; await loadStock(); }
            catch(e) { showToast(e.message, 'error'); }
        }
        async function doExport() {
            try { await API.inventory.export(exportForm.value); showToast('Xuat kho thanh cong'); exportForm.value = { ...exportForm.value, quantity: 0, note: '' }; await loadStock(); }
            catch(e) { showToast(e.message, 'error'); }
        }
        async function doTransfer() {
            try { await API.inventory.transfer(transferForm.value); showToast('Chuyen kho thanh cong'); transferForm.value = { ...transferForm.value, quantity: 0 }; await loadStock(); }
            catch(e) { showToast(e.message, 'error'); }
        }

        async function ackAlert(a) {
            try {
                await API.inventory.ackAlert(a.id);
                showToast('Da dong y');
                await loadAlerts();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function delAlert(a) {
            if (!confirm('Xoa canh bao nay?')) return;
            try {
                await API.inventory.deleteAlert(a.id);
                showToast('Da xoa');
                await loadAlerts();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function loadAlertRules() {
            try {
                alertRules.value = await API.inventory.alertRules();
            } catch { alertRules.value = []; }
        }

        function openAlertRuleForm(r) {
            if (r) {
                alertRuleForm.value = {
                    id: r.id,
                    warehouse_id: r.warehouse_id || '',
                    product_id: r.product_id || '',
                    alert_type: r.alert_type || 'low_stock',
                    threshold: r.threshold,
                    frequency_minutes: r.frequency_minutes,
                    severity: r.severity || 'warning',
                    enabled: r.enabled !== false,
                    note: r.note || ''
                };
            } else {
                alertRuleForm.value = {
                    warehouse_id: '', product_id: '', alert_type: 'low_stock',
                    threshold: null, frequency_minutes: 60, severity: 'warning', enabled: true, note: ''
                };
            }
            showAlertRuleModal.value = true;
        }

        async function saveAlertRule() {
            try {
                const d = { ...alertRuleForm.value };
                // Validate required fields
                if (!d.warehouse_id) {
                    showToast('Vui long chon kho', 'error');
                    return;
                }
                if (!d.product_id) {
                    showToast('Vui long chon san pham', 'error');
                    return;
                }
                if (d.id) {
                    await API.inventory.updateAlertRule(d.id, d);
                } else {
                    await API.inventory.createAlertRule(d);
                }
                showAlertRuleModal.value = false;
                showToast('Da luu');
                await loadAlertRules();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function toggleAlertRule(r) {
            try {
                await API.inventory.toggleAlertRule(r.id, !r.enabled);
                showToast(r.enabled ? 'Da tat' : 'Da bat');
                await loadAlertRules();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function deleteAlertRule(r) {
            if (!confirm('Xoa quy tac "' + (r.product_name || r.alert_type) + '"?')) return;
            try {
                await API.inventory.deleteAlertRule(r.id);
                showToast('Da xoa');
                await loadAlertRules();
            } catch(e) { showToast(e.message, 'error'); }
        }

        function fmtNum(n, decimals = 0) {
            if (n === null || n === undefined) return '-';
            return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
        }

        function fmtDate(d) {
            if (!d) return '-';
            return new Date(d).toLocaleString('vi-VN');
        }

        onMounted(async () => {
            await load();
            await loadAlerts();
            await loadAlertRules();
        });

        return {
            warehouses, products, barns, stock, alerts, transactions, tab, filterType, selectedWh, selectedWhName, selectedBarn, suggestedWh,
            selectedStockBarn, stockWarehouseOptions,
            showWhModal, showProdModal, showWhDetail, showSetDefaultWhModal, showTxModal, whDetail, whDetailStock, whDetailZones,
            whForm, prodForm, alertsPanelOpen, setDefaultWhType, setDefaultWhId,
            importForm, exportForm, transferForm,
            alertRules, showAlertRuleModal, alertRuleForm,
            filteredWarehouses, whForType, activeAlertCount,
            load, loadStock, loadSuggestedWarehouses, loadTransactions, loadAlerts, loadAlertRules, checkAlerts, onStockBarnChange,
            openWhForm, openWhDetail, openProdForm, openSetDefaultWh, openAlertRuleForm, saveWh, saveProd, saveDefaultWh, removeDefaultWh, removeWh, removeProd,
            doImport, doExport, doTransfer, ackAlert, delAlert, toggleAlertRule, deleteAlertRule, fmtNum, fmtDate
        };
    }
};

return component;
