// Control Tab: Bat motor control
const ControlTab = (function() {
  const $ = (id) => document.getElementById(id);

  function renderBarnSelector(barns, selectedId, onSelect) {
    const container = $('control-barns');
    if (!container) return;
    container.innerHTML = barns.map(b => `
      <button onclick="ControlTab.selectBarn('${b.id}')"
        class="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedId === b.id ? 'bg-primary text-white' : 'bg-white text-gray-600 border border-gray-200'}">
        ${b.name || b.id}
      </button>`).join('');
  }

  function renderBats(bats, selectedBarnId) {
    const batsEl = $('control-bats');
    if (!batsEl) return;

    if (!selectedBarnId) {
      batsEl.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">Chọn chuồng</div>';
      return;
    }

    if (!bats || bats.length === 0) {
      batsEl.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">Không có bạt trong chuồng này</div>';
      return;
    }

    batsEl.innerHTML = bats.map(bat => {
      const position = Format.parsePosition(bat.position);
      const posColor = position > 66 ? 'bat-position-high' : position > 33 ? 'bat-position-mid' : 'bat-position-low';
      const isOnline = bat.is_online === true;
      return `
        <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-300'}"></span>
              <span class="font-semibold text-gray-900">${Format.escapeHtml(bat.name || 'Bạt ' + bat.id)}</span>
            </div>
            <span class="text-xs px-2 py-1 rounded-full ${bat.moving_state === 'moving' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}">${bat.moving_state || 'stopped'}</span>
          </div>
          <div class="mb-3">
            <div class="flex justify-between text-xs text-gray-500 mb-1">
              <span>Vị trí</span>
              <span>${bat.position || 'N/A'}</span>
            </div>
            <div class="bat-position-bar">
              <div class="bat-position-fill ${posColor}" style="width: ${position}%"></div>
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="App.moveBat(${bat.id}, 'up')" class="flex-1 bg-green-500 text-white py-2.5 rounded-lg font-medium text-sm active:scale-95 transition-transform ${!isOnline ? 'opacity-50' : ''}">⬆️ Lên</button>
            <button onclick="App.moveBat(${bat.id}, 'down')" class="flex-1 bg-orange-500 text-white py-2.5 rounded-lg font-medium text-sm active:scale-95 transition-transform ${!isOnline ? 'opacity-50' : ''}">⬇️ Xuống</button>
            <button onclick="App.moveBat(${bat.id}, 'stop')" class="flex-1 bg-red-500 text-white py-2.5 rounded-lg font-medium text-sm active:scale-95 transition-transform ${!isOnline ? 'opacity-50' : ''}">⏹️ Dừng</button>
          </div>
        </div>`;
    }).join('');
  }

  return { renderBarnSelector, renderBats };
})();