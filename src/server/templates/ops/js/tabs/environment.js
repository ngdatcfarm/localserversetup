// Environment Tab: Sensor readings per barn (temp, humidity, NH3, CO2)
const EnvironmentTab = (function() {
  const $ = (id) => document.getElementById(id);

  const THRESHOLDS = {
    temperature: { min: 15, max: 35, danger: 38 },
    humidity: { min: 40, max: 80, danger: 85 },
    ammonia: { max: 10, danger: 20 },
    co2: { max: 1000, danger: 2000 }
  };

  function getSensorColor(type, value) {
    if (value === null || value === undefined) return 'text-gray-400';
    const t = THRESHOLDS[type];
    if (!t) return 'text-gray-600';

    if (type === 'temperature') {
      if (value < t.min || value > t.danger) return 'text-red-500';
      if (value < t.min + 3 || value > t.max) return 'text-orange-500';
      return 'text-green-500';
    }
    if (type === 'humidity') {
      if (value < t.min - 10 || value > t.danger) return 'text-red-500';
      if (value < t.min || value > t.max) return 'text-orange-500';
      return 'text-green-500';
    }
    if (type === 'ammonia' || type === 'co2') {
      if (value > t.danger) return 'text-red-500';
      if (value > t.max) return 'text-orange-500';
      return 'text-green-500';
    }
    return 'text-gray-600';
  }

  function renderBarnSelector(barns, selectedId) {
    const container = $('env-barn-selector');
    if (!container) return;
    container.innerHTML = barns.map(b => `
      <button onclick="App.selectBarn('${b.id}')"
        class="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedId === b.id ? 'bg-primary text-white' : 'bg-white text-gray-600 border border-gray-200'}">
        ${b.name || b.id}
      </button>`).join('');
  }

  function renderSensors(sensors, barnName) {
    const container = $('env-sensor-grid');
    if (!container) return;

    const find = (type) => sensors.find(s => s.sensor_type === type);

    const temp = find('temperature');
    const humidity = find('humidity');
    const ammonia = find('ammonia');
    const co2 = find('co2');

    container.innerHTML = `
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-2xl">🌡️</span>
          <span class="text-xs text-gray-500 uppercase">Nhiệt độ</span>
        </div>
        <div class="text-2xl font-bold ${getSensorColor('temperature', temp ? parseFloat(temp.value) : null)}">
          ${temp ? parseFloat(temp.value).toFixed(1) + '°C' : '-'}
        </div>
        <div class="text-xs text-gray-400 mt-1">${temp?.time ? Format.relativeTime(temp.time) : ''}</div>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-2xl">💧</span>
          <span class="text-xs text-gray-500 uppercase">Độ ẩm</span>
        </div>
        <div class="text-2xl font-bold ${getSensorColor('humidity', humidity ? parseFloat(humidity.value) : null)}">
          ${humidity ? parseFloat(humidity.value).toFixed(0) + '%' : '-'}
        </div>
        <div class="text-xs text-gray-400 mt-1">${humidity?.time ? Format.relativeTime(humidity.time) : ''}</div>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-2xl">🧪</span>
          <span class="text-xs text-gray-500 uppercase">NH3</span>
        </div>
        <div class="text-2xl font-bold ${getSensorColor('ammonia', ammonia ? parseFloat(ammonia.value) : null)}">
          ${ammonia ? parseFloat(ammonia.value).toFixed(0) + ' ppm' : '-'}
        </div>
        <div class="text-xs text-gray-400 mt-1">${ammonia?.time ? Format.relativeTime(ammonia.time) : ''}</div>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-2xl">💨</span>
          <span class="text-xs text-gray-500 uppercase">CO2</span>
        </div>
        <div class="text-2xl font-bold ${getSensorColor('co2', co2 ? parseFloat(co2.value) : null)}">
          ${co2 ? parseFloat(co2.value).toFixed(0) + ' ppm' : '-'}
        </div>
        <div class="text-xs text-gray-400 mt-1">${co2?.time ? Format.relativeTime(co2.time) : ''}</div>
      </div>`;
  }

  function renderAllBarns(barns, sensors) {
    const container = $('env-all-barns');
    if (!container) return;

    if (barns.length === 0) {
      container.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">Không có chuồng</div>';
      return;
    }

    container.innerHTML = barns.map(barn => {
      const barnSensors = sensors[barn.id] || [];
      const temp = barnSensors.find(s => s.sensor_type === 'temperature');
      const humidity = barnSensors.find(s => s.sensor_type === 'humidity');
      const tempVal = temp ? parseFloat(temp.value) : null;

      let statusColor = 'bg-green-100 text-green-700';
      let statusText = 'Bình thường';
      if (tempVal !== null && (tempVal > 38 || tempVal < 15)) {
        statusColor = 'bg-red-100 text-red-700';
        statusText = 'Bất thường';
      } else if (tempVal !== null && (tempVal > 35 || tempVal < 18)) {
        statusColor = 'bg-orange-100 text-orange-700';
        statusText = 'Cảnh báo';
      }

      return `
        <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div class="flex justify-between items-start mb-3">
            <div class="font-semibold text-gray-900">${Format.escapeHtml(barn.name || barn.id)}</div>
            <span class="text-xs px-2 py-1 rounded-full ${statusColor}">${statusText}</span>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="flex items-center gap-2">
              <span class="text-lg">🌡️</span>
              <span class="text-sm ${getSensorColor('temperature', tempVal)}">${temp ? tempVal.toFixed(1) + '°C' : '-'}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-lg">💧</span>
              <span class="text-sm ${getSensorColor('humidity', humidity ? parseFloat(humidity.value) : null)}">${humidity ? parseFloat(humidity.value).toFixed(0) + '%' : '-'}</span>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  return { renderBarnSelector, renderSensors, renderAllBarns };
})();