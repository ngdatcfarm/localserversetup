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

// ── App-wide state (used by router guard + sidebar user box) ──
const appState = reactive({
    currentUser: null,   // {id, username, role, must_change_password}
    authChecked: false,  // true after first /api/auth/me call
});

async function refreshCurrentUser() {
    try {
        appState.currentUser = await API.auth.me();
    } catch {
        appState.currentUser = null;
    }
    appState.authChecked = true;
    return appState.currentUser;
}

async function doLogout() {
    try { await API.auth.logout(); } catch {}
    appState.currentUser = null;
    router.push('/login');
}

// Global 401 handler: any API call that returns 401 (except /api/auth/*)
// will trigger a redirect to /login. Defined in api.js, fired here.
window.addEventListener('auth:unauthorized', () => {
    appState.currentUser = null;
    if (router.currentRoute.value.path !== '/login') {
        showToast('Phiên đăng nhập đã hết, vui lòng đăng nhập lại', 'error');
        router.push('/login');
    }
});
// ── Router ──
const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/login', component: () => loadPage('login'), meta: { public: true } },
        { path: '/', component: () => loadPage('dashboard') },
        { path: '/barns', component: () => loadPage('barns') },
        { path: '/cycles', component: () => loadPage('cycles') },
        { path: '/cycles/:id', component: () => loadPage('cycle-detail'), props: true },
        { path: '/devices', component: () => loadPage('devices') },
        { path: '/relays', component: () => loadPage('relays') },
        { path: '/bats', component: () => loadPage('bats') },
        { path: '/bats/:barnId', component: () => loadPage('bats-detail'), props: true },
        { path: '/equipment', component: () => loadPage('equipment') },
        { path: '/sensors', component: () => loadPage('sensors') },
        { path: '/inventory', component: () => loadPage('inventory') },
        { path: '/inventory/:warehouseId', component: () => loadPage('inventory-detail'), props: true },
        { path: '/care', component: () => loadPage('care') },
        { path: '/care-daily', component: () => loadPage('care-daily') },
        { path: '/feeds', component: () => loadPage('feeds') },
        { path: '/medications', component: () => loadPage('medications') },
        { path: '/suppliers', component: () => loadPage('suppliers') },
        { path: '/vaccines', component: () => loadPage('vaccines') },
        { path: '/notifications', component: () => loadPage('notifications') },
        { path: '/alerts', component: () => loadPage('alerts') },
        { path: '/automation', component: () => loadPage('automation') },
        { path: '/tech', component: () => loadPage('tech') },
        { path: '/cameras', component: () => loadPage('cameras') },
        { path: '/sync', component: () => loadPage('sync') },
        { path: '/density-label', component: () => loadPage('density_label') },
        { path: '/chat', component: () => loadPage('chat') },
    ],
});

// ── Auth navigation guard ──
// Public routes (/login) are accessible without a session.
// All other routes require `currentUser` to be loaded and valid.
// A 401 from any API call dispatches `auth:unauthorized` and the user
// is bounced back to /login.
router.beforeEach(async (to) => {
    if (to.meta?.public) return true;
    if (!appState.currentUser) {
        try {
            appState.currentUser = await API.auth.me();
        } catch {
            appState.currentUser = null;
        }
    }
    if (!appState.currentUser) {
        return { path: '/login' };
    }
    return true;
});

// Dynamic component loader — uses native ES module dynamic import().
// Earlier version used `new Function(code)` to evaluate page scripts, but that
// approach threw "Invalid or unexpected token" intermittently on the *first*
// call during initial route resolution (subsequent calls worked, suggesting
// a V8 parser timing/race condition). import() uses V8's module pipeline
// which is rock-solid and shared with the rest of the app.
const pageCache = {};
async function loadPage(name) {
    if (pageCache[name]) return pageCache[name];
    // Cache-bust: append timestamp to force fresh fetch
    const t = Date.now();
    const mod = await import(`/static/js/pages/${name}.js?_=${t}`);
    const component = mod.default;
    if (!component) {
        throw new Error(`Page module ${name}.js has no default export`);
    }
    pageCache[name] = component;
    return component;
}

// ── App ──
const app = createApp({
    setup() {
        const sidebarOpen = ref(false);
        const serverStatus = reactive({ ok: false, mqtt: false, devices: 0, online: 0 });
        const viewMode = ref(localStorage.getItem('cfarm_view') || (window.innerWidth < 768 ? 'mobile' : 'desktop'));

        function setView(mode) {
            viewMode.value = mode;
            localStorage.setItem('cfarm_view', mode);
        }

        const navItems = [
            { path: '/', icon: '📊', label: 'Dashboard' },
            { path: '/barns', icon: '🏠', label: 'Chuồng trại' },
            { path: '/cycles', icon: '🔄', label: 'Đợt nuôi' },
            { path: '/devices', icon: '📡', label: 'Thiết bị' },
            { path: '/relays', icon: '🔌', label: 'Điều khiển' },
            { path: '/bats', icon: '🪟', label: 'Bạt' },
            { path: '/equipment', icon: '⚙️', label: 'Cơ cấu' },
            { path: '/sensors', icon: '🌡️', label: 'Môi trường' },
            { path: '/feeds', icon: '🌾', label: 'Thức ăn' },
            { path: '/medications', icon: '💊', label: 'Thuốc' },
            { path: '/vaccines', icon: '💉', label: 'Vaccine' },
            { path: '/inventory', icon: '📦', label: 'Kho' },
            { path: '/suppliers', icon: '🏭', label: 'Nhà cung cấp' },
            { path: '/care', icon: '🩺', label: 'Chăm sóc' },
            { path: '/care-daily', icon: '🌾', label: 'Care Nhanh' },
            { path: '/notifications', icon: '🔔', label: 'Thông báo' },
            { path: '/alerts', icon: '🔔', label: 'Cảnh báo' },
            { path: '/automation', icon: '⚡', label: 'Tự động hóa' },
            { path: '/tech', icon: '⚙️', label: 'TECH' },
            { path: '/cameras', icon: '📹', label: 'Camera' },
            { path: '/sync', icon: '☁️', label: 'Cloud Sync' },
            { path: '/density-label', icon: '🎯', label: 'Density Label' },
            { path: '/chat', icon: '💬', label: 'AI Chat' },
        ];

        const externalLinks = [
            { href: '/recordings', icon: '💾', label: 'Bản ghi' },
            { href: '/database', icon: '🗄️', label: 'Database' },
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
            // Pre-fetch current user so the sidebar shows username/role
            // on first render. The router guard does its own check too.
            refreshCurrentUser();
            checkHealth();
            setInterval(checkHealth, 30000);

            // Register service worker for push notifications
            if ('serviceWorker' in navigator) {
                console.log('[App] Registering SW at /sw.js');
                navigator.serviceWorker.register('/sw.js')
                    .then(reg => {
                        console.log('[App] Service Worker registered:', reg.scope);
                        console.log('[App] SW state:', reg.active ? 'active' : 'installing');
                    })
                    .catch(err => {
                        console.error('[App] SW registration failed:', err);
                        console.error('[App] SW Error name:', err.name, 'message:', err.message);
                    });
            } else {
                console.warn('[App] ServiceWorker not supported');
            }
        });

        return { sidebarOpen, serverStatus, viewMode, setView, navItems, externalLinks, toast,
                 appState, doLogout };
    }
});

app.use(router);
app.mount('#app');
