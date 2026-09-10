/**
 * <care-cycle-pill> — Prominent "đang ghi nhận cho" indicator for all care pages.
 *
 * This is the SINGLE canonical cycle indicator (replaces the older
 * <care-context-card>). Shows:
 *   - Label + cycle name + barn badge
 *   - Day-age, alive-count, and survival-rate chips
 *   - Inline cycle-switcher dropdown
 *
 * Two-way bound via v-model:selectedCycleId. Re-uses `useCareContext()` return
 * values via v-bind="cyclePillProps" on the parent side for compact calls.
 *
 * Uses Number.toLocaleString('vi-VN') for formatting so it doesn't depend
 * on the global fmtNum helper.
 */
export default {
    props: {
        cycles: { type: Array, required: true },
        selectedCycleId: { default: '' },
        selectedCycle: { type: Object, default: null },
        dayAge: { type: Number, default: 0 },
        aliveCount: { type: Number, default: 0 },
        survivalRate: { type: Number, default: null },
    },
    emits: ['update:selectedCycleId'],
    computed: {
        survivalChipClass() {
            // Map survival-rate to a chip color: rose for danger (<90%), amber for warn (90-95%), default for healthy
            if (this.survivalRate === null) return '';
            if (this.survivalRate < 90) return 'cf-care-cycle-pill-chip-rose';
            if (this.survivalRate < 95) return 'cf-care-cycle-pill-chip-amber';
            return '';
        },
    },
    template: `
        <div :class="['cf-care-cycle-pill', selectedCycle ? 'is-active' : 'is-empty']">
            <div class="cf-care-cycle-pill-main">
                <span class="cf-care-cycle-pill-label">🪶 ĐANG GHI NHẬN CHO</span>
                <template v-if="selectedCycle">
                    <div class="cf-care-cycle-pill-name-row">
                        <span class="cf-care-cycle-pill-name">
                            {{ selectedCycle.name || ('Đợt nuôi #' + selectedCycle.id) }}
                        </span>
                        <span v-if="selectedCycle.barn_id" class="cf-care-cycle-pill-barn">
                            🏠 {{ selectedCycle.barn_id }}
                        </span>
                    </div>
                    <div class="cf-care-cycle-pill-meta">
                        <span class="cf-care-cycle-pill-chip">📅 Ngày {{ dayAge }}</span>
                        <span class="cf-care-cycle-pill-chip">🐔 {{ Number(aliveCount || 0).toLocaleString('vi-VN') }} con</span>
                        <span v-if="survivalRate !== null"
                            :class="['cf-care-cycle-pill-chip', survivalChipClass]">
                            📊 {{ survivalRate }}% còn lại
                        </span>
                    </div>
                </template>
                <div v-else class="cf-care-cycle-pill-empty">
                    Chưa chọn đợt nuôi — chọn bên dưới để bắt đầu ghi nhận.
                </div>
            </div>
            <label class="cf-care-cycle-pill-switch">
                <span class="cf-care-cycle-pill-switch-label">Đổi đợt</span>
                <select :value="selectedCycleId"
                    @change="$emit('update:selectedCycleId', $event.target.value)"
                    :disabled="!cycles.length"
                    class="cf-care-cycle-pill-select">
                    <option value="">-- Chọn đợt nuôi --</option>
                    <option v-for="c in cycles" :key="c.id" :value="c.id">
                        {{ c.name || ('Đợt ' + c.id) }}{{ c.barn_id ? ' (' + c.barn_id + ')' : '' }}
                    </option>
                </select>
            </label>
        </div>
    `,
};
