/**
 * Notifications Settings + History Page
 * - Toggle switches for notification types
 * - Notification history with dismiss/snooze
 * - Care compliance status for today
 */
const { ref, reactive, onMounted } = Vue;

export default{
    setup() {
        const _showToast = (msg, type = 'info') => {
            if (window.showToast) {
                window.showToast(msg, type);
            } else {
                console.log(`[${type}] ${msg}`);
            }
        };

        const loading = ref(false);
        const saving = ref(false);
        const loadingHistory = ref(false);
        const history = ref([]);
        const dismissed = ref([]);  // currently dismissed alerts

        // Notification settings toggles
        const settings = reactive({
            feed_notifications_enabled: true,
            weight_notifications_enabled: true,
            vaccine_notifications_enabled: true,
            medication_reminder_enabled: true,
            care_notifications_enabled: true,
        });

        // Feed alert hour settings
        const feedHours = reactive({
            morning_alert_after_hour: 12,
            afternoon_alert_after_hour: 19,
        });

        // Care compliance status
        const careStatus = ref([]);
        const statusDate = ref('');
        const loadingStatus = ref(false);

        // Group history by day
        function groupByDay(items) {
            const groups = {};
            for (const item of items) {
                const d = new Date(item.sent_at);
                const dayKey = d.toLocaleDateString('vi-VN');
                if (!groups[dayKey]) groups[dayKey] = [];
                groups[dayKey].push(item);
            }
            return groups;
        }

        const groupedHistory = () => groupByDay(history.value);

        // Active tab for switching views
        const activeTab = ref('settings');

        // Check if a specific alert is currently dismissed
        function isDismissed(cycleId, alertType) {
            return dismissed.value.some(d =>
                d.cycle_id === cycleId && d.alert_type === alertType &&
                d.dismissed_date === statusDate.value
            );
        }

        async function loadSettings() {
            loading.value = true;
            try {
                const data = await API.notifications.getSettings();
                if ('feed_notifications_enabled' in data) {
                    settings.feed_notifications_enabled = data.feed_notifications_enabled === 'true';
                }
                if ('weight_notifications_enabled' in data) {
                    settings.weight_notifications_enabled = data.weight_notifications_enabled === 'true';
                }
                if ('vaccine_notifications_enabled' in data) {
                    settings.vaccine_notifications_enabled = data.vaccine_notifications_enabled === 'true';
                }
                if ('medication_reminder_enabled' in data) {
                    settings.medication_reminder_enabled = data.medication_reminder_enabled === 'true';
                }
                if ('care_notifications_enabled' in data) {
                    settings.care_notifications_enabled = data.care_notifications_enabled === 'true';
                }
                if ('feed_morning_alert_after_hour' in data) {
                    feedHours.morning_alert_after_hour = parseInt(data.feed_morning_alert_after_hour) || 12;
                }
                if ('feed_afternoon_alert_after_hour' in data) {
                    feedHours.afternoon_alert_after_hour = parseInt(data.feed_afternoon_alert_after_hour) || 19;
                }
            } catch (e) {
                _showToast('Lỗi tải cài đặt: ' + e.message, 'error');
            } finally {
                loading.value = false;
            }
        }

        async function saveSetting(key, value) {
            saving.value = true;
            try {
                await API.notifications.setSettings({ [key]: String(value) });
                _showToast('Đã lưu: ' + key);
            } catch (e) {
                _showToast('Lỗi lưu: ' + e.message, 'error');
            } finally {
                saving.value = false;
            }
        }

        async function toggleSetting(settingKey) {
            await saveSetting(settingKey, !settings[settingKey]);
        }

        async function saveFeedHour(which) {
            const key = which === 'morning'
                ? 'feed_morning_alert_after_hour'
                : 'feed_afternoon_alert_after_hour';
            const value = which === 'morning'
                ? feedHours.morning_alert_after_hour
                : feedHours.afternoon_alert_after_hour;
            saving.value = true;
            try {
                await API.notifications.setSettings({ [key]: String(value) });
                _showToast('Đã lưu giờ cảnh báo ' + (which === 'morning' ? 'sáng' : 'chiều'));
            } catch (e) {
                _showToast('Lỗi lưu: ' + e.message, 'error');
            } finally {
                saving.value = false;
            }
        }

        async function loadHistory() {
            loadingHistory.value = true;
            try {
                history.value = await API.notifications.getHistory();
            } catch (e) {
                history.value = [];
            } finally {
                loadingHistory.value = false;
            }
        }

        async function loadDismissed() {
            try {
                dismissed.value = await API.notifications.getDismissed();
            } catch (e) {
                dismissed.value = [];
            }
        }

        async function dismissAlert(cycleId, alertType, date) {
            try {
                await API.notifications.dismissAlert({ cycle_id: cycleId, alert_type: alertType, date: date });
                // Refresh dismissed list
                await loadDismissed();
                _showToast('Đã bỏ qua thông báo này');
            } catch (e) {
                _showToast('Lỗi: ' + e.message, 'error');
            }
        }

        async function loadCareStatus() {
            loadingStatus.value = true;
            try {
                const data = await API.notifications.getCareStatus();
                careStatus.value = data.cycles || [];
                statusDate.value = data.date || '';
            } catch (e) {
                careStatus.value = [];
            } finally {
                loadingStatus.value = false;
            }
        }

        // Icon & color map for notification types
        const typeIcons = {
            'ALERT_DANGER': '🔴',
            'ALERT_WARNING': '🟡',
            'ALERT_INFO': '🔵',
            'SYSTEM_DEVICE_CREATED': '🖥️',
            'SYSTEM_BARN_CREATED': '🏠',
            'SYSTEM_CYCLE_CREATED': '📋',
            'SYSTEM_BARN_MISSING_BATS': '⚠️',
            'CARE_FEED_MISSING': '🔴',
            'CARE_MEDICATION_REMINDER': '💊',
            'WEIGHT_REMINDER': '⚖️',
            'VACCINE_REMINDER': '💉',
            'device_offline': '⚠️',
            'TEST': '🔔',
            'default': '📳',
        };

        const typeColors = {
            'ALERT_DANGER': 'bg-red-100 dark:bg-red-900/30',
            'ALERT_WARNING': 'bg-yellow-100 dark:bg-yellow-900/30',
            'ALERT_INFO': 'bg-blue-100 dark:bg-blue-900/30',
            'SYSTEM_DEVICE_CREATED': 'bg-green-100 dark:bg-green-900/30',
            'SYSTEM_BARN_CREATED': 'bg-green-100 dark:bg-green-900/30',
            'SYSTEM_CYCLE_CREATED': 'bg-green-100 dark:bg-green-900/30',
            'SYSTEM_BARN_MISSING_BATS': 'bg-orange-100 dark:bg-orange-900/30',
            'CARE_FEED_MISSING': 'bg-red-100 dark:bg-red-900/30',
            'CARE_MEDICATION_REMINDER': 'bg-yellow-100 dark:bg-yellow-900/30',
            'WEIGHT_REMINDER': 'bg-orange-100 dark:bg-orange-900/30',
            'VACCINE_REMINDER': 'bg-blue-100 dark:bg-blue-900/30',
            'device_offline': 'bg-red-100 dark:bg-red-900/30',
            'TEST': 'bg-blue-100 dark:bg-blue-900/30',
            'default': 'bg-blue-100 dark:bg-blue-900/30',
        };

        function getIcon(type) { return typeIcons[type] || typeIcons['default']; }
        function getColor(type) { return typeColors[type] || typeColors['default']; }

        // Map alert_type from history to dismiss alert_type
        function toAlertType(type) {
            if (type === 'CARE_FEED_MISSING') return 'feed_morning'; // default, refined below
            if (type === 'CARE_MEDICATION_REMINDER') return 'medication';
            if (type === 'WEIGHT_REMINDER') return 'weight';
            return null;
        }

        // Extract meal type from body for feed alerts
        function getMealFromBody(body) {
            if (!body) return 'feed_morning';
            if (body.includes('sáng') || body.includes('cho ăn sáng')) return 'feed_morning';
            if (body.includes('chiều') || body.includes('cho ăn chiều')) return 'feed_afternoon';
            return 'feed_morning';
        }

        // Build a dismiss info object for history items
        function getDismissInfo(item) {
            if (!item.cycle_id) return null;
            const alertType = toAlertType(item.type);
            if (!alertType) return null;
            // For feed alerts, determine morning vs afternoon from body
            const refinedType = item.type === 'CARE_FEED_MISSING'
                ? getMealFromBody(item.body)
                : alertType;
            const alreadyDismissed = dismissed.value.some(d =>
                d.cycle_id === item.cycle_id && d.alert_type === refinedType &&
                d.dismissed_date === statusDate.value
            );
            return {
                cycleId: item.cycle_id,
                alertType: refinedType,
                date: statusDate.value,
                dismissed: alreadyDismissed,
            };
        }

        onMounted(async () => {
            await Promise.all([loadSettings(), loadHistory(), loadDismissed(), loadCareStatus()]);
        });

        return {
            loading, saving, settings, feedHours,
            careStatus, statusDate, loadingStatus,
            toggleSetting, saveFeedHour,
            history, groupedHistory, dismissed, loadingHistory,
            dismissAlert, isDismissed,
            getIcon, getColor, getDismissInfo,
            typeIcons, typeColors, activeTab,
        };
    },

    template: `
    <div class="notifications-page space-y-4">

        <!-- Header -->
        <div class="page-header">
            <div class="flex items-center gap-3">
                <div class="header-icon">🔔</div>
                <div>
                    <h2 class="page-title">Thông báo</h2>
                    <p class="page-subtitle">Cài đặt nhắc nhở & lịch sử thông báo</p>
                </div>
            </div>
            <button class="btn btn-sm btn-secondary" @click="loadHistory" :disabled="loadingHistory">
                ↻ Tải lại
            </button>
        </div>

        <!-- Tabs -->
        <div class="flex gap-2 border-b border-gray-200 dark:border-gray-700">
            <button @click="activeTab = 'settings'" :class="['pb-2 px-1 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'settings' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']">
                Cài đặt
            </button>
            <button @click="activeTab = 'history'" :class="['pb-2 px-1 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'history' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']">
                Lịch sử ({{ history.length }})
            </button>
            <button @click="activeTab = 'care'" :class="['pb-2 px-1 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === 'care' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700']">
                Tình trạng hôm nay
            </button>
        </div>

        <!-- ═══ SETTINGS TAB ═══ -->
        <div v-if="activeTab === 'settings'">
            <div v-if="loading" class="card">
                <div class="empty-placeholder">Đang tải...</div>
            </div>

            <div v-else class="settings-grid">
                <!-- Care Notifications Toggle -->
                <div class="card">
                    <h4 class="card-title">🩺 Nhắc nhở chăm sóc tổng hợp</h4>
                    <p class="text-sm text-gray mb-3">Bật/tắt tất cả nhắc nhở chăm sóc (cho ăn, cân, thuốc)</p>
                    <label class="toggle-switch">
                        <input type="checkbox" :checked="settings.care_notifications_enabled"
                               @change="toggleSetting('care_notifications_enabled')">
                        <span class="toggle-slider"></span>
                    </label>
                </div>

                <!-- Feed Notifications Toggle -->
                <div class="card">
                    <h4 class="card-title">🌾 Nhắc nhở cho ăn (Đổ cám)</h4>
                    <p class="text-sm text-gray mb-3">Nhắc khi chưa ghi nhận cho ăn đúng giờ</p>
                    <label class="toggle-switch">
                        <input type="checkbox" :checked="settings.feed_notifications_enabled"
                               @change="toggleSetting('feed_notifications_enabled')">
                        <span class="toggle-slider"></span>
                    </label>

                    <div v-if="settings.feed_notifications_enabled" class="mt-4 pt-4 border-t">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="text-sm">Cảnh báo sáng sau giờ</label>
                                <div class="flex gap-2 items-center">
                                    <input type="number" v-model.number="feedHours.morning_alert_after_hour"
                                           min="0" max="23" class="form-input w-20">
                                    <span class="text-sm text-gray"> giờ VN </span>
                                    <button @click="saveFeedHour('morning')" class="btn btn-sm btn-primary">Lưu</button>
                                </div>
                                <p class="text-xs text-gray mt-1">Mặc định: 12 giờ trưa</p>
                            </div>
                            <div class="form-group">
                                <label class="text-sm">Cảnh báo chiều sau giờ</label>
                                <div class="flex gap-2 items-center">
                                    <input type="number" v-model.number="feedHours.afternoon_alert_after_hour"
                                           min="0" max="23" class="form-input w-20">
                                    <span class="text-sm text-gray"> giờ VN </span>
                                    <button @click="saveFeedHour('afternoon')" class="btn btn-sm btn-primary">Lưu</button>
                                </div>
                                <p class="text-xs text-gray mt-1">Mặc định: 19 giờ (7 giờ tối)</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Medication Reminder Toggle -->
                <div class="card">
                    <h4 class="card-title">💊 Nhắc nhở thuốc vào nước</h4>
                    <p class="text-sm text-gray mb-3">Hỏi "Có cho thuốc gì vào nước không?" vào giờ cho ăn</p>
                    <label class="toggle-switch">
                        <input type="checkbox" :checked="settings.medication_reminder_enabled"
                               @change="toggleSetting('medication_reminder_enabled')">
                        <span class="toggle-slider"></span>
                    </label>
                </div>

                <!-- Weight Notifications Toggle -->
                <div class="card">
                    <h4 class="card-title">⚖️ Nhắc nhở cân gà</h4>
                    <p class="text-sm text-gray mb-3">Nhắc cân theo lịch trình theo ngày tuổi</p>
                    <ul class="text-sm text-gray mb-3 list-inside list-disc">
                        <li>Ngày 0-5: Không cần cân</li>
                        <li>Ngày 6-30: Mỗi 4 ngày</li>
                        <li>Ngày 31-85: Mỗi 5 ngày</li>
                        <li>Ngày 86+: Mỗi 7 ngày</li>
                    </ul>
                    <label class="toggle-switch">
                        <input type="checkbox" :checked="settings.weight_notifications_enabled"
                               @change="toggleSetting('weight_notifications_enabled')">
                        <span class="toggle-slider"></span>
                    </label>
                </div>

                <!-- Vaccine Notifications Toggle -->
                <div class="card">
                    <h4 class="card-title">💉 Nhắc nhở Vaccine</h4>
                    <p class="text-sm text-gray mb-3">Nhắc lịch tiêm vaccine sắp tới</p>
                    <label class="toggle-switch">
                        <input type="checkbox" :checked="settings.vaccine_notifications_enabled"
                               @change="toggleSetting('vaccine_notifications_enabled')">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        </div>

        <!-- ═══ HISTORY TAB ═══ -->
        <div v-if="activeTab === 'history'">
            <div v-if="loadingHistory" class="card">
                <div class="empty-placeholder">Đang tải...</div>
            </div>
            <div v-else-if="!history.length" class="card text-center">
                <div class="text-4xl mb-3">🔕</div>
                <div class="text-sm text-gray-500">Chưa có thông báo nào</div>
            </div>
            <div v-else>
                <div v-for="(items, day) in groupedHistory()" :key="day" class="mb-4">
                    <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
                        {{ day }}
                        <span class="font-normal normal-case">({{ items.length }})</span>
                    </div>
                    <div class="space-y-2">
                        <div v-for="item in items" :key="item.id"
                             class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                            <div class="flex items-start gap-3">
                                <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                                     :class="getColor(item.type)">
                                    {{ getIcon(item.type) }}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="text-sm font-semibold">{{ item.title }}</div>
                                    <div class="text-xs text-gray-500 mt-0.5">{{ item.body }}</div>
                                    <div class="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                        <span>{{ new Date(item.sent_at).toLocaleTimeString('vi-VN') }}</span>
                                        <span v-if="item.sent_count">· {{ item.sent_count }} thiết bị nhận</span>
                                        <span v-if="item.failed_count" class="text-red-400">{{ item.failed_count }} lỗi</span>
                                        <!-- Dismiss button for care alerts -->
                                        <template v-if="getDismissInfo(item)">
                                            <button
                                                v-if="!getDismissInfo(item).dismissed"
                                                @click="dismissAlert(getDismissInfo(item).cycleId, getDismissInfo(item).alertType, getDismissInfo(item).date)"
                                                class="ml-auto px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full text-xs font-medium transition-colors">
                                                Bỏ qua hôm nay
                                            </button>
                                            <span v-else class="ml-auto text-green-500 text-xs font-medium">✓ Đã bỏ qua</span>
                                        </template>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ═══ CARE STATUS TAB ═══ -->
        <div v-if="activeTab === 'care'">
            <div class="card">
                <h4 class="card-title">📋 Tình trạng cho ăn hôm nay ({{ statusDate }})</h4>
                <div v-if="loadingStatus" class="empty-placeholder">Đang tải...</div>
                <div v-else-if="!careStatus.length" class="empty-placeholder">Không có đợt nuôi đang hoạt động</div>
                <div v-else class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Chuồng</th>
                                <th>Đợt nuôi</th>
                                <th>Sáng</th>
                                <th>Chiều</th>
                                <th>Thuốc nước</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="s in careStatus" :key="s.cycle_id">
                                <td>{{ s.barn_name }}</td>
                                <td class="fw-500">{{ s.cycle_name }}</td>
                                <td>
                                    <span v-if="s.has_morning_feed" class="badge badge-success">✓ Đã cho</span>
                                    <span v-else class="badge badge-danger">✗ Chưa</span>
                                </td>
                                <td>
                                    <span v-if="s.has_afternoon_feed" class="badge badge-success">✓ Đã cho</span>
                                    <span v-else class="badge badge-danger">✗ Chưa</span>
                                </td>
                                <td>
                                    <span v-if="s.has_medication_water" class="badge badge-success">✓ Có</span>
                                    <span v-else class="badge badge-warning">✗ Không</span>
                                </td>
                                <td>
                                    <div class="flex gap-1">
                                        <button v-if="!s.has_morning_feed && !isDismissed(s.cycle_id, 'feed_morning')"
                                                @click="dismissAlert(s.cycle_id, 'feed_morning', statusDate)"
                                                class="btn btn-xs btn-outline">Sáng</button>
                                        <button v-if="!s.has_afternoon_feed && !isDismissed(s.cycle_id, 'feed_afternoon')"
                                                @click="dismissAlert(s.cycle_id, 'feed_afternoon', statusDate)"
                                                class="btn btn-xs btn-outline">Chiều</button>
                                        <button v-if="!s.has_medication_water && !isDismissed(s.cycle_id, 'medication')"
                                                @click="dismissAlert(s.cycle_id, 'medication', statusDate)"
                                                class="btn btn-xs btn-outline">Thuốc</button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    `
};