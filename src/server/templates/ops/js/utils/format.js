// Utils: Format functions
const Format = {
  relativeTime(ts) {
    if (!ts) return 'N/A';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return `${Math.floor(hours / 24)} ngày trước`;
  },

  date(ts) {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleDateString('vi-VN');
  },

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  },

  normalize(obj) {
    if (!obj) return null;
    if (Array.isArray(obj)) return obj;
    if (obj.data) return obj.data;
    if (obj.items) return obj.items;
    return obj;
  },

  parsePosition(pos) {
    if (!pos) return 0;
    if (typeof pos === 'number') return pos;
    if (typeof pos === 'string') {
      const num = parseFloat(pos.replace(/[^\d.]/g, ''));
      return isNaN(num) ? 0 : Math.min(100, Math.max(0, num));
    }
    return 0;
  }
};
