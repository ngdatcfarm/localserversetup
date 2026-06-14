// ML Dataset Page - Upload, label, and export training data.

const { ref, onMounted, nextTick } = Vue;

const component = {
template: `
<div class="dataset-page">
  <div class="page-header">
    <h2 class="page-title">Dataset ML</h2>
    <div class="flex gap-2">
      <button class="btn btn-primary" @click="showUpload = true">+ Upload ảnh</button>
      <button class="btn btn-secondary" @click="exportDataset" :disabled="stats.total_images === 0">
        📦 Export YOLO
      </button>
    </div>
  </div>

  <!-- Stats -->
  <div class="grid grid-cols-4 gap-4 mb-4">
    <div class="card text-center">
      <div class="text-2xl font-bold">{{ stats.total_images }}</div>
      <div class="text-xs text-gray-400">Tổng ảnh</div>
    </div>
    <div class="card text-center">
      <div class="text-2xl font-bold text-yellow-500">{{ stats.unlabeled }}</div>
      <div class="text-xs text-gray-400">Chưa label</div>
    </div>
    <div class="card text-center">
      <div class="text-2xl font-bold text-blue-500">{{ stats.labeled }}</div>
      <div class="text-xs text-gray-400">Đã label</div>
    </div>
    <div class="card text-center">
      <div class="text-2xl font-bold text-green-500">{{ stats.verified }}</div>
      <div class="text-xs text-gray-400">Verified</div>
    </div>
  </div>

  <!-- Filter tabs -->
  <div class="flex gap-2 mb-4">
    <button v-for="s in ['all', 'unlabeled', 'labeled', 'verified']" :key="s"
      :class="filter === s ? 'btn-primary' : 'btn-secondary'"
      class="btn btn-sm" @click="filter = s; loadImages()">
      {{ s === 'all' ? 'Tất cả' : s }}
    </button>
  </div>

  <!-- Image grid -->
  <div v-if="images.length" class="image-grid">
    <div v-for="img in images" :key="img.id" class="image-card" @click="openLabeler(img)">
      <img :src="'/dataset/' + img.filepath.split(/[\\\\/]/).pop()" @error="imgSrcError" class="thumb">
      <div class="image-info">
        <span class="badge" :class="{
          'badge-yellow': img.label_status === 'unlabeled',
          'badge-blue': img.label_status === 'labeled',
          'badge-green': img.label_status === 'verified'
        }">{{ img.label_status }}</span>
        <span class="text-xs text-gray-400">{{ img.original_width }}x{{ img.original_height }}</span>
      </div>
      <div class="image-overlay">
        <span v-if="getLabelCount(img.id) > 0" class="bbox-count">{{ getLabelCount(img.id) }} bbox</span>
        <span v-else class="no-label">Click để label</span>
      </div>
    </div>
  </div>
  <div v-else class="empty-state">
    <div class="icon">🖼️</div>
    <p>Chưa có ảnh nào</p>
    <button class="btn btn-primary mt-2" @click="showUpload = true">Upload ảnh đầu tiên</button>
  </div>

  <!-- Upload Modal -->
  <div v-if="showUpload" class="modal-overlay" @click.self="showUpload = false">
    <div class="modal" style="max-width: 500px;">
      <h3>Upload ảnh dataset</h3>
      <div class="upload-zone" @dragover.prevent @drop.prevent="handleDrop"
        :class="{'drag-over': isDragging}"
        @dragenter="isDragging = true" @dragleave="isDragging = false">
        <input type="file" ref="fileInput" multiple accept="image/*" @change="handleFileSelect" class="hidden">
        <div v-if="!uploading">
          <p>Kéo thả ảnh vào đây hoặc</p>
          <button class="btn btn-secondary mt-2" @click="$refs.fileInput.click()">Chọn file</button>
        </div>
        <div v-else>
          <p>Đang upload...</p>
          <div class="progress-bar mt-2">
            <div class="progress-fill" :style="{width: uploadProgress + '%'}"></div>
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button class="btn btn-secondary" @click="showUpload = false">Đóng</button>
      </div>
    </div>
  </div>

  <!-- Label Editor Modal -->
  <div v-if="currentImage" class="modal-overlay" @click.self="closeLabeler" :class="{'fullscreen-mode': isFullscreen}">
    <div class="modal" :style="isFullscreen ? 'max-width: 100vw; width: 100vw; height: 100vh;' : ''">
      <div class="flex justify-between items-center mb-3">
        <h3>Label: {{ currentImage.filename }}</h3>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" @click="toggleFullscreen" :title="isFullscreen ? 'Thu nhỏ' : 'Phóng to'">
            {{ isFullscreen ? '⛶ Thu nhỏ' : '⛶ Full' }}
          </button>
          <button v-if="currentImage.label_status !== 'verified'"
            :class="currentImage.label_status === 'labeled' ? 'btn-success' : 'btn-secondary'"
            class="btn btn-sm" @click="markVerified">
            ✓ Verify
          </button>
          <button class="btn btn-danger btn-sm" @click="deleteImage">Xóa ảnh</button>
          <button class="btn btn-secondary btn-sm" @click="closeLabeler">Đóng</button>
        </div>
      </div>

      <!-- Canvas for drawing bboxes -->
      <div class="labeler-container" :class="{'fullscreen': isFullscreen}">
        <div class="canvas-wrapper" ref="canvasWrapper">
          <canvas ref="labelCanvas" @mousedown="startDraw" @mousemove="draw" @mouseup="endDraw" @mouseleave="endDraw"></canvas>
          <img ref="labelImg" :src="'/dataset/' + currentImage.filepath.split(/[\\\\/]/).pop()"
            @load="onImgLoad" @error="imgSrcError" class="labeler-img">
        </div>

        <!-- Tool panel -->
        <div class="labeler-tools" :class="{'fullscreen-tools': isFullscreen}">
          <div class="text-sm mb-3">
            <div class="font-medium mb-2">Hướng dẫn:</div>
            <div class="text-xs text-gray-400">
              1. Click và kéo để vẽ bounding box<br>
              2. Click vào bbox để xóa<br>
              3. Bbox được lưu tự động
            </div>
          </div>

          <div class="text-sm mb-3">
            <div class="font-medium mb-1">Danh sách bbox ({{ currentLabels.length }})</div>
            <div v-for="(l, i) in currentLabels" :key="l.id"
              class="bbox-item" @click="removeLabel(l.id)">
              #{{ i+1 }}: chick [{{ Math.round(l.x_center * 100) }}%, {{ Math.round(l.y_center * 100) }}%]
              <span class="text-red-500 text-xs ml-1">✕</span>
            </div>
            <div v-if="!currentLabels.length" class="text-xs text-gray-500 mt-2">
              Chưa có bbox nào
            </div>
          </div>

          <button class="btn btn-secondary btn-sm w-full" @click="clearAllLabels">
            Xóa tất cả bbox
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
`,

setup() {
  const images = ref([]);
  const showUpload = ref(false);
  const uploading = ref(false);
  const uploadProgress = ref(0);
  const isDragging = ref(false);
  const filter = ref('all');
  const stats = ref({ total_images: 0, unlabeled: 0, labeled: 0, verified: 0, total_bboxes: 0 });
  const labelCounts = ref({});

  // Labeler state
  const currentImage = ref(null);
  const currentLabels = ref([]);
  const labelCanvas = ref(null);
  const labelImg = ref(null);
  const canvasWrapper = ref(null);
  const isFullscreen = ref(false);

  let isDrawing = false;
  let startX = 0, startY = 0;
  let scale = 1;
  let offsetX = 0, offsetY = 0;

  async function loadImages() {
    try {
      const status = filter.value === 'all' ? null : filter.value;
      const res = await API.ml_dataset.images(status);
      images.value = res.images || [];
    } catch (e) { console.error(e); }
  }

  async function loadStats() {
    try {
      stats.value = await API.ml_dataset.stats();
    } catch (e) { console.error(e); }
  }

  function imgSrcError(e) {
    e.target.style.display = 'none';
  }

  async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length) await uploadFiles(files);
  }

  async function handleDrop(e) {
    isDragging.value = false;
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) await uploadFiles(files);
  }

  async function uploadFiles(files) {
    uploading.value = true;
    uploadProgress.value = 0;

    try {
      if (files.length === 1) {
        const formData = new FormData();
        formData.append('file', files[0]);
        await fetch('/api/ml/dataset/upload', { method: 'POST', body: formData });
      } else {
        // Batch upload
        for (let i = 0; i < files.length; i++) {
          const formData = new FormData();
          formData.append('files', files[i]);
          await fetch('/api/ml/dataset/upload-batch', {
            method: 'POST',
            body: formData
          });
          uploadProgress.value = Math.round(((i + 1) / files.length) * 100);
        }
      }
      showUpload.value = false;
      await loadImages();
      await loadStats();
      showToast('Upload thành công!');
    } catch (e) {
      showToast('Upload thất bại: ' + e.message, 'error');
    }
    uploading.value = false;
  }

  async function exportDataset() {
    try {
      showToast('Đang export...');
      const res = await fetch('/api/ml/dataset/export');
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'chick_dataset.zip';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Export thành công!');
    } catch (e) {
      showToast('Export thất bại: ' + e.message, 'error');
    }
  }

  function getLabelCount(imgId) {
    return labelCounts.value[imgId] || 0;
  }

  async function openLabeler(img) {
    currentImage.value = img;
    currentLabels.value = [];
    labelCounts.value[img.id] = 0;

    // Load labels
    try {
      const res = await API.ml_dataset.getImage(img.id);
      currentLabels.value = res.labels || [];
      labelCounts.value[img.id] = currentLabels.value.length;
    } catch (e) { console.error(e); }

    await nextTick();
    initCanvas();
  }

  function closeLabeler() {
    currentImage.value = null;
    isFullscreen.value = false;
    if (labelCanvas.value) {
      const ctx = labelCanvas.value.getContext('2d');
      ctx.clearRect(0, 0, labelCanvas.value.width, labelCanvas.value.height);
    }
  }

  async function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value;
    await nextTick();
    initCanvas();
  }

  function initCanvas() {
    if (!labelCanvas.value || !labelImg.value || !canvasWrapper.value) return;

    const canvas = labelCanvas.value;
    const img = labelImg.value;
    const wrapper = canvasWrapper.value;

    // Wait for image to load
    if (!img.complete) {
      img.onload = initCanvas;
      return;
    }

    // Calculate scale to fit in wrapper
    const wrapperW = wrapper.clientWidth - 20;
    const wrapperH = Math.min(window.innerHeight * 0.6, img.naturalHeight);

    scale = Math.min(wrapperW / img.naturalWidth, wrapperH / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;

    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    offsetX = (wrapper.clientWidth - w) / 2;
    offsetY = 0;

    redrawCanvas();
  }

  function redrawCanvas() {
    if (!labelCanvas.value) return;
    const canvas = labelCanvas.value;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw existing labels
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    for (const l of currentLabels.value) {
      const x = (l.x_center - l.width / 2) * canvas.width;
      const y = (l.y_center - l.height / 2) * canvas.height;
      const w = l.width * canvas.width;
      const h = l.height * canvas.height;
      ctx.strokeRect(x, y, w, h);
    }
  }

  function getCanvasCoords(e) {
    const rect = labelCanvas.value.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / labelCanvas.value.width,
      y: (e.clientY - rect.top) / labelCanvas.value.height
    };
  }

  function startDraw(e) {
    const coords = getCanvasCoords(e);
    startX = coords.x;
    startY = coords.y;
    isDrawing = true;
  }

  function draw(e) {
    if (!isDrawing) return;
    const coords = getCanvasCoords(e);

    redrawCanvas();

    // Draw current selection
    const canvas = labelCanvas.value;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    const x = Math.min(startX, coords.x) * canvas.width;
    const y = Math.min(startY, coords.y) * canvas.height;
    const w = Math.abs(coords.x - startX) * canvas.width;
    const h = Math.abs(coords.y - startY) * canvas.height;

    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  async function endDraw(e) {
    if (!isDrawing) return;
    isDrawing = false;

    const coords = getCanvasCoords(e);
    const x = Math.min(startX, coords.x);
    const y = Math.min(startY, coords.y);
    const w = Math.abs(coords.x - startX);
    const h = Math.abs(coords.y - startY);

    if (w < 0.01 || h < 0.01) return; // Too small

    // Save label
    try {
      const res = await API.ml_dataset.addLabel(currentImage.value.id, {
        class_name: 'chick',
        x_center: x + w / 2,
        y_center: y + h / 2,
        width: w,
        height: h
      });
      currentLabels.value.push(res.label);
      labelCounts.value[currentImage.value.id] = currentLabels.value.length;
      redrawCanvas();
    } catch (e) {
      showToast('Lỗi khi lưu bbox: ' + e.message, 'error');
    }
  }

  async function removeLabel(labelId) {
    try {
      await API.ml_dataset.deleteLabel(currentImage.value.id, labelId);
      currentLabels.value = currentLabels.value.filter(l => l.id !== labelId);
      labelCounts.value[currentImage.value.id] = currentLabels.value.length;
      redrawCanvas();
    } catch (e) {
      showToast('Lỗi khi xóa bbox: ' + e.message, 'error');
    }
  }

  async function clearAllLabels() {
    if (!confirm('Xóa tất cả bbox?')) return;
    for (const l of [...currentLabels.value]) {
      try {
        await API.ml_dataset.deleteLabel(currentImage.value.id, l.id);
      } catch (e) {}
    }
    currentLabels.value = [];
    labelCounts.value[currentImage.value.id] = 0;
    redrawCanvas();
  }

  async function markVerified() {
    try {
      await API.ml_dataset.updateStatus(currentImage.value.id, 'verified');
      currentImage.value.label_status = 'verified';
      await loadImages();
      await loadStats();
      showToast('Đã verify!');
    } catch (e) {
      showToast('Lỗi: ' + e.message, 'error');
    }
  }

  async function deleteImage() {
    if (!confirm('Xóa ảnh này?')) return;
    try {
      await API.ml_dataset.deleteImage(currentImage.value.id);
      closeLabeler();
      await loadImages();
      await loadStats();
      showToast('Đã xóa');
    } catch (e) {
      showToast('Lỗi: ' + e.message, 'error');
    }
  }

  onMounted(() => {
    loadImages();
    loadStats();
  });

  return {
    images, showUpload, uploading, uploadProgress, isDragging,
    filter, stats, labelCounts, currentImage, currentLabels,
    labelCanvas, labelImg, canvasWrapper, isFullscreen,
    handleFileSelect, handleDrop, exportDataset, imgSrcError,
    getLabelCount, openLabeler, closeLabeler, toggleFullscreen, startDraw, draw, endDraw,
    removeLabel, clearAllLabels, markVerified, deleteImage,
  };
}
};

export default component;
