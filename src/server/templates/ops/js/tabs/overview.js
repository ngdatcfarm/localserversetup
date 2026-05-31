// Overview Tab: Main dashboard with Today Focus, Alerts, Stats, Notifications
const OverviewTab = (function() {
  const $ = (id) => document.getElementById(id);

  function getNotificationIcon(type) {
    const icons = {
      'info': 'ℹ️', 'warning': '⚠️', 'error': '🚨', 'success': '✅',
      'care': '💊', 'feed': '🌾', 'weight': '⚖️',
      'CARE_FEED_MISSING': '🌾', 'CARE_MEDICATION_REMINDER': '💊',
      'WEIGHT_REMINDER': '⚖️', 'BAT_ALERT': '🎚️'
    };
    return icons[type] || '📌';
  }

  function getNotificationSeverity(type) {
    const danger = ['CARE_FEED_MISSING', 'error', 'WEIGHT_REMINDER'];
    const warning = ['CARE_MEDICATION_REMINDER', 'warning'];
    if (danger.includes(type)) return 'danger';
    if (warning.includes(type)) return 'warning';
    return 'info';
  }

  function render(data) {
    const { cycles, barns, notifications, alerts } = data;
    const activeCycles = cycles.filter(c => c.status === 'active');
    const unread = notifications.filter(n => !n.acknowledged_at);
    const activeAlerts = alerts.filter(a => !a.acknowledged_at);

    // Stats
    $('stat-cycles').textContent = activeCycles.length;
    $('stat-notifications').textContent = unread.length;
    $('stat-alerts').textContent = activeAlerts.length;
    $('stat-lowstock').textContent = '0';
    $('stat-tasks').textContent = unread.length + activeAlerts.length;

    // ===== TODAY FOCUS =====
    const focusItems = [];
    const careMissings = notifications.filter(n => n.type === 'CARE_FEED_MISSING' && !n.acknowledged_at);
    careMissings.forEach(n => {
      focusItems.push({ type: 'warning', icon: '🌾', text: 'Chưa ghi nhận cho ăn', sub: n.body || '', time: n.sent_at });
    });

    const focusEl = $('today-focus');
    if (focusItems.length === 0) {
      focusEl.innerHTML = '<div class="text-sm text-green-600 flex items-center gap-2">✅ Không có việc gấp hôm nay</div>';
    } else {
      focusEl.innerHTML = focusItems.map(item => `
        <div class="bg-orange-50 rounded-xl p-3 border border-orange-200">
          <div class="flex items-center gap-2">
            <span class="text-lg">${item.icon}</span>
            <div class="flex-1">
              <div class="font-medium text-orange-700 text-sm">${item.text}</div>
              ${item.sub ? `<div class="text-xs text-orange-500 mt-0.5">${Format.escapeHtml(item.sub)}</div>` : ''}
            </div>
          </div>
        </div>`).join('');
    }

    // ===== ENVIRONMENT SUMMARY =====
    const envEl = $('env-abnormal-summary');
    const barnEnvData = barns.map(b => {
      const sensors = data.sensors[b.id] || [];
      const tempSensor = sensors.find(s => s.sensor_type === 'temperature');
      return { barn: b, temp: tempSensor ? parseFloat(tempSensor.value) : null };
    }).filter(x => x.temp !== null);

    let abnormalCount = 0;
    let hottestBarn = null;
    let maxTemp = 0;

    barnEnvData.forEach(({ barn, temp }) => {
      if (temp > 35 || temp < 15) abnormalCount++;
      if (temp > maxTemp) { maxTemp = temp; hottestBarn = barn; }
    });

    if (abnormalCount > 0) {
      envEl.innerHTML = `
        <div class="flex items-center gap-2 text-orange-600">
          <span class="text-lg">⚠️</span>
          <span class="text-sm font-medium">${abnormalCount} chuồng bất thường</span>
        </div>
        ${hottestBarn && maxTemp > 35 ? `<div class="text-xs text-red-600 mt-1">${hottestBarn.name}: ${maxTemp}°C</div>` : ''}
        <div class="text-xs text-gray-500 mt-1">Chuồng nóng nhất: ${hottestBarn ? hottestBarn.name + ' (' + maxTemp + '°C)' : 'N/A'}</div>`;
    } else {
      envEl.innerHTML = `
        <div class="flex items-center gap-2 text-green-600">
          <span class="text-lg">✅</span>
          <span class="text-sm font-medium">Tất cả chuồng bình thường</span>
        </div>
        ${hottestBarn ? `<div class="text-xs text-gray-500 mt-1">Nóng nhất: ${hottestBarn.name} (${maxTemp}°C)</div>` : ''}`;
    }

    // ===== RECENT NOTIFICATIONS =====
    const notifEl = $('recent-notifications');
    if (notifications.length === 0) {
      notifEl.innerHTML = '<div class="text-center py-6 text-gray-400 text-sm">Không có thông báo</div>';
    } else {
      const colors = {
        danger: 'border-l-red-500 bg-red-50',
        warning: 'border-l-orange-500 bg-orange-50',
        info: 'border-l-blue-500 bg-blue-50',
        success: 'border-l-green-500 bg-green-50'
      };
      notifEl.innerHTML = notifications.slice(0, 5).map(n => {
        const severity = getNotificationSeverity(n.type);
        const unreadDot = !n.acknowledged_at ? '<span class="w-2 h-2 rounded-full bg-primary inline-block ml-2"></span>' : '';
        return `
          <div class="rounded-xl p-4 shadow-sm border border-gray-100 border-l-4 ${colors[severity] || 'bg-white'} ${!n.acknowledged_at ? '' : 'opacity-70'}">
            <div class="flex items-start gap-3">
              <span class="text-lg">${getNotificationIcon(n.type)}</span>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm text-gray-900 truncate">${n.title || n.body || 'Thông báo'}</div>
                <div class="text-xs text-gray-500 mt-1">${Format.relativeTime(n.sent_at)}</div>
              </div>
              ${unreadDot}
            </div>
          </div>`;
      }).join('');
    }
  }

  return { render };
})();