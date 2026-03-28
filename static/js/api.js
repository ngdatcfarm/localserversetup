/**
 * CFarm API Client
 */
const API = {
    async request(method, url, data = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (data) opts.body = JSON.stringify(data);
        const res = await fetch(url, opts);
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

    // Barns
    barns: {
        list() { return API.get('/api/farm/barns'); },
        get(id) { return API.get(`/api/farm/barns/${id}`); },
        create(d) { return API.post('/api/farm/barns', d); },
        update(id, d) { return API.put(`/api/farm/barns/${id}`, d); },
        del(id) { return API.del(`/api/farm/barns/${id}`); },
    },

    // Cycles
    cycles: {
        list(barnId) { return API.get(`/api/farm/cycles${barnId ? '?barn_id=' + barnId : ''}`); },
        get(id) { return API.get(`/api/farm/cycles/${id}`); },
        create(d) { return API.post('/api/farm/cycles', d); },
        update(id, d) { return API.put(`/api/farm/cycles/${id}`, d); },
        close(id, d) { return API.post(`/api/farm/cycles/${id}/close`, d); },
        dashboard(id) { return API.get(`/api/farm/cycles/${id}/dashboard`); },
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
    inventory: {
        list(whId) { return API.get(`/api/farm/inventory/${whId}`); },
        import(d) { return API.post('/api/farm/inventory/import', d); },
        export(d) { return API.post('/api/farm/inventory/export', d); },
        transfer(d) { return API.post('/api/farm/inventory/transfer', d); },
        transactions(whId) { return API.get(`/api/farm/inventory/${whId}/transactions`); },
    },

    // Care
    care: {
        logFeed(d) { return API.post('/api/farm/care/feed', d); },
        feedHistory(cycleId) { return API.get(`/api/farm/care/feed/${cycleId}`); },
        logDeath(d) { return API.post('/api/farm/care/death', d); },
        deathHistory(cycleId) { return API.get(`/api/farm/care/death/${cycleId}`); },
        logMedication(d) { return API.post('/api/farm/care/medication', d); },
        medHistory(cycleId) { return API.get(`/api/farm/care/medication/${cycleId}`); },
        logWeight(d) { return API.post('/api/farm/care/weight', d); },
        weightHistory(cycleId) { return API.get(`/api/farm/care/weight/${cycleId}`); },
        logSale(d) { return API.post('/api/farm/care/sale', d); },
        saleHistory(cycleId) { return API.get(`/api/farm/care/sale/${cycleId}`); },
    },

    // Sensors
    sensors: {
        latest() { return API.get('/api/sensors/latest'); },
        history(deviceId, type, hours) { return API.get(`/api/sensors/history?device_id=${deviceId}&sensor_type=${type}&hours=${hours || 24}`); },
        barnSummary(barnId) { return API.get(`/api/sensors/barn/${barnId}`); },
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
        list() { return API.get('/api/farm/feed-brands'); },
        get(id) { return API.get(`/api/farm/feed-brands/${id}`); },
        create(d) { return API.post('/api/farm/feed-brands', d); },
        update(id, d) { return API.put(`/api/farm/feed-brands/${id}`, d); },
        del(id) { return API.del(`/api/farm/feed-brands/${id}`); },
    },
    feedTypes: {
        list(brandId) { return API.get(`/api/farm/feed-types${brandId ? '?brand_id=' + brandId : ''}`); },
        get(id) { return API.get(`/api/farm/feed-types/${id}`); },
        create(d) { return API.post('/api/farm/feed-types', d); },
        update(id, d) { return API.put(`/api/farm/feed-types/${id}`, d); },
        del(id) { return API.del(`/api/farm/feed-types/${id}`); },
    },

    // Medications
    medications: {
        list(cat) { return API.get(`/api/farm/medications${cat ? '?category=' + cat : ''}`); },
        get(id) { return API.get(`/api/farm/medications/${id}`); },
        create(d) { return API.post('/api/farm/medications', d); },
        update(id, d) { return API.put(`/api/farm/medications/${id}`, d); },
        del(id) { return API.del(`/api/farm/medications/${id}`); },
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
        queue(limit) { return API.get(`/api/sync/queue?limit=${limit || 50}`); },
        logs(limit) { return API.get(`/api/sync/logs?limit=${limit || 20}`); },
    },

    // Relay
    relay: {
        send(d) { return API.post('/api/iot/relay', d); },
        timed(d) { return API.post('/api/iot/relay/timed', d); },
    },

    // Cameras
    cameras: {
        list() { return API.get('/api/cameras'); },
        statusAll() { return API.get('/api/cameras/status/all'); },
        get(id) { return API.get(`/api/cameras/${id}`); },
        status(id) { return API.get(`/api/cameras/${id}/status`); },
        start(id) { return API.post(`/api/cameras/${id}/start`); },
        stop(id) { return API.post(`/api/cameras/${id}/stop`); },
        test(id) { return API.get(`/api/cameras/${id}/test`); },
        ptz: {
            move(id, dir, speed) { return API.post(`/api/cameras/${id}/ptz/move`, { direction: dir, speed: speed || 6 }); },
            stop(id) { return API.post(`/api/cameras/${id}/ptz/stop`); },
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
};
