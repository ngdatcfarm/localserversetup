# CFarm Local Server - API Map

**Server:** `http://192.168.1.9:8000`
**Version:** 0.10.0
**Database:** TimescaleDB (PostgreSQL) on `localhost:5432`

---

## Table of Contents

1. [Router Registration](#1-router-registration)
2. [HTML Pages (Templates)](#2-html-pages-templates)
3. [API Routes by Router](#3-api-routes-by-router)
   - [Farm](#farm-router--apifarm)
   - [Farm Extended](#farm_extended-router--apifarm)
   - [Devices](#devices-router--apidevices)
   - [IoT](#iot-router--apiiot)
   - [Sensors](#sensors-router--apisensors)
   - [Automation](#automation-router--api)
   - [Firmware](#firmware-router--apifirmware)
   - [Notifications](#notifications-router--apinotifications)
   - [Cameras](#cameras-router--apicameras)
   - [PTZ](#ptz-router--apicameras)
   - [Recording](#recording-router--apirecording)
   - [Database](#database-router--apidb)
   - [Sync](#sync-router--apisync)
4. [Vue SPA Routes](#4-vue-spa-routes)
5. [Cloud Sync API](#5-cloud-sync-api)
6. [MQTT Topics](#6-mqtt-topics)

---

## 1. Router Registration

All routers are registered in `src/server/main.py`:

```python
app.include_router(cameras_router)        # prefix: /api/cameras
app.include_router(ptz_router)             # prefix: /api/cameras (shared)
app.include_router(sync_router)            # prefix: /api/sync
app.include_router(stream_router)          # MJPEG video streams
app.include_router(recording_router)       # prefix: /api/recording
app.include_router(iot_router)             # prefix: /api/iot
app.include_router(devices_router)        # prefix: /api/devices
app.include_router(sensors_router)         # prefix: /api/sensors
app.include_router(automation_router)      # prefix: /api
app.include_router(firmware_router)        # prefix: /api/firmware
app.include_router(farm_router)            # prefix: /api/farm
app.include_router(farm_extended_router)   # prefix: /api/farm
app.include_router(notifications_router)   # prefix: /api/notifications
app.include_router(database_router)        # prefix: /api/db
```

---

## 2. HTML Pages (Templates)

Served as static HTML, **NOT** part of the Vue SPA.

| Route | Template File | Description |
|-------|--------------|-------------|
| `GET /` | `farm.html` | Main Vue 3 SPA (hash history router) |
| `GET /iot` | `iot.html` | Standalone IoT page (firmware, devices, types) |
| `GET /recordings` | `recordings.html` | Recording browser page |
| `GET /database` | `database.html` | pgAdmin-style database manager |

---

## 3. API Routes by Router

### Farm Router → `/api/farm`

**File:** `src/server/routes/farm.py`

#### Barns
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/farm/barns` | List all barns |
| POST | `/api/farm/barns` | Create a new barn |
| GET | `/api/farm/barns/{barn_id}` | Get barn summary |
| PUT | `/api/farm/barns/{barn_id}` | Update barn |

#### Cycles
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/farm/cycles` | List cycles (filter: `barn_id`, `status`) |
| POST | `/api/farm/cycles` | Create a new cycle |
| GET | `/api/farm/cycles/{cycle_id}` | Get cycle details |
| GET | `/api/farm/cycles/{cycle_id}/dashboard` | Get cycle dashboard with KPIs |
| PUT | `/api/farm/cycles/{cycle_id}` | Update cycle |
| POST | `/api/farm/cycles/{cycle_id}/close` | Close a cycle |
| GET | `/api/farm/cycles/{cycle_id}/snapshots` | Get daily snapshots |

#### Inventory (Kho)
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/farm/warehouses` | List warehouses |
| POST | `/api/farm/warehouses` | Create warehouse |
| GET | `/api/farm/products` | List products |
| POST | `/api/farm/products` | Create product |
| GET | `/api/farm/inventory` | Get stock levels |
| POST | `/api/farm/inventory/import` | Import stock |
| POST | `/api/farm/inventory/export` | Export stock |
| POST | `/api/farm/inventory/transfer` | Transfer between warehouses |
| GET | `/api/farm/inventory/transactions` | Get transactions |

#### Care: Feed (Cho ăn)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/farm/care/feed` | Log feed |
| GET | `/api/farm/care/feed/{cycle_id}` | Get feed logs |
| GET | `/api/farm/care/feed/{cycle_id}/daily` | Get daily feed summary |

#### Care: Mortality (Tử vong)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/farm/care/death` | Log deaths |
| GET | `/api/farm/care/death/{cycle_id}` | Get death logs |
| GET | `/api/farm/care/death/{cycle_id}/daily` | Get daily death summary |

#### Care: Medication (Thuốc/Vaccine)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/farm/care/medication` | Log medication |
| GET | `/api/farm/care/medication/{cycle_id}` | Get medication logs |

#### Care: Weight (Cân trọng lượng)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/farm/care/weight` | Log weight |
| GET | `/api/farm/care/weight/{cycle_id}` | Get weight logs |
| GET | `/api/farm/care/weight/reminders` | Get weight reminders |
| PUT | `/api/farm/care/weight/reminders/{cycle_id}` | Update weight reminder |

#### Care: Sales (Xuất bán)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/farm/care/sale` | Log sale |
| GET | `/api/farm/care/sale/{cycle_id}` | Get sales logs |

---

### Farm Extended Router → `/api/farm`

**File:** `src/server/routes/farm_extended.py`

#### Feed Brands
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/farm/feed-brands` | List feed brands |
| POST | `/api/farm/feed-brands` | Create feed brand |
| GET | `/api/farm/feed-brands/{brand_id}` | Get feed brand |
| PUT | `/api/farm/feed-brands/{brand_id}` | Update feed brand |
| DELETE | `/api/farm/feed-brands/{brand_id}` | Delete feed brand |

#### Feed Types
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/farm/feed-types` | List feed types |
| POST | `/api/farm/feed-types` | Create feed type |
| GET | `/api/farm/feed-types/{type_id}` | Get feed type |
| PUT | `/api/farm/feed-types/{type_id}` | Update feed type |
| DELETE | `/api/farm/feed-types/{type_id}` | Delete feed type |

#### Medications
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/farm/medications` | List medications |
| POST | `/api/farm/medications` | Create medication |
| GET | `/api/farm/medications/{med_id}` | Get medication |
| PUT | `/api/farm/medications/{med_id}` | Update medication |
| DELETE | `/api/farm/medications/{med_id}` | Delete medication |

#### Suppliers
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/farm/suppliers` | List suppliers |
| POST | `/api/farm/suppliers` | Create supplier |
| GET | `/api/farm/suppliers/{supplier_id}` | Get supplier |
| PUT | `/api/farm/suppliers/{supplier_id}` | Update supplier |
| DELETE | `/api/farm/suppliers/{supplier_id}` | Delete supplier |

#### Vaccine Programs
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/farm/vaccine-programs` | List vaccine programs |
| POST | `/api/farm/vaccine-programs` | Create vaccine program |
| GET | `/api/farm/vaccine-programs/{program_id}` | Get vaccine program |
| PUT | `/api/farm/vaccine-programs/{program_id}` | Update vaccine program |
| DELETE | `/api/farm/vaccine-programs/{program_id}` | Delete vaccine program |
| POST | `/api/farm/vaccine-programs/{program_id}/items` | Add program item |
| PUT | `/api/farm/vaccine-programs/items/{item_id}` | Update program item |
| DELETE | `/api/farm/vaccine-programs/items/{item_id}` | Delete program item |

#### Vaccine Schedules
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/farm/vaccine-schedules` | List schedules (`cycle_id` required) |
| GET | `/api/farm/vaccine-schedules/upcoming` | Get upcoming vaccines |
| POST | `/api/farm/vaccine-schedules` | Create vaccine schedule |
| POST | `/api/farm/vaccine-schedules/apply-program` | Apply program to cycle |
| POST | `/api/farm/vaccine-schedules/{schedule_id}/done` | Mark vaccine done |
| POST | `/api/farm/vaccine-schedules/{schedule_id}/skip` | Skip vaccine |
| DELETE | `/api/farm/vaccine-schedules/{schedule_id}` | Delete schedule |

#### Health Notes
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/farm/health-notes` | List health notes (`cycle_id` required) |
| POST | `/api/farm/health-notes` | Create health note |
| POST | `/api/farm/health-notes/{note_id}/resolve` | Resolve health note |
| DELETE | `/api/farm/health-notes/{note_id}` | Delete health note |

#### Weight Sessions
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/farm/weight-sessions` | List weight sessions (`cycle_id` required) |
| POST | `/api/farm/weight-sessions` | Create weight session |
| GET | `/api/farm/weight-sessions/{session_id}` | Get weight session |
| DELETE | `/api/farm/weight-sessions/{session_id}` | Delete weight session |

---

### Devices Router → `/api/devices`

**File:** `src/server/routes/devices.py`

#### Device Types
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/devices/types` | List device types |
| POST | `/api/devices/types` | Create device type |
| GET | `/api/devices/types/{type_id}` | Get device type |
| PUT | `/api/devices/types/{type_id}` | Update device type |
| DELETE | `/api/devices/types/{type_id}` | Delete device type |

#### Devices
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/devices` | List all devices (filter: `barn_id`) |
| POST | `/api/devices` | Register new device |
| GET | `/api/devices/{device_id}` | Get device details |
| PUT | `/api/devices/{device_id}` | Update device |
| DELETE | `/api/devices/{device_id}` | Delete device |
| POST | `/api/devices/{device_id}/test` | Send test/ping command |
| POST | `/api/devices/ping/{device_code}` | Ping by device code |

#### Channels
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/devices/{device_id}/channels` | Get device channels |
| PUT | `/api/devices/{device_id}/channels` | Set device channels |

#### Device States
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/devices/{device_id}/states` | Get current state of all channels |

---

### IoT Router → `/api/iot`

**File:** `src/server/routes/iot.py`

#### MQTT Status
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/iot/mqtt/status` | Get MQTT connection status |

#### Curtains
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/iot/curtains` | List all curtains |
| GET | `/api/iot/curtains/{curtain_id}` | Get curtain status |
| POST | `/api/iot/curtains` | Add new curtain |
| PUT | `/api/iot/curtains/{curtain_id}` | Update curtain |
| DELETE | `/api/iot/curtains/{curtain_id}` | Delete curtain |
| POST | `/api/iot/curtains/{curtain_id}/move` | Move to position (0-100%) |
| POST | `/api/iot/curtains/{curtain_id}/stop` | Stop curtain |

#### Direct Relay Control
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/iot/relay` | Send relay command via MQTT |

#### Command History
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/iot/commands/{device_id}` | Get recent commands for device |

---

### Sensors Router → `/api/sensors`

**File:** `src/server/routes/sensors.py`

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/sensors/latest` | Get latest readings (filter: `device_id`, `barn_id`, `sensor_type`) |
| GET | `/api/sensors/history/{device_id}/{sensor_type}` | Get raw sensor history |
| GET | `/api/sensors/hourly/{device_id}/{sensor_type}` | Get hourly aggregated data |
| GET | `/api/sensors/barn/{barn_id}` | Get barn sensor summary |

---

### Automation Router → `/api`

**File:** `src/server/routes/automation.py`

#### Automation Rules
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/automation/rules` | List automation rules (filter: `device_id`) |
| POST | `/api/automation/rules` | Create automation rule |
| GET | `/api/automation/rules/{rule_id}` | Get automation rule |
| PUT | `/api/automation/rules/{rule_id}` | Update automation rule |
| DELETE | `/api/automation/rules/{rule_id}` | Delete automation rule |
| POST | `/api/automation/rules/{rule_id}/toggle` | Toggle rule enabled/disabled |

#### Timed Relay
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/iot/relay/timed` | Turn relay ON for N seconds, then auto OFF |

#### Alert Rules
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/alerts/rules` | List alert rules (filter: `barn_id`) |
| POST | `/api/alerts/rules` | Create alert rule |
| PUT | `/api/alerts/rules/{rule_id}` | Update alert rule |
| DELETE | `/api/alerts/rules/{rule_id}` | Delete alert rule |

#### Alerts
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/alerts` | List alerts (filter: `acknowledged`, `barn_id`, `limit`) |
| GET | `/api/alerts/active` | List unacknowledged alerts |
| POST | `/api/alerts/{alert_id}/acknowledge` | Acknowledge alert |
| POST | `/api/alerts/acknowledge-all` | Acknowledge all alerts |

---

### Firmware Router → `/api/firmware`

**File:** `src/server/routes/firmware.py`

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/firmware` | List all firmwares (filter: `device_type_code`) |
| GET | `/api/firmware/latest/{device_type_code}` | Get latest firmware for type |
| GET | `/api/firmware/default/{device_type_code}` | Get default (mother) firmware for type |
| GET | `/api/firmware/mother/{device_type_code}` | Get mother firmware for type |
| GET | `/api/firmware/mother-sources` | List mother firmware source files |
| GET | `/api/firmware/mother-source/{folder_name}` | Get full .ino source content |
| POST | `/api/firmware/set-mother/{firmware_id}` | Set firmware as mother |
| POST | `/api/firmware/upload` | Upload firmware binary |
| GET | `/api/firmware/download/{firmware_id}` | Download firmware binary |
| POST | `/api/firmware/ota/{device_id}` | Trigger OTA update on device |
| DELETE | `/api/firmware/{firmware_id}` | Delete firmware |
| GET | `/api/firmware/generate/{device_id}` | Generate customized firmware source for device |

---

### Notifications Router → `/api/notifications`

**File:** `src/server/routes/notifications.py`

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/notifications/vapid-public-key` | Get VAPID public key |
| GET | `/api/notifications/status` | Check push notification status |
| POST | `/api/notifications/subscribe` | Register push subscription |
| POST | `/api/notifications/unsubscribe` | Remove push subscription |
| GET | `/api/notifications/subscriptions` | List all active subscriptions |
| POST | `/api/notifications/test` | Send test notification to all |

---

### Cameras Router → `/api/cameras`

**File:** `src/server/routes/cameras.py`

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/cameras` | List all cameras |
| GET | `/api/cameras/status/all` | Get status of all cameras |
| GET | `/api/cameras/{camera_id}` | Get single camera |
| POST | `/api/cameras` | Add new camera |
| PUT | `/api/cameras/{camera_id}` | Update camera |
| DELETE | `/api/cameras/{camera_id}` | Delete camera |
| GET | `/api/cameras/{camera_id}/status` | Get camera status |
| POST | `/api/cameras/{camera_id}/start` | Start camera stream |
| POST | `/api/cameras/{camera_id}/stop` | Stop camera stream |
| GET | `/api/cameras/{camera_id}/test` | Test camera connection |

### PTZ Router → `/api/cameras`

**File:** `src/server/routes/ptz.py` (shares `/api/cameras` prefix)

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/cameras/{camera_id}/ptz/move` | Start PTZ movement |
| POST | `/api/cameras/{camera_id}/ptz/stop` | Stop PTZ movement |
| GET | `/api/cameras/{camera_id}/ptz/presets` | List presets |
| POST | `/api/cameras/{camera_id}/ptz/presets/{preset_number}/set` | Save preset |
| POST | `/api/cameras/{camera_id}/ptz/presets/{preset_number}/goto` | Go to preset |
| DELETE | `/api/cameras/{camera_id}/ptz/presets/{preset_number}` | Delete preset |
| GET | `/api/cameras/{camera_id}/ptz/position` | Get relative pan/tilt position |
| POST | `/api/cameras/{camera_id}/ptz/tare` | Set current position as origin |

---

### Recording Router → `/api/recording`

**File:** `src/server/routes/recording.py`

#### Recording Control
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/recording/start/{camera_id}` | Start recording |
| POST | `/api/recording/stop/{camera_id}` | Stop recording |
| POST | `/api/recording/start-all` | Start all cameras |
| POST | `/api/recording/stop-all` | Stop all recordings |

#### Recording Status
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/recording/status/{camera_id}` | Get recording status |
| GET | `/api/recording/status` | Get all recording statuses |

#### Settings
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/recording/settings` | Get recording settings |
| PUT | `/api/recording/settings` | Update recording settings |

#### Recordings Browser
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/recording/files` | List recordings (filter: `camera_id`, `date`) |
| GET | `/api/recording/dates` | List available recording dates |
| GET | `/api/recording/play/{camera_id}/{date}/{filename}` | Stream recorded video |
| DELETE | `/api/recording/files/{camera_id}/{date}/{filename}` | Delete recording file |
| DELETE | `/api/recording/files/{camera_id}/{date}` | Delete all recordings for date |

---

### Database Router → `/api/db`

**File:** `src/server/routes/database.py`

#### Tables
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/db/tables` | List all tables |
| GET | `/api/db/tables/grouped` | List tables grouped by functionality |
| GET | `/api/db/tables/{table_name}` | Get table schema + data (paginated) |
| GET | `/api/db/tables/{table_name}/schema` | Get table schema (columns, indexes, FKs) |

#### Query
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/db/query` | Execute raw SQL (SELECT only) |

#### Database
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/db/databases` | List all databases |
| GET | `/api/db/status` | Get DB status and stats |

#### Migrations
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/db/migrate` | Run migrations |
| POST | `/api/db/fix-sync` | Fix sync compatibility columns |

---

### Sync Router → `/api/sync`

**File:** `src/server/routes/sync.py`

#### Sync Status & Config
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/sync/status` | Get sync status and stats |
| GET | `/api/sync/config` | Get sync configuration (tokens masked) |
| POST | `/api/sync/config` | Update sync configuration |
| POST | `/api/sync/now` | Trigger immediate sync |
| POST | `/api/sync/full-sync` | Trigger full sync |

#### Cloud → Local
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/sync/receive` | Receive changes from cloud (Bearer token auth) |
| POST | `/api/sync/command` | Execute remote command from cloud (Bearer token auth) |

#### Debugging
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/sync/queue` | View pending sync queue |
| GET | `/api/sync/logs` | Get recent sync logs |

---

## 4. Vue SPA Routes

**File:** `static/js/app.js` (Vue 3 + Vue Router, hash history)

The main SPA (`/`) serves `farm.html` which loads this router. All routes use `#/` prefix.

| Path | Component | Description |
|------|-----------|-------------|
| `/#/` | Dashboard | Main dashboard |
| `/#/barns` | Barns | Farm barns management |
| `/#/barns/:id` | BarnDetail | Barn detail + cycles |
| `/#/cycles` | Cycles | All cycles list |
| `/#/cycles/:id` | CycleDetail | Cycle detail + care logs |
| `/#/devices` | Devices | IoT device management |
| `/#/sensors` | Sensors | Sensor readings |
| `/#/cameras` | Cameras | Camera management |
| `/#/automations` | Automations | Automation rules |
| `/#/alerts` | Alerts | Alert management |
| `/#/reports` | Reports | Reports |
| `/#/settings` | Settings | Settings |
| `/#/notifications` | Notifications | Push notifications |

**External Links (no hash):**
| Route | Target | Description |
|-------|--------|-------------|
| `/recordings` | `recordings.html` | Recording browser |
| `/database` | `database.html` | Database manager |

---

## 5. Cloud Sync API

Cloud (`app.cfarm.vn`) calls these local endpoints to sync data.

### Local → Cloud (Local pushes)

Sync service calls cloud API endpoints:

| Cloud Endpoint | Method | Description |
|----------------|--------|-------------|
| `/api/sync/device-states` | POST | Push device states |
| `/api/sync/sensor-data` | POST | Push sensor readings |
| `/api/sync/sync-log` | POST | Push sync log entry |

### Cloud → Local (Cloud pushes)

| Local Endpoint | Method | Auth | Description |
|----------------|--------|------|-------------|
| `/api/sync/receive` | POST | Bearer token | Cloud pushes config/data changes |
| `/api/sync/command` | POST | Bearer token | Cloud sends relay/curtain commands |

---

## 6. MQTT Topics

**Local Broker:** `192.168.1.9:1883` (Mosquitto)
**Cloud Broker:** `103.166.183.215:1883` (Mosquitto)

### ESP32 → Server (Publish)
| Topic | Payload | Broker |
|-------|---------|--------|
| `cfarm/{device_code}/heartbeat` | `{"code","rssi","uptime","heap"}` | Local |
| `cfarm/{device_code}/ack` | ACK response | Local |
| `cfarm.vn/{device_code}/heartbeat` | same as above | Cloud |

### Server → ESP32 (Subscribe)
| Topic | Payload | Broker |
|-------|---------|--------|
| `cfarm/{device_code}/cmd` | `{"action":"relay\|all\|ping\|ota",...}` | Local |
| `cfarm/{device_code}/ota` | `{"action":"ota","url",...}` | Local |
| `cfarm.vn/{device_code}/cmd` | same as local | Cloud |

### ESP32 Cloud → Local (via cloud broker)
Cloud sends to ESP32 at `cfarm.vn/{device_code}/cmd`; ESP32 subscribes and responds via cloud ack topic.

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Total API Routers | 13 |
| Total API Endpoints | ~180+ |
| HTML Pages | 4 |
| Vue SPA Routes | 14 |
| MQTT Topics | 6 |
| Database Tables | 60+ |
