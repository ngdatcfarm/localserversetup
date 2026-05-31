// Care Tab: Feed, Death, Medication, Weight, Water, Health forms
const CareTab = (function() {
  const $ = (id) => document.getElementById(id);

  const state = {
    selectedCycleId: null,
    selectedDate: new Date().toISOString().slice(0, 10),
    currentShift: 'sang',
    currentTab: 'feed',
    weightMode: 'aggregate',
    feedLogs: [], deathLogs: [], medLogs: [],
    weightLogs: [], waterLogs: [], healthLogs: [],
    vaccineSchedules: []
  };

  // Form getters
  const getFeedData = () => {
    const bags = parseInt($('care-feed-bags')?.value || 0);
    const kg = parseInt($('care-feed-kg')?.value || 0);
    const qty = bags > 0 ? bags * 25 : kg;
    return { quantity: qty, warehouse_id: $('care-feed-warehouse')?.value || null, notes: $('care-feed-notes')?.value || '' };
  };

  const getDeathData = () => ({
    count: parseInt($('care-death-count')?.value || 0),
    cause: $('care-death-cause')?.value || null,
    symptoms: $('care-death-symptoms')?.value || '',
    notes: $('care-death-notes')?.value || ''
  });

  const getMedData = () => ({
    med_type: $('care-med-type')?.value || 'medicine',
    quantity: parseFloat($('care-med-qty')?.value || 0),
    unit: $('care-med-unit')?.value || 'g',
    method: $('care-med-method')?.value || 'water',
    notes: $('care-med-notes')?.value || ''
  });

  const getWeightData = () => ({
    sample_count: parseInt($('care-weight-count')?.value || 0),
    total_weight: parseFloat($('care-weight-total')?.value || 0)
  });

  const getWaterData = () => ({
    consumption_liters: parseFloat($('care-water-liters')?.value || 0),
    medicated: $('care-water-medicated')?.checked || false,
    notes: $('care-water-notes')?.value || ''
  });

  const getHealthData = () => {
    const flags = [];
    document.querySelectorAll('.care-health-flag:checked').forEach(cb => flags.push(cb.value));
    return { severity: $('care-health-severity')?.value || 'normal', health_flags: flags, notes: $('care-health-notes')?.value || '' };
  };

  // Load logs for selected cycle
  async function loadLogs() {
    if (!state.selectedCycleId) return;
    try {
      const cycleId = state.selectedCycleId;
      const [f, d, m, w, wc, h, vs] = await Promise.all([
        API.care.feedHistory(cycleId),
        API.care.deathHistory(cycleId),
        API.care.medHistory(cycleId),
        API.care.weightHistory(cycleId),
        API.care.waterHistory(cycleId),
        API.care.healthHistory(cycleId),
        API.vaccines.schedules.list(cycleId)
      ]);
      state.feedLogs = f || [];
      state.deathLogs = d || [];
      state.medLogs = m || [];
      state.weightLogs = w || [];
      state.waterLogs = wc || [];
      state.healthLogs = h || [];
      state.vaccineSchedules = vs || [];
    } catch (e) { console.error('Care load logs error:', e); }
  }

  // Render cycle selector
  function renderCycleSelect(cycles) {
    const sel = $('care-cycle-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">Chọn chu kỳ...</option>' +
      cycles.filter(c => c.status === 'active').map(c =>
        `<option value="${c.id}">${c.name || 'Chu kỳ ' + c.id} - ${c.barn_id || ''}</option>`
      ).join('');
    if (state.selectedCycleId) sel.value = state.selectedCycleId;
  }

  // Show toast
  function showToast(msg, type = 'success') {
    const container = $('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // Render stats
  function renderStats(cycle) {
    const dateStr = state.selectedDate;

    // Day age
    let dayAge = 0;
    if (cycle && cycle.start_date) {
      const start = new Date(cycle.start_date);
      const today = new Date(dateStr);
      dayAge = Math.floor((today - start) / (1000 * 60 * 60 * 24));
    }

    // Today stats
    const todayFeeds = state.feedLogs.filter(l => l.feed_date === dateStr);
    const todayDeaths = state.deathLogs.filter(l => l.death_date === dateStr);
    const todayWeights = state.weightLogs.filter(l => l.weigh_date === dateStr);

    const totalFeed = todayFeeds.reduce((s, l) => s + (l.quantity || 0), 0);
    const totalDead = todayDeaths.reduce((s, l) => s + (l.count || 0), 0);
    const latestWeight = todayWeights[0];
    let avgWeight = '-';
    if (latestWeight && latestWeight.sample_count > 0) {
      avgWeight = ((latestWeight.total_weight / latestWeight.sample_count) / 1000).toFixed(0);
    }
    const totalDeathsAll = state.deathLogs.reduce((s, l) => s + (l.count || 0), 0);
    const alive = cycle ? (cycle.initial_count || 0) - totalDeathsAll : 0;

    $('care-stat-feed').textContent = totalFeed > 0 ? totalFeed.toFixed(0) : '-';
    $('care-stat-dead').textContent = totalDead > 0 ? totalDead : '-';
    $('care-stat-weight').textContent = avgWeight !== '-' ? avgWeight + 'kg' : '-';
    $('care-stat-alive').textContent = alive > 0 ? alive.toLocaleString() : '-';

    // Day status
    const morningFeeds = todayFeeds.filter(l => l.meal === 'sang' || l.meal === 'all_day');
    const afternoonFeeds = todayFeeds.filter(l => l.meal === 'chieu');
    const statusEl = $('care-day-status');
    if (morningFeeds.length > 0 && afternoonFeeds.length > 0) {
      statusEl.textContent = '✅ Đã nhập đủ';
      statusEl.className = 'text-xs px-2 py-1 rounded-full bg-green-100 text-green-700';
    } else if (morningFeeds.length > 0 || afternoonFeeds.length > 0) {
      statusEl.textContent = '⚠️ Thiếu ca';
      statusEl.className = 'text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700';
    } else {
      statusEl.textContent = '⏳ Chưa nhập';
      statusEl.className = 'text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500';
    }

    // Vaccine alert
    const vaccineEl = $('care-vaccine-alert');
    const vaccinesToday = state.vaccineSchedules.filter(v => v.day_age_target === dayAge && !v.done && !v.skipped);
    if (vaccinesToday.length > 0) {
      vaccineEl.style.display = 'block';
      $('care-vaccine-text').textContent = vaccinesToday.map(v => v.name || v.vaccine_type || 'Vaccine').join(', ');
    } else {
      vaccineEl.style.display = 'none';
    }

    // Shift button
    $('care-shift-btn').textContent = state.currentShift === 'sang' ? 'Sáng' : 'Chiều';
    $('care-shift-btn').className = state.currentShift === 'sang'
      ? 'px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-white'
      : 'px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-500 text-white';

    // Tab highlighting
    document.querySelectorAll('.care-tab').forEach(btn => {
      btn.className = 'care-tab flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium ' +
        (btn.dataset.tab === state.currentTab ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600');
    });

    // Show correct form
    document.querySelectorAll('.care-form').forEach(f => f.style.display = 'none');
    const formEl = $('care-form-' + state.currentTab);
    if (formEl) formEl.style.display = 'block';

    // Render today's logs
    renderTodayLogs();
  }

  function renderTodayLogs() {
    const dateStr = state.selectedDate;
    const logsEl = $('care-today-logs');
    const items = [];

    state.feedLogs.filter(l => l.feed_date === dateStr).forEach(l => {
      items.push({ icon: '🌾', text: `${l.quantity || 0}kg thức ăn`, time: l.meal === 'sang' ? 'Sáng' : 'Chiều', color: 'text-green-600' });
    });
    state.deathLogs.filter(l => l.death_date === dateStr).forEach(l => {
      items.push({ icon: '💀', text: `${l.count || 0} con hao hụt`, time: l.shift === 'sang' ? 'Sáng' : 'Chiều', color: 'text-red-500' });
    });
    state.medLogs.filter(l => l.med_date === dateStr).forEach(l => {
      items.push({ icon: '💊', text: `${l.quantity || 0}${l.unit || 'g'} thuốc`, time: l.shift === 'sang' ? 'Sáng' : 'Chiều', color: 'text-blue-500' });
    });
    state.weightLogs.filter(l => l.weigh_date === dateStr).forEach(l => {
      const avg = l.sample_count > 0 ? (l.total_weight / l.sample_count).toFixed(0) : '-';
      items.push({ icon: '⚖️', text: `${l.sample_count || 0} con, TB ${avg}g`, time: '', color: 'text-blue-500' });
    });
    state.waterLogs.filter(l => l.water_date === dateStr).forEach(l => {
      items.push({ icon: '💧', text: `${l.consumption_liters || 0}l nước`, time: '', color: 'text-cyan-500' });
    });

    if (items.length === 0) {
      logsEl.innerHTML = '<div class="text-center py-4 text-gray-400 text-sm">Chưa có nhật ký hôm nay</div>';
    } else {
      logsEl.innerHTML = items.map(item => `
        <div class="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex items-center gap-3">
          <span class="text-lg ${item.color}">${item.icon}</span>
          <span class="flex-1 text-sm text-gray-700">${item.text}</span>
          ${item.time ? `<span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">${item.time}</span>` : ''}
        </div>`).join('');
    }
  }

  // Public API
  function setCycle(id, cycles) {
    state.selectedCycleId = id;
    if (id) { loadLogs(); }
    renderCycleSelect(cycles);
    const cycle = cycles.find(c => c.id == id);
    renderStats(cycle);
  }

  function setDate(date) {
    state.selectedDate = date;
    const cycle = Store.state.cycles.find(c => c.id == state.selectedCycleId);
    renderStats(cycle);
  }

  function toggleShift() {
    state.currentShift = state.currentShift === 'sang' ? 'chieu' : 'sang';
    const btn = $('care-shift-btn');
    btn.textContent = state.currentShift === 'sang' ? 'Sáng' : 'Chiều';
    btn.className = state.currentShift === 'sang'
      ? 'px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-white'
      : 'px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-500 text-white';
  }

  function setTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll('.care-tab').forEach(btn => {
      btn.className = 'care-tab flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium ' +
        (btn.dataset.tab === tab ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600');
    });
    document.querySelectorAll('.care-form').forEach(f => f.style.display = 'none');
    const formEl = $('care-form-' + tab);
    if (formEl) formEl.style.display = 'block';
  }

  function setWeightMode(mode) {
    state.weightMode = mode;
  }

  async function submitFeed() {
    if (!state.selectedCycleId) { showToast('Chọn chu kỳ trước', 'error'); return; }
    const data = getFeedData();
    if (data.quantity <= 0) { showToast('Nhập số lượng', 'error'); return; }
    try {
      const cycles = Store.get('cycles');
      const cycle = cycles.find(c => c.id == state.selectedCycleId);
      await API.care.logFeed({
        cycle_id: parseInt(state.selectedCycleId), barn_id: cycle?.barn_id || '',
        feed_date: state.selectedDate, meal: state.currentShift,
        quantity: data.quantity, warehouse_id: data.warehouse_id, notes: data.notes
      });
      showToast('Đã lưu feed', 'success');
      $('care-feed-bags').value = '';
      $('care-feed-kg').value = '';
      $('care-feed-notes').value = '';
      await loadLogs();
      renderStats(cycle);
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
  }

  async function submitDeath() {
    if (!state.selectedCycleId) { showToast('Chọn chu kỳ trước', 'error'); return; }
    const data = getDeathData();
    if (data.count <= 0) { showToast('Nhập số lượng', 'error'); return; }
    try {
      const cycles = Store.get('cycles');
      const cycle = cycles.find(c => c.id == state.selectedCycleId);
      await API.care.logDeath({
        cycle_id: parseInt(state.selectedCycleId), barn_id: cycle?.barn_id || '',
        death_date: state.selectedDate, count: data.count, cause: data.cause,
        symptoms: data.symptoms, notes: data.notes, shift: state.currentShift
      });
      showToast('Đã lưu hao hụt', 'success');
      $('care-death-count').value = '';
      $('care-death-cause').value = '';
      $('care-death-symptoms').value = '';
      $('care-death-notes').value = '';
      await loadLogs();
      renderStats(cycle);
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
  }

  async function submitMed() {
    if (!state.selectedCycleId) { showToast('Chọn chu kỳ trước', 'error'); return; }
    const data = getMedData();
    if (data.quantity <= 0) { showToast('Nhập số lượng', 'error'); return; }
    try {
      const cycles = Store.get('cycles');
      const cycle = cycles.find(c => c.id == state.selectedCycleId);
      await API.care.logMedication({
        cycle_id: parseInt(state.selectedCycleId), barn_id: cycle?.barn_id || '',
        med_date: state.selectedDate, med_type: data.med_type,
        quantity: data.quantity, unit: data.unit, method: data.method,
        notes: data.notes, shift: state.currentShift
      });
      showToast('Đã lưu thuốc', 'success');
      $('care-med-qty').value = '';
      $('care-med-notes').value = '';
      await loadLogs();
      renderStats(cycle);
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
  }

  async function submitWeight() {
    if (!state.selectedCycleId) { showToast('Chọn chu kỳ trước', 'error'); return; }
    const data = getWeightData();
    if (data.sample_count <= 0 || data.total_weight <= 0) { showToast('Nhập số con và gram', 'error'); return; }
    try {
      const cycles = Store.get('cycles');
      const cycle = cycles.find(c => c.id == state.selectedCycleId);
      await API.care.logWeight({
        cycle_id: parseInt(state.selectedCycleId), barn_id: cycle?.barn_id || '',
        weigh_date: state.selectedDate, sample_count: data.sample_count, total_weight: data.total_weight
      });
      showToast('Đã lưu cân', 'success');
      $('care-weight-count').value = '';
      $('care-weight-total').value = '';
      await loadLogs();
      renderStats(cycle);
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
  }

  async function submitWater() {
    if (!state.selectedCycleId) { showToast('Chọn chu kỳ trước', 'error'); return; }
    const data = getWaterData();
    if (data.consumption_liters <= 0) { showToast('Nhập lượng nước', 'error'); return; }
    try {
      const cycles = Store.get('cycles');
      const cycle = cycles.find(c => c.id == state.selectedCycleId);
      await API.care.logWater({
        cycle_id: parseInt(state.selectedCycleId), barn_id: cycle?.barn_id || '',
        water_date: state.selectedDate, consumption_liters: data.consumption_liters,
        medicated: data.medicated, notes: data.notes
      });
      showToast('Đã lưu nước', 'success');
      $('care-water-liters').value = '';
      $('care-water-notes').value = '';
      await loadLogs();
      renderStats(cycle);
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
  }

  async function submitHealth() {
    if (!state.selectedCycleId) { showToast('Chọn chu kỳ trước', 'error'); return; }
    const data = getHealthData();
    try {
      const cycles = Store.get('cycles');
      const cycle = cycles.find(c => c.id == state.selectedCycleId);
      await API.care.logHealth({
        cycle_id: parseInt(state.selectedCycleId), barn_id: cycle?.barn_id || '',
        severity: data.severity, health_flags: data.health_flags, notes: data.notes
      });
      showToast('Đã lưu sức khỏe', 'success');
      $('care-health-notes').value = '';
      await loadLogs();
      renderStats(cycle);
    } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
  }

  function init(cycles) {
    const dateInput = $('care-date-input');
    if (dateInput) dateInput.value = state.selectedDate;
    renderCycleSelect(cycles);
    renderStats(null);
  }

  return {
    setCycle, setDate, toggleShift, setTab, setWeightMode,
    submitFeed, submitDeath, submitMed, submitWeight, submitWater, submitHealth,
    init, get state() { return state; }
  };
})();

// Attach to App for global access
if (typeof App !== 'undefined') { App.Care = CareTab; }