# Cloud Sync API Specification

## Overview
This document defines the API endpoints that **cfarm.vn (cloud)** needs to implement
to enable bidirectional sync with the local server.

## Authentication
All requests between local and cloud use Bearer token auth:
- **Local → Cloud**: `Authorization: Bearer {api_token}` (configured in local sync settings)
- **Cloud → Local**: `Authorization: Bearer {local_token}` (configured in local sync settings)

---

## Endpoints Cloud Must Implement

### 1. POST /api/sync/receive
**Purpose**: Receive record changes pushed from local server.

**Request**:
```json
{
    "source": "local",
    "items": [
        {
            "table": "feed_records",
            "record_id": "123",
            "action": "insert",
            "payload": { /* full record as JSON */ },
            "created_at": "2026-03-28T10:00:00Z"
        }
    ]
}
```

**Response**: `{"ok": true, "received": 5}`

**Tables that push from local**:
- `barns`, `cycles`, `devices`
- `feed_records`, `death_records`, `medication_records`
- `weight_sessions`, `weight_details`, `sale_records`
- `health_notes`, `vaccine_schedules`, `alerts`

---

### 2. GET /api/sync/changes?since={timestamp}
**Purpose**: Return changes made on cloud since last sync.

**Response**:
```json
{
    "items": [
        {
            "table": "feed_brands",
            "action": "insert",
            "payload": { "id": 1, "name": "CP", "kg_per_bag": 50 }
        }
    ],
    "timestamp": "2026-03-28T12:00:00Z"
}
```

**Tables that push from cloud**:
- `feed_brands`, `feed_types`, `medications`, `suppliers`
- `vaccine_programs`, `vaccine_program_items`
- `notification_rules`

---

### 3. POST /api/sync/sensor-data
**Purpose**: Receive aggregated sensor data from local.

**Request**:
```json
{
    "source": "local",
    "items": [
        {
            "device_code": "ESP32_001",
            "sensor_type": "temperature",
            "hour": "2026-03-28T10:00:00Z",
            "avg_value": 32.5,
            "min_value": 31.0,
            "max_value": 34.2,
            "sample_count": 120
        }
    ]
}
```

---

### 4. POST /api/sync/device-states
**Purpose**: Receive device online/offline states from local.

**Request**:
```json
{
    "source": "local",
    "items": [
        {
            "device_code": "ESP32_001",
            "name": "Chuồng 1 - Relay",
            "device_type": "relay",
            "is_online": true,
            "firmware_version": "2.1.0",
            "ip_address": "192.168.1.100",
            "last_seen": "2026-03-28T10:30:00Z"
        }
    ]
}
```

---

## Endpoints Cloud Calls on Local

### 1. POST http://local-ip:8000/api/sync/receive
Push config changes to local (same format as #1 above).

### 2. POST http://local-ip:8000/api/sync/command
Execute IoT commands via local MQTT.

**Request**:
```json
{
    "type": "relay",
    "payload": {
        "device_code": "ESP32_001",
        "channel": 1,
        "state": "on",
        "duration": 300
    }
}
```

**Command types**: `relay`, `curtain`, `ping`

---

## PHP Laravel Example (cfarm.vn)

### Route: routes/api.php
```php
Route::prefix('sync')->middleware('auth:api')->group(function () {
    Route::post('/receive', [SyncController::class, 'receive']);
    Route::get('/changes', [SyncController::class, 'changes']);
    Route::post('/sensor-data', [SyncController::class, 'sensorData']);
    Route::post('/device-states', [SyncController::class, 'deviceStates']);
});
```

### Controller: SyncController.php
```php
public function receive(Request $request)
{
    $items = $request->input('items', []);
    $received = 0;

    foreach ($items as $item) {
        $table = $item['table'];
        $action = $item['action'];
        $payload = $item['payload'];

        try {
            if ($action === 'delete') {
                DB::table($table)->where('id', $payload['id'])->delete();
            } else {
                DB::table($table)->updateOrInsert(
                    ['id' => $payload['id']],
                    $payload
                );
            }
            $received++;
        } catch (\Exception $e) {
            Log::error("Sync receive error: {$table} - {$e->getMessage()}");
        }
    }

    return response()->json(['ok' => true, 'received' => $received]);
}

public function changes(Request $request)
{
    $since = $request->query('since', '2000-01-01');
    $tables = ['feed_brands', 'feed_types', 'medications', 'suppliers',
               'vaccine_programs', 'vaccine_program_items', 'notification_rules'];

    $items = [];
    foreach ($tables as $table) {
        $rows = DB::table($table)
            ->where('updated_at', '>', $since)
            ->get();

        foreach ($rows as $row) {
            $items[] = [
                'table' => $table,
                'action' => 'update',
                'payload' => (array) $row,
            ];
        }
    }

    return response()->json([
        'items' => $items,
        'timestamp' => now()->toIso8601String(),
    ]);
}

// Send command to local server
public function sendCommand($localIp, $command)
{
    $token = config('sync.local_token');
    $response = Http::withToken($token)
        ->post("http://{$localIp}:8000/api/sync/command", $command);
    return $response->json();
}
```
