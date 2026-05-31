// Camera Tab: List cameras + single camera view
const CameraTab = (function() {
  const $ = (id) => document.getElementById(id);

  function renderList(cameras) {
    const listEl = $('camera-list');
    if (!listEl) return;

    if (!cameras || cameras.length === 0) {
      listEl.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm col-span-2">Không có camera nào</div>';
      return;
    }

    listEl.innerHTML = cameras.map(cam => `
      <div onclick="App.selectCamera('${cam.id}')"
        class="bg-white rounded-xl p-3 shadow-sm border border-gray-100 overflow-hidden cursor-pointer active:scale-95 transition-transform">
        <div class="aspect-video bg-gray-900 rounded-lg mb-2 flex items-center justify-center relative overflow-hidden">
          <img src="/stream/${cam.id}/snapshot"
            class="absolute inset-0 w-full h-full object-contain"
            style="display:none"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
            onload="this.style.display='block';this.nextElementSibling.style.display='none';">
          <div class="text-center w-full h-full flex items-center justify-center" style="display:flex;">
            <span class="text-3xl">📹</span>
          </div>
          <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${cam.enabled ? 'bg-green-500' : 'bg-gray-400'}"></span>
        </div>
        <div class="text-xs font-medium text-gray-700 truncate">${Format.escapeHtml(cam.name || cam.id)}</div>
        <div class="text-xs text-gray-400 truncate flex items-center gap-1">
          <span class="inline-block w-1.5 h-1.5 rounded-full ${cam.enabled ? 'bg-green-500' : 'bg-gray-400'}"></span>
          ${Format.escapeHtml(cam.ip || 'Offline')}
        </div>
      </div>`).join('');
  }

  function renderView(cam) {
    if (!cam) {
      $('camera-view-title').textContent = 'Camera';
      $('camera-view-content').innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">Camera không tìm thấy</div>';
      return;
    }

    $('camera-view-title').textContent = Format.escapeHtml(cam.name || cam.id);

    $('camera-view-content').innerHTML = `
      <div class="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
        <div class="aspect-video bg-gray-900 relative overflow-hidden">
          <img src="/stream/${cam.id}/mjpeg"
            class="absolute inset-0 w-full h-full object-contain"
            id="camera-live-img">
        </div>
        <div class="p-3">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full ${cam.enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}"></span>
              <span class="text-sm font-medium text-gray-700">${Format.escapeHtml(cam.name || cam.id)}</span>
            </div>
            <span class="text-xs text-gray-400">${Format.escapeHtml(cam.ip || '')}</span>
          </div>
          <div class="flex gap-2 mt-3">
            <button onclick="App.setTab('camera')" class="flex-1 py-2 px-3 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">
              ← Danh sách
            </button>
            <a href="/stream/${cam.id}" target="_blank" class="flex-1 py-2 px-3 bg-primary text-white rounded-lg text-sm font-medium text-center">
              Toàn màn hình
            </a>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div class="text-xs font-semibold text-gray-500 uppercase mb-2">Thông tin camera</div>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div class="text-gray-500">IP:</div><div class="font-medium text-gray-700">${Format.escapeHtml(cam.ip || 'N/A')}</div>
          <div class="text-gray-500">Port:</div><div class="font-medium text-gray-700">${cam.port || 'N/A'}</div>
          <div class="text-gray-500">Stream:</div><div class="font-medium text-gray-700">${Format.escapeHtml(cam.stream_type || 'main')}</div>
          <div class="text-gray-500">Trạng thái:</div><div class="font-medium ${cam.enabled ? 'text-green-600' : 'text-gray-400'}">${cam.enabled ? 'Hoạt động' : 'Tắt'}</div>
        </div>
      </div>`;
  }

  return { renderList, renderView };
})();