// CFarm Ops Hub - Main App (Entry Point)
// Handles tab routing, data loading, and global actions

// State
let refreshInterval = null;

// DOM helper
const $ = (id) => document.getElementById(id);

// Toast notification
function showToast(msg, type = 'success') {
  const container = $('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Tab switching
function setTab(tab) {
  Store.set('activeTab', tab);
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
    btn.classList.toggle('text-primary', btn.dataset.tab === tab);
    btn.classList.toggle('text-gray-500', btn.dataset.tab !== tab);
  });
  const tabEl = $(`tab-${tab}`);
  if (tabEl) tabEl.classList.add('active');

  // Load data when switching tabs
  if (tab === 'control' || tab === 'environment') {
    const barns = Store.get('barns');
    if (barns.length > 0 && !Store.get('selectedBarnId')) {
      Store.set('selectedBarnId', barns[0].id);
    }
    if (Store.get('selectedBarnId') && !Store.get('sensors')[Store.get('selectedBarnId')]) {
      loadSensors(Store.get('selectedBarnId'));
    }
    if (Store.get('selectedBarnId') && !Store.get('bats')[Store.get('selectedBarnId')]) {
      loadBats(Store.get('selectedBarnId'));
    }
  }

  // Route to correct renderer
  renderTab(tab);
}

// Per-tab renderers
function renderTab(tab) {
  const data = {
    cycles: Store.get('cycles'),
    barns: Store.get('barns'),
    notifications: Store.get('notifications'),
    alerts: Store.get('alerts'),
    warehouses: Store.get('warehouses'),
    sensors: Store.get('sensors'),
    bats: Store.get('bats'),
    cameras: Store.get('cameras'),
    selectedBarnId: Store.get('selectedBarnId'),
    selectedCameraId: Store.get('selectedCameraId')
  };

  switch (tab) {
    case 'overview':
      OverviewTab.render(data);
      break;
    case 'care':
      // CareTab.init already called on load
      break;
    case 'control':
      ControlTab.renderBarnSelector(data.barns, data.selectedBarnId);
      ControlTab.renderBats(data.bats[data.selectedBarnId] || [], data.selectedBarnId);
      break;
    case 'environment':
      EnvironmentTab.renderAllBarns(data.barns, data.sensors);
      break;
    case 'camera':
      CameraTab.renderList(data.cameras);
      break;
    case 'camera-view':
      const cam = data.cameras.find(c => c.id === data.selectedCameraId);
      CameraTab.renderView(cam);
      break;
    case 'warehouse':
      WarehouseTab.renderWarehouseList(data.warehouses);
      break;
    case 'warehouse-detail':
      WarehouseTab.renderWarehouseDetail(data.warehouses);
      break;
    case 'cycles':
      renderCycles(data.cycles, data.barns);
      break;
    case 'notifications':
      renderNotifications(data.notifications);
      break;
    case 'alerts':
      renderAlerts(data.alerts);
      break;
  }
}

function renderCycles(cycles, barns) {
  const el = $('cycles-list');
  if (!el) return;
  if (!cycles || cycles.length === 0) {
    el.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">Không có chu kỳ nào</div>';
    return;
  }
  el.innerHTML = cycles.map(c => {
    const barn = barns.find(b => b.id === c.barn_id);
    const isActive = c.status === 'active';
    return `
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div class="flex justify-between items-start">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-gray-900 truncate">${Format.escapeHtml(c.name || 'Chu kỳ ' + c.id)}</span>
              <span class="text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${isActive ? 'Hoạt động' : 'Đóng'}</span>
            </div>
            <div class="text-xs text-gray-500 mt-1">${barn?.name || c.barn_id || 'N/A'}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-gray-500">Ngày tuổi</div>
            <div class="font-semibold text-primary">${c.day_age || '-'}</div>
          </div>
        </div>
        <div class="flex justify-between mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
          <span>Bắt đầu: ${Format.date(c.start_date)}</span>
          <span>Số lượng: ${c.current_count?.toLocaleString() || '-'}</span>
        </div>
      </div>`;
  }).join('');
}

function renderNotifications(notifications) {
  const el = $('all-notifications');
  if (!el) return;
  if (!notifications || notifications.length === 0) {
    el.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">Không có thông báo</div>';
    return;
  }
  el.innerHTML = notifications.map(n => {
    const unreadDot = !n.acknowledged_at ? '<span class="w-2 h-2 rounded-full bg-primary inline-block ml-2"></span>' : '';
    return `
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 ${!n.acknowledged_at ? 'border-l-4 border-l-primary' : ''}">
        <div class="flex items-start gap-3">
          <span class="text-lg">${OverviewTab.getIcon ? OverviewTab.getIcon(n.type) : '📌'}</span>
          <div class="flex-1 min-w-0">
            <div class="font-medium text-sm text-gray-900">${Format.escapeHtml(n.title || n.body || 'Thông báo')}</div>
            <div class="text-xs text-gray-500 mt-1">${Format.relativeTime(n.sent_at)}</div>
          </div>
          ${unreadDot}
        </div>
      </div>`;
  }).join('');
}

function renderAlerts(alerts) {
  const el = $('alerts-list');
  if (!el) return;
  if (!alerts || alerts.length === 0) {
    el.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">Không có cảnh báo</div>';
    return;
  }
  el.innerHTML = alerts.map(a => `
    <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 border-l-4 border-l-red-500">
      <div class="flex items-start gap-3">
        <span class="text-lg">🚨</span>
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm text-gray-900">${Format.escapeHtml(a.message || a.title || 'Cảnh báo')}</div>
          <div class="text-xs text-gray-500 mt-1">${Format.relativeTime(a.created_at)}</div>
        </div>
      </div>
    </div>`).join('');
}

// Data loading
async function loadAll() {
  try {
    const [cycles, barns, notifications, alerts, warehouses, cameras] = await Promise.all([
      API.cycles.list(),
      API.barns.list(),
      API.notifications.list(),
      API.alerts.list(true),
      API.warehouses.list(),
      API.cameras.list()
    ]);

    Store.set('cycles', Format.normalize(cycles) || []);
    Store.set('barns', Format.normalize(barns) || []);
    Store.set('notifications', Format.normalize(notifications) || []);
    Store.set('alerts', Format.normalize(alerts) || []);
    Store.set('warehouses', Format.normalize(warehouses) || []);
    Store.set('cameras', Format.normalize(cameras) || []);

    // Auto-select first barn
    const barnsData = Store.get('barns');
    if (barnsData.length > 0 && !Store.get('selectedBarnId')) {
      Store.set('selectedBarnId', barnsData[0].id);
    }

    // Load sensors & bats for selected barn
    const selectedId = Store.get('selectedBarnId');
    if (selectedId) {
      await Promise.all([loadSensors(selectedId), loadBats(selectedId)]);
    }

    updateServerStatus(true);
    renderTab(Store.get('activeTab'));

    // Init care tab with cycles
    if (typeof CareTab !== 'undefined' && CareTab.init) {
      CareTab.init(Store.get('cycles'));
    }

  } catch (e) {
    console.error('Load failed:', e);
    showToast('Không thể tải dữ liệu', 'error');
    updateServerStatus(false);
  }
}

async function loadSensors(barnId) {
  try {
    const data = await API.sensors.latestByBarn(barnId);
    Store.setNested('sensors', barnId, Format.normalize(data) || []);
  } catch (e) {
    console.error('Sensors load failed:', e);
    Store.setNested('sensors', barnId, []);
  }
}

async function loadBats(barnId) {
  try {
    const data = await API.bats.listByBarn(barnId);
    Store.setNested('bats', barnId, Format.normalize(data) || []);
  } catch (e) {
    console.error('Bats load failed:', e);
    Store.setNested('bats', barnId, []);
  }
}

// Actions
async function moveBat(batId, direction) {
  try {
    let result;
    if (direction === 'up') result = await API.bats.moveUp(batId);
    else if (direction === 'down') result = await API.bats.moveDown(batId);
    else result = await API.bats.stop(batId);

    showToast(result?.message || 'Đã gửi lệnh', 'success');

    // Reload bats
    const selectedId = Store.get('selectedBarnId');
    if (selectedId) await loadBats(selectedId);
    renderTab('control');
  } catch (e) {
    showToast('Lỗi: ' + e.message, 'error');
  }
}

function selectBarn(barnId) {
  Store.set('selectedBarnId', barnId);
  loadSensors(barnId);
  loadBats(barnId);
  renderTab(Store.get('activeTab'));
}

function selectCamera(camId) {
  Store.set('selectedCameraId', camId);
  setTab('camera-view');
}

function filterWarehouse(filter) {
  if (typeof WarehouseTab !== 'undefined' && WarehouseTab.setFilter) {
    WarehouseTab.setFilter(filter);
  }
}

async function toggleNotifications() {
  try {
    const status = await API.push.status();
    if (status.enabled) {
      if (status.endpoint) {
        await API.push.unsubscribe(status.endpoint);
      }
      showToast('Đã hủy thông báo', 'success');
    } else {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: 'BEl62iUYgFDAvLUo2I0rEALJHiDqJ_k6ISN5T2zVuKeA'
      });
      await API.push.subscribe(sub.toJSON());
      showToast('Đã bật thông báo', 'success');
    }
  } catch (e) {
    showToast('Lỗi: ' + e.message, 'error');
  }
}

async function checkPushStatus() {
  try {
    const status = await API.push.status();
    Store.set('pushEnabled', status.enabled);
  } catch (e) {
    console.error('Push status check failed:', e);
  }
}

function updateServerStatus(ok) {
  const el = $('serverStatus');
  if (!el) return;
  if (ok) {
    el.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span><span class="text-xs text-gray-500">Online</span>';
  } else {
    el.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500"></span><span class="text-xs text-gray-500">Offline</span>';
  }
}

function quickAction(type) {
  setTab('care');
}

// Navigation helpers
function goToCycles() { setTab('cycles'); }
function goToNotifications() { setTab('notifications'); }
function goToAlerts() { setTab('alerts'); }
function goToWarehouse() { setTab('warehouse-detail'); }

// Init
function init() {
  loadAll();
  refreshInterval = setInterval(loadAll, 120000);
  checkPushStatus();
}

// App object - exposes all public methods
const App = {
  setTab,
  renderTab,
  loadAll,
  loadSensors,
  loadBats,
  moveBat,
  selectBarn,
  selectCamera,
  filterWarehouse,
  toggleNotifications,
  checkPushStatus,
  goToCycles,
  goToNotifications,
  goToAlerts,
  goToWarehouse,
  init
};

// Start app
document.addEventListener('DOMContentLoaded', () => {
  init();
});