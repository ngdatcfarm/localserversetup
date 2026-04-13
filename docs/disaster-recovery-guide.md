# CFarm Local Server - Disaster Recovery Guide

> Date: 2026-04-13
> Version: 1.0

---

## 1. Docker Infrastructure

### Container Status
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

| Container | Image | Ports | Purpose |
|-----------|-------|-------|---------|
| cfarm-db | timescale/timescaledb:latest-pg16 | 5434→5432 | PostgreSQL database |
| cfarm-mqtt | eclipse-mosquitto:2 | 1884→1883, 9001→9001 | MQTT broker |

### Start/Stop Commands
```bash
# Start all containers
docker-compose up -d

# Stop all containers
docker-compose down

# Restart a specific container
docker restart cfarm-db
docker restart cfarm-mqtt

# View logs
docker logs cfarm-db --tail=100
docker logs cfarm-mqtt --tail=100
```

---

## 2. Database Backup & Restore

### Backup (Local → File)
```bash
# Full database backup
docker exec cfarm-db pg_dump -U cfarm cfarm_local > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup specific tables
docker exec cfarm-db pg_dump -U cfarm cfarm_local -t devices -t barns -t cycles > tables_backup.sql
```

### Restore (File → Local)
```bash
# Restore from backup file
cat backup_file.sql | docker exec -i cfarm-db psql -U cfarm cfarm_local

# Restore specific tables
cat tables_backup.sql | docker exec -i cfarm-db psql -U cfarm cfarm_local
```

### Automated Backup Script
```powershell
# scripts/backup.ps1
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "C:\Local server\backups"
$containerName = "cfarm-db"
$dbName = "cfarm_local"
$dbUser = "cfarm"

# Create backup directory if not exists
if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir
}

# Run backup
$backupFile = "$backupDir\cfarm_backup_$timestamp.sql"
docker exec $containerName pg_dump -U $dbUser $dbName > $backupFile

# Compress old backups (keep last 7 days)
Get-ChildItem $backupDir -Filter "*.sql" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
    Remove-Item

Write-Host "Backup saved: $backupFile"
```

---

## 3. Rebuild Database from Scratch

### Step 1: Clean existing database
```bash
docker exec cfarm-db psql -U cfarm -d postgres -c "DROP DATABASE IF EXISTS cfarm_local;"
docker exec cfarm-db psql -U cfarm -d postgres -c "CREATE DATABASE cfarm_local;"
```

### Step 2: Run all migrations in order
```bash
# Core tables
docker exec -i cfarm-db psql -U cfarm cfarm_local < scripts/init_db.sql

# Subsequent migrations (in order)
docker exec -i cfarm-db psql -U cfarm cfarm_local < scripts/002_automation_alerts.sql
docker exec -i cfarm-db psql -U cfarm cfarm_local < scripts/003_farm_management.sql
docker exec -i cfarm-db psql -U cfarm cfarm_local < scripts/004_push_notifications.sql
docker exec -i cfarm-db psql -U cfarm cfarm_local < scripts/005_align_cloud_schema.sql
docker exec -i cfarm-db psql -U cfarm cfarm_local < scripts/006_sync_config.sql

# Additional migrations (check scripts/ folder for all)
for f in scripts/0*.sql; do docker exec -i cfarm-db psql -U cfarm cfarm_local < "$f"; done
```

### Step 3: Initialize reference data
```bash
# Create default farm
docker exec cfarm-db psql -U cfarm cfarm_local -c "INSERT INTO farms (id, name, address, status) VALUES ('farm-01', 'Farm 01', 'Vietnam', 'active');"

# Create default device types
docker exec cfarm-db psql -U cfarm cfarm_local -c "INSERT INTO device_types (id, code, name, channel_count) VALUES (1, 'relay_4ch', 'Relay 4CH', 4);"
docker exec cfarm-db psql -U cfarm cfarm_local -c "INSERT INTO device_types (id, code, name, channel_count) VALUES (2, 'relay_8ch', 'Relay 8CH', 8);"
docker exec cfarm-db psql -U cfarm cfarm_local -c "INSERT INTO device_types (id, code, name, channel_count) VALUES (3, 'sensor', 'Sensor Only', 0);"
docker exec cfarm-db psql -U cfarm cfarm_local -c "INSERT INTO device_types (id, code, name, channel_count) VALUES (4, 'mixed', 'Mixed Relay + Sensor', 4);"
```

---

## 4. Cloud Sync Configuration

### Architecture
```
LOCAL (192.168.1.9:8443) <---> CLOUD (app.cfarm.vn)
         |                        |
    MQTT Broker              PHP/MySQL
    PostgreSQL               cfarm_app_raw
```

### Token Configuration

#### On Cloud (app.cfarm.vn)
```bash
mysql -u cfarm_user -p'cfarm_pass' cfarm_app_raw -e "SELECT \`key\`, value FROM sync_config WHERE \`key\` IN ('api_token', 'local_token');"
```

Expected values:
- `api_token` = `cfarm-local-sync-token`
- `local_token` = `local_secret_12345`

To set:
```bash
mysql -u cfarm_user -p'cfarm_pass' cfarm_app_raw -e "INSERT INTO sync_config (\`key\`, value) VALUES ('api_token', 'cfarm-local-sync-token') ON DUPLICATE KEY UPDATE value='cfarm-local-sync-token';"
mysql -u cfarm_user -p'cfarm_pass' cfarm_app_raw -e "INSERT INTO sync_config (\`key\`, value) VALUES ('local_token', 'local_secret_12345') ON DUPLICATE KEY UPDATE value='local_secret_12345';"
```

#### On Local
```bash
curl -X POST http://192.168.1.9:8443/api/sync/config \
  -H "Content-Type: application/json" \
  -d '{
    "cloud_url": "https://app.cfarm.vn",
    "api_token": "cfarm-local-sync-token",
    "local_token": "local_secret_12345",
    "enabled": true
  }'
```

### Cloud Bootstrap Fix (if not present)
Add to `/var/www/app.cfarm.vn/app/bootstrap.php` after line 22:
```php
require_once ROOT_PATH . '/app/interfaces/http/controllers/web/sync/sync_controller.php';
```

### Verify Sync
```bash
# Check sync status
curl http://192.168.1.9:8443/api/sync/status

# Trigger manual sync
curl -X POST http://192.168.1.9:8443/api/sync/barns-devices-sync
curl -X POST http://192.168.1.9:8443/api/sync/full-sync
```

---

## 5. Sync Mechanism Details

### Sync Endpoints (Cloud → Local)
| Endpoint | Direction | Purpose |
|----------|-----------|---------|
| `POST /api/sync/receive` | Local→Cloud | Push data changes |
| `GET /api/sync/changes` | Cloud→Local | Pull config changes |
| `POST /api/sync/farm-data` | Local→Cloud | Sync barns + devices |
| `POST /api/sync/sensor-data` | Local→Cloud | Push sensor summaries |
| `POST /api/sync/device-states` | Local→Cloud | Push relay states |
| `POST /api/sync/command` | Cloud→Local | Remote IoT command |

### Sync Flow (Local → Cloud)
1. Local tracks changes in `sync_queue` table
2. `sync_service.push_to_cloud()` runs every 60s (configurable)
3. Sends batch to `POST /api/sync/receive`
4. Cloud applies changes via `SyncController.receive()`

### Sync Flow (Cloud → Local)
1. `sync_service.pull_from_cloud()` runs every 60s
2. Calls `GET /api/sync/changes?since=<last_sync>`
3. Cloud returns modified reference data
4. Local applies via `SyncController.changes()`

### Auto-Sync Tables
```
CLOUD ← LOCAL (push):
- devices, device_states, device_commands
- barns, cycles
- care_feeds, care_deaths, care_medications, care_sales
- sensor_data, inventory_transactions
- bats, bat_logs

CLOUD → LOCAL (pull):
- farms, barns, warehouses
- products, suppliers
- feed_brands, feed_types, medications
- device_types, sensor_types
- automation_rules, alert_rules
```

### Manual Sync (when auto-sync fails)
```bash
# Sync barns and devices
curl -X POST http://192.168.1.9:8443/api/sync/barns-devices-sync

# Full sync (push + pull)
curl -X POST http://192.168.1.9:8443/api/sync/full-sync

# Force push pending queue
curl -X POST http://192.168.1.9:8443/api/sync/push
```

---

## 6. Troubleshooting

### Check if containers are running
```bash
docker ps --format "{{.Names}}: {{.Status}}"
```

### Check database connectivity
```bash
docker exec cfarm-db psql -U cfarm cfarm_local -c "SELECT 1;"
```

### Check MQTT connectivity
```bash
docker exec cfarm-mqtt mosquitto_pub -t test -m "hello"
```

### View server logs
```bash
# If running directly
cd /c/Local\ server
python -m uvicorn src.server.main:app --host 0.0.0.0 --port 8443 --reload
```

### Common Issues

**Issue: Sync returns 401 Unauthorized**
- Check tokens match between local and cloud
- Local `local_token` must equal Cloud `local_token`
- Local `api_token` must equal Cloud `api_token`

**Issue: Sync returns 404**
- Ensure cloud_url = `https://app.cfarm.vn` (not `cfarm.vn`)
- Verify sync_controller.php is loaded in bootstrap.php

**Issue: FK constraint errors**
- Manually create parent records (farms, barns, device_types)
- Cloud schema may be missing reference data

**Issue: Database connection refused**
- Check Docker container is running
- Check port mapping: 5434→5432

---

## 7. Quick Recovery Checklist

If database is lost or corrupted:

- [ ] 1. Start Docker: `docker-compose up -d`
- [ ] 2. Run init script: `docker exec -i cfarm-db psql -U cfarm cfarm_local < scripts/init_db.sql`
- [ ] 3. Run all migration scripts in order
- [ ] 4. Set up sync tokens (local + cloud)
- [ ] 5. Verify with: `curl http://192.168.1.9:8443/api/sync/status`
- [ ] 6. Trigger full sync: `curl -X POST http://192.168.1.9:8443/api/sync/full-sync`
- [ ] 7. Check devices on cloud: `mysql -u cfarm_user -p'cfarm_pass' cfarm_app_raw -e "SELECT device_code FROM devices;"`

---

## 8. File Locations

| Component | Path |
|-----------|------|
| Local Server | `C:\Local server\` |
| Database Docker | `cfarm-db` container |
| MQTT Docker | `cfarm-mqtt` container |
| Cloud App | `/var/www/app.cfarm.vn/` |
| Cloud DB | `cfarm_app_raw` (MySQL) |
| Scripts | `C:\Local server\scripts\` |
| Docs | `C:\Local server\docs\` |

---

## 9. Contact & Support

- Local server port: 8443 (HTTP) or 8443 (HTTPS with cert)
- Database port: 5434 (external), 5432 (inside container)
- MQTT port: 1884 (external), 1883 (inside container)
- Cloud URL: https://app.cfarm.vn