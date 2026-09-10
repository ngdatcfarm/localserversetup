/**
 * CFarm API Client
 *
 * All requests include `credentials: 'same-origin'` so the cfarm_session
 * cookie is sent with every API call. On 401, an `auth:unauthorized`
 * CustomEvent is dispatched on window so the SPA can show the login screen.
 */
const API = {
    async request(method, url, data = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
        };
        if (data) opts.body = JSON.stringify(data);
        const res = await fetch(url, opts);
        if (res.status === 401 && !url.startsWith('/api/auth/')) {
            // Not logged in or session expired — notify the app
            window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: { url } }));
            const err = await res.json().catch(() => ({ detail: 'Chưa đăng nhập' }));
            throw new Error(err.detail || 'Chưa đăng nhập');
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(err.detail || 'Request failed');
        }
        return res.json();
    },

    get(url) { return this.request('GET', url); },
    post(url, data) { return this.request('POST', url, data); },
    put(url, data) { return this.request('PUT', url, data); },
    del(url) { return this.request('DELETE', url); },

    // Health
    health() { return this.get('/health'); },

    // Auth
    auth: {
        login(username, password) {
            // Use fetch directly so the 401 path doesn't trigger the
            // global 'auth:unauthorized' redirect (user is on login page)
            return fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ username, password }),
            }).then(async res => {
                if (!res.ok) {
                    const err = await res.json().catch(() => ({ detail: res.statusText }));
                    throw new Error(err.detail || 'Đăng nhập thất bại');
                }
                return res.json();
            });
        },
        logout() { return API.post('/api/auth/logout'); },
        me() { return API.get('/api/auth/me'); },
        changePassword(oldPassword, newPassword) {
            return API.post('/api/auth/change-password', {
                old_password: oldPassword,
                new_password: newPassword,
            });
        },
    },

    // Farms
    farms: {
        list() { return API.get('/api/farm/farms'); },
        get(id) { return API.get(`/api/farm/farms/${id}`); },
        create(d) { return API.post('/api/farm/farms', d); },
        update(id, d) { return API.put(`/api/farm/farms/${id}`, d); },
        del(id) { return API.del(`/api/farm/farms/${id}`); },
    },

    // Barns
    barns: {
        list() { return API.get('/api/farm/barns'); },
        get(id) { return API.get(`/api/farm/barns/${id}`); },
        create(d) { return API.post('/api/farm/barns', d); },
        update(id, d) { return API.put(`/api/farm/barns/${id}`, d); },
        del(id) { return API.del(`/api/farm/barns/${id}`); },
        defaultWarehouses(id) { return API.get(`/api/farm/barns/${id}/default-warehouses`); },
        setDefaultWarehouse(barnId, d) { return API.post(`/api/farm/barns/${barnId}/default-warehouses`, d); },
        deleteDefaultWarehouse(barnId, whType) { return API.del(`/api/farm/barns/${barnId}/default-warehouses/${whType}`); },
        suggestedWarehouses(id) { return API.get(`/api/farm/barns/${id}/suggested-warehouses`); },
    },

    // Cycles
    cycles: {
        list(barnId) { return API.get(`/api/farm/cycles${barnId ? '?barn_id=' + barnId : ''}`); },
        get(id) { return API.get(`/api/farm/cycles/${id}`); },
        create(d) { return API.post('/api/farm/cycles', d); },
        update(id, d) { return API.put(`/api/farm/cycles/${id}`, d); },
        // Close endpoint — sends JSON body {end_date, notes, force}
        close(id, d) {
            return API.post(`/api/farm/cycles/${id}/close`, {
                end_date: d?.end_date,
                notes: d?.notes,
                force: d?.force || false,
            });
        },
        reopen(id, confirm = true) {
            return API.post(`/api/farm/cycles/${id}/reopen`, { confirm });
        },
        dashboard(id) { return API.get(`/api/farm/cycles/${id}/dashboard`); },
        summary(id) { return API.get(`/api/farm/cycles/${id}/summary`); },
    },

    // Devices
    devices: {
        list(barnId) { return API.get(`/api/devices${barnId ? '?barn_id=' + barnId : ''}`); },
        get(id) { return API.get(`/api/devices/${id}`); },
        create(d) { return API.post('/api/devices', d); },
        update(id, d) { return API.put(`/api/devices/${id}`, d); },
        del(id) { return API.del(`/api/devices/${id}`); },
        test(id) { return API.post(`/api/devices/${id}/test`); },
        states(id) { return API.get(`/api/devices/${id}/states`); },
        channels(id) { return API.get(`/api/devices/${id}/channels`); },
        types: {
            list() { return API.get('/api/devices/types'); },
            create(d) { return API.post('/api/devices/types', d); },
            update(id, d) { return API.put(`/api/devices/types/${id}`, d); },
            del(id) { return API.del(`/api/devices/types/${id}`); },
        },
    },

    // Bats (ventilation curtains)
    bats: {
        listByBarn(barnId) { return API.get(`/api/bats/barns/${barnId}`); },
        get(batId) { return API.get(`/api/bats/${batId}`); },
        update(batId, d) { return API.put(`/api/bats/${batId}`, d); },
        moveUp(batId) { return API.post(`/api/bats/${batId}/up`); },
        moveDown(batId) { return API.post(`/api/bats/${batId}/down`); },
        stop(batId) { return API.post(`/api/bats/${batId}/stop`); },
        logs(batId, limit) { return API.get(`/api/bats/${batId}/logs${limit ? '?limit=' + limit : ''}`); },
        logsByBarn(barnId, limit) { return API.get(`/api/bats/barns/${barnId}/logs${limit ? '?limit=' + limit : ''}`); },
    },

    // MQ Tare (R0 baseline calibration for MQ135/MQ137)
    mqTare: {
        start(data) { return API.post('/api/mq-tare/start', data); },
        cancel(data) { return API.post('/api/mq-tare/cancel', data); },
        status(deviceId) { return API.get(`/api/mq-tare/status/${deviceId}`); },
        history(deviceId, sensorType, limit = 20) {
            return API.get(`/api/mq-tare/history/${deviceId}/${sensorType}?limit=${limit}`);
        },
        ratio(deviceId, sensorType, hours = 24) {
            return API.get(`/api/mq-tare/ratio/${deviceId}/${sensorType}?hours=${hours}`);
        },
    },

    // Equipment
    equipment: {
        listTypes() { return API.get('/api/equipment/types'); },
        getType(id) { return API.get(`/api/equipment/types/${id}`); },
        createType(d) { return API.post('/api/equipment/types', d); },
        updateType(id, d) { return API.put(`/api/equipment/types/${id}`, d); },
        deleteType(id) { return API.del(`/api/equipment/types/${id}`); },
        list(barnId, typeId) {
            let url = '/api/equipment';
            const params = [];
            if (barnId) params.push(`barn_id=${barnId}`);
            if (typeId) params.push(`equipment_type_id=${typeId}`);
            if (params.length) url += '?' + params.join('&');
            return API.get(url);
        },
        get(id) { return API.get(`/api/equipment/${id}`); },
        create(d) { return API.post('/api/equipment', d); },
        update(id, d) { return API.put(`/api/equipment/${id}`, d); },
        delete(id) { return API.del(`/api/equipment/${id}`); },
        assign(id, d) { return API.post(`/api/equipment/${id}/assign`, d); },
        unassign(id) { return API.post(`/api/equipment/${id}/unassign`); },
        logs(id) { return API.get(`/api/equipment/${id}/logs`); },
        commands(id) { return API.get(`/api/equipment/${id}/commands`); },
    },

    // Firmware
    firmware: {
        generate(deviceId) { return API.get(`/api/firmware/generate/${deviceId}`); },
        list(deviceTypeCode) { return API.get(`/api/firmware${deviceTypeCode ? '?device_type_code=' + deviceTypeCode : ''}`); },
    },

    // Warehouses & Products
    warehouses: {
        list() { return API.get('/api/farm/warehouses'); },
        create(d) { return API.post('/api/farm/warehouses', d); },
        update(id, d) { return API.put(`/api/farm/warehouses/${id}`, d); },
        del(id) { return API.del(`/api/farm/warehouses/${id}`); },
    },
    products: {
        list() { return API.get('/api/farm/products'); },
        create(d) { return API.post('/api/farm/products', d); },
        update(id, d) { return API.put(`/api/farm/products/${id}`, d); },
        del(id) { return API.del(`/api/farm/products/${id}`); },
    },

    // Sensor Alerts
    sensorAlerts: {
        list(ack, barnId, limit) {
            const params = [];
            if (ack !== undefined) params.push('acknowledged=' + ack);
            if (barnId) params.push('barn_id=' + barnId);
            if (limit) params.push('limit=' + limit);
            const q = params.length ? '?' + params.join('&') : '';
            return API.get('/api/alerts' + q);
        },
        active(barnId) {
            const q = barnId ? '?barn_id=' + barnId : '';
            return API.get('/api/alerts/active' + q);
        },
        ack(id) { return API.post('/api/alerts/' + id + '/acknowledge'); },
        ackAll(barnId) {
            const q = barnId ? '?barn_id=' + barnId : '';
            return API.post('/api/alerts/acknowledge-all' + q);
        },
        check() { return API.post('/api/alerts/check'); },
        // Rules
        rules: {
            list(barnId) {
                const q = barnId ? '?barn_id=' + barnId : '';
                return API.get('/api/alerts/rules' + q);
            },
            get(id) { return API.get('/api/alerts/rules/' + id); },
            create(d) { return API.post('/api/alerts/rules', d); },
            update(id, d) { return API.put('/api/alerts/rules/' + id, d); },
            delete(id) { return API.del('/api/alerts/rules/' + id); },
        },
    },

    // Inventory Alerts
    inventory: {
        list(whId) { return API.get(`/api/farm/inventory${whId ? '?warehouse_id=' + whId : ''}`); },
        import(d) { return API.post('/api/farm/inventory/import', d); },
        export(d) { return API.post('/api/farm/inventory/export', d); },
        transfer(d) { return API.post('/api/farm/inventory/transfer', d); },
        transactions(whId, limit) { return API.get(`/api/farm/inventory/transactions${whId ? '?warehouse_id=' + whId : ''}${limit ? (whId ? '&' : '?') + 'limit=' + limit : ''}`); },
        alerts(whId) { return API.get(`/api/farm/inventory/alerts${whId ? '?warehouse_id=' + whId : ''}`); },
        checkAlerts(whId) { return API.post(`/api/farm/inventory/alerts/check${whId ? '?warehouse_id=' + whId : ''}`); },
        ackAlert(id, by) { return API.post(`/api/farm/inventory/alerts/${id}/acknowledge${by ? '?acknowledged_by=' + by : ''}`); },
        resolveAlert(id) { return API.post(`/api/farm/inventory/alerts/${id}/resolve`); },
        deleteAlert(id) { return API.del(`/api/farm/inventory/alerts/${id}`); },
        // Alert rules
        alertRules(params) {
            const q = params ? '?' + new URLSearchParams(params).toString() : '';
            return API.get('/api/farm/inventory/alerts/rules' + q);
        },
        createAlertRule(d) { return API.post('/api/farm/inventory/alerts/rules', d); },
        getAlertRule(id) { return API.get(`/api/farm/inventory/alerts/rules/${id}`); },
        updateAlertRule(id, d) { return API.put(`/api/farm/inventory/alerts/rules/${id}`, d); },
        deleteAlertRule(id) { return API.del(`/api/farm/inventory/alerts/rules/${id}`); },
        toggleAlertRule(id, enabled) { return API.post(`/api/farm/inventory/alerts/rules/${id}/toggle`, { enabled }); },
    },

    // Care
    care: {
        logFeed(d) { return API.post('/api/farm/care/feed', d); },
        feedHistory(cycleId, dateFrom, dateTo) {
            const p = new URLSearchParams();
            if (dateFrom) p.set('date_from', dateFrom);
            if (dateTo) p.set('date_to', dateTo);
            const q = p.toString();
            return API.get(`/api/farm/care/feed/${cycleId}${q ? '?' + q : ''}`);
        },
        logDeath(d) { return API.post('/api/farm/care/death', d); },
        deathHistory(cycleId, dateFrom, dateTo) {
            const p = new URLSearchParams();
            if (dateFrom) p.set('date_from', dateFrom);
            if (dateTo) p.set('date_to', dateTo);
            const q = p.toString();
            return API.get(`/api/farm/care/death/${cycleId}${q ? '?' + q : ''}`);
        },
        logMedication(d) { return API.post('/api/farm/care/medication', d); },
        medHistory(cycleId, dateFrom, dateTo) {
            const p = new URLSearchParams();
            if (dateFrom) p.set('date_from', dateFrom);
            if (dateTo) p.set('date_to', dateTo);
            const q = p.toString();
            return API.get(`/api/farm/care/medication/${cycleId}${q ? '?' + q : ''}`);
        },
        logWeight(d) { return API.post('/api/farm/care/weight', d); },
        weightHistory(cycleId) { return API.get(`/api/farm/care/weight/${cycleId}`); },
        logSale(d) { return API.post('/api/farm/care/sale', d); },
        saleHistory(cycleId) { return API.get(`/api/farm/care/sale/${cycleId}`); },
        // Water logs
        logWater(d) { return API.post('/api/farm/care/water', d); },
        waterHistory(cycleId, dateFrom, dateTo) {
            const p = new URLSearchParams();
            if (dateFrom) p.set('date_from', dateFrom);
            if (dateTo) p.set('date_to', dateTo);
            const q = p.toString();
            return API.get(`/api/farm/care/water/${cycleId}${q ? '?' + q : ''}`);
        },
        // Health notes
        logHealth(d) { return API.post('/api/farm/care/health', d); },
        healthHistory(cycleId, dateFrom, dateTo) {
            const p = new URLSearchParams();
            if (dateFrom) p.set('date_from', dateFrom);
            if (dateTo) p.set('date_to', dateTo);
            const q = p.toString();
            return API.get(`/api/farm/care/health/${cycleId}${q ? '?' + q : ''}`);
        },
        resolveHealth(noteId) { return API.post(`/api/farm/care/health/${noteId}/resolve`); },
        // DELETE methods (using API.del)
        delFeed(id) { return API.del(`/api/farm/care/feed/${id}`); },
        delMedication(id) { return API.del(`/api/farm/care/medication/${id}`); },
        delDeath(id) { return API.del(`/api/farm/care/death/${id}`); },
        delWeight(id) { return API.del(`/api/farm/care/weight/${id}`); },
        delSale(id) { return API.del(`/api/farm/care/sale/${id}`); },
        delWater(id) { return API.del(`/api/farm/care/water/${id}`); },
        delHealth(id) { return API.del(`/api/farm/care/health/${id}`); },
        medSuggestions(barnId, limit) { return API.get(`/api/farm/care/medication/suggestions?barn_id=${encodeURIComponent(barnId)}&limit=${limit || 20}`); },
        timeline(cycleId, opts) {
            const p = new URLSearchParams({ cycle_id: cycleId });
            if (opts?.type) p.set('type', opts.type);
            if (opts?.date_from) p.set('date_from', opts.date_from);
            if (opts?.date_to) p.set('date_to', opts.date_to);
            if (opts?.limit) p.set('limit', opts.limit);
            return API.get('/api/farm/care/timeline?' + p.toString());
        },
        // Calendar heatmap (per-day classification for a month)
        calendar(cycleId, month) {
            const p = new URLSearchParams({ cycle_id: cycleId });
            if (month) p.set('month', month);
            return API.get('/api/farm/care/calendar?' + p.toString());
        },
        // Day detail (feeds/meds/deaths/water bucketed by shift)
        dayDetail(cycleId, date) {
            return API.get('/api/farm/care/day?' + new URLSearchParams({ cycle_id: cycleId, date }));
        },
    },

    // Sensors
    sensors: {
        latest(params) { return API.get('/api/sensors/latest' + (params || '')); },
        history(deviceId, type, hours) { return API.get(`/api/sensors/history/${deviceId}/${type}?hours=${hours || 24}`); },
        hourly(deviceId, type, hours) { return API.get(`/api/sensors/hourly/${deviceId}/${type}?hours=${hours || 24}`); },
        barnSummary(barnId) { return API.get(`/api/sensors/barn/${barnId}`); },
        barnsTemperature() { return API.get('/api/sensors/barns-temperature'); },
        series(sensorType, range, barnId) {
            const params = new URLSearchParams({ sensor_type: sensorType, range: range || 'day' });
            if (barnId && barnId !== 'all') params.set('barn_id', barnId);
            return API.get('/api/sensors/series?' + params.toString());
        },
    },

    // Alerts
    alerts: {
        list(ack) { return API.get(`/api/alerts${ack !== undefined ? '?acknowledged=' + ack : ''}`); },
        ack(id) { return API.post(`/api/alerts/${id}/acknowledge`); },
        ackAll() { return API.post('/api/alerts/acknowledge-all'); },
        rules: {
            list() { return API.get('/api/alerts/rules'); },
            create(d) { return API.post('/api/alerts/rules', d); },
            update(id, d) { return API.put(`/api/alerts/rules/${id}`, d); },
            del(id) { return API.del(`/api/alerts/rules/${id}`); },
        },
    },

    // Automation
    automation: {
        list() { return API.get('/api/automation/rules'); },
        create(d) { return API.post('/api/automation/rules', d); },
        update(id, d) { return API.put(`/api/automation/rules/${id}`, d); },
        del(id) { return API.del(`/api/automation/rules/${id}`); },
    },

    // Feed Brands & Types
    feedBrands: {
        list() { return API.get('/api/farm/feeds/brands'); },
        get(id) { return API.get(`/api/farm/feeds/brands/${id}`); },
        create(d) { return API.post('/api/farm/feeds/brands', d); },
        update(id, d) { return API.put(`/api/farm/feeds/brands/${id}`, d); },
        del(id) { return API.del(`/api/farm/feeds/brands/${id}`); },
    },
    feedTypes: {
        list(brandId) { return API.get(`/api/farm/feeds/types${brandId ? '?brand_id=' + brandId : ''}`); },
        get(id) { return API.get(`/api/farm/feeds/types/${id}`); },
        create(d) { return API.post('/api/farm/feeds/types', d); },
        update(id, d) { return API.put(`/api/farm/feeds/types/${id}`, d); },
        del(id) { return API.del(`/api/farm/feeds/types/${id}`); },
    },

    // Medications
    medications: {
        list(cat) { return API.get(`/api/farm/medications${cat ? '?category=' + cat : ''}`); },
        get(id) { return API.get(`/api/farm/medications/${id}`); },
        create(d) { return API.post('/api/farm/medications', d); },
        update(id, d) { return API.put(`/api/farm/medications/${id}`, d); },
        del(id) { return API.del(`/api/farm/medications/${id}`); },
        // AI-assisted medication name aliases (admin / care chip suggestions)
        aiSuggestAliases(maxDistinct = 100, minUsageCount = 2) {
            return API.post('/api/farm/medication-aliases/ai-suggest-aliases', {
                max_distinct: maxDistinct, min_usage_count: minUsageCount
            });
        },
        applyAliases(items, updateExisting = true) {
            return API.post('/api/farm/medication-aliases/apply-aliases', {
                items, update_existing: updateExisting
            });
        },
        nameSuggestions(limit = 20) {
            return API.get(`/api/farm/medication-aliases/name-suggestions?limit=${limit}`);
        },
        // Admin manual cleanup — list distinct free-text names + alias status
        freeTextNames(limit = 500) {
            return API.get(`/api/farm/medication-aliases/free-text-names?limit=${limit}`);
        },
        deleteAlias(aliasName) {
            return API.del(`/api/farm/medication-aliases/aliases/${encodeURIComponent(aliasName)}`);
        },
        // Real-time per-keystroke resolve for /care custom_name dropdown
        resolve(text) {
            return API.post('/api/farm/medication-aliases/resolve', { text });
        },
        // Suggest NEW catalog medications from repeated free-text names (admin)
        autoSuggestCatalog(minUsage = 2, limit = 50) {
            return API.get(
                `/api/farm/medication-aliases/auto-suggest-catalog?min_usage=${minUsage}&limit=${limit}`
            );
        },
        // Admin creates new catalog medication + aliases for variants (one-shot)
        createFromFreetext(payload) {
            return API.post('/api/farm/medication-aliases/create-from-freetext', payload);
        },
    },

    // Suppliers
    suppliers: {
        list() { return API.get('/api/farm/suppliers'); },
        get(id) { return API.get(`/api/farm/suppliers/${id}`); },
        create(d) { return API.post('/api/farm/suppliers', d); },
        update(id, d) { return API.put(`/api/farm/suppliers/${id}`, d); },
        del(id) { return API.del(`/api/farm/suppliers/${id}`); },
    },

    // Vaccine Programs & Schedules
    vaccines: {
        programs: {
            list() { return API.get('/api/farm/vaccine-programs'); },
            get(id) { return API.get(`/api/farm/vaccine-programs/${id}`); },
            create(d) { return API.post('/api/farm/vaccine-programs', d); },
            update(id, d) { return API.put(`/api/farm/vaccine-programs/${id}`, d); },
            del(id) { return API.del(`/api/farm/vaccine-programs/${id}`); },
            addItem(pid, d) { return API.post(`/api/farm/vaccine-programs/${pid}/items`, d); },
            updateItem(id, d) { return API.put(`/api/farm/vaccine-programs/items/${id}`, d); },
            delItem(id) { return API.del(`/api/farm/vaccine-programs/items/${id}`); },
        },
        schedules: {
            list(cycleId) { return API.get(`/api/farm/vaccine-schedules?cycle_id=${cycleId}`); },
            upcoming(days) { return API.get(`/api/farm/vaccine-schedules/upcoming?days=${days || 7}`); },
            create(d) { return API.post('/api/farm/vaccine-schedules', d); },
            applyProgram(cycleId, programId) { return API.post(`/api/farm/vaccine-schedules/apply-program?cycle_id=${cycleId}`, { program_id: programId }); },
            done(id, notes) { return API.post(`/api/farm/vaccine-schedules/${id}/done${notes ? '?notes=' + encodeURIComponent(notes) : ''}`); },
            skip(id, reason) { return API.post(`/api/farm/vaccine-schedules/${id}/skip${reason ? '?reason=' + encodeURIComponent(reason) : ''}`); },
            del(id) { return API.del(`/api/farm/vaccine-schedules/${id}`); },
        },
    },

    // Health Notes
    healthNotes: {
        list(cycleId) { return API.get(`/api/farm/health-notes?cycle_id=${cycleId}`); },
        create(d) { return API.post('/api/farm/health-notes', d); },
        resolve(id) { return API.post(`/api/farm/health-notes/${id}/resolve`); },
        del(id) { return API.del(`/api/farm/health-notes/${id}`); },
    },

    // Weight Sessions
    weightSessions: {
        list(cycleId) { return API.get(`/api/farm/weight-sessions?cycle_id=${cycleId}`); },
        get(id) { return API.get(`/api/farm/weight-sessions/${id}`); },
        create(d) { return API.post('/api/farm/weight-sessions', d); },
        del(id) { return API.del(`/api/farm/weight-sessions/${id}`); },
    },

    // Cloud Sync
    sync: {
        status() { return API.get('/api/sync/status'); },
        config() { return API.get('/api/sync/config'); },
        updateConfig(d) { return API.post('/api/sync/config', d); },
        now() { return API.post('/api/sync/now'); },
        fullSync() { return API.post('/api/sync/full-sync'); },
        queue(limit) { return API.get(`/api/sync/queue?limit=${limit || 50}`); },
        logs(limit) { return API.get(`/api/sync/logs?limit=${limit || 20}`); },
    },

    // Relay
    relay: {
        send(d) { return API.post('/api/iot/relay', d); },
        timed(d) { return API.post('/api/iot/relay/timed', d); },
        // CFarm → Worker → multi-channel notifications (added 2026-08-26)
        status() { return API.get('/api/relay/status'); },
        bindToken(userLabel) { return API.post('/api/relay/bind-token', { user_label: userLabel || 'admin' }); },
        test() { return API.post('/api/relay/test', {}); },
    },

    // Notifications / Push
    notifications: {
        status() { return API.get('/api/notifications/status'); },
        vapidKey() { return API.get('/api/notifications/vapid-public-key'); },
        subscribe(sub) { return API.post('/api/notifications/subscribe', sub); },
        unsubscribe(endpoint) { return API.post('/api/notifications/unsubscribe', { endpoint }); },
        subscriptions() { return API.get('/api/notifications/subscriptions'); },
        test(title, body) { return API.post('/api/notifications/test', { title, body }); },
        getVaccineSetting() { return API.get('/api/notifications/vaccine-notification-setting'); },
        setVaccineSetting(enabled) { return API.put('/api/notifications/vaccine-notification-setting', { enabled }); },
        // General settings
        getSettings() { return API.get('/api/notifications/settings'); },
        setSettings(settings) { return API.put('/api/notifications/settings', { settings }); },
        getCareStatus() { return API.get('/api/notifications/care-status'); },
        // History + dismiss
        getHistory() { return API.get('/api/notifications/history'); },
        dismissAlert(payload) { return API.post('/api/notifications/dismiss', payload); },
        getDismissed() { return API.get('/api/notifications/dismissed'); },
    },

    // Snapshots
    snapshots: {
        config() { return API.get('/api/snapshots/config'); },
        updateConfig(d) { return API.put('/api/snapshots/config', d); },
        cleanup() { return API.post('/api/snapshots/cleanup'); },
        storage() { return API.get('/api/snapshots/storage'); },
    },

    // AI Logic
    ai_logic: {
        list() { return API.get('/api/ai-logic/rules'); },
        get(id) { return API.get(`/api/ai-logic/rules/${id}`); },
        create(d) { return API.post('/api/ai-logic/rules', d); },
        update(id, d) { return API.put(`/api/ai-logic/rules/${id}`, d); },
        del(id) { return API.del(`/api/ai-logic/rules/${id}`); },
        execute(id) { return API.post(`/api/ai-logic/rules/${id}/execute`); },
        toggle(id, enabled) { return API.post(`/api/ai-logic/rules/${id}/toggle`, { enabled }); },
        countTest(d) { return API.post('/api/ai-logic/count-test', d); },
    },

    // Cameras
    cameras: {
        list() { return API.get('/api/cameras'); },
        statusAll() { return API.get('/api/cameras/status/all'); },
        get(id) { return API.get(`/api/cameras/${id}`); },
        create(data) { return API.post('/api/cameras', data); },
        update(id, d) { return API.put(`/api/cameras/${id}`, d); },
        delete(id) { return API.del(`/api/cameras/${id}`); },
        status(id) { return API.get(`/api/cameras/${id}/status`); },
        start(id) { return API.post(`/api/cameras/${id}/start`); },
        stop(id) { return API.post(`/api/cameras/${id}/stop`); },
        test(id) { return API.get(`/api/cameras/${id}/test`); },
        ptz: {
            move(id, dir, speed) { return API.post(`/api/cameras/${id}/ptz/move`, { direction: dir, speed: speed || 6 }); },
            stop(id) { return API.post(`/api/cameras/${id}/ptz/stop`); },
        },
        // Presets (system 1 - config-based)
        presets: {
            list(cameraId) { return API.get(`/api/cameras/${cameraId}/ptz/presets`); },
            set(cameraId, presetNumber, name) { return API.post(`/api/cameras/${cameraId}/ptz/presets/${presetNumber}/set`, { name }); },
            goto(cameraId, presetNumber) { return API.post(`/api/cameras/${cameraId}/ptz/presets/${presetNumber}/goto`); },
            delete(cameraId, presetNumber) { return API.del(`/api/cameras/${cameraId}/ptz/presets/${presetNumber}`); },
        },
    },

    // Recording
    recording: {
        start(id) { return API.post(`/api/recording/start/${id}`); },
        stop(id) { return API.post(`/api/recording/stop/${id}`); },
        startAll() { return API.post('/api/recording/start-all'); },
        stopAll() { return API.post('/api/recording/stop-all'); },
        status() { return API.get('/api/recording/status'); },
    },

    // ML Training
    ml_training: {
        status() { return API.get('/api/ml/training/status'); },
        export() { return API.post('/api/ml/training/export'); },
        train(config) { return API.post('/api/ml/training/train', config); },
        modelInfo() { return API.get('/api/ml/training/model'); },
    },

    // Density counting (HSV-based, no ML)
    density: {
        count(data) { return API.post('/api/density/count', data); },
        calibrate(data) { return API.post('/api/density/calibrate', data); },
    },

    // AI Detection (YOLO-based)
    ai: {
        detect(data) { return API.post('/api/ai/detect', data); },
        getStatus() { return API.get('/api/ai/detect/status'); },
        loadModel(modelPath) { return API.post('/api/ai/detect/load-model', { model_path: modelPath }); },
    },

    // AI Chat
    chat: {
        query(message, model, conversationId) {
            return API.post('/api/chat/query', { message, model: model || 'MiniMax-M2.7', conversation_id: conversationId });
        },
        getConversation(id) { return API.get(`/api/chat/conversation/${id}`); },
        clearConversation(id) { return API.del(`/api/chat/conversation/${id}`); },
        reportIssue(data) { return API.post('/api/chat/report-issue', data); },
    },

    // ML Dataset
    ml_dataset: {
        images(status) {
            const url = status ? `/api/ml/dataset/images?status=${status}` : '/api/ml/dataset/images';
            return API.get(url);
        },
        getImage(id) { return API.get(`/api/ml/dataset/images/${id}`); },
        upload(formData) { return fetch('/api/ml/dataset/upload', { method: 'POST', body: formData }); },
        uploadBatch(formData) { return fetch('/api/ml/dataset/upload-batch', { method: 'POST', body: formData }); },
        addLabel(imageId, label) { return API.post(`/api/ml/dataset/images/${imageId}/labels`, label); },
        addLabelsBulk(imageId, labels) { return API.post(`/api/ml/dataset/images/${imageId}/labels-bulk`, labels); },
        deleteLabel(imageId, labelId) { return API.del(`/api/ml/dataset/images/${imageId}/labels/${labelId}`); },
        updateStatus(imageId, status) { return API.post(`/api/ml/dataset/images/${imageId}/status`, { status }); },
        deleteImage(id) { return API.del(`/api/ml/dataset/images/${id}`); },
        export() { return fetch('/api/ml/dataset/export'); },
        stats() { return API.get('/api/ml/dataset/stats'); },
    },

    // Luxpower inverter telemetry (Phase 1: read-only monitoring)
    inverter: {
        current() { return API.get('/api/inverter/current'); },
        history(hours = 24, bucket = 'auto') {
            return API.get(`/api/inverter/history?hours=${hours}&bucket=${bucket}`);
        },
        status() { return API.get('/api/inverter/status'); },
    },

    // Security / Anti-theft (Phase 1: motion-triggered YOLOv8n person detection)
    security: {
        status() { return API.get('/api/security/status'); },
        zones() { return API.get('/api/security/zones'); },
        createZone(d) { return API.post('/api/security/zones', d); },
        updateZone(id, d) { return API.put(`/api/security/zones/${id}`, d); },
        deleteZone(id) { return API.del(`/api/security/zones/${id}`); },
        arm(id) { return API.post(`/api/security/zones/${id}/arm`); },
        disarm(id) { return API.post(`/api/security/zones/${id}/disarm`); },
        events(opts = {}) {
            const p = new URLSearchParams();
            if (opts.limit) p.set('limit', opts.limit);
            if (opts.camera_id) p.set('camera_id', opts.camera_id);
            if (opts.since) p.set('since', opts.since);
            if (opts.acknowledged !== undefined && opts.acknowledged !== null) {
                p.set('acknowledged', String(opts.acknowledged));
            }
            const q = p.toString();
            return API.get('/api/security/events' + (q ? '?' + q : ''));
        },
        ackEvent(id) { return API.post(`/api/security/events/${id}/ack`); },
        unackEvent(id) { return API.post(`/api/security/events/${id}/unack`); },
        testAlert(id) { return API.post(`/api/security/test-alert/${id}`); },
    },
};
