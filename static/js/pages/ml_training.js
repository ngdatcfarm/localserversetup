// ML Training Page - Train YOLOv8 on chick dataset.

const { ref, onMounted, onUnmounted } = Vue;

const component = {
template: `
<div class="training-page">
  <div class="page-header">
    <h2 class="page-title">Train Model</h2>
    <div class="flex gap-2">
      <button class="btn btn-secondary" @click="exportDataset" :disabled="training">
        📤 Export Dataset
      </button>
      <button class="btn btn-primary" @click="startTrain" :disabled="training || !canTrain">
        {{ training ? '🔄 Training...' : '🚀 Train Model' }}
      </button>
    </div>
  </div>

  <!-- Status Cards -->
  <div class="grid grid-cols-3 gap-4 mb-4">
    <div class="card text-center">
      <div class="text-2xl font-bold">{{ stats.total_images }}</div>
      <div class="text-xs text-gray-400">Tổng ảnh</div>
    </div>
    <div class="card text-center">
      <div class="text-2xl font-bold text-green-500">{{ stats.verified_images }}</div>
      <div class="text-xs text-gray-400">Đã verify</div>
    </div>
    <div class="card text-center">
      <div class="text-2xl font-bold text-blue-500">{{ stats.total_bboxes }}</div>
      <div class="text-xs text-gray-400">Tổng bbox</div>
    </div>
  </div>

  <!-- Training Progress -->
  <div v-if="training" class="card mb-4">
    <div class="flex items-center gap-3 mb-3">
      <div class="spinner"></div>
      <span class="font-medium">Đang training YOLOv8n...</span>
    </div>
    <p class="text-sm text-gray-400">
      Model đang được train với dataset của bạn. Quá trình này sẽ mất 15-30 phút tùy GPU.
      Có thể đóng tab này và làm việc khác - training vẫn tiếp tục trong background.
    </p>
    <div class="progress-bar mt-3">
      <div class="progress-fill" style="width: 100%; animation: pulse 2s infinite;"></div>
    </div>
  </div>

  <!-- Model Info -->
  <div v-if="modelInfo.exists" class="card mb-4" style="border-left: 4px solid var(--primary);">
    <div class="flex justify-between items-center">
      <div>
        <div class="font-medium text-green-600 flex items-center gap-2">
          ✓ Model đã train xong
        </div>
        <div class="text-xs text-gray-400 mt-1">
          Last trained: {{ formatTime(modelInfo.last_trained) }}
        </div>
        <div class="text-xs text-gray-500 mt-1 font-mono">{{ modelInfo.path }}</div>
      </div>
      <button class="btn btn-secondary btn-sm" @click="testModel">🧪 Test Model</button>
    </div>
  </div>

  <!-- Train Options -->
  <div class="card mb-4">
    <h4 class="font-medium mb-3">Cấu hình training</h4>
    <div class="grid grid-cols-2 gap-4">
      <div class="form-group">
        <label>Số epochs</label>
        <input v-model.number="trainConfig.epochs" type="number" min="10" max="200">
        <p class="text-xs text-gray-400 mt-1">Nhiều epochs = accuracy cao hơn nhưng chậm hơn</p>
      </div>
      <div class="form-group">
        <label>Image size</label>
        <select v-model.number="trainConfig.imgsz">
          <option :value="320">320 (nhanh)</option>
          <option :value="480">480 (trung bình)</option>
          <option :value="640">640 (mặc định)</option>
          <option :value="800">800 (chất lượng cao)</option>
        </select>
        <p class="text-xs text-gray-400 mt-1">Kích thước ảnh đầu vào</p>
      </div>
    </div>
  </div>

  <!-- Instructions -->
  <div class="card">
    <h4 class="font-medium mb-2">📚 Hướng dẫn</h4>
    <div class="text-sm text-gray-400 space-y-2">
      <p>1. Vào tab <strong>Dataset ML</strong> để thêm và label ảnh gà con</p>
      <p>2. Verify các ảnh đã label xong</p>
      <p>3. Quay lại tab này và click <strong>Train Model</strong></p>
      <p>4. Sau khi train xong, model sẽ được dùng trong tab <strong>Đếm gà</strong></p>
    </div>
  </div>
</div>
`,

setup() {
  const training = ref(false);
  const canTrain = ref(false);
  const stats = ref({
    total_images: 0,
    verified_images: 0,
    labeled_images: 0,
    total_bboxes: 0,
    model_exists: false,
  });
  const modelInfo = ref({ exists: false, path: '', last_trained: null });
  const trainConfig = ref({ epochs: 50, imgsz: 640 });

  let pollInterval = null;

  async function loadStatus() {
    try {
      const res = await API.ml_training.status();
      training.value = res.training;
      modelInfo.value = {
        exists: res.model_exists,
        path: res.last_model_path || '',
        last_trained: res.last_trained,
      };
      stats.value = {
        total_images: res.dataset.total_images,
        verified_images: res.dataset.verified_images,
        labeled_images: res.dataset.labeled_images,
        total_bboxes: res.dataset.total_bboxes,
        model_exists: res.dataset.model_exists,
      };
      canTrain.value = res.dataset.total_bboxes >= 5 && !res.training;
    } catch (e) {
      console.error('Failed to load training status:', e);
    }
  }

  async function exportDataset() {
    try {
      showToast('Đang export dataset...');
      const res = await API.ml_training.export();
      showToast(`Export thành công! ${res.exported_images} ảnh`);
      await loadStatus();
    } catch (e) {
      showToast('Export thất bại: ' + e.message, 'error');
    }
  }

  async function startTrain() {
    try {
      showToast('Đang bắt đầu training...');
      const res = await API.ml_training.train(trainConfig.value);
      showToast(res.message);
      training.value = true;
      // Start polling
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(loadStatus, 30000); // Poll every 30s
    } catch (e) {
      showToast('Training failed: ' + e.message, 'error');
    }
  }

  function testModel() {
    showToast('Chức năng test model đang phát triển...');
  }

  function formatTime(isoString) {
    if (!isoString) return 'Never';
    const d = new Date(isoString);
    return d.toLocaleString('vi-VN');
  }

  onMounted(() => {
    loadStatus();
    // Poll more frequently when training
    pollInterval = setInterval(() => {
      loadStatus();
      if (!training.value && pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }, 5000);
  });

  onUnmounted(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  return {
    training, canTrain, stats, modelInfo, trainConfig,
    exportDataset, startTrain, testModel, formatTime,
  };
}
};

return component;