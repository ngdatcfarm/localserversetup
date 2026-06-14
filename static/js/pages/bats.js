/**
 * Bats Dashboard - Tổng quan bạt điều khiển
 * - One card per barn showing bat status at a glance
 * - Click card → navigate to /bats/:barnId (bats-detail.js)
 */
const { ref, computed, onMounted, onUnmounted, watch } = Vue;
const { useRouter } = VueRouter;

export default {
    setup() {
        const router = useRouter();

        // ── State ──────────────────────────────────────
        const barns = ref([]);
        // { barnId: { bats: [...], loading: bool, error: string|null } }
        const barnBatData = ref({});
        const loading = ref(true);
        const filterMode = ref('all'); // 'all' | 'moving' | 'issue'

        // ── Computed ───────────────────────────────────
        const summary = computed(() => {
            const allBats = Object.values(barnBatData.value)
                .flatMap(d => d.bats || []);
            const moving = allBats.filter(b => b.moving_state && b.moving_state !== 'stopped').length;
            const withDevice = allBats.filter(b => b.device_id).length;
            const online = allBats.filter(b => b.is_online === true).length;
            const auto = allBats.filter(b => b.auto_enabled).length;
            const noDevice = allBats.filter(b => !b.device_id).length;
            return {
                total: allBats.length,
                moving,
                withDevice,
                online,
                auto,
                noDevice,
            };
        });

        const cards = computed(() => {
            return barns.value
                .map(b => {
                    const data = barnBatData.value[b.id] || { bats: [], loading: true };
                    const bats = data.bats || [];
                    const moving = bats.filter(x => x.moving_state && x.moving_state !== 'stopped').length;
                    const noDevice = bats.filter(x => !x.device_id).length;
                    const auto = bats.filter(x => x.auto_enabled).length;
                    // Device online if any bat has an online device
                    const devices = [...new Set(bats.map(x => x.device_id).filter(Boolean))];
                    const anyDeviceOnline = bats.some(x => x.is_online === true);
                    const anyDeviceOffline = bats.some(x => x.device_id && x.is_online === false);

                    return {
                        barn: b,
                        bats,
                        loading: data.loading,
                        error: data.error,
                        moving,
                        noDevice,
                        auto,
                        devices,
                        anyDeviceOnline,
                        anyDeviceOffline,
                        hasIssue: noDevice > 0 || (devices.length > 0 && !anyDeviceOnline),
                    };
                })
                .filter(c => {
                    if (filterMode.value === 'moving') return c.moving > 0;
                    if (filterMode.value === 'issue') return c.hasIssue;
                    return c.bats.length > 0; // default: only show barns that have bats configured
                });
        });

        // ── API ────────────────────────────────────────
        async function load() {
            try {
                barns.value = await API.barns.list();
            } catch (e) {
                console.error('Load barns error:', e);
            }
        }

        async function loadBatsForBarn(barnId) {
            try {
                const bats = await API.bats.listByBarn(barnId);
                barnBatData.value[barnId] = { bats, loading: false, error: null };
            } catch (e) {
                barnBatData.value[barnId] = { bats: [], loading: false, error: e.message };
            }
        }

        async function loadAllBats() {
            // Seed loading state for each barn
            for (const b of barns.value) {
                if (!barnBatData.value[b.id]) {
                    barnBatData.value[b.id] = { bats: [], loading: true, error: null };
                }
            }
            loading.value = true;
            await Promise.all(barns.value.map(b => loadBatsForBarn(b.id)));
            loading.value = false;
        }

        // ── Helpers (UI formatting) ────────────────────
        const POS_LABELS = {
            'left_top': 'Trái trên',
            'left_bottom': 'Trái dưới',
            'right_top': 'Phải trên',
            'right_bottom': 'Phải dưới',
        };

        function batStateIcon(bat) {
            if (!bat.device_id) return '⚫';
            if (bat.moving_state === 'up') return '🟢';
            if (bat.moving_state === 'down') return '🔴';
            return '⚪';
        }

        function batStateLabel(bat) {
            if (!bat.device_id) return 'Chưa gắn';
            if (bat.moving_state === 'up') return 'Đang lên';
            if (bat.moving_state === 'down') return 'Đang xuống';
            return 'Dừng';
        }

        function deviceStatusText(card) {
            if (card.devices.length === 0) return 'Chưa gắn ESP32';
            if (card.anyDeviceOnline) return 'ESP32 online';
            if (card.anyDeviceOffline) return 'ESP32 offline';
            return 'ESP32 không rõ';
        }

        function deviceStatusColor(card) {
            if (card.devices.length === 0) return 'gray';
            if (card.anyDeviceOnline) return 'green';
            if (card.anyDeviceOffline) return 'red';
            return 'gray';
        }

        function posLabel(pos) {
            return POS_LABELS[pos] || pos;
        }

        function findBat(card, pos) {
            return card.bats.find(b => b.code === pos);
        }

        function miniIcon(card, pos) {
            const bat = findBat(card, pos);
            if (!bat) return '·';
            return batStateIcon(bat);
        }

        function miniClass(card, pos) {
            const bat = findBat(card, pos);
            if (!bat) return 'none';
            if (!bat.device_id) return 'no-device';
            if (bat.moving_state === 'up') return 'up';
            if (bat.moving_state === 'down') return 'down';
            return 'stopped';
        }

        function miniTitle(card, pos) {
            const bat = findBat(card, pos);
            if (!bat) return 'Chưa cấu hình';
            return batStateLabel(bat);
        }

        function goToDetail(card) {
            router.push('/bats/' + card.barn.id);
        }

        // ── Light polling: re-fetch barns that have moving bats ──
        let pollInterval = null;
        function startPolling() {
            stopPolling();
            pollInterval = setInterval(() => {
                if (summary.value.moving > 0) {
                    const movingBarns = cards.value.filter(c => c.moving > 0).map(c => c.barn.id);
                    movingBarns.forEach(loadBatsForBarn);
                }
            }, 3000);
        }
        function stopPolling() {
            if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        }

        const stopWatchMoving = watch(() => summary.value.moving, (m) => {
            if (m > 0) startPolling();
            else stopPolling();
        });

        onMounted(async () => {
            await load();
            await loadAllBats();
        });

        onUnmounted(() => {
            stopPolling();
            stopWatchMoving();
        });

        return {
            barns, barnBatData, loading, filterMode, summary, cards,
            batStateIcon, batStateLabel, deviceStatusText, deviceStatusColor,
            posLabel, miniIcon, miniClass, miniTitle,
            goToDetail,
        };
    },

    template: `
    <div class="cf-container">

        <!-- Header -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <div class="cf-header-icon" style="background-color: #0ea5e9;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="14" rx="2"/>
                        <path d="M3 9h18"/>
                        <path d="M9 4v14"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">Điều khiển bạt</h1>
                    <p class="cf-subtitle">Bạt thông gió các chuồng</p>
                </div>
            </div>
            <div class="cf-header-right">
                <button @click="location.reload()" class="cf-btn-sm cf-btn-secondary" title="Tải lại">🔄</button>
            </div>
        </div>

        <!-- Summary bar -->
        <div class="cf-bats-summary">
            <div class="cf-bats-summary-item">
                <span class="cf-bats-summary-icon">🏠</span>
                <div>
                    <div class="cf-bats-summary-value">{{ cards.length }}</div>
                    <div class="cf-bats-summary-label">Chuồng có bạt</div>
                </div>
            </div>
            <div class="cf-bats-summary-item" :class="{ highlight: summary.moving > 0 }">
                <span class="cf-bats-summary-icon">⚡</span>
                <div>
                    <div class="cf-bats-summary-value">{{ summary.moving }}</div>
                    <div class="cf-bats-summary-label">Đang chạy</div>
                </div>
            </div>
            <div class="cf-bats-summary-item">
                <span class="cf-bats-summary-icon">🪟</span>
                <div>
                    <div class="cf-bats-summary-value">{{ summary.total }}</div>
                    <div class="cf-bats-summary-label">Tổng bạt</div>
                </div>
            </div>
            <div class="cf-bats-summary-item" :class="{ warn: summary.online < summary.withDevice }">
                <span class="cf-bats-summary-icon">🎛️</span>
                <div>
                    <div class="cf-bats-summary-value">{{ summary.online }}/{{ summary.withDevice }}</div>
                    <div class="cf-bats-summary-label">ESP32 online</div>
                </div>
            </div>
            <div class="cf-bats-summary-item">
                <span class="cf-bats-summary-icon">🤖</span>
                <div>
                    <div class="cf-bats-summary-value">{{ summary.auto }}</div>
                    <div class="cf-bats-summary-label">Chế độ Auto</div>
                </div>
            </div>
        </div>

        <!-- Filter -->
        <div class="cf-bats-toolbar" v-if="cards.length">
            <span class="cf-text-muted text-sm">Hiển thị:</span>
            <div class="cf-bats-filter-group">
                <button @click="filterMode = 'all'" :class="['cf-bats-filter-btn', filterMode === 'all' ? 'active' : '']">
                    Tất cả
                </button>
                <button @click="filterMode = 'moving'" :class="['cf-bats-filter-btn', filterMode === 'moving' ? 'active' : '']">
                    ⚡ Đang chạy
                </button>
                <button @click="filterMode = 'issue'" :class="['cf-bats-filter-btn', filterMode === 'issue' ? 'active' : '']">
                    ⚠️ Có vấn đề
                </button>
            </div>
        </div>

        <!-- Empty state: no barns at all -->
        <div v-if="!barns.length && !loading" class="cf-empty-box">
            <div class="cf-empty-icon">🏠</div>
            <h3 class="cf-empty-title">Chưa có chuồng nào</h3>
            <p class="cf-empty-desc">Tạo chuồng trước khi cấu hình bạt điều khiển.</p>
        </div>

        <!-- Empty state: barns exist but no bats configured -->
        <div v-else-if="!cards.length && !loading" class="cf-empty-box">
            <div class="cf-empty-icon">🪟</div>
            <h3 class="cf-empty-title">Chưa có bạt nào được cấu hình</h3>
            <p class="cf-empty-desc">Cấu hình bạt (curtain) cho từng chuồng ở trang TECH hoặc backend.</p>
        </div>

        <!-- Cards grid -->
        <div class="cf-cards-grid cf-bats-dash-grid">
            <div v-for="card in cards" :key="card.barn.id"
                class="cf-bats-card" :class="{ moving: card.moving > 0, issue: card.hasIssue }"
                @click="goToDetail(card)">

                <!-- Banner -->
                <div class="cf-bats-card-banner" :class="'device-' + deviceStatusColor(card)"></div>

                <div class="cf-bats-card-body">
                    <!-- Header: barn name + bat count -->
                    <div class="cf-bats-card-header">
                        <div class="cf-bats-card-title-row">
                            <span class="cf-bats-card-icon">🏠</span>
                            <h3 class="cf-bats-card-title">{{ card.barn.name || ('Chuồng ' + card.barn.id) }}</h3>
                        </div>
                        <span class="cf-bats-card-count">{{ card.bats.length }} bạt</span>
                    </div>

                    <!-- Mini bat indicators (4 positions: TL, BL, TR, BR) -->
                    <div class="cf-bats-mini-grid" v-if="!card.loading">
                        <div v-for="pos in ['left_top','left_bottom','right_top','right_bottom']" :key="pos"
                            class="cf-bat-mini">
                            <span class="cf-bat-mini-pos">{{ posLabel(pos) }}</span>
                            <span class="cf-bat-mini-dot" :class="miniClass(card, pos)" :title="miniTitle(card, pos)">
                                {{ miniIcon(card, pos) }}
                            </span>
                        </div>
                    </div>
                    <div v-else class="cf-bats-mini-grid">
                        <div v-for="n in 4" :key="n" class="cf-bat-mini loading">
                            <span class="cf-bat-mini-pos">{{ n }}</span>
                            <span class="cf-bat-mini-dot">·</span>
                        </div>
                    </div>

                    <!-- Status row -->
                    <div class="cf-bats-card-status">
                        <span class="cf-bats-card-device" :class="'device-' + deviceStatusColor(card)">
                            <span class="cf-bats-card-device-dot"></span>
                            {{ deviceStatusText(card) }}
                        </span>
                        <span v-if="card.auto > 0" class="cf-bats-card-auto">🤖 {{ card.auto }} auto</span>
                    </div>

                    <!-- Moving badge (if any) -->
                    <div v-if="card.moving > 0" class="cf-bats-card-moving-badge">
                        <span class="animate-pulse">●</span> {{ card.moving }} bạt đang chạy
                    </div>

                    <!-- Issue badge -->
                    <div v-else-if="card.hasIssue" class="cf-bats-card-issue-badge">
                        ⚠️ Cần kiểm tra
                    </div>

                    <!-- Action hint -->
                    <div class="cf-bats-card-action">
                        <span>Mở điều khiển</span>
                        <span class="cf-bats-card-arrow">→</span>
                    </div>
                </div>
            </div>
        </div>

    </div>
    `
};
