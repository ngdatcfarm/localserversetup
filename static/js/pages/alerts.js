const { ref, computed, onMounted, watch } = Vue;

const component = {
    template: `
    <div>
        <div class="page-header">
            <h2 class="page-title">Canh bao</h2>
            <div class="flex gap-2">
                <span v-if="activeSensorCount > 0" class="badge badge-red animate-pulse">{{ activeSensorCount }}</span>
                <span v-if="activeInventoryCount > 0" class="badge badge-orange animate-pulse">{{ activeInventoryCount }}</span>
                <button class="btn btn-sm btn-secondary" @click="checkNow">Kiem tra ngay</button>
                <button v-if="activeAlerts.length || activeInventoryAlerts.length" class="btn btn-sm btn-secondary" @click="ackAllActive">Doc tat ca</button>
            </div>
        </div>

        <!-- Active Alerts Summary -->
        <div v-if="activeAlerts.length || activeInventoryAlerts.length" class="card mb-4 border-l-4 border-red-500">
            <div class="flex justify-between items-center mb-3">
                <h3 class="font-semibold text-red-700">Canh bao dang hoat dong</h3>
                <button class="btn btn-sm btn-ghost" @click="activeAlerts=[]; activeInventoryAlerts=[];">Dong</button>
            </div>

            <!-- Sensor Alerts -->
            <div v-if="activeAlerts.length" class="mb-3">
                <h4 class="text-sm font-semibold text-gray-600 mb-2">Cam bien</h4>
                <div class="space-y-2">
                    <div v-for="a in activeAlerts" :key="'sensor-'+a.id" class="flex items-center justify-between p-2 rounded bg-red-50">
                        <div>
                            <span class="font-medium">{{ a.message }}</span>
                            <span class="text-sm text-gray-500 ml-2">({{ a.sensor_type }}: {{ a.value }})</span>
                        </div>
                        <div class="flex gap-2">
                            <span class="badge badge-red">{{ a.severity }}</span>
                            <button class="btn btn-xs btn-secondary" @click="ackSensorAlert(a)">Doc</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Inventory Alerts -->
            <div v-if="activeInventoryAlerts.length">
                <h4 class="text-sm font-semibold text-gray-600 mb-2">Ton kho</h4>
                <div class="space-y-2">
                    <div v-for="a in activeInventoryAlerts" :key="'inv-'+a.id" class="flex items-center justify-between p-2 rounded bg-orange-50">
                        <div>
                            <span class="font-medium">{{ a.product_name }}</span>
                            <span class="text-sm text-gray-500 ml-2">- {{ a.warehouse_name }}</span>
                            <span class="text-sm text-gray-500 ml-2">({{ fmtNum(a.current_quantity) }}/{{ fmtNum(a.threshold_value) }})</span>
                        </div>
                        <div class="flex gap-2">
                            <span class="badge" :class="a.severity === 'critical' ? 'badge-red' : 'badge-yellow'">{{ a.alert_type }}</span>
                            <button class="btn btn-xs btn-secondary" @click="ackInventoryAlert(a)">Doc</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="tabs mb-4">
            <div class="tab" :class="{active: tab==='sensor'}" @click="tab='sensor'">
                Cam bien
                <span v-if="activeSensorCount > 0" class="badge badge-red ml-1">{{ activeSensorCount }}</span>
            </div>
            <div class="tab" :class="{active: tab==='inventory'}" @click="tab='inventory'">
                Ton kho
                <span v-if="activeInventoryCount > 0" class="badge badge-orange ml-1">{{ activeInventoryCount }}</span>
            </div>
            <div class="tab" :class="{active: tab==='vaccine'}" @click="tab='vaccine'">
                Vaccine
                <span v-if="upcomingVaccines.length > 0" class="badge badge-red ml-1 animate-pulse">{{ upcomingVaccines.length }}</span>
            </div>
            <div class="tab" :class="{active: tab==='notify'}" @click="tab='notify'">
                Thong bao
                <span v-if="notifSubscribed" class="badge badge-green ml-1">On</span>
            </div>
        </div>

        <!-- Sensor Alerts Tab -->
        <div v-if="tab==='sensor'">
            <div class="mb-3 flex gap-2 items-center">
                <select v-model="filterBarn" @change="loadActiveSensorAlerts(); loadSensorAlerts();" class="border rounded px-3 py-1.5 text-sm">
                    <option value="">Tat ca chuong</option>
                    <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
                <div class="flex gap-1">
                    <button class="btn btn-sm" :class="filterAck===false ? 'btn-primary' : 'btn-secondary'" @click="filterAck=false; loadSensorAlerts()">Chua doc</button>
                    <button class="btn btn-sm" :class="filterAck===true ? 'btn-primary' : 'btn-secondary'" @click="filterAck=true; loadSensorAlerts()">Da doc</button>
                    <button class="btn btn-sm" :class="filterAck===undefined ? 'btn-primary' : 'btn-secondary'" @click="filterAck=undefined; loadSensorAlerts()">Tat ca</button>
                </div>
            </div>

            <div class="flex justify-between items-center mb-3">
                <h3 class="font-semibold">Quy tac cam bien</h3>
                <button class="btn btn-primary btn-sm" @click="openSensorRule()">+ Them quy tac</button>
            </div>

            <div v-if="sensorRules.length" class="table-wrap mb-4">
                <table>
                    <thead>
                        <tr>
                            <th>Ten</th><th>Sensor</th><th>Chuong</th><th>Min</th><th>Max</th><th>Muc do</th><th>Cooldown</th><th>Trang thai</th><th>Thao tac</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="r in sensorRules" :key="r.id" :class="r.enabled ? '' : 'opacity-50'">
                            <td class="font-medium">{{ r.name }}</td>
                            <td><span class="badge badge-blue">{{ r.sensor_type }}</span></td>
                            <td>{{ r.barn_id || 'Tat ca' }}</td>
                            <td>{{ r.min_value != null ? r.min_value : '-' }}</td>
                            <td>{{ r.max_value != null ? r.max_value : '-' }}</td>
                            <td>
                                <span v-if="r.severity==='danger'" class="badge badge-red">Nguy hiem</span>
                                <span v-else-if="r.severity==='warning'" class="badge badge-yellow">Canh chu</span>
                                <span v-else class="badge badge-blue">Thong tin</span>
                            </td>
                            <td>{{ r.cooldown_minutes }} phut</td>
                            <td><span :class="r.enabled ? 'badge badge-green' : 'badge badge-gray'">{{ r.enabled ? 'Bat' : 'Tat' }}</span></td>
                            <td class="flex gap-1">
                                <button class="btn btn-xs btn-secondary" @click="openSensorRule(r)">Sua</button>
                                <button class="btn btn-xs btn-danger" @click="delSensorRule(r)">Xoa</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="empty-state mb-4"><p>Chua co quy tac cam bien</p></div>

            <h3 class="font-semibold mb-2">Lich su</h3>
            <div v-if="sensorAlerts.length" class="space-y-2">
                <div v-for="a in sensorAlerts" :key="a.id" class="card flex items-start gap-3">
                    <span class="text-xl mt-0.5">{{ a.severity==='danger' ? '🔴' : a.severity==='warning' ? '🟡' : '🔵' }}</span>
                    <div class="flex-1">
                        <div class="text-sm font-medium">{{ a.message }}</div>
                        <div class="text-xs text-gray-400 mt-1">
                            {{ fmtDate(a.created_at) }}
                            | {{ a.sensor_type }} = {{ a.value }}
                            | Nguong: {{ a.threshold }}
                        </div>
                    </div>
                    <button v-if="!a.acknowledged" class="btn btn-sm btn-secondary" @click="ackSensorAlert(a)">Doc</button>
                    <span v-else class="badge badge-green">Da doc</span>
                </div>
            </div>
            <div v-else class="empty-state"><p>Khong co lich su</p></div>
        </div>

        <!-- Inventory Alerts Tab -->
        <div v-if="tab==='inventory'">
            <div class="mb-3 flex gap-2 items-center">
                <select v-model="filterWh" @change="loadActiveInventoryAlerts(); loadInventoryAlerts();" class="border rounded px-3 py-1.5 text-sm">
                    <option value="">Tat ca kho</option>
                    <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                </select>
                <button class="btn btn-sm btn-secondary" @click="checkInventoryAlerts">Kiem tra ton kho</button>
            </div>

            <div class="flex justify-between items-center mb-3">
                <h3 class="font-semibold">Quy tac ton kho</h3>
                <button class="btn btn-primary btn-sm" @click="openInventoryRule()">+ Them quy tac</button>
            </div>

            <div v-if="inventoryRules.length" class="table-wrap mb-4">
                <table>
                    <thead>
                        <tr>
                            <th>Kho</th><th>San pham</th><th>Loai</th><th>Nguong</th><th>Tan suat</th><th>Muc do</th><th>Trang thai</th><th>Thao tac</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="r in inventoryRules" :key="r.id" :class="r.enabled ? '' : 'opacity-50'">
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
                                <span v-if="r.severity === 'critical'" class="badge badge-red">Nguy hiem</span>
                                <span v-else-if="r.severity === 'warning'" class="badge badge-yellow">Canh chu</span>
                                <span v-else class="badge badge-blue">Thong tin</span>
                            </td>
                            <td><span :class="r.enabled ? 'badge badge-green' : 'badge badge-gray'">{{ r.enabled ? 'Bat' : 'Tat' }}</span></td>
                            <td class="flex gap-1">
                                <button class="btn btn-xs btn-secondary" @click="openInventoryRule(r)">Sua</button>
                                <button class="btn btn-xs btn-danger" @click="delInventoryRule(r)">Xoa</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="empty-state mb-4"><p>Chua co quy tac ton kho</p></div>

            <h3 class="font-semibold mb-2">Lich su ton kho</h3>
            <div v-if="inventoryAlerts.length" class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Thoi gian</th><th>Kho</th><th>San pham</th><th>So luong</th><th>Nguong</th><th>Loai</th><th>Muc do</th><th>Trang thai</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="a in inventoryAlerts" :key="a.id" :class="!a.acknowledged ? 'bg-red-50' : ''">
                            <td class="text-sm">{{ fmtDate(a.created_at) }}</td>
                            <td>{{ a.warehouse_name }}</td>
                            <td>{{ a.product_name }}</td>
                            <td class="font-semibold">{{ fmtNum(a.current_quantity) }}</td>
                            <td>{{ fmtNum(a.threshold_value) }}</td>
                            <td>
                                <span v-if="a.alert_type === 'low_stock'" class="badge badge-yellow">Ton thap</span>
                                <span v-else-if="a.alert_type === 'out_of_stock'" class="badge badge-red">Het hang</span>
                                <span v-else class="badge badge-gray">{{ a.alert_type }}</span>
                            </td>
                            <td>
                                <span v-if="a.severity === 'critical'" class="badge badge-red">Nguy hiem</span>
                                <span v-else-if="a.severity === 'warning'" class="badge badge-yellow">Canh chu</span>
                                <span v-else class="badge badge-blue">Thong tin</span>
                            </td>
                            <td>
                                <span v-if="a.acknowledged" class="badge badge-green">Da doc</span>
                                <span v-else class="badge badge-red">Chua doc</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-else class="empty-state"><p>Khong co lich su ton kho</p></div>
        </div>

        <!-- Vaccine Tab -->
        <div v-if="tab==='vaccine'">
            <div class="mb-3 flex gap-2 items-center">
                <select v-model="vaccineFilterCycle" @change="loadUpcomingVaccines();" class="border rounded px-3 py-1.5 text-sm">
                    <option value="">Tat ca chuong</option>
                    <option v-for="c in cycles" :key="c.id" :value="c.id">{{ c.name || 'Chuong ' + c.barn_id }}</option>
                </select>
                <select v-model="vaccineFilterDays" @change="loadUpcomingVaccines();" class="border rounded px-3 py-1.5 text-sm">
                    <option value="7">7 ngay toi</option>
                    <option value="14">14 ngay toi</option>
                    <option value="21">21 ngay toi</option>
                    <option value="30">30 ngay toi</option>
                </select>
            </div>

            <div v-if="loadingVaccines" class="text-center py-8 text-gray-400">
                <div class="text-2xl animate-spin">⏳</div>
                <p>Dang tai...</p>
            </div>

            <div v-else-if="upcomingVaccines.length === 0" class="empty-state text-center py-12">
                <div class="text-5xl mb-4">💉</div>
                <p class="text-lg text-gray-600">Khong co vaccine nao trong lich</p>
                <p class="text-sm text-gray-400 mt-2">Tat ca vaccine da duoc ghi nhan hoac chua tao lich</p>
            </div>

            <div v-else class="space-y-3">
                <div v-for="v in upcomingVaccines" :key="v.id"
                    class="card border-l-4 border-red-400">
                    <div class="flex items-start justify-between">
                        <div>
                            <div class="font-semibold text-gray-900">{{ v.vaccine_name }}</div>
                            <div class="text-sm text-gray-500 mt-1">
                                {{ v.barn_name || v.barn_id }} | {{ v.cycle_code || 'Chuong ' + v.barn_id }}
                            </div>
                            <div class="flex items-center gap-2 mt-2">
                                <span class="badge badge-red">Ngay {{ v.day_age_target }}</span>
                                <span class="text-sm text-gray-500">{{ fmtDate(v.scheduled_date) }}</span>
                                <span v-if="v.method" class="badge badge-blue">{{ v.method }}</span>
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-2">
                            <span class="text-sm text-red-600 font-medium">
                                Còn {{ getDaysUntil(v.scheduled_date) }} ngay
                            </span>
                            <div class="flex gap-2">
                                <button @click="markVaccineDone(v)" class="btn btn-sm btn-primary">Da tiêm</button>
                                <button @click="skipVaccine(v)" class="btn btn-sm btn-secondary">Bo qua</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Push notification toggle for vaccines -->
            <div class="card mt-4 border-l-4 border-green-400">
                <div class="flex items-center justify-between">
                    <div>
                        <h4 class="font-semibold">Thong bao vaccine</h4>
                        <p class="text-sm text-gray-500 mt-1">Nhan thong bao khi vaccine sap toi lich</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" v-model="vaccineNotifyEnabled"
                                @change="toggleVaccineNotifications()"
                                class="rounded w-5 h-5 accent-green-600">
                            <span>{{ vaccineNotifyEnabled ? 'Bat' : 'Tat' }}</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>

        <!-- Notifications Tab -->
        <div v-if="tab==='notify'">
            <!-- Push Notification Status Card -->
            <div class="card mb-4">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-semibold">Push Notifications</h3>
                    <span v-if="notifStatus.ready" class="badge badge-green">San sang</span>
                    <span v-else class="badge badge-red">Chua cau hinh</span>
                </div>

                <p v-if="!notifStatus.vapid_configured" class="text-sm text-yellow-600 mb-3">
                    VAPID keys chua duoc cau hinh. Vui long cau hinh vapid keys de nhan thong bao push.
                </p>

                <div class="mb-4 p-3 bg-gray-50 rounded text-sm">
                    <p><strong>Trang thai:</strong> {{ notifStatus.ready ? 'Da san sang' : 'Chua san sang' }}</p>
                    <p><strong>VAPID cau hinh:</strong> {{ notifStatus.vapid_configured ? 'Co' : 'Khong' }}</p>
                </div>

                <div v-if="notifStatus.ready" class="flex gap-2 flex-wrap">
                    <button v-if="!notifSubscribed" class="btn btn-primary" @click="subscribePush" :disabled="notifLoading">
                        <span v-if="notifLoading">Dang dang ky...</span>
                        <span v-else>Bat thong bao</span>
                    </button>
                    <button v-else class="btn btn-secondary" @click="unsubscribePush" :disabled="notifLoading">
                        Tat thong bao
                    </button>
                    <button class="btn btn-sm btn-secondary" @click="sendTestNotif" :disabled="!notifSubscribed || notifSending">
                        Gui thong bao test
                    </button>
                    <a :href="certDownloadUrl" download class="btn btn-sm btn-secondary" title="Tai certificate de cai dat tren dien thoai">
                        Tai Certificate
                    </a>
                </div>

                <div class="mt-3 p-3 bg-blue-50 rounded text-sm">
                    <p class="font-semibold text-blue-700">Huong dan cai dat tren dien thoai:</p>
                    <ol class="mt-2 ml-4 list-decimal text-gray-700 space-y-1">
                        <li>Tai certificate ve bang nut <strong>"Tai Certificate"</strong> ben duoi</li>
                        <li><strong>Android:</strong> Settings → Security → Install from storage → chon file cfarm.crt</li>
                        <li><strong>iPhone:</strong> Mo file → Install → Settings → General → VPN & Device Management → Install</li>
                        <li>Su dung Safari (iPhone) hoac Chrome (Android) de truy cap: <code>{{ certDownloadUrl }}</code></li>
                        <li>Vao Alerts → Thong bao → Bat thong bao</li>
                    </ol>
                </div>
            </div>

            <!-- Subscription Info -->
            <div v-if="notifSubscribed" class="card mb-4 border-l-4 border-green-500">
                <h3 class="font-semibold text-green-700 mb-2">Da dang ky nhan thong bao</h3>
                <p class="text-sm text-gray-600">
                    Thiet bi nay se nhan thong bao khi co canh bao moi.
                    Tin nhan se hien thi ngay ca khi trinh duyet dang dong.
                </p>
                <div class="mt-2 text-xs text-gray-400">
                    Endpoint: {{ notifEndpoint ? notifEndpoint.substring(0, 50) + '...' : 'N/A' }}
                </div>
            </div>

            <!-- Active Subscriptions (Admin view) -->
            <div v-if="notifSubs.length > 0" class="card">
                <h3 class="font-semibold mb-3">Dang ky hien tai ({{ notifSubs.length }})</h3>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Thiet bi</th><th>Endpoint</th><th>Tao luc</th><th>Hoat dong</th><th>Thao tac</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="s in notifSubs" :key="s.id">
                                <td>{{ s.user_label || 'Unknown' }}</td>
                                <td class="text-xs max-w-xs truncate">{{ s.endpoint }}</td>
                                <td class="text-sm">{{ fmtDate(s.created_at) }}</td>
                                <td><span :class="s.active ? 'badge badge-green' : 'badge badge-gray'">{{ s.active ? 'Bat' : 'Tat' }}</span></td>
                                <td>
                                    <button class="btn btn-xs btn-danger" @click="removeSub(s)">Xoa</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Sensor Rule Modal -->
        <div v-if="showSensorModal" class="modal-overlay" @click.self="showSensorModal=false">
            <div class="modal">
                <h3>{{ sensorRuleForm.id ? 'Sua quy tac cam bien' : 'Them quy tac cam bien' }}</h3>

                <div class="form-group">
                    <label>Ten *</label>
                    <input v-model="sensorRuleForm.name" placeholder="VD: Nhiet do qua cao" class="border rounded w-full px-2 py-1">
                </div>

                <div class="form-group">
                    <label>Sensor type *</label>
                    <select v-model="sensorRuleForm.sensor_type" class="border rounded w-full px-2 py-1">
                        <option value="">-- Chon sensor --</option>
                        <option v-for="s in sensorTypes" :key="s" :value="s">{{ s }}</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Chuong (tuy chon)</label>
                    <select v-model="sensorRuleForm.barn_id" class="border rounded w-full px-2 py-1">
                        <option value="">-- Tat ca chuong --</option>
                        <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                    </select>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="form-group">
                        <label>Gia tri Min</label>
                        <input v-model.number="sensorRuleForm.min_value" type="number" step="0.1" class="border rounded w-full px-2 py-1">
                    </div>
                    <div class="form-group">
                        <label>Gia tri Max</label>
                        <input v-model.number="sensorRuleForm.max_value" type="number" step="0.1" class="border rounded w-full px-2 py-1">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="form-group">
                        <label>Muc do *</label>
                        <select v-model="sensorRuleForm.severity" class="border rounded w-full px-2 py-1">
                            <option value="info">Thong tin</option>
                            <option value="warning">Canh chu y</option>
                            <option value="danger">Nguy hiem</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Cooldown (phut) *</label>
                        <input v-model.number="sensorRuleForm.cooldown_minutes" type="number" min="1" class="border rounded w-full px-2 py-1">
                    </div>
                </div>

                <div class="form-group">
                    <label class="flex items-center gap-2">
                        <input type="checkbox" v-model="sensorRuleForm.enabled" class="rounded">
                        Bat hien tai
                    </label>
                </div>

                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-secondary" @click="showSensorModal=false">Huy</button>
                    <button class="btn btn-primary" @click="saveSensorRule">Luu</button>
                </div>
            </div>
        </div>

        <!-- Inventory Rule Modal -->
        <div v-if="showInventoryModal" class="modal-overlay" @click.self="showInventoryModal=false">
            <div class="modal">
                <h3>{{ inventoryRuleForm.id ? 'Sua quy tac ton kho' : 'Them quy tac ton kho' }}</h3>

                <div class="form-group">
                    <label>Kho *</label>
                    <select v-model="inventoryRuleForm.warehouse_id" class="border rounded w-full px-2 py-1">
                        <option value="">-- Chon kho --</option>
                        <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>San pham *</label>
                    <select v-model="inventoryRuleForm.product_id" class="border rounded w-full px-2 py-1">
                        <option value="">-- Chon san pham --</option>
                        <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Loai canh bao *</label>
                    <select v-model="inventoryRuleForm.alert_type" class="border rounded w-full px-2 py-1">
                        <option value="low_stock">Ton kho thap</option>
                        <option value="out_of_stock">Het hang</option>
                        <option value="overstock">Qua nhieu</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Nguong (bo trong = dung nguong mac dinh san pham)</label>
                    <input v-model.number="inventoryRuleForm.threshold" type="number" step="0.1" placeholder="VD: 100" class="border rounded w-full px-2 py-1">
                </div>

                <div class="form-group">
                    <label>Tan suat kiem tra (phut, 0 hoac de trong = thu cong)</label>
                    <input v-model.number="inventoryRuleForm.frequency_minutes" type="number" step="5" min="0" placeholder="60" class="border rounded w-full px-2 py-1">
                </div>

                <div class="form-group">
                    <label>Muc do</label>
                    <select v-model="inventoryRuleForm.severity" class="border rounded w-full px-2 py-1">
                        <option value="info">Thong tin</option>
                        <option value="warning">Canh chu y</option>
                        <option value="critical">Nguy hiem</option>
                    </select>
                </div>

                <div class="form-group">
                    <label class="flex items-center gap-2">
                        <input type="checkbox" v-model="inventoryRuleForm.enabled" class="rounded">
                        Bat hien tai
                    </label>
                </div>

                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-secondary" @click="showInventoryModal=false">Huy</button>
                    <button class="btn btn-primary" @click="saveInventoryRule">Luu</button>
                </div>
            </div>
        </div>
    </div>`,

    setup() {
        // Sensor alerts state
        const sensorAlerts = ref([]);
        const activeAlerts = ref([]);
        const sensorRules = ref([]);
        const sensorTypes = ['temperature', 'humidity', 'heat_index'];

        // Inventory alerts state
        const inventoryAlerts = ref([]);
        const activeInventoryAlerts = ref([]);
        const inventoryRules = ref([]);
        const warehouses = ref([]);
        const products = ref([]);

        // Common state
        const barns = ref([]);
        const cycles = ref([]);
        const tab = ref('sensor');
        const filterAck = ref(false);
        const filterBarn = ref('');
        const filterWh = ref('');
        const showSensorModal = ref(false);
        const showInventoryModal = ref(false);
        const sensorRuleForm = ref({});
        const inventoryRuleForm = ref({});

        // Vaccine state
        const upcomingVaccines = ref([]);
        const loadingVaccines = ref(false);
        const vaccineFilterCycle = ref('');
        const vaccineFilterDays = ref('7');
        const vaccineNotifyEnabled = ref(false);

        // Notification state
        const notifStatus = ref({ ready: false, vapid_configured: false });
        const notifSubs = ref([]);
        const notifSubscribed = ref(false);
        const notifEndpoint = ref('');
        const notifLoading = ref(false);
        const notifSending = ref(false);
        const certDownloadUrl = window.location.origin + '/cfarm.crt';

        const activeSensorCount = computed(() => activeAlerts.value.length);
        const activeInventoryCount = computed(() => activeInventoryAlerts.value.length);

        // Sensor Alert functions
        async function loadActiveSensorAlerts() {
            try {
                activeAlerts.value = await API.sensorAlerts.active(filterBarn.value || undefined);
            } catch { activeAlerts.value = []; }
        }

        async function loadSensorAlerts() {
            try {
                sensorAlerts.value = await API.sensorAlerts.list(filterAck.value, filterBarn.value || undefined);
            } catch { sensorAlerts.value = []; }
        }

        async function loadSensorRules() {
            try {
                sensorRules.value = await API.sensorAlerts.rules.list(filterBarn.value || undefined);
            } catch { sensorRules.value = []; }
        }

        async function loadBarns() {
            try { barns.value = await API.barns.list(); } catch { barns.value = []; }
        }

        async function ackSensorAlert(a) {
            try {
                await API.sensorAlerts.ack(a.id);
                showToast('Da doc');
                await loadActiveSensorAlerts();
                await loadSensorAlerts();
            } catch(e) { showToast(e.message, 'error'); }
        }

        function openSensorRule(r) {
            if (r) {
                sensorRuleForm.value = {
                    id: r.id,
                    name: r.name,
                    sensor_type: r.sensor_type,
                    barn_id: r.barn_id || '',
                    min_value: r.min_value,
                    max_value: r.max_value,
                    severity: r.severity,
                    cooldown_minutes: r.cooldown_minutes,
                    enabled: r.enabled
                };
            } else {
                sensorRuleForm.value = {
                    name: '', sensor_type: '', barn_id: '',
                    min_value: null, max_value: null,
                    severity: 'warning', cooldown_minutes: 15, enabled: true
                };
            }
            showSensorModal.value = true;
        }

        async function saveSensorRule() {
            try {
                if (!sensorRuleForm.value.name) { showToast('Vui long nhap ten', 'error'); return; }
                if (!sensorRuleForm.value.sensor_type) { showToast('Vui long chon sensor type', 'error'); return; }

                const data = { ...sensorRuleForm.value };
                if (!data.barn_id) data.barn_id = null;

                if (data.id) {
                    await API.sensorAlerts.rules.update(data.id, data);
                } else {
                    await API.sensorAlerts.rules.create(data);
                }
                showSensorModal.value = false;
                showToast('Da luu');
                await loadSensorRules();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function delSensorRule(r) {
            if (!confirm('Xoa quy tac "' + r.name + '"?')) return;
            try {
                await API.sensorAlerts.rules.delete(r.id);
                showToast('Da xoa');
                await loadSensorRules();
            } catch(e) { showToast(e.message, 'error'); }
        }

        // Inventory Alert functions
        async function loadWarehouses() {
            try { warehouses.value = await API.warehouses.list(); } catch { warehouses.value = []; }
        }

        async function loadProducts() {
            try { products.value = await API.products.list(); } catch { products.value = []; }
        }

        async function loadActiveInventoryAlerts() {
            try {
                activeInventoryAlerts.value = await API.inventory.alerts();
            } catch { activeInventoryAlerts.value = []; }
        }

        async function loadInventoryAlerts() {
            try {
                inventoryAlerts.value = await API.inventory.alerts();
            } catch { inventoryAlerts.value = []; }
        }

        async function loadInventoryRules() {
            try {
                inventoryRules.value = await API.inventory.alertRules();
            } catch { inventoryRules.value = []; }
        }

        async function checkInventoryAlerts() {
            try {
                await API.inventory.checkAlerts();
                showToast('Da kiem tra');
                await loadActiveInventoryAlerts();
                await loadInventoryAlerts();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function ackInventoryAlert(a) {
            try {
                await API.inventory.ackAlert(a.id);
                showToast('Da doc');
                await loadActiveInventoryAlerts();
                await loadInventoryAlerts();
            } catch(e) { showToast(e.message, 'error'); }
        }

        function openInventoryRule(r) {
            if (r) {
                inventoryRuleForm.value = {
                    id: r.id,
                    warehouse_id: r.warehouse_id || '',
                    product_id: r.product_id || '',
                    alert_type: r.alert_type || 'low_stock',
                    threshold: r.threshold,
                    frequency_minutes: r.frequency_minutes,
                    severity: r.severity || 'warning',
                    enabled: r.enabled
                };
            } else {
                inventoryRuleForm.value = {
                    warehouse_id: '', product_id: '',
                    alert_type: 'low_stock',
                    threshold: null, frequency_minutes: 60,
                    severity: 'warning', enabled: true
                };
            }
            showInventoryModal.value = true;
        }

        async function saveInventoryRule() {
            try {
                if (!inventoryRuleForm.value.warehouse_id) { showToast('Vui long chon kho', 'error'); return; }
                if (!inventoryRuleForm.value.product_id) { showToast('Vui long chon san pham', 'error'); return; }

                const data = { ...inventoryRuleForm.value };
                if (!data.warehouse_id) data.warehouse_id = null;
                if (!data.product_id) data.product_id = null;

                if (data.id) {
                    await API.inventory.updateAlertRule(data.id, data);
                } else {
                    await API.inventory.createAlertRule(data);
                }
                showInventoryModal.value = false;
                showToast('Da luu');
                await loadInventoryRules();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function delInventoryRule(r) {
            if (!confirm('Xoa quy tac "' + (r.product_name || r.alert_type) + '"?')) return;
            try {
                await API.inventory.deleteAlertRule(r.id);
                showToast('Da xoa');
                await loadInventoryRules();
            } catch(e) { showToast(e.message, 'error'); }
        }

        // Vaccine functions
        async function loadUpcomingVaccines() {
            loadingVaccines.value = true;
            try {
                const days = parseInt(vaccineFilterDays.value);
                const allVaccines = await API.vaccines.schedules.upcoming(days);

                // Filter by cycle if selected
                if (vaccineFilterCycle.value) {
                    upcomingVaccines.value = allVaccines.filter(v =>
                        v.cycle_id === parseInt(vaccineFilterCycle.value)
                    );
                } else {
                    upcomingVaccines.value = allVaccines;
                }
            } catch(e) {
                console.error('Error loading vaccines:', e);
                upcomingVaccines.value = [];
            }
            loadingVaccines.value = false;
        }

        function getDaysUntil(dateStr) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const target = new Date(dateStr);
            target.setHours(0, 0, 0, 0);
            const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
            return diff;
        }

        async function markVaccineDone(v) {
            try {
                await API.vaccines.schedules.done(v.id);
                showToast('Da danh dau da tiem');
                await loadUpcomingVaccines();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function skipVaccine(v) {
            try {
                await API.vaccines.schedules.skip(v.id, 'Skip');
                showToast('Da bo qua');
                await loadUpcomingVaccines();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function toggleVaccineNotifications() {
            try {
                const newValue = !vaccineNotifyEnabled.value;
                await API.notifications.setVaccineSetting(newValue);
                vaccineNotifyEnabled.value = newValue;
                localStorage.setItem('cfarm_vaccine_notify', newValue);
                showToast(newValue ? 'Da bat thong bao vaccine' : 'Da tat thong bao vaccine');
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function loadCycles() {
            try {
                cycles.value = await API.cycles.list();
            } catch { cycles.value = []; }
        }

        // Notification functions
        async function loadNotifStatus() {
            try {
                notifStatus.value = await API.notifications.status();
            } catch { notifStatus.value = { ready: false, vapid_configured: false }; }
        }

        async function loadNotifSubs() {
            try {
                notifSubs.value = await API.notifications.subscriptions();
            } catch { notifSubs.value = []; }
        }

        async function subscribePush() {
            console.log('[Notif] Starting subscription...');
            if (!('Notification' in window) || !('PushManager' in window)) {
                showToast('Trinh duyet khong ho tro push notifications', 'error');
                return;
            }
            notifLoading.value = true;
            try {
                console.log('[Notif] Requesting permission...');
                const perm = await Notification.requestPermission();
                console.log('[Notif] Permission result:', perm);
                if (perm !== 'granted') {
                    showToast('Quyen push bi tu choi', 'error');
                    notifLoading.value = false;
                    return;
                }

                console.log('[Notif] Getting VAPID key...');
                const keyRes = await API.notifications.vapidKey();
                console.log('[Notif] VAPID key received:', keyRes.publicKey ? 'OK' : 'EMPTY');

                console.log('[Notif] Registering for push...');
                const sub = await registrationForPush(keyRes.publicKey);
                console.log('[Notif] Push registration:', sub);

                console.log('[Notif] Subscribing to server...');
                await API.notifications.subscribe(sub);
                console.log('[Notif] Subscribed successfully!');
                notifSubscribed.value = true;
                notifEndpoint.value = sub.endpoint;
                showToast('Da bat thong bao push');
            } catch(e) {
                console.error('[Notif] Error:', e);
                showToast('Loi dang ky: ' + e.message, 'error');
            }
            notifLoading.value = false;
        }

        async function registrationForPush(vapidPublicKey) {
            console.log('[Notif] Getting service worker registration...');
            const registration = await navigator.serviceWorker.ready;
            console.log('[Notif] SW ready, registration:', registration.scope);
            console.log('[Notif] Creating push subscription with key...');
            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
            });
            console.log('[Notif] Push subscription created!');
            return sub.toJSON();
        }

        async function unsubscribePush() {
            notifLoading.value = true;
            try {
                const registration = await navigator.serviceWorker.ready;
                const sub = await registration.pushManager.getSubscription();
                if (sub) {
                    await sub.unsubscribe();
                    await API.notifications.unsubscribe(sub.endpoint);
                }
                notifSubscribed.value = false;
                notifEndpoint.value = '';
                showToast('Da tat thong bao');
            } catch(e) {
                showToast('Loi huy: ' + e.message, 'error');
            }
            notifLoading.value = false;
        }

        async function sendTestNotif() {
            notifSending.value = true;
            try {
                await API.notifications.test('Test Alert', 'Day la thong bao test tu CFarm!');
                showToast('Da gui thong bao test');
            } catch(e) {
                showToast('Loi gui: ' + e.message, 'error');
            }
            notifSending.value = false;
        }

        async function removeSub(s) {
            if (!confirm('Xoa dang ky nay?')) return;
            try {
                await API.notifications.unsubscribe(s.endpoint);
                showToast('Da xoa');
                await loadNotifSubs();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function checkNotifSubscribed() {
            try {
                const registration = await navigator.serviceWorker.ready;
                const sub = await registration.pushManager.getSubscription();
                notifSubscribed.value = !!sub;
                if (sub) notifEndpoint.value = sub.endpoint;
            } catch { notifSubscribed.value = false; }
        }

        function urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
        }

        async function ackAllActive() {
            try {
                if (activeAlerts.value.length) {
                    await API.sensorAlerts.ackAll(filterBarn.value || undefined);
                }
                showToast('Da doc tat ca');
                await loadActiveSensorAlerts();
                await loadSensorAlerts();
                await loadActiveInventoryAlerts();
                await loadInventoryAlerts();
            } catch(e) { showToast(e.message, 'error'); }
        }

        async function checkNow() {
            showToast('Dang kiem tra...', 'info');
            await loadActiveSensorAlerts();
            await loadActiveInventoryAlerts();
            await loadSensorAlerts();
            await loadInventoryAlerts();
        }

        // Watch tab changes
        watch(() => tab.value, async (newTab) => {
            if (newTab === 'sensor') {
                await loadActiveSensorAlerts();
                await loadSensorAlerts();
                await loadSensorRules();
            } else if (newTab === 'inventory') {
                await loadActiveInventoryAlerts();
                await loadInventoryAlerts();
                await loadInventoryRules();
            } else if (newTab === 'vaccine') {
                await loadCycles();
                await loadUpcomingVaccines();
            } else if (newTab === 'notify') {
                await loadNotifStatus();
                await loadNotifSubs();
                await checkNotifSubscribed();
            }
        });

        onMounted(async () => {
            await loadBarns();
            await loadWarehouses();
            await loadProducts();
            await loadActiveSensorAlerts();
            await loadSensorAlerts();
            await loadSensorRules();
            // Load vaccine notification preference from backend
            try {
                const res = await API.notifications.getVaccineSetting();
                vaccineNotifyEnabled.value = res.enabled;
                localStorage.setItem('cfarm_vaccine_notify', res.enabled);
            } catch {
                vaccineNotifyEnabled.value = localStorage.getItem('cfarm_vaccine_notify') === 'true';
            }
        });

        return {
            // Sensor
            sensorAlerts, activeAlerts, sensorRules, sensorTypes,
            filterBarn, filterAck,
            loadActiveSensorAlerts, loadSensorAlerts, loadSensorRules,
            ackSensorAlert, openSensorRule, saveSensorRule, delSensorRule,
            // Inventory
            inventoryAlerts, activeInventoryAlerts, inventoryRules, warehouses, products,
            filterWh,
            loadActiveInventoryAlerts, loadInventoryAlerts, loadInventoryRules,
            checkInventoryAlerts, ackInventoryAlert, openInventoryRule, saveInventoryRule, delInventoryRule,
            // Vaccine
            upcomingVaccines, loadingVaccines, vaccineFilterCycle, vaccineFilterDays, vaccineNotifyEnabled,
            loadUpcomingVaccines, getDaysUntil, markVaccineDone, skipVaccine, toggleVaccineNotifications,
            cycles,
            // Notifications
            notifStatus, notifSubs, notifSubscribed, notifEndpoint, notifLoading, notifSending,
            subscribePush, unsubscribePush, sendTestNotif, removeSub, certDownloadUrl,
            // Common
            barns, tab, showSensorModal, showInventoryModal,
            sensorRuleForm, inventoryRuleForm,
            activeSensorCount, activeInventoryCount,
            checkNow, ackAllActive, fmtDate, fmtNum
        };
    }
};

return component;
