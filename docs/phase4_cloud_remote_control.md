# Phase 4: Cloud Remote Control Architecture

## Current State

### Local Server (cfarm - C:\Local server)
- SQLite database (master data)
- MQTT broker on `192.168.1.9:1884`
- ESP32 devices with dual-subscribe firmware
- Syncs to cloud via `/api/sync/*`

### Cloud Server (cfarm.vn - app.cfarm.vn)
- MySQL database (`cfarm_app_raw`)
- MQTT broker on `103.166.183.215:1883` (cfarm.vn prefix)
- Web Push notifications (VAPID keys configured)
- DirectCommandController for relay control
- **Problem: `devices` table is EMPTY**

### ESP32 Firmware (Dual-Subscribe)
```
Subscribes:
  - cfarm/{device_code}/cmd (Local MQTT - priority)
  - cfarm.vn/{device_code}/cmd (Cloud MQTT - fallback)

Local lock: 30 seconds priority lock after local command
```

---

## Problem Statement

1. **Cloud cannot control relays** - `DirectCommandController` checks if device exists in DB before sending command → returns 404
2. **Cloud has no device list** - `devices` table on cloud is empty
3. **No bidirectional sync** - Local only pushes changes, cloud doesn't maintain device inventory
4. **Push notifications** - Local generates alerts but cloud cannot send push (or vice versa)

---

## Proposed Solution (Hướng B)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  iPhone Safari                                                   │
│  ↕ HTTPS (Cloudflare SSL - trusted)                             │
└─────────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────────┐
│  CLOUD (cfarm.vn)                                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Push Notif       │  │ DirectCommand    │  │ ENV API      │  │
│  │ (Web Push/VAPID) │  │ (MQTT out only)  │  │ (read-only)  │  │
│  └──────────────────┘  └──────────────────┘  └───────────────┘  │
│         ↕                    ↕                      ↕           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ push_subscriptions│ │ MqttService      │  │ Sync API     │  │
│  │ table            │  │ (cfarm.vn prefix) │  │ (receive)    │  │
│  └──────────────────┘  └──────────────────┘  └───────────────┘  │
│                                                            ↕   │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ MySQL: devices, sensor_data, push_subscriptions     │     │
│  │ LOCAL_TOKEN: cfarm-local-sync-token                  │     │
│  └──────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
              ↕ sync devices                          ↕ MQTT
              ↓                                       ↓
┌──────────────────────────────┐    ┌──────────────────────────────┐
│  LOCAL SERVER (cfarm)        │    │  ESP32 Devices               │
│  - SQLite (master)           │    │  - Dual-subscribe firmware   │
│  - MQTT Broker               │    │  - Listen on cfarm/          │
│  - SyncService               │    │           cfarm.vn/          │
│  - DeviceService             │    └──────────────────────────────┘
└──────────────────────────────┘
```

### Core Principle
**Cloud is a relay control proxy, NOT a data master.**
- Local server = master database (barns, cycles, devices, inventory, etc.)
- Cloud = read-only cache for ENV data + command relay + push notifications
- All writes happen on local → sync to cloud for read access

---

## Phase 4.1: Barns + Devices Sync (Local → Cloud)

Both barns and devices are synced together since devices reference barns via `barn_id`.## Data Flow Summary

| Data | Direction | Trigger | Storage |
|------|-----------|---------|---------|
| **Barns** | Local → Cloud | On barn add/update/delete | Cloud `barns` |
| **Device list** | Local → Cloud | On device add/update/delete | Cloud `devices` |
| **ENV readings** | Local → Cloud | Every 5 min | Cloud `sensor_data` |
| Relay commands | iPhone → Cloud → MQTT → ESP32 | User action | ESP32 only |
| Push notifications | Local → Cloud → iPhone | Alert condition | iPhone |
| Command logs | Cloud → Local | On command sent | Local `device_commands` |

---

## Phase 4.1: Barns + Devices Sync (Local → Cloud)

Both barns and devices are synced together since devices reference barns via `barn_id`.

**1. Local: Add barns sync to SyncService**

```python
def sync_barns_and_devices():
    """Sync barns first, then devices (devices reference barn_id)."""
    # Sync barns
    barns = get_all_barns()
    payload = {
        'token': LOCAL_SYNC_TOKEN,
        'barns': [
            {
                'id': b.id,
                'number': b.number,
                'name': b.name,
                'length_m': b.length_m,
                'width_m': b.width_m,
                'height_m': b.height_m,
                'status': b.status,
            }
            for b in barns
        ],
        'devices': [
            {
                'device_code': d.device_code,
                'name': d.name,
                'device_type_id': d.device_type_id,
                'barn_id': d.barn_id,  # Links to barn
                'location': d.location,
                'status': d.status,
            }
            for d in get_all_devices()
        ]
    }
    post_to_cloud('/api/sync/farm-data', payload)
```

**2. Cloud: New endpoint `/api/sync/farm-data`**

```php
// app/interfaces/http/controllers/web/sync/farm_data_controller.php

public function receive(array $vars): void {
    $body = json_decode(file_get_contents('php://input'), true);

    if (($body['token'] ?? '') !== 'cfarm-local-sync-token') {
        http_response_code(401);
        exit;
    }

    $pdo = require __DIR__ . '/../../shared/database/mysql.php';

    // UPSERT barns first
    foreach ($body['barns'] ?? [] as $barn) {
        $pdo->prepare("
            INSERT INTO barns (id, number, name, length_m, width_m, height_m, status)
            VALUES (:id, :number, :name, :length, :width, :height, :status)
            ON DUPLICATE KEY UPDATE
                number = VALUES(number),
                name = VALUES(name),
                length_m = VALUES(length_m),
                width_m = VALUES(width_m),
                height_m = VALUES(height_m),
                status = VALUES(status)
        ")->execute([
            ':id' => $barn['id'],
            ':number' => $barn['number'],
            ':name' => $barn['name'],
            ':length' => $barn['length_m'],
            ':width' => $barn['width_m'],
            ':height' => $barn['height_m'],
            ':status' => $barn['status'],
        ]);
    }

    // UPSERT devices (after barns due to foreign key)
    foreach ($body['devices'] ?? [] as $device) {
        $pdo->prepare("
            INSERT INTO devices (device_code, name, device_type_id, barn_id, location, status)
            VALUES (:code, :name, :type_id, :barn_id, :location, :status)
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                device_type_id = VALUES(device_type_id),
                barn_id = VALUES(barn_id),
                location = VALUES(location),
                status = VALUES(status)
        ")->execute([
            ':code' => $device['device_code'],
            ':name' => $device['name'],
            ':type_id' => $device['device_type_id'],
            ':barn_id' => $device['barn_id'],
            ':location' => $device['location'],
            ':status' => $device['status'],
        ]);
    }

    $this->json([
        'ok' => true,
        'synced_barns' => count($body['barns'] ?? []),
        'synced_devices' => count($body['devices'] ?? []),
    ]);
}
```

---

## Security Considerations

1. **Token-based auth**: All sync endpoints require `cfarm-local-sync-token`
2. **Cloud MQTT credentials**: Hardcoded in `MqttService` (cfarm_server / Abc@@123)
3. **VAPID keys**: For Web Push - already configured
4. **No user auth for demo**: Cloud API is open for testing
5. **Production**: Should add user authentication before public release

---

## Files to Modify

### Local Server (C:\Local server)
- `src/sync/sync_service.py` - Add `sync_barns_and_devices()` method
- `src/iot/device_service.py` - Trigger sync on barn/device change
- `src/server/routes/sync.py` - Add `/api/sync/farm-data` endpoint (POST)

### Cloud Server (app.cfarm.vn)
- `app/interfaces/http/controllers/web/sync/farm_data_controller.php` - New file
- `app/router.php` - Add route: `POST /api/sync/farm-data`
- `app/interfaces/http/controllers/web/push/push_controller.php` - Add `/api/push/alert`
- `app/domains/iot/services/mqtt_service.php` - Already exists, no changes needed

---

## Testing Plan

1. **Device sync**: Add device on local → verify appears in cloud DB
2. **Relay control**: Send command from cloud API → verify ESP32 responds
3. **ENV display**: Push sensor data → verify displays on cloud dashboard
4. **Push notification**: Trigger alert locally → verify iPhone receives push

---

## Implementation Status (2026-04-15)

### ✅ Completed
- **Barns + Devices Sync** - Local → Cloud via `/api/sync/farm-data`
- **Bats System Sync** - Local bats ↔ Cloud (bidirectional via sync_controller)
- **Cloud Bat Control** - Cloud sends MQTT commands to ESP32 via bat_controller
- **Direct Relay Control** - Cloud → MQTT → ESP32 via DirectCommandController
- **Push Notifications** - Android working via WebPush, iOS pending FCM

### ❓ Unknown Status (need verification)
- Equipment sync (Local → Cloud)
- Sensor sync (Local → Cloud)
- ENV readings sync

### Open Questions (update needed)
1. ~~Should cloud store barns/cycles data or just devices + sensor_data?~~ **RESOLVED: Barns sync required for device grouping**
2. ~~Should we sync historical sensor data or only latest readings?~~ **RESOLVED: Latest readings only**
3. ~~What happens when local server is offline?~~ **RESOLVED: Show "Offline" status, cloud MQTT still works**
4. ~~Do we need command confirmation (ESP32 ACK back to cloud)?~~ **RESOLVED: No ACK needed for basic control**

### Pending
- Firebase Cloud Messaging for iOS push notifications
- Equipment/Sensor sync verification

---

## Open Questions

---

## Resolution Notes

### Open Question 1: Barns Sync
**Answer: YES, barns are necessary.**
- Devices are grouped by barns via `barn_id` foreign key
- Cloud UI needs barn info to display device groupings
- Sync order: barns FIRST → devices SECOND (due to foreign key constraint)

### Open Question 2: Historical Sensor Data
**Recommendation: Latest readings only.**
- Cloud is read-only cache, not analytics platform
- Store last 24-48 hours of readings for display
- Older data stays on local server

### Open Question 3: Local Offline
**Recommendation: Show "Offline" status.**
- Cloud can detect local offline via sync failure
- Push notification when local comes back online
- Device control still works via cloud MQTT

### Open Question 4: ESP32 ACK
**Recommendation: No ACK required for basic control.**
- MQTT QoS 1 ensures message delivered
- ESP32 will execute command or ignore if offline
- ACK only needed if we want command confirmation
- Can add later if needed
