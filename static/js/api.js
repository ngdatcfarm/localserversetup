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

    // Relay
    relay: {
        send(d) { return API.post('/api/iot/relay', d); },
        timed(d) { return API.post('/api/iot/relay/timed', d); },
    },
};
