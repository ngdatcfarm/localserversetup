const { ref, onMounted } = Vue;

const component = {
template: `
<div>
  <div class="page-header">
    <h2 class="page-title">AI Logic</h2>
    <button class="btn btn-primary" @click="openForm()">+ Thêm quy tắc</button>
  </div>

  <div v-if="rules.length" class="table-wrap">
    <table>
      <thead><tr><th>Tên</th><th>Trigger</th><th>Bước</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>
        <tr v-for="r in rules" :key="r.id">
          <td class="font-medium">{{ r.name }}</td>
          <td class="text-sm text-gray-600">
            <span v-if="r.trigger_type === 'schedule'" class="badge badge-blue">Hẹn giờ</span>
            <span v-else class="badge badge-yellow">Thủ công</span>
            <span v-if="r.cron_expression" class="text-xs ml-1">{{ r.cron_expression }}</span>
          </td>
          <td class="text-sm">
            <span v-if="r.step_count !== undefined">{{ r.step_count }} bước</span>
            <span v-else class="text-gray-400">-</span>
          </td>
          <td>
            <button
              :class="r.enabled ? 'btn btn-success btn-sm' : 'btn btn-secondary btn-sm'"
              @click="toggleRule(r)">
              {{ r.enabled ? 'Bật' : 'Tắt' }}
            </button>
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
  <div v-else class="empty-state"><div class="icon">🤖</div><p>Chưa có quy tắc AI Logic</p></div>

  <!-- Test Output -->
  <div v-if="lastResult" class="mt-4 p-3 rounded" :class="lastResult.success ? 'bg-green-900/30 border border-green-600' : 'bg-red-900/30 border border-red-600'">
    <h4 class="font-medium mb-2">Kết quả: {{ lastResult.rule_name || 'Rule' }}</h4>
    <pre class="text-xs overflow-auto">{{ JSON.stringify(lastResult, null, 2) }}</pre>
  </div>

  <!-- Modal -->
  <div v-if="showModal" class="modal-overlay" @click.self="showModal=false">
    <div class="modal modal-lg">
      <h3>{{ form.id ? 'Sửa quy tắc' : 'Thêm quy tắc AI Logic' }}</h3>

      <div class="form-group"><label>Tên</label>
        <input v-model="form.name" placeholder="VD: Tuần tra chuồng 1"></div>
      <div class="form-group"><label>Mô tả</label>
        <input v-model="form.description" placeholder="Mô tả ngắn"></div>

      <div class="grid grid-cols-2 gap-4">
        <div class="form-group"><label>Trigger</label>
          <select v-model="form.trigger_type">
            <option value="manual">Thủ công</option>
            <option value="schedule">Hẹn giờ (Cron)</option>
          </select>
        </div>
        <div class="form-group"><label>Cooldown (giây)</label>
          <input v-model.number="form.cooldown_seconds" type="number" min="0"></div>
      </div>

      <div v-if="form.trigger_type === 'schedule'" class="form-group">
        <label>Cron expression</label>
        <input v-model="form.cron_expression" placeholder="0 6 * * * (6:00 hàng ngày)">
        <p class="text-xs text-gray-400 mt-1">Phút Giờ Ngày Tháng Thứ</p>
      </div>

      <div class="form-group">
        <label class="flex items-center gap-2">
          <input type="checkbox" v-model="form.enabled"> Kích hoạt
        </label>
      </div>

      <hr class="my-3">
      <h4 class="font-medium mb-2">Các bước</h4>

      <div v-for="(step, idx) in form.steps" :key="idx" class="step-item mb-3 p-3 rounded">
        <div class="flex items-center gap-2 mb-2">
          <span class="step-num">{{ idx + 1 }}</span>
          <select v-model="step.action_type" class="flex-1" @change="onActionTypeChange(step)">
            <option value="goto_preset">Goto Preset</option>
            <option value="record_video">Record Video</option>
            <option value="record_snapshot">Snapshot</option>
            <option value="wait">Chờ (Delay)</option>
            <option value="stop_recording">Stop Recording</option>
          </select>
          <button class="btn btn-danger btn-sm" @click="removeStep(idx)">✕</button>
        </div>

        <!-- goto_preset -->
        <div v-if="step.action_type === 'goto_preset'" class="grid grid-cols-2 gap-2">
          <div><label class="text-xs">Camera ID</label>
            <input v-model="step.camera_id" placeholder="cam_001"></div>
          <div><label class="text-xs">Preset ID</label>
            <input v-model.number="step.preset_id" type="number" placeholder="1"></div>
        </div>

        <!-- record_video -->
        <div v-if="step.action_type === 'record_video'" class="grid grid-cols-2 gap-2">
          <div><label class="text-xs">Camera ID</label>
            <input v-model="step.camera_id" placeholder="cam_001"></div>
          <div><label class="text-xs">Thời lượng (giây)</label>
            <input v-model.number="step.duration_seconds" type="number" placeholder="10"></div>
        </div>

        <!-- record_snapshot -->
        <div v-if="step.action_type === 'record_snapshot'" class="grid grid-cols-3 gap-2">
          <div><label class="text-xs">Camera ID</label>
            <input v-model="step.camera_id" placeholder="cam_001"></div>
          <div><label class="text-xs">Số lượng</label>
            <input v-model.number="step.config.count" type="number" placeholder="1"></div>
          <div><label class="text-xs">Khoảng (giây)</label>
            <input v-model.number="step.config.interval_sec" type="number" placeholder="2"></div>
        </div>

        <!-- wait -->
        <div v-if="step.action_type === 'wait'" class="grid grid-cols-2 gap-2">
          <div><label class="text-xs">Thời gian chờ (giây)</label>
            <input v-model.number="step.duration_seconds" type="number" placeholder="5"></div>
        </div>

        <!-- stop_recording -->
        <div v-if="step.action_type === 'stop_recording'">
          <label class="text-xs">Camera ID (để trống = tất cả)</label>
          <input v-model="step.camera_id" placeholder="cam_001 (tuỳ chọn)"></div>
      </div>

      <button class="btn btn-secondary mt-2" @click="addStep()">+ Thêm bước</button>

      <div class="flex justify-end gap-2 mt-4">
        <button class="btn btn-secondary" @click="showModal=false">Huỷ</button>
        <button class="btn btn-primary" @click="save()">Lưu</button>
      </div>
    </div>
  </div>
</div>`,

setup() {
  const rules = ref([]);
  const showModal = ref(false);
  const form = ref({});
  const lastResult = ref(null);

  async function load() {
    try {
      const res = await API.ai_logic.list();
      rules.value = res.rules || [];
      // Fetch step counts for each rule
      for (const r of rules.value) {
        try {
          const full = await API.ai_logic.get(r.id);
          r.step_count = full.steps ? full.steps.length : 0;
        } catch { r.step_count = 0; }
      }
    } catch (e) { rules.value = []; }
  }

  function openForm(r) {
    if (r) {
      form.value = { ...r, steps: r.steps ? [...r.steps] : [] };
    } else {
      form.value = {
        name: '', description: '', trigger_type: 'manual', cron_expression: '',
        cooldown_seconds: 60, enabled: true, steps: [],
      };
    }
    showModal.value = true;
    lastResult.value = null;
  }

  function addStep() {
    form.value.steps.push({
      action_type: 'goto_preset', camera_id: '', preset_id: null,
      duration_seconds: 10, config: { count: 1, interval_sec: 2 },
    });
  }

  function removeStep(idx) {
    form.value.steps.splice(idx, 1);
  }

  function onActionTypeChange(step) {
    if (step.action_type === 'wait') {
      step.duration_seconds = step.duration_seconds || 5;
    }
    if (step.action_type === 'record_video') {
      step.duration_seconds = step.duration_seconds || 10;
    }
    if (step.action_type === 'record_snapshot') {
      step.config = step.config || { count: 1, interval_sec: 2 };
    }
  }

  async function save() {
    try {
      // Clean up config for non-snapshot steps
      for (const step of form.value.steps) {
        if (step.action_type !== 'record_snapshot') {
          step.config = {};
        }
      }
      if (form.value.id) {
        await API.ai_logic.update(form.value.id, form.value);
      } else {
        await API.ai_logic.create(form.value);
      }
      showModal.value = false;
      showToast('Đã lưu');
      await load();
    } catch(e) { showToast(e.message, 'error'); }
  }

  async function remove(r) {
    if (!confirm('Xóa quy tắc ' + r.name + '?')) return;
    try { await API.ai_logic.del(r.id); showToast('Đã xóa'); await load(); }
    catch(e) { showToast(e.message, 'error'); }
  }

  async function toggleRule(r) {
    try {
      await API.ai_logic.toggle(r.id, !r.enabled);
      showToast(r.enabled ? 'Đã tắt' : 'Đã bật');
      await load();
    } catch(e) { showToast(e.message, 'error'); }
  }

  async function testRule(r) {
    try {
      lastResult.value = await API.ai_logic.execute(r.id);
      showToast(lastResult.value.success ? 'Hoàn thành' : 'Có lỗi', lastResult.value.success ? 'success' : 'error');
    } catch(e) { showToast(e.message, 'error'); }
  }

  onMounted(load);
  return { rules, showModal, form, lastResult, openForm, addStep, removeStep, onActionTypeChange, save, remove, toggleRule, testRule };
}
};

return component;