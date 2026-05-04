// Density Label Page - Polygon labeling for density segmentation + Train button
const { ref, onMounted, nextTick } = Vue;

const component = {
template: `
<div class="density-label-page">
  <div class="page-header">
    <h2 class="page-title">Density Labeling</h2>
    <div class="flex gap-2">
      <button class="btn btn-secondary" @click="captureMore">
        📷 Capture
      </button>
      <button class="btn btn-primary" @click="startTraining" :disabled="!canTrain || training">
        {{ training ? 'Training...' : '🚀 Train' }}
      </button>
    </div>
  </div>

  <!-- Stats -->
  <div class="grid grid-cols-4 gap-4 mb-4">
    <div class="card text-center">
      <div class="text-2xl font-bold">{{ stats.total }}</div>
      <div class="text-xs text-gray-400">Tong anh</div>
    </div>
    <div class="card text-center">
      <div class="text-2xl font-bold text-blue-500">{{ stats.labeled }}</div>
      <div class="text-xs text-gray-400">Da label</div>
    </div>
    <div class="card text-center">
      <div class="text-2xl font-bold text-green-500">{{ stats.trainReady }}</div>
      <div class="text-xs text-gray-400">San sang train</div>
    </div>
    <div class="card text-center">
      <div class="text-2xl font-bold text-yellow-500">{{ trainingProgress }}%</div>
      <div class="text-xs text-gray-400">Progress</div>
    </div>
  </div>

  <!-- Class Legend -->
  <div class="flex gap-4 mb-4 p-3 bg-gray-800 rounded">
    <div class="flex items-center gap-2">
      <div class="w-4 h-4 rounded" style="background: #22c55e;"></div>
      <span class="text-sm">Low (it ga)</span>
    </div>
    <div class="flex items-center gap-2">
      <div class="w-4 h-4 rounded" style="background: #eab308;"></div>
      <span class="text-sm">Medium (vua)</span>
    </div>
    <div class="flex items-center gap-2">
      <div class="w-4 h-4 rounded" style="background: #ef4444;"></div>
      <span class="text-sm">High (tu dong)</span>
    </div>
  </div>

  <!-- Main Content -->
  <div class="grid grid-cols-4 gap-4">
    <!-- Image List (1/4 width) -->
    <div class="col-span-1">
      <div class="card">
        <div class="font-medium mb-3">Anh ({{ images.length }})</div>
        <div style="max-height: 65vh; overflow-y: auto;">
          <div v-for="img in images" :key="img.id"
            class="flex items-center gap-2 p-2 mb-1 rounded cursor-pointer hover:bg-gray-700"
            :class="{'bg-blue-900': currentImage?.id === img.id}"
            @click="selectImage(img)">
            <img :src="'/dataset/' + img.filename" @error="imgSrcError"
                 class="w-12 h-12 object-cover rounded">
            <div class="flex-1 min-w-0">
              <div class="text-xs truncate">{{ img.filename.substring(0, 25) }}</div>
              <div class="text-xs text-gray-400">
                {{ img.original_width || img.width }}x{{ img.original_height || img.height }}
              </div>
            </div>
            <div v-if="img.labelCount > 0" class="w-2 h-2 rounded-full bg-green-500"></div>
          </div>
          <div v-if="!images.length" class="text-center text-gray-400 py-8">
            Chua co anh
          </div>
        </div>
      </div>
    </div>

    <!-- Canvas Area (3/4 width) -->
    <div class="col-span-3">
      <div class="card">
        <div class="flex justify-between items-center mb-3">
          <h3 class="truncate">{{ currentImage ? currentImage.filename : 'Chon anh de label' }}</h3>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-sm" @click="prevImage" :disabled="!canGoPrev">
              Prev
            </button>
            <button class="btn btn-secondary btn-sm" @click="nextImage" :disabled="!canGoNext">
              Next
            </button>
          </div>
        </div>

        <!-- Tool Bar -->
        <div class="flex gap-2 mb-3 p-2 bg-gray-800 rounded">
          <button v-for="cls in classes" :key="cls.id"
            class="btn btn-sm flex-1"
            :class="currentClass === cls.id ? 'btn-primary' : 'btn-secondary'"
            :style="currentClass === cls.id ? { borderColor: cls.color } : {}"
            @click="currentClass = cls.id">
            <span class="inline-block w-3 h-3 rounded mr-1" :style="{background: cls.color}"></span>
            {{ cls.name }}
          </button>
          <button class="btn btn-secondary btn-sm" @click="undoPoint" :disabled="currentPoints.length === 0">
            Undo
          </button>
          <button class="btn btn-secondary btn-sm" @click="clearAll">
            Clear
          </button>
        </div>

        <!-- Canvas Container -->
        <div class="canvas-container relative bg-black rounded overflow-hidden"
             ref="canvasContainer"
             style="min-height: 500px;">
          <div v-if="!currentImage" class="absolute inset-0 flex items-center justify-center text-gray-400">
            Chon anh tu danh sach ben trai
          </div>
          <div v-else class="relative flex items-center justify-center">
            <img ref="bgImage"
                 :src="imageUrl"
                 @load="onImageLoad"
                 @error="imgSrcError"
                 class="block max-w-full max-h-[65vh]">
            <canvas ref="drawCanvas"
                    class="absolute"
                    style="top: 50%; left: 50%; transform: translate(-50%, -50%);"
                    @mousedown="startDraw"
                    @mousemove="draw"
                    @mouseup="endDraw"
                    @mouseleave="endDraw"></canvas>
          </div>
        </div>

        <!-- Instructions -->
        <div class="text-xs text-gray-400 mt-2">
          Click de them diem. Click vao diem dau de dong polygon. {{ currentPoints.length }} diem hien tai.
        </div>

        <!-- Polygon List -->
        <div class="mt-3 max-h-32 overflow-y-auto">
          <div class="text-sm font-medium mb-2">Regions ({{ polygons.length }}):</div>
          <div v-for="(p, i) in polygons" :key="i"
            class="flex items-center gap-2 p-2 mb-1 rounded cursor-pointer hover:bg-gray-700"
            :class="selectedPolygon === i ? 'bg-gray-700' : 'bg-gray-800'"
            @click="selectedPolygon = i">
            <span class="inline-block w-3 h-3 rounded" :style="{background: p.color}"></span>
            <span class="flex-1">{{ p.className }} ({{ p.points.length }} diem)</span>
            <button class="text-red-400 text-sm" @click.stop="deletePolygon(i)">Xoa</button>
          </div>
          <div v-if="!polygons.length" class="text-xs text-gray-500">
            Chua co region nao
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Training Modal -->
  <div v-if="showTrainModal" class="modal-overlay" @click.self="showTrainModal = false">
    <div class="modal" style="max-width: 500px;">
      <h3>Train Density Model</h3>
      <div class="mt-4 space-y-3">
        <div>
          <label class="text-xs text-gray-400 block mb-1">Epochs</label>
          <input type="number" v-model="trainConfig.epochs" class="input w-full" min="10" max="300">
        </div>
        <div>
          <label class="text-xs text-gray-400 block mb-1">Image Size</label>
          <select v-model="trainConfig.imgsz" class="input w-full">
            <option value="640">640</option>
            <option value="1280">1280</option>
            <option value="1920">1920</option>
          </select>
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button class="btn btn-secondary" @click="showTrainModal = false">Huy</button>
        <button class="btn btn-primary" @click="confirmTrain">Bat dau Train</button>
      </div>
    </div>
  </div>

  <!-- Training Progress Modal -->
  <div v-if="showTrainingProgress" class="modal-overlay">
    <div class="modal" style="max-width: 500px;">
      <h3>Dang Training...</h3>
      <div class="mt-4">
        <div class="progress-bar">
          <div class="progress-fill" :style="{width: trainingProgress + '%'}"></div>
        </div>
        <div class="text-center mt-2">{{ trainingProgress }}%</div>
      </div>
    </div>
  </div>
</div>
`,

setup() {
  // Use reactive for currentPoints to ensure it's always accessible
  const currentPoints = ref([]);
  const images = ref([]);
  const currentImage = ref(null);
  const polygons = ref([]);
  const selectedPolygon = ref(-1);
  const currentClass = ref(0);
  const stats = ref({ total: 0, labeled: 0, trainReady: 0 });
  const training = ref(false);
  const trainingProgress = ref(0);
  const showTrainModal = ref(false);
  const showTrainingProgress = ref(false);
  const trainConfig = ref({ epochs: 50, imgsz: 1920 });

  const drawCanvas = ref(null);
  const bgImage = ref(null);
  const canvasContainer = ref(null);

  let isDrawing = false;
  let scale = 1;

  const classes = [
    { id: 0, name: 'Low', color: '#22c55e', description: 'It ga, phan tan' },
    { id: 1, name: 'Medium', color: '#eab308', description: 'Mat do vua' },
    { id: 2, name: 'High', color: '#ef4444', description: 'Tu dong quanh mang' },
  ];

  const canGoPrev = ref(false);
  const canGoNext = ref(false);
  const canTrain = ref(false);
  const imageUrl = ref('');

  function imgSrcError(e) {
    e.target.style.display = 'none';
  }

  async function loadImages() {
    try {
      let allImages = [];
      try {
        const res = await fetch('/api/ml/dataset/images?status=unlabeled');
        const data = await res.json();
        allImages = data.images || [];
      } catch (e) {}

      try {
        const res2 = await fetch('/api/ml/dataset/images?status=verified');
        const data2 = await res2.json();
        if (data2.images) {
          allImages = [...allImages, ...data2.images];
        }
      } catch (e) {}

      for (let img of allImages) {
        try {
          const detail = await fetch(`/api/ml/dataset/images/${img.id}`).then(r => r.json());
          img.labelCount = detail.labels?.length || 0;
        } catch {
          img.labelCount = 0;
        }
      }

      images.value = allImages;
      updateStats();
    } catch (e) {
      console.error('Load images error:', e);
    }
  }

  function updateStats() {
    stats.value.total = images.value.length;
    stats.value.labeled = images.value.filter(i => i.labelCount > 0).length;
    stats.value.trainReady = images.value.filter(i => i.labelCount > 0).length;
    canTrain.value = stats.value.trainReady >= 5;
  }

  function selectImage(img) {
    currentImage.value = img;
    imageUrl.value = '/dataset/' + img.filename;
    polygons.value = [];
    selectedPolygon.value = -1;
    currentPoints.value = [];
    loadPolygons(img.id);
  }

  async function loadPolygons(imageId) {
    try {
      // Use image detail endpoint which includes labels
      const res = await fetch(`/api/ml/dataset/images/${imageId}`);
      const data = await res.json();

      polygons.value = (data.labels || []).map(l => {
        const clsId = l.class_name === 'high_density' ? 2 : (l.class_name === 'medium_density' ? 1 : 0);
        return {
          id: l.id,
          classId: clsId,
          className: l.class_name,
          color: classes[clsId]?.color || '#22c55e',
          points: [],
          x_center: l.x_center,
          y_center: l.y_center,
          width: l.width,
          height: l.height
        };
      });
    } catch (e) {
      console.error(e);
    }
  }

  function onImageLoad() {
    nextTick(() => initCanvas());
  }

  function initCanvas() {
    if (!drawCanvas.value || !bgImage.value || !canvasContainer.value) return;

    const canvas = drawCanvas.value;
    const img = bgImage.value;

    if (!img.complete || img.naturalWidth === 0) {
      setTimeout(initCanvas, 100);
      return;
    }

    // Set canvas size to match image display size
    const rect = img.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Calculate scale factor
    scale = canvas.width / img.naturalWidth;

    redrawCanvas();
    updateNavButtons();
  }

  function redrawCanvas() {
    if (!drawCanvas.value) return;
    const canvas = drawCanvas.value;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw existing polygons (as bounding boxes for now)
    for (let i = 0; i < polygons.value.length; i++) {
      const p = polygons.value[i];

      if (p.width && p.height) {
        const x = (p.x_center - p.width / 2) * canvas.width;
        const y = (p.y_center - p.height / 2) * canvas.height;
        const w = p.width * canvas.width;
        const h = p.height * canvas.height;

        ctx.strokeStyle = p.color;
        ctx.lineWidth = selectedPolygon.value === i ? 4 : 2;
        ctx.fillStyle = p.color + '33';
        ctx.strokeRect(x, y, w, h);
        ctx.fillRect(x, y, w, h);
      }
    }

    // Draw current drawing polygon
    const pts = currentPoints.value;
    if (pts.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = classes[currentClass.value].color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.fillStyle = classes[currentClass.value].color + '22';

      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }

      if (pts.length > 2) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw points
      for (const pt of pts) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = classes[currentClass.value].color;
        ctx.fill();
      }
    }
  }

  function startDraw(e) {
    if (!currentImage.value) return;
    e.preventDefault();
    e.stopPropagation();

    const canvas = drawCanvas.value;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking near first point to close polygon
    const pts = currentPoints.value;
    if (pts.length > 2) {
      const first = pts[0];
      const dist = Math.sqrt((x - first.x) ** 2 + (y - first.y) ** 2);
      if (dist < 15) {
        closePolygon();
        return;
      }
    }

    currentPoints.value = [...pts, { x, y }];
    isDrawing = true;
    redrawCanvas();
  }

  function draw(e) {
    if (!isDrawing || currentPoints.value.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    redrawCanvas();
  }

  function endDraw(e) {
    isDrawing = false;
  }

  function closePolygon() {
    const pts = currentPoints.value;
    if (pts.length < 3) {
      showToast('Polygon can it nhat 3 diem', 'error');
      return;
    }

    // Calculate bounding box
    const xs = pts.map(pt => pt.x);
    const ys = pts.map(pt => pt.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const width = (maxX - minX) / drawCanvas.value.width;
    const height = (maxY - minY) / drawCanvas.value.height;
    const x_center = (minX + width * drawCanvas.value.width / 2) / drawCanvas.value.width;
    const y_center = (minY + height * drawCanvas.value.height / 2) / drawCanvas.value.height;

    const cls = classes[currentClass.value];
    polygons.value.push({
      id: null,
      classId: currentClass.value,
      className: cls.name.toLowerCase(),
      color: cls.color,
      points: [...pts],
      x_center: x_center,
      y_center: y_center,
      width: width,
      height: height
    });

    currentPoints.value = [];
    isDrawing = false;
    redrawCanvas();
    savePolygons();
  }

  function undoPoint() {
    const pts = currentPoints.value;
    if (pts.length > 0) {
      currentPoints.value = pts.slice(0, -1);
      redrawCanvas();
    }
  }

  async function savePolygons() {
    if (!currentImage.value) return;

    try {
      // Get existing labels from image detail endpoint
      const imgRes = await fetch(`/api/ml/dataset/images/${currentImage.value.id}`);
      const imgData = await imgRes.json();

      for (const l of imgData.labels || []) {
        await fetch(`/api/ml/dataset/images/${currentImage.value.id}/labels/${l.id}`, {
          method: 'DELETE'
        });
      }

      for (const p of polygons.value) {
        if (!p.width || !p.height) continue;

        await fetch(`/api/ml/dataset/images/${currentImage.value.id}/labels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            class_name: p.className,
            x_center: p.x_center,
            y_center: p.y_center,
            width: p.width,
            height: p.height
          })
        });
      }

      currentImage.value.labelCount = polygons.value.length;
      updateStats();
      showToast('Da luu regions!');
    } catch (e) {
      showToast('Loi khi luu: ' + e.message, 'error');
    }
  }

  function deletePolygon(index) {
    polygons.value.splice(index, 1);
    selectedPolygon.value = -1;
    redrawCanvas();
    savePolygons();
  }

  function clearAll() {
    if (!confirm('Xoa tat ca regions?')) return;
    polygons.value = [];
    currentPoints.value = [];
    redrawCanvas();
    savePolygons();
  }

  function prevImage() {
    const idx = images.value.findIndex(i => i.id === currentImage.value?.id);
    if (idx > 0) selectImage(images.value[idx - 1]);
  }

  function nextImage() {
    const idx = images.value.findIndex(i => i.id === currentImage.value?.id);
    if (idx < images.value.length - 1) selectImage(images.value[idx + 1]);
  }

  function updateNavButtons() {
    const idx = images.value.findIndex(i => i.id === currentImage.value?.id);
    canGoPrev.value = idx > 0;
    canGoNext.value = idx < images.value.length - 1;
  }

  async function captureMore() {
    try {
      showToast('Dang capture...');
      const res = await fetch('/api/ml/dataset/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camera_id: 'cam_0002',
          preset_ids: [1, 2, 3, 4, 5],
          shots_per_preset: 5,
          interval_sec: 2
        })
      });
      const data = await res.json();
      showToast(`Da capture ${data.captured_count} anh`);
      await loadImages();
    } catch (e) {
      showToast('Capture that bai: ' + e.message, 'error');
    }
  }

  function startTraining() {
    showTrainModal.value = true;
  }

  async function confirmTrain() {
    showTrainModal.value = false;
    showTrainingProgress.value = true;
    trainingProgress.value = 0;

    try {
      const res = await fetch('/api/ml/training/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          epochs: trainConfig.value.epochs,
          imgsz: trainConfig.value.imgsz
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }

      showToast('Training started!');
      pollProgress();
    } catch (e) {
      showToast('Training failed: ' + e.message, 'error');
      showTrainingProgress.value = false;
    }
  }

  async function pollProgress() {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/ml/training/progress');
        const data = await res.json();

        trainingProgress.value = Math.round(data.progress_pct || 0);

        if (!data.training && data.progress_pct >= 100) {
          clearInterval(interval);
          showTrainingProgress.value = false;
          trainingProgress.value = 100;
          showToast('Training hoan tat!');
        }
      } catch (e) {
        clearInterval(interval);
      }
    }, 2000);
  }

  onMounted(() => {
    loadImages();
  });

  return {
    currentPoints,
    images, currentImage, polygons, selectedPolygon, currentClass, classes,
    stats, training, trainingProgress, showTrainModal, showTrainingProgress,
    trainConfig, drawCanvas, bgImage, canvasContainer,
    canGoPrev, canGoNext, canTrain, imageUrl,
    loadImages, selectImage, onImageLoad, startDraw, draw, endDraw,
    undoPoint, deletePolygon, clearAll, prevImage, nextImage,
    captureMore, startTraining, confirmTrain, imgSrcError
  };
}
};

return component;
