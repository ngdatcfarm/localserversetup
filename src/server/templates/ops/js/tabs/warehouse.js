// Warehouse Tab: List warehouses with filters
const WarehouseTab = (function() {
  const $ = (id) => document.getElementById(id);

  function setFilter(filter) {
    Store.set('warehouseFilter', filter);
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.className = `filter-pill ${btn.dataset.filter === filter ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`;
    });
    renderWarehouseList(Store.state.warehouses);
  }

  function renderWarehouseList(warehouses) {
    const listEl = $('warehouse-list');
    if (!listEl) return;

    const filter = Store.get('warehouseFilter');
    const filtered = filter === 'all' ? warehouses :
      warehouses.filter(w => {
        if (filter === 'feed') return w.warehouse_type?.toLowerCase().includes('feed');
        if (filter === 'medicine') return w.warehouse_type?.toLowerCase().includes('medicine');
        if (filter === 'supply') return w.warehouse_type?.toLowerCase().includes('supply');
        return true;
      });

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">Không có vật tư</div>';
      return;
    }

    listEl.innerHTML = filtered.map(w => `
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div class="flex justify-between items-start">
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-gray-900 truncate">${Format.escapeHtml(w.name || 'Kho ' + w.id)}</div>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">${Format.escapeHtml(w.code || w.warehouse_type || 'unknown')}</span>
              <span class="text-xs px-2 py-0.5 rounded-full ${w.is_central ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}">${w.is_central ? 'Tổng' : 'Địa phương'}</span>
            </div>
          </div>
        </div>
      </div>`).join('');
  }

  function renderWarehouseDetail(warehouses) {
    const listEl = $('warehouse-detail-list');
    if (!listEl) return;

    if (warehouses.length === 0) {
      listEl.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">Không có kho</div>';
      return;
    }

    listEl.innerHTML = warehouses.map(w => `
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div class="font-semibold text-gray-900">${Format.escapeHtml(w.name || 'Kho ' + w.id)}</div>
        <div class="text-xs text-gray-500 mt-1">${w.code || ''} - ${w.warehouse_type || ''}</div>
        <div class="flex items-center gap-2 mt-2">
          <span class="text-xs px-2 py-0.5 rounded-full ${w.is_central ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}">${w.is_central ? 'Tổng' : 'Địa phương'}</span>
        </div>
      </div>`).join('');
  }

  return { setFilter, renderWarehouseList, renderWarehouseDetail };
})();