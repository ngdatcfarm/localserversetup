const { ref, onMounted } = Vue;

const component = {
template: `
<div class="count-page">
  <div class="page-header">
    <h2 class="page-title">Đếm gà</h2>
    <button class="btn btn-primary" @click="openForm()">+ Thêm quy tắc đếm</button>
  </div>

  <!-- Storage info -->
  <div class="flex gap-4 mb-4 text-sm">
    <span class="badge badge-blue">Snapshot: {{ storage.snapshot_dir }}</span>
    <span>Files: {{ storage.total_files }}</span>
    <span>Size: {{ storage.total_size_mb }} MB</span>
    <span>Retention: {{ storage.retention_days }} days</span>
    <button class="btn btn-secondary btn-sm" @click="runCleanup()">Dọn cleanup</button>
  </div>

  <!-- Test form -->
  <div class="card mb-4">
    <h4 class="font-medium mb-3">Thử nghiệm đếm nhanh</h4>
    <div class="grid grid-cols-5 gap-3 mb-3">
      <div class="form-group mb-0">
        <label class="text-xs">Camera</label>
        <select v-model="testForm.camera_id" @change="onCameraChange" class="w-full">
          <option value="">-- Chọn camera --</option>
          <option v-for="c in cameras" :key="c.id" :value="c.id">{{ c.id }}</option>
        </select>
      </div>
      <div class="form-group mb-0">
        <label class="text-xs">Preset</label>
        <select v-model="testForm.preset_id" class="w-full">
          <option value="1">1</option>
          <option v-for="p in presets" :key="p.number" :value="p.number">{{ p.name || p.number }}</option>
        </select>
      </div>
      <div class="form-group mb-0">
        <label class="text-xs">Số ảnh (burst)</label>
        <input v-model.number="testForm.snapshot_count" type="number" min="1" max="20">
      </div>
      <div class="form-group mb-0">
        <label class="text-xs">Khoảng (giây)</label>
        <input v-model.number="testForm.snapshot_interval" type="number" step="0.1" min="0.1">
      </div>
      <div class="form-group mb-0">
        <label class="text-xs">Phương pháp</label>
        <select v-model="testForm.count_method">
          <option value="max">Max (lấy cao nhất)</option>
          <option value="avg">Avg (trung bình)</option>
          <option value="single">Single (1 ảnh)</option>
        </select>
      </div>
    </div>
    <div class="grid grid-cols-3 gap-3 mb-3">
      <div class="form-group mb-0">
        <label class="text-xs">Avg pixels/object</label>
        <input v-model.number="testForm.avg_pixels_per_object" type="number" placeholder="3000">
      </div>
      <div class="form-group mb-0">
        <label class="text-xs">Lower HSV</label>
        <input v-model="testForm.lower_hsv" placeholder="10,30,60">
      </div>
      <div class="form-group mb-0">
        <label class="text-xs">Upper HSV</label>
        <input v-model="testForm.upper_hsv" placeholder="40,255,255">
      </div>
    </div>
    <button class="btn btn-primary" @click="runCountTest()" :disabled="testing">
      {{ testing ? 'Đang đếm...' : '▶ Đếm thử' }}
    </button>

    <!-- Test result -->
    <div v-if="testResult" class="mt-3 p-3 rounded" :class="testResult.success ? 'bg-green-900/30' : 'bg-red-900/30'">
      <div class="flex items-center gap-3">
        <span class="text-2xl font-bold">{{ testResult.count || 0 }}</span>
        <div class="text-sm">
          <div>Objects counted (method: {{ testResult.method || 'density' }})</div>
          <div v-if="testResult.total_pixels" class="text-xs text-gray-400">
            Pixels: {{ testResult.total_pixels }} | Regions: {{ testResult.contour_count || 0 }} | {{ testResult.pixel_percentage }}%
          </div>
          <div v-if="testResult.burst_captured" class="text-xs">
            Snapshots: {{ testResult.burst_captured }}/{{ testForm.snapshot_count }}
          </div>
        </div>
      </div>
      <!-- Debug image with contours -->
      <div v-if="testResult.debug_image" class="mt-3">
        <div class="text-xs text-gray-400 mb-1">Debug visualization (green contours = detected regions):</div>
        <img :src="'/snapshots/' + testResult.debug_image" class="rounded" style="max-width:400px; border:1px solid var(--border);">
      </div>
    </div>
  </div>

  <!-- Rules list -->
  <div v-if="rules.length" class="table-wrap">
    <table>
      <thead><tr><th>Tên</th><th>Camera</th><th>Burst</th><th>Threshold</th><th>Trigger</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>
        <tr v-for="r in rules" :key="r.id">
          <td class="font-medium">{{ r.name }}</td>
          <td>{{ r.camera_id }}</td>
          <td class="text-sm">{{ r.snapshot_count || 5 }} ảnh @ {{ r.snapshot_interval || 0.5 }}s</td>
          <td>{{ r.operator || '>' }} {{ r.threshold || 0 }}</td>
          <td>
            <span v-if="r.trigger_type === 'schedule'" class="badge badge-blue">{{ r.cron_expression }}</span>
            <span v-else class="badge badge-yellow">Manual</span>
          </td>
          <td>
            <button :class="r.enabled ? 'btn btn-success btn-sm' : 'btn btn-secondary btn-sm'"
              @click="toggleRule(r)">{{ r.enabled ? 'Bật' : 'Tắt' }}</button>
          </td>
          <td class="flex gap-1">
            <button class="btn btn-primary btn-sm" @click="testRule(r)" title="Chạy thử">▶</button>
            <button class="btn btn-secondary btn-sm" @click="openForm(r)">Sửa</button>
            <button class="btn btn-danger btn-sm" @click="remove(r)">Xóa</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-else class="empty-state"><div class="icon">🐔</div><p>Chưa có quy tắc đếm gà</p></div>

  <!-- Modal -->
  <div v-if="showModal" class="modal-overlay" @click.self="showModal=false">
    <div class="modal">
      <h3>{{ form.id ? 'Sửa quy tắc' : 'Thêm quy tắc đếm gà' }}</h3>

      <div class="form-group"><label>Tên</label>
        <input v-model="form.name" placeholder="VD: Đếm gà chuồng 1"></div>

      <div class="grid grid-cols-2 gap-4">
        <div class="form-group"><label>Camera</label>
          <select v-model="form.camera_id" class="w-full">
            <option value="">-- Chọn camera --</option>
            <option v-for="c in cameras" :key="c.id" :value="c.id">{{ c.id }}</option>
          </select>
        </div>
        <div class="form-group"><label>Trigger</label>
          <select v-model="form.trigger_type">
            <option value="manual">Thủ công</option>
            <option value="schedule">Hẹn giờ (Cron)</option>
          </select>
        </div>
      </div>

      <div v-if="form.trigger_type === 'schedule'" class="form-group">
        <label>Cron expression</label>
        <input v-model="form.cron_expression" placeholder="*/5 * * * * (mỗi 5 phút)">
        <p class="text-xs text-gray-400 mt-1">Phút Giờ Ngày Tháng Thứ</p>
      </div>

      <div class="form-group"><label>Cooldown (giây)</label>
        <input v-model.number="form.cooldown_seconds" type="number" min="0"></div>

      <hr class="my-3">
      <h4 class="font-medium mb-2">Cấu hình burst</h4>

      <div class="grid grid-cols-3 gap-4">
        <div class="form-group"><label>Số ảnh</label>
          <input v-model.number="form.snapshot_count" type="number" min="1" max="20"></div>
        <div class="form-group"><label>Khoảng (giây)</label>
          <input v-model.number="form.snapshot_interval" type="number" step="0.1" min="0.1"></div>
        <div class="form-group"><label>Phương pháp</label>
          <select v-model="form.count_method">
            <option value="max">Max (lấy cao nhất)</option>
            <option value="avg">Avg (trung bình)</option>
            <option value="single">Single (1 ảnh)</option>
          </select>
        </div>
      </div>

      <hr class="my-3">
      <h4 class="font-medium mb-2">Ngưỡng trigger</h4>

      <div class="grid grid-cols-3 gap-4">
        <div class="form-group"><label>Count threshold</label>
          <input v-model.number="form.threshold" type="number" placeholder="VD: 50"></div>
        <div class="form-group"><label>Operator</label>
          <select v-model="form.operator">
            <option value=">">Lớn hơn (&gt;)</option>
            <option value=">=">Lớn hơn hoặc bằng (&gt;=)</option>
            <option value="<">Nhỏ hơn (&lt;)</option>
            <option value="<=">Nhỏ hơn hoặc bằng (&lt;=)</option>
            <option value="==">Bằng (==)</option>
          </select>
        </div>
        <div class="form-group"><label>Action khi trigger</label>
          <select v-model="form.trigger_action">
            <option value="log">Chỉ log</option>
            <option value="notify">Gửi thông báo</option>
            <option value="relay">Bật relay</option>
          </select>
        </div>
      </div>

      <div class="form-group"><label>
        <input type="checkbox" v-model="form.enabled" class="mr-2"> Kích hoạt
      </label></div>

      <div class="flex justify-end gap-2 mt-4">
        <button class="btn btn-secondary" @click="showModal=false">Huỷ</button>
        <button class="btn btn-primary" @click="save()">Lưu</button>
      </div>
    </div>
  </div>
</div>`,

setup() {
  const cameras = ref([]);
  const presets = ref([]);
  const rules = ref([]);
  const showModal = ref(false);
  const form = ref({});
  const testResult = ref(null);
  const testing = ref(false);
  const storage = ref({snapshot_dir: 'E:\\AI\\Snapshots', retention_days: 7, total_files: 0, total_size_mb: 0});

  async function load() {
    // Load cameras
    try { cameras.value = await API.cameras.list(); } catch { cameras.value = []; }
    // Load rules
    try {
      const res = await API.ai_logic.countRules ? await API.ai_logic.countRules() : [];
      rules.value = res;
    } catch { rules.value = []; }
    // Load storage info
    try {
      const si = await API.snapshots.config();
      storage.value = si;
    } catch {}
  }

  function openForm(r) {
    if (r) {
      form.value = { ...r };
    } else {
      form.value = {
        name: '', camera_id: '', trigger_type: 'manual', cron_expression: '',
        cooldown_seconds: 60, enabled: true,
        snapshot_count: 5, snapshot_interval: 0.5, count_method: 'max',
        threshold: 50, operator: '>', trigger_action: 'log',
      };
    }
    showModal.value = true;
    testResult.value = null;
  }

  async function save() {
    try {
      if (form.value.id) {
        await API.ai_logic.updateCountRule(form.value.id, form.value);
      } else {
        await API.ai_logic.createCountRule(form.value);
      }
      showModal.value = false;
      showToast('Đã lưu');
      await load();
    } catch(e) { showToast(e.message, 'error'); }
  }

  async function remove(r) {
    if (!confirm('Xóa quy tắc ' + r.name + '?')) return;
    try { await API.ai_logic.delCountRule(r.id); showToast('Đã xóa'); await load(); }
    catch(e) { showToast(e.message, 'error'); }
  }

  async function toggleRule(r) {
    try { await API.ai_logic.toggleCountRule(r.id, !r.enabled); await load(); }
    catch(e) { showToast(e.message, 'error'); }
  }

  async function testRule(r) {
    try {
      testResult.value = await API.ai_logic.countTest({
        camera_id: r.camera_id,
        snapshot_count: r.snapshot_count || 5,
        snapshot_interval: r.snapshot_interval || 0.5,
        count_method: r.count_method || 'max',
      });
    } catch(e) { showToast(e.message, 'error'); }
  }

  async function runCountTest() {
    if (!testForm.value.camera_id) { showToast('Chọn camera trước', 'error'); return; }
    testing.value = true;
    testResult.value = null;
    try {
      // Parse HSV strings to arrays
      const lowerHsv = String(testForm.value.lower_hsv).split(',').map(Number);
      const upperHsv = String(testForm.value.upper_hsv).split(',').map(Number);
      const payload = {
        camera_id: testForm.value.camera_id,
        preset_id: testForm.value.preset_id || 1,
        snapshot_count: testForm.value.snapshot_count || 3,
        snapshot_interval: testForm.value.snapshot_interval || 0.5,
        count_method: testForm.value.count_method || 'max',
        avg_pixels_per_object: testForm.value.avg_pixels_per_object || 3000,
        lower_hsv: lowerHsv,
        upper_hsv: upperHsv,
      };
      testResult.value = await API.ai_logic.countTest(payload);
    } catch(e) { showToast(e.message, 'error'); }
    testing.value = false;
  }

  async function runCleanup() {
    try {
      await API.snapshots.cleanup();
      showToast('Đã dọn cleanup');
      await load();
    } catch(e) { showToast(e.message, 'error'); }
  }

  const testForm = ref({
    camera_id: '', preset_id: 1, snapshot_count: 3, snapshot_interval: 0.5, count_method: 'max',
    avg_pixels_per_object: 3000, lower_hsv: '10,30,60', upper_hsv: '40,255,255',
  });

  async function onCameraChange() {
    presets.value = [];
    if (testForm.value.camera_id) {
      try {
        const res = await API.cameras.presets.list(testForm.value.camera_id);
        // API returns {local: [...], hardware: []}
        presets.value = res.local || res || [];
      } catch { presets.value = []; }
    }
  }

  onMounted(load);
  return {
    cameras, presets, rules, showModal, form, testResult, testing, storage, testForm,
    openForm, save, remove, toggleRule, testRule, runCountTest, runCleanup, onCameraChange,
  };
}
};

return component;