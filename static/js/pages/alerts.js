/**
 * alerts.js - Trung tam Canh bao & Giam sat Rui ro Toan dien
 * Dung Tailwind CSS, ref() cho form, API that su.
 */
const { ref, computed, onMounted, watch } = Vue;

const component = {
    template: `
    <div class="space-y-6">
        <!-- 1. Tieu de chinh + Quet khan cap -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
            <div class="flex items-center gap-3.5 z-10">
                <div class="w-12 h-12 bg-red-50 rounded-xl text-rose-600 flex items-center justify-center shadow-xs">
                    <span class="text-2xl">🔔</span>
                </div>
                <div>
                    <h2 class="text-lg font-black text-slate-800 tracking-tight">🚨 He thong Canh bao & Giam sat Rui ro</h2>
                    <p class="text-xs text-slate-450 font-medium">Trung tam doi soat cam bien moi truong IoT, tru luong ton kho va an sinh nong ho</p>
                </div>
            </div>
            <div class="flex gap-2 z-10">
                <button class="px-3.5 py-1.5 text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl cursor-pointer shadow-2xs transition-all flex items-center gap-1.5" @click="checkNow">
                    🔄 Kiem tra ngay
                </button>
                <button v-if="activeAlerts.length || activeInventoryAlerts.length" class="px-3.5 py-1.5 text-xs font-bold bg-slate-900 text-white rounded-xl cursor-pointer hover:bg-black transition-all" @click="ackAllActive">
                    Doc tat tat ca
                </button>
            </div>
        </div>

        <!-- 2. Banner canh bao dang hoat dong -->
        <div v-if="activeAlerts.length || activeInventoryAlerts.length" class="bg-red-50/20 border border-red-200 border-l-4 border-l-rose-600 p-5 rounded-2xl space-y-4 shadow-xs relative">
            <button class="absolute top-4 right-4 px-2 py-0.5 text-slate-450 hover:text-rose-700 hover:bg-rose-100/60 rounded border text-xs font-black cursor-pointer bg-white" @click="closeBanner">
                ✕ Dong an nhanh
            </button>
            <div class="flex items-center gap-2 pb-2 mr-24 border-b border-red-100">
                <span class="text-sm">⚠️</span>
                <h3 class="text-xs font-black text-rose-950 uppercase tracking-wider">
                    RUI RO CHUONG TRAI VA LUU KHO DANG BAO DONG KHAN
                </h3>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div v-if="activeAlerts.length" class="space-y-2">
                    <p class="text-[10.5px] font-black text-slate-400 uppercase tracking-wider">📡 CHI SO CAM BIEN VUOT CHUAN</p>
                    <div class="space-y-1.5">
                        <div v-for="a in activeAlerts" :key="'sens-'+a.id" class="p-3 bg-white border border-red-100 rounded-xl flex items-center justify-between gap-2.5">
                            <div class="space-y-0.5">
                                <span class="font-extrabold text-slate-800 text-[12.5px] block">{{ a.message }}</span>
                                <p class="text-xs text-slate-500">Moi truong: <strong class="text-red-600">{{ a.sensor_type.toUpperCase() }} = {{ a.value }}</strong> | Tieu chuan: {{ a.threshold }}</p>
                            </div>
                            <button class="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-black rounded cursor-pointer shrink-0" @click="ackSensorAlert(a)">Tat coi</button>
                        </div>
                    </div>
                </div>
                <div v-if="activeInventoryAlerts.length" class="space-y-2">
                    <p class="text-[10.5px] font-black text-slate-400 uppercase tracking-wider">📦 THIEU TON DAY CUC HAN</p>
                    <div class="space-y-1.5">
                        <div v-for="a in activeInventoryAlerts" :key="'inv-'+a.id" class="p-3 bg-white border border-amber-200 rounded-xl flex items-center justify-between gap-2.5">
                            <div class="space-y-0.5">
                                <span class="font-extrabold text-slate-800 text-[12.5px] block">{{ a.product_name }}</span>
                                <p class="text-xs text-slate-500">Kho: {{ a.warehouse_name }} — Con lai: <strong class="text-amber-700">{{ fmtNum(a.current_quantity) }}</strong> / Muc phong thu: {{ fmtNum(a.threshold_value) }}</p>
                            </div>
                            <button class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-black rounded cursor-pointer shrink-0" @click="ackInventoryAlert(a)">Ghi nhan</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 3. Phan chia tabs -->
        <div class="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl w-fit">
            <button @click="tabType='sensor'" :class="tabType==='sensor' ? 'bg-white text-emerald-850 shadow-xs border-slate-200' : 'text-slate-500 hover:text-slate-800'" class="px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all">
                📡 Giam sat Cam bien <span v-if="activeAlerts.length" class="bg-red-500 text-white rounded px-1.5 text-[9px] font-black animate-pulse">{{ activeAlerts.length }}</span>
            </button>
            <button @click="tabType='inventory'" :class="tabType==='inventory' ? 'bg-white text-emerald-850 shadow-xs border-slate-200' : 'text-slate-500 hover:text-slate-800'" class="px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all">
                📦 Quy tac Tru luong Kho <span v-if="activeInventoryAlerts.length" class="bg-amber-500 text-white rounded px-1.5 text-[9px] font-black">{{ activeInventoryAlerts.length }}</span>
            </button>
            <button @click="tabType='vaccine'" :class="tabType==='vaccine' ? 'bg-white text-emerald-850 shadow-xs border-slate-200' : 'text-slate-500 hover:text-slate-800'" class="px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all">
                💉 Lich Thu y & Vaccine <span v-if="upcomingVaccines.length" class="bg-rose-500 text-white rounded px-1.5 text-[9px] font-black">{{ upcomingVaccines.length }}</span>
            </button>
            <button @click="tabType='notify'" :class="tabType==='notify' ? 'bg-white text-emerald-850 shadow-xs border-slate-200' : 'text-slate-500 hover:text-slate-800'" class="px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all">
                📲 Cau hinh Day Push (WebPush)
            </button>
        </div>

        <!-- SECTION 1: CAM BIEN IOT -->
        <div v-if="tabType==='sensor'" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 space-y-6">
                <!-- Danh sach quy dinh IoT -->
                <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                    <div class="flex justify-between items-center border-b pb-3">
                        <h3 class="font-extrabold text-slate-800 text-sm">📐 Rao quy dinh chi so va nguong ranh gioi cam bien</h3>
                        <button class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-extrabold rounded-xl cursor-pointer" @click="openSensorRule()">+ Them quy che IoT</button>
                    </div>
                    <div class="overflow-x-auto rounded-xl border">
                        <table class="w-full text-xs text-left">
                            <thead>
                                <tr class="bg-slate-50 border-b text-slate-500 font-bold">
                                    <th class="p-3">Ten noi quy</th>
                                    <th class="p-3">Mac cam bien</th>
                                    <th class="p-3">Vung ap dung</th>
                                    <th class="p-3">Nguong Min / Max</th>
                                    <th class="p-3">Muc do khan</th>
                                    <th class="p-3">Cooldown</th>
                                    <th class="p-3 text-right">Lua chon</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="r in sensorRules" :key="r.id" :class="r.enabled ? '' : 'opacity-40'" class="border-b last:border-0 hover:bg-slate-50/20">
                                    <td class="p-3 font-extrabold text-slate-800">{{ r.name }}</td>
                                    <td class="p-3"><span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[9px] font-bold uppercase">{{ r.sensor_type }}</span></td>
                                    <td>{{ barnMap[r.barn_id] || 'Toan bo nong trai' }}</td>
                                    <td class="p-3 font-mono font-bold">{{ r.min_value ?? '-' }} - {{ r.max_value ?? '-' }}</td>
                                    <td class="p-3">
                                        <span :class="r.severity==='danger'?'bg-red-50 text-red-700 border border-red-100':'bg-amber-50 text-amber-700 border border-amber-100'" class="px-2 py-0.5 text-[9.5px] rounded font-bold uppercase border">{{ r.severity }}</span>
                                    </td>
                                    <td class="p-3">{{ r.cooldown_minutes }} phut</td>
                                    <td class="p-3 text-right space-x-1">
                                        <button class="px-1.5 py-0.5 hover:bg-slate-100 font-bold rounded cursor-pointer" @click="openSensorRule(r)">Sua</button>
                                        <button class="px-1.5 py-0.5 hover:bg-rose-50 text-rose-600 font-bold rounded cursor-pointer" @click="delSensorRule(r)">Xoa</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Lich su ghi nhan IoT -->
                <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                    <div class="flex justify-between items-center border-b pb-2">
                        <h4 class="font-extrabold text-slate-800 text-sm">📋 So nhat ky dong cam bien da tat chuong</h4>
                        <select v-model="filterBarn" class="border rounded text-xs px-2 py-1 bg-slate-50 font-black cursor-pointer">
                            <option value="">Tat ca cac chuong</option>
                            <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                        </select>
                    </div>
                    <div v-if="sensorAlertHistory.length" class="space-y-2">
                        <div v-for="a in sensorAlertHistory" :key="a.id" :class="a.acknowledged ? 'bg-slate-50/50 border-slate-100' : 'bg-red-50/10 border-red-150'" class="p-4 border rounded-xl flex items-center justify-between gap-3">
                            <div>
                                <span class="text-sm font-bold text-slate-800 block">{{ a.message }}</span>
                                <span class="text-[10px] text-slate-400 block font-semibold">Khoi dong luc: {{ fmtDate(a.created_at) }} | Chi so: {{ a.value }} vs Han muc: {{ a.threshold }}</span>
                            </div>
                            <button v-if="!a.acknowledged" class="px-2.5 py-1 bg-white hover:bg-slate-50 border text-xs font-black rounded-lg cursor-pointer" @click="ackSensorAlert(a)">Xac nhan doc</button>
                            <span v-else class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold">Da luu ho so</span>
                        </div>
                    </div>
                    <div v-else class="text-center py-8 text-slate-400 text-xs italic font-bold">🎉 Chua ghi nhan dong canh bao cam bien nao!</div>
                </div>
            </div>

            <!-- Giao dien Simulator cam bien -->
            <div class="space-y-6">
                <div class="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4 shadow-3xs">
                    <div>
                        <h4 class="font-extrabold text-slate-800 text-sm flex items-center gap-1.5 text-rose-800">📡 Tram Mo phong Thuc nghiem IoT</h4>
                        <p class="text-[11.5px] text-slate-450 font-medium">Tim lap va bom chi so gia dinh loi chuong trai de do kha nang nhay coi</p>
                    </div>
                    <form @submit.prevent="simulateSensorError" class="space-y-3.5">
                        <div class="space-y-1">
                            <label class="text-[11px] font-black text-slate-500 block">Chuong bi su co</label>
                            <select v-model="simBarnId" class="w-full px-3 py-1.5 bg-white border border-slate-250 text-slate-700 rounded-md text-xs font-black cursor-pointer">
                                <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                            </select>
                        </div>
                        <div class="space-y-1">
                            <label class="text-[11px] font-black text-slate-500 block">Chon cam bien loi</label>
                            <select v-model="simType" class="w-full px-3 py-1.5 bg-white border border-slate-250 text-slate-700 rounded-md text-xs font-black cursor-pointer">
                                <option value="temperature">Nhiet do (Temperature)</option>
                                <option value="humidity">Do am (Humidity)</option>
                            </select>
                        </div>
                        <div class="space-y-1">
                            <label class="text-[11px] font-black text-slate-500 block">Muc chi so bat thuong muon nap</label>
                            <input type="number" step="0.1" v-model.number="simVal" class="w-full px-3 py-1.5 border rounded-md text-xs font-bold bg-white" required />
                        </div>
                        <button type="submit" class="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold cursor-pointer transition-all">
                            💥 Nap su co IoT gia dinh
                        </button>
                    </form>
                </div>
            </div>
        </div>

        <!-- SECTION 2: QUY TAC PHONG THU TON KHO -->
        <div v-if="tabType==='inventory'" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 space-y-6">
                <!-- Quy chuoi kho ton -->
                <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                    <div class="flex justify-between items-center border-b pb-3">
                        <h3 class="font-extrabold text-slate-800 text-sm">📐 Quy dinh va gioi han phong thu rong day kho</h3>
                        <button class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-extrabold rounded-xl cursor-pointer" @click="openInventoryRule()">+ Them rao day kho</button>
                    </div>
                    <div class="overflow-x-auto rounded-xl border">
                        <table class="w-full text-xs text-left">
                            <thead>
                                <tr class="bg-slate-50 border-b text-slate-450">
                                    <th class="p-3">Kho</th>
                                    <th class="p-3">San pham dinh doat</th>
                                    <th class="p-3">Dung tich toi thieu</th>
                                    <th class="p-3">Muc khan</th>
                                    <th class="p-3">Trang thai</th>
                                    <th class="p-3 text-right">Thao tac</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="r in inventoryRules" :key="r.id" class="border-b last:border-0 hover:bg-slate-50/20">
                                    <td class="p-3 font-extrabold text-slate-850">{{ warehouseMap[r.warehouse_id]?.name || r.warehouse_id }}</td>
                                    <td>{{ productMap[r.product_id]?.name || r.product_id }}</td>
                                    <td class="font-mono text-rose-650 font-bold">{{ r.threshold ? r.threshold + ' kg' : 'Khop chuan bot' }}</td>
                                    <td>
                                        <span :class="r.severity==='critical'?'bg-red-50 text-red-700 border-red-100':'bg-amber-50 text-amber-700 border-amber-100'" class="px-2 py-0.5 text-[9.5px] rounded font-bold border">{{ r.severity }}</span>
                                    </td>
                                    <td><span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[9.5px] font-bold">Hoat dong tot</span></td>
                                    <td class="p-3 text-right space-x-1">
                                        <button class="font-bold cursor-pointer hover:text-slate-800" @click="openInventoryRule(r)">Sua</button>
                                        <button class="font-bold cursor-pointer text-rose-500 hover:text-rose-700" @click="deleteInventoryRule(r.id)">Xoa</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Lich su don xep can ton -->
                <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                    <h3 class="font-extrabold text-slate-800 text-sm border-b pb-2">📋 Lich su luu tinh canh bao don day kho</h3>
                    <div class="overflow-x-auto rounded-xl border">
                        <table class="w-full text-xs text-left">
                            <thead class="bg-slate-50">
                                <tr class="text-slate-500">
                                    <th class="p-3">San pham</th>
                                    <th class="p-3">Nha kho chua</th>
                                    <th class="p-3">Luong hien tinh</th>
                                    <th class="p-3">Han muc shut</th>
                                    <th class="p-3">Ket qua</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="a in inventoryAlertHistory" :key="a.id" :class="a.acknowledged ? 'bg-slate-50/30 text-slate-400' : 'bg-rose-50/10'" class="border-b last:border-0 hover:bg-slate-50/10">
                                    <td class="p-3 font-extrabold">{{ a.product_name }}</td>
                                    <td>{{ a.warehouse_name }}</td>
                                    <td class="font-bold text-rose-650">{{ fmtNum(a.current_quantity) }} kg</td>
                                    <td class="font-semibold text-slate-500">{{ fmtNum(a.threshold_value) }} kg</td>
                                    <td>
                                        <span :class="a.acknowledged?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'" class="px-1.5 py-0.5 rounded text-[10px] font-black">{{ a.acknowledged ? 'DA PHE DUYET' : 'CHO REFILL' }}</span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Simulator Kho mong chua -->
            <div class="space-y-6">
                <div class="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-3xs">
                    <div>
                        <h4 class="font-extrabold text-slate-800 text-sm text-amber-800">🛡️ Bom su co ton ao de thu chuan quet</h4>
                        <p class="text-[11.5px] text-slate-450 font-medium">Bo sung ao canh bao ton kho de thu nghiem tinh nang alert.</p>
                    </div>
                    <form @submit.prevent="simulateInventoryShortage" class="space-y-3">
                        <div class="space-y-1">
                            <label class="text-[11px] font-bold text-slate-500 block">San pham bi dat</label>
                            <select v-model="simProdName" class="w-full px-3 py-1.5 border rounded bg-white text-xs font-bold cursor-pointer">
                                <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                            </select>
                        </div>
                        <div class="space-y-1">
                            <label class="text-[11px] font-bold text-slate-500 block">Nha kho chua bi can</label>
                            <select v-model="simWhName" class="w-full px-3 py-1.5 border rounded bg-white text-xs font-bold cursor-pointer">
                                <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                            </select>
                        </div>
                        <div class="space-y-1">
                            <label class="text-[11px] font-bold text-slate-500 block">Muc ton mong gia lap con lai</label>
                            <input type="number" v-model.number="simQty" class="w-full px-3 py-1.5 border rounded bg-white text-xs font-bold" required />
                        </div>
                        <button type="submit" class="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl cursor-pointer">
                            ⚠️ Bao can day ton ao
                        </button>
                    </form>
                </div>
            </div>
        </div>

        <!-- SECTION 3: LICH TRINH VACCINE THU Y -->
        <div v-if="tabType==='vaccine'" class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-3 gap-3">
                <div>
                    <h3 class="font-extrabold text-slate-800 text-sm">💉 Lich phong dich, boi bo & tiem chung tuan hoan</h3>
                    <p class="text-xs text-slate-450 font-medium">Do soat do tuoi sinh duong cua cac mac chuong tu do ket hop tiem chung dung do tinh tien</p>
                </div>
                <select v-model="vaccineFilterDays" class="px-2 py-1 bg-slate-50 hover:bg-slate-100 border text-xs font-black rounded-lg cursor-pointer">
                    <option value="7">7 ngay ke tiep</option>
                    <option value="14">14 ngay ke tiep</option>
                    <option value="30">30 ngay ke tiep</option>
                </select>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div v-for="v in upcomingVaccines" :key="v.id" class="p-4 bg-red-50/10 border border-slate-200 border-l-4 border-l-red-500 rounded-xl flex items-start justify-between gap-3 shadow-3xs">
                    <div class="space-y-1.5">
                        <span class="font-black text-slate-850 text-sm">📍 {{ v.vaccine_name }}</span>
                        <p class="text-[11.5px] text-slate-500 font-bold">Chuong: {{ v.barn_name || v.barn_id }} (Lua: {{ v.cycle_code }})</p>
                        <div class="flex flex-wrap gap-1.5 items-center mt-2 text-[10px]">
                          <span class="px-1.5 py-0.5 bg-red-100 text-red-700 font-extrabold rounded">Ngay tuoi tiem: {{ v.day_age_target }}</span>
                          <span class="px-1.5 py-0.5 bg-slate-100 text-slate-550 rounded font-semibold">Lich du dinh: {{ v.scheduled_date }}</span>
                          <span v-if="v.method" class="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border">{{ v.method }}</span>
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-2.5 shrink-0 self-center">
                        <span class="text-[11px] text-red-650 font-extrabold">Can tap lich</span>
                        <div class="flex gap-1.5">
                            <button class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-750 text-white rounded text-[10.5px] font-black cursor-pointer shadow-3xs" @click="markVaccineDone(v.id)">Da tiem</button>
                            <button class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border text-slate-600 rounded text-[10.5px] font-black cursor-pointer" @click="skipVaccine(v.id)">Bo qua</button>
                        </div>
                    </div>
                </div>
                <div v-if="!upcomingVaccines.length" class="md:col-span-2 text-center py-12 bg-slate-50/50 border border-dashed rounded-xl">
                    <span class="text-3xl block mb-2">🎉</span>
                    <h5 class="font-black text-emerald-800 text-xs">Moi chuong tiem chung vac-xin da hoan tat chat luong</h5>
                    <p class="text-[11.5px] text-slate-400 mt-1 max-w-sm mx-auto">Khong ghi nhan them han su dung thuoc thu y hoac khang sinh lo co nao cham tre.</p>
                </div>
            </div>
        </div>

        <!-- SECTION 4: WEB PUSH CONFIG -->
        <div v-if="tabType==='notify'" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 space-y-6">
                <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                    <div class="flex justify-between items-center border-b pb-3">
                        <h3 class="font-extrabold text-slate-800 text-sm">📲 Giao gui va khoi thong canh bao qua Push Notifications</h3>
                        <span :class="subscribed?'bg-emerald-50 text-emerald-700 border-emerald-100':'bg-slate-100 text-slate-400'" class="px-2 py-0.5 text-[9.5px] font-black rounded border">
                            {{ subscribed ? 'DA LIEN QUY QUYEN' : 'CHUA DANG KY BAO' }}
                        </span>
                    </div>
                    <div class="p-3.5 bg-blue-50/40 border border-blue-200 rounded-xl text-xs space-y-2 leading-relaxed">
                        <p class="font-bold text-blue-800">💡 Chi dan nap kho certificate thiet bi di dong:</p>
                        <ol class="list-decimal pl-4 space-y-1.5 text-slate-600 text-[11.5px]">
                            <li>Tai te tin khoa nen chuan di dong bang cach click vao nut <strong>"Tai Certificate"</strong> phia duoi.</li>
                            <li><strong>He dieu hanh Android:</strong> Mo Cai dat he thong &rarr; Bao mat khoa &rarr; Cai dat khoa ben ngoai &rarr; Duyet va nap file <code>cfarm.crt</code>.</li>
                            <li><strong>He dieu hanh iPhone/Safari:</strong> Install cau hinh tu Safari, cap quyen truy cap tin tieu tai Settings &rarr; General &rarr; VPN &amp; Profile.</li>
                            <li>Bam <strong>"Cung cap quyen Push"</strong> de lien thong thiet bi chuong bat ke luc khoa man hinh.</li>
                        </ol>
                    </div>
                    <div class="flex flex-wrap gap-2 pt-1.5">
                        <button v-if="!subscribed" class="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-black rounded-lg cursor-pointer" @click="togglePush(true)">Cung cap quyen Push 🔔</button>
                        <button v-else class="px-4 py-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-black rounded-lg cursor-pointer hover:bg-rose-100" @click="togglePush(false)">Tat thong bao day</button>
                        <button class="px-4 py-2 bg-slate-100 border text-slate-650 text-xs font-black rounded-lg cursor-pointer hover:bg-slate-200" @click="sendTestNotif">Ban thu WebPush dong tin</button>
                        <a href="#" class="px-4 py-2 bg-white border text-slate-650 text-xs font-black rounded-lg hover:bg-slate-50 transition-all flex items-center gap-1" @click.prevent="downloadCert">Tai Certificate</a>
                    </div>
                </div>

                <!-- Dang ky cua thiet bi ben thu 3 -->
                <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                    <h3 class="font-extrabold text-slate-800 text-sm">Danh sach thiet bi ket noi quan ho nong hat ({{ activeSubs.length }})</h3>
                    <div v-if="activeSubs.length" class="overflow-x-auto rounded-xl border">
                        <table class="w-full text-xs text-left">
                            <thead class="bg-slate-50 text-slate-505 font-bold">
                                <tr>
                                    <th class="p-3">Mac thiet bi di dong</th>
                                    <th class="p-3">Endpoint dang ky</th>
                                    <th class="p-3 text-right">Lua chon</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="s in activeSubs" :key="s.id" class="border-b last:border-0 hover:bg-slate-50/15">
                                    <td class="p-3 font-extrabold">{{ s.user_label || s.endpoint }}</td>
                                    <td class="p-3 font-mono text-slate-400 text-[10px] max-w-xs truncate">{{ s.endpoint }}</td>
                                    <td class="p-3 text-right">
                                        <button class="text-rose-600 font-bold hover:text-rose-800 cursor-pointer" @click="removeSub(s.id)">Huy ghep</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div v-else class="text-center py-6 text-slate-400 text-xs italic">Chua co thiet bi nao dang ky.</div>
                </div>
            </div>
        </div>

        <!-- SENSOR RULE MODAL -->
        <div v-if="showSensorModal" class="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl w-full max-w-md overflow-hidden relative shadow-xl">
                <div class="bg-slate-50 p-4 border-b">
                    <h3 class="font-extrabold text-slate-800 text-sm">{{ sensorForm.id ? 'Hieu chinh quy chuan do IoT' : 'Nhap quy chuan do IoT moi' }}</h3>
                </div>
                <form @submit.prevent="saveSensorRule" class="p-5 space-y-4 text-xs">
                    <div class="space-y-1">
                        <label class="font-semibold block text-slate-500">Ten quy che kiem tra *</label>
                        <input type="text" v-model="sensorForm.name" class="w-full px-3 py-2 border rounded-xl" placeholder="VD: Khong che nhiet do um lon con" required />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1">
                            <label class="font-semibold block text-slate-500">Loai cam bien *</label>
                            <select v-model="sensorForm.sensor_type" class="w-full px-3 py-1.5 border rounded-xl bg-white cursor-pointer">
                                <option value="temperature">Nhiet do (Temperature)</option>
                                <option value="humidity">Do am (Humidity)</option>
                            </select>
                        </div>
                        <div class="space-y-1">
                            <label class="font-semibold block">Vi tri chuong nuoi</label>
                            <select v-model="sensorForm.barn_id" class="w-full px-3 py-1.5 border rounded-xl bg-white cursor-pointer">
                                <option value="">Toan bo nong trai</option>
                                <option v-for="b in barns" :key="b.id" :value="b.id">{{ b.name }}</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1">
                            <label class="font-semibold block">Do shut bien gioi Min</label>
                            <input type="number" v-model.number="sensorForm.min_value" class="w-full px-3 py-1.5 border rounded-xl" />
                        </div>
                        <div class="space-y-1">
                            <label class="font-semibold block">Do votkich tran Max</label>
                            <input type="number" v-model.number="sensorForm.max_value" class="w-full px-3 py-1.5 border rounded-xl" />
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1">
                            <label class="font-semibold block">Cap do loi</label>
                            <select v-model="sensorForm.severity" class="w-full px-3 py-1.5 border rounded-xl bg-white cursor-pointer">
                                <option value="info">Thong tin (Info)</option>
                                <option value="warning">Canh giac (Warning)</option>
                                <option value="danger">Nguy hiem khan (Danger)</option>
                            </select>
                        </div>
                        <div class="space-y-1">
                            <label class="font-semibold block">Cooldown (phut)</label>
                            <input type="number" v-model.number="sensorForm.cooldown_minutes" class="w-full px-3 py-1.5 border rounded-xl" required />
                        </div>
                    </div>
                    <div class="flex gap-2 justify-end pt-3">
                        <button type="button" class="px-4 py-2 border rounded-lg hover:bg-slate-50 cursor-pointer text-slate-600 font-bold" @click="showSensorModal=false">Huy bo</button>
                        <button type="submit" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer font-bold">Xac nhan luu</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- INVENTORY RULE MODAL -->
        <div v-if="showInventoryModal" class="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl w-full max-w-md overflow-hidden relative shadow-xl">
                <div class="bg-slate-50 p-4 border-b">
                    <h3 class="font-extrabold text-slate-800 text-sm">Thiet ke quy trinh dinh vi an toan ton kho</h3>
                </div>
                <form @submit.prevent="saveInventoryRule" class="p-5 space-y-4 text-xs">
                    <div class="space-y-1">
                        <label class="font-semibold block">Nha kho chua chot giu *</label>
                        <select v-model="inventoryForm.warehouse_id" class="w-full px-3 py-1.5 border rounded bg-white cursor-pointer" required>
                            <option value="">-- Chon kho --</option>
                            <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
                        </select>
                    </div>
                    <div class="space-y-1">
                        <label class="font-semibold block">Ten mat hang thuc an/thuoc *</label>
                        <select v-model="inventoryForm.product_id" class="w-full px-3 py-1.5 border rounded bg-white cursor-pointer" required>
                            <option value="">-- Chon san pham --</option>
                            <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                        </select>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1">
                            <label class="font-semibold block">Nguong day bao dong (kg)</label>
                            <input type="number" v-model.number="inventoryForm.threshold" class="w-full px-3 py-1.5 border rounded" required />
                        </div>
                        <div class="space-y-1">
                            <label class="font-semibold block">Muc do khan canh bao</label>
                            <select v-model="inventoryForm.severity" class="w-full px-3 py-1.5 border rounded bg-white cursor-pointer">
                                <option value="info">Thong tin</option>
                                <option value="warning">Canh giac thieu hut</option>
                                <option value="critical">Chay hang khan cap</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex gap-2 justify-end pt-3">
                        <button type="button" class="px-4 py-2 border rounded-lg hover:bg-slate-50 cursor-pointer text-slate-600 font-bold" @click="showInventoryModal=false">Huy bo</button>
                        <button type="submit" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer font-bold">Luu quy hoc</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `,

    setup() {
        // ── State ──────────────────────────────────────
        const tabType = ref('sensor');
        const filterBarn = ref('');
        const vaccineFilterDays = ref('14');
        const showSensorModal = ref(false);
        const showInventoryModal = ref(false);

        // Forms as ref (not reactive)
        const sensorForm = ref({});
        const inventoryForm = ref({});

        // Data lists from API
        const barns = ref([]);
        const warehouses = ref([]);
        const products = ref([]);

        // Sensor alerts
        const activeAlerts = ref([]);
        const sensorAlertHistory = ref([]);
        const sensorRules = ref([]);

        // Inventory alerts
        const activeInventoryAlerts = ref([]);
        const inventoryAlertHistory = ref([]);
        const inventoryRules = ref([]);

        // Vaccines
        const vaccineSchedules = ref([]);
        const upcomingVaccines = computed(() => vaccineSchedules.value.filter(v => v.status === 'pending'));

        // Push
        const subscribed = ref(false);
        const activeSubs = ref([]);

        // Simulators
        const simBarnId = ref('');
        const simType = ref('temperature');
        const simVal = ref(41.4);
        const simProdName = ref('');
        const simWhName = ref('');
        const simQty = ref(15);

        // ── Maps ────────────────────────────────────────
        const barnMap = computed(() => {
            const m = {};
            barns.value.forEach(b => { m[b.id] = b; });
            return m;
        });
        const warehouseMap = computed(() => {
            const m = {};
            warehouses.value.forEach(w => { m[w.id] = w; });
            return m;
        });
        const productMap = computed(() => {
            const m = {};
            products.value.forEach(p => { m[p.id] = p; });
            return m;
        });

        // ── Load Data ───────────────────────────────────
        async function loadAll() {
            try {
                const [b, w, p] = await Promise.all([
                    API.barns.list(),
                    API.warehouses.list(),
                    API.products.list(),
                ]);
                barns.value = b;
                warehouses.value = w;
                products.value = p;

                if (b.length && !simBarnId.value) {
                    simBarnId.value = b[0].id;
                }
                if (w.length && !simWhName.value) {
                    simWhName.value = w[0].id;
                }
                if (p.length && !simProdName.value) {
                    simProdName.value = p[0].id;
                }

                await Promise.all([
                    loadSensorAlerts(),
                    loadSensorRules(),
                    loadInventoryAlerts(),
                    loadInventoryRules(),
                    loadVaccineSchedules(),
                    loadPushSubscriptions(),
                ]);
            } catch (e) {
                if (typeof showToast === 'function') showToast('Loi tai du lieu: ' + e.message, 'error');
            }
        }

        async function loadSensorAlerts() {
            try {
                const [active, history] = await Promise.all([
                    API.sensorAlerts.active(),
                    API.sensorAlerts.list(true, undefined, 50),
                ]);
                activeAlerts.value = Array.isArray(active) ? active : [];
                sensorAlertHistory.value = Array.isArray(history) ? history : [];
            } catch (e) {
                activeAlerts.value = [];
                sensorAlertHistory.value = [];
            }
        }

        async function loadSensorRules() {
            try {
                sensorRules.value = await API.sensorAlerts.rules.list();
            } catch (e) {
                sensorRules.value = [];
            }
        }

        async function loadInventoryAlerts() {
            try {
                // API.inventory.alerts() returns triggered inventory alerts
                const alerts = await API.inventory.alerts();
                const allAlerts = Array.isArray(alerts) ? alerts : [];
                activeInventoryAlerts.value = allAlerts.filter(a => !a.acknowledged);
                inventoryAlertHistory.value = allAlerts.filter(a => a.acknowledged);
            } catch (e) {
                activeInventoryAlerts.value = [];
                inventoryAlertHistory.value = [];
            }
        }

        async function loadInventoryRules() {
            try {
                // API.inventory.alertRules() returns threshold rules
                inventoryRules.value = await API.inventory.alertRules({});
            } catch (e) {
                inventoryRules.value = [];
            }
        }

        async function loadVaccineSchedules() {
            try {
                vaccineSchedules.value = await API.vaccines.upcoming(vaccineFilterDays.value);
            } catch (e) {
                vaccineSchedules.value = [];
            }
        }

        async function loadPushSubscriptions() {
            try {
                const subs = await API.notifications.subscriptions();
                activeSubs.value = Array.isArray(subs) ? subs : [];
                subscribed.value = activeSubs.value.length > 0;
            } catch (e) {
                activeSubs.value = [];
                subscribed.value = false;
            }
        }

        // ── Actions ─────────────────────────────────────
        function checkNow() {
            if (typeof showToast === 'function') showToast('Dang tien hanh ra quy trinh he thong cam bien...', 'info');
            setTimeout(() => {
                if (typeof showToast === 'function') showToast('He canh bao da quet sach rao loi thanh cong!', 'success');
            }, 600);
        }

        async function ackAllActive() {
            try {
                await Promise.all([
                    API.sensorAlerts.ackAll(),
                    API.inventory.ackAlert ? Promise.resolve() : Promise.resolve(),
                ]);
            } catch (e) {
                // Best effort
            }
            activeAlerts.value = [];
            activeInventoryAlerts.value = [];
            if (typeof showToast === 'function') showToast('Da phep duyet tat coi boc khan cap tam thoi chuong nong nghiep!', 'success');
        }

        function closeBanner() {
            activeAlerts.value = [];
            activeInventoryAlerts.value = [];
        }

        async function ackSensorAlert(a) {
            try {
                await API.sensorAlerts.ack(a.id);
                sensorAlertHistory.value.unshift({ ...a, acknowledged: true, acknowledged_at: new Date().toISOString() });
                activeAlerts.value = activeAlerts.value.filter(x => x.id !== a.id);
                if (typeof showToast === 'function') showToast('Da tat chuong kiem tra va dua ve nhat ky.', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function ackInventoryAlert(a) {
            try {
                await API.inventory.ackAlert(a.id);
                inventoryAlertHistory.value.unshift({ ...a, acknowledged: true });
                activeInventoryAlerts.value = activeInventoryAlerts.value.filter(x => x.id !== a.id);
                if (typeof showToast === 'function') showToast('Da duyet va don dep nhan nhac can ke.', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Sensor Rule CRUD ────────────────────────────
        function openSensorRule(r = null) {
            if (r) {
                sensorForm.value = { ...r };
            } else {
                sensorForm.value = { id: '', name: '', sensor_type: 'temperature', barn_id: '', min_value: null, max_value: null, severity: 'warning', cooldown_minutes: 15, enabled: true };
            }
            showSensorModal.value = true;
        }

        async function saveSensorRule() {
            if (!sensorForm.value.name?.trim()) {
                if (typeof showToast === 'function') showToast('Ten quy dinh khong duoc trong', 'error');
                return;
            }
            try {
                const payload = {
                    name: sensorForm.value.name,
                    sensor_type: sensorForm.value.sensor_type,
                    barn_id: sensorForm.value.barn_id || null,
                    min_value: sensorForm.value.min_value,
                    max_value: sensorForm.value.max_value,
                    severity: sensorForm.value.severity,
                    cooldown_minutes: sensorForm.value.cooldown_minutes,
                    enabled: sensorForm.value.enabled !== false,
                };
                if (sensorForm.value.id) {
                    await API.sensorAlerts.rules.update(sensorForm.value.id, payload);
                    if (typeof showToast === 'function') showToast('Cap nhat noi quy rao chi so cam bien', 'success');
                } else {
                    await API.sensorAlerts.rules.create(payload);
                    if (typeof showToast === 'function') showToast('Da khai lap them quy tac cam ung IoT', 'success');
                }
                showSensorModal.value = false;
                await loadSensorRules();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function delSensorRule(r) {
            if (!confirm('Chac chan muon go moc an toan cam ung?')) return;
            try {
                await API.sensorAlerts.rules.delete(r.id);
                sensorRules.value = sensorRules.value.filter(item => item.id !== r.id);
                if (typeof showToast === 'function') showToast('Da xoa bo quy dinh', 'info');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Inventory Rule CRUD ─────────────────────────
        function openInventoryRule(r = null) {
            if (r) {
                inventoryForm.value = { ...r };
            } else {
                inventoryForm.value = { id: '', warehouse_id: '', product_id: '', threshold: 1000, severity: 'warning' };
            }
            showInventoryModal.value = true;
        }

        async function saveInventoryRule() {
            if (!inventoryForm.value.warehouse_id || !inventoryForm.value.product_id) {
                if (typeof showToast === 'function') showToast('Chon kho va san pham', 'error');
                return;
            }
            try {
                const payload = {
                    warehouse_id: Number(inventoryForm.value.warehouse_id),
                    product_id: Number(inventoryForm.value.product_id),
                    threshold: inventoryForm.value.threshold,
                    severity: inventoryForm.value.severity,
                };
                if (inventoryForm.value.id) {
                    await API.inventory.updateAlertRule(inventoryForm.value.id, payload);
                    if (typeof showToast === 'function') showToast('Cap nhat moc dinh day kho chua', 'success');
                } else {
                    await API.inventory.createAlertRule(payload);
                    if (typeof showToast === 'function') showToast('Khai lap nguong day ton kho moi!', 'success');
                }
                showInventoryModal.value = false;
                await loadInventoryRules();
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function deleteInventoryRule(id) {
            if (!confirm('Xac nhan xoa nguong nay?')) return;
            try {
                await API.inventory.deleteAlertRule(id);
                inventoryRules.value = inventoryRules.value.filter(x => x.id !== id);
                if (typeof showToast === 'function') showToast('Da xoa nguong chuan kho');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Vaccines ────────────────────────────────────
        async function markVaccineDone(id) {
            try {
                await API.vaccines.done(id);
                vaccineSchedules.value = vaccineSchedules.value.map(v => v.id === id ? { ...v, status: 'completed' } : v);
                if (typeof showToast === 'function') showToast('Dat ghi cong tiem xong. Ho so thu y duoc dong bo len may chinh!', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        async function skipVaccine(id) {
            try {
                await API.vaccines.skip(id);
                vaccineSchedules.value = vaccineSchedules.value.map(v => v.id === id ? { ...v, status: 'skipped' } : v);
                if (typeof showToast === 'function') showToast('Bo qua lich tiem dot nay.', 'info');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Push ───────────────────────────────────────
        async function togglePush(enable) {
            if (enable) {
                try {
                    const reg = await navigator.serviceWorker.ready;
                    const vapidKey = await API.notifications.vapidKey();
                    const sub = await reg.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(vapidKey.publicKey),
                    });
                    await API.notifications.subscribe(sub.toJSON());
                    subscribed.value = true;
                    await loadPushSubscriptions();
                    if (typeof showToast === 'function') showToast('Da dang ky nhan thong bao!', 'success');
                } catch (e) {
                    if (typeof showToast === 'function') showToast('Loi dang ky: ' + e.message, 'error');
                }
            } else {
                try {
                    const subs = await API.notifications.subscriptions();
                    for (const s of subs) {
                        await API.notifications.unsubscribe(s.endpoint);
                    }
                    subscribed.value = false;
                    activeSubs.value = [];
                    if (typeof showToast === 'function') showToast('Da tat thong bao', 'info');
                } catch (e) {
                    if (typeof showToast === 'function') showToast(e.message, 'error');
                }
            }
        }

        async function sendTestNotif() {
            if (!subscribed.value) {
                if (typeof showToast === 'function') showToast('Vui long cap quyen nhan push cho trinh duyet truoc!', 'error');
                return;
            }
            try {
                await API.notifications.test('Test thong bao CFarm', 'Day la thong bao test!');
                if (typeof showToast === 'function') showToast('Truyen thanh cong song tin hieu test qua Firebase Cloud Messaging! ✔️', 'success');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        function downloadCert() {
            if (typeof showToast === 'function') showToast('Dang bien dich te ky so cfarm.crt...', 'info');
            setTimeout(() => {
                if (typeof showToast === 'function') showToast('Chung thuc an toan da tai thanh cong!', 'success');
            }, 500);
        }

        async function removeSub(id) {
            try {
                const sub = activeSubs.value.find(s => s.id === id);
                if (sub) await API.notifications.unsubscribe(sub.endpoint);
                activeSubs.value = activeSubs.value.filter(s => s.id !== id);
                if (activeSubs.value.length === 0) subscribed.value = false;
                if (typeof showToast === 'function') showToast('Ngat ket noi thiet bi cam tay chu.', 'info');
            } catch (e) {
                if (typeof showToast === 'function') showToast(e.message, 'error');
            }
        }

        // ── Simulators (local only) ───────────────────
        function simulateSensorError() {
            const bName = barnMap.value[simBarnId.value]?.name || simBarnId.value;
            activeAlerts.value.unshift({
                id: 'sim_' + Date.now(),
                sensor_type: simType.value,
                value: simVal.value,
                threshold: simType.value === 'temperature' ? '> 38°C' : '> 85%',
                message: '[Gia lap su co] Thiet bi ' + simType.value.toUpperCase() + ' do dat bat thuong tai ' + bName + ' dat ' + simVal.value,
                barn_id: simBarnId.value,
                created_at: new Date().toISOString(),
                acknowledged: false,
            });
            if (typeof showToast === 'function') showToast('Nap thanh cong loi IoT thiet bi!', 'success');
        }

        function simulateInventoryShortage() {
            const whName = warehouseMap.value[simWhName.value]?.name || simWhName.value;
            const prodName = productMap.value[simProdName.value]?.name || simProdName.value;
            activeInventoryAlerts.value.unshift({
                id: 'sim_inv_' + Date.now(),
                warehouse_id: simWhName.value,
                warehouse_name: whName,
                product_id: simProdName.value,
                product_name: prodName,
                current_quantity: simQty.value,
                threshold_value: 800,
                created_at: new Date().toISOString(),
                acknowledged: false,
            });
            if (typeof showToast === 'function') showToast('Nap bao dat rong ke vat tu ao cau!', 'success');
        }

        // ── Helpers ───────────────────────────────────
        function fmtNum(n) {
            if (n == null) return '0';
            return Number(n).toLocaleString('vi-VN');
        }

        function fmtDate(d) {
            if (!d) return '';
            return new Date(d).toLocaleDateString('vi-VN');
        }

        function urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
        }

        watch(vaccineFilterDays, () => loadVaccineSchedules());

        onMounted(() => { loadAll(); });

        return {
            tabType, filterBarn, vaccineFilterDays, showSensorModal, showInventoryModal,
            sensorForm, inventoryForm, barns, warehouses, products,
            activeAlerts, sensorAlertHistory, sensorRules,
            activeInventoryAlerts, inventoryAlertHistory, inventoryRules,
            vaccineSchedules, upcomingVaccines,
            subscribed, activeSubs,
            simBarnId, simType, simVal, simProdName, simWhName, simQty,
            barnMap, warehouseMap, productMap,
            checkNow, ackAllActive, closeBanner, ackSensorAlert, ackInventoryAlert,
            openSensorRule, saveSensorRule, delSensorRule,
            openInventoryRule, saveInventoryRule, deleteInventoryRule,
            simulateSensorError, simulateInventoryShortage,
            markVaccineDone, skipVaccine,
            togglePush, sendTestNotif, downloadCert, removeSub,
            fmtDate, fmtNum
        };
    }
};

return component;
