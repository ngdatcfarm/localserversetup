/**
 * Brooder Zone Detail — Phase D.
 *
 * Sections (per docs/ui_style_guide.md §4.3 detail page):
 *   1. Header bar (back + zone name + status pill)
 *   2. KPI grid (4 cards): zone temp, setpoint, total power%, online heaters
 *   3. Members section (NEW): ESP32 brooders + SHT40 + mode + online dot
 *   4. Zone sensors: attached sensors table with weight/label
 *   5. Heaters section (NEW): per-channel table with current power + add/edit
 *   6. Available members panel: barn ESPs not yet in zone
 *   7. Available heater channels panel: (device, channel) not yet assigned
 *   8. Manual override + Fallback delta (2-col grid)
 *   9. 24h chart (zone temp + total power + per-heater thin lines)
 *   10. Audit log (zone_setpoint_history)
 *
 * Props: { id: Number } (zone ID)
 */

const { ref, reactive, computed, onMounted, onUnmounted, watch } = Vue;


export default {
    props: {
        id: { type: [Number, String], required: true },
    },
    setup(props) {
        const zoneId = computed(() => Number(props.id));

        // ── State ─────────────────────────────────────────────
        const zone = ref(null);
        const members = ref([]);
        const heaters = ref([]);
        const sensors = ref([]);
        const availableMembers = ref([]);
        const availableHeaterChannels = ref([]);
        const history = ref([]);
        const telemetry = ref({ zone_temp: [], total_power: [], per_heater: {} });
        const loading = ref(true);
        const refreshing = ref(false);
        const lastUpdated = ref(null);

        // Manual override form
        const manualEnabled = ref(false);
        const manualTemp = ref(30.0);
        const manualNote = ref('');
        const submittingOverride = ref(false);

        // Fallback delta form
        const fallbackDelta = ref(0.0);
        const savingDelta = ref(false);

        // Heater edit modal
        const heaterEditOpen = ref(false);
        const heaterEditTarget = ref(null);  // existing heater or null for new
        const heaterEditForm = reactive({
            device_code: '',
            channel: 1,
            label: '',
            max_power_w: 1500.0,
            enabled: true,
        });
        const heaterEditSaving = ref(false);

        // Phase C — per-heater override modal (setpoint + delta). Distinct
        // from the existing zone-level manual override / fallback-delta cards
        // (which remain for backward-compat fan-out shims).
        const heaterOverrideOpen = ref(false);
        const heaterOverrideTarget = ref(null);  // heater being edited
        const heaterOverrideForm = reactive({
            manual_setpoint: 33.0,
            fallback_delta_c: 0.0,
            note: '',
        });
        const heaterOverrideSaving = ref(false);
        const sensorAssignBusy = ref(false);

        // Sensor add form
        const zsAddOpen = ref(false);
        const zsAddSensor = ref('');
        const zsAddSubSensor = ref('a');
        const zsAddWeight = ref(1.0);
        const zsAddLabel = ref('');
        const zsCandidates = ref([]);
        const zsAvailableSubs = ref([]);
        const zsSaving = ref(false);
        const availableCandidates = computed(() => {
            const attached = new Set(sensors.value.map(s => s.sensor_device_code));
            return zsCandidates.value.filter(c => !attached.has(c.device_code));
        });

        const TEMP_MIN = 18.0;
        const TEMP_MAX = 36.0;
        const DELTA_MIN = -5.0;
        const DELTA_MAX = 5.0;

        // Day-age quick-pick chips — mirrors SETPOINT_TABLE in
        // src/iot/brooder_service.py:50-57. Click a chip to lock the zone
        // setpoint to the recommended temperature for that age band; ESPs
        // receive the value via the retained MQTT /setpoint topic and the
        // audit row is auto-tagged with the band name.
        const dayAgePresets = [
            { label: '1-3 ngày',   value: 33.5, note: 'preset 1-3 ngày tuổi' },
            { label: '4-7 ngày',   value: 32.0, note: 'preset 4-7 ngày tuổi' },
            { label: '8-14 ngày',  value: 29.5, note: 'preset 8-14 ngày tuổi' },
            { label: '15-21 ngày', value: 27.0, note: 'preset 15-21 ngày tuổi' },
            { label: '22-28 ngày', value: 25.0, note: 'preset 22-28 ngày tuổi' },
            { label: '29+ ngày',   value: 22.0, note: 'preset 29+ ngày (ngừng úm)' },
        ];
        async function applyPreset(preset) {
            // One-click apply: enable override, set value, save with the
            // preset's auto-tagged audit note. Skipped if a save is in flight
            // or the value falls outside the slider range (shouldn't happen —
            // every preset in dayAgePresets is in [22.0, 33.5] ⊂ [TEMP_MIN, TEMP_MAX]).
            if (!zone.value || submittingOverride.value) return;
            if (preset.value < TEMP_MIN || preset.value > TEMP_MAX) {
                showToast(`Setpoint ${preset.value}°C ngoài khoảng ${TEMP_MIN}-${TEMP_MAX}°C`, 'error');
                return;
            }
            manualTemp.value = preset.value;
            manualEnabled.value = true;
            manualNote.value = preset.note;
            await saveOverride();
        }

        // ── Polling (every 5s) ────────────────────────────────
        let pollTimer = null;

        async function fetchAll() {
            try {
                const z = await API.brooder.zones.get(zoneId.value);
                zone.value = z;
                syncManualFormToZone();
            } catch (e) {
                console.warn('zone fetch error:', e);
            }
            await Promise.all([
                loadMembers(),
                loadHeaters(),
                loadSensors(),
                loadHistory(),
                loadTelemetry(),
            ]);
            lastUpdated.value = new Date();
        }
        async function refreshLive() {
            try {
                const z = await API.brooder.zones.get(zoneId.value);
                zone.value = z;
                await loadMembers();
                await loadHeaters();
                lastUpdated.value = new Date();
            } catch (e) {
                console.warn('zone live refresh error:', e);
            }
        }
        function startPolling() {
            stopPolling();
            pollTimer = setInterval(refreshLive, 5000);
        }
        function stopPolling() {
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        }

        function backToBrooder() {
            // `router` lives in app.js module scope (invisible from here).
            // window.location.hash always works in browser context and
            // Vue Router picks up the #/brooder hash to navigate.
            window.location.hash = '#/brooder';
        }

        // ── Section loaders ───────────────────────────────────
        async function loadMembers() {
            try {
                const r = await API.brooder.zones.members.list(zoneId.value);
                members.value = r.members || [];
            } catch (e) { members.value = []; }
            // Available members: barn ESPs not yet in this zone
            try {
                const bid = zone.value?.barn_id;
                const r = await API.brooder.zones.members.listAvailable(
                    zoneId.value, { barn_id: bid || null },
                );
                availableMembers.value = r.members || [];
            } catch (e) { availableMembers.value = []; }
        }
        async function loadHeaters() {
            try {
                const r = await API.brooder.zones.heaters.list(zoneId.value);
                heaters.value = r.heaters || [];
            } catch (e) { heaters.value = []; }
            // Available heater channels (members' (device, channel) pairs not yet assigned)
            computeAvailableHeaterChannels();
        }
        function computeAvailableHeaterChannels() {
            const assigned = new Set(heaters.value.map(h => `${h.device_code}#${h.channel}`));
            const avail = [];
            for (const m of members.value) {
                for (const ch of [1, 2]) {
                    const key = `${m.device_code}#${ch}`;
                    if (!assigned.has(key)) {
                        avail.push({ device_code: m.device_code, channel: ch });
                    }
                }
            }
            availableHeaterChannels.value = avail;
        }
        async function loadSensors() {
            try {
                const r = await API.brooder.zones.sensors.list(zoneId.value);
                sensors.value = r.zone_sensors || [];
            } catch (e) { sensors.value = []; }
        }
        async function loadHistory() {
            try {
                const r = await API.brooder.zones.setpointHistory(zoneId.value, 20);
                history.value = r.history || [];
            } catch (e) { history.value = []; }
        }
        async function loadTelemetry() {
            try {
                const r = await API.brooder.zones.telemetry(zoneId.value, 24);
                telemetry.value = {
                    zone_temp:   r.zone_temp || [],
                    total_power: r.total_power || [],
                    per_heater:  r.per_heater || {},
                };
            } catch (e) {
                telemetry.value = { zone_temp: [], total_power: [], per_heater: {} };
            }
        }
        async function loadCandidates() {
            try {
                const bid = zone.value?.barn_id;
                const r = await API.brooder.listAvailableSensors(bid);
                zsCandidates.value = r.sensors || [];
            } catch (e) { zsCandidates.value = []; }
        }

        async function reloadAll() {
            try {
                refreshing.value = true;
                await fetchAll();
            } finally {
                refreshing.value = false;
            }
        }

        // ── Manual override ───────────────────────────────────
        function syncManualFormToZone() {
            if (!zone.value) return;
            manualEnabled.value = zone.value.manual_setpoint != null;
            manualTemp.value = zone.value.manual_setpoint
                            ?? zone.value.effective_setpoint
                            ?? 30.0;
            fallbackDelta.value = zone.value.fallback_delta_c ?? 0.0;
        }
        async function saveOverride() {
            if (!zone.value) return;
            if (!manualEnabled.value) {
                return clearOverride();
            }
            if (manualTemp.value < TEMP_MIN || manualTemp.value > TEMP_MAX) {
                showToast(`Setpoint phải trong khoảng ${TEMP_MIN}-${TEMP_MAX}°C`, 'error');
                return;
            }
            try {
                submittingOverride.value = true;
                await API.brooder.zones.setSetpoint(
                    zoneId.value,
                    Number(manualTemp.value.toFixed(1)),
                    manualNote.value || null,
                );
                showToast(`Đã đặt setpoint zone ${manualTemp.value.toFixed(1)}°C`, 'success');
                manualNote.value = '';
                await fetchAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                submittingOverride.value = false;
            }
        }
        async function clearOverride() {
            if (!zone.value) return;
            try {
                submittingOverride.value = true;
                await API.brooder.zones.setSetpoint(
                    zoneId.value, null, manualNote.value || null,
                );
                showToast('Đã xoá manual override — về chế độ auto', 'success');
                manualEnabled.value = false;
                manualNote.value = '';
                await fetchAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                submittingOverride.value = false;
            }
        }
        async function saveFallbackDelta() {
            if (!zone.value) return;
            const v = Number(fallbackDelta.value);
            if (v < DELTA_MIN || v > DELTA_MAX) {
                showToast(`Delta phải trong khoảng ${DELTA_MIN} → ${DELTA_MAX}°C`, 'error');
                return;
            }
            try {
                savingDelta.value = true;
                await API.brooder.zones.setFallbackDelta(zoneId.value, v);
                showToast(`Đã lưu fallback delta ${v.toFixed(2)}°C`, 'success');
                await fetchAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                savingDelta.value = false;
            }
        }

        // ── Member add/remove ─────────────────────────────────
        const memberAddCode = ref('');
        const memberAdding = ref(false);
        async function addMember() {
            if (!memberAddCode.value) {
                showToast('Chọn ESP32 trước', 'error');
                return;
            }
            try {
                memberAdding.value = true;
                await API.brooder.zones.members.add(
                    zoneId.value,
                    memberAddCode.value.trim(),
                );
                showToast('Đã thêm member', 'success');
                memberAddCode.value = '';
                await fetchAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                memberAdding.value = false;
            }
        }
        async function removeMember(code) {
            try {
                await API.brooder.zones.members.remove(zoneId.value, code);
                showToast(`Đã gỡ ${code}`, 'success');
                await fetchAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        // ── Heater CRUD ───────────────────────────────────────
        // Anchor-scroll helper: jumps to the Members section so users can add
        // ESP32 first when the "Thêm heater" button is disabled.
        function scrollToMembersSection() {
            const el = document.getElementById('brooder-members-section');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function openHeaterNew() {
            heaterEditTarget.value = null;
            heaterEditForm.device_code = members.value[0]?.device_code || '';
            heaterEditForm.channel = 1;
            heaterEditForm.label = '';
            heaterEditForm.max_power_w = 1500.0;
            heaterEditForm.enabled = true;
            heaterEditOpen.value = true;
        }
        function openHeaterEdit(h) {
            heaterEditTarget.value = h;
            heaterEditForm.device_code = h.device_code;
            heaterEditForm.channel = h.channel;
            heaterEditForm.label = h.label || '';
            heaterEditForm.max_power_w = h.max_power_w || 1500.0;
            heaterEditForm.enabled = h.enabled;
            heaterEditOpen.value = true;
        }
        async function saveHeater() {
            if (!heaterEditForm.device_code) {
                showToast('Chọn ESP32 trước', 'error');
                return;
            }
            try {
                heaterEditSaving.value = true;
                if (heaterEditTarget.value) {
                    await API.brooder.zones.heaters.update(
                        heaterEditTarget.value.id,
                        {
                            label: heaterEditForm.label || null,
                            max_power_w: Number(heaterEditForm.max_power_w),
                            enabled: heaterEditForm.enabled,
                        },
                    );
                    showToast('Đã cập nhật heater', 'success');
                } else {
                    await API.brooder.zones.heaters.create(zoneId.value, {
                        device_code: heaterEditForm.device_code,
                        channel: Number(heaterEditForm.channel),
                        label: heaterEditForm.label || null,
                        max_power_w: Number(heaterEditForm.max_power_w),
                        enabled: heaterEditForm.enabled,
                    });
                    showToast('Đã thêm heater', 'success');
                }
                heaterEditOpen.value = false;
                await fetchAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                heaterEditSaving.value = false;
            }
        }
        async function deleteHeater(h) {
            if (!confirm(`Gỡ heater ${h.device_code} ch${h.channel}?`)) return;
            try {
                await API.brooder.zones.heaters.delete(h.id);
                showToast('Đã gỡ heater', 'success');
                await fetchAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            }
        }
        async function quickAssignHeaterChannel(item) {
            try {
                await API.brooder.zones.heaters.create(zoneId.value, {
                    device_code: item.device_code,
                    channel: item.channel,
                    label: `Chảo ${item.channel} (${item.device_code})`,
                    max_power_w: 1500.0,
                    enabled: true,
                });
                showToast(`Đã gán ${item.device_code} ch${item.channel}`, 'success');
                await fetchAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        // ── Heater per-channel override (Phase C) ────────────────
        // Each heater runs its own PID with its own setpoint. The modal
        // edits BOTH the manual setpoint override AND the Tier-2 fallback
        // delta in one place — they're paired concerns for one heater.
        function openHeaterOverride(h) {
            heaterOverrideTarget.value = h;
            heaterOverrideForm.manual_setpoint = h.manual_setpoint ?? h.effective_setpoint ?? 33.0;
            heaterOverrideForm.fallback_delta_c = h.fallback_delta_c ?? 0.0;
            heaterOverrideForm.note = '';
            heaterOverrideOpen.value = true;
        }
        async function saveHeaterOverride() {
            const h = heaterOverrideTarget.value;
            if (!h) return;
            const sp = Number(heaterOverrideForm.manual_setpoint);
            const delta = Number(heaterOverrideForm.fallback_delta_c);
            if (sp < TEMP_MIN || sp > TEMP_MAX) {
                showToast(`Setpoint phải trong khoảng ${TEMP_MIN}-${TEMP_MAX}°C`, 'error');
                return;
            }
            if (delta < DELTA_MIN || delta > DELTA_MAX) {
                showToast(`Delta phải trong khoảng ${DELTA_MIN} → ${DELTA_MAX}°C`, 'error');
                return;
            }
            try {
                heaterOverrideSaving.value = true;
                // Setpoint first (null = clear override), then delta.
                await API.brooder.zones.heaters.setSetpoint(
                    h.id, sp, heaterOverrideForm.note || null,
                );
                await API.brooder.zones.heaters.setFallbackDelta(h.id, delta);
                showToast(`Đã lưu override cho ${h.device_code} ch${h.channel}`, 'success');
                heaterOverrideOpen.value = false;
                await fetchAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                heaterOverrideSaving.value = false;
            }
        }
        async function clearHeaterOverride(h) {
            try {
                heaterOverrideSaving.value = true;
                await API.brooder.zones.heaters.setSetpoint(h.id, null, 'clear');
                showToast(`Đã xoá manual setpoint cho ${h.device_code} ch${h.channel}`, 'success');
                await fetchAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                heaterOverrideSaving.value = false;
            }
        }

        // ── Sensor → heater assignment (Phase C) ────────────────
        // heaterId === null detaches (sensor becomes zone-level pool only).
        // heaterId === undefined / '' leaves unchanged (no-op).
        async function assignSensorToHeater(sensorId, heaterId) {
            if (heaterId === undefined || heaterId === '') return;
            try {
                sensorAssignBusy.value = true;
                await API.brooder.zones.assignSensorToHeater(sensorId, heaterId);
                const action = heaterId === null ? 'gỡ' : 'gán';
                showToast(`Đã ${action} sensor ↔ heater`, 'success');
                await fetchAll();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                sensorAssignBusy.value = false;
            }
        }

        // ── Sensor add/remove ─────────────────────────────────
        async function openSensorAdd() {
            zsAddOpen.value = true;
            zsAddSensor.value = '';
            zsAddSubSensor.value = 'a';
            zsAddWeight.value = 1.0;
            zsAddLabel.value = '';
            zsAvailableSubs.value = [];
            await loadCandidates();
        }
        // Watch the selected device — fetch its sub-sensor list when the
        // operator picks a multi-sub-sensor device (e.g. esp32_dual_sht40).
        async function fetchAvailableSubs(code) {
            if (!code) {
                zsAvailableSubs.value = [];
                zsAddSubSensor.value = 'a';
                return;
            }
            try {
                const res = await API.brooder.zones.sensors.listSubSensors(code);
                const subs = res.sub_sensors || [];
                zsAvailableSubs.value = subs;
                // Default selection: 'a' if present, else first
                const tempSubs = subs.filter(s => s.sensor_type === 'temperature');
                if (tempSubs.length) {
                    zsAddSubSensor.value = tempSubs[0].sub_sensor;
                } else {
                    zsAddSubSensor.value = 'a';
                }
            } catch (e) {
                // Non-fatal — single-sub-sensor devices just won't show picker.
                console.warn('listSubSensors failed:', e);
                zsAvailableSubs.value = [];
                zsAddSubSensor.value = 'a';
            }
        }
        watch(zsAddSensor, (newCode) => {
            fetchAvailableSubs(newCode);
        });
        async function addSensor() {
            if (!zsAddSensor.value) {
                showToast('Chọn sensor trước', 'error');
                return;
            }
            try {
                zsSaving.value = true;
                await API.brooder.zones.sensors.add(zoneId.value, {
                    sensor_device_code: zsAddSensor.value,
                    sub_sensor: zsAddSubSensor.value,
                    weight: Number(zsAddWeight.value),
                    label: zsAddLabel.value || null,
                });
                showToast('Đã thêm zone sensor', 'success');
                zsAddOpen.value = false;
                await loadSensors();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                zsSaving.value = false;
            }
        }
        async function removeSensor(code) {
            try {
                zsSaving.value = true;
                await API.brooder.zones.sensors.remove(zoneId.value, code);
                showToast('Đã gỡ sensor', 'success');
                await loadSensors();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            } finally {
                zsSaving.value = false;
            }
        }
        async function updateSensorWeight(code, weight) {
            try {
                await API.brooder.zones.sensors.update(zoneId.value, code, {
                    weight: Number(weight),
                });
                await loadSensors();
            } catch (e) {
                showToast(`Lỗi: ${e.message}`, 'error');
            }
        }

        // ── Chart geometry ────────────────────────────────────
        const CHART_W = 720;
        const CHART_H = 220;
        const CHART_PAD = { l: 36, r: 36, t: 12, b: 24 };

        function buildChartPath(samples, accessor, yMin, yMax) {
            if (!samples.length) return { line: '', area: '', points: [] };
            const innerW = CHART_W - CHART_PAD.l - CHART_PAD.r;
            const innerH = CHART_H - CHART_PAD.t - CHART_PAD.b;
            const t0 = new Date(samples[0].time).getTime();
            const t1 = new Date(samples[samples.length - 1].time).getTime();
            const tSpan = Math.max(1, t1 - t0);
            const points = samples.map(s => {
                const x = CHART_PAD.l
                    + ((new Date(s.time).getTime() - t0) / tSpan) * innerW;
                const v = accessor(s);
                const y = CHART_PAD.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
                return { x, y, v };
            });
            const line = 'M ' + points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ');
            const baseline = CHART_PAD.t + innerH;
            const area = line
                + ` L ${points[points.length - 1].x.toFixed(1)},${baseline}`
                + ` L ${points[0].x.toFixed(1)},${baseline} Z`;
            return { line, area, points };
        }

        const tempChart = computed(() => {
            const samples = telemetry.value.zone_temp || [];
            const minT = 15, maxT = 40;
            const lineData = buildChartPath(samples, s => s.value, minT, maxT);
            const innerH = CHART_H - CHART_PAD.t - CHART_PAD.b;
            const sp = zone.value?.effective_setpoint;
            let spLineY = null;
            if (sp != null) {
                spLineY = CHART_PAD.t + innerH
                    - ((sp - minT) / (maxT - minT)) * innerH;
            }
            return { ...lineData, spLineY, minT, maxT };
        });
        const powerChart = computed(() => {
            const samples = telemetry.value.total_power || [];
            return buildChartPath(samples, s => s.value, 0, 100);
        });
        function tempTicks(minT, maxT) {
            const innerH = CHART_H - CHART_PAD.t - CHART_PAD.b;
            const ticks = [];
            for (let i = 0; i <= 4; i++) {
                const v = minT + (i * (maxT - minT)) / 4;
                const y = CHART_PAD.t + innerH - (i * innerH) / 4;
                ticks.push({ v: v.toFixed(0), y });
            }
            return ticks;
        }

        // ── Lifecycle ─────────────────────────────────────────
        onMounted(async () => {
            try {
                loading.value = true;
                await fetchAll();
            } finally {
                loading.value = false;
            }
            startPolling();
        });
        onUnmounted(() => stopPolling());

        // Re-fetch when zone id changes (router navigation)
        watch(zoneId, async (newId, oldId) => {
            if (newId === oldId) return;
            try {
                loading.value = true;
                await fetchAll();
            } finally {
                loading.value = false;
            }
        });

        // ── Computed helpers ──────────────────────────────────
        const onlineHeaterCount = computed(() =>
            heaters.value.filter(h => h.enabled).length
        );

        // ── "last seen" humanizer + freshness bucket ─────────────
        // Server returns `last_seen_seconds` (null when never seen).
        // Bucket mirrors the dashboard: <2 min green, 2-15 min yellow,
        // >15 min red, null gray. Same strings + classes so users see
        // consistent freshness signals on both pages.
        function formatLastSeen(seconds) {
            if (seconds === null || seconds === undefined) return '— chưa có dữ liệu';
            if (seconds < 60)        return seconds + ' giây trước';
            if (seconds < 3600)      return Math.floor(seconds / 60) + ' phút trước';
            if (seconds < 86400)     return Math.floor(seconds / 3600) + ' giờ trước';
            return Math.floor(seconds / 86400) + ' ngày trước';
        }
        function lastSeenClass(seconds) {
            if (seconds === null || seconds === undefined) return 'cf-badge-gray';
            if (seconds < 120)   return 'cf-badge-green';   // <2 min
            if (seconds < 900)   return 'cf-badge-yellow';  // 2-15 min
            return 'cf-badge-red';                          // >15 min
        }
        // Convert ISO timestamp → seconds since now (null if invalid/missing).
        // Used by Heaters row to show "cập nhật X giây trước" under the
        // power % bar — tells the operator if the value is still fresh
        // (e.g. <30s = ESP just acked) or stale (>5 min = WiFi flap).
        function heaterFreshnessSeconds(iso) {
            if (!iso) return null;
            const t = new Date(iso).getTime();
            if (Number.isNaN(t)) return null;
            return Math.max(0, Math.floor((Date.now() - t) / 1000));
        }

        // ── Template ──────────────────────────────────────────
        return {
            zone, members, heaters, sensors, availableMembers,
            availableHeaterChannels, history, telemetry,
            loading, refreshing, lastUpdated,
            manualEnabled, manualTemp, manualNote, submittingOverride,
            fallbackDelta, savingDelta,
            heaterEditOpen, heaterEditTarget, heaterEditForm, heaterEditSaving,
            heaterOverrideOpen, heaterOverrideTarget, heaterOverrideForm, heaterOverrideSaving,
            sensorAssignBusy,
            zsAddOpen, zsAddSensor, zsAddSubSensor, zsAddWeight, zsAddLabel,
            zsCandidates, zsAvailableSubs, zsSaving, availableCandidates,
            memberAddCode, memberAdding,
            backToBrooder,
            TEMP_MIN, TEMP_MAX, DELTA_MIN, DELTA_MAX,
            dayAgePresets, applyPreset,
            CHART_W, CHART_H, CHART_PAD, tempChart, powerChart, tempTicks,
            onlineHeaterCount,
            formatLastSeen, lastSeenClass,
            heaterFreshnessSeconds,
            syncManualFormToZone,
            reloadAll, saveOverride, clearOverride, saveFallbackDelta,
            openHeaterNew, openHeaterEdit, saveHeater, deleteHeater,
            quickAssignHeaterChannel,
            openHeaterOverride, saveHeaterOverride, clearHeaterOverride,
            assignSensorToHeater,
            scrollToMembersSection,
            addMember, removeMember,
            openSensorAdd, addSensor, removeSensor, updateSensorWeight,
            fmtNum, fmtDate,
        };
    },

    template: `
    <div class="cf-container">

        <!-- 1. Header bar with back button -->
        <div class="cf-header-bar">
            <div class="cf-header-left">
                <button class="btn btn-ghost" @click="backToBrooder">
                    &larr; Quay lại
                </button>
                <div class="cf-header-icon" style="background-color: #d97706;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                    </svg>
                </div>
                <div>
                    <h1 class="cf-h1">{{ zone ? zone.name : 'Zone' }}</h1>
                    <p class="cf-subtitle">
                        <span v-if="zone && zone.barn_name">Trại {{ zone.barn_name }} &middot; </span>
                        {{ members.length }} ESP32 &middot; {{ heaters.length }} heater
                    </p>
                </div>
            </div>
            <div class="cf-header-right">
                <span v-if="zone" class="cf-brooder-status-pill"
                      :class="zone.mode === 'failsafe' ? 'is-warning'
                              : zone.mode === 'stale' ? 'is-warning'
                              : zone.online ? 'is-connected' : 'is-disconnected'">
                    <span class="dot"></span>
                    <span v-if="zone.mode === 'failsafe'">Failsafe</span>
                    <span v-else-if="zone.mode === 'stale'">Stale</span>
                    <span v-else-if="zone.online">Online</span>
                    <span v-else>Offline</span>
                </span>
                <button class="cf-btn-secondary cf-btn-sm" :disabled="refreshing" @click="reloadAll">
                    <span v-if="refreshing">&#9203;</span>
                    <span v-else>&#128260;</span>
                    Tải lại
                </button>
            </div>
        </div>

        <!-- Skeleton -->
        <div v-if="loading" class="cf-cards-grid mt-4">
            <div v-for="i in 4" :key="i" class="cf-barn-card animate-pulse">
                <div class="cf-card-content">
                    <div class="h-3 bg-gray-200 rounded w-1/3 mb-3"></div>
                    <div class="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
            </div>
        </div>

        <template v-else-if="zone">

            <!-- 2. KPI grid (4 cards) -->
            <div class="cf-cards-grid mt-4">
                <div class="cf-barn-card">
                    <div class="cf-card-content">
                        <div class="cf-card-top-row">
                            <div class="cf-card-identity">
                                <div class="cf-card-icon-box" style="background:#fef2f2;color:#dc2626;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>
                                    </svg>
                                </div>
                                <div>
                                    <h3 class="cf-card-title">Nhiệt zone (weighted avg)</h3>
                                    <div class="cf-card-meta-line">
                                        {{ zone.zone_sensors_count || 0 }} sensor
                                        <span v-if="zone.pid_source" class="cf-card-meta-bullet">&middot;</span>
                                        <span v-if="zone.pid_source">{{ zone.pid_source }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="mt-3 text-2xl font-bold text-gray-900">
                            <span v-if="zone.last_zone_temp != null">{{ fmtNum(zone.last_zone_temp, 1) }}&deg;C</span>
                            <span v-else class="cf-text-muted text-base font-normal">&mdash;</span>
                        </div>
                    </div>
                </div>

                <div class="cf-barn-card">
                    <div class="cf-card-content">
                        <div class="cf-card-top-row">
                            <div class="cf-card-identity">
                                <div class="cf-card-icon-box" style="background:#f0fdf4;color:#16a34a;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
                                    </svg>
                                </div>
                                <div>
                                    <h3 class="cf-card-title">Setpoint</h3>
                                    <div class="cf-card-meta-line">
                                        <span v-if="zone.manual_setpoint != null">Manual override</span>
                                        <span v-else>Auto theo ngày tuổi</span>
                                    </div>
                                </div>
                            </div>
                            <span v-if="zone.manual_setpoint != null" class="cf-badge cf-badge-yellow">Manual</span>
                            <span v-else class="cf-badge cf-badge-green">Auto</span>
                        </div>
                        <div class="mt-3 text-2xl font-bold text-gray-900">
                            <span v-if="zone.effective_setpoint != null">{{ fmtNum(zone.effective_setpoint, 1) }}&deg;C</span>
                            <span v-else class="cf-text-muted text-base font-normal">&mdash;</span>
                        </div>
                    </div>
                </div>

                <div class="cf-barn-card">
                    <div class="cf-card-content">
                        <div class="cf-card-top-row">
                            <div class="cf-card-identity">
                                <div class="cf-card-icon-box"
                                     :style="zone.online ? 'background:#fffbeb;color:#d97706;' : 'background:#f1f5f9;color:#64748b;'">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                                    </svg>
                                </div>
                                <div>
                                    <h3 class="cf-card-title">Tổng công suất</h3>
                                    <div class="cf-card-meta-line">
                                        Tổng {{ heaters.length }} chảo
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="mt-3 text-2xl font-bold text-gray-900">
                            <span v-if="zone.last_power_total_pct != null">{{ fmtNum(zone.last_power_total_pct, 0) }}%</span>
                            <span v-else class="cf-text-muted text-base font-normal">&mdash;</span>
                        </div>
                    </div>
                </div>

                <div class="cf-barn-card">
                    <div class="cf-card-content">
                        <div class="cf-card-top-row">
                            <div class="cf-card-identity">
                                <div class="cf-card-icon-box" style="background:#eff6ff;color:#2563eb;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="4" y="4" width="16" height="16" rx="2"/>
                                        <path d="M9 9h6v6H9z"/>
                                    </svg>
                                </div>
                                <div>
                                    <h3 class="cf-card-title">Heater online</h3>
                                    <div class="cf-card-meta-line">
                                        {{ onlineHeaterCount }} / {{ heaters.length }} bật
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="mt-3 text-2xl font-bold text-gray-900">
                            {{ onlineHeaterCount }}
                        </div>
                    </div>
                </div>
            </div>

            <!-- 3. Members section (ESP32 brooders in this zone) -->
            <div id="brooder-members-section" class="card mt-4">
                <div class="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <div class="card-title">ESP32 brooder trong zone</div>
                        <div class="cf-text-muted text-sm mt-1">
                            Mỗi ESP32 có thể điều khiển tối đa 2 chảo (DAC1 + DAC2).
                            Zone controller sẽ publish lệnh <code>power</code> tới tất cả ESP bên dưới.
                        </div>
                    </div>
                </div>
                <div v-if="members.length" class="cf-table-wrapper">
                    <table class="cf-table">
                        <thead>
                            <tr>
                                <th>ESP32</th>
                                <th>Mode</th>
                                <th>SHT40 (T_min)</th>
                                <th>PID nguồn</th>
                                <th class="text-center">Online</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="m in members" :key="m.device_code" class="cf-brooder-member-row">
                                <td>
                                    <code>{{ m.device_code }}</code>
                                    <span v-if="m.cycle_id" class="cf-text-muted">&middot; cycle #{{ m.cycle_id }}</span>
                                </td>
                                <td>
                                    <span v-if="m.mode === 'failsafe'" class="cf-badge cf-badge-red">Failsafe</span>
                                    <span v-else-if="m.mode === 'normal'" class="cf-badge cf-badge-green">Normal</span>
                                    <span v-else-if="m.mode === 'offline'" class="cf-badge cf-badge-gray">Offline</span>
                                    <span v-else class="cf-badge cf-badge-gray">{{ m.mode || '?' }}</span>
                                </td>
                                <td>
                                    <span v-if="m.last_temp_min != null">{{ fmtNum(m.last_temp_min, 1) }}&deg;C</span>
                                    <span v-else class="cf-text-muted">&mdash;</span>
                                    <span v-if="m.last_hum_avg != null" class="cf-text-muted text-xs ml-1">
                                        H {{ fmtNum(m.last_hum_avg, 0) }}%
                                    </span>
                                </td>
                                <td>
                                    <span v-if="m.pid_source" class="cf-badge"
                                          :class="m.pid_source === 'local+delta' ? 'cf-badge-green'
                                                : m.pid_source === 'local' ? 'cf-badge-yellow'
                                                : 'cf-badge-gray'"
                                          :title="'PID input source ESP32 báo cáo: ' + m.pid_source">
                                        {{ m.pid_source }}
                                    </span>
                                    <span v-else class="cf-text-muted">&mdash;</span>
                                </td>
                                <td class="text-center">
                                    <span :class="['cf-badge', lastSeenClass(m.last_seen_seconds)]"
                                          :title="m.last_telemetry_at
                                                  ? 'Cập nhật lúc ' + m.last_telemetry_at
                                                  : 'Chưa từng nhận telemetry'">
                                        {{ formatLastSeen(m.last_seen_seconds) }}
                                    </span>
                                </td>
                                <td>
                                    <button class="cf-btn cf-btn-ghost cf-btn-xs"
                                            @click="removeMember(m.device_code)">
                                        &#10005; Gỡ
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="cf-empty-inline">
                    Chưa có ESP32 nào trong zone. Bấm <b>+ Thêm ESP</b> ở panel bên dưới.
                </div>
            </div>

            <!-- 5. Heaters section -->
            <div class="card mt-4">
                <div class="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <div class="card-title">Heaters trong zone</div>
                        <div class="cf-text-muted text-sm mt-1">
                            <b>Heater</b> = 1 đầu ra vật lý trên ESP32
                            (<code>ch1</code> hoặc <code>ch2</code> = 1 bóng sưởi / chảo nhiệt).
                            Mỗi ESP32 có tối đa 2 heater (DAC1 + DAC2).
                            Zone controller chia PID output theo tỷ lệ
                            <code>max-power</code> của từng heater
                            (<code>heater_i&nbsp;% = pid &times; w_i / &Sigma;w</code>).
                        </div>
                    </div>
                    <button class="cf-btn-primary cf-btn-sm flex-shrink-0"
                            :disabled="!members.length"
                            :title="!members.length
                                    ? 'Cần thêm ESP32 vào zone trước (xem panel phía dưới)'
                                    : 'Gán 1 channel ESP32 làm heater'"
                            @click="openHeaterNew">
                        + Thêm heater
                    </button>
                </div>
                <div v-if="heaters.length" class="cf-table-wrapper">
                    <table class="cf-table">
                        <thead>
                            <tr>
                                <th>ESP32</th>
                                <th class="text-center">Channel</th>
                                <th>Nhãn</th>
                                <th class="text-right">Max (W)</th>
                                <th class="text-right">Hiện tại (%)</th>
                                <th class="text-right">Setpoint</th>
                                <th class="text-right">Delta</th>
                                <th class="text-center">Bật</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="h in heaters" :key="h.id" class="cf-brooder-heater-row">
                                <td><code>{{ h.device_code }}</code></td>
                                <td class="text-center">
                                    <span class="cf-badge cf-badge-blue">ch{{ h.channel }}</span>
                                </td>
                                <td>{{ h.label || '—' }}</td>
                                <td class="text-right">{{ fmtNum(h.max_power_w, 0) }}</td>
                                <td class="text-right">
                                    <div class="cf-brooder-heater-power-bar">
                                        <div class="cf-brooder-heater-power-fill"
                                             :style="'width:' + (h.last_power_pct || 0) + '%'"></div>
                                        <span class="cf-brooder-heater-power-text">
                                            {{ h.last_power_pct || 0 }}%
                                        </span>
                                    </div>
                                    <div v-if="h.last_published_at"
                                         class="cf-text-muted text-xs mt-0.5"
                                         :title="'Lệnh power gửi lúc ' + h.last_published_at">
                                        {{ formatLastSeen(heaterFreshnessSeconds(h.last_published_at)) }}
                                    </div>
                                </td>
                                <td class="text-right">
                                    <span :class="h.manual_setpoint != null ? 'cf-badge cf-badge-yellow' : 'cf-text-muted'">
                                        {{ fmtNum(h.effective_setpoint ?? h.manual_setpoint, 1) }}&deg;C
                                        <template v-if="h.manual_setpoint != null">&nbsp;Manual</template>
                                    </span>
                                </td>
                                <td class="text-right">
                                    <span :class="h.fallback_delta_c ? 'cf-badge' : 'cf-text-muted'">
                                        {{ (h.fallback_delta_c || 0) >= 0 ? '+' : '' }}{{ fmtNum(h.fallback_delta_c || 0, 1) }}&deg;C
                                    </span>
                                </td>
                                <td class="text-center">
                                    <span :class="h.enabled ? 'cf-badge cf-badge-green' : 'cf-badge cf-badge-gray'">
                                        {{ h.enabled ? 'on' : 'off' }}
                                    </span>
                                </td>
                                <td>
                                    <button class="cf-btn cf-btn-ghost cf-btn-xs mr-1"
                                            @click="openHeaterOverride(h)">Override</button>
                                    <button class="cf-btn cf-btn-ghost cf-btn-xs mr-1"
                                            @click="openHeaterEdit(h)">Sửa</button>
                                    <button class="cf-btn cf-btn-ghost cf-btn-xs"
                                            @click="deleteHeater(h)">&#10005;</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else-if="!members.length" class="cf-brooder-heater-empty-pre">
                    <div class="cf-brooder-heater-empty-pre-title">
                        ⚠ Chưa có ESP32 trong zone — không thể tạo heater
                    </div>
                    <div class="cf-text-muted text-sm mt-1 mb-3">
                        Heater phải gắn với <b>1 channel của 1 ESP32</b>.
                        Bước 1: cuộn xuống panel <b>"ESP32 brooder trong trại nhưng chưa thuộc zone"</b>
                        và bấm <b>+ Thêm</b> bên cạnh ESP32 muốn gán vào zone này.
                    </div>
                    <button class="cf-btn-secondary cf-btn-sm"
                            @click="scrollToMembersSection">
                        ↓ Đi tới panel ESP32
                    </button>
                </div>
                <div v-else class="cf-empty-inline">
                    Có {{ members.length }} ESP32 trong zone nhưng chưa gán heater.
                    Bấm <b>+ Thêm heater</b> hoặc dùng panel <b>"Channel ESP32 chưa gán"</b> phía dưới.
                </div>

                <!-- 7. Available heater channels -->
                <div v-if="availableHeaterChannels.length" class="cf-brooder-available-panel mt-4 pt-3 border-t border-gray-200">
                    <div class="text-sm font-semibold text-gray-800 mb-2">
                        Channel ESP32 chưa gán ({{ availableHeaterChannels.length }})
                    </div>
                    <div class="cf-text-muted text-xs mb-3">
                        Mỗi ESP có 2 channel (ch1, ch2). Bấm <b>Gán</b> để thêm vào zone.
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <div v-for="item in availableHeaterChannels" :key="item.device_code + '#' + item.channel"
                             class="cf-brooder-available-pill">
                            <code>{{ item.device_code }}</code>
                            <span class="cf-badge cf-badge-blue ml-1">ch{{ item.channel }}</span>
                            <button class="cf-btn-primary cf-btn-xs ml-2"
                                    @click="quickAssignHeaterChannel(item)">+ Gán</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 4. Zone sensors -->
            <div class="card mt-4">
                <div class="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <div class="card-title">Sensor tham chiếu vùng</div>
                        <div class="cf-text-muted text-sm mt-1">
                            Weighted avg các sensor này được publish tới tất cả ESP trong zone mỗi 20s.
                        </div>
                    </div>
                    <button v-if="!zsAddOpen" class="cf-btn-primary cf-btn-sm flex-shrink-0"
                            @click="openSensorAdd">+ Thêm sensor</button>
                </div>

                <div v-if="sensors.length" class="cf-table-wrapper">
                    <table class="cf-table">
                        <thead>
                            <tr>
                                <th>Sensor</th>
                                <th class="text-center">Sub</th>
                                <th class="text-center">Weight</th>
                                <th>Heater</th>
                                <th class="text-right">Nhiệt</th>
                                <th>Cập nhật</th>
                                <th>Ghi chú</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="s in sensors" :key="s.id">
                                <td>
                                    <code>{{ s.sensor_device_code }}</code>
                                    <span v-if="s.sensor_name" class="cf-text-muted">&middot; {{ s.sensor_name }}</span>
                                </td>
                                <td class="text-center">
                                    <span v-if="s.sub_sensor"
                                          class="cf-badge cf-badge-blue">{{ (s.sub_sensor || 'a').toUpperCase() }}</span>
                                    <span v-else class="cf-text-muted">&mdash;</span>
                                </td>
                                <td class="text-center">
                                    <input type="number" step="0.1" min="0" max="10"
                                           :value="s.weight" :disabled="zsSaving"
                                           class="cf-input"
                                           style="width:5rem; text-align:center; padding:0.25rem 0.5rem;"
                                           @change="(e) => updateSensorWeight(
                                               s.sensor_device_code,
                                               e.target.value)">
                                </td>
                                <td>
                                    <select class="cf-input"
                                            style="padding:0.25rem 0.5rem; min-width:9rem;"
                                            :value="s.heater_id ?? ''"
                                            :disabled="sensorAssignBusy"
                                            @change="(e) => {
                                                const v = e.target.value;
                                                assignSensorToHeater(s.id, v === '' ? '' : Number(v));
                                            }">
                                        <option value="">— zone only —</option>
                                        <option v-for="h in heaters" :key="h.id" :value="h.id">
                                            {{ h.device_code }} ch{{ h.channel }}{{ h.label ? ' (' + h.label + ')' : '' }}
                                        </option>
                                    </select>
                                </td>
                                <td class="text-right">
                                    <span v-if="s.last_value != null">{{ fmtNum(s.last_value, 1) }}&deg;C</span>
                                    <span v-else class="cf-text-muted">&mdash;</span>
                                </td>
                                <td>
                                    <span v-if="s.last_time" class="cf-text-muted text-xs">{{ fmtDate(s.last_time) }}</span>
                                    <span v-else class="cf-text-muted">&mdash;</span>
                                </td>
                                <td>{{ s.label || '' }}</td>
                                <td>
                                    <button class="cf-btn cf-btn-ghost cf-btn-xs" :disabled="zsSaving"
                                            @click="removeSensor(s.sensor_device_code)">
                                        &#10005; Gỡ
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-else class="cf-empty-inline">
                    Chưa gán sensor nào.
                </div>

                <!-- Sensor add form -->
                <div v-if="zsAddOpen" class="bg-gray-50 rounded p-3 mt-3">
                    <div class="cf-form-group">
                        <label class="cf-label">Sensor (cùng trại)</label>
                        <select v-model="zsAddSensor" class="cf-select">
                            <option value="" disabled>— chọn sensor —</option>
                            <option v-for="c in availableCandidates" :key="c.device_code" :value="c.device_code">
                                {{ c.device_code }}<template v-if="c.name"> · {{ c.name }}</template>
                            </option>
                        </select>
                    </div>
                    <!-- Sub-sensor picker (shown only for multi-SHT40 devices) -->
                    <div v-if="zsAvailableSubs.filter(s => s.sensor_type === 'temperature').length > 1"
                         class="cf-form-group mt-2">
                        <label class="cf-label">Sub-sensor (cảm biến con)</label>
                        <div class="flex gap-2 flex-wrap">
                            <label v-for="sub in zsAvailableSubs.filter(s => s.sensor_type === 'temperature')"
                                   :key="sub.sub_sensor"
                                   class="cf-badge cf-badge-blue"
                                   style="cursor:pointer; padding:0.4rem 0.7rem;">
                                <input type="radio" v-model="zsAddSubSensor"
                                       :value="sub.sub_sensor"
                                       style="margin-right:0.3rem;">
                                {{ (sub.sub_sensor || 'a').toUpperCase() }}
                                <span class="cf-text-muted text-xs ml-1"
                                      style="font-weight:400;">
                                    ({{ sub.value != null ? sub.value.toFixed(1) : '—' }}&deg;C)
                                </span>
                            </label>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3 mt-2">
                        <div class="cf-form-group">
                            <label class="cf-label">Weight (0 → 10)</label>
                            <input type="number" v-model.number="zsAddWeight" step="0.1" min="0" max="10" class="cf-input">
                        </div>
                        <div class="cf-form-group">
                            <label class="cf-label">Ghi chú</label>
                            <input type="text" v-model="zsAddLabel" class="cf-input" placeholder="optional">
                        </div>
                    </div>
                    <div class="flex gap-2 mt-3">
                        <button class="cf-btn-primary cf-btn-sm" :disabled="zsSaving || !zsAddSensor" @click="addSensor">
                            <span v-if="zsSaving">&#9203;</span> Lưu
                        </button>
                        <button class="cf-btn cf-btn-ghost cf-btn-sm" :disabled="zsSaving" @click="zsAddOpen = false">
                            Huỷ
                        </button>
                    </div>
                </div>
            </div>

            <!-- 6. Available members panel -->
            <div v-if="zone.barn_id" class="card mt-4">
                <div class="cf-brooder-available-panel">
                    <div class="text-sm font-semibold text-gray-800 mb-2">
                        ESP32 brooder trong trại nhưng chưa thuộc zone
                    </div>
                    <div class="cf-text-muted text-xs mb-3">
                        ESP32 chưa được gán vào zone nào. Bấm <b>+ Thêm</b> để đưa vào zone này.
                    </div>
                    <div v-if="availableMembers.length" class="flex flex-wrap gap-2">
                        <div v-for="m in availableMembers" :key="m.device_code"
                             class="cf-brooder-available-pill">
                            <code>{{ m.device_code }}</code>
                            <button class="cf-btn-primary cf-btn-xs ml-2"
                                    :disabled="memberAdding" @click="memberAddCode = m.device_code; addMember()">
                                + Thêm
                            </button>
                        </div>
                    </div>
                    <div v-else class="cf-empty-inline">
                        Tất cả ESP32 brooder trong trại đã thuộc zone này (hoặc zone khác).
                    </div>
                </div>
            </div>

            <!-- 8. Manual Override + Fallback Delta -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div class="card">
                    <div class="card-title mb-2">Manual Override (toàn zone)</div>
                    <div class="cf-text-muted text-sm mb-4">
                        Setpoint áp dụng cho cả zone. Publish retained tới tất cả member ESPs.
                    </div>
                    <div class="flex items-center gap-3 mb-4">
                        <label class="cf-brooder-toggle">
                            <input type="checkbox" v-model="manualEnabled">
                            <span class="cf-brooder-toggle-slider"></span>
                        </label>
                        <span class="text-sm font-medium"
                              :class="manualEnabled ? 'text-orange-700' : 'text-gray-500'">
                            {{ manualEnabled ? 'Đang khoá setpoint thủ công' : 'Đang theo bảng ngày tuổi' }}
                        </span>
                    </div>

                    <!-- Day-age preset chips: one-click apply of the
                         SETPOINT_TABLE values from brooder_service.py. -->
                    <div class="mb-4">
                        <div class="text-xs text-gray-500 mb-2">Setpoint nhanh theo ngày tuổi:</div>
                        <div class="flex flex-wrap gap-2">
                            <button v-for="p in dayAgePresets" :key="p.label"
                                    class="cf-preset-chip px-2.5 py-1 text-xs rounded-md
                                           bg-blue-50 hover:bg-blue-100 border border-blue-200
                                           text-blue-800 transition
                                           disabled:opacity-50 disabled:cursor-not-allowed"
                                    :disabled="submittingOverride"
                                    :title="'Setpoint ' + p.value + '°C — ' + p.note"
                                    @click="applyPreset(p)">
                                <span class="font-medium">{{ p.label }}:</span>
                                <span class="font-bold ml-1">{{ p.value }}&deg;C</span>
                            </button>
                        </div>
                    </div>

                    <div v-if="manualEnabled" class="mb-4">
                        <div class="cf-brooder-slider-row">
                            <span class="text-xs text-gray-500">Setpoint:</span>
                            <input type="range" :min="TEMP_MIN" :max="TEMP_MAX" step="0.1"
                                   v-model.number="manualTemp" class="cf-brooder-slider">
                            <span class="cf-brooder-slider-value">{{ manualTemp.toFixed(1) }}&deg;C</span>
                        </div>
                    </div>
                    <div class="cf-form-group mb-3">
                        <label class="cf-label">Ghi chú (audit)</label>
                        <input type="text" v-model="manualNote" class="cf-input"
                               placeholder="VD: úm gà con ngày 3">
                    </div>
                    <div class="flex gap-2">
                        <button class="cf-btn-primary cf-btn-sm" :disabled="submittingOverride" @click="saveOverride">
                            <span v-if="submittingOverride">&#9203;</span>
                            {{ manualEnabled ? 'Áp dụng' : 'Xoá override (về auto)' }}
                        </button>
                        <button v-if="manualEnabled" class="cf-btn cf-btn-ghost cf-btn-sm"
                                :disabled="submittingOverride" @click="clearOverride">
                            Xoá thủ công
                        </button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-title mb-2">Fallback delta (Tier-2)</div>
                    <div class="cf-text-muted text-sm mb-4">
                        Khi 3 phút không có zone_temp, ESP dùng <code>local_SHT40 − delta</code> làm
                        ước lượng chick-zone. Dương = heater-zone đọc nóng hơn chick-zone (+1.5 → +3.0°C).
                    </div>
                    <div class="mb-4">
                        <div class="cf-brooder-slider-row">
                            <span class="text-xs text-gray-500">Delta (&deg;C):</span>
                            <input type="range" :min="DELTA_MIN" :max="DELTA_MAX" step="0.1"
                                   v-model.number="fallbackDelta" class="cf-brooder-slider">
                            <span class="cf-brooder-slider-value">
                                {{ fallbackDelta >= 0 ? '+' : '' }}{{ fallbackDelta.toFixed(1) }}&deg;C
                            </span>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button class="cf-btn-primary cf-btn-sm" :disabled="savingDelta" @click="saveFallbackDelta">
                            <span v-if="savingDelta">&#9203;</span> Lưu delta
                        </button>
                    </div>
                </div>
            </div>

            <!-- 9. 24h chart -->
            <div class="card mt-4">
                <div class="card-title mb-1">24h gần nhất</div>
                <div class="cf-text-muted text-sm mb-3">
                    Đường đỏ = nhiệt zone (°C, trục trái); vùng mờ xanh = tổng công suất (% trục phải);
                    đường đứt nét xanh = setpoint.
                </div>
                <svg :viewBox="'0 0 ' + CHART_W + ' ' + CHART_H"
                     class="cf-brooder-chart" preserveAspectRatio="none">
                    <g>
                        <g v-for="t in tempTicks(tempChart.minT, tempChart.maxT)" :key="'y' + t.v">
                            <line :x1="CHART_PAD.l" :x2="CHART_W - CHART_PAD.r" :y1="t.y" :y2="t.y"
                                  class="cf-brooder-chart-grid"/>
                            <text :x="CHART_PAD.l - 6" :y="t.y + 3" text-anchor="end"
                                  class="cf-brooder-chart-tick">{{ t.v }}&deg;</text>
                        </g>
                    </g>
                    <g>
                        <g v-for="i in 5" :key="'pr' + i">
                            <text :x="CHART_W - CHART_PAD.r + 6"
                                  :y="CHART_PAD.t + (i - 1) *
                                      (CHART_H - CHART_PAD.t - CHART_PAD.b) / 4 + 3"
                                  class="cf-brooder-chart-tick">{{ (100 - (i - 1) * 25) }}%</text>
                        </g>
                    </g>
                    <path v-if="powerChart.area" :d="powerChart.area" class="cf-brooder-chart-area-power"/>
                    <path v-if="powerChart.line" :d="powerChart.line" class="cf-brooder-chart-line-power"/>
                    <line v-if="tempChart.spLineY != null"
                          :x1="CHART_PAD.l" :x2="CHART_W - CHART_PAD.r"
                          :y1="tempChart.spLineY" :y2="tempChart.spLineY"
                          class="cf-brooder-chart-line-setpoint"/>
                    <path v-if="tempChart.line" :d="tempChart.line" class="cf-brooder-chart-line-temp"/>
                </svg>
                <div class="cf-brooder-chart-legend">
                    <span><span class="cf-brooder-legend-swatch is-temp"></span>Nhiệt zone (°C)</span>
                    <span><span class="cf-brooder-legend-swatch is-power"></span>Tổng công suất (%)</span>
                    <span><span class="cf-brooder-legend-swatch is-setpoint"></span>Setpoint</span>
                </div>
            </div>

            <!-- 10. Audit log -->
            <div v-if="history.length" class="card mt-4">
                <div class="card-title mb-3">Lịch sử can thiệp zone</div>
                <div class="cf-table-wrapper">
                    <table class="cf-table">
                        <thead>
                            <tr>
                                <th>Thời gian</th>
                                <th class="text-right">Setpoint đặt</th>
                                <th class="text-right">Hiệu lực</th>
                                <th>Source</th>
                                <th>Ghi chú</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="h in history" :key="h.id">
                                <td class="cf-text-muted text-xs whitespace-nowrap">{{ fmtDate(h.created_at) }}</td>
                                <td class="text-right">
                                    <span v-if="h.manual_setpoint != null">{{ fmtNum(h.manual_setpoint, 1) }}&deg;C</span>
                                    <span v-else class="cf-text-muted">(clear)</span>
                                </td>
                                <td class="text-right">{{ fmtNum(h.effective_setpoint, 1) }}&deg;C</td>
                                <td>
                                    <span class="cf-badge"
                                          :class="h.source === 'manual' ? 'cf-badge-yellow' : ''">
                                        {{ h.source }}
                                    </span>
                                </td>
                                <td>{{ h.note || '' }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Heater edit/create modal -->
            <div v-if="heaterEditOpen" class="cf-modal-backdrop" @click.self="heaterEditOpen = false">
                <div class="cf-modal">
                    <div class="cf-modal-header">
                        <div class="cf-modal-title">
                            {{ heaterEditTarget ? 'Sửa heater' : 'Thêm heater' }}
                        </div>
                        <button class="cf-btn cf-btn-ghost cf-btn-sm" @click="heaterEditOpen = false">&#10005;</button>
                    </div>
                    <div class="cf-modal-body">
                        <div class="cf-form-group">
                            <label class="cf-label">ESP32</label>
                            <select v-model="heaterEditForm.device_code" class="cf-select"
                                    :disabled="!!heaterEditTarget">
                                <option v-for="m in members" :key="m.device_code" :value="m.device_code">
                                    {{ m.device_code }}
                                </option>
                            </select>
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div class="cf-form-group">
                                <label class="cf-label">Channel</label>
                                <select v-model.number="heaterEditForm.channel" class="cf-select"
                                        :disabled="!!heaterEditTarget">
                                    <option :value="1">ch1 (DAC1)</option>
                                    <option :value="2">ch2 (DAC2)</option>
                                </select>
                            </div>
                            <div class="cf-form-group">
                                <label class="cf-label">Max power (W)</label>
                                <input type="number" v-model.number="heaterEditForm.max_power_w"
                                       step="100" min="0" max="10000" class="cf-input">
                            </div>
                        </div>
                        <div class="cf-form-group">
                            <label class="cf-label">Nhãn</label>
                            <input type="text" v-model="heaterEditForm.label" class="cf-input"
                                   placeholder="VD: chảo chính giữa" maxlength="100">
                        </div>
                        <div class="cf-form-group">
                            <label class="flex items-center gap-2">
                                <input type="checkbox" v-model="heaterEditForm.enabled">
                                <span>Bật heater này</span>
                            </label>
                        </div>
                    </div>
                    <div class="cf-modal-footer">
                        <button class="cf-btn cf-btn-ghost cf-btn-sm"
                                :disabled="heaterEditSaving" @click="heaterEditOpen = false">Huỷ</button>
                        <button class="cf-btn-primary cf-btn-sm"
                                :disabled="heaterEditSaving" @click="saveHeater">
                            <span v-if="heaterEditSaving">&#9203;</span>
                            {{ heaterEditTarget ? 'Lưu thay đổi' : 'Tạo heater' }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Heater per-channel override modal (Phase C — heater-first PID) -->
            <div v-if="heaterOverrideOpen" class="cf-modal-backdrop"
                 @click.self="heaterOverrideOpen = false">
                <div class="cf-modal">
                    <div class="cf-modal-header">
                        <div class="cf-modal-title">
                            Override heater
                            <span v-if="heaterOverrideTarget" class="cf-text-muted text-sm font-normal ml-2">
                                {{ heaterOverrideTarget.device_code }} ch{{ heaterOverrideTarget.channel }}
                            </span>
                        </div>
                        <button class="cf-btn cf-btn-ghost cf-btn-sm"
                                @click="heaterOverrideOpen = false">&#10005;</button>
                    </div>
                    <div class="cf-modal-body">
                        <div class="cf-text-muted text-sm mb-3">
                            PID riêng cho heater này. Setpoint = manual override (để trống bằng cách xoá = auto theo cascade).
                            Delta = bias Tier-2 khi không có zone sensor tươi.
                        </div>
                        <div class="cf-form-group">
                            <label class="cf-label">Manual setpoint (&deg;C)</label>
                            <div class="cf-brooder-slider-row">
                                <input type="range" :min="TEMP_MIN" :max="TEMP_MAX" step="0.1"
                                       v-model.number="heaterOverrideForm.manual_setpoint"
                                       class="cf-brooder-slider">
                                <span class="cf-brooder-slider-value">
                                    {{ heaterOverrideForm.manual_setpoint.toFixed(1) }}&deg;C
                                </span>
                            </div>
                        </div>
                        <div class="cf-form-group">
                            <label class="cf-label">Fallback delta (&deg;C)</label>
                            <div class="cf-brooder-slider-row">
                                <input type="range" :min="DELTA_MIN" :max="DELTA_MAX" step="0.1"
                                       v-model.number="heaterOverrideForm.fallback_delta_c"
                                       class="cf-brooder-slider">
                                <span class="cf-brooder-slider-value">
                                    {{ heaterOverrideForm.fallback_delta_c >= 0 ? '+' : '' }}{{ heaterOverrideForm.fallback_delta_c.toFixed(1) }}&deg;C
                                </span>
                            </div>
                        </div>
                        <div class="cf-form-group">
                            <label class="cf-label">Ghi chú (audit)</label>
                            <input type="text" v-model="heaterOverrideForm.note" class="cf-input"
                                   placeholder="VD: úm gà con ngày 3, chảo này nóng hơn">
                        </div>
                    </div>
                    <div class="cf-modal-footer">
                        <button v-if="heaterOverrideTarget && heaterOverrideTarget.manual_setpoint != null"
                                class="cf-btn cf-btn-ghost cf-btn-sm"
                                :disabled="heaterOverrideSaving"
                                @click="clearHeaterOverride(heaterOverrideTarget)">
                            Xoá manual
                        </button>
                        <button class="cf-btn cf-btn-ghost cf-btn-sm"
                                :disabled="heaterOverrideSaving"
                                @click="heaterOverrideOpen = false">Huỷ</button>
                        <button class="cf-btn-primary cf-btn-sm"
                                :disabled="heaterOverrideSaving"
                                @click="saveHeaterOverride">
                            <span v-if="heaterOverrideSaving">&#9203;</span> Lưu override
                        </button>
                    </div>
                </div>
            </div>

        </template>

        <div v-else-if="!loading" class="cf-empty-box">
            <div class="cf-empty-icon">&#128683;</div>
            <div class="cf-empty-title">Zone không tồn tại</div>
            <div class="cf-empty-desc">Zone #{{ $props.id }} không tìm thấy hoặc đã bị xoá.</div>
        </div>
    </div>
    `,
};