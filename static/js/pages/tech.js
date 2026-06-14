// TECH Dashboard - Unified AI/ML panel with density analysis

const { ref, onMounted, nextTick } = Vue;

const component = {
template: `
<div class="tech-page">
  <div class="page-header">
    <h2 class="page-title">TECH Dashboard</h2>
    <div class="flex gap-2">
      <button v-for="tab in tabs" :key="tab.id"
        :class="activeTab === tab.id ? 'btn-primary' : 'btn-secondary'"
        class="btn btn-sm" @click="activeTab = tab.id">
        {{ tab.icon }} {{ tab.label }}
      </button>
    </div>
  </div>

  <!-- ============ YOLO DETECTION TAB ============ -->
  <div v-if="activeTab === 'hsv'" class="tech-section">
    <div class="grid grid-cols-2 gap-4">
      <!-- Left: Controls -->
      <div class="card">
        <h3 class="font-medium mb-3">🐔 YOLO Chicken Detection</h3>

        <div class="form-group">
          <label class="text-xs">Camera</label>
          <select v-model="calForm.camera_id" @change="onCalCameraChange" class="w-full">
            <option value="">-- Chọn camera --</option>
            <option v-for="c in cameras" :key="c.id" :value="c.id">{{ c.id }}</option>
          </select>
        </div>

        <div class="form-group mt-3">
          <label class="text-xs">Preset</label>
          <select v-model="calForm.preset_id" class="w-full" :disabled="!calForm.camera_id">
            <option :value="1">Preset 1 (overview)</option>
            <option v-for="p in calPresets" :key="p.number" :value="p.number">{{ p.name || 'Preset ' + p.number }}</option>
          </select>
        </div>

        <div class="form-group mt-3">
          <label class="text-xs">Confidence threshold</label>
          <input v-model.number="calForm.confidence" type="range" min="0.01" max="0.9" step="0.05" class="w-full">
          <span class="text-xs text-gray-400">{{ calForm.confidence }}</span>
        </div>

        <div class="mt-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="calForm.move_to_preset" class="mr-2">
            <span class="text-sm">Di chuyển PTZ tới preset</span>
          </label>
        </div>

        <div class="grid grid-cols-2 gap-3 mt-4">
          <div class="form-group mb-0">
            <label class="text-xs">Snapshot count</label>
            <input v-model.number="calForm.snapshot_count" type="number" min="1" max="10">
          </div>
          <div class="form-group mb-0">
            <label class="text-xs">Grid size</label>
            <input v-model.number="calForm.grid_size" type="number" min="2" max="8">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 mt-4">
          <button class="btn btn-primary" @click="runYoloDetection" :disabled="testing || !calForm.camera_id">
            {{ testing ? 'Đang phân tích...' : '🔍 Phân tích' }}
          </button>
          <button class="btn btn-secondary" @click="generateHeatmap" :disabled="testing || !calForm.camera_id">
            🗺️ Heatmap
          </button>
        </div>
      </div>

      <!-- Right: Results -->
      <div class="card">
        <h4 class="text-sm font-medium mb-3">Kết quả</h4>
        <div v-if="yoloResult && yoloResult.success" class="space-y-3">
          <!-- Summary stats -->
          <div class="grid grid-cols-3 gap-2">
            <div class="bg-gray-800 rounded p-3 text-center">
              <div class="text-2xl font-bold text-green-500">{{ yoloResult.total_chickens || 0 }}</div>
              <div class="text-xs text-gray-400">Tổng gà</div>
            </div>
            <div class="bg-gray-800 rounded p-3 text-center">
              <div class="text-2xl font-bold text-yellow-500">{{ yoloResult.total_feeders || 0 }}</div>
              <div class="text-xs text-gray-400">Máng ăn</div>
            </div>
            <div class="bg-gray-800 rounded p-3 text-center">
              <div class="text-2xl font-bold text-blue-500">{{ yoloResult.density_level || 'N/A' }}</div>
              <div class="text-xs text-gray-400">Mật độ</div>
            </div>
          </div>

          <!-- Confidence distribution -->
          <div v-if="yoloResult.confidence_distribution" class="p-3 bg-gray-900 rounded">
            <div class="text-sm font-medium mb-2">Confidence distribution:</div>
            <div class="grid grid-cols-5 gap-1">
              <div v-for="(count, key) in yoloResult.confidence_distribution" :key="key"
                class="text-center p-1 bg-gray-800 rounded">
                <div class="text-sm font-bold">{{ count }}</div>
                <div class="text-xs text-gray-500">{{ key }}</div>
              </div>
            </div>
            <div class="text-xs text-gray-400 mt-2">
              Avg confidence: {{ (yoloResult.avg_confidence || 0).toFixed(3) }}
            </div>
          </div>

          <!-- Feeder counts -->
          <div v-if="yoloResult.feeder_counts && yoloResult.feeder_counts.length" class="p-3 bg-gray-900 rounded">
            <div class="text-sm font-medium mb-2">Gà quanh mỗi máng:</div>
            <div class="flex gap-2 flex-wrap">
              <span v-for="(cnt, i) in yoloResult.feeder_counts" :key="i"
                class="bg-gray-700 px-2 py-1 rounded text-sm">
                Máng {{ i+1 }}: <span class="text-yellow-500 font-bold">{{ cnt }}</span>
              </span>
            </div>
          </div>

          <!-- Density grid -->
          <div v-if="yoloResult.density_grid" class="p-3 bg-gray-900 rounded">
            <div class="text-sm font-medium mb-2">Mật độ theo vùng ({{ calForm.grid_size }}x{{ calForm.grid_size }}):</div>
            <div class="grid gap-1" :style="'grid-template-columns: repeat(' + calForm.grid_size + ', 1fr)'">
              <div v-for="(val, idx) in yoloResult.density_grid.flat()" :key="idx"
                class="text-center text-xs py-1 rounded"
                :class="getDensityCellClass(val, yoloResult.density_max)">
                {{ val }}
              </div>
            </div>
          </div>

          <!-- Heatmap result -->
          <div v-if="heatmapImage" class="p-3 bg-gray-900 rounded">
            <div class="text-sm font-medium mb-2">Heatmap:</div>
            <img :src="'/snapshots/' + heatmapImage" class="rounded" style="max-width:100%; border:1px solid var(--border);">
          </div>

          <!-- Debug image -->
          <div v-if="yoloResult.debug_image" class="mt-3">
            <div class="text-xs text-gray-400 mb-1">Debug visualization:</div>
            <img :src="'/snapshots/' + yoloResult.debug_image" class="rounded" style="max-width:100%; border:1px solid var(--border);">
          </div>

          <!-- All boxes (collapsible) -->
          <details v-if="yoloResult.all_boxes && yoloResult.all_boxes.length" class="mt-2">
            <summary class="text-sm cursor-pointer text-gray-400">All boxes ({{ yoloResult.all_boxes.length }})</summary>
            <div class="mt-2 max-h-48 overflow-y-auto bg-gray-900 rounded p-2">
              <div v-for="(box, i) in yoloResult.all_boxes" :key="i"
                class="text-xs py-1 border-b border-gray-800">
                #{{ i+1 }} {{ box.class_name }}: {{ box.conf.toFixed(3) }}
                at [{{ box.center[0].toFixed(0) }}, {{ box.center[1].toFixed(0) }}]
              </div>
            </div>
          </details>
        </div>
        <div v-else class="aspect-video bg-gray-800 rounded flex items-center justify-center">
          <span class="text-gray-500">Chọn camera và nhấn Phân tích YOLO</span>
        </div>
      </div>
    </div>
  </div>

  <!-- ============ DATASET TAB ============ -->
  <div v-if="activeTab === 'dataset'" class="tech-section">
    <!-- Stats -->
    <div class="grid grid-cols-5 gap-4 mb-4">
      <div class="card text-center">
        <div class="text-2xl font-bold">{{ mlStats.total_images }}</div>
        <div class="text-xs text-gray-400">Tổng ảnh</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-yellow-500">{{ mlStats.unlabeled }}</div>
        <div class="text-xs text-gray-400">Chưa label</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-blue-500">{{ mlStats.labeled }}</div>
        <div class="text-xs text-gray-400">Đã label</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-green-500">{{ mlStats.verified }}</div>
        <div class="text-xs text-gray-400">Verified</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-purple-500">{{ mlStats.total_bboxes }}</div>
        <div class="text-xs text-gray-400">Tổng bbox</div>
      </div>
    </div>

    <!-- Capture and Upload -->
    <div class="flex gap-2 mb-4">
      <button class="btn btn-primary" @click="showCapture = true">📷 Capture ảnh</button>
      <button class="btn btn-secondary" @click="showUpload = true">+ Upload ảnh</button>
      <button class="btn btn-secondary" @click="exportDataset" :disabled="mlStats.total_images === 0">
        📦 Export YOLO
      </button>
      <div class="flex gap-1 ml-auto">
        <button v-for="s in ['all', 'unlabeled', 'labeled', 'verified']" :key="s"
          :class="filter === s ? 'btn-primary' : 'btn-secondary'"
          class="btn btn-sm" @click="filter = s; loadImages()">
          {{ s === 'all' ? 'Tất cả' : s }}
        </button>
      </div>
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
          <span v-if="img.split" class="badge" :class="img.split === 'train' ? 'badge-purple' : 'badge-orange'">
            {{ img.split }}
          </span>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <div class="icon">🖼️</div><p>Chưa có ảnh nào</p>
    </div>

    <!-- Capture Modal -->
    <div v-if="showCapture" class="modal-overlay" @click.self="showCapture = false">
      <div class="modal" style="max-width: 500px;">
        <h3>📷 Capture ảnh cho Dataset</h3>
        <div class="form-group">
          <label>Camera</label>
          <select v-model="captureForm.camera_id" class="w-full" @change="onCaptureCameraChange">
            <option value="">-- Chọn camera --</option>
            <option v-for="c in cameras" :key="c.id" :value="c.id">{{ c.id }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Presets để capture</label>
          <div class="flex flex-wrap gap-2 mt-1">
            <label v-for="p in capturePresets" :key="p.number" class="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" :value="p.number" v-model="captureForm.preset_ids">
              {{ p.name || 'Preset ' + p.number }}
            </label>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="form-group">
            <label>Ảnh/preset</label>
            <input v-model.number="captureForm.shots_per_preset" type="number" min="1" max="50">
          </div>
          <div class="form-group">
            <label>Interval (giây)</label>
            <input v-model.number="captureForm.interval_sec" type="number" min="0.5" max="10" step="0.5">
          </div>
        </div>
        <div v-if="capturing" class="mt-3">
          <div class="text-sm">Đang capture... {{ captureProgress }}/{{ captureTotal }}</div>
          <div class="w-full bg-gray-700 rounded-full h-2 mt-1">
            <div class="bg-blue-500 h-2 rounded-full" :style="'width:' + (captureProgress/captureTotal*100) + '%'"></div>
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <button class="btn btn-secondary" @click="showCapture = false">Đóng</button>
          <button class="btn btn-primary" @click="startCapture" :disabled="!captureForm.camera_id || capturing">
            {{ capturing ? 'Đang capture...' : 'Bắt đầu capture' }}
          </button>
        </div>
      </div>
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
          <div v-else>Đang upload...</div>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <button class="btn btn-secondary" @click="showUpload = false">Đóng</button>
        </div>
      </div>
    </div>

    <!-- Labeler Modal -->
    <div v-if="currentImage" class="modal-overlay fullscreen-mode" @click.self="closeLabeler">
      <div class="modal" :style="isFullscreen ? 'max-width:100vw;width:100vw;height:100vh;' : 'max-width:1100px;'">
        <div class="flex justify-between items-center mb-3">
          <div class="flex items-center gap-4">
            <h3>{{ currentImage.filename }}</h3>
            <div class="flex gap-2 text-sm">
              <span class="badge" :class="getBboxBadgeClass('chick')">🐔 Chick: {{ getBboxCount('chick') }}</span>
              <span class="badge" :class="getBboxBadgeClass('feeder')">🥣 Feeder: {{ getBboxCount('feeder') }}</span>
            </div>
          </div>
          <div class="flex gap-2">
            <!-- Class selector -->
            <select v-model="currentClass" class="bg-gray-700 text-white px-2 py-1 rounded">
              <option value="chick">🐔 Chick</option>
              <option value="feeder">🥣 Feeder</option>
            </select>
            <button class="btn btn-secondary btn-sm" @click="toggleFullscreen">
              {{ isFullscreen ? '⛶ Thu nhỏ' : '⛶ Full' }}
            </button>
            <button v-if="currentImage.label_status !== 'verified'"
              :class="currentImage.label_status === 'labeled' ? 'btn-success' : 'btn-secondary'"
              class="btn btn-sm" @click="markVerified">✓ Verify</button>
            <button class="btn btn-danger btn-sm" @click="deleteImage">Xóa</button>
            <button class="btn btn-secondary btn-sm" @click="closeLabeler">Đóng</button>
          </div>
        </div>
        <div class="text-xs text-gray-400 mb-2">
          Hotkeys: <kbd class="bg-gray-700 px-1 rounded">1</kbd> Chick,
          <kbd class="bg-gray-700 px-1 rounded">2</kbd> Feeder,
          <kbd class="bg-gray-700 px-1 rounded">←</kbd><kbd class="bg-gray-700 px-1 rounded">→</kbd> Prev/Next,
          <kbd class="bg-gray-700 px-1 rounded">Del</kbd> Remove selected,
          <kbd class="bg-gray-700 px-1 rounded">Scroll</kbd> Zoom
        </div>
        <div class="labeler-container" :class="{'fullscreen': isFullscreen}">
          <div class="canvas-wrapper" ref="canvasWrapper" @wheel="onCanvasWheel">
            <canvas ref="labelCanvas" @mousedown="startDraw" @mousemove="draw" @mouseup="endDraw" @mouseleave="endDraw"></canvas>
            <img ref="labelImg" :src="'/dataset/' + currentImage.filepath.split(/[\\\\/]/).pop()"
              @load="onImgLoad" @error="imgSrcError" class="labeler-img">
          </div>
          <div class="labeler-tools" :class="{'fullscreen-tools': isFullscreen}">
            <div class="text-sm mb-2">Danh sách bbox ({{ currentLabels.length }})</div>
            <div v-for="(l, i) in currentLabels" :key="l.id"
              class="bbox-item"
              :class="{'selected': selectedLabelId === l.id}"
              @click="selectLabel(l)">
              #{{ i+1 }} {{ l.class_name }}: [{{ Math.round(l.x_center * 100) }}%, {{ Math.round(l.y_center * 100) }}%]
              <button class="text-red-400 text-xs ml-1" @click.stop="removeLabel(l.id)">✕</button>
            </div>
            <button class="btn btn-secondary btn-sm w-full mt-3" @click="clearAllLabels">Xóa tất cả</button>
            <div class="mt-4 text-xs text-gray-400">
              <div>← → để chuyển ảnh</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ============ TRAIN TAB ============ -->
  <div v-if="activeTab === 'train'" class="tech-section">
    <div class="grid grid-cols-5 gap-4 mb-4">
      <div class="card text-center">
        <div class="text-2xl font-bold">{{ trainStats.total_images }}</div>
        <div class="text-xs text-gray-400">Tổng ảnh</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-green-500">{{ trainStats.verified_images }}</div>
        <div class="text-xs text-gray-400">Verified</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-blue-500">{{ trainStats.total_bboxes }}</div>
        <div class="text-xs text-gray-400">Tổng bbox</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-purple-500">{{ trainStats.train_images || 0 }}</div>
        <div class="text-xs text-gray-400">Train</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-orange-500">{{ trainStats.val_images || 0 }}</div>
        <div class="text-xs text-gray-400">Validation</div>
      </div>
    </div>

    <div v-if="trainStats.model_exists" class="card mb-4" style="border-left: 4px solid var(--primary);">
      <div class="flex justify-between items-center">
        <div>
          <div class="font-medium text-green-600">✓ Model đã train xong</div>
          <div class="text-xs text-gray-400">{{ trainStats.model_path }}</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="loadModel">Tải lại model</button>
      </div>
    </div>

    <!-- Training Progress -->
    <div v-if="trainingProgress && trainingProgress.training" class="card mb-4" style="border-left: 4px solid var(--warning);">
      <div class="flex justify-between items-center mb-2">
        <span class="font-medium">🔄 Training in progress...</span>
        <span>{{ trainingProgress.current_epoch }}/{{ trainingProgress.total_epochs }}</span>
      </div>
      <div class="w-full bg-gray-700 rounded-full h-3 mb-2">
        <div class="bg-blue-500 h-3 rounded-full transition-all"
          :style="'width:' + trainingProgress.progress_pct + '%'"></div>
      </div>
      <div class="grid grid-cols-3 gap-2 text-xs">
        <div>Loss: {{ trainingProgress.loss?.toFixed(4) || 'N/A' }}</div>
        <div>mAP50: {{ trainingProgress.mAP50?.toFixed(4) || 'N/A' }}</div>
        <div>Progress: {{ trainingProgress.progress_pct?.toFixed(1) }}%</div>
      </div>
    </div>

    <!-- ============ CAPTURE SCHEDULER ============ -->
    <div class="card mb-4" style="border-left: 4px solid var(--primary);">
      <div class="flex justify-between items-center mb-3">
        <h4 class="font-medium">⏰ Lên lịch Capture ảnh tự động</h4>
        <button class="btn btn-secondary btn-sm" @click="loadSchedules">🔄</button>
      </div>

      <!-- Schedule List -->
      <div v-if="schedules.length" class="mb-4">
        <div v-for="s in schedules" :key="s.id" class="bg-gray-800 rounded p-3 mb-2">
          <div class="flex justify-between items-start">
            <div>
              <div class="font-medium">{{ s.name }}</div>
              <div class="text-xs text-gray-400">
                {{ s.camera_id }} | Preset {{ s.preset_id }} |
                {{ s.schedule_hours?.join(', ') || '6,11,15,19' }}h
              </div>
              <div class="text-xs mt-1">
                <span class="text-green-400">{{ s.total_images || 0 }} ảnh</span> |
                <span v-if="s.is_running" class="text-yellow-400">▶ Đang chạy</span>
                <span v-else class="text-gray-500">⏸ Đã dừng</span>
                <span v-if="s.next_capture_at" class="text-gray-400 ml-2">
                  | Next: {{ formatTime(s.next_capture_at) }}
                </span>
              </div>
            </div>
            <div class="flex gap-1">
              <button v-if="!s.is_running" class="btn btn-success btn-sm" @click="startSchedule(s.id)">▶</button>
              <button v-else class="btn btn-warning btn-sm" @click="stopSchedule(s.id)">⏸</button>
              <button class="btn btn-primary btn-sm" @click="captureNow(s.id)">📷</button>
              <button class="btn btn-danger btn-sm" @click="deleteSchedule(s.id)">🗑</button>
            </div>
          </div>
          <!-- Progress bar -->
          <div class="w-full bg-gray-700 rounded-full h-1 mt-2">
            <div class="bg-blue-500 h-1 rounded-full" :style="'width:' + getScheduleProgress(s) + '%'"></div>
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-gray-400 mb-3">
        Chưa có lịch capture. Tạo lịch mới bên dưới.
      </div>

      <!-- Create New Schedule -->
      <div class="border-t border-gray-700 pt-3">
        <h5 class="text-sm font-medium mb-2">Tạo lịch mới:</h5>
        <div class="grid grid-cols-2 gap-3">
          <div class="form-group mb-0">
            <label class="text-xs">Camera</label>
            <select v-model="newSchedule.camera_id" class="w-full" @change="onScheduleCameraChange">
              <option value="">-- Chọn --</option>
              <option v-for="c in cameras" :key="c.id" :value="c.id">{{ c.id }}</option>
            </select>
          </div>
          <div class="form-group mb-0">
            <label class="text-xs">Preset</label>
            <select v-model="newSchedule.preset_id" class="w-full">
              <option :value="1">1 - overview</option>
              <option v-for="p in schedulePresets" :key="p.number" :value="p.number">{{ p.name || 'Preset ' + p.number }}</option>
            </select>
          </div>
        </div>

        <div class="form-group mt-2">
          <label class="text-xs">⏰ Giờ chụp trong ngày:</label>
          <div class="flex flex-wrap gap-2 mt-1">
            <label v-for="h in [6, 11, 15, 19]" :key="h" class="flex items-center gap-1 cursor-pointer bg-gray-800 px-2 py-1 rounded">
              <input type="checkbox" :value="h" v-model="newSchedule.schedule_hours">
              {{ h }}:00
            </label>
          </div>
        </div>

        <div class="grid grid-cols-4 gap-2 mt-2">
          <div class="form-group mb-0">
            <label class="text-xs">Ngày</label>
            <input v-model.number="newSchedule.total_days" type="number" min="1" max="7">
          </div>
          <div class="form-group mb-0">
            <label class="text-xs">Ảnh/lần</label>
            <input v-model.number="newSchedule.shots_per_capture" type="number" min="5" max="30">
          </div>
          <div class="form-group mb-0">
            <label class="text-xs">Interval (s)</label>
            <input v-model.number="newSchedule.interval_seconds" type="number" min="1" max="10" step="0.5">
          </div>
          <div class="form-group mb-0">
            <label class="text-xs">Tên</label>
            <input v-model="newSchedule.name" type="text" placeholder="Lịch sáng">
          </div>
        </div>

        <button class="btn btn-primary mt-3" @click="createSchedule" :disabled="!newSchedule.camera_id">
          ➕ Tạo lịch
        </button>
      </div>
    </div>

    <div class="card mb-4">
      <h4 class="font-medium mb-3">Cấu hình training</h4>
      <div class="grid grid-cols-3 gap-4">
        <div class="form-group">
          <label>Epochs</label>
          <input v-model.number="trainConfig.epochs" type="number" min="10" max="200">
        </div>
        <div class="form-group">
          <label>Image size</label>
          <select v-model.number="trainConfig.imgsz">
            <option :value="320">320</option>
            <option :value="480">480</option>
            <option :value="640">640</option>
          </select>
        </div>
        <div class="form-group">
          <label>Batch size</label>
          <input v-model.number="trainConfig.batch" type="number" min="2" max="16" disabled title="RTX 1650: batch=8">
        </div>
      </div>
      <div class="mt-3 text-xs text-gray-400">
        Augmentation: HSV (±1.5%/70%/40%), Flip 50%, Mosaic 100%, MixUp 15%, Rotate ±10°, Scale ±50%
      </div>
      <div class="flex gap-2 mt-4">
        <button class="btn btn-secondary" @click="exportDataset">📤 Export</button>
        <button class="btn btn-primary" @click="startTrain" :disabled="trainingProgress?.training || !trainStats.verified_images">
          {{ trainingProgress?.training ? '🔄 Training...' : '🚀 Train Model' }}
        </button>
        <button class="btn btn-secondary" @click="autoTuneThreshold" :disabled="trainingProgress?.training">
          🎯 Auto-tune
        </button>
      </div>
    </div>

    <div class="card">
      <h4 class="font-medium mb-2">📚 Hướng dẫn</h4>
      <div class="text-sm text-gray-400">
        <p>1. Thu thập ảnh đa dạng từ nhiều preset và thời điểm trong ngày</p>
        <p>2. Label từng ảnh trong tab <strong>Dataset</strong> (vẽ bbox quanh gà và máng ăn)</p>
        <p>3. Verify các ảnh đã label để đảm bảo chất lượng</p>
        <p>4. Train model với cấu hình phù hợp RTX 1650 4GB (150 epochs, batch 8)</p>
        <p>5. Target: mAP50 > 0.65, Precision > 0.55, Recall > 0.75</p>
      </div>
    </div>
  </div>

  <!-- ============ AI LOGIC TAB ============ -->
  <div v-if="activeTab === 'ailogic'" class="tech-section">
    <div class="flex justify-between items-center mb-4">
      <h3 class="font-medium">AI Logic Rules</h3>
      <button class="btn btn-primary btn-sm" @click="openRuleForm()">+ Thêm rule</button>
    </div>

    <div v-if="aiRules.length" class="table-wrap">
      <table>
        <thead><tr><th>Tên</th><th>Trigger</th><th>Steps</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>
          <tr v-for="r in aiRules" :key="r.id">
            <td class="font-medium">{{ r.name }}</td>
            <td><span class="badge badge-blue">{{ r.trigger_type }}</span></td>
            <td class="text-sm">{{ (r.steps || []).length }} steps</td>
            <td>
              <button :class="r.enabled ? 'btn-success' : 'btn-secondary'" class="btn btn-sm"
                @click="toggleRule(r)">{{ r.enabled ? 'Bật' : 'Tắt' }}</button>
            </td>
            <td class="flex gap-1">
              <button class="btn btn-primary btn-sm" @click="executeRule(r)">▶</button>
              <button class="btn btn-secondary btn-sm" @click="openRuleForm(r)">Sửa</button>
              <button class="btn btn-danger btn-sm" @click="deleteRule(r)">Xóa</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="empty-state">
      <div class="icon">🤖</div><p>Chưa có AI Logic rule nào</p>
    </div>

    <!-- Rule Form Modal -->
    <div v-if="showRuleModal" class="modal-overlay" @click.self="showRuleModal = false">
      <div class="modal" style="max-width: 600px;">
        <h3>{{ editingRule ? 'Sửa Rule' : 'Thêm AI Logic Rule' }}</h3>
        <div class="form-group"><label>Tên</label>
          <input v-model="ruleForm.name" class="w-full"></div>
        <div class="grid grid-cols-2 gap-4">
          <div class="form-group"><label>Trigger</label>
            <select v-model="ruleForm.trigger_type" class="w-full">
              <option value="manual">Manual</option>
              <option value="schedule">Schedule</option>
            </select>
          </div>
          <div class="form-group" v-if="ruleForm.trigger_type === 'schedule'">
            <label>Cron</label>
            <input v-model="ruleForm.cron_expression" class="w-full" placeholder="*/5 * * * *">
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-4">
          <button class="btn btn-secondary" @click="showRuleModal = false">Huỷ</button>
          <button class="btn btn-primary" @click="saveRule">Lưu</button>
        </div>
      </div>
    </div>
  </div>
</div>
`,

setup() {
  // Tab state
  const activeTab = ref('hsv');
  const tabs = [
    { id: 'hsv', label: 'YOLO Detection', icon: '🐔' },
    { id: 'dataset', label: 'Dataset', icon: '🗃️' },
    { id: 'train', label: 'Train', icon: '🎓' },
    { id: 'ailogic', label: 'AI Logic', icon: '🤖' },
  ];

  // Cameras
  const cameras = ref([]);
  const presets = ref([]);

  // Density form
  const testForm = ref({
    camera_id: '', preset_id: 1, snapshot_count: 3, snapshot_interval: 0.5,
    count_method: 'max', avg_pixels_per_object: 3000, lower_hsv: '10,30,60', upper_hsv: '40,255,255',
  });

  // HSV Calibration
  const calForm = ref({
    camera_id: '', preset_id: 1, h_min: 10, h_max: 40, s_min: 30, s_max: 255,
    v_min: 60, v_max: 255, avg_pixels_per_object: 3000, snapshot_count: 3,
    move_to_preset: true, confidence: 0.01, grid_size: 4,
  });
  const calPresets = ref([]);
  const useMultiRange = ref(false);
  const calibrating = ref(false);
  const previewResult = ref(null);
  const previewImage = ref(null);
  const yoloResult = ref(null);
  const heatmapImage = ref(null);
  const testing = ref(false);
  const densityResult = ref(null);

  // Dataset state
  const images = ref([]);
  const showUpload = ref(false);
  const showCapture = ref(false);
  const uploading = ref(false);
  const isDragging = ref(false);
  const filter = ref('all');
  const mlStats = ref({ total_images: 0, unlabeled: 0, labeled: 0, verified: 0, total_bboxes: 0 });
  const capturing = ref(false);
  const captureProgress = ref(0);
  const captureTotal = ref(0);

  // Capture form
  const captureForm = ref({
    camera_id: '',
    preset_ids: [],
    shots_per_preset: 15,
    interval_sec: 2.0,
  });
  const capturePresets = ref([]);

  // Schedule state
  const schedules = ref([]);
  const schedulePresets = ref([]);
  const newSchedule = ref({
    camera_id: '',
    preset_id: 1,
    schedule_hours: [6, 11, 15, 19],
    total_days: 3,
    shots_per_capture: 10,
    interval_seconds: 2.0,
    name: 'Auto Capture',
  });

  // Labeler state
  const currentImage = ref(null);
  const currentLabels = ref([]);
  const currentClass = ref('chick');
  const selectedLabelId = ref(null);
  const labelCanvas = ref(null);
  const labelImg = ref(null);
  const canvasWrapper = ref(null);
  const isFullscreen = ref(false);
  let isDrawing = false, startX = 0, startY = 0, scale = 1;

  // Training state
  const trainStats = ref({ total_images: 0, verified_images: 0, total_bboxes: 0, model_exists: false, model_path: '', train_images: 0, val_images: 0 });
  const training = ref(false);
  const trainingProgress = ref(null);
  const trainConfig = ref({ epochs: 150, imgsz: 640, batch: 8 });

  // AI Logic state
  const aiRules = ref([]);
  const showRuleModal = ref(false);
  const editingRule = ref(null);
  const ruleForm = ref({ name: '', trigger_type: 'manual', cron_expression: '', enabled: true, steps: [] });

  // ============ DENSITY ============
  async function loadCameras() {
    try { cameras.value = await API.cameras.list(); } catch { cameras.value = []; }
  }

  async function onCameraChange() {
    presets.value = [];
    if (testForm.value.camera_id) {
      try {
        const res = await API.cameras.presets.list(testForm.value.camera_id);
        presets.value = res.local || res || [];
      } catch { presets.value = []; }
    }
  }

  async function onCalCameraChange() {
    calPresets.value = [];
    if (calForm.value.camera_id) {
      try {
        const res = await API.cameras.presets.list(calForm.value.camera_id);
        calPresets.value = res.local || res || [];
      } catch { calPresets.value = []; }
    }
  }

  async function runYoloDetection() {
    if (!calForm.value.camera_id) { showToast('Chọn camera trước', 'error'); return; }
    testing.value = true;
    yoloResult.value = null;
    heatmapImage.value = null;
    try {
      const res = await API.post('/api/ai/detect', {
        camera_id: calForm.value.camera_id,
        preset_id: calForm.value.preset_id || 1,
        snapshot_count: calForm.value.snapshot_count || 3,
        move_to_preset: calForm.value.move_to_preset !== false,
        confidence: calForm.value.confidence || 0.5,
        grid_size: calForm.value.grid_size || 4,
      });
      yoloResult.value = res;
    } catch(e) {
      console.error('YOLO detect error:', e);
      showToast('Lỗi: ' + e.message, 'error');
    }
    testing.value = false;
  }

  async function generateHeatmap() {
    if (!calForm.value.camera_id) { showToast('Chọn camera trước', 'error'); return; }
    testing.value = true;
    heatmapImage.value = null;
    try {
      const res = await API.post('/api/ai/detect/heatmap', {
        camera_id: calForm.value.camera_id,
        preset_id: calForm.value.preset_id || 1,
        confidence: calForm.value.confidence || 0.5,
        grid_size: 6,
      });
      heatmapImage.value = res.heatmap_image;
      yoloResult.value = res;
    } catch(e) {
      console.error('Heatmap error:', e);
      showToast('Lỗi: ' + e.message, 'error');
    }
    testing.value = false;
  }

  function getDensityCellClass(val, max) {
    if (!max || max === 0) return 'bg-gray-700';
    const ratio = val / max;
    if (ratio < 0.25) return 'bg-green-900';
    if (ratio < 0.5) return 'bg-green-700';
    if (ratio < 0.75) return 'bg-yellow-600';
    return 'bg-red-600';
  }

  function getDensityLabel(pct) {
    if (pct < 10) return 'Thưa';
    if (pct < 30) return 'Bình thường';
    if (pct < 50) return 'Đông';
    return 'Rất đông - Cảnh báo!';
  }

  function getDensityClass(pct) {
    if (pct < 10) return 'text-green-500';
    if (pct < 30) return 'text-blue-500';
    if (pct < 50) return 'text-yellow-500';
    return 'text-red-500 font-bold';
  }

  function resetHSV() {
    calForm.value.h_min = 10; calForm.value.h_max = 40;
    calForm.value.s_min = 30; calForm.value.s_max = 255;
    calForm.value.v_min = 60; calForm.value.v_max = 255;
  }

  async function previewMask() {
    if (!calForm.value.camera_id) { showToast('Chọn camera trước', 'error'); return; }
    calibrating.value = true;
    previewImage.value = null;
    previewResult.value = null;
    try {
      const lowerHsv = [calForm.value.h_min, calForm.value.s_min, calForm.value.v_min];
      const upperHsv = [calForm.value.h_max, calForm.value.s_max, calForm.value.v_max];
      const res = await API.density.calibrate({
        camera_id: calForm.value.camera_id,
        preset_id: calForm.value.preset_id || 1,
        lower_hsv: lowerHsv,
        upper_hsv: upperHsv,
        avg_pixels_per_object: calForm.value.avg_pixels_per_object || 3000,
        move_to_preset: calForm.value.move_to_preset !== false,
      });
      if (res.success) {
        previewResult.value = res.preview;
        previewImage.value = '/snapshots/' + res.image_path;
      }
    } catch(e) { showToast(e.message, 'error'); }
    calibrating.value = false;
  }

  // ============ DATASET ============
  async function loadImages() {
    try {
      const status = filter.value === 'all' ? null : filter.value;
      const res = await API.ml_dataset.images(status);
      images.value = res.images || [];
    } catch (e) { console.error(e); }
  }

  async function loadMlStats() {
    try { mlStats.value = await API.ml_dataset.stats(); } catch { }
  }

  function imgSrcError(e) { e.target.style.display = 'none'; }

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
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        await fetch('/api/ml/dataset/upload', { method: 'POST', body: fd });
      }
      showUpload.value = false;
      await loadImages();
      await loadMlStats();
      showToast('Upload thành công!');
    } catch (e) { showToast('Upload thất bại', 'error'); }
    uploading.value = false;
  }

  async function exportDataset() {
    try {
      showToast('Đang export...');
      const res = await API.ml_training.export();
      showToast('Export thành công!');
    } catch (e) { showToast(e.message, 'error'); }
  }

  // ============ CAPTURE ============
  async function onCaptureCameraChange() {
    capturePresets.value = [];
    captureForm.value.preset_ids = [];
    if (captureForm.value.camera_id) {
      try {
        const res = await API.cameras.presets.list(captureForm.value.camera_id);
        capturePresets.value = res.local || res || [];
      } catch { capturePresets.value = []; }
    }
  }

  async function startCapture() {
    if (!captureForm.value.camera_id) return;
    if (captureForm.value.preset_ids.length === 0) {
      showToast('Chọn ít nhất 1 preset', 'error');
      return;
    }

    capturing.value = true;
    captureProgress.value = 0;
    captureTotal.value = captureForm.value.preset_ids.length * captureForm.value.shots_per_preset;

    try {
      const res = await API.post('/api/ml/dataset/capture', captureForm.value);
      captureProgress.value = res.captured_count || 0;
      showToast(`Đã capture ${res.captured_count} ảnh`);
      await loadImages();
      await loadMlStats();
    } catch (e) {
      showToast('Capture thất bại: ' + e.message, 'error');
    }

    capturing.value = false;
    showCapture.value = false;
  }

  // ============ CAPTURE SCHEDULER ============
  async function loadSchedules() {
    try {
      const res = await fetch('/api/ml/capture-scheduler/schedules');
      const data = await res.json();
      schedules.value = data.schedules || [];
    } catch (e) { console.error(e); }
  }

  async function onScheduleCameraChange() {
    schedulePresets.value = [];
    newSchedule.value.preset_id = 1;
    if (newSchedule.value.camera_id) {
      try {
        const res = await API.cameras.presets.list(newSchedule.value.camera_id);
        schedulePresets.value = res.local || res || [];
      } catch { schedulePresets.value = []; }
    }
  }

  async function createSchedule() {
    if (!newSchedule.value.camera_id) {
      showToast('Chọn camera', 'error');
      return;
    }
    try {
      const res = await fetch('/api/ml/capture-scheduler/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSchedule.value),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Đã tạo lịch!');
        await loadSchedules();
        // Reset form
        newSchedule.value = {
          camera_id: newSchedule.value.camera_id,
          preset_id: 1,
          schedule_hours: [6, 11, 15, 19],
          total_days: 3,
          shots_per_capture: 10,
          interval_seconds: 2.0,
          name: 'Auto Capture',
        };
        schedulePresets.value = [];
      }
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
  }

  async function startSchedule(id) {
    try {
      await fetch(`/api/ml/capture-scheduler/schedules/${id}/start`, { method: 'POST' });
      showToast('Đã bắt đầu lịch');
      await loadSchedules();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function stopSchedule(id) {
    try {
      await fetch(`/api/ml/capture-scheduler/schedules/${id}/stop`, { method: 'POST' });
      showToast('Đã dừng lịch');
      await loadSchedules();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function captureNow(id) {
    try {
      const res = await fetch(`/api/ml/capture-scheduler/schedules/${id}/capture-now`, { method: 'POST' });
      const data = await res.json();
      showToast(`Đã chụp ${data.images_captured} ảnh`);
      await loadSchedules();
      await loadMlStats();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function deleteSchedule(id) {
    if (!confirm('Xóa lịch này?')) return;
    try {
      await fetch(`/api/ml/capture-scheduler/schedules/${id}`, { method: 'DELETE' });
      showToast('Đã xóa lịch');
      await loadSchedules();
    } catch (e) { showToast(e.message, 'error'); }
  }

  function getScheduleProgress(s) {
    if (!s.total_days || !s.schedule_hours) return 0;
    const expected = s.schedule_hours.length * s.total_days;
    if (!expected) return 0;
    return Math.min(100, (s.total_captures / expected) * 100);
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // ============ LABELER ============
  async function openLabeler(img) {
    currentImage.value = img;
    currentLabels.value = [];
    selectedLabelId.value = null;
    currentClass.value = 'chick';
    try {
      const res = await API.ml_dataset.getImage(img.id);
      currentLabels.value = res.labels || [];
    } catch (e) { }
    await nextTick();
    initCanvas();
  }

  function closeLabeler() {
    currentImage.value = null;
    isFullscreen.value = false;
    selectedLabelId.value = null;
  }

  async function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value;
    await nextTick();
    initCanvas();
  }

  function onCanvasWheel(e) {
    // Simple zoom with scroll
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      scale = Math.max(0.5, Math.min(3, scale * delta));
      initCanvas();
    }
  }

  function initCanvas() {
    if (!labelCanvas.value || !labelImg.value || !canvasWrapper.value) return;
    const canvas = labelCanvas.value, img = labelImg.value, wrapper = canvasWrapper.value;
    if (!img.complete) { img.onload = initCanvas; return; }
    const wrapperW = wrapper.clientWidth - 20;
    const wrapperH = Math.min(window.innerHeight * (isFullscreen.value ? 0.8 : 0.5), img.naturalHeight);
    scale = Math.min(wrapperW / img.naturalWidth, wrapperH / img.naturalHeight);
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
    redrawCanvas();
  }

  function redrawCanvas() {
    if (!labelCanvas.value) return;
    const ctx = labelCanvas.value.getContext('2d');
    ctx.clearRect(0, 0, labelCanvas.value.width, labelCanvas.value.height);

    // Draw existing labels
    for (const l of currentLabels.value) {
      const isSelected = selectedLabelId.value === l.id;
      const color = l.class_name === 'feeder' ? '#ffff00' : '#00ff00';

      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3 : 2;
      if (isSelected) {
        ctx.setLineDash([5, 5]);
      } else {
        ctx.setLineDash([]);
      }

      const x = (l.x_center - l.width / 2) * labelCanvas.value.width;
      const y = (l.y_center - l.height / 2) * labelCanvas.value.height;
      const w = l.width * labelCanvas.value.width;
      const h = l.height * labelCanvas.value.height;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }

  function getCanvasCoords(e) {
    const rect = labelCanvas.value.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / labelCanvas.value.width, y: (e.clientY - rect.top) / labelCanvas.value.height };
  }

  function startDraw(e) { const c = getCanvasCoords(e); startX = c.x; startY = c.y; isDrawing = true; }
  function draw(e) {
    if (!isDrawing) return;
    redrawCanvas();
    const ctx = labelCanvas.value.getContext('2d');
    const c = getCanvasCoords(e);
    ctx.strokeStyle = currentClass.value === 'feeder' ? '#ffff00' : '#00ff00';
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(Math.min(startX, c.x) * labelCanvas.value.width, Math.min(startY, c.y) * labelCanvas.value.height, Math.abs(c.x - startX) * labelCanvas.value.width, Math.abs(c.y - startY) * labelCanvas.value.height);
    ctx.setLineDash([]);
  }

  async function endDraw(e) {
    if (!isDrawing) return;
    isDrawing = false;
    const c = getCanvasCoords(e);
    const x = Math.min(startX, c.x), y = Math.min(startY, c.y);
    const w = Math.abs(c.x - startX), h = Math.abs(c.y - startY);
    if (w < 0.01 || h < 0.01) return;
    try {
      const res = await API.ml_dataset.addLabel(currentImage.value.id, { class_name: currentClass.value, x_center: x + w/2, y_center: y + h/2, width: w, height: h });
      currentLabels.value.push(res.label);
      redrawCanvas();
    } catch (e) { showToast('Lỗi lưu bbox', 'error'); }
  }

  function selectLabel(l) {
    selectedLabelId.value = selectedLabelId.value === l.id ? null : l.id;
    redrawCanvas();
  }

  function getBboxCount(className) {
    return currentLabels.value.filter(l => l.class_name === className).length;
  }

  function getBboxBadgeClass(className) {
    const count = getBboxCount(className);
    return count > 0 ? 'badge-green' : 'badge-gray';
  }

  async function removeLabel(labelId) {
    try {
      await API.ml_dataset.deleteLabel(currentImage.value.id, labelId);
      currentLabels.value = currentLabels.value.filter(l => l.id !== labelId);
      if (selectedLabelId.value === labelId) selectedLabelId.value = null;
      redrawCanvas();
    } catch (e) { }
  }

  async function clearAllLabels() {
    if (!confirm('Xóa tất cả?')) return;
    for (const l of [...currentLabels.value]) {
      try { await API.ml_dataset.deleteLabel(currentImage.value.id, l.id); } catch {}
    }
    currentLabels.value = [];
    selectedLabelId.value = null;
    redrawCanvas();
  }

  async function markVerified() {
    try {
      await API.ml_dataset.updateStatus(currentImage.value.id, 'verified');
      currentImage.value.label_status = 'verified';
      await loadImages();
      await loadMlStats();
      showToast('Đã verify!');
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function deleteImage() {
    if (!confirm('Xóa ảnh?')) return;
    try {
      await API.ml_dataset.deleteImage(currentImage.value.id);
      closeLabeler();
      await loadImages();
      await loadMlStats();
      showToast('Đã xóa');
    } catch (e) { showToast(e.message, 'error'); }
  }

  // Keyboard navigation for labeler
  function onLabelerKeydown(e) {
    if (!currentImage.value) return;

    if (e.key === '1') { currentClass.value = 'chick'; return; }
    if (e.key === '2') { currentClass.value = 'feeder'; return; }

    if (e.key === 'ArrowRight') { navigateImage(1); return; }
    if (e.key === 'ArrowLeft') { navigateImage(-1); return; }

    if (e.key === 'Delete' && selectedLabelId.value) {
      removeLabel(selectedLabelId.value);
      return;
    }
  }

  async function navigateImage(direction) {
    const idx = images.value.findIndex(img => img.id === currentImage.value.id);
    const newIdx = idx + direction;
    if (newIdx >= 0 && newIdx < images.value.length) {
      openLabeler(images.value[newIdx]);
    }
  }

  // ============ TRAINING ============
  async function loadTrainStats() {
    try {
      const res = await API.ml_training.status();
      trainStats.value = res.dataset || {};
      training.value = res.training || false;
      if (res.progress) trainingProgress.value = res.progress;
    } catch { }
  }

  async function loadModel() {
    try {
      await API.post('/api/ai/detect/load-model');
      showToast('Model loaded');
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function startTrain() {
    try {
      await API.ml_training.train(trainConfig.value);
      showToast('Training started...');
      training.value = true;
      // Poll for progress
      pollTrainingProgress();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function pollTrainingProgress() {
    if (!training.value) return;
    try {
      const res = await API.ml_training.progress();
      trainingProgress.value = res;
      if (res.training) {
        setTimeout(pollTrainingProgress, 5000);
      } else {
        training.value = false;
        await loadTrainStats();
        showToast('Training complete!');
      }
    } catch { }
  }

  async function autoTuneThreshold() {
    showToast('Auto-tuning (this may take a minute)...');
    try {
      const res = await API.post('/api/ai/detect/auto-tune', {
        camera_id: calForm.value.camera_id || 'cam_01',
        preset_id: 1,
      });
      showToast(`Best confidence: ${res.best_confidence}`);
    } catch (e) { showToast(e.message, 'error'); }
  }

  // ============ AI LOGIC ============
  async function loadAiRules() {
    try { const res = await API.ai_logic.listRules ? await API.ai_logic.listRules() : []; aiRules.value = Array.isArray(res) ? res : (res.rules || []); } catch { aiRules.value = []; }
  }

  function openRuleForm(r) {
    if (r) { editingRule.value = r; ruleForm.value = { ...r }; } else { editingRule.value = null; ruleForm.value = { name: '', trigger_type: 'manual', cron_expression: '', enabled: true, steps: [] }; }
    showRuleModal.value = true;
  }

  async function saveRule() {
    try {
      if (editingRule.value) { await API.ai_logic.updateCountRule(editingRule.value.id, ruleForm.value); }
      else { await API.ai_logic.createCountRule(ruleForm.value); }
      showRuleModal.value = false; await loadAiRules(); showToast('Đã lưu');
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function deleteRule(r) {
    if (!confirm('Xóa rule?')) return;
    try { await API.ai_logic.delCountRule(r.id); await loadAiRules(); showToast('Đã xóa'); } catch (e) { showToast(e.message, 'error'); }
  }

  async function toggleRule(r) {
    try { await API.ai_logic.toggleCountRule(r.id, !r.enabled); await loadAiRules(); } catch (e) { showToast(e.message, 'error'); }
  }

  async function executeRule(r) {
    try { const res = await API.ai_logic.executeRule(r.id); showToast(`Executed: ${JSON.stringify(res)}`); } catch (e) { showToast(e.message, 'error'); }
  }

  // ============ INIT ============
  onMounted(() => {
    loadCameras();
    loadImages();
    loadMlStats();
    loadTrainStats();
    loadAiRules();
    loadSchedules();

    // Keyboard handler for labeler
    window.addEventListener('keydown', onLabelerKeydown);
  });

  return {
    // Tabs
    activeTab, tabs,
    // Density
    cameras, presets, testForm, testing, densityResult, onCameraChange, getDensityLabel, getDensityClass,
    calForm, useMultiRange, calibrating, previewResult, previewImage, resetHSV, previewMask, calPresets, onCalCameraChange, yoloResult, runYoloDetection, getDensityCellClass, heatmapImage, generateHeatmap,
    // Dataset
    images, showUpload, uploading, isDragging, filter, mlStats, handleFileSelect, handleDrop, exportDataset,
    showCapture, capturing, captureProgress, captureTotal, captureForm, capturePresets, onCaptureCameraChange, startCapture,
    imgSrcError, openLabeler, closeLabeler, toggleFullscreen, currentImage, currentLabels, labelCanvas, labelImg, canvasWrapper, isFullscreen,
    currentClass, selectedLabelId, selectLabel, getBboxCount, getBboxBadgeClass,
    startDraw, draw, endDraw, removeLabel, clearAllLabels, markVerified, deleteImage, onCanvasWheel,
    // Train
    trainStats, training, trainConfig, trainingProgress, startTrain, loadModel, autoTuneThreshold,
    // Schedules
    schedules, newSchedule, schedulePresets, loadSchedules, createSchedule, startSchedule, stopSchedule, captureNow, deleteSchedule, getScheduleProgress, formatTime, onScheduleCameraChange,
    // AI Logic
    aiRules, showRuleModal, editingRule, ruleForm, openRuleForm, saveRule, deleteRule, toggleRule, executeRule,
  };
}
};

export default component;