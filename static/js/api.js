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
        list(ack, barnId) {
            const params = [];
            if (ack !== undefined) params.push('acknowledged=' + ack);
            if (barnId) params.push('barn_id=' + barnId);
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
        alertRules(params) { return API.get('/api/farm/inventory/alerts/rules', params); },
        createAlertRule(d) { return API.post('/api/farm/inventory/alerts/rules', d); },
        getAlertRule(id) { return API.get(`/api/farm/inventory/alerts/rules/${id}`); },
        updateAlertRule(id, d) { return API.put(`/api/farm/inventory/alerts/rules/${id}`, d); },
        deleteAlertRule(id) { return API.del(`/api/farm/inventory/alerts/rules/${id}`); },
        toggleAlertRule(id, enabled) { return API.post(`/api/farm/inventory/alerts/rules/${id}/toggle`, { enabled }); },
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
        // Water logs
        logWater(d) { return API.post('/api/farm/care/water', d); },
        waterHistory(cycleId) { return API.get(`/api/farm/care/water/${cycleId}`); },
        // Health notes
        logHealth(d) { return API.post('/api/farm/care/health', d); },
        healthHistory(cycleId) { return API.get(`/api/farm/care/health/${cycleId}`); },
        resolveHealth(noteId) { return API.post(`/api/farm/care/health/${noteId}/resolve`); },
        // DELETE methods (using API.del)
    },

    // Sensors
    sensors: {
        latest(params) { return API.get('/api/sensors/latest' + (params || '')); },
        history(deviceId, type, hours) { return API.get(`/api/sensors/history/${deviceId}/${type}?hours=${hours || 24}`); },
        hourly(deviceId, type, hours) { return API.get(`/api/sensors/hourly/${deviceId}/${type}?hours=${hours || 24}`); },
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
    },

    // Sensor Alert Rules
    sensorAlerts: {
        rules: {
            list(barnId) { return API.get(`/api/alerts/rules${barnId ? '?barn_id=' + barnId : ''}`); },
            get(id) { return API.get(`/api/alerts/rules/${id}`); },
            create(d) { return API.post('/api/alerts/rules', d); },
            update(id, d) { return API.put(`/api/alerts/rules/${id}`, d); },
            delete(id) { return API.del(`/api/alerts/rules/${id}`); },
        },
        // Alerts (triggered)
        list(acknowledged, barnId) {
            let url = '/api/alerts';
            const params = [];
            if (acknowledged !== undefined) params.push('acknowledged=' + acknowledged);
            if (barnId) params.push('barn_id=' + barnId);
            if (params.length) url += '?' + params.join('&');
            return API.get(url);
        },
        active(barnId) { return API.get('/api/alerts/active' + (barnId ? '?barn_id=' + barnId : '')); },
        ack(id) { return API.post(`/api/alerts/${id}/acknowledge`); },
        ackAll(barnId) { return API.post('/api/alerts/acknowledge-all' + (barnId ? '?barn_id=' + barnId : '')); },
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
};
