# CFarm API Router Documentation

## Table of Contents
1. [Router Classification](#1-router-classification)
2. [Query APIs (Read)](#2-query-apis-read)
3. [Mutation APIs (Write)](#3-mutation-apis-write)
4. [Database Tables & Operations](#4-database-tables--operations)
5. [Data Flow Diagrams](#5-data-flow-diagrams)

---

## 1. Router Classification

| Router File | Prefix | Purpose | Type |
|-------------|--------|---------|------|
| `farm.py` | `/api/farm` | Core farm: farms, barns, cycles, warehouses, inventory, care operations | Core |
| `farm_extended.py` | `/api/farm` | Extended: feeds, medications, vaccines, suppliers, health notes, weight sessions | Core |
| `devices.py` | `/api/devices` | IoT device management | IoT |
| `sensors.py` | `/api/sensors` | Sensor data queries | IoT |
| `bats.py` | `/api/bats` | Ventilation curtain control | IoT |
| `equipment.py` | `/api/equipment` | Equipment management | IoT |
| `automation.py` | `/api/automation`, `/api/alerts` | Automation rules, relay control, alerts | IoT |
| `iot.py` | `/api/iot` | MQTT relay commands, curtain control | IoT |
| `cameras.py` | `/api/cameras` | Camera management & streaming | Cameras |
| `notifications.py` | `/api/notifications` | Push notifications, care status | System |
| `sync.py` | `/api/sync` | Cloud synchronization | System |
| `chat.py` | `/api/chat` | AI chat interface | AI |
| `ai_logic.py` | `/api/ai_logic` | AI automation rules | AI |
| `ml.py` | `/api/ml` | ML model status | ML |
| `ml_dataset.py` | `/api/ml_dataset` | Image dataset management | ML |
| `ml_training.py` | `/api/ml_training` | Training job management | ML |
| `database.py` | `/api/database` | Database inspection | System |
| `firmware.py` | `/api/firmware` | Device firmware management | System |
| `snapshot.py` | `/api/snapshots` | Image capture snapshots | System |
| `recording.py` | `/api/recording` | Camera recording | System |

---

## 2. Query APIs (Read)

### 2.1 Farm Core Queries (`farm.py`)

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| GET | `/api/farm/farms` | List all farms | `[{id, name, address, contact_name, contact_phone, active}]` |
| GET | `/api/farm/farms/{farm_id}` | Get farm with barn/warehouse counts | `{farm, barn_count, warehouse_count}` |
| GET | `/api/farm/barns` | List barns (filter: `farm_id`, `active_only`) | `[{id, name, farm_id, capacity, area_sqm, active}]` |
| GET | `/api/farm/barns/{barn_id}` | Get barn with summary (devices, cycles, latest sensor) | `{barn, device_count, active_cycle, sensor_summary}` |
| GET | `/api/farm/cycles` | List cycles (filter: `barn_id`, `status`) | `[{id, barn_id, name, breed, status, start_date, current_count}]` |
| GET | `/api/farm/cycles/{cycle_id}` | Get cycle details | `{id, barn_id, name, breed, initial_count, current_count, ...}` |
| GET | `/api/farm/cycles/{cycle_id}/dashboard` | **KPIs**: alive_count, mortality_rate, FCR, feed_per_bird, latest_weight | `{alive_count, mortality_rate, fcr, feed_per_bird_day, latest_weight}` |
| GET | `/api/farm/cycles/{cycle_id}/snapshots` | Daily snapshots for cycle | `[{date, data: {sensor_avg, care_summary, weight_avg}}]` |
| GET | `/api/farm/warehouses` | List warehouses (filter: `warehouse_type`, `barn_id`, `farm_id`) | `[{id, code, name, warehouse_type, barn_id, capacity_kg, status}]` |
| GET | `/api/farm/warehouses/{warehouse_id}` | Get warehouse details with zones | `{warehouse, zones: [...]}` |
| GET | `/api/farm/products` | List products (filter: `product_type`) | `[{id, code, name, product_type, unit, price_per_unit}]` |
| GET | `/api/farm/inventory` | Stock levels (filter: `warehouse_id`, `product_type`) | `[{warehouse_id, product_id, quantity, product}]` |
| GET | `/api/farm/inventory/transactions` | Transaction history | `[{id, warehouse_id, product_id, transaction_type, quantity, ...}]` |
| GET | `/api/farm/barns/{barn_id}/default-warehouses` | Default feed/med warehouses for barn | `[{warehouse_type, warehouse_id, warehouse_name}]` |
| GET | `/api/farm/barns/{barn_id}/suggested-warehouses` | Suggested with stock levels | `[{type, warehouse, stock_level}]` |
| GET | `/api/farm/inventory/alerts` | Low stock alerts | `[{id, warehouse_id, product_id, message, severity}]` |
| GET | `/api/farm/inventory/alerts/rules` | Alert rules | `[{id, product_id, warehouse_id, min_quantity, enabled}]` |
| GET | `/api/farm/warehouse-zones` | List zones (filter: `warehouse_id`) | `[{id, warehouse_id, name, zone_type}]` |

### 2.2 Farm Extended Queries (`farm_extended.py`)

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| GET | `/api/farm/feed-brands` | List feed brands | `[{id, name, kg_per_bag, note, status}]` |
| GET | `/api/farm/feed-brands/{brand_id}` | Get brand with types | `{brand, types: [...]}` |
| GET | `/api/farm/feed-types` | List feed types | `[{id, name, feed_brand_id, price_per_bag, suggested_stage}]` |
| GET | `/api/farm/medications` | List medications (filter: `category`, `status`) | `[{id, name, unit, category, manufacturer, price_per_unit}]` |
| GET | `/api/farm/medications/{med_id}` | Get medication details | `{medication}` |
| GET | `/api/farm/suppliers` | List suppliers | `[{id, name, phone, address, status}]` |
| GET | `/api/farm/vaccine-programs` | List vaccine programs | `[{id, name, active, items: [...]}]` |
| GET | `/api/farm/vaccine-programs/{program_id}` | Get program with items | `{program, items: [{vaccine_name, day_age, method}]}` |
| GET | `/api/farm/vaccine-schedules` | Schedules for cycle (`?cycle_id=X`) | `[{id, cycle_id, vaccine_name, scheduled_date, done, skipped}]` |
| GET | `/api/farm/vaccine-schedules/upcoming` | Vaccines due within N days (`?days=7`) | `[{schedule, cycle_name, barn_name, day_age_target}]` |
| GET | `/api/farm/health-notes` | Health notes for cycle (`?cycle_id=X`) | `[{id, cycle_id, severity, symptoms, resolved}]` |
| GET | `/api/farm/weight-sessions` | Weight sessions for cycle (`?cycle_id=X`) | `[{id, cycle_id, weighed_at, sample_count, avg_weight_g}]` |
| GET | `/api/farm/weight-sessions/{session_id}` | Session with details | `{session, details: [{sample_weight}]}` |

### 2.3 Care Operation Queries

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| GET | `/api/farm/care/feed/{cycle_id}` | Feed logs for cycle | `[{id, feed_date, meal, product_id, quantity, warehouse_id}]` |
| GET | `/api/farm/care/feed/{cycle_id}/daily` | Daily feed summary | `[{date, total_kg, bag_count, product_name}]` |
| GET | `/api/farm/care/death/{cycle_id}` | Death logs for cycle | `[{id, death_date, count, cause, shift}]` |
| GET | `/api/farm/care/death/{cycle_id}/daily` | Daily death summary | `[{date, total_count, cause_breakdown}]` |
| GET | `/api/farm/care/medication/{cycle_id}` | Medication logs | `[{id, med_date, med_type, product_id, quantity, method}]` |
| GET | `/api/farm/care/weight/{cycle_id}` | Weight logs | `[{id, weigh_date, sample_count, avg_weight, min_weight, max_weight}]` |
| GET | `/api/farm/care/sale/{cycle_id}` | Sale logs | `[{id, sale_date, count, total_weight, unit_price}]` |
| GET | `/api/farm/care/water/{cycle_id}` | Water logs | `[{id, water_date, consumption_liters, medicated}]` |
| GET | `/api/farm/care/health/{cycle_id}` | Health notes | `[{id, recorded_at, severity, symptoms, resolved}]` |
| GET | `/api/farm/care/weight/reminders` | All weight reminders | `[{cycle_id, interval_days, enabled, last_reminder}]` |

### 2.4 IoT Queries

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| GET | `/api/devices` | List devices (filter: `barn_id`) | `[{id, device_code, name, device_type_id, barn_id, is_online}]` |
| GET | `/api/devices/types` | Device type definitions | `[{id, code, name, channel_count}]` |
| GET | `/api/devices/{device_id}` | Device details with type | `{device, device_type, channels}` |
| GET | `/api/devices/{device_id}/channels` | Channel configuration | `[{channel_number, function, name, gpio_pin}]` |
| GET | `/api/devices/{device_id}/states` | Current relay states | `[{channel, state: on/off}]` |
| GET | `/api/sensors/latest` | Latest readings (filter: `device_id`, `barn_id`, `sensor_type`) | `[{device_id, sensor_type, value, unit, time}]` |
| GET | `/api/sensors/history/{device_id}/{sensor_type}` | Raw history (query: `hours`, `limit`) | `[{time, value, unit}]` |
| GET | `/api/sensors/hourly/{device_id}/{sensor_type}` | Hourly aggregates (default 168h) | `[{bucket, avg_value, min_value, max_value}]` |
| GET | `/api/sensors/barn/{barn_id}` | All sensors for barn | `[{sensor_type, latest_value, time}]` |
| GET | `/api/sensors/barns-temperature` | Quick temp/humidity all barns | `[{barn_id, sensor_type, value, time}]` |
| GET | `/api/bats/barns/{barn_id}` | All bats for barn | `[{id, position, auto_enabled, current_state}]` |
| GET | `/api/bats/{bat_id}` | Bat details | `{bat, logs: [...]}` |
| GET | `/api/bats/{bat_id}/logs` | Bat movement history | `[{timestamp, action, duration_seconds}]` |
| GET | `/api/equipment/types` | Equipment types | `[{id, code, name, description}]` |
| GET | `/api/equipment` | Equipment instances (filter: `barn_id`, `equipment_type_id`) | `[{id, name, barn_id, device_id, status}]` |
| GET | `/api/equipment/{equipment_id}` | Equipment with type | `{equipment, equipment_type, device}` |
| GET | `/api/automation/rules` | Automation rules (filter: `device_id`) | `[{id, name, enabled, cron_expression, actions}]` |
| GET | `/api/alerts/rules` | Alert rules (filter: `barn_id`) | `[{id, sensor_id, min_value, max_value, severity}]` |
| GET | `/api/alerts` | Alert history (filter: `acknowledged`, `barn_id`, `limit`) | `[{id, severity, message, acknowledged, created_at}]` |
| GET | `/api/alerts/active` | Unacknowledged alerts | `[{id, severity, message, barn_name}]` |

### 2.5 System Queries

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| GET | `/api/notifications/status` | Push notification status | `{enabled, subscriber_count}` |
| GET | `/api/notifications/subscriptions` | Active push subscriptions | `[{endpoint, keys, created_at}]` |
| GET | `/api/notifications/vaccine-notification-setting` | Vaccine notification setting | `{enabled}` |
| GET | `/api/notifications/settings` | All notification settings | `{key: value}` |
| GET | `/api/notifications/care-status` | Care compliance for all active cycles | `[{cycle_id, cycle_name, feed_done, weight_done, vaccines_due}` |
| GET | `/api/notifications/history` | Notification history | `[{id, title, body, created_at, read_at}]` |
| GET | `/api/notifications/dismissed` | Dismissed alerts | `[{alert_type, dismissed_at}]` |
| GET | `/api/sync/status` | Sync status | `{enabled, last_sync, pending_count}` |
| GET | `/api/sync/config` | Sync config (masked) | `{cloud_url, tunnel_token_masked}` |
| GET | `/api/sync/queue` | Pending sync queue | `[{table_name, record_id, action, payload}]` |
| GET | `/api/sync/logs` | Sync logs | `[{timestamp, action, status, details}]` |
| GET | `/api/cameras` | List cameras | `[{id, name, ip, port, enabled}]` |
| GET | `/api/cameras/status/all` | All camera statuses | `[{id, online, fps, recording}]` |
| GET | `/api/ai_logic/rules` | AI logic rules | `[{id, name, enabled, trigger_schedule}` |
| GET | `/health` | Server health | `{status, mqtt, devices}` |
| GET | `/api/ml/status` | ML model status | `{loaded, models_loaded, baselines_active}` |

---

## 3. Mutation APIs (Write)

### 3.1 Farm Core Mutations

| Method | Endpoint | Request Body | Side Effects |
|--------|----------|--------------|--------------|
| POST | `/api/farm/farms` | `{id, name, address, contact_name, contact_phone}` | Insert farm |
| PUT | `/api/farm/farms/{farm_id}` | `{name, address, contact}` | Update farm |
| DELETE | `/api/farm/farms/{farm_id}` | - | Delete (fails if has barns) |
| POST | `/api/farm/barns` | `{id, name, farm_id, capacity, area_sqm}` | Insert barn |
| PUT | `/api/farm/barns/{barn_id}` | `{name, capacity, area_sqm, active}` | Update barn |
| DELETE | `/api/farm/barns/{barn_id}` | - | Delete (fails if active cycle) |
| POST | `/api/farm/cycles` | `{barn_id, name, breed, initial_count, start_date, expected_end_date}` | Insert cycle, create weight_reminder |
| PUT | `/api/farm/cycles/{cycle_id}` | `{name, expected_end_date}` | Update cycle |
| POST | `/api/farm/cycles/{cycle_id}/close` | `{close_date, notes, final_count}` | Close cycle, update stats |
| POST | `/api/farm/warehouses` | `{code, name, warehouse_type, barn_id, capacity_kg}` | Insert warehouse |
| PUT | `/api/farm/warehouses/{warehouse_id}` | `{name, capacity_kg}` | Update warehouse |
| DELETE | `/api/farm/warehouses/{warehouse_id}` | - | Delete (fails if has inventory) |
| POST | `/api/farm/products` | `{code, name, product_type, unit, price_per_unit}` | Insert product |
| POST | `/api/farm/inventory/import` | `{warehouse_id, product_id, quantity, unit_price, batch_number, expiry_date}` | **Inventory increase**, transaction log |
| POST | `/api/farm/inventory/export` | `{warehouse_id, product_id, quantity, notes}` | **Inventory decrease**, transaction log |
| POST | `/api/farm/inventory/transfer` | `{from_warehouse_id, to_warehouse_id, product_id, quantity}` | **Both inventories update**, transaction log |
| POST | `/api/farm/warehouse-zones` | `{warehouse_id, name, zone_type}` | Insert zone |
| DELETE | `/api/farm/warehouse-zones/{zone_id}` | - | Delete zone |

### 3.2 Care Operation Mutations

| Method | Endpoint | Request Body | Side Effects |
|--------|----------|--------------|--------------|
| POST | `/api/farm/care/feed` | `{cycle_id, barn_id, feed_date, meal, product_id, quantity, warehouse_id, notes}` | Insert feed, **decrement inventory** |
| DELETE | `/api/farm/care/feed/{feed_id}` | - | Delete feed, **restore inventory** |
| POST | `/api/farm/care/death` | `{cycle_id, barn_id, death_date, count, cause, symptoms, notes, shift}` | Insert death, **decrement cycle.current_count** |
| DELETE | `/api/farm/care/death/{death_id}` | - | Delete death, **restore cycle.current_count** |
| POST | `/api/farm/care/medication` | `{cycle_id, barn_id, med_date, med_type, product_id, quantity, unit, method, warehouse_id, notes, shift}` | Insert med, **decrement inventory** |
| DELETE | `/api/farm/care/medication/{med_id}` | - | Delete med, **restore inventory** |
| POST | `/api/farm/care/weight` | `{cycle_id, barn_id, weigh_date, sample_count, total_weight, avg_weight, min_weight, max_weight, uniformity, day_age}` | Insert weight |
| DELETE | `/api/farm/care/weight/{weight_id}` | - | Delete weight |
| PUT | `/api/farm/care/weight/reminders/{cycle_id}` | `{interval_days, enabled}` | Update weight reminder |
| POST | `/api/farm/care/sale` | `{cycle_id, barn_id, sale_date, count, total_weight, avg_weight, unit_price, total_amount, buyer, sale_type}` | Insert sale, **decrement cycle.current_count** |
| DELETE | `/api/farm/care/sale/{sale_id}` | - | Delete sale, **restore cycle.current_count** |
| POST | `/api/farm/care/water` | `{cycle_id, barn_id, water_date, consumption_liters, medicated, notes, shift}` | Insert water log |
| DELETE | `/api/farm/care/water/{water_id}` | - | Delete water log |
| POST | `/api/farm/care/health` | `{cycle_id, barn_id, recorded_at, severity, symptoms, image_path}` | Insert health note |
| POST | `/api/farm/care/health/{note_id}/resolve` | - | Mark health note resolved |

### 3.3 Farm Extended Mutations

| Method | Endpoint | Request Body | Side Effects |
|--------|----------|--------------|--------------|
| POST | `/api/farm/feed-brands` | `{name, kg_per_bag, note}` | Insert brand |
| PUT | `/api/farm/feed-brands/{brand_id}` | `{name, kg_per_bag, note, status}` | Update brand |
| DELETE | `/api/farm/feed-brands/{brand_id}` | - | Delete brand |
| POST | `/api/farm/feed-types` | `{feed_brand_id, code, name, price_per_bag, suggested_stage}` | Insert type |
| PUT | `/api/farm/feed-types/{type_id}` | `{name, price_per_bag, status}` | Update type |
| DELETE | `/api/farm/feed-types/{type_id}` | - | Delete type |
| POST | `/api/farm/medications` | `{name, unit, category, manufacturer, price_per_unit}` | Insert medication |
| PUT | `/api/farm/medications/{med_id}` | `{name, unit, category, status}` | Update medication |
| DELETE | `/api/farm/medications/{med_id}` | - | Delete medication |
| POST | `/api/farm/suppliers` | `{name, phone, address, note}` | Insert supplier |
| PUT | `/api/farm/suppliers/{supplier_id}` | `{name, phone, address, status}` | Update supplier |
| DELETE | `/api/farm/suppliers/{supplier_id}` | - | Delete supplier |
| POST | `/api/farm/vaccine-programs` | `{name, note}` | Insert program |
| PUT | `/api/farm/vaccine-programs/{program_id}` | `{name, active}` | Update program |
| DELETE | `/api/farm/vaccine-programs/{program_id}` | - | Delete program + items |
| POST | `/api/farm/vaccine-programs/{program_id}/items` | `{vaccine_name, day_age, method, remind_days}` | Insert program item |
| PUT | `/api/farm/vaccine-programs/items/{item_id}` | `{vaccine_name, day_age, method}` | Update item |
| DELETE | `/api/farm/vaccine-programs/items/{item_id}` | - | Delete item |
| POST | `/api/farm/vaccine-schedules` | `{cycle_id, vaccine_name, scheduled_date, day_age_target, method}` | Insert schedule |
| POST | `/api/farm/vaccine-schedules/apply-program` | `{program_id}` + cycle_id | **Create multiple schedules** from program |
| POST | `/api/farm/vaccine-schedules/{schedule_id}/done` | `{notes}` | Mark done, set `done_at` |
| POST | `/api/farm/vaccine-schedules/{schedule_id}/skip` | `{reason}` | Mark skipped |
| DELETE | `/api/farm/vaccine-schedules/{schedule_id}` | - | Delete schedule |
| POST | `/api/farm/health-notes` | `{cycle_id, recorded_at, severity, symptoms}` | Insert health note |
| POST | `/api/farm/health-notes/{note_id}/resolve` | - | Mark resolved |
| DELETE | `/api/farm/health-notes/{note_id}` | - | Delete note |
| POST | `/api/farm/weight-sessions` | `{cycle_id, weighed_at, sample_count, avg_weight_g, details}` | Insert session + sample details |
| DELETE | `/api/farm/weight-sessions/{session_id}` | - | Delete session + details |

### 3.4 IoT Mutations

| Method | Endpoint | Request Body | Side Effects |
|--------|----------|--------------|--------------|
| POST | `/api/devices` | `{device_code, name, device_type_id, barn_id}` | Register device |
| PUT | `/api/devices/{device_id}` | `{name, barn_id}` | Update device |
| DELETE | `/api/devices/{device_id}` | - | Delete device |
| POST | `/api/devices/{device_id}/test` | - | Send MQTT ping |
| PUT | `/api/devices/{device_id}/channels` | `[{channel_number, function, name, gpio_pin}]` | Replace all channels |
| POST | `/api/devices/types` | `{code, name, channel_count}` | Create device type |
| PUT | `/api/devices/types/{type_id}` | `{name, channel_count}` | Update type |
| DELETE | `/api/devices/types/{type_id}` | - | Delete type (fails if in use) |
| POST | `/api/bats/{bat_id}/up` | `{target_position}` | Move bat UP |
| POST | `/api/bats/{bat_id}/down` | `{target_position}` | Move bat DOWN |
| POST | `/api/bats/{bat_id}/stop` | - | Stop bat |
| PUT | `/api/bats/{bat_id}` | `{auto_enabled, position}` | Update bat config |
| POST | `/api/equipment/types` | `{code, name, description}` | Create equipment type |
| PUT | `/api/equipment/types/{type_id}` | `{name, description}` | Update type |
| DELETE | `/api/equipment/types/{type_id}` | - | Delete type |
| POST | `/api/equipment` | `{name, equipment_type_id, barn_id, device_id, channel_number}` | Create equipment |
| PUT | `/api/equipment/{equipment_id}` | `{name, status}` | Update equipment |
| DELETE | `/api/equipment/{equipment_id}` | - | Delete equipment |
| POST | `/api/equipment/{equipment_id}/assign` | `{device_id, channel_number}` | Assign to device channel |
| POST | `/api/equipment/{equipment_id}/unassign` | - | Unassign |
| POST | `/api/automation/rules` | `{name, device_id, channel_number, rule_type, cron_expression, conditions}` | Create automation rule |
| PUT | `/api/automation/rules/{rule_id}` | `{name, enabled, cron_expression}` | Update rule |
| DELETE | `/api/automation/rules/{rule_id}` | - | Delete rule |
| POST | `/api/automation/rules/{rule_id}/toggle` | `{enabled}` | Enable/disable |
| POST | `/api/alerts/rules` | `{name, sensor_id, min_value, max_value, severity, cooldown_minutes}` | Create alert rule |
| PUT | `/api/alerts/rules/{rule_id}` | `{min_value, max_value, enabled}` | Update rule |
| DELETE | `/api/alerts/rules/{rule_id}` | - | Delete rule |
| POST | `/api/alerts/{alert_id}/acknowledge` | - | Mark acknowledged |
| POST | `/api/alerts/acknowledge-all` | `{barn_id}` | Ack all alerts |
| POST | `/api/iot/relay` | `{device_id, channel, state}` | Direct relay ON/OFF |
| POST | `/api/iot/relay/timed` | `{device_id, channel, duration_seconds}` | Relay ON for N seconds |

### 3.5 System Mutations

| Method | Endpoint | Request Body | Side Effects |
|--------|----------|--------------|--------------|
| POST | `/api/notifications/subscribe` | `{endpoint, keys: {p256dh, auth}}` | Register push subscription |
| POST | `/api/notifications/unsubscribe` | `{endpoint}` | Remove subscription |
| POST | `/api/notifications/test` | `{title, body}` | Send test push to all |
| PUT | `/api/notifications/vaccine-notification-setting` | `{enabled}` | Update setting |
| PUT | `/api/notifications/settings` | `{settings: {key: value}}` | Update settings |
| POST | `/api/notifications/dismiss` | `{alert_type, cycle_id}` | Dismiss alert |
| POST | `/api/sync/config` | `{cloud_url, auth_token}` | Update sync config |
| POST | `/api/sync/now` | - | Trigger immediate sync |
| POST | `/api/sync/full-sync` | - | Full sync (push + pull) |
| DELETE | `/api/sync/queue` | - | Clear pending queue |
| POST | `/api/cameras` | `{id, name, ip, port, username, password}` | Add camera |
| PUT | `/api/cameras/{camera_id}` | `{name, ip, enabled}` | Update camera |
| DELETE | `/api/cameras/{camera_id}` | - | Delete camera |
| POST | `/api/cameras/{camera_id}/start` | - | Start RTSP stream |
| POST | `/api/cameras/{camera_id}/stop` | - | Stop stream |
| POST | `/api/ai_logic/rules` | `{name, trigger_type, trigger_config, steps}` | Create AI rule |
| PUT | `/api/ai_logic/rules/{rule_id}` | `{name, enabled, steps}` | Update rule |
| DELETE | `/api/ai_logic/rules/{rule_id}` | - | Delete rule |
| POST | `/api/ai_logic/rules/{rule_id}/toggle` | `{enabled}` | Enable/disable |

---

## 4. Database Tables & Operations

### 4.1 Farm Core Tables

| Table | Primary Key | Foreign Keys | Operations | Related Tables |
|-------|------------|-------------|------------|----------------|
| `farms` | `id` (PK) | - | CRUD | `barns`, `warehouses` |
| `barns` | `id` (PK) | `farm_id` → farms | CRUD | `cycles`, `devices`, `bats`, `equipment`, `warehouses` |
| `cycles` | `id` (PK) | `barn_id` → barns | CRUD, Close | `care_feeds`, `care_deaths`, `care_medications`, `care_weights`, `care_sales`, `vaccine_schedules`, `weight_reminders`, `cycle_daily_snapshots` |
| `warehouses` | `id` (PK) | `barn_id`, `farm_id` | CRUD | `inventory`, `warehouse_zones` |
| `warehouse_zones` | `id` (PK) | `warehouse_id` → warehouses | CRUD | - |
| `products` | `id` (PK) | `supplier_id` → suppliers | CRUD | `inventory`, `inventory_transactions` |
| `inventory` | `id` (PK) | `warehouse_id`, `product_id` | Import, Export, Transfer | `inventory_transactions` |
| `inventory_transactions` | `id` (PK) | `warehouse_id`, `product_id`, `from_warehouse_id` | Insert only | - |

### 4.2 Care Operation Tables

| Table | Primary Key | Foreign Keys | Operations | Inventory Effect |
|-------|------------|-------------|------------|-----------------|
| `care_feeds` | `id` (PK) | `cycle_id`, `barn_id`, `product_id`, `warehouse_id` | Insert, Delete | Yes - export from warehouse |
| `care_deaths` | `id` (PK) | `cycle_id`, `barn_id` | Insert, Delete | Yes - decrement cycle.current_count |
| `care_medications` | `id` (PK) | `cycle_id`, `barn_id`, `product_id`, `warehouse_id` | Insert, Delete | Yes - export from warehouse |
| `care_weights` | `id` (PK) | `cycle_id`, `barn_id` | Insert, Delete | No |
| `care_sales` | `id` (PK) | `cycle_id`, `barn_id` | Insert, Delete | Yes - decrement cycle.current_count |
| `care_water_logs` | `id` (PK) | `cycle_id`, `barn_id` | Insert, Delete | No |
| `health_notes` | `id` (PK) | `cycle_id`, `barn_id` | Insert, Resolve, Delete | No |

### 4.3 Catalog Tables

| Table | Primary Key | Foreign Keys | Operations |
|-------|------------|-------------|------------|
| `feed_brands` | `id` (PK) | - | CRUD |
| `feed_types` | `id` (PK) | `feed_brand_id` → feed_brands | CRUD |
| `medications` | `id` (PK) | - | CRUD |
| `suppliers` | `id` (PK) | - | CRUD |
| `vaccine_programs` | `id` (PK) | - | CRUD |
| `vaccine_program_items` | `id` (PK) | `program_id` → vaccine_programs | CRUD |
| `vaccine_schedules` | `id` (PK) | `cycle_id` | Create, Apply Program, Done, Skip, Delete |
| `weight_reminders` | `cycle_id` (PK) | `cycle_id` → cycles | Update |

### 4.4 IoT Tables

| Table | Primary Key | Foreign Keys | Operations |
|-------|------------|-------------|------------|
| `device_types` | `id` (PK) | - | CRUD |
| `devices` | `id` (PK) | `barn_id`, `device_type_id` | CRUD, Ping |
| `device_channels` | `device_id + channel_number` (PK) | `device_id` → devices | Replace all |
| `device_states` | `device_id + channel` (PK) | `device_id` → devices | Update on relay change |
| `sensor_types` | `id` (PK) | - | - |
| `sensors` | `id` (PK) | `barn_id`, `device_id`, `sensor_type_id` | - |
| `sensor_data` | `time + device_id + sensor_type` (PK) | `device_id`, `barn_id` | Insert (MQTT listener) |
| `bats` | `id` (PK) | `barn_id`, `device_id` | CRUD, Up, Down, Stop |
| `bat_logs` | `id` (PK) | `bat_id` → bats | Insert |
| `equipment_types` | `id` (PK) | - | CRUD |
| `equipment` | `id` (PK) | `barn_id`, `equipment_type_id`, `device_id` | CRUD, Assign, Unassign |
| `automation_rules` | `id` (PK) | `device_id` | CRUD, Toggle |
| `alert_rules` | `id` (PK) | `sensor_id` | CRUD |
| `alerts` | `id` (PK) | `barn_id` | Insert (system), Acknowledge |

### 4.5 System Tables

| Table | Primary Key | Foreign Keys | Operations |
|-------|------------|-------------|------------|
| `notification_settings` | `key` (PK) | - | Get, Update |
| `push_subscriptions` | `id` (PK) | - | Subscribe, Unsubscribe, List |
| `notification_history` | `id` (PK) | - | Insert, List |
| `sync_queue` | `id` (PK) | - | Insert, Get, Clear |
| `ai_logic_rules` | `id` (PK) | - | CRUD, Toggle |
| `ai_logic_steps` | `id` (PK) | `rule_id` → ai_logic_rules | CRUD |
| `ml_dataset_images` | `id` (PK) | `camera_id` | Upload, Label, Delete |
| `ml_dataset_labels` | `id` (PK) | `image_id` → ml_dataset_images | Add, Delete |

---

## 5. Data Flow Diagrams

### 5.1 Care Feed Flow

```
[Frontend: care.js]
        │
        ▼ POST /api/farm/care/feed
        │
[Farm Router: farm.py → care_service.log_feed()]
        │
        ├──► [INSERT care_feeds]
        │
        ├──► [UPDATE inventory] (if warehouse_id)
        │         │
        │         ▼ [INSERT inventory_transactions]
        │
        └──► [SYNC] queue_change('care_feeds', new_id, 'insert')
                │
                ▼ [sync_service]
```

### 5.2 Cycle Lifecycle Flow

```
[Create Cycle]
        │
        ▼ POST /api/farm/cycles
        │
[cycle_service.create_cycle()]
        │
        ├──► [INSERT cycles]
        ├──► [INSERT weight_reminders] (default 7-day interval)
        └──► [SYNC] sync_barns_and_devices()
                │
                ▼ [Background Services]
                        │
                        ├──► vaccine_notification_service.start()
                        ├──► care_notification_service.start()
                        └──► weight_notification_service.start()

[Close Cycle]
        │
        ▼ POST /api/farm/cycles/{id}/close
        │
[cycle_service.close_cycle()]
        │
        ├──► [UPDATE cycles: status='closed', actual_end_date]
        ├──► [UPDATE cycle_daily_snapshots]
        └──► [SYNC] sync_barns_and_devices()
```

### 5.3 Sensor Data Flow

```
[ESP32 Device]
        │
        ▼ MQTT publish (topic: sensors/{device_code})
        │
[MQTT Broker: localhost:1884]
        │
        ▼
[mqtt_listener.py]
        │
        ├──► Parse JSON payload
        ├──► Map sensor_type (mq135_raw → mq135, etc.)
        └──► [INSERT sensor_data] (TimescaleDB hypertable)
                │
                └──► [TimescaleDB continuous aggregate]
                        │
                        ▼ [sensor_hourly materialized view]
```

### 5.4 Daily Operations Flow (Care)

```
[User Action: Log Feed]
        │
        ▼ Select Cycle + Enter quantity + Select Warehouse
        │
[care.js] → API.care.logFeed({...})
        │
        ▼ POST /api/farm/care/feed
        │
[farm.py] → care_service.log_feed()
        │
        ├──► Validate cycle_id, warehouse_id
        ├──► Calculate remaining quantity
        ├──► INSERT care_feeds
        └──► inventory_service.export_stock()
                │
                ├──► UPDATE inventory SET quantity = quantity - export_qty
                └──► INSERT inventory_transactions
        │
        ▼ Return {ok, feed}

[User Action: Log Death]
        │
        ▼ Enter count + cause
        │
[care.js] → API.care.logDeath({...})
        │
        ▼ POST /api/farm/care/death
        │
[farm.py] → care_service.log_death()
        │
        ├──► INSERT care_deaths
        └──► cycle_service.update_count()
                │
                └──► UPDATE cycles SET current_count = current_count - death_count
```

### 5.5 Sync Flow (Cloud)

```
[Local Change]
        │
        ▼ queue_change(table, record_id, action)
        │
[sync_service] → INSERT sync_queue
        │
        └──► Background loop (every 60s)
                │
                ▼ [GET /api/sync/queue] → pending items
                │
                ▼ [POST to cloud_url/api/sync/receive]
                        │
                        └──► Cloud confirms → DELETE from sync_queue

[Cloud Change]
        │
        ▼ POST /api/sync/receive (from cloud)
        │
[sync_service.receive_change()]
        │
        ├──► Validate payload
        ├──► Apply to local DB
        └──► Return {ok}
```

### 5.6 Alert Flow

```
[Sensor Threshold Crossed]
        │
        ▼ alert_service checks (every 60s)
        │
        ├──► Query sensor_data recent values
        ├──► Compare with alert_rules
        └──► IF exceeded → INSERT alerts
                │
                ▼ Push notification (if enabled)
                │
                └──► notification_service.send_push()

[User Acknowledges]
        │
        ▼ POST /api/alerts/{id}/acknowledge
        │
        └──► UPDATE alerts SET acknowledged=true, acknowledged_at=NOW()
```

---

## 6. View- API Mapping

| View File | Primary API Domain | Secondary APIs |
|-----------|-------------------|----------------|
| `dashboard.js` | `GET /api/farm/cycles?status=active` | `/health`, `/api/notifications/care-status` |
| `barns.js` | `/api/farm/barns` | `/api/farm/farms`, `/api/devices` |
| `cycles.js` | `/api/farm/cycles` | `/api/farm/barns` |
| `cycle-detail.js` | `GET /api/farm/cycles/{id}/dashboard` | All care history endpoints |
| `care.js` | All `/api/farm/care/*` endpoints | `/api/farm/cycles`, `/api/farm/products`, `/api/farm/warehouses`, `/api/vaccine-schedules` |
| `care-daily.js` | Feed, Death, Water | Cycles, Warehouses |
| `care-records.js` | Weight, Medication, Health | Cycles, Products |
| `inventory.js` | `/api/farm/inventory` | `/api/farm/warehouses`, `/api/farm/products` |
| `warehouses.js` | `/api/farm/warehouses` | `/api/farm/warehouse-zones` |
| `products.js` | `/api/farm/products` | `/api/farm/suppliers` |
| `feeds.js` | `/api/farm/feed-brands`, `/api/farm/feed-types` | - |
| `medications.js` | `/api/farm/medications` | - |
| `vaccines.js` | `/api/farm/vaccine-programs`, `/api/farm/vaccine-schedules` | `/api/farm/cycles` |
| `devices.js` | `/api/devices` | `/api/devices/types` |
| `sensors.js` | `/api/sensors/latest`, `/api/sensors/history` | `/api/farm/barns` |
| `bats.js` | `/api/bats/barns/{barn_id}` | `/api/farm/barns` |
| `equipment.js` | `/api/equipment` | `/api/equipment/types`, `/api/devices` |
| `cameras.js` | `/api/cameras` | `/api/cameras/status/all` |
| `automation.js` | `/api/automation/rules` | `/api/devices` |
| `alerts.js` | `/api/alerts` | `/api/farm/barns`, `/api/alerts/rules` |
| `notifications.js` | `/api/notifications/*` | - |
| `sync.js` | `/api/sync/*` | - |
| `chat.js` | `/api/chat/query` | - |
| `ops-hub.js` | Multiple (cycles, barns, care-status, sensors) | - |

---

## 7. Service Layer (Business Logic)

| Service | File | Responsibilities |
|---------|------|-------------------|
| `farm_service` | `src/farm/farm_service.py` | Farm CRUD |
| `barn_service` | `src/farm/barn_service.py` | Barn CRUD, default warehouses |
| `cycle_service` | `src/farm/cycle_service.py` | Cycle CRUD, close, count update |
| `inventory_service` | `src/farm/inventory_service.py` | Import, export, transfer, alerts |
| `care_service` | `src/farm/care_service.py` | Feed, death, med, weight, sale, water, health logs |
| `feed_service` | `src/farm/feed_service.py` | Feed brands, types |
| `medication_service` | `src/farm/medication_service.py` | Medication CRUD |
| `vaccine_service` | `src/farm/vaccine_service.py` | Vaccine programs, schedules |
| `supplier_service` | `src/farm/supplier_service.py` | Supplier CRUD |
| `health_service` | `src/farm/health_service.py` | Health notes |
| `device_service` | `src/iot/device_service.py` | Device management, ping |
| `bat_service` | `src/iot/bat_service.py` | Bat control, logs |
| `alert_service` | `src/services/alert_service.py` | Sensor threshold monitoring |
| `automation_service` | `src/services/automation_service.py` | Cron-based relay automation |
| `vaccine_notification_service` | `src/iot/vaccine_notification_service.py` | Vaccine reminders |
| `care_notification_service` | `src/iot/care_notification_service.py` | Daily care compliance alerts |
| `weight_notification_service` | `src/iot/weight_notification_service.py` | Weight reminders |
| `ai_logic_service` | `src/services/ai_logic_service.py` | AI rule execution |
| `sync_service` | `src/sync/sync_service.py` | Cloud sync |
| `notification_service` | `src/services/notification_service.py` | Push notifications |