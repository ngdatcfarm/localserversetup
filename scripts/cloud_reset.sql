-- ============================================================
-- CLOUD DATABASE RESET SCRIPT
-- cfarm_app_raw → Clean schema matching Local
-- Date: 2026-04-04
-- Purpose: Reset Cloud to match Local schema (no production data)
-- ============================================================
-- Run as: mysql -u cfarm_user -p cfarm_app_raw < cloud_reset.sql
-- ============================================================

-- ============================================================
-- PHASE 1: DROP OLD TABLES (that don't match Local)
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Tables to DROP (replaced by new schema)
DROP TABLE IF EXISTS `env_readings`;
DROP TABLE IF EXISTS `env_weather`;
DROP TABLE IF EXISTS `inventory_stock`;
DROP TABLE IF EXISTS `inventory_consumable_assets`;
DROP TABLE IF EXISTS `inventory_items`;      -- replaced by products
DROP TABLE IF EXISTS `inventory_purchases`;  -- replaced by purchase_orders
DROP TABLE IF EXISTS `inventory_sales`;      -- replaced by inventory_transactions
DROP TABLE IF EXISTS `device_pings`;         -- replaced by device_states

-- Tables to RECREATE (schema changes needed)
DROP TABLE IF EXISTS `barns`;
DROP TABLE IF EXISTS `cycles`;
DROP TABLE IF EXISTS `care_feeds`;
DROP TABLE IF EXISTS `care_deaths`;
DROP TABLE IF EXISTS `care_medications`;
DROP TABLE IF EXISTS `care_sales`;
DROP TABLE IF EXISTS `care_litters`;
DROP TABLE IF EXISTS `care_expenses`;
DROP TABLE IF EXISTS `feed_brands`;
DROP TABLE IF EXISTS `feed_types`;
DROP TABLE IF EXISTS `feed_trough_checks`;
DROP TABLE IF EXISTS `medications`;
DROP TABLE IF EXISTS `vaccine_brands`;
DROP TABLE IF EXISTS `vaccine_programs`;
DROP TABLE IF EXISTS `vaccine_program_items`;
DROP TABLE IF EXISTS `vaccine_schedules`;
DROP TABLE IF EXISTS `weight_sessions`;
DROP TABLE IF EXISTS `weight_samples`;
DROP TABLE IF EXISTS `health_notes`;
DROP TABLE IF EXISTS `devices`;
DROP TABLE IF EXISTS `device_types`;
DROP TABLE IF EXISTS `device_channels`;
DROP TABLE IF EXISTS `device_states`;
DROP TABLE IF EXISTS `device_state_log`;
DROP TABLE IF EXISTS `device_commands`;
DROP TABLE IF EXISTS `device_firmwares`;
DROP TABLE IF EXISTS `curtain_configs`;
DROP TABLE IF EXISTS `cycle_daily_snapshots`;
DROP TABLE IF EXISTS `cycle_feed_programs`;
DROP TABLE IF EXISTS `cycle_feed_program_items`;
DROP TABLE IF EXISTS `cycle_feed_stages`;
DROP TABLE IF EXISTS `cycle_splits`;
DROP TABLE IF EXISTS `inventory_transactions`;
DROP TABLE IF EXISTS `suppliers`;
DROP TABLE IF EXISTS `sensor_readings`;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- PHASE 2: CREATE NEW TABLES (matching Local schema)
-- ============================================================

-- --------------------------------------------------------
-- FARMS (NEW - top-level entity)
-- --------------------------------------------------------
CREATE TABLE `farms` (
  `id` VARCHAR(50) PRIMARY KEY,
  `name` VARCHAR(200) NOT NULL,
  `address` TEXT,
  `contact_name` VARCHAR(100),
  `contact_phone` VARCHAR(20),
  `contact_email` VARCHAR(100),
  `notes` TEXT,
  `active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `farms` (`id`, `name`, `active`) VALUES ('farm-01', 'Trang trai chinh', TRUE);

-- --------------------------------------------------------
-- BARNS (updated with farm_id)
-- --------------------------------------------------------
CREATE TABLE `barns` (
  `id` VARCHAR(50) PRIMARY KEY,
  `farm_id` VARCHAR(50) DEFAULT 'farm-01',
  `number` TINYINT UNSIGNED COMMENT 'So thu tu chuong 1-9',
  `name` VARCHAR(200) NOT NULL,
  `capacity` INT COMMENT 'Suc chua toi da',
  `length_m` DECIMAL(5,2) COMMENT 'Chieu dai (m)',
  `width_m` DECIMAL(5,2) COMMENT 'Chieu rong (m)',
  `height_m` DECIMAL(5,2) COMMENT 'Chieu cao (m)',
  `construction_cost` DECIMAL(12,2) COMMENT 'Chi phi xay dung',
  `construction_year` INT,
  `expected_lifespan_years` INT DEFAULT 15,
  `construction_type` VARCHAR(50),
  `status` ENUM('active','inactive') DEFAULT 'active',
  `note` TEXT,
  `active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- WAREHOUSES (NEW)
-- --------------------------------------------------------
CREATE TABLE `warehouses` (
  `id` VARCHAR(50) PRIMARY KEY,
  `farm_id` VARCHAR(50) DEFAULT 'farm-01',
  `barn_id` VARCHAR(50) DEFAULT NULL COMMENT 'NULL = central warehouse',
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `warehouse_type` ENUM('feed','medication','equipment','consumable','mixed') DEFAULT 'mixed',
  `is_central` BOOLEAN DEFAULT FALSE,
  `address` TEXT,
  `length_m` DECIMAL(5,2),
  `width_m` DECIMAL(5,2),
  `height_m` DECIMAL(5,2),
  `capacity_kg` DECIMAL(10,2),
  `status` ENUM('active','inactive') DEFAULT 'active',
  `note` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`farm_id`) REFERENCES `farms`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Central warehouse for medication and consumable equipment
INSERT INTO `warehouses` (`id`, `code`, `name`, `is_central`, `warehouse_type`, `status`)
VALUES ('WH-CENTRAL', 'WH-CENTRAL', 'Kho tong - Thuoc & Vat tu tieu hao', TRUE, 'mixed', 'active');

-- --------------------------------------------------------
-- WAREHOUSE_ZONES (NEW)
-- --------------------------------------------------------
CREATE TABLE `warehouse_zones` (
  `id` SERIAL PRIMARY KEY,
  `warehouse_id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `zone_type` ENUM('receiving','storage','quarantine','expired','returns') NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- PRODUCTS (NEW - central catalog)
-- --------------------------------------------------------
CREATE TABLE `products` (
  `id` SERIAL PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `product_type` ENUM('feed','medication','equipment','consumable') NOT NULL,
  `unit` VARCHAR(20) DEFAULT 'kg',
  `supplier_id` BIGINT UNSIGNED DEFAULT NULL,
  `price_per_unit` DECIMAL(12,2),
  `min_stock_alert` DECIMAL(12,2) DEFAULT 0,
  `reorder_point` DECIMAL(12,2) DEFAULT 0,
  `barcode` VARCHAR(100),
  `description` TEXT,
  `active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- SUPPLIERS (expanded)
-- --------------------------------------------------------
CREATE TABLE `suppliers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `contact_name` VARCHAR(100),
  `phone` VARCHAR(20),
  `email` VARCHAR(100),
  `address` TEXT,
  `city` VARCHAR(100),
  `tax_id` VARCHAR(50) COMMENT 'Ma so thue',
  `bank_name` VARCHAR(100),
  `bank_account` VARCHAR(50),
  `bank_account_holder` VARCHAR(200),
  `categories` JSON COMMENT 'ARRAY[feed, medication, equipment]',
  `lead_time_days` INT DEFAULT 7,
  `payment_terms` VARCHAR(50) COMMENT 'net30, cod, prepaid',
  `note` TEXT,
  `status` ENUM('active','inactive') DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- FEED_BRANDS (updated with product_id FK)
-- --------------------------------------------------------
CREATE TABLE `feed_brands` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT DEFAULT NULL,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `kg_per_bag` DECIMAL(6,2) NOT NULL,
  `manufacturer` VARCHAR(200),
  `country_of_origin` VARCHAR(100),
  `note` TEXT,
  `status` ENUM('active','inactive') DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- FEED_TYPES (updated with product_id FK)
-- --------------------------------------------------------
CREATE TABLE `feed_types` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT DEFAULT NULL,
  `feed_brand_id` BIGINT UNSIGNED DEFAULT NULL,
  `code` VARCHAR(50),
  `name` VARCHAR(200) NOT NULL,
  `price_per_bag` DECIMAL(10,2),
  `protein_pct` DECIMAL(5,2) COMMENT 'Protein %',
  `energy_kcal_kg` DECIMAL(10,2),
  `suggested_stage` ENUM('starter','grower','finisher') COMMENT 'Giai doan',
  `bird_type` VARCHAR(50) COMMENT 'broiler, layer, breeder',
  `bag_size_kg` DECIMAL(5,2),
  `shelf_life_months` INT,
  `storage_requirements` TEXT,
  `note` TEXT,
  `status` ENUM('active','inactive') DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`feed_brand_id`) REFERENCES `feed_brands`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- MEDICATIONS (updated with product_id FK)
-- --------------------------------------------------------
CREATE TABLE `medications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT DEFAULT NULL,
  `code` VARCHAR(50) UNIQUE,
  `name` VARCHAR(200) NOT NULL,
  `medication_type` VARCHAR(50) COMMENT 'antibiotic, vaccine, vitamin, disinfectant',
  `category` VARCHAR(50),
  `active_ingredient` VARCHAR(200),
  `manufacturer` VARCHAR(200),
  `country_of_origin` VARCHAR(100),
  `unit` VARCHAR(20) COMMENT 'ml, g, tablet, dose',
  `concentration` VARCHAR(50) COMMENT '500mg/ml, 10%',
  `recommended_dose` TEXT,
  `route_of_administration` VARCHAR(50) COMMENT 'oral, injection, drinking water',
  `withdrawal_days` INT COMMENT 'Ngay ngung thuoc truoc giet mo',
  `storage_conditions` TEXT,
  `shelf_life_months` INT,
  `price_per_unit` DECIMAL(12,2),
  `note` TEXT,
  `status` ENUM('active','inactive') DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- VACCINE_PROGRAMS
-- --------------------------------------------------------
CREATE TABLE `vaccine_programs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `bird_type` VARCHAR(50) COMMENT 'broiler, layer, breeder',
  `description` TEXT,
  `note` TEXT,
  `active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- VACCINE_PROGRAM_ITEMS (updated with product_id FK)
-- --------------------------------------------------------
CREATE TABLE `vaccine_program_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `program_id` BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'FK to medications',
  `vaccine_name` VARCHAR(200) NOT NULL,
  `day_age` INT NOT NULL COMMENT 'Ngay tuoi tiem',
  `method` VARCHAR(50) COMMENT 'injection, eye_drop, drinking_water, spray',
  `route` VARCHAR(50) COMMENT 'subcutaneous, intramuscular, oral',
  `dose_per_bird` VARCHAR(50),
  `dilution` TEXT,
  `remind_days` INT DEFAULT 1,
  `sort_order` INT DEFAULT 0,
  `note` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`program_id`) REFERENCES `vaccine_programs`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`product_id`) REFERENCES `medications`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- EQUIPMENT_TYPES (NEW - for IoT equipment)
-- --------------------------------------------------------
CREATE TABLE `equipment_types` (
  `id` SERIAL PRIMARY KEY,
  `product_id` INT DEFAULT NULL COMMENT 'optional: if also purchasable',
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `power_watts` INT,
  `voltage_v` INT,
  `current_amp` DECIMAL(5,2),
  `mqtt_protocol` JSON COMMENT 'Command/telemetry structure',
  `description` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- DEVICE_TYPES (expanded with mqtt_protocol)
-- --------------------------------------------------------
CREATE TABLE `device_types` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `device_class` VARCHAR(20) COMMENT 'relay, sensor, mixed, gateway',
  `channel_count` INT DEFAULT 0,
  `mqtt_protocol` JSON COMMENT 'Protocol definition JSON',
  `firmware_version` VARCHAR(50),
  `firmware_url` VARCHAR(500),
  `description` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- DEVICES
-- --------------------------------------------------------
CREATE TABLE `devices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `barn_id` VARCHAR(50) DEFAULT NULL,
  `device_type_id` BIGINT UNSIGNED DEFAULT NULL,
  `device_code` VARCHAR(100) UNIQUE NOT NULL COMMENT 'ESP32 chip ID or serial',
  `name` VARCHAR(200) NOT NULL,
  `location` VARCHAR(100) COMMENT 'Vi tri lap dat',
  `status` ENUM('online','offline','maintenance') DEFAULT 'offline',
  `last_heartbeat_at` TIMESTAMP NULL,
  `note` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`device_type_id`) REFERENCES `device_types`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- DEVICE_CHANNELS
-- --------------------------------------------------------
CREATE TABLE `device_channels` (
  `id` SERIAL PRIMARY KEY,
  `device_id` BIGINT UNSIGNED NOT NULL,
  `channel_index` INT NOT NULL COMMENT '0-7 for 8CH relay',
  `channel_type` VARCHAR(20) DEFAULT 'relay' COMMENT 'relay, pwm, sensor',
  `function` VARCHAR(100) COMMENT 'fan, light, curtain_up, curtain_down',
  `equipment_id` INT DEFAULT NULL COMMENT 'FK to equipment (nullable)',
  `relay_type` VARCHAR(20) COMMENT 'nc, no',
  `pwm_frequency` INT COMMENT 'Hz for dimming',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- DEVICE_STATES
-- --------------------------------------------------------
CREATE TABLE `device_states` (
  `id` SERIAL PRIMARY KEY,
  `device_id` BIGINT UNSIGNED NOT NULL,
  `channel_index` INT NOT NULL,
  `state` VARCHAR(20) DEFAULT 'off' COMMENT 'on, off, auto',
  `value` INT DEFAULT 0 COMMENT 'PWM value 0-255',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- DEVICE_STATE_LOG
-- --------------------------------------------------------
CREATE TABLE `device_state_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `device_id` BIGINT UNSIGNED NOT NULL,
  `channel_index` INT NOT NULL,
  `old_state` VARCHAR(20),
  `new_state` VARCHAR(20) NOT NULL,
  `old_value` INT,
  `new_value` INT,
  `triggered_by` VARCHAR(50) COMMENT 'manual, schedule, automation',
  `recorded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- DEVICE_COMMANDS
-- --------------------------------------------------------
CREATE TABLE `device_commands` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `device_id` BIGINT UNSIGNED NOT NULL,
  `command` VARCHAR(50) NOT NULL COMMENT 'relay_on, relay_off, pwm_set',
  `channel_index` INT DEFAULT NULL,
  `value` INT DEFAULT NULL COMMENT 'PWM value 0-255',
  `priority` INT DEFAULT 5 COMMENT '1=low, 5=normal, 10=high',
  `expires_at` TIMESTAMP NULL,
  `response_payload` JSON,
  `status` ENUM('pending','sent','delivered','failed') DEFAULT 'pending',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- DEVICE_TELEMETRY (NEW)
-- --------------------------------------------------------
CREATE TABLE `device_telemetry` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `device_id` BIGINT UNSIGNED NOT NULL,
  `raw_payload` JSON NOT NULL COMMENT 'Raw telemetry from device',
  `parsed_data` JSON COMMENT 'Parsed sensor values',
  `recorded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- DEVICE_ALERTS (NEW)
-- --------------------------------------------------------
CREATE TABLE `device_alerts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `device_id` BIGINT UNSIGNED NOT NULL,
  `alert_type` VARCHAR(50) NOT NULL COMMENT 'offline, low_signal, high_temp',
  `message` TEXT,
  `acknowledged` BOOLEAN DEFAULT FALSE,
  `acknowledged_by` VARCHAR(100),
  `acknowledged_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- DEVICE_CONFIG_VERSIONS (NEW)
-- --------------------------------------------------------
CREATE TABLE `device_config_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `device_id` BIGINT UNSIGNED NOT NULL,
  `config_version` INT NOT NULL,
  `config_hash` VARCHAR(64) COMMENT 'SHA256 of config',
  `config_payload` JSON NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- DEVICE_FIRMWARES
-- --------------------------------------------------------
CREATE TABLE `device_firmwares` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `device_type_id` BIGINT UNSIGNED DEFAULT NULL,
  `version` VARCHAR(50) NOT NULL,
  ` firmware_url` VARCHAR(500),
  `changelog` TEXT,
  `is_active` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`device_type_id`) REFERENCES `device_types`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- EQUIPMENT (NEW)
-- --------------------------------------------------------
CREATE TABLE `equipment` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `barn_id` VARCHAR(50) DEFAULT NULL,
  `equipment_type_id` INT DEFAULT NULL,
  `name` VARCHAR(200) NOT NULL,
  `equipment_type` VARCHAR(50) COMMENT 'fan, heater, light, curtain',
  `model` VARCHAR(100),
  `serial_no` VARCHAR(100),
  `power_watts` INT,
  `status` ENUM('active','inactive','maintenance') DEFAULT 'active',
  `install_date` DATE,
  `warranty_until` DATE,
  `purchase_price` DECIMAL(12,2),
  `runtime_hours` DECIMAL(10,1) DEFAULT 0,
  `energy_consumption_kwh` DECIMAL(10,2) DEFAULT 0,
  `maintenance_interval_days` INT,
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`equipment_type_id`) REFERENCES `equipment_types`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- EQUIPMENT_PARTS (NEW)
-- --------------------------------------------------------
CREATE TABLE `equipment_parts` (
  `id` SERIAL PRIMARY KEY,
  `equipment_id` INT UNSIGNED NOT NULL,
  `part_name` VARCHAR(100) NOT NULL COMMENT 'bearing, belt, blade',
  `part_code` VARCHAR(50),
  `replacement_interval_hours` INT,
  `last_replaced_at` TIMESTAMP NULL,
  `next_replacement_at` TIMESTAMP NULL,
  `notes` TEXT,
  FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- EQUIPMENT_READINGS (NEW)
-- --------------------------------------------------------
CREATE TABLE `equipment_readings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `equipment_id` INT UNSIGNED NOT NULL,
  `temperature` DECIMAL(5,2) COMMENT 'Motor temperature',
  `vibration` DECIMAL(5,2) COMMENT 'Vibration mm/s',
  `current_amp` DECIMAL(5,2) COMMENT 'Running current',
  `recorded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- EQUIPMENT_PERFORMANCE (NEW)
-- --------------------------------------------------------
CREATE TABLE `equipment_performance` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `equipment_id` INT UNSIGNED NOT NULL,
  `period` ENUM('daily','weekly','monthly') NOT NULL,
  `runtime_hours` DECIMAL(6,2),
  `energy_consumption_kwh` DECIMAL(10,2),
  `avg_current_amp` DECIMAL(5,2),
  `efficiency_pct` DECIMAL(5,2),
  `start_reading_id` BIGINT UNSIGNED,
  `end_reading_id` BIGINT UNSIGNED,
  `recorded_at` DATE NOT NULL,
  FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- EQUIPMENT_ASSIGNMENT_LOG (NEW)
-- --------------------------------------------------------
CREATE TABLE `equipment_assignment_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `device_channel_id` INT NOT NULL,
  `equipment_id` INT UNSIGNED DEFAULT NULL,
  `action` ENUM('assign','unassign','change') NOT NULL,
  `changed_by` VARCHAR(100),
  `changed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`device_channel_id`) REFERENCES `device_channels`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- EQUIPMENT_COMMAND_LOG (NEW)
-- --------------------------------------------------------
CREATE TABLE `equipment_command_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `equipment_id` INT UNSIGNED NOT NULL,
  `device_channel_id` INT DEFAULT NULL,
  `command` VARCHAR(50) NOT NULL COMMENT 'on, off, set_speed',
  `value` INT,
  `triggered_by` VARCHAR(50),
  `recorded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`device_channel_id`) REFERENCES `device_channels`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- INVENTORY (NEW model - per warehouse, replaces inventory_stock)
-- --------------------------------------------------------
CREATE TABLE `inventory` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `warehouse_id` VARCHAR(50) NOT NULL,
  `product_id` INT NOT NULL,
  `batch_number` VARCHAR(50),
  `quantity` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `reserved_quantity` DECIMAL(12,2) DEFAULT 0,
  `expiry_date` DATE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- INVENTORY_TRANSACTIONS
-- --------------------------------------------------------
CREATE TABLE `inventory_transactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `warehouse_id` VARCHAR(50) NOT NULL,
  `txn_type` ENUM('purchase','transfer_out','transfer_in','use_feed','use_medicine','use_litter','use_consumable','sell','adjust','dispose') NOT NULL,
  `quantity` DECIMAL(12,2) NOT NULL,
  `reference_type` VARCHAR(50) DEFAULT NULL COMMENT 'care_feeds, care_medications, etc.',
  `reference_id` BIGINT UNSIGNED DEFAULT NULL,
  `barn_id` VARCHAR(50) DEFAULT NULL,
  `cycle_id` BIGINT UNSIGNED DEFAULT NULL,
  `unit_price` DECIMAL(12,2),
  `total_amount` DECIMAL(15,2),
  `recorded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `note` TEXT,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- INVENTORY_ALERTS (NEW)
-- --------------------------------------------------------
CREATE TABLE `inventory_alerts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `inventory_id` BIGINT UNSIGNED NOT NULL,
  `alert_type` ENUM('low_stock','expiry','reorder') NOT NULL,
  `message` TEXT,
  `acknowledged` BOOLEAN DEFAULT FALSE,
  `acknowledged_by` VARCHAR(100),
  `acknowledged_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`inventory_id`) REFERENCES `inventory`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- INVENTORY_SNAPSHOTS (NEW)
-- --------------------------------------------------------
CREATE TABLE `inventory_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `warehouse_id` VARCHAR(50) NOT NULL,
  `snapshot_date` DATE NOT NULL,
  `total_items` INT,
  `total_quantity` DECIMAL(12,2),
  `total_value` DECIMAL(15,2),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- PURCHASE_ORDERS (NEW)
-- --------------------------------------------------------
CREATE TABLE `purchase_orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `supplier_id` BIGINT UNSIGNED NOT NULL,
  `order_number` VARCHAR(50) UNIQUE NOT NULL,
  `order_date` DATE NOT NULL,
  `expected_delivery_date` DATE,
  `total_amount` DECIMAL(15,2),
  `status` ENUM('draft','ordered','partial','received','cancelled') DEFAULT 'draft',
  `note` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- PURCHASE_ORDER_ITEMS (NEW)
-- --------------------------------------------------------
CREATE TABLE `purchase_order_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `purchase_order_id` BIGINT UNSIGNED NOT NULL,
  `product_id` INT NOT NULL,
  `quantity` DECIMAL(12,2) NOT NULL,
  `unit_price` DECIMAL(12,2) NOT NULL,
  `received_quantity` DECIMAL(12,2) DEFAULT 0,
  `line_total` DECIMAL(15,2),
  FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- STOCK_VALUATION (NEW)
-- --------------------------------------------------------
CREATE TABLE `stock_valuation` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `warehouse_id` VARCHAR(50) NOT NULL,
  `product_id` INT NOT NULL,
  `valuation_date` DATE NOT NULL,
  `quantity` DECIMAL(12,2),
  `unit_cost` DECIMAL(12,2),
  `total_value` DECIMAL(15,2),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- SENSOR_TYPES (NEW)
-- --------------------------------------------------------
CREATE TABLE `sensor_types` (
  `id` SERIAL PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `unit` VARCHAR(20),
  `data_type` VARCHAR(20) DEFAULT 'numeric' COMMENT 'numeric, boolean, categorical',
  `typical_range` JSON COMMENT '{"min": -40, "max": 80}',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- SENSORS (NEW)
-- --------------------------------------------------------
CREATE TABLE `sensors` (
  `id` SERIAL PRIMARY KEY,
  `sensor_type_id` INT NOT NULL,
  `barn_id` VARCHAR(50) DEFAULT NULL,
  `device_id` VARCHAR(50) DEFAULT NULL COMMENT 'Link to IoT device',
  `name` VARCHAR(200) NOT NULL,
  `location` VARCHAR(100) COMMENT 'inside, outside, north_corner',
  `calibration_date` DATE,
  `reading_interval_seconds` INT DEFAULT 60,
  `status` ENUM('active','inactive','faulty') DEFAULT 'active',
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`sensor_type_id`) REFERENCES `sensor_types`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- SENSOR_DATA (NEW - single table replacing env_readings + env_weather)
-- --------------------------------------------------------
CREATE TABLE `sensor_data` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `sensor_id` INT NOT NULL,
  `barn_id` VARCHAR(50) DEFAULT NULL,
  `cycle_id` BIGINT UNSIGNED DEFAULT NULL,
  `day_age` SMALLINT UNSIGNED DEFAULT NULL,
  `sensor_type` VARCHAR(50) NOT NULL COMMENT 'temperature, humidity, nh3, co2...',
  `value` DECIMAL(10,2) NOT NULL,
  `quality` VARCHAR(20) DEFAULT 'good' COMMENT 'good, suspect, bad',
  `recorded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_sensor_time` (`sensor_id`, `recorded_at`),
  FOREIGN KEY (`sensor_id`) REFERENCES `sensors`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- SENSOR_ALERTS (NEW)
-- --------------------------------------------------------
CREATE TABLE `sensor_alerts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `sensor_id` INT NOT NULL,
  `alert_type` VARCHAR(50) NOT NULL COMMENT 'high, low, offline, spike',
  `threshold_value` DECIMAL(10,2),
  `actual_value` DECIMAL(10,2),
  `duration_seconds` INT,
  `acknowledged` BOOLEAN DEFAULT FALSE,
  `acknowledged_by` VARCHAR(100),
  `acknowledged_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`sensor_id`) REFERENCES `sensors`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- SENSOR_DAILY_SUMMARY (NEW)
-- --------------------------------------------------------
CREATE TABLE `sensor_daily_summary` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `sensor_id` INT NOT NULL,
  `date` DATE NOT NULL,
  `avg_value` DECIMAL(10,2),
  `min_value` DECIMAL(10,2),
  `max_value` DECIMAL(10,2),
  `percentile_10` DECIMAL(10,2),
  `percentile_90` DECIMAL(10,2),
  `reading_count` INT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`sensor_id`) REFERENCES `sensors`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- SENSOR_THRESHOLD_CONFIGS (NEW)
-- --------------------------------------------------------
CREATE TABLE `sensor_threshold_configs` (
  `id` SERIAL PRIMARY KEY,
  `sensor_id` INT NOT NULL,
  `alert_type` VARCHAR(20) NOT NULL COMMENT 'high, low',
  `threshold_value` DECIMAL(10,2),
  `enabled` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`sensor_id`) REFERENCES `sensors`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- SENSOR_CALIBRATIONS (NEW)
-- --------------------------------------------------------
CREATE TABLE `sensor_calibrations` (
  `id` SERIAL PRIMARY KEY,
  `sensor_id` INT NOT NULL,
  `calibration_date` DATE NOT NULL,
  `reference_value` DECIMAL(10,2),
  `measured_value` DECIMAL(10,2),
  `offset` DECIMAL(10,2),
  `technician` VARCHAR(100),
  `note` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`sensor_id`) REFERENCES `sensors`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- SENSOR_MAINTENANCE_LOG (NEW)
-- --------------------------------------------------------
CREATE TABLE `sensor_maintenance_log` (
  `id` SERIAL PRIMARY KEY,
  `sensor_id` INT NOT NULL,
  `maintenance_type` VARCHAR(50) NOT NULL COMMENT 'cleaning, repair, replacement, relocation',
  `performed_date` DATE NOT NULL,
  `description` TEXT,
  `performed_by` VARCHAR(100),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`sensor_id`) REFERENCES `sensors`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- CYCLES
-- --------------------------------------------------------
CREATE TABLE `cycles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `barn_id` VARCHAR(50) NOT NULL,
  `code` VARCHAR(50),
  `name` VARCHAR(200) NOT NULL,
  `breed` VARCHAR(100),
  `male_quantity` INT DEFAULT 0,
  `female_quantity` INT DEFAULT 0,
  `initial_quantity` INT NOT NULL COMMENT 'So luong luc bat dau',
  `current_quantity` INT,
  `purchase_price` DECIMAL(12,2),
  `stage` VARCHAR(20) DEFAULT 'chick' COMMENT 'chick, grower, adult',
  `flock_source` VARCHAR(20) COMMENT 'local, imported, hatchery',
  `start_date` DATE NOT NULL,
  `expected_end_date` DATE,
  `end_date` DATE,
  `parent_cycle_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Neu tach tu cycle khac',
  `split_date` DATE,
  `season` VARCHAR(20) COMMENT 'spring, summer, autumn, winter',
  `vaccine_program_id` BIGINT UNSIGNED DEFAULT NULL,
  `final_quantity` INT,
  `total_sold_weight_kg` DECIMAL(10,2),
  `total_revenue` DECIMAL(15,2),
  `close_reason` VARCHAR(20) COMMENT 'sold, mortality, other',
  `status` ENUM('active','closed','cancelled') DEFAULT 'active',
  `note` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`parent_cycle_id`) REFERENCES `cycles`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`vaccine_program_id`) REFERENCES `vaccine_programs`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- CARE_FEEDS
-- --------------------------------------------------------
CREATE TABLE `care_feeds` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `feed_type_id` BIGINT UNSIGNED NOT NULL,
  `barn_id` VARCHAR(50) DEFAULT NULL,
  `bags` DECIMAL(6,2) NOT NULL,
  `kg_actual` DECIMAL(8,2) NOT NULL,
  `remaining_pct` TINYINT UNSIGNED DEFAULT NULL COMMENT 'Cam con lai trong mang %',
  `meal` ENUM('morning','evening','other') NOT NULL DEFAULT 'morning',
  `recorded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `note` TEXT,
  FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`feed_type_id`) REFERENCES `feed_types`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- CARE_DEATHS (updated)
-- --------------------------------------------------------
CREATE TABLE `care_deaths` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `quantity` INT UNSIGNED NOT NULL COMMENT 'So conchet (quantity for sync)',
  `reason` VARCHAR(200) DEFAULT NULL COMMENT 'reason for sync',
  `death_category` ENUM('disease','accident','weak','unknown') DEFAULT 'unknown',
  `symptoms` TEXT,
  `image_path` VARCHAR(500) DEFAULT NULL,
  `note` TEXT,
  `recorded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- CARE_MEDICATIONS
-- --------------------------------------------------------
CREATE TABLE `care_medications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'FK to medications',
  `barn_id` VARCHAR(50) DEFAULT NULL,
  `dosage` DECIMAL(10,2) COMMENT 'So luong',
  `unit` VARCHAR(50) COMMENT 'ml, g, tablet',
  `method` VARCHAR(50) COMMENT ' oral, injection',
  `recorded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `note` TEXT,
  FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`product_id`) REFERENCES `medications`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- CARE_SALES
-- --------------------------------------------------------
CREATE TABLE `care_sales` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `quantity` INT UNSIGNED NOT NULL COMMENT 'count for sync',
  `gender` ENUM('male','female','mixed') DEFAULT 'mixed',
  `total_weight` DECIMAL(8,2) NOT NULL COMMENT 'weight_kg for sync',
  `unit_price` DECIMAL(10,2) COMMENT 'price_per_kg for sync',
  `total_amount` DECIMAL(15,2),
  `recorded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `note` TEXT,
  FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- CARE_LITTERS (NEW)
-- --------------------------------------------------------
CREATE TABLE `care_litters` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `barn_id` VARCHAR(50) DEFAULT NULL,
  `litter_date` DATE NOT NULL,
  `litter_type` ENUM('new','top_up','change') NOT NULL,
  `product_id` INT DEFAULT NULL COMMENT 'Vat lieu lot (rom, mun cui)',
  `quantity_kg` DECIMAL(10,2),
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- CARE_EXPENSES
-- --------------------------------------------------------
CREATE TABLE `care_expenses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `barn_id` VARCHAR(50) DEFAULT NULL,
  `expense_date` DATE NOT NULL,
  `expense_type` ENUM('feed','medication','labor','utility','other') NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `description` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- CARE_WEIGHTS
-- --------------------------------------------------------
CREATE TABLE `care_weights` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `barn_id` VARCHAR(50) DEFAULT NULL,
  `day_age` SMALLINT UNSIGNED NOT NULL,
  `sample_count` INT NOT NULL,
  `avg_weight_g` DECIMAL(6,2) NOT NULL COMMENT 'Trong luong trung binh (gram)',
  `weighed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- WEIGHT_SAMPLES (NEW)
-- --------------------------------------------------------
CREATE TABLE `weight_samples` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `session_id` BIGINT UNSIGNED NOT NULL,
  `weight_g` INT NOT NULL COMMENT 'Trong luong gram',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`session_id`) REFERENCES `care_weights`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- FEED_TROUGH_CHECKS (NEW)
-- --------------------------------------------------------
CREATE TABLE `feed_trough_checks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `barn_id` VARCHAR(50) DEFAULT NULL,
  `ref_feed_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Bua an duoc kiem tra',
  `remaining_pct` INT NOT NULL COMMENT ' % con lai 0-100',
  `checked_at` TIMESTAMP NOT NULL,
  `notes` TEXT,
  FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- VACCINE_SCHEDULES
-- --------------------------------------------------------
CREATE TABLE `vaccine_schedules` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `vaccine_program_item_id` BIGINT UNSIGNED DEFAULT NULL,
  `scheduled_date` DATE NOT NULL,
  `status` ENUM('pending','done','missed','skipped') DEFAULT 'pending',
  `actual_date` DATE,
  `note` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`vaccine_program_item_id`) REFERENCES `vaccine_program_items`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- HEALTH_NOTES
-- --------------------------------------------------------
CREATE TABLE `health_notes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `barn_id` VARCHAR(50) DEFAULT NULL,
  `day_age` SMALLINT UNSIGNED,
  `health_status` ENUM('good','concern','sick','critical') NOT NULL DEFAULT 'good',
  `symptoms` TEXT,
  `treatment` TEXT,
  `recorded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- WEIGHT_REMINDERS
-- --------------------------------------------------------
CREATE TABLE `weight_reminders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `remind_date` DATE NOT NULL,
  `reminded` BOOLEAN DEFAULT FALSE,
  `reminded_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- CYCLE_DAILY_SNAPSHOTS
-- --------------------------------------------------------
CREATE TABLE `cycle_daily_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `date` DATE NOT NULL,
  `day_age` SMALLINT UNSIGNED,
  `alive_male` INT,
  `alive_female` INT,
  `alive_total` INT,
  `bird_days_cumulative` DECIMAL(12,2),
  `feed_poured_kg` DECIMAL(8,2),
  `feed_consumed_kg` DECIMAL(8,2),
  `feed_cumulative_kg` DECIMAL(10,2),
  `avg_weight_g` DECIMAL(6,2),
  `biomass_kg` DECIMAL(10,2),
  `weight_produced_kg` DECIMAL(10,2),
  `fcr` DECIMAL(6,3),
  `mortality_count` INT,
  `sales_count` INT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- CYCLE_FEED_PROGRAMS (NEW)
-- --------------------------------------------------------
CREATE TABLE `cycle_feed_programs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `feed_brand_id` BIGINT UNSIGNED DEFAULT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE DEFAULT NULL COMMENT 'NULL = dang dung',
  `note` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`feed_brand_id`) REFERENCES `feed_brands`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- CYCLE_FEED_PROGRAM_ITEMS (NEW)
-- --------------------------------------------------------
CREATE TABLE `cycle_feed_program_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_feed_program_id` BIGINT UNSIGNED NOT NULL,
  `inventory_item_id` INT DEFAULT NULL COMMENT 'FK to products',
  `stage` ENUM('chick','grower','adult') NOT NULL,
  `status` ENUM('active','inactive') DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cycle_feed_program_id`) REFERENCES `cycle_feed_programs`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`inventory_item_id`) REFERENCES `products`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- CYCLE_FEED_STAGES (NEW)
-- --------------------------------------------------------
CREATE TABLE `cycle_feed_stages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `cycle_id` BIGINT UNSIGNED NOT NULL,
  `stage` ENUM('chick','grower','adult') NOT NULL,
  `primary_feed_type_id` BIGINT UNSIGNED DEFAULT NULL,
  `mix_feed_type_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'NULL neu khong mix',
  `mix_ratio` INT COMMENT '% cua feed moi (10, 25, 50...)',
  `effective_date` DATE NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`primary_feed_type_id`) REFERENCES `feed_types`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`mix_feed_type_id`) REFERENCES `feed_types`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- CYCLE_SPLITS
-- --------------------------------------------------------
CREATE TABLE `cycle_splits` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `from_cycle_id` BIGINT UNSIGNED NOT NULL COMMENT 'Cycle goc',
  `to_cycle_id` BIGINT UNSIGNED NOT NULL COMMENT 'Cycle moi duoc tach vao',
  `quantity` INT NOT NULL COMMENT 'So con tach',
  `split_date` DATE NOT NULL,
  `note` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`from_cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`to_cycle_id`) REFERENCES `cycles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- CURTAIN_CONFIGS
-- --------------------------------------------------------
CREATE TABLE `curtain_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `curtain_code` VARCHAR(100) UNIQUE NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `barn_id` VARCHAR(50) DEFAULT NULL,
  `width_m` DECIMAL(5,2),
  `height_m` DECIMAL(5,2),
  `fabric_type` VARCHAR(50) COMMENT 'mesh, solid, polyethylene',
  `motor_power_watts` INT,
  `device_id` BIGINT UNSIGNED DEFAULT NULL,
  `up_channel` INT NOT NULL,
  `down_channel` INT NOT NULL,
  `full_up_seconds` FLOAT DEFAULT 60,
  `full_down_seconds` FLOAT DEFAULT 60,
  `current_position` INT DEFAULT 0 CHECK (`current_position` BETWEEN 0 AND 100),
  `auto_control_enabled` BOOLEAN DEFAULT FALSE,
  `min_position` INT DEFAULT 0,
  `max_position` INT DEFAULT 100,
  `wind_speed_max_kmh` DECIMAL(5,2) COMMENT 'Auto cuon len khi gio qua manh',
  `note` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`barn_id`) REFERENCES `barns`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- USERS (keep existing)
-- --------------------------------------------------------
-- Users table kept as-is from original schema
-- (skipped in this reset)

-- --------------------------------------------------------
-- SYNC TABLES (NEW - sync infrastructure)
-- --------------------------------------------------------
CREATE TABLE `sync_queue` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `table_name` VARCHAR(100) NOT NULL,
  `record_id` VARCHAR(100) NOT NULL,
  `action` VARCHAR(20) NOT NULL COMMENT 'insert, update, delete',
  `payload` JSON NOT NULL,
  `priority` INT DEFAULT 5 COMMENT '1=low, 5=normal, 10=high',
  `retry_count` INT DEFAULT 0,
  `max_retries` INT DEFAULT 5,
  `last_error` TEXT,
  `next_retry_at` TIMESTAMP NULL,
  `local_version` INT DEFAULT 1,
  `synced_version` INT DEFAULT 0,
  `synced` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `synced_at` TIMESTAMP NULL,
  INDEX `idx_sync_pending` (`synced`, `priority` DESC, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sync_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `direction` VARCHAR(10) NOT NULL COMMENT 'push, pull',
  `items_count` INT,
  `status` VARCHAR(20) NOT NULL COMMENT 'ok, error, partial',
  `error_msg` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sync_config` (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` TEXT,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sync_lock` (
  `lock_name` VARCHAR(50) PRIMARY KEY,
  `locked_by` VARCHAR(100),
  `locked_at` TIMESTAMP NULL,
  `expires_at` TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PHASE 3: INSERT SEED DATA
-- ============================================================

-- Default farm already inserted above

-- Default barn from original data (if exists)
-- INSERT INTO `barns` (`id`, `number`, `name`, `length_m`, `width_m`, `height_m`, `status`)
-- VALUES ('barn-01', 1, 'Chuong 1', 60.00, 12.00, 3.50, 'active');

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Cloud database reset completed successfully!' AS status;
