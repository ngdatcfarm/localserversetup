/**
 * CFarm Main App - Vue 3 + Vue Router
 */
const { createApp, ref, reactive, onMounted, computed, watch } = Vue;
const { createRouter, createWebHashHistory } = VueRouter;

// ── Toast notification system ──
const toast = reactive({ show: false, msg: '', type: 'success', timer: null });
function showToast(msg, type = 'success') {
    toast.msg = msg;
    toast.type = type;
    toast.show = true;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => toast.show = false, 3000);
}

// ── Utility ──
function fmtDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('vi-VN');
}
function fmtNum(n, dec = 0) {
    if (n === null || n === undefined) return '-';
    return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ── Router ──
const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/', component: () => loadPage('dashboard') },
        { path: '/barns', component: () => loadPage('barns') },
        { path: '/cycles', component: () => loadPage('cycles') },
        { path: '/cycles/:id', component: () => loadPage('cycle-detail'), props: true },
        { path: '/devices', component: () => loadPage('devices') },
        { path: '/inventory', component: () => loadPage('inventory') },
        { path: '/care', component: () => loadPage('care') },
        { path: '/alerts', component: () => loadPage('alerts') },
        { path: '/automation', component: () => loadPage('automation') },
        { path: '/cameras', component: () => loadPage('cameras') },
    ],
});

// Dynamic component loader
const pageCache = {};
function loadPage(name) {
    if (pageCache[name]) return Promise.resolve(pageCache[name]);
    return fetch(`/static/js/pages/${name}.js`)
        .then(r => r.text())
        .then(code => {
            const component = new Function('Vue', 'API', 'showToast', 'fmtDate', 'fmtNum', code)(
                Vue, API, showToast, fmtDate, fmtNum
            );
            pageCache[name] = component;
            return component;
        });
}

// ── App ──
const app = createApp({
    setup() {
        const sidebarOpen = ref(false);
        const serverStatus = reactive({ ok: false, mqtt: false, devices: 0, online: 0 });

        const navItems = [
            { path: '/', icon: '📊', label: 'Dashboard' },
            { path: '/barns', icon: '🏠', label: 'Chuồng trại' },
            { path: '/cycles', icon: '🔄', label: 'Đợt nuôi' },
            { path: '/devices', icon: '📡', label: 'Thiết bị' },
            { path: '/inventory', icon: '📦', label: 'Kho' },
            { path: '/care', icon: '🩺', label: 'Chăm sóc' },
            { path: '/alerts', icon: '🔔', label: 'Cảnh báo' },
            { path: '/automation', icon: '⚡', label: 'Tự động hóa' },
            { path: '/cameras', icon: '📹', label: 'Camera' },
        ];

        const externalLinks = [
            { href: '/recordings', icon: '💾', label: 'Bản ghi' },
        ];

        async function checkHealth() {
            try {
                const h = await API.health();
                serverStatus.ok = h.status === 'healthy';
                serverStatus.mqtt = h.mqtt?.connected;
                serverStatus.devices = h.devices?.total || 0;
                serverStatus.online = h.devices?.online || 0;
            } catch { serverStatus.ok = false; }
        }

        onMounted(() => {
            checkHealth();
            setInterval(checkHealth, 30000);
        });

        return { sidebarOpen, serverStatus, navItems, externalLinks, toast };
    }
});

app.use(router);
app.mount('#app');
