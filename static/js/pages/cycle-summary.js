/**
 * Cycle Summary Page - Tổng kết đợt nuôi đã đóng.
 * Route: /cycles/:id/summary
 *
 * Hiển thị KPIs tổng hợp + condensed timeline cho một đợt nuôi (thường là
 * đã đóng). Admin có thể mở lại đợt nuôi từ đây.
 *
 * KPs: alive_count, mortality_rate, fcr, total_feed_kg, total_revenue,
 *      total_sold, total_weight_kg, total_deaths, total_water_liters,
 *      total_med_count, total_weight_sessions, duration_days.
 */
const { ref, computed, onMounted } = Vue;

const TYPE_ICONS = {
    feed: '🌾',
    medication: '💊',
    death: '📉',
    water: '💧',
    health: '🩺',
    sale: '💰',
};

const TYPE_LABELS = {
    feed: 'Cho ăn',
    medication: 'Thuốc',
    death: 'Tử vong',
    water: 'Nước',
    health: 'Sức khỏe',
    sale: 'Bán',
};

function formatTimelineDetail(entry) {
    if (!entry) return '';
    switch (entry.type) {
        case 'feed':
            return `${entry.quantity || 0} kg${entry.meal ? ' · ' + entry.meal : ''}`;
        case 'medication':
            return `${entry.custom_name || entry.product_name || 'thuốc'}${entry.dosage ? ' · ' + entry.dosage : ''}`;
        case 'death':
            return `${entry.count || 0} con${entry.cause ? ' · ' + entry.cause : ''}`;
        case 'water':
            return `${entry.consumption_liters || 0} L`;
        case 'health':
            return entry.symptoms || entry.severity || '—';
        case 'sale':
            return `${entry.count || 0} con · ${(entry.total_weight || 0)} kg`;
        default:
            return '';
    }
}

export default {
    props: ['id'],
    setup(props) {
        const summary = ref(null);
        const timeline = ref([]);
        const loading = ref(true);
        const submitting = ref(false);
        const showReopenModal = ref(false);
        const showEditNotesModal = ref(false);
        const editNotesValue = ref('');
        const savingNotes = ref(false);

        const fmtNum = (n, dec = 0) => {
            if (n === null || n === undefined) return '-';
            return Number(n).toLocaleString('vi-VN', {
                minimumFractionDigits: dec,
                maximumFractionDigits: dec,
            });
        };
        const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '-');
        const fmtCurrency = (n) => {
            if (n === null || n === undefined) return '-';
            return Number(n).toLocaleString('vi-VN') + 'đ';
        };

        async function loadSummary() {
            loading.value = true;
            try {
                const [s, tl] = await Promise.all([
                    API.cycles.summary(props.id),
                    API.care.timeline(props.id, { limit: 50 }).catch(() => []),
                ]);
                summary.value = s;
                timeline.value = Array.isArray(tl) ? tl : [];
            } catch (e) {
                showToast('Lỗi tải tổng kết: ' + e.message, 'error');
                summary.value = null;
            } finally {
                loading.value = false;
            }
        }

        async function reopenCycle() {
            submitting.value = true;
            try {
                await API.cycles.reopen(props.id, true);
                showToast('Đã mở lại đợt nuôi', 'success');
                showReopenModal.value = false;
                await loadSummary();
            } catch (e) {
                showToast(e.message, 'error');
            } finally {
                submitting.value = false;
            }
        }

        function openEditNotes() {
            editNotesValue.value = summary.value?.notes || '';
            showEditNotesModal.value = true;
        }

        async function saveNotes() {
            savingNotes.value = true;
            try {
                await API.cycles.update(props.id, {
                    notes: editNotesValue.value || null,
                });
                showToast('Đã cập nhật ghi chú', 'success');
                showEditNotesModal.value = false;
                await loadSummary();
            } catch (e) {
                showToast(e.message, 'error');
            } finally {
                savingNotes.value = false;
            }
        }

        const isClosed = computed(() => summary.value?.status === 'closed');
        const isAdmin = computed(() => appState?.currentUser?.role === 'admin');

        onMounted(loadSummary);

        return {
            props,
            summary,
            timeline,
            loading,
            submitting,
            showReopenModal,
            showEditNotesModal,
            editNotesValue,
            savingNotes,
            isClosed,
            isAdmin,
            loadSummary,
            reopenCycle,
            openEditNotes,
            saveNotes,
            fmtNum,
            fmtDate,
            fmtCurrency,
            TYPE_ICONS,
            TYPE_LABELS,
            formatTimelineDetail,
        };
    },

    template: `
    <div class="cf-cycles-summary-container">

        <!-- Loading skeleton -->
        <div v-if="loading && !summary" class="cf-cycles-summary-loading">
            <div class="cf-spinner"></div>
            <p class="cf-loading-text">Đang tải tổng kết đợt nuôi...</p>
        </div>

        <template v-else-if="summary">
            <!-- Back button -->
            <router-link to="/cycles" class="cf-cycles-summary-back">
                ← Đợt nuôi
            </router-link>

            <!-- Header card -->
            <div class="cf-cycles-summary-header">
                <div class="cf-cycles-summary-header-icon">📊</div>
                <div style="flex: 1; min-width: 0;">
                    <span class="cf-cycles-summary-badge" :class="summary.status">
                        {{ summary.status === 'closed' ? 'ĐÃ ĐÓNG' : 'ĐANG NUÔI' }}
                    </span>
                    <h1 class="cf-cycles-summary-title">
                        {{ summary.name || ('Đợt nuôi #' + summary.id) }}
                    </h1>
                    <p class="cf-cycles-summary-meta">
                        🏡 {{ summary.barn_name || summary.barn_id || '—' }} ·
                        {{ fmtDate(summary.start_date) }} →
                        {{ fmtDate(summary.actual_end_date) }}
                        <span v-if="summary.duration_days !== null && summary.duration_days !== undefined">
                            ({{ summary.duration_days }} ngày)
                        </span>
                    </p>
                </div>
            </div>

            <!-- KPI Grid (4 primary cards) -->
            <div class="cf-stats-grid">
                <div class="cf-stat-card">
                    <span class="cf-stat-label">Tỷ lệ hao hụt</span>
                    <div class="cf-stat-val-row">
                        <span class="cf-stat-val val-rose">{{ fmtNum(summary.mortality_rate, 2) }}%</span>
                    </div>
                    <p class="cf-stat-footer">{{ fmtNum(summary.total_deaths) }} / {{ fmtNum(summary.initial_count) }} con</p>
                </div>

                <div class="cf-stat-card">
                    <span class="cf-stat-label">FCR (hiệu suất cám)</span>
                    <div class="cf-stat-val-row">
                        <span class="cf-stat-val val-blue">{{ summary.fcr !== null && summary.fcr !== undefined ? fmtNum(summary.fcr, 2) : '—' }}</span>
                    </div>
                    <p class="cf-stat-footer">{{ fmtNum(summary.total_feed_kg, 1) }} kg cám</p>
                </div>

                <div class="cf-stat-card">
                    <span class="cf-stat-label">Tổng cám tiêu thụ</span>
                    <div class="cf-stat-val-row">
                        <span class="cf-stat-val val-emerald">{{ fmtNum(summary.total_feed_kg, 1) }}</span>
                        <span class="cf-stat-unit">kg</span>
                    </div>
                    <p class="cf-stat-footer">{{ summary.total_med_count || 0 }} lượt dùng thuốc</p>
                </div>

                <div class="cf-stat-card">
                    <span class="cf-stat-label">Doanh thu xuất bán</span>
                    <div class="cf-stat-val-row">
                        <span class="cf-stat-val val-amber">{{ fmtCurrency(summary.total_revenue) }}</span>
                    </div>
                    <p class="cf-stat-footer">{{ fmtNum(summary.total_sold) }} con bán ra</p>
                </div>
            </div>

            <!-- Secondary KPIs -->
            <div class="cf-stats-grid">
                <div class="cf-stat-card">
                    <span class="cf-stat-label">Tổng đàn cuối</span>
                    <div class="cf-stat-val-row">
                        <span class="cf-stat-val">{{ fmtNum(summary.alive_count) }}</span>
                        <span class="cf-stat-unit">con</span>
                    </div>
                    <p class="cf-stat-footer">Từ {{ fmtNum(summary.initial_count) }} ban đầu</p>
                </div>

                <div class="cf-stat-card">
                    <span class="cf-stat-label">Cân nặng xuất bán</span>
                    <div class="cf-stat-val-row">
                        <span class="cf-stat-val val-blue">{{ fmtNum(summary.total_weight_kg, 1) }}</span>
                        <span class="cf-stat-unit">kg</span>
                    </div>
                    <p class="cf-stat-footer">
                        {{ fmtNum(summary.total_water_liters, 0) }} L nước ·
                        {{ summary.total_weight_sessions || 0 }} lượt cân
                    </p>
                </div>
            </div>

            <!-- Cycle info -->
            <div class="cf-cycles-summary-info">
                <div class="cf-cycles-summary-info-row">
                    <span>Giống:</span>
                    <strong>{{ summary.breed || '—' }}</strong>
                </div>
                <div class="cf-cycles-summary-info-row">
                    <span>Trạng thái:</span>
                    <strong>{{ summary.status === 'closed' ? 'Đã đóng' : 'Đang nuôi' }}</strong>
                </div>
                <div class="cf-cycles-summary-info-row">
                    <span>Ghi chú:</span>
                    <span v-if="summary.notes">"{{ summary.notes }}"</span>
                    <span v-else style="color: #94a3b8; font-style: italic;">(trống)</span>
                    <button v-if="isAdmin" @click="openEditNotes"
                            class="cf-cycles-summary-edit-btn"
                            :title="summary.notes ? 'Sửa ghi chú' : 'Thêm ghi chú'">
                        ✏️
                    </button>
                </div>
                <div v-if="summary.latest_weight" class="cf-cycles-summary-info-row">
                    <span>Cân gần nhất:</span>
                    <span>
                        {{ fmtNum(summary.latest_weight.avg_weight, 2) }} kg
                        <span style="color: #94a3b8;">
                            ({{ fmtDate(summary.latest_weight.weigh_date) }},
                            ngày {{ summary.latest_weight.day_age || '—' }})
                        </span>
                    </span>
                </div>
            </div>

            <!-- Timeline condensed (50 most recent) -->
            <div class="cf-cycles-summary-section">
                <h2 class="cf-cycles-summary-section-title">
                    📋 Hoạt động cuối cùng ({{ timeline.length }} mới nhất)
                </h2>
                <div v-if="!timeline.length" class="cf-cycles-summary-empty">
                    Không có hoạt động chăm sóc nào được ghi nhận.
                </div>
                <div v-else class="cf-cycles-summary-timeline">
                    <div v-for="entry in timeline" :key="entry.type + '-' + entry.id"
                         class="cf-cycles-summary-timeline-item">
                        <div :class="['cf-cycles-summary-timeline-icon', 'cf-care-timeline-badge', entry.type]">
                            {{ TYPE_ICONS[entry.type] || '📌' }}
                        </div>
                        <div class="cf-cycles-summary-timeline-body">
                            <div class="cf-cycles-summary-timeline-title">
                                {{ TYPE_LABELS[entry.type] || entry.type }}
                            </div>
                            <div class="cf-cycles-summary-timeline-meta">
                                {{ formatTimelineDetail(entry) }}
                                <span v-if="entry.notes"> · {{ entry.notes }}</span>
                            </div>
                        </div>
                        <div class="cf-cycles-summary-timeline-time">
                            {{ fmtDate(entry.entry_date) }}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Reopen action (admin only, closed only) -->
            <div v-if="isClosed && isAdmin" class="cf-cycles-summary-actions">
                <button @click="showReopenModal = true" class="btn btn-warning">
                    🔓 Mở lại đợt nuôi
                </button>
            </div>
        </template>

        <!-- Edit notes modal -->
        <teleport to="body">
            <div v-if="showEditNotesModal" class="cf-modal-overlay" @click.self="showEditNotesModal = false">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <h3 class="cf-modal-title">{{ summary.notes ? 'Sửa ghi chú' : 'Thêm ghi chú' }}</h3>
                        <button @click="showEditNotesModal = false" class="cf-modal-close-btn">✕</button>
                    </div>
                    <div class="cf-modal-body">
                        <p style="margin: 0 0 0.75rem 0; font-size: 0.875rem; color: #64748b;">
                            Ghi chú sẽ được lưu lại cho đợt nuôi này (kể cả sau khi mở lại).
                        </p>
                        <textarea v-model="editNotesValue" class="cf-textarea" rows="6"
                                  placeholder="Ví dụ: Đạt sản lượng tốt, cân đều 1.8 kg, FCR 2.1..."
                                  maxlength="1000"></textarea>
                        <p style="margin: 0.375rem 0 0 0; font-size: 0.75rem; color: #94a3b8; text-align: right;">
                            {{ editNotesValue.length }} / 1000
                        </p>
                    </div>
                    <div class="cf-modal-footer">
                        <button @click="showEditNotesModal = false" class="cf-btn-secondary">Huỷ</button>
                        <button @click="saveNotes" :disabled="savingNotes" class="cf-btn-primary">
                            <span v-if="savingNotes" class="cf-spinner cf-spinner-sm"></span>
                            {{ savingNotes ? 'Đang lưu...' : 'Lưu ghi chú' }}
                        </button>
                    </div>
                </div>
            </div>
        </teleport>

        <!-- Reopen confirm modal -->
        <teleport to="body">
            <div v-if="showReopenModal" class="cf-modal-overlay" @click.self="showReopenModal = false">
                <div class="cf-modal-box">
                    <div class="cf-modal-header">
                        <h3 class="cf-modal-title">Mở lại đợt nuôi?</h3>
                        <button @click="showReopenModal = false" class="cf-modal-close-btn">✕</button>
                    </div>
                    <div class="cf-modal-body">
                        <p>Hành động này sẽ:</p>
                        <ul style="padding-left: 1.25rem; line-height: 1.6;">
                            <li>Đặt <code>status='active'</code></li>
                            <li>Xóa <code>actual_end_date</code></li>
                            <li>Xóa <code>final_quantity</code></li>
                        </ul>
                        <p style="margin-top: 0.75rem;">
                            Các bản ghi chăm sóc đã có (cho ăn, thuốc, tử vong…) sẽ
                            <strong>KHÔNG bị xóa</strong>.
                        </p>
                    </div>
                    <div class="cf-modal-footer">
                        <button @click="showReopenModal = false" class="cf-btn-secondary">Huỷ</button>
                        <button @click="reopenCycle" :disabled="submitting" class="btn btn-warning">
                            <span v-if="submitting" class="cf-spinner cf-spinner-sm"></span>
                            {{ submitting ? 'Đang mở lại...' : 'Xác nhận mở lại' }}
                        </button>
                    </div>
                </div>
            </div>
        </teleport>
    </div>
    `,
};
