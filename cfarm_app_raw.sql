-- phpMyAdmin SQL Dump
-- version 5.1.1deb5ubuntu1
-- https://www.phpmyadmin.net/
--
-- Máy chủ: localhost:3306
-- Thời gian đã tạo: Th3 27, 2026 lúc 02:03 PM
-- Phiên bản máy phục vụ: 8.0.45-0ubuntu0.22.04.1
-- Phiên bản PHP: 8.1.2-1ubuntu2.23

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Cơ sở dữ liệu: `cfarm_app_raw`
--

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `barns`
--

CREATE TABLE `barns` (
  `id` bigint UNSIGNED NOT NULL,
  `number` tinyint UNSIGNED NOT NULL COMMENT 'Số thứ tự chuồng 1-9',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tên chuồng',
  `length_m` decimal(5,2) NOT NULL COMMENT 'Chiều dài (m)',
  `width_m` decimal(5,2) NOT NULL COMMENT 'Chiều rộng (m)',
  `height_m` decimal(5,2) NOT NULL COMMENT 'Chiều cao (m)',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Chuá»“ng nuÃ´i gÃ  â€” Ä‘Æ¡n vá»‹ váº­t lÃ½';

--
-- Đang đổ dữ liệu cho bảng `barns`
--

INSERT INTO `barns` (`id`, `number`, `name`, `length_m`, `width_m`, `height_m`, `status`, `note`, `created_at`) VALUES
(6, 1, 'Chuồng 1', '60.00', '12.00', '3.50', 'active', NULL, '2026-03-14 14:10:44');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `care_deaths`
--

CREATE TABLE `care_deaths` (
  `id` bigint UNSIGNED NOT NULL,
  `cycle_id` bigint UNSIGNED NOT NULL,
  `quantity` int UNSIGNED NOT NULL COMMENT 'Sá»‘ con cháº¿t (báº¯t buá»™c)',
  `reason` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'LÃ½ do (bá»‡nh, tai náº¡n, khÃ´ng rÃµ...)',
  `death_category` enum('disease','accident','weak','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown' COMMENT 'PhÃ¢n loáº¡i nguyÃªn nhÃ¢n',
  `symptoms` text COLLATE utf8mb4_unicode_ci COMMENT 'Triá»‡u chá»©ng quan sÃ¡t Ä‘Æ°á»£c',
  `health_note_id` bigint UNSIGNED DEFAULT NULL COMMENT 'Ghi chÃº sá»©c khá»e liÃªn quan',
  `image_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ÄÆ°á»ng dáº«n áº£nh (upload sau)',
  `note` text COLLATE utf8mb4_unicode_ci,
  `recorded_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ghi nháº­n gÃ  cháº¿t theo ngÃ y';

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `care_expenses`
--

CREATE TABLE `care_expenses` (
  `id` bigint UNSIGNED NOT NULL,
  `cycle_id` bigint UNSIGNED NOT NULL,
  `category` enum('electricity','labor','repair','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `label` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Tên chi phí tự nhập',
  `amount` decimal(15,0) UNSIGNED NOT NULL COMMENT 'Số tiền (VND)',
  `recorded_at` date NOT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `care_feeds`
--

CREATE TABLE `care_feeds` (
  `id` bigint UNSIGNED NOT NULL,
  `cycle_id` bigint UNSIGNED NOT NULL,
  `feed_type_id` bigint UNSIGNED NOT NULL COMMENT 'MÃ£ cÃ¡m thá»±c táº¿ dÃ¹ng láº§n nÃ y',
  `bags` decimal(6,2) NOT NULL COMMENT 'Sá»‘ bao (cÃ³ thá»ƒ lÃ  0.5 bao)',
  `kg_actual` decimal(8,2) NOT NULL COMMENT 'Sá»‘ kg thá»±c táº¿ = bags Ã— kg_per_bag',
  `remaining_pct` tinyint UNSIGNED DEFAULT NULL COMMENT 'CÃ¡m cÃ²n láº¡i trong mÃ¡ng (% Æ°á»›c lÆ°á»£ng, NULL = khÃ´ng ghi = coi nhÆ° 0)',
  `session` enum('morning','evening','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'morning',
  `note` text COLLATE utf8mb4_unicode_ci,
  `recorded_at` datetime NOT NULL COMMENT 'Thá»i Ä‘iá»ƒm cho Äƒn thá»±c táº¿',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='LÆ°á»£t cho Äƒn hÃ ng ngÃ y theo chu ká»³';

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `care_litters`
--

CREATE TABLE `care_litters` (
  `id` bigint UNSIGNED NOT NULL,
  `cycle_id` bigint UNSIGNED NOT NULL,
  `item_id` bigint UNSIGNED DEFAULT NULL,
  `quantity` decimal(8,2) NOT NULL,
  `unit` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'bao',
  `note` text COLLATE utf8mb4_unicode_ci,
  `recorded_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `care_medications`
--

CREATE TABLE `care_medications` (
  `id` bigint UNSIGNED NOT NULL,
  `cycle_id` bigint UNSIGNED NOT NULL,
  `medication_id` bigint UNSIGNED DEFAULT NULL COMMENT 'NULL náº¿u nháº­p tay khÃ´ng qua danh má»¥c',
  `medication_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'TÃªn thuá»‘c (copy tá»« danh má»¥c hoáº·c nháº­p tay)',
  `dosage` decimal(10,2) NOT NULL COMMENT 'Liá»u lÆ°á»£ng',
  `unit` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ÄÆ¡n vá»‹: ml, g, viÃªn...',
  `method` enum('water','inject','feed_mix','other') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'CÃ¡ch dÃ¹ng',
  `note` text COLLATE utf8mb4_unicode_ci,
  `recorded_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ghi nháº­n dÃ¹ng thuá»‘c/vaccine';

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `care_sales`
--

CREATE TABLE `care_sales` (
  `id` bigint UNSIGNED NOT NULL,
  `cycle_id` bigint UNSIGNED NOT NULL,
  `quantity` int UNSIGNED DEFAULT NULL COMMENT 'Sá»‘ con bÃ¡n (NULL náº¿u khÃ´ng Ä‘áº¿m)',
  `gender` enum('male','female','mixed') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Giá»›i tÃ­nh náº¿u cÃ³',
  `weight_kg` decimal(10,2) NOT NULL COMMENT 'Tá»•ng cÃ¢n náº·ng (báº¯t buá»™c)',
  `price_per_kg` decimal(10,2) NOT NULL COMMENT 'GiÃ¡/kg',
  `total_amount` decimal(15,2) NOT NULL COMMENT 'Tá»•ng tiá»n = weight_kg Ã— price_per_kg',
  `note` text COLLATE utf8mb4_unicode_ci,
  `recorded_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ghi nháº­n xuáº¥t bÃ¡n gÃ ';

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `curtain_configs`
--

CREATE TABLE `curtain_configs` (
  `id` int NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `barn_id` bigint UNSIGNED NOT NULL,
  `device_id` int NOT NULL,
  `up_channel_id` int NOT NULL,
  `down_channel_id` int NOT NULL,
  `full_up_seconds` decimal(5,1) DEFAULT '30.0',
  `full_down_seconds` decimal(5,1) DEFAULT '30.0',
  `current_position_pct` tinyint DEFAULT '0',
  `moving_state` enum('idle','moving_up','moving_down') COLLATE utf8mb4_unicode_ci DEFAULT 'idle',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_moved_at` datetime DEFAULT NULL,
  `moving_target_pct` tinyint DEFAULT NULL,
  `moving_started_at` datetime DEFAULT NULL,
  `moving_duration_seconds` decimal(5,1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `curtain_configs`
--

INSERT INTO `curtain_configs` (`id`, `name`, `barn_id`, `device_id`, `up_channel_id`, `down_channel_id`, `full_up_seconds`, `full_down_seconds`, `current_position_pct`, `moving_state`, `created_at`, `updated_at`, `last_moved_at`, `moving_target_pct`, `moving_started_at`, `moving_duration_seconds`) VALUES
(9, 'Bạt 1', 6, 45, 289, 290, '30.0', '30.0', 40, 'moving_up', '2026-03-19 20:15:38', '2026-03-20 10:51:45', NULL, 0, '2026-03-20 10:51:45', '12.0'),
(10, 'Bạt 2', 6, 45, 291, 292, '30.0', '30.0', 40, 'moving_up', '2026-03-19 20:15:45', '2026-03-20 10:51:46', NULL, 0, '2026-03-20 10:51:46', '12.0'),
(11, 'Bạt 3', 6, 45, 293, 294, '30.0', '30.0', 40, 'moving_up', '2026-03-19 20:15:52', '2026-03-20 10:51:47', NULL, 0, '2026-03-20 10:51:47', '12.0'),
(12, 'Bạt 4', 6, 45, 295, 296, '30.0', '30.0', 40, 'moving_up', '2026-03-19 20:15:59', '2026-03-20 10:51:48', NULL, 0, '2026-03-20 10:51:48', '12.0');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `cycles`
--

CREATE TABLE `cycles` (
  `id` bigint UNSIGNED NOT NULL,
  `barn_id` bigint UNSIGNED NOT NULL,
  `parent_cycle_id` bigint UNSIGNED DEFAULT NULL COMMENT 'TÃ¡ch tá»« cycle nÃ o',
  `split_date` date DEFAULT NULL COMMENT 'NgÃ y Ä‘Æ°á»£c tÃ¡ch vÃ o cycle nÃ y',
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `breed` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Giá»‘ng gÃ ',
  `season` enum('spring','summer','autumn','winter') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'MÃ¹a vá»¥: spring=XuÃ¢n summer=HÃ¨ autumn=Thu winter=ÄÃ´ng',
  `flock_source` enum('local','imported','hatchery') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Nguá»“n gá»‘c con giá»‘ng',
  `initial_quantity` int UNSIGNED NOT NULL COMMENT 'Sá»‘ con lÃºc nháº­p khÃ´ng Ä‘á»•i',
  `male_quantity` int UNSIGNED NOT NULL,
  `female_quantity` int UNSIGNED NOT NULL,
  `purchase_price` decimal(12,2) NOT NULL COMMENT 'GiÃ¡ mua con giá»‘ng',
  `current_quantity` int UNSIGNED NOT NULL COMMENT 'Sá»‘ con hiá»‡n táº¡i thá»±c táº¿',
  `start_date` date NOT NULL,
  `expected_end_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `stage` enum('chick','grower','adult') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'chick',
  `vaccine_program_id` int DEFAULT NULL,
  `status` enum('active','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `final_quantity` int UNSIGNED DEFAULT NULL,
  `total_sold_weight_kg` decimal(10,2) DEFAULT NULL,
  `total_revenue` decimal(15,2) DEFAULT NULL,
  `close_reason` enum('sold','mortality','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Chu ká»³ nuÃ´i â€” má»—i lá»©a gÃ  trong má»™t chuá»“ng';

--
-- Đang đổ dữ liệu cho bảng `cycles`
--

INSERT INTO `cycles` (`id`, `barn_id`, `parent_cycle_id`, `split_date`, `code`, `breed`, `season`, `flock_source`, `initial_quantity`, `male_quantity`, `female_quantity`, `purchase_price`, `current_quantity`, `start_date`, `expected_end_date`, `end_date`, `stage`, `vaccine_program_id`, `status`, `final_quantity`, `total_sold_weight_kg`, `total_revenue`, `close_reason`, `created_at`) VALUES
(3, 6, NULL, NULL, 'b1-20260314', 'lai choi', NULL, 'hatchery', 4000, 2000, 2000, '15000.00', 4000, '2026-03-14', NULL, NULL, 'chick', NULL, 'active', NULL, NULL, NULL, NULL, '2026-03-14 14:16:26');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `cycle_daily_snapshots`
--

CREATE TABLE `cycle_daily_snapshots` (
  `id` bigint UNSIGNED NOT NULL,
  `cycle_id` bigint UNSIGNED NOT NULL,
  `day_age` smallint UNSIGNED NOT NULL,
  `snapshot_date` date NOT NULL,
  `alive_total` int UNSIGNED NOT NULL DEFAULT '0',
  `alive_male` int UNSIGNED NOT NULL DEFAULT '0',
  `alive_female` int UNSIGNED NOT NULL DEFAULT '0',
  `dead_today` int UNSIGNED NOT NULL DEFAULT '0',
  `sold_today` int UNSIGNED NOT NULL DEFAULT '0',
  `sold_male_today` int UNSIGNED NOT NULL DEFAULT '0',
  `sold_female_today` int UNSIGNED NOT NULL DEFAULT '0',
  `bird_days_cumulative` bigint UNSIGNED NOT NULL DEFAULT '0',
  `feed_poured_kg` decimal(10,3) NOT NULL DEFAULT '0.000',
  `feed_remaining_kg` decimal(10,3) NOT NULL DEFAULT '0.000',
  `feed_consumed_kg` decimal(10,3) NOT NULL DEFAULT '0.000',
  `feed_cumulative_kg` decimal(10,3) NOT NULL DEFAULT '0.000',
  `avg_weight_g` decimal(8,1) DEFAULT NULL,
  `avg_weight_male_g` decimal(8,1) DEFAULT NULL,
  `avg_weight_female_g` decimal(8,1) DEFAULT NULL,
  `biomass_kg` decimal(10,2) DEFAULT NULL,
  `biomass_dead_kg` decimal(10,2) DEFAULT NULL,
  `biomass_sold_kg` decimal(10,2) DEFAULT NULL,
  `weight_produced_kg` decimal(10,2) DEFAULT NULL,
  `fcr_cumulative` decimal(6,3) DEFAULT NULL,
  `computed_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Snapshot tá»•ng há»£p hÃ ng ngÃ y â€” dÃ¹ng cho bÃ¡o cÃ¡o vÃ  AI';

--
-- Đang đổ dữ liệu cho bảng `cycle_daily_snapshots`
--

INSERT INTO `cycle_daily_snapshots` (`id`, `cycle_id`, `day_age`, `snapshot_date`, `alive_total`, `alive_male`, `alive_female`, `dead_today`, `sold_today`, `sold_male_today`, `sold_female_today`, `bird_days_cumulative`, `feed_poured_kg`, `feed_remaining_kg`, `feed_consumed_kg`, `feed_cumulative_kg`, `avg_weight_g`, `avg_weight_male_g`, `avg_weight_female_g`, `biomass_kg`, `biomass_dead_kg`, `biomass_sold_kg`, `weight_produced_kg`, `fcr_cumulative`, `computed_at`) VALUES
(256, 3, 1, '2026-03-14', 4000, 2000, 2000, 0, 0, 0, 0, 4000, '0.000', '0.000', '0.000', '0.000', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:33:33'),
(257, 3, 2, '2026-03-15', 4000, 2000, 2000, 0, 0, 0, 0, 8000, '0.000', '0.000', '0.000', '0.000', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:33:33'),
(258, 3, 3, '2026-03-16', 4000, 2000, 2000, 0, 0, 0, 0, 12000, '0.000', '0.000', '0.000', '0.000', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:33:33'),
(259, 3, 4, '2026-03-17', 4000, 2000, 2000, 0, 0, 0, 0, 16000, '0.000', '0.000', '0.000', '0.000', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:33:33'),
(260, 3, 5, '2026-03-18', 4000, 2000, 2000, 0, 0, 0, 0, 20000, '0.000', '0.000', '0.000', '0.000', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:33:33'),
(261, 3, 6, '2026-03-19', 4000, 2000, 2000, 0, 0, 0, 0, 24000, '0.000', '0.000', '0.000', '0.000', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:33:33'),
(262, 3, 7, '2026-03-20', 4000, 2000, 2000, 0, 0, 0, 0, 28000, '0.000', '0.000', '0.000', '0.000', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:33:33'),
(263, 3, 8, '2026-03-21', 4000, 2000, 2000, 0, 0, 0, 0, 32000, '0.000', '0.000', '0.000', '0.000', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:33:33'),
(264, 3, 9, '2026-03-22', 4000, 2000, 2000, 0, 0, 0, 0, 36000, '0.000', '0.000', '0.000', '0.000', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:33:33');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `cycle_feed_programs`
--

CREATE TABLE `cycle_feed_programs` (
  `id` bigint UNSIGNED NOT NULL,
  `cycle_id` bigint UNSIGNED NOT NULL,
  `feed_brand_id` bigint UNSIGNED NOT NULL,
  `start_date` date NOT NULL COMMENT 'NgÃ y báº¯t Ä‘áº§u dÃ¹ng hÃ£ng nÃ y',
  `end_date` date DEFAULT NULL COMMENT 'NULL = Ä‘ang dÃ¹ng',
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `cycle_feed_programs`
--

INSERT INTO `cycle_feed_programs` (`id`, `cycle_id`, `feed_brand_id`, `start_date`, `end_date`, `note`, `created_at`) VALUES
(3, 3, 1, '2026-03-14', NULL, NULL, '2026-03-14 14:16:26');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `cycle_feed_program_items`
--

CREATE TABLE `cycle_feed_program_items` (
  `id` int NOT NULL,
  `cycle_feed_program_id` int NOT NULL,
  `inventory_item_id` int NOT NULL,
  `stage` enum('chick','grower','adult') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `cycle_feed_stages`
--

CREATE TABLE `cycle_feed_stages` (
  `id` bigint UNSIGNED NOT NULL,
  `cycle_id` bigint UNSIGNED NOT NULL,
  `stage` enum('chick','grower','adult') COLLATE utf8mb4_unicode_ci NOT NULL,
  `primary_feed_type_id` bigint UNSIGNED NOT NULL COMMENT 'MÃ£ cÃ¡m chÃ­nh',
  `mix_feed_type_id` bigint UNSIGNED DEFAULT NULL COMMENT 'MÃ£ cÃ¡m mix khi chuyá»ƒn dáº§n',
  `mix_ratio` tinyint UNSIGNED DEFAULT NULL COMMENT 'Tá»· lá»‡ mix % cá»§a mÃ£ má»›i (10, 25, 50...)',
  `effective_date` date NOT NULL COMMENT 'Ãp dá»¥ng tá»« ngÃ y',
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `cycle_splits`
--

CREATE TABLE `cycle_splits` (
  `id` bigint UNSIGNED NOT NULL,
  `from_cycle_id` bigint UNSIGNED NOT NULL COMMENT 'Cycle gốc',
  `to_cycle_id` bigint UNSIGNED NOT NULL COMMENT 'Cycle mới được tách vào',
  `quantity` int UNSIGNED NOT NULL COMMENT 'Số con tách',
  `split_date` date NOT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `devices`
--

CREATE TABLE `devices` (
  `id` int NOT NULL,
  `device_code` varchar(50) NOT NULL COMMENT 'MÃ£ thiáº¿t bá»‹: esp-barn1-relay-001',
  `name` varchar(100) NOT NULL COMMENT 'TÃªn hiá»ƒn thá»‹',
  `barn_id` bigint UNSIGNED DEFAULT NULL COMMENT 'Chuá»“ng gáº¯n vá»›i',
  `device_type_id` int NOT NULL COMMENT 'Loáº¡i thiáº¿t bá»‹',
  `mqtt_topic` varchar(100) NOT NULL COMMENT 'MQTT topic: cfarm/barn1',
  `is_online` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Online status',
  `last_heartbeat_at` datetime DEFAULT NULL COMMENT 'Heartbeat cuá»‘i',
  `last_ping_sent_at` datetime DEFAULT NULL,
  `last_ping_response_at` datetime DEFAULT NULL,
  `ping_fail_count` tinyint NOT NULL DEFAULT '0',
  `wifi_rssi` int DEFAULT NULL COMMENT 'WiFi signal strength',
  `ip_address` varchar(45) DEFAULT NULL COMMENT 'IP address',
  `uptime_seconds` bigint UNSIGNED DEFAULT NULL COMMENT 'Thá»i gian cháº¡y',
  `free_heap_bytes` int DEFAULT NULL COMMENT 'Bá»™ nhá»› trá»‘ng',
  `env_interval_seconds` int NOT NULL DEFAULT '300' COMMENT 'Táº§n suáº¥t gá»­i ENV (giÃ¢y)',
  `alert_offline` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Cáº£nh bÃ¡o offline',
  `last_offline_alert_at` datetime DEFAULT NULL COMMENT 'Láº§n cuá»‘i bÃ¡o offline',
  `notes` text COMMENT 'Ghi chÃº',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Thiáº¿t bá»‹ IoT';

--
-- Đang đổ dữ liệu cho bảng `devices`
--

INSERT INTO `devices` (`id`, `device_code`, `name`, `barn_id`, `device_type_id`, `mqtt_topic`, `is_online`, `last_heartbeat_at`, `last_ping_sent_at`, `last_ping_response_at`, `ping_fail_count`, `wifi_rssi`, `ip_address`, `uptime_seconds`, `free_heap_bytes`, `env_interval_seconds`, `alert_offline`, `last_offline_alert_at`, `notes`, `created_at`, `updated_at`) VALUES
(45, 'esp-chuong1-relay-001', 'Relay Chuồng 1', 6, 1, 'cfarm/barn1/0010', 0, '2026-03-20 18:46:12', '2026-03-19 20:47:05', '2026-03-19 20:47:04', 2, -64, '192.168.2.92', 38791, 222832, 300, 1, '2026-03-20 21:26:16', '', '2026-03-19 20:04:00', '2026-03-20 21:26:16'),
(46, 'esp-chuong1-mixed-002', 'Mixed Chuồng 1', 6, 4, 'cfarm/barn1/0020', 0, '2026-03-20 15:40:19', NULL, NULL, 0, -58, '192.168.2.10', 1110, 209456, 60, 1, '2026-03-20 21:26:16', '', '2026-03-20 14:55:55', '2026-03-20 21:26:16'),
(47, 'esp-chuong1-sensor-003', 'Sensor Chuồng 1', 6, 4, 'cfarm/barn1/00030', 1, '2026-03-27 14:03:19', NULL, NULL, 0, -67, '192.168.2.8', 17491, 209196, 60, 1, NULL, '', '2026-03-20 15:38:55', '2026-03-27 14:03:19');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `device_channels`
--

CREATE TABLE `device_channels` (
  `id` int NOT NULL,
  `device_id` int NOT NULL,
  `channel_number` tinyint NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `channel_type` enum('curtain_up','curtain_down','fan','light','heater','water','other') COLLATE utf8mb4_unicode_ci DEFAULT 'other',
  `gpio_pin` int DEFAULT NULL,
  `max_on_seconds` int DEFAULT '120',
  `is_active` tinyint(1) DEFAULT '1',
  `sort_order` tinyint DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `device_channels`
--

INSERT INTO `device_channels` (`id`, `device_id`, `channel_number`, `name`, `channel_type`, `gpio_pin`, `max_on_seconds`, `is_active`, `sort_order`) VALUES
(289, 45, 1, 'Kênh 1', 'other', 32, 120, 1, 1),
(290, 45, 2, 'Kênh 2', 'other', 33, 120, 1, 2),
(291, 45, 3, 'Kênh 3', 'other', 25, 120, 1, 3),
(292, 45, 4, 'Kênh 4', 'other', 26, 120, 1, 4),
(293, 45, 5, 'Kênh 5', 'other', 27, 120, 1, 5),
(294, 45, 6, 'Kênh 6', 'other', 14, 120, 1, 6),
(295, 45, 7, 'Kênh 7', 'other', 12, 120, 1, 7),
(296, 45, 8, 'Kênh 8', 'other', 13, 120, 1, 8),
(297, 46, 1, 'Kênh 1', 'other', 32, 120, 1, 1),
(298, 46, 2, 'Kênh 2', 'other', 33, 120, 1, 2),
(299, 46, 3, 'Kênh 3', 'other', 25, 120, 1, 3),
(300, 46, 4, 'Kênh 4', 'other', 26, 120, 1, 4),
(301, 46, 5, 'Kênh 5', 'other', 27, 120, 1, 5),
(302, 46, 6, 'Kênh 6', 'other', 14, 120, 1, 6),
(303, 46, 7, 'Kênh 7', 'other', 12, 120, 1, 7),
(304, 46, 8, 'Kênh 8', 'other', 13, 120, 1, 8),
(305, 47, 1, 'Kênh 1', 'other', 32, 120, 1, 1),
(306, 47, 2, 'Kênh 2', 'other', 33, 120, 1, 2),
(307, 47, 3, 'Kênh 3', 'other', 25, 120, 1, 3),
(308, 47, 4, 'Kênh 4', 'other', 26, 120, 1, 4),
(309, 47, 5, 'Kênh 5', 'other', 27, 120, 1, 5),
(310, 47, 6, 'Kênh 6', 'other', 14, 120, 1, 6),
(311, 47, 7, 'Kênh 7', 'other', 12, 120, 1, 7),
(312, 47, 8, 'Kênh 8', 'other', 13, 120, 1, 8);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `device_commands`
--

CREATE TABLE `device_commands` (
  `id` bigint NOT NULL,
  `device_id` int NOT NULL,
  `channel_id` int DEFAULT NULL,
  `command_type` enum('on','off','stop','set_position') COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` json DEFAULT NULL,
  `source` enum('manual','schedule','automation','ai') COLLATE utf8mb4_unicode_ci DEFAULT 'manual',
  `status` enum('pending','sent','acknowledged','completed','failed','timeout') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `sent_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `barn_id` bigint UNSIGNED DEFAULT NULL,
  `cycle_id` bigint UNSIGNED DEFAULT NULL,
  `response_payload` json DEFAULT NULL,
  `acknowledged_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `device_commands`
--

INSERT INTO `device_commands` (`id`, `device_id`, `channel_id`, `command_type`, `payload`, `source`, `status`, `sent_at`, `barn_id`, `cycle_id`, `response_payload`, `acknowledged_at`, `completed_at`) VALUES
(1, 45, 290, 'set_position', '{\"to\": 40, \"from\": 0, \"duration\": 12}', 'manual', 'sent', '2026-03-20 10:29:41', 6, 3, NULL, NULL, NULL),
(2, 45, 289, 'set_position', '{\"to\": 0, \"from\": 40, \"duration\": 12}', 'manual', 'sent', '2026-03-20 10:31:23', 6, 3, NULL, NULL, NULL),
(3, 45, 290, 'set_position', '{\"to\": 60, \"from\": 0, \"duration\": 18}', 'manual', 'sent', '2026-03-20 10:39:43', 6, 3, NULL, NULL, NULL),
(4, 45, 289, 'set_position', '{\"to\": 0, \"from\": 60, \"duration\": 18}', 'manual', 'sent', '2026-03-20 10:47:58', 6, 3, NULL, NULL, NULL),
(5, 45, 290, 'set_position', '{\"to\": 40, \"from\": 0, \"duration\": 12}', 'manual', 'sent', '2026-03-20 10:49:05', 6, 3, NULL, NULL, NULL),
(6, 45, 292, 'set_position', '{\"to\": 40, \"from\": 0, \"duration\": 12}', 'manual', 'sent', '2026-03-20 10:49:10', 6, 3, NULL, NULL, NULL),
(7, 45, 294, 'set_position', '{\"to\": 40, \"from\": 0, \"duration\": 12}', 'manual', 'sent', '2026-03-20 10:49:10', 6, 3, NULL, NULL, NULL),
(8, 45, 296, 'set_position', '{\"to\": 40, \"from\": 0, \"duration\": 12}', 'manual', 'sent', '2026-03-20 10:49:12', 6, 3, NULL, NULL, NULL),
(9, 45, 289, 'set_position', '{\"to\": 0, \"from\": 40, \"duration\": 12}', 'manual', 'sent', '2026-03-20 10:51:45', 6, 3, NULL, NULL, NULL),
(10, 45, 291, 'set_position', '{\"to\": 0, \"from\": 40, \"duration\": 12}', 'manual', 'sent', '2026-03-20 10:51:46', 6, 3, NULL, NULL, NULL),
(11, 45, 293, 'set_position', '{\"to\": 0, \"from\": 40, \"duration\": 12}', 'manual', 'sent', '2026-03-20 10:51:47', 6, 3, NULL, NULL, NULL),
(12, 45, 295, 'set_position', '{\"to\": 0, \"from\": 40, \"duration\": 12}', 'manual', 'sent', '2026-03-20 10:51:48', 6, 3, NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `device_firmwares`
--

CREATE TABLE `device_firmwares` (
  `id` int NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `device_type_id` int NOT NULL,
  `code` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `is_latest` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `device_firmwares`
--

INSERT INTO `device_firmwares` (`id`, `name`, `version`, `description`, `device_type_id`, `code`, `is_active`, `is_latest`, `created_at`, `updated_at`) VALUES
(1, 'ESP32 Relay 8CH Barn v1.0', '1.0.0', 'Firmware 1.0.0- Non-blocking, Watchdog, NVS, OTA', 1, '/*\r\n * CFarm ESP32 Relay 8CH - 4 Curtains (v2)\r\n * ============================================================\r\n * GPIO: 32,33,25,26,27,14,12,13\r\n * MQTT: Subscribe /cmd, Publish /heartbeat + /state + /pong\r\n *\r\n * v2 changes:\r\n *   - duration auto-off: relay tu dong tat sau X giay (non-blocking timer)\r\n *   - LWT: broker tu publish offline khi ESP32 mat ket noi\r\n *   - ping/pong: server ping, ESP32 tra pong\r\n *   - heartbeat: them free_heap, status field\r\n *   - Interlock auto-off kenh doi nghich + dead-time 100ms\r\n *   - Non-blocking WiFi/MQTT reconnect\r\n *   - Watchdog Timer (30s)\r\n *   - snprintf thay String concatenation\r\n *   - Luu/khoi phuc trang thai relay qua NVS\r\n *   - OTA update qua ArduinoOTA\r\n */\r\n\r\n#include <WiFi.h>\r\n#include <PubSubClient.h>\r\n#include <ArduinoJson.h>\r\n#include <esp_task_wdt.h>\r\n#include <Preferences.h>\r\n#include <ArduinoOTA.h>\r\n#include <HTTPClient.h>\r\n#include <Update.h>\r\n\r\n// ======================== CAU HINH ========================\r\n\r\n#define DEVICE_CODE       \"YOUR_DEVICE_CODE\"\r\n\r\nconst char* WIFI_SSID   = \"Dat Lim\";\r\nconst char* WIFI_PASS   = \"hoilamgi\";\r\nconst char* MQTT_SERVER = \"app.cfarm.vn\";\r\nconst int   MQTT_PORT   = 1883;\r\nconst char* MQTT_USER   = \"cfarm_device\";\r\nconst char* MQTT_PASS   = \"Abc@@123\";\r\nconst char* MQTT_TOPIC  = \"YOUR_MQTT_TOPIC\";\r\n\r\n// ======================== PHAN CUNG ========================\r\n\r\nconst int RELAY_PINS[8]   = {32, 33, 25, 26, 27, 14, 12, 13};\r\nconst int INTERLOCK[][2]  = {{1,2}, {3,4}, {5,6}, {7,8}};\r\nconst int INTERLOCK_DEAD_TIME_MS = 100;\r\n\r\n// ======================== TIMING ========================\r\n\r\nconst unsigned long HEARTBEAT_INTERVAL_MS   = 30000;\r\nconst unsigned long WIFI_RECONNECT_INTERVAL = 5000;\r\nconst unsigned long MQTT_RECONNECT_INTERVAL = 5000;\r\nconst unsigned long WDT_TIMEOUT_S           = 30;\r\n\r\n// ======================== BIEN TOAN CUC ========================\r\n\r\nWiFiClient espClient;\r\nPubSubClient mqtt(espClient);\r\nPreferences prefs;\r\n\r\nbool relayState[8]          = {false};\r\nunsigned long relayOffAt[8] = {0};  // millis() khi can tat (0 = khong timer)\r\n\r\nunsigned long lastHeartbeat = 0;\r\nunsigned long lastWifiRetry = 0;\r\nunsigned long lastMqttRetry = 0;\r\n\r\nchar topicCmd[64];\r\nchar topicState[64];\r\nchar topicHeartbeat[64];\r\nchar topicPong[64];\r\nchar topicLwt[64];\r\nchar mqttClientId[48];\r\nchar lwtPayload[128];\r\n\r\n// ======================== SETUP ========================\r\n\r\nvoid setup() {\r\n    Serial.begin(115200);\r\n    Serial.println(\"\\n[CFarm] Khoi dong v2...\");\r\n\r\n    // Watchdog Timer\r\n    #if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)\r\n        esp_task_wdt_config_t wdt_config = {\r\n            .timeout_ms = WDT_TIMEOUT_S * 1000,\r\n            .idle_core_mask = 0,\r\n            .trigger_panic = true\r\n        };\r\n        esp_task_wdt_init(&wdt_config);\r\n    #else\r\n        esp_task_wdt_init(WDT_TIMEOUT_S, true);\r\n    #endif\r\n    esp_task_wdt_add(NULL);\r\n\r\n    // GPIO\r\n    for (int i = 0; i < 8; i++) {\r\n        pinMode(RELAY_PINS[i], OUTPUT);\r\n        digitalWrite(RELAY_PINS[i], HIGH);  // relay off (active LOW)\r\n    }\r\n\r\n    // MQTT topics\r\n    snprintf(topicCmd,       sizeof(topicCmd),       \"%s/cmd\",       MQTT_TOPIC);\r\n    snprintf(topicState,     sizeof(topicState),     \"%s/state\",     MQTT_TOPIC);\r\n    snprintf(topicHeartbeat, sizeof(topicHeartbeat), \"%s/heartbeat\", MQTT_TOPIC);\r\n    snprintf(topicPong,      sizeof(topicPong),      \"%s/pong\",      MQTT_TOPIC);\r\n    snprintf(topicLwt,       sizeof(topicLwt),       \"%s/lwt\",       MQTT_TOPIC);\r\n    snprintf(mqttClientId,   sizeof(mqttClientId),   \"ESP_%s\",       DEVICE_CODE);\r\n\r\n    // LWT payload - broker se publish khi ESP32 mat ket noi\r\n    snprintf(lwtPayload, sizeof(lwtPayload),\r\n        \"{\\\"device\\\":\\\"%s\\\",\\\"status\\\":\\\"offline\\\"}\", DEVICE_CODE);\r\n\r\n    restoreRelayStates();\r\n\r\n    // WiFi\r\n    WiFi.mode(WIFI_STA);\r\n    WiFi.setAutoReconnect(true);\r\n    WiFi.begin(WIFI_SSID, WIFI_PASS);\r\n    Serial.println(\"[WiFi] Dang ket noi...\");\r\n\r\n    // MQTT\r\n    mqtt.setServer(MQTT_SERVER, MQTT_PORT);\r\n    mqtt.setBufferSize(512);\r\n    mqtt.setCallback(mqttCallback);\r\n\r\n    setupOTA();\r\n    Serial.println(\"[CFarm] Setup hoan tat.\");\r\n}\r\n\r\n// ======================== LOOP ========================\r\n\r\nvoid loop() {\r\n    esp_task_wdt_reset();\r\n    unsigned long now = millis();\r\n\r\n    // WiFi reconnect (non-blocking)\r\n    if (WiFi.status() != WL_CONNECTED) {\r\n        if (now - lastWifiRetry > WIFI_RECONNECT_INTERVAL) {\r\n            lastWifiRetry = now;\r\n            Serial.println(\"[WiFi] Mat ket noi, thu lai...\");\r\n            WiFi.disconnect();\r\n            WiFi.begin(WIFI_SSID, WIFI_PASS);\r\n        }\r\n        return;\r\n    }\r\n\r\n    // MQTT reconnect (non-blocking)\r\n    if (!mqtt.connected()) {\r\n        if (now - lastMqttRetry > MQTT_RECONNECT_INTERVAL) {\r\n            lastMqttRetry = now;\r\n            mqttReconnect();\r\n        }\r\n    } else {\r\n        mqtt.loop();\r\n    }\r\n\r\n    // Heartbeat\r\n    if (now - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {\r\n        lastHeartbeat = now;\r\n        sendHeartbeat();\r\n    }\r\n\r\n    // Duration auto-off timers (non-blocking)\r\n    checkRelayTimers(now);\r\n\r\n    ArduinoOTA.handle();\r\n}\r\n\r\n// ======================== RELAY TIMERS ========================\r\n\r\nvoid checkRelayTimers(unsigned long now) {\r\n    for (int i = 0; i < 8; i++) {\r\n        if (relayOffAt[i] > 0 && now >= relayOffAt[i]) {\r\n            Serial.printf(\"[Timer] Auto-off CH%d\\n\", i + 1);\r\n            relayOffAt[i] = 0;\r\n            applyRelay(i, false);\r\n        }\r\n    }\r\n}\r\n\r\n// ======================== MQTT RECONNECT ========================\r\n\r\nvoid mqttReconnect() {\r\n    Serial.println(\"[MQTT] Dang ket noi...\");\r\n\r\n    // Connect voi LWT: khi mat ket noi, broker tu publish lwtPayload len topicLwt\r\n    if (mqtt.connect(mqttClientId, MQTT_USER, MQTT_PASS,\r\n                     topicLwt, 1, false, lwtPayload)) {\r\n        Serial.println(\"[MQTT] Da ket noi! (voi LWT)\");\r\n        mqtt.subscribe(topicCmd);\r\n        sendHeartbeat();\r\n    } else {\r\n        Serial.printf(\"[MQTT] That bai, rc=%d\\n\", mqtt.state());\r\n    }\r\n}\r\n\r\n// ======================== MQTT CALLBACK ========================\r\n\r\nvoid mqttCallback(char* topic, byte* payload, unsigned int length) {\r\n    StaticJsonDocument<256> doc;\r\n    DeserializationError err = deserializeJson(doc, payload, length);\r\n    if (err) {\r\n        Serial.printf(\"[MQTT] JSON parse loi: %s\\n\", err.c_str());\r\n        return;\r\n    }\r\n\r\n    const char* action = doc[\"action\"] | \"\";\r\n\r\n    if (strcmp(action, \"relay\") == 0) {\r\n        handleRelayCmd(doc);\r\n    } else if (strcmp(action, \"all\") == 0) {\r\n        handleAllCmd(doc);\r\n    } else if (strcmp(action, \"ping\") == 0) {\r\n        handlePing(doc);\r\n    } else if (strcmp(action, \"ota\") == 0) {\r\n        handleOtaCmd(doc);\r\n    }\r\n}\r\n\r\n// ======================== COMMAND HANDLERS ========================\r\n\r\nvoid handleRelayCmd(const JsonDocument& doc) {\r\n    int ch = doc[\"channel\"] | 0;\r\n    const char* st = doc[\"state\"] | \"\";\r\n    int duration = doc[\"duration\"] | 0;  // seconds, 0 = khong timer\r\n\r\n    if (ch < 1 || ch > 8) return;\r\n\r\n    int idx = ch - 1;\r\n    bool on = (strcmp(st, \"on\") == 0);\r\n\r\n    setRelay(idx, on);\r\n\r\n    // Duration auto-off: bat relay + tu tat sau X giay\r\n    if (on && duration > 0) {\r\n        relayOffAt[idx] = millis() + ((unsigned long)duration * 1000UL);\r\n        Serial.printf(\"[Timer] CH%d auto-off sau %ds\\n\", ch, duration);\r\n    } else {\r\n        relayOffAt[idx] = 0;  // xoa timer neu tat thu cong\r\n    }\r\n}\r\n\r\nvoid handleAllCmd(const JsonDocument& doc) {\r\n    const char* st = doc[\"state\"] | \"\";\r\n    bool on = (strcmp(st, \"on\") == 0);\r\n    for (int i = 0; i < 8; i++) {\r\n        setRelay(i, on);\r\n        relayOffAt[i] = 0;  // xoa tat ca timer\r\n    }\r\n}\r\n\r\nvoid handlePing(const JsonDocument& doc) {\r\n    if (!mqtt.connected()) return;\r\n\r\n    unsigned long ts = doc[\"ts\"] | 0;\r\n    char buf[192];\r\n    snprintf(buf, sizeof(buf),\r\n        \"{\\\"device\\\":\\\"%s\\\",\\\"ts\\\":%lu,\\\"uptime\\\":%lu,\\\"heap\\\":%u,\\\"rssi\\\":%d}\",\r\n        DEVICE_CODE,\r\n        ts,\r\n        millis() / 1000,\r\n        ESP.getFreeHeap(),\r\n        WiFi.RSSI());\r\n\r\n    mqtt.publish(topicPong, buf);\r\n    Serial.println(\"[Pong] Sent\");\r\n}\r\n\r\n// ======================== HTTP OTA ========================\r\n\r\nvoid handleOtaCmd(const JsonDocument& doc) {\r\n    const char* url = doc[\"url\"] | \"\";\r\n    const char* version = doc[\"version\"] | \"unknown\";\r\n\r\n    if (strlen(url) == 0) {\r\n        Serial.println(\"[OTA] URL rong, bo qua\");\r\n        return;\r\n    }\r\n\r\n    Serial.printf(\"[OTA] Bat dau cap nhat v%s tu: %s\\n\", version, url);\r\n\r\n    // Tat het relay truoc khi OTA\r\n    for (int i = 0; i < 8; i++) {\r\n        digitalWrite(RELAY_PINS[i], HIGH);\r\n        relayOffAt[i] = 0;\r\n    }\r\n\r\n    // Thong bao server dang cap nhat\r\n    char buf[192];\r\n    snprintf(buf, sizeof(buf),\r\n        \"{\\\"device\\\":\\\"%s\\\",\\\"status\\\":\\\"updating\\\",\\\"version\\\":\\\"%s\\\"}\",\r\n        DEVICE_CODE, version);\r\n    mqtt.publish(topicState, buf);\r\n\r\n    WiFiClient client;\r\n    HTTPClient http;\r\n    http.begin(client, url);\r\n    http.setTimeout(30000);\r\n\r\n    int httpCode = http.GET();\r\n    if (httpCode != 200) {\r\n        Serial.printf(\"[OTA] HTTP loi: %d\\n\", httpCode);\r\n        http.end();\r\n        return;\r\n    }\r\n\r\n    int contentLength = http.getSize();\r\n    if (contentLength <= 0) {\r\n        Serial.println(\"[OTA] Content-Length khong hop le\");\r\n        http.end();\r\n        return;\r\n    }\r\n\r\n    if (!Update.begin(contentLength)) {\r\n        Serial.printf(\"[OTA] Khong du bo nho: %d bytes\\n\", contentLength);\r\n        http.end();\r\n        return;\r\n    }\r\n\r\n    // Tang WDT timeout cho OTA (120s)\r\n    esp_task_wdt_reset();\r\n\r\n    WiFiClient* stream = http.getStreamPtr();\r\n    size_t written = Update.writeStream(*stream);\r\n    http.end();\r\n\r\n    if (written != contentLength) {\r\n        Serial.printf(\"[OTA] Ghi thieu: %d/%d bytes\\n\", written, contentLength);\r\n        Update.abort();\r\n        return;\r\n    }\r\n\r\n    if (!Update.end(true)) {\r\n        Serial.printf(\"[OTA] Loi ket thuc: %s\\n\", Update.errorString());\r\n        return;\r\n    }\r\n\r\n    Serial.println(\"[OTA] Hoan tat! Khoi dong lai...\");\r\n    delay(500);\r\n    ESP.restart();\r\n}\r\n\r\n// ======================== SET RELAY ========================\r\n\r\nvoid setRelay(int ch, bool on) {\r\n    if (ch < 0 || ch >= 8) return;\r\n\r\n    // Interlock: tat kenh doi nghich truoc khi bat\r\n    if (on) {\r\n        for (int i = 0; i < 4; i++) {\r\n            int up   = INTERLOCK[i][0] - 1;\r\n            int down = INTERLOCK[i][1] - 1;\r\n\r\n            if (ch == up && relayState[down]) {\r\n                applyRelay(down, false);\r\n                relayOffAt[down] = 0;  // xoa timer kenh doi nghich\r\n                delay(INTERLOCK_DEAD_TIME_MS);\r\n                break;\r\n            }\r\n            if (ch == down && relayState[up]) {\r\n                applyRelay(up, false);\r\n                relayOffAt[up] = 0;\r\n                delay(INTERLOCK_DEAD_TIME_MS);\r\n                break;\r\n            }\r\n        }\r\n    }\r\n\r\n    applyRelay(ch, on);\r\n}\r\n\r\nvoid applyRelay(int ch, bool on) {\r\n    if (relayState[ch] == on) return;\r\n\r\n    digitalWrite(RELAY_PINS[ch], on ? LOW : HIGH);\r\n    relayState[ch] = on;\r\n    saveRelayStates();\r\n\r\n    // Publish state change\r\n    char buf[128];\r\n    snprintf(buf, sizeof(buf),\r\n        \"{\\\"device\\\":\\\"%s\\\",\\\"channel\\\":%d,\\\"state\\\":\\\"%s\\\"}\",\r\n        DEVICE_CODE, ch + 1, on ? \"on\" : \"off\");\r\n\r\n    if (!mqtt.publish(topicState, buf)) {\r\n        Serial.printf(\"[MQTT] Publish state CH%d that bai\\n\", ch + 1);\r\n    }\r\n}\r\n\r\n// ======================== HEARTBEAT ========================\r\n\r\nvoid sendHeartbeat() {\r\n    if (!mqtt.connected()) return;\r\n\r\n    char buf[320];\r\n    snprintf(buf, sizeof(buf),\r\n        \"{\\\"device\\\":\\\"%s\\\",\\\"status\\\":\\\"online\\\",\\\"wifi_rssi\\\":%d,\"\r\n        \"\\\"ip\\\":\\\"%s\\\",\\\"uptime\\\":%lu,\\\"heap\\\":%u,\"\r\n        \"\\\"relays\\\":[%d,%d,%d,%d,%d,%d,%d,%d]}\",\r\n        DEVICE_CODE,\r\n        WiFi.RSSI(),\r\n        WiFi.localIP().toString().c_str(),\r\n        millis() / 1000,\r\n        ESP.getFreeHeap(),\r\n        relayState[0], relayState[1], relayState[2], relayState[3],\r\n        relayState[4], relayState[5], relayState[6], relayState[7]);\r\n\r\n    if (mqtt.publish(topicHeartbeat, buf, false)) {\r\n        Serial.println(\"[Heartbeat] OK\");\r\n    }\r\n}\r\n\r\n// ======================== NVS ========================\r\n\r\nvoid saveRelayStates() {\r\n    uint8_t packed = 0;\r\n    for (int i = 0; i < 8; i++) {\r\n        if (relayState[i]) packed |= (1 << i);\r\n    }\r\n    prefs.begin(\"relay\", false);\r\n    prefs.putUChar(\"state\", packed);\r\n    prefs.end();\r\n}\r\n\r\nvoid restoreRelayStates() {\r\n    prefs.begin(\"relay\", true);\r\n    uint8_t packed = prefs.getUChar(\"state\", 0);\r\n    prefs.end();\r\n    for (int i = 0; i < 8; i++) {\r\n        relayState[i] = (packed >> i) & 1;\r\n        digitalWrite(RELAY_PINS[i], relayState[i] ? LOW : HIGH);\r\n    }\r\n    Serial.printf(\"[NVS] Khoi phuc relay: 0x%02X\\n\", packed);\r\n}\r\n\r\n// ======================== OTA ========================\r\n\r\nvoid setupOTA() {\r\n    ArduinoOTA.setHostname(DEVICE_CODE);\r\n    ArduinoOTA.setPassword(\"cfarm_ota\");\r\n    ArduinoOTA.onStart([]() {\r\n        Serial.println(\"[OTA] Bat dau cap nhat...\");\r\n        for (int i = 0; i < 8; i++) {\r\n            digitalWrite(RELAY_PINS[i], HIGH);  // tat het relay khi OTA\r\n            relayOffAt[i] = 0;\r\n        }\r\n    });\r\n    ArduinoOTA.onEnd([]()   { Serial.println(\"\\n[OTA] Hoan tat!\"); });\r\n    ArduinoOTA.onError([](ota_error_t error) {\r\n        Serial.printf(\"[OTA] Loi [%u]\\n\", error);\r\n    });\r\n    ArduinoOTA.begin();\r\n    Serial.println(\"[OTA] San sang.\");\r\n}\r\n', 1, 1, '2026-03-18 14:32:41', '2026-03-20 10:47:36'),
(2, 'ESP32 ENV DHT40 MQ137 MQ135 GY30', '1.0.0', '', 4, '/*\r\n * CFarm ESP32 ENV Sensor (v1)\r\n * ============================================================\r\n * Cam bien moi truong chuong nuoi:\r\n *   - SHT40 (I2C 0x44) : Nhiet do + Do am\r\n *   - GY30 / BH1750 (I2C 0x23) : Cuong do anh sang (lux)\r\n *   - MQ137 (Analog) : Khi NH3 (amoniac)\r\n *   - MQ135 (Analog) : Chat luong khong khi (CO2, VOC)\r\n *\r\n * MQTT publish:\r\n *   - {MQTT_TOPIC}/env        : Du lieu cam bien moi 5 phut\r\n *   - {MQTT_TOPIC}/heartbeat  : Trang thai thiet bi moi 30s\r\n *   - {MQTT_TOPIC}/pong       : Phan hoi ping tu server\r\n *   - {MQTT_TOPIC}/lwt        : Broker tu publish khi mat ket noi\r\n *\r\n * MQTT subscribe:\r\n *   - {MQTT_TOPIC}/cmd : Nhan lenh tu server (ping, ota, config)\r\n *\r\n * GPIO:\r\n *   - SDA=21, SCL=22 (I2C)\r\n *   - MQ137=34, MQ135=35 (ADC)\r\n *\r\n * Thu vien can cai (Arduino Library Manager):\r\n *   - PubSubClient (Nick O\'Leary)\r\n *   - ArduinoJson (Benoit Blanchon)\r\n *   - Adafruit SHT4x\r\n *   - BH1750 (Christopher Laws)\r\n */\r\n\r\n#include <WiFi.h>\r\n#include <Wire.h>\r\n#include <PubSubClient.h>\r\n#include <ArduinoJson.h>\r\n#include <esp_task_wdt.h>\r\n#include <ArduinoOTA.h>\r\n#include <HTTPClient.h>\r\n#include <Update.h>\r\n#include <Adafruit_SHT4x.h>\r\n#include <BH1750.h>\r\n\r\n// ======================== CAU HINH ========================\r\n\r\n#define DEVICE_CODE       \"YOUR_DEVICE_CODE\"\r\n\r\nconst char* WIFI_SSID   = \"Dat Lim\";\r\nconst char* WIFI_PASS   = \"hoilamgi\";\r\nconst char* MQTT_SERVER = \"app.cfarm.vn\";\r\nconst int   MQTT_PORT   = 1883;\r\nconst char* MQTT_USER   = \"cfarm_device\";\r\nconst char* MQTT_PASS   = \"Abc@@123\";\r\n// MQTT_TOPIC phai KHOP voi devices.mqtt_topic trong DB\r\n// Vi du: DB co mqtt_topic = \"cfarm/barn1/0020\" thi dat DUNG nhu vay\r\nconst char* MQTT_TOPIC  = \"YOUR_MQTT_TOPIC\";\r\n\r\n// ======================== PHAN CUNG ========================\r\n\r\n// I2C (SHT40 + GY30)\r\nconst int I2C_SDA = 21;\r\nconst int I2C_SCL = 22;\r\n\r\n// Analog sensors\r\nconst int MQ137_PIN = 34;   // NH3 (amoniac)\r\nconst int MQ135_PIN = 35;   // CO2 / chat luong khi\r\n\r\n// MQ sensor calibration\r\n// Dien ap khi khong khi sach (can chinh bang cach doc raw khi ngoai troi)\r\n// Sau 24-48h warm-up, doc gia tri raw ngoai troi sach -> dat vao day\r\nconst float MQ137_R0 = 1.0;  // R0 cho MQ137 (chinh sau khi warm-up)\r\nconst float MQ135_R0 = 1.0;  // R0 cho MQ135 (chinh sau khi warm-up)\r\nconst float MQ_RL    = 10.0; // Load resistor (kOhm) tren module\r\n\r\n// ======================== TIMING ========================\r\n\r\nconst unsigned long ENV_INTERVAL_MS       = 300000;  // 5 phut gui du lieu cam bien\r\nconst unsigned long HEARTBEAT_INTERVAL_MS = 30000;   // 30s heartbeat\r\nconst unsigned long WIFI_RECONNECT_MS     = 5000;\r\nconst unsigned long MQTT_RECONNECT_MS     = 5000;\r\nconst unsigned long WDT_TIMEOUT_S         = 30;\r\nconst unsigned long SENSOR_WARMUP_MS      = 60000;   // 60s cho MQ warm-up sau boot\r\n\r\n// ADC sampling\r\nconst int ADC_SAMPLES = 32;           // So lan doc ADC de lay trung binh\r\nconst int ADC_SAMPLE_DELAY_MS = 10;   // Delay giua cac lan doc\r\n\r\n// ======================== BIEN TOAN CUC ========================\r\n\r\nWiFiClient espClient;\r\nPubSubClient mqtt(espClient);\r\n\r\nAdafruit_SHT4x sht40;\r\nBH1750 bh1750;\r\n\r\nbool sht40_ok   = false;\r\nbool bh1750_ok  = false;\r\nbool warmup_done = false;\r\n\r\nunsigned long lastEnvSend   = 0;\r\nunsigned long lastHeartbeat = 0;\r\nunsigned long lastWifiRetry = 0;\r\nunsigned long lastMqttRetry = 0;\r\nunsigned long bootTime      = 0;\r\n\r\n// Du lieu cam bien moi nhat (NAN = chua doc duoc / khong co sensor)\r\nfloat lastTemp     = NAN;\r\nfloat lastHumidity = NAN;\r\nfloat lastLux      = NAN;\r\nfloat lastNH3_ppm  = NAN;\r\nfloat lastCO2_ppm  = NAN;\r\nint   lastMQ137raw = -1;\r\nint   lastMQ135raw = -1;\r\nint   envSendCount = 0;\r\n\r\nchar topicCmd[64];\r\nchar topicEnv[64];\r\nchar topicHeartbeat[64];\r\nchar topicPong[64];\r\nchar topicLwt[64];\r\nchar mqttClientId[48];\r\nchar lwtPayload[128];\r\n\r\n// ======================== SETUP ========================\r\n\r\nvoid setup() {\r\n    Serial.begin(115200);\r\n    Serial.println(\"\\n[CFarm ENV] Khoi dong v1...\");\r\n\r\n    bootTime = millis();\r\n\r\n    // Watchdog Timer\r\n    #if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)\r\n        esp_task_wdt_config_t wdt_config = {\r\n            .timeout_ms = WDT_TIMEOUT_S * 1000,\r\n            .idle_core_mask = 0,\r\n            .trigger_panic = true\r\n        };\r\n        esp_task_wdt_init(&wdt_config);\r\n    #else\r\n        esp_task_wdt_init(WDT_TIMEOUT_S, true);\r\n    #endif\r\n    esp_task_wdt_add(NULL);\r\n\r\n    // ADC\r\n    analogReadResolution(12);  // 0-4095\r\n    analogSetAttenuation(ADC_11db);  // 0-3.3V range\r\n\r\n    // I2C\r\n    Wire.begin(I2C_SDA, I2C_SCL);\r\n\r\n    // SHT40\r\n    if (sht40.begin(&Wire)) {\r\n        sht40.setPrecision(SHT4X_HIGH_PRECISION);\r\n        sht40.setHeater(SHT4X_NO_HEATER);\r\n        sht40_ok = true;\r\n        Serial.println(\"[SHT40] OK\");\r\n    } else {\r\n        Serial.println(\"[SHT40] !!! Khong tim thay sensor\");\r\n    }\r\n\r\n    // BH1750 (GY30)\r\n    if (bh1750.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire)) {\r\n        bh1750_ok = true;\r\n        Serial.println(\"[BH1750] OK\");\r\n    } else {\r\n        Serial.println(\"[BH1750] !!! Khong tim thay sensor\");\r\n    }\r\n\r\n    // MQTT topics\r\n    snprintf(topicCmd,       sizeof(topicCmd),       \"%s/cmd\",       MQTT_TOPIC);\r\n    snprintf(topicEnv,       sizeof(topicEnv),       \"%s/env\",       MQTT_TOPIC);\r\n    snprintf(topicHeartbeat, sizeof(topicHeartbeat), \"%s/heartbeat\", MQTT_TOPIC);\r\n    snprintf(topicPong,      sizeof(topicPong),      \"%s/pong\",      MQTT_TOPIC);\r\n    snprintf(topicLwt,       sizeof(topicLwt),       \"%s/lwt\",       MQTT_TOPIC);\r\n    snprintf(mqttClientId,   sizeof(mqttClientId),   \"ESP_%s\",       DEVICE_CODE);\r\n\r\n    // LWT payload\r\n    snprintf(lwtPayload, sizeof(lwtPayload),\r\n        \"{\\\"device\\\":\\\"%s\\\",\\\"status\\\":\\\"offline\\\"}\", DEVICE_CODE);\r\n\r\n    // WiFi\r\n    WiFi.mode(WIFI_STA);\r\n    WiFi.setAutoReconnect(true);\r\n    WiFi.begin(WIFI_SSID, WIFI_PASS);\r\n    Serial.println(\"[WiFi] Dang ket noi...\");\r\n\r\n    // MQTT\r\n    mqtt.setServer(MQTT_SERVER, MQTT_PORT);\r\n    mqtt.setBufferSize(512);\r\n    mqtt.setCallback(mqttCallback);\r\n\r\n    setupOTA();\r\n    Serial.println(\"[CFarm ENV] Setup hoan tat.\");\r\n    Serial.printf(\"[CFarm ENV] MQ warm-up: %lu giay...\\n\", SENSOR_WARMUP_MS / 1000);\r\n}\r\n\r\n// ======================== LOOP ========================\r\n\r\nvoid loop() {\r\n    esp_task_wdt_reset();\r\n    unsigned long now = millis();\r\n\r\n    // Kiem tra MQ warm-up\r\n    if (!warmup_done && (now - bootTime) >= SENSOR_WARMUP_MS) {\r\n        warmup_done = true;\r\n        Serial.println(\"[MQ] Warm-up hoan tat, bat dau doc cam bien khi\");\r\n    }\r\n\r\n    // WiFi reconnect (non-blocking)\r\n    if (WiFi.status() != WL_CONNECTED) {\r\n        if (now - lastWifiRetry > WIFI_RECONNECT_MS) {\r\n            lastWifiRetry = now;\r\n            Serial.println(\"[WiFi] Mat ket noi, thu lai...\");\r\n            WiFi.disconnect();\r\n            WiFi.begin(WIFI_SSID, WIFI_PASS);\r\n        }\r\n        return;\r\n    }\r\n\r\n    // MQTT reconnect (non-blocking)\r\n    if (!mqtt.connected()) {\r\n        if (now - lastMqttRetry > MQTT_RECONNECT_MS) {\r\n            lastMqttRetry = now;\r\n            mqttReconnect();\r\n        }\r\n    } else {\r\n        mqtt.loop();\r\n    }\r\n\r\n    // Gui du lieu cam bien\r\n    // Lan dau: gui sau 30s (cho sensor on dinh), sau do moi 5 phut\r\n    unsigned long envDelay = (envSendCount == 0) ? 30000 : ENV_INTERVAL_MS;\r\n    if (now - lastEnvSend > envDelay) {\r\n        lastEnvSend = now;\r\n        readAndSendEnv();\r\n    }\r\n\r\n    // Heartbeat\r\n    if (now - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {\r\n        lastHeartbeat = now;\r\n        sendHeartbeat();\r\n    }\r\n\r\n    ArduinoOTA.handle();\r\n}\r\n\r\n// ======================== DOC CAM BIEN ========================\r\n\r\n/**\r\n * Doc ADC nhieu lan va lay trung binh (loc nhieu)\r\n * Tra ve variance qua pointer (de phat hien chan floating)\r\n */\r\nint readADCAvg(int pin, float* outVariance = nullptr) {\r\n    long sum = 0;\r\n    long sumSq = 0;\r\n    for (int i = 0; i < ADC_SAMPLES; i++) {\r\n        int val = analogRead(pin);\r\n        sum += val;\r\n        sumSq += (long)val * val;\r\n        delay(ADC_SAMPLE_DELAY_MS);\r\n    }\r\n    int avg = (int)(sum / ADC_SAMPLES);\r\n    if (outVariance) {\r\n        // Variance = E[X^2] - (E[X])^2\r\n        *outVariance = (float)(sumSq / ADC_SAMPLES) - (float)avg * avg;\r\n    }\r\n    return avg;\r\n}\r\n\r\n/**\r\n * Tinh nong do khi tu gia tri ADC\r\n * Cong thuc: Rs/R0 ratio -> tra bang -> ppm\r\n *\r\n * MQ137: NH3 (amoniac) - pho bien trong chuong nuoi\r\n *   - Range: 5-200 ppm\r\n *   - Nguong canh bao: >25 ppm\r\n *\r\n * MQ135: CO2 / VOC\r\n *   - Range: 10-1000 ppm\r\n *   - Nguong canh bao: >1000 ppm CO2\r\n */\r\nfloat calcMQppm(int rawADC, float R0, float a, float b) {\r\n    if (rawADC <= 0 || R0 <= 0) return 0;\r\n\r\n    float voltage = (rawADC / 4095.0) * 3.3;\r\n    if (voltage <= 0.01) return 0;  // Sensor chua san sang\r\n\r\n    // Rs = RL * (Vc - Vout) / Vout\r\n    float Rs = MQ_RL * (3.3 - voltage) / voltage;\r\n    float ratio = Rs / R0;\r\n\r\n    // ppm = a * (Rs/R0)^b (tham so tu datasheet/calibration)\r\n    float ppm = a * pow(ratio, b);\r\n    return ppm;\r\n}\r\n\r\n/**\r\n * Doc tat ca cam bien va gui len MQTT\r\n */\r\nvoid readAndSendEnv() {\r\n    Serial.println(\"[ENV] === Doc cam bien ===\");\r\n\r\n    // SHT40: Nhiet do + Do am\r\n    if (sht40_ok) {\r\n        sensors_event_t hum, temp;\r\n        if (sht40.getEvent(&hum, &temp)) {\r\n            lastTemp = temp.temperature;\r\n            lastHumidity = hum.relative_humidity;\r\n            Serial.printf(\"[SHT40] Temp=%.1f°C  Hum=%.1f%%\\n\", lastTemp, lastHumidity);\r\n        } else {\r\n            // Doc loi → reset ve NAN (tranh gui gia tri cu/stale)\r\n            lastTemp = NAN;\r\n            lastHumidity = NAN;\r\n            Serial.println(\"[SHT40] !!! Doc loi — reset NAN\");\r\n        }\r\n    } else {\r\n        lastTemp = NAN;\r\n        lastHumidity = NAN;\r\n    }\r\n\r\n    // BH1750: Anh sang\r\n    if (bh1750_ok) {\r\n        float lux = bh1750.readLightLevel();\r\n        if (lux >= 0) {\r\n            lastLux = lux;\r\n            Serial.printf(\"[BH1750] Lux=%.1f\\n\", lastLux);\r\n        } else {\r\n            lastLux = NAN;\r\n            Serial.println(\"[BH1750] !!! Doc loi — reset NAN\");\r\n        }\r\n    } else {\r\n        lastLux = NAN;\r\n    }\r\n\r\n    // MQ sensors (chi doc sau warm-up)\r\n    // Phat hien chan floating bang variance: sensor that = on dinh, floating = noise cao\r\n    if (warmup_done) {\r\n        // MQ137 - NH3\r\n        float var137 = 0;\r\n        lastMQ137raw = readADCAvg(MQ137_PIN, &var137);\r\n        if (var137 > 5000) {\r\n            // Chan floating (variance qua cao) = khong cam sensor\r\n            lastNH3_ppm = NAN;\r\n            Serial.printf(\"[MQ137] Raw=%d var=%.0f — FLOATING (khong co sensor)\\n\", lastMQ137raw, var137);\r\n        } else if (lastMQ137raw >= 100 && lastMQ137raw <= 3900) {\r\n            lastNH3_ppm = calcMQppm(lastMQ137raw, MQ137_R0, 102.2, -2.473);\r\n            Serial.printf(\"[MQ137] Raw=%d var=%.0f NH3=%.1f ppm\\n\", lastMQ137raw, var137, lastNH3_ppm);\r\n        } else {\r\n            lastNH3_ppm = NAN;\r\n            Serial.printf(\"[MQ137] Raw=%d var=%.0f — ngoai range\\n\", lastMQ137raw, var137);\r\n        }\r\n\r\n        // MQ135 - CO2\r\n        float var135 = 0;\r\n        lastMQ135raw = readADCAvg(MQ135_PIN, &var135);\r\n        if (var135 > 5000) {\r\n            lastCO2_ppm = NAN;\r\n            Serial.printf(\"[MQ135] Raw=%d var=%.0f — FLOATING (khong co sensor)\\n\", lastMQ135raw, var135);\r\n        } else if (lastMQ135raw >= 100 && lastMQ135raw <= 3900) {\r\n            lastCO2_ppm = calcMQppm(lastMQ135raw, MQ135_R0, 116.602, -2.769);\r\n            Serial.printf(\"[MQ135] Raw=%d var=%.0f CO2=%.1f ppm\\n\", lastMQ135raw, var135, lastCO2_ppm);\r\n        } else {\r\n            lastCO2_ppm = NAN;\r\n            Serial.printf(\"[MQ135] Raw=%d var=%.0f — ngoai range\\n\", lastMQ135raw, var135);\r\n        }\r\n    } else {\r\n        Serial.println(\"[MQ] Dang warm-up, bo qua...\");\r\n    }\r\n\r\n    // Publish MQTT\r\n    if (!mqtt.connected()) {\r\n        Serial.println(\"[ENV] !!! MQTT khong ket noi, khong gui duoc\");\r\n        return;\r\n    }\r\n\r\n    envSendCount++;\r\n\r\n    // Dung ArduinoJson de xu ly null dung cach\r\n    StaticJsonDocument<384> doc;\r\n    doc[\"device\"] = DEVICE_CODE;\r\n\r\n    // SHT40: null neu khong co sensor\r\n    if (!isnan(lastTemp))     doc[\"temp\"] = serialized(String(lastTemp, 1));\r\n    else                      doc[\"temp\"] = (char*)NULL;\r\n    if (!isnan(lastHumidity)) doc[\"humidity\"] = serialized(String(lastHumidity, 1));\r\n    else                      doc[\"humidity\"] = (char*)NULL;\r\n\r\n    // BH1750: null neu khong co sensor\r\n    if (!isnan(lastLux))      doc[\"lux\"] = serialized(String(lastLux, 1));\r\n    else                      doc[\"lux\"] = (char*)NULL;\r\n\r\n    // MQ sensors: null neu khong cam hoac chua warm-up\r\n    if (!isnan(lastNH3_ppm))  doc[\"4];\ppm\"] = serialized(String(lastNH3_ppm, 1));\r\n    else                      doc[\"nh3_ppm\"] = (char*)NULL;\r\n    if (!isnan(lastCO2_ppm))  doc[\"co2_ppm\"] = serialized(String(lastCO2_ppm, 1));\r\n    else                      doc[\"co2_ppm\"] = (char*)NULL;\r\n\r\n    doc[\"mq137_raw\"] = (lastMQ137raw >= 0) ? lastMQ137raw : 0;\r\n    doc[\"mq135_raw\"] = (lastMQ135raw >= 0) ? lastMQ135raw : 0;\r\n    doc[\"warmup\"]    = warmup_done;\r\n    doc[\"seq\"]       = envSendCount;\r\n\r\n    char buf[384];\r\n    serializeJson(doc, buf, sizeof(buf));\r\n\r\n    if (mqtt.publish(topicEnv, buf, false)) {\r\n        Serial.printf(\"[ENV] >>> Da gui (#%d)\\n\", envSendCount);\r\n    } else {\r\n        Serial.println(\"[ENV] !!! Publish that bai\");\r\n    }\r\n}\r\n\r\n// ======================== MQTT ========================\r\n\r\nvoid mqttReconnect() {\r\n    Serial.println(\"[MQTT] Dang ket noi...\");\r\n\r\n    if (mqtt.connect(mqttClientId, MQTT_USER, MQTT_PASS,\r\n                     topicLwt, 1, false, lwtPayload)) {\r\n        Serial.println(\"[MQTT] Da ket noi! (voi LWT)\");\r\n        mqtt.subscribe(topicCmd);\r\n        sendHeartbeat();\r\n    } else {\r\n        Serial.printf(\"[MQTT] That bai, rc=%d\\n\", mqtt.state());\r\n    }\r\n}\r\n\r\nvoid mqttCallback(char* topic, byte* payload, unsigned int length) {\r\n    char raw[257];\r\n    int copyLen = (length < sizeof(raw) - 1) ? length : sizeof(raw) - 1;\r\n    memcpy(raw, payload, copyLen);\r\n    raw[copyLen] = \'\\0\';\r\n    Serial.printf(\"[CMD] <<< Nhan lenh: %s\\n\", raw);\r\n\r\n    StaticJsonDocument<256> doc;\r\n    DeserializationError err = deserializeJson(doc, payload, length);\r\n    if (err) {\r\n        Serial.printf(\"[CMD] !!! JSON parse loi: %s\\n\", err.c_str());\r\n        return;\r\n    }\r\n\r\n    const char* action = doc[\"action\"] | \"\";\r\n\r\n    if (strcmp(action, \"ping\") == 0) {\r\n        handlePing(doc);\r\n    } else if (strcmp(action, \"ota\") == 0) {\r\n        handleOtaCmd(doc);\r\n    } else if (strcmp(action, \"config\") == 0) {\r\n        handleConfig(doc);\r\n    } else {\r\n        Serial.printf(\"[CMD] !!! Action khong ho tro: \\\"%s\\\"\\n\", action);\r\n    }\r\n}\r\n\r\nvoid handlePing(const JsonDocument& doc) {\r\n    Serial.println(\"[CMD] >>> Nhan PING tu server\");\r\n    if (!mqtt.connected()) return;\r\n\r\n    unsigned long ts = doc[\"ts\"] | 0;\r\n    char buf[256];\r\n    snprintf(buf, sizeof(buf),\r\n        \"{\\\"device\\\":\\\"%s\\\",\\\"ts\\\":%lu,\\\"uptime\\\":%lu,\\\"heap\\\":%u,\\\"rssi\\\":%d,\"\r\n        \"\\\"sht40\\\":%s,\\\"bh1750\\\":%s,\\\"warmup\\\":%s}\",\r\n        DEVICE_CODE, ts, millis() / 1000,\r\n        ESP.getFreeHeap(), WiFi.RSSI(),\r\n        sht40_ok ? \"true\" : \"false\",\r\n        bh1750_ok ? \"true\" : \"false\",\r\n        warmup_done ? \"true\" : \"false\");\r\n\r\n    mqtt.publish(topicPong, buf);\r\n    Serial.println(\"[CMD] OK: Da gui PONG\");\r\n}\r\n\r\n/**\r\n * Lenh config tu xa: thay doi interval, R0 calibration\r\n * VD: {\"action\":\"config\",\"env_interval\":60,\"mq137_r0\":3.5,\"mq135_r0\":2.8}\r\n */\r\nvoid handleConfig(const JsonDocument& doc) {\r\n    Serial.println(\"[CMD] >>> Config tu xa\");\r\n\r\n    // TODO: Luu vao NVS neu can\r\n    // Hien tai chi log, chua apply runtime\r\n    serializeJsonPretty(doc, Serial);\r\n    Serial.println();\r\n}\r\n\r\n// ======================== HEARTBEAT ========================\r\n\r\nvoid sendHeartbeat() {\r\n    if (!mqtt.connected()) return;\r\n\r\n    char buf[320];\r\n    snprintf(buf, sizeof(buf),\r\n        \"{\\\"device\\\":\\\"%s\\\",\\\"status\\\":\\\"online\\\",\\\"wifi_rssi\\\":%d,\"\r\n        \"\\\"ip\\\":\\\"%s\\\",\\\"uptime\\\":%lu,\\\"heap\\\":%u,\"\r\n        \"\\\"sensors\\\":{\\\"sht40\\\":%s,\\\"bh1750\\\":%s,\\\"mq_warmup\\\":%s}}\",\r\n        DEVICE_CODE,\r\n        WiFi.RSSI(),\r\n        WiFi.localIP().toString().c_str(),\r\n        millis() / 1000,\r\n        ESP.getFreeHeap(),\r\n        sht40_ok ? \"true\" : \"false\",\r\n        bh1750_ok ? \"true\" : \"false\",\r\n        warmup_done ? \"true\" : \"false\");\r\n\r\n    if (mqtt.publish(topicHeartbeat, buf, false)) {\r\n        Serial.println(\"[Heartbeat] OK\");\r\n    }\r\n}\r\n\r\n// ======================== HTTP OTA ========================\r\n\r\nvoid handleOtaCmd(const JsonDocument& doc) {\r\n    const char* url = doc[\"url\"] | \"\";\r\n    const char* version = doc[\"version\"] | \"unknown\";\r\n\r\n    if (strlen(url) == 0) {\r\n        Serial.println(\"[OTA] URL rong, bo qua\");\r\n        return;\r\n    }\r\n\r\n    Serial.printf(\"[OTA] Bat dau cap nhat v%s tu: %s\\n\", version, url);\r\n\r\n    // Thong bao server\r\n    char buf[192];\r\n    snprintf(buf, sizeof(buf),\r\n        \"{\\\"device\\\":\\\"%s\\\",\\\"status\\\":\\\"updating\\\",\\\"version\\\":\\\"%s\\\"}\",\r\n        DEVICE_CODE, version);\r\n    mqtt.publish(topicEnv, buf);\r\n\r\n    WiFiClient client;\r\n    HTTPClient http;\r\n    http.begin(client, url);\r\n    http.setTimeout(30000);\r\n\r\n    int httpCode = http.GET();\r\n    if (httpCode != 200) {\r\n        Serial.printf(\"[OTA] HTTP loi: %d\\n\", httpCode);\r\n        http.end();\r\n        return;\r\n    }\r\n\r\n    int contentLength = http.getSize();\r\n    if (contentLength <= 0) {\r\n        Serial.println(\"[OTA] Content-Length khong hop le\");\r\n        http.end();\r\n        return;\r\n    }\r\n\r\n    if (!Update.begin(contentLength)) {\r\n        Serial.printf(\"[OTA] Khong du bo nho: %d bytes\\n\", contentLength);\r\n        http.end();\r\n        return;\r\n    }\r\n\r\n    esp_task_wdt_reset();\r\n\r\n    WiFiClient* stream = http.getStreamPtr();\r\n    size_t written = Update.writeStream(*stream);\r\n    http.end();\r\n\r\n    if (written != contentLength) {\r\n        Serial.printf(\"[OTA] Ghi thieu: %d/%d bytes\\n\", written, contentLength);\r\n        Update.abort();\r\n        return;\r\n    }\r\n\r\n    if (!Update.end(true)) {\r\n        Serial.printf(\"[OTA] Loi ket thuc: %s\\n\", Update.errorString());\r\n        return;\r\n    }\r\n\r\n    Serial.println(\"[OTA] Hoan tat! Khoi dong lai...\");\r\n    delay(500);\r\n    ESP.restart();\r\n}\r\n\r\n// ======================== OTA ========================\r\n\r\nvoid setupOTA() {\r\n    ArduinoOTA.setHostname(DEVICE_CODE);\r\n    ArduinoOTA.setPassword(\"cfarm_ota\");\r\n    ArduinoOTA.onStart([]() { Serial.println(\"[OTA] Bat dau cap nhat...\"); });\r\n    ArduinoOTA.onEnd([]()   { Serial.println(\"\\n[OTA] Hoan tat!\"); });\r\n    ArduinoOTA.onError([](ota_error_t error) {\r\n        Serial.printf(\"[OTA] Loi [%u]\\n\", error);\r\n    });\r\n    ArduinoOTA.begin();\r\n    Serial.println(\"[OTA] San sang.\");\r\n}\r\n', 1, 1, '2026-03-20 14:55:24', '2026-03-20 18:18:05');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `device_pings`
--

CREATE TABLE `device_pings` (
  `id` int NOT NULL,
  `device_id` int NOT NULL,
  `ping_sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ping_response_at` datetime DEFAULT NULL,
  `status` enum('pending','success','timeout') NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Track ping requests to devices';

--
-- Đang đổ dữ liệu cho bảng `device_pings`
--

INSERT INTO `device_pings` (`id`, `device_id`, `ping_sent_at`, `ping_response_at`, `status`, `created_at`) VALUES
(1, 37, '2026-03-19 18:51:49', NULL, 'pending', '2026-03-19 18:51:49'),
(2, 37, '2026-03-19 18:53:13', NULL, 'pending', '2026-03-19 18:53:13'),
(3, 37, '2026-03-19 18:54:14', NULL, 'pending', '2026-03-19 18:54:14'),
(4, 37, '2026-03-19 18:55:16', NULL, 'pending', '2026-03-19 18:55:16'),
(5, 37, '2026-03-19 18:56:18', NULL, 'pending', '2026-03-19 18:56:18'),
(6, 37, '2026-03-19 18:57:20', NULL, 'pending', '2026-03-19 18:57:20'),
(7, 37, '2026-03-19 18:58:22', NULL, 'pending', '2026-03-19 18:58:22'),
(8, 37, '2026-03-19 18:59:23', NULL, 'pending', '2026-03-19 18:59:23'),
(9, 37, '2026-03-19 19:00:24', NULL, 'pending', '2026-03-19 19:00:24'),
(10, 37, '2026-03-19 19:01:25', NULL, 'pending', '2026-03-19 19:01:25'),
(11, 37, '2026-03-19 19:02:26', NULL, 'pending', '2026-03-19 19:02:26'),
(12, 37, '2026-03-19 19:03:27', NULL, 'pending', '2026-03-19 19:03:27'),
(13, 37, '2026-03-19 19:04:29', NULL, 'pending', '2026-03-19 19:04:29'),
(14, 37, '2026-03-19 19:05:31', NULL, 'pending', '2026-03-19 19:05:31'),
(15, 37, '2026-03-19 19:06:33', NULL, 'pending', '2026-03-19 19:06:33'),
(16, 37, '2026-03-19 19:07:35', NULL, 'pending', '2026-03-19 19:07:35'),
(17, 37, '2026-03-19 19:08:36', NULL, 'pending', '2026-03-19 19:08:36'),
(18, 37, '2026-03-19 19:09:37', NULL, 'pending', '2026-03-19 19:09:37'),
(19, 37, '2026-03-19 19:10:38', NULL, 'pending', '2026-03-19 19:10:38'),
(20, 37, '2026-03-19 19:11:39', NULL, 'pending', '2026-03-19 19:11:39'),
(21, 37, '2026-03-19 19:12:40', NULL, 'pending', '2026-03-19 19:12:40'),
(22, 37, '2026-03-19 19:13:42', NULL, 'pending', '2026-03-19 19:13:42'),
(23, 37, '2026-03-19 19:14:44', NULL, 'pending', '2026-03-19 19:14:44'),
(24, 37, '2026-03-19 19:15:46', NULL, 'pending', '2026-03-19 19:15:46'),
(25, 37, '2026-03-19 19:16:48', NULL, 'pending', '2026-03-19 19:16:48'),
(26, 37, '2026-03-19 19:17:49', NULL, 'pending', '2026-03-19 19:17:49'),
(27, 37, '2026-03-19 19:18:50', NULL, 'pending', '2026-03-19 19:18:50'),
(28, 37, '2026-03-19 19:19:51', NULL, 'pending', '2026-03-19 19:19:51'),
(29, 37, '2026-03-19 19:20:52', NULL, 'pending', '2026-03-19 19:20:52'),
(30, 37, '2026-03-19 19:21:53', NULL, 'pending', '2026-03-19 19:21:53'),
(31, 37, '2026-03-19 19:22:55', NULL, 'pending', '2026-03-19 19:22:55'),
(32, 37, '2026-03-19 19:23:57', NULL, 'pending', '2026-03-19 19:23:57'),
(33, 37, '2026-03-19 19:24:59', NULL, 'pending', '2026-03-19 19:24:59'),
(34, 37, '2026-03-19 19:26:01', NULL, 'pending', '2026-03-19 19:26:01'),
(35, 37, '2026-03-19 19:27:02', NULL, 'pending', '2026-03-19 19:27:02'),
(36, 37, '2026-03-19 19:28:03', NULL, 'pending', '2026-03-19 19:28:03'),
(37, 37, '2026-03-19 19:29:04', NULL, 'pending', '2026-03-19 19:29:04'),
(38, 37, '2026-03-19 19:30:05', NULL, 'pending', '2026-03-19 19:30:05'),
(39, 38, '2026-03-19 19:42:23', NULL, 'pending', '2026-03-19 19:42:23'),
(40, 38, '2026-03-19 19:43:25', NULL, 'pending', '2026-03-19 19:43:25'),
(41, 38, '2026-03-19 19:44:27', NULL, 'pending', '2026-03-19 19:44:27'),
(42, 38, '2026-03-19 19:45:28', NULL, 'pending', '2026-03-19 19:45:28'),
(43, 38, '2026-03-19 19:46:29', NULL, 'pending', '2026-03-19 19:46:29'),
(44, 39, '2026-03-19 19:47:30', NULL, 'pending', '2026-03-19 19:47:30'),
(45, 39, '2026-03-19 19:48:32', NULL, 'pending', '2026-03-19 19:48:32'),
(46, 39, '2026-03-19 19:49:34', NULL, 'pending', '2026-03-19 19:49:34'),
(47, 40, '2026-03-19 19:50:36', NULL, 'pending', '2026-03-19 19:50:36'),
(48, 40, '2026-03-19 19:51:38', NULL, 'pending', '2026-03-19 19:51:38'),
(49, 41, '2026-03-19 19:53:42', NULL, 'pending', '2026-03-19 19:53:42'),
(50, 41, '2026-03-19 19:54:43', NULL, 'pending', '2026-03-19 19:54:43'),
(51, 41, '2026-03-19 19:55:44', NULL, 'pending', '2026-03-19 19:55:44'),
(52, 42, '2026-03-19 19:56:45', NULL, 'pending', '2026-03-19 19:56:45'),
(53, 42, '2026-03-19 19:57:47', NULL, 'pending', '2026-03-19 19:57:47'),
(54, 42, '2026-03-19 19:58:49', NULL, 'pending', '2026-03-19 19:58:49'),
(55, 44, '2026-03-19 19:59:51', NULL, 'pending', '2026-03-19 19:59:51'),
(56, 44, '2026-03-19 20:00:53', NULL, 'pending', '2026-03-19 20:00:53'),
(57, 44, '2026-03-19 20:01:55', NULL, 'pending', '2026-03-19 20:01:55'),
(58, 44, '2026-03-19 20:02:57', NULL, 'pending', '2026-03-19 20:02:57'),
(59, 45, '2026-03-19 20:05:41', NULL, 'pending', '2026-03-19 20:05:41'),
(60, 45, '2026-03-19 20:06:59', NULL, 'pending', '2026-03-19 20:06:59'),
(61, 45, '2026-03-19 20:08:05', NULL, 'pending', '2026-03-19 20:08:05'),
(62, 45, '2026-03-19 20:09:06', NULL, 'pending', '2026-03-19 20:09:06'),
(63, 45, '2026-03-19 20:16:38', NULL, 'pending', '2026-03-19 20:16:38'),
(64, 45, '2026-03-19 20:17:59', NULL, 'pending', '2026-03-19 20:17:59'),
(65, 45, '2026-03-19 20:19:03', NULL, 'pending', '2026-03-19 20:19:03'),
(66, 45, '2026-03-19 20:20:05', NULL, 'pending', '2026-03-19 20:20:05'),
(67, 45, '2026-03-19 20:21:33', NULL, 'pending', '2026-03-19 20:21:33'),
(68, 45, '2026-03-19 20:22:50', NULL, 'pending', '2026-03-19 20:22:50'),
(69, 45, '2026-03-19 20:23:59', NULL, 'pending', '2026-03-19 20:23:59'),
(70, 45, '2026-03-19 20:25:04', NULL, 'pending', '2026-03-19 20:25:04'),
(71, 45, '2026-03-19 20:26:05', NULL, 'pending', '2026-03-19 20:26:05'),
(72, 45, '2026-03-19 20:27:34', NULL, 'pending', '2026-03-19 20:27:34'),
(73, 45, '2026-03-19 20:28:59', NULL, 'pending', '2026-03-19 20:28:59'),
(74, 45, '2026-03-19 20:30:04', NULL, 'pending', '2026-03-19 20:30:04'),
(75, 45, '2026-03-19 20:31:05', NULL, 'pending', '2026-03-19 20:31:05'),
(76, 45, '2026-03-19 20:32:34', NULL, 'pending', '2026-03-19 20:32:34'),
(77, 45, '2026-03-19 20:33:59', NULL, 'pending', '2026-03-19 20:33:59'),
(78, 45, '2026-03-19 20:35:04', NULL, 'pending', '2026-03-19 20:35:04'),
(79, 45, '2026-03-19 20:36:05', NULL, 'pending', '2026-03-19 20:36:05'),
(80, 45, '2026-03-19 20:37:34', NULL, 'pending', '2026-03-19 20:37:34'),
(81, 45, '2026-03-19 20:38:59', NULL, 'pending', '2026-03-19 20:38:59'),
(82, 45, '2026-03-19 20:40:04', NULL, 'pending', '2026-03-19 20:40:04'),
(83, 45, '2026-03-19 20:41:05', NULL, 'pending', '2026-03-19 20:41:05'),
(84, 45, '2026-03-19 20:42:25', NULL, 'pending', '2026-03-19 20:42:25'),
(85, 45, '2026-03-19 20:43:34', NULL, 'pending', '2026-03-19 20:43:34'),
(86, 45, '2026-03-19 20:44:59', NULL, 'pending', '2026-03-19 20:44:59'),
(87, 45, '2026-03-19 20:46:04', NULL, 'pending', '2026-03-19 20:46:04'),
(88, 45, '2026-03-19 20:47:05', NULL, 'pending', '2026-03-19 20:47:05');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `device_states`
--

CREATE TABLE `device_states` (
  `id` int NOT NULL,
  `device_id` int NOT NULL,
  `channel_id` int DEFAULT NULL,
  `state` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `position_pct` tinyint DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `device_state_log`
--

CREATE TABLE `device_state_log` (
  `id` bigint NOT NULL,
  `device_id` int DEFAULT NULL,
  `channel_id` int DEFAULT NULL,
  `curtain_config_id` int DEFAULT NULL,
  `state` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `position_pct` tinyint DEFAULT NULL,
  `logged_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `device_types`
--

CREATE TABLE `device_types` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL COMMENT 'TÃªn loáº¡i: ESP32 Relay 8CH, DHT22 Sensor...',
  `description` varchar(255) DEFAULT NULL COMMENT 'MÃ´ táº£',
  `device_class` enum('relay','sensor','mixed') NOT NULL DEFAULT 'relay' COMMENT 'Loáº¡i: relay/sensor/mixed',
  `total_channels` int NOT NULL DEFAULT '8' COMMENT 'Sá»‘ kÃªnh',
  `mqtt_protocol` json DEFAULT NULL COMMENT 'Protocol JSON config',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_active` tinyint(1) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Loáº¡i thiáº¿t bá»‹ ESP';

--
-- Đang đổ dữ liệu cho bảng `device_types`
--

INSERT INTO `device_types` (`id`, `name`, `description`, `device_class`, `total_channels`, `mqtt_protocol`, `created_at`, `updated_at`, `is_active`) VALUES
(1, 'ESP32 Relay 8 kênh', 'Điều khiển 4 tấm bạt trong 1 barn', 'relay', 8, '{\"status\": {\"topic\": \"{device}/status\"}, \"command\": {\"topic\": \"{device}/cmd\"}, \"heartbeat\": {\"topic\": \"{device}/heartbeat\", \"interval_s\": 30}}', '2026-03-17 19:42:30', '2026-03-18 11:40:19', 1),
(2, 'ESP32 DHT22 Sensor', 'Cáº£m biáº¿n nhiá»‡t Ä‘á»™/Ä‘á»™ áº©m DHT22', 'sensor', 0, '{\"telemetry\": {\"topic\": \"{device}/telemetry\", \"interval_s\": 60}}', '2026-03-17 19:42:30', '2026-03-17 19:42:30', 1),
(3, 'ESP32 ENV Sensor', 'Cáº£m biáº¿n mÃ´i trÆ°á»ng Ä‘áº§y Ä‘á»§', 'sensor', 0, '{\"env\": {\"topic\": \"{device}/env\", \"interval_s\": 300}}', '2026-03-17 19:42:30', '2026-03-17 19:42:30', 1),
(4, 'ESP32 ENV DHT40 MQ137 MQ135 GY30', 'Trọn bộ ENV', 'sensor', 8, NULL, '2026-03-20 14:31:56', '2026-03-20 15:37:34', 1);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `env_readings`
--

CREATE TABLE `env_readings` (
  `id` bigint UNSIGNED NOT NULL,
  `device_id` int NOT NULL,
  `barn_id` bigint UNSIGNED DEFAULT NULL,
  `cycle_id` bigint UNSIGNED DEFAULT NULL COMMENT 'Chu ká»³ nuÃ´i Ä‘ang hoáº¡t Ä‘á»™ng lÃºc Ä‘o',
  `day_age` smallint UNSIGNED DEFAULT NULL COMMENT 'NgÃ y tuá»•i cá»§a Ä‘Ã n lÃºc Ä‘o ENV',
  `temperature` decimal(5,2) DEFAULT NULL COMMENT 'Nhiá»‡t Ä‘á»™ trong chuá»“ng Â°C',
  `humidity` decimal(5,2) DEFAULT NULL COMMENT 'Äá»™ áº©m trong chuá»“ng %',
  `heat_index` decimal(5,2) DEFAULT NULL COMMENT 'Nhiá»‡t Ä‘á»™ cáº£m giÃ¡c Â°C',
  `nh3_ppm` decimal(7,2) DEFAULT NULL COMMENT 'Ná»“ng Ä‘á»™ NH3 ppm â€” ngÆ°á»¡ng nguy hiá»ƒm >25ppm',
  `co2_ppm` decimal(7,1) DEFAULT NULL COMMENT 'Ná»“ng Ä‘á»™ CO2 ppm â€” ngÆ°á»¡ng >3000ppm',
  `wind_speed_ms` decimal(5,2) DEFAULT NULL COMMENT 'Tá»‘c Ä‘á»™ giÃ³ m/s',
  `fan_rpm` int DEFAULT NULL COMMENT 'VÃ²ng/phÃºt quáº¡t thÃ´ng giÃ³',
  `light_lux` int DEFAULT NULL COMMENT 'CÆ°á»ng Ä‘á»™ Ã¡nh sÃ¡ng lux',
  `outdoor_temp` decimal(5,2) DEFAULT NULL COMMENT 'Nhiá»‡t Ä‘á»™ ngoÃ i trá»i Â°C',
  `outdoor_humidity` decimal(5,2) DEFAULT NULL COMMENT 'Äá»™ áº©m ngoÃ i trá»i %',
  `is_raining` tinyint(1) DEFAULT NULL COMMENT 'Äang mÆ°a: 1=cÃ³ 0=khÃ´ng',
  `rain_mm` decimal(6,2) DEFAULT NULL COMMENT 'LÆ°á»£ng mÆ°a mm (náº¿u cÃ³ rain gauge)',
  `recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Dá»¯ liá»‡u mÃ´i trÆ°á»ng chuá»“ng nuÃ´i theo thá»i gian â€” 5 phÃºt/láº§n';

--
-- Đang đổ dữ liệu cho bảng `env_readings`
--

INSERT INTO `env_readings` (`id`, `device_id`, `barn_id`, `cycle_id`, `day_age`, `temperature`, `humidity`, `heat_index`, `nh3_ppm`, `co2_ppm`, `wind_speed_ms`, `fan_rpm`, `light_lux`, `outdoor_temp`, `outdoor_humidity`, `is_raining`, `rain_mm`, `recorded_at`) VALUES
(1, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 18:48:30'),
(2, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 18:53:30'),
(3, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 18:58:30'),
(4, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 19:03:30'),
(5, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 19:08:30'),
(6, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 19:13:30'),
(7, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 19:18:30'),
(8, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 19:23:30'),
(9, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 19:28:30'),
(10, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 19:33:30'),
(11, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 19:38:30'),
(12, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 19:43:30'),
(13, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 19:48:30'),
(14, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 19:53:30'),
(15, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 19:58:30'),
(16, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 20:03:30'),
(17, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 20:08:30'),
(18, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 20:13:30'),
(19, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 20:18:30'),
(20, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 20:23:30'),
(21, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 20:28:30'),
(22, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 20:33:30'),
(23, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 20:38:30'),
(24, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 20:43:30'),
(25, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 20:48:30'),
(26, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 20:53:30'),
(27, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 20:58:30'),
(28, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 21:03:30'),
(29, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 21:08:30'),
(30, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 21:13:30'),
(31, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 21:18:30'),
(32, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 21:23:30'),
(33, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 21:28:30'),
(34, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 21:33:30'),
(35, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 21:38:30'),
(36, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 21:43:30'),
(37, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 21:48:30'),
(38, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 21:53:30'),
(39, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 21:58:30'),
(40, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 22:03:30'),
(41, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 22:08:30'),
(42, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 22:13:30'),
(43, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 22:18:30'),
(44, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 22:23:30'),
(45, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 22:28:30'),
(46, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 22:33:30'),
(47, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 22:38:30'),
(48, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 22:43:30'),
(49, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 22:48:30'),
(50, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 22:53:30'),
(51, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 22:58:30'),
(52, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 23:03:30'),
(53, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 23:08:30'),
(54, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 23:13:30'),
(55, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 23:18:30'),
(56, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 23:23:30'),
(57, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 23:28:30'),
(58, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 23:33:30'),
(59, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 23:38:30'),
(60, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 23:43:30'),
(61, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 23:48:30'),
(62, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 23:53:30'),
(63, 47, 6, 3, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-20 23:58:30'),
(64, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 00:03:30'),
(65, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 00:08:30'),
(66, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 00:13:30'),
(67, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 00:18:30'),
(68, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 00:23:30'),
(69, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 00:28:30'),
(70, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 00:33:30'),
(71, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 00:38:30'),
(72, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 00:43:30'),
(73, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 00:48:30'),
(74, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 00:53:29'),
(75, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 00:58:30'),
(76, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 01:03:29'),
(77, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 01:08:30'),
(78, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 01:13:29'),
(79, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 01:18:29'),
(80, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 01:23:29'),
(81, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 01:28:29'),
(82, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 01:33:29'),
(83, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 01:38:29'),
(84, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 01:43:29'),
(85, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 01:48:29'),
(86, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 01:53:29'),
(87, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 01:58:29'),
(88, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 02:03:29'),
(89, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 02:08:29'),
(90, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 02:13:29'),
(91, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 02:18:29'),
(92, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 02:23:29'),
(93, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 02:28:29'),
(94, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 02:33:29'),
(95, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 02:38:29'),
(96, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 02:43:29'),
(97, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 02:48:29'),
(98, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 02:53:29'),
(99, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 02:58:29'),
(100, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 03:03:29'),
(101, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 03:08:29'),
(102, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 03:13:29'),
(103, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 03:18:29'),
(104, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 03:23:29'),
(105, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 03:28:29'),
(106, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 03:33:29'),
(107, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 03:38:29'),
(108, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 03:43:29'),
(109, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 03:48:29'),
(110, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 03:53:29'),
(111, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 03:58:29'),
(112, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 04:03:29'),
(113, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 04:08:29'),
(114, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 04:13:29'),
(115, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 04:18:29'),
(116, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 04:23:29'),
(117, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 04:28:29'),
(118, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 04:33:29'),
(119, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 04:38:29'),
(120, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 04:43:29'),
(121, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 04:48:29'),
(122, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 04:53:29'),
(123, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 04:58:29'),
(124, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 05:03:29'),
(125, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 05:08:29'),
(126, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 05:13:29'),
(127, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 05:18:29'),
(128, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 05:23:29'),
(129, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 05:28:29'),
(130, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 05:33:29'),
(131, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 05:38:29'),
(132, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 05:43:29'),
(133, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 05:48:29'),
(134, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 05:53:29'),
(135, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 05:58:29'),
(136, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 06:03:29'),
(137, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 06:08:29'),
(138, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 06:13:29'),
(139, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 06:18:29'),
(140, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 06:23:29'),
(141, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 06:28:29'),
(142, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 06:33:29'),
(143, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 06:38:29'),
(144, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 06:43:29'),
(145, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 06:48:29'),
(146, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 06:53:29'),
(147, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 06:58:29'),
(148, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 07:03:29'),
(149, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 07:08:29'),
(150, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 07:13:29'),
(151, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 07:18:29'),
(152, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 07:23:29'),
(153, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 07:28:29'),
(154, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 07:33:29'),
(155, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 07:38:29'),
(156, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 07:43:29'),
(157, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 07:48:29'),
(158, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 07:53:29'),
(159, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 07:58:29'),
(160, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 08:03:28'),
(161, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 08:08:28'),
(162, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 08:13:28'),
(163, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 08:18:28'),
(164, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 08:23:28'),
(165, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 08:28:28'),
(166, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 08:33:28'),
(167, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 08:38:28'),
(168, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 08:43:28'),
(169, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 08:48:28'),
(170, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 08:53:28'),
(171, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 08:58:28'),
(172, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 09:03:28'),
(173, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 09:08:28'),
(174, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 09:13:28'),
(175, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 09:18:28'),
(176, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 09:23:28'),
(177, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 09:28:28'),
(178, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 09:33:28'),
(179, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 09:38:28'),
(180, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 09:43:28'),
(181, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 09:48:28'),
(182, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 09:53:28'),
(183, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 09:58:28'),
(184, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 10:03:28'),
(185, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 10:08:28'),
(186, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 10:13:28'),
(187, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 10:18:28'),
(188, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 10:23:28'),
(189, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 10:28:28'),
(190, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 10:33:28'),
(191, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 10:38:28'),
(192, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 10:43:28'),
(193, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 10:48:28'),
(194, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 10:53:28'),
(195, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 10:58:28'),
(196, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 11:03:28'),
(197, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 11:08:28'),
(198, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 11:13:28'),
(199, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 11:18:28'),
(200, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 11:23:28'),
(201, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 11:28:28'),
(202, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 11:33:28'),
(203, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 11:38:28'),
(204, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 11:43:28'),
(205, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 11:48:28'),
(206, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 11:53:28'),
(207, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 11:58:28'),
(208, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 12:03:28'),
(209, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 12:08:28'),
(210, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 12:13:28'),
(211, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 12:18:28'),
(212, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 12:23:28'),
(213, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 12:28:28'),
(214, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 12:33:28'),
(215, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 12:38:28'),
(216, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 12:43:28'),
(217, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 12:48:28'),
(218, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 12:53:28'),
(219, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 12:58:28'),
(220, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 13:03:28'),
(221, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 13:08:28'),
(222, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 13:13:28'),
(223, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 13:18:28'),
(224, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 13:23:28'),
(225, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 13:28:28'),
(226, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 13:33:28'),
(227, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 13:38:28'),
(228, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 13:43:28'),
(229, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 13:48:28'),
(230, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 13:53:28'),
(231, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 13:58:28'),
(232, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 14:03:28'),
(233, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 14:08:28'),
(234, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 14:13:28'),
(235, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 14:18:28'),
(236, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 14:23:28'),
(237, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 14:28:28'),
(238, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 14:33:28'),
(239, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 14:38:28'),
(240, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 14:43:28'),
(241, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 14:48:28'),
(242, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 14:53:28'),
(243, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 14:58:28'),
(244, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 15:03:28'),
(245, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 15:08:28'),
(246, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 15:13:28'),
(247, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 15:18:28'),
(248, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 15:23:28'),
(249, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 15:28:27'),
(250, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 15:33:27'),
(251, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 15:38:27'),
(252, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 15:43:27'),
(253, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 15:48:27'),
(254, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 15:53:27'),
(255, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 15:58:27'),
(256, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 16:03:27'),
(257, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 16:08:27'),
(258, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 16:13:27'),
(259, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 16:18:27'),
(260, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 16:23:27'),
(261, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 16:28:27'),
(262, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 16:33:27'),
(263, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 16:38:27'),
(264, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 16:43:27'),
(265, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 16:48:27'),
(266, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 16:53:27'),
(267, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 16:58:27'),
(268, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 17:03:27'),
(269, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 17:08:27'),
(270, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 17:13:27'),
(271, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 17:18:27'),
(272, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 17:23:27'),
(273, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 17:28:27'),
(274, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 17:33:27'),
(275, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 17:38:27'),
(276, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 17:43:27'),
(277, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 17:48:27'),
(278, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 17:53:27'),
(279, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 17:58:27'),
(280, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 18:03:27'),
(281, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 18:08:27'),
(282, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 18:13:27'),
(283, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 18:18:27'),
(284, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 18:23:27'),
(285, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 18:28:27'),
(286, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 18:33:27'),
(287, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 18:38:27'),
(288, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 18:43:27'),
(289, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 18:48:27'),
(290, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 18:53:27'),
(291, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 18:58:27'),
(292, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 19:03:27'),
(293, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 19:08:27'),
(294, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 19:13:27'),
(295, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 19:18:27'),
(296, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 19:23:27'),
(297, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 19:28:27'),
(298, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 19:33:27'),
(299, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 19:38:27'),
(300, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 19:43:27'),
(301, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 19:48:27'),
(302, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 19:53:27'),
(303, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 19:58:27'),
(304, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 20:03:27'),
(305, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 20:08:27'),
(306, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 20:13:27'),
(307, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 20:18:27'),
(308, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 20:23:27'),
(309, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 20:28:27'),
(310, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 20:33:27'),
(311, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 20:38:27'),
(312, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 20:43:27'),
(313, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 20:48:27'),
(314, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 20:53:27'),
(315, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 20:58:27'),
(316, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 21:03:27'),
(317, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 21:08:27'),
(318, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 21:13:27'),
(319, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 21:18:27'),
(320, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 21:23:27'),
(321, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 21:28:27'),
(322, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 21:33:27'),
(323, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 21:38:27'),
(324, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 21:43:27'),
(325, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 21:48:27'),
(326, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 21:53:27'),
(327, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 21:58:27'),
(328, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 22:03:27'),
(329, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 22:08:27'),
(330, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 22:13:27'),
(331, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 22:18:27'),
(332, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 22:23:27'),
(333, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 22:28:27'),
(334, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 22:33:27'),
(335, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 22:38:27'),
(336, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 22:43:27'),
(337, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 22:48:27'),
(338, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 22:53:27'),
(339, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 22:58:27'),
(340, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 23:03:26'),
(341, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 23:08:26'),
(342, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 23:13:26'),
(343, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 23:18:26'),
(344, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 23:23:26'),
(345, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 23:28:26'),
(346, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 23:33:26'),
(347, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 23:38:26'),
(348, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 23:43:26'),
(349, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 23:48:26'),
(350, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 23:53:26'),
(351, 47, 6, 3, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-21 23:58:26'),
(352, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 00:03:26'),
(353, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 00:08:26'),
(354, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 00:13:26'),
(355, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 00:18:26'),
(356, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 00:23:26'),
(357, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 00:28:26'),
(358, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 00:33:26'),
(359, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 00:38:26'),
(360, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 00:43:26'),
(361, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 00:48:26'),
(362, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 00:53:26'),
(363, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 00:58:26'),
(364, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 01:03:26'),
(365, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 01:08:26'),
(366, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 01:18:26'),
(367, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 01:23:26'),
(368, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 01:28:26'),
(369, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 01:33:26'),
(370, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 01:39:46'),
(371, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 01:44:46'),
(372, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 01:49:47'),
(373, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 01:54:46'),
(374, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 01:59:46'),
(375, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 02:04:46'),
(376, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 02:09:46'),
(377, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 02:14:46'),
(378, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 02:24:46'),
(379, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 02:29:46'),
(380, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 02:35:58'),
(381, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 02:40:59'),
(382, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 02:45:58'),
(383, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 02:50:58'),
(384, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 02:55:58'),
(385, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 03:00:59'),
(386, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 03:05:58'),
(387, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 03:10:58'),
(388, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 03:15:58'),
(389, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 03:20:58'),
(390, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 03:25:58'),
(391, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 03:30:58'),
(392, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 03:35:58'),
(393, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 03:40:58'),
(394, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 03:45:58'),
(395, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 03:50:58'),
(396, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 03:55:58'),
(397, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 04:00:58'),
(398, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 04:05:58'),
(399, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 04:10:58'),
(400, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 04:15:58'),
(401, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 04:20:58'),
(402, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 04:25:58'),
(403, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 04:30:58'),
(404, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 04:35:58'),
(405, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 04:40:58'),
(406, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 04:45:58'),
(407, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 04:50:58'),
(408, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 04:55:58'),
(409, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 05:00:58'),
(410, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 05:05:58'),
(411, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 05:10:58'),
(412, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 05:15:58'),
(413, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 05:20:58'),
(414, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 05:25:58'),
(415, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 05:30:58'),
(416, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 05:35:58'),
(417, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 05:40:58'),
(418, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 05:45:58'),
(419, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 05:50:58'),
(420, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 05:55:58'),
(421, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 06:00:58'),
(422, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 06:05:58'),
(423, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 06:10:58'),
(424, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 06:15:58'),
(425, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 06:20:58'),
(426, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 06:25:58'),
(427, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 06:30:58'),
(428, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 06:35:58'),
(429, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 06:40:58'),
(430, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 06:45:58'),
(431, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 06:50:58'),
(432, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 06:55:58'),
(433, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 07:00:58'),
(434, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 07:05:58'),
(435, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 07:10:58'),
(436, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 07:15:58'),
(437, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 07:20:58'),
(438, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 07:25:58'),
(439, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 07:30:58'),
(440, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 07:35:58'),
(441, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 07:40:58');
INSERT INTO `env_readings` (`id`, `device_id`, `barn_id`, `cycle_id`, `day_age`, `temperature`, `humidity`, `heat_index`, `nh3_ppm`, `co2_ppm`, `wind_speed_ms`, `fan_rpm`, `light_lux`, `outdoor_temp`, `outdoor_humidity`, `is_raining`, `rain_mm`, `recorded_at`) VALUES
(442, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 07:45:58'),
(443, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 07:50:58'),
(444, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 07:55:58'),
(445, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 08:00:58'),
(446, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 08:05:58'),
(447, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 08:10:58'),
(448, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 08:15:58'),
(449, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 08:20:57'),
(450, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 08:25:57'),
(451, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 08:30:58'),
(452, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 08:35:58'),
(453, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 08:40:58'),
(454, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 08:45:57'),
(455, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 08:50:57'),
(456, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 08:55:57'),
(457, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 09:00:57'),
(458, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 09:05:57'),
(459, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 09:10:57'),
(460, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 09:15:57'),
(461, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 09:20:57'),
(462, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 09:25:57'),
(463, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 09:30:57'),
(464, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 09:35:57'),
(465, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 09:40:57'),
(466, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 09:45:57'),
(467, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 09:50:57'),
(468, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 09:55:57'),
(469, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 10:00:57'),
(470, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 10:05:57'),
(471, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 10:10:57'),
(472, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 10:15:57'),
(473, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 10:20:57'),
(474, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 10:25:57'),
(475, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 10:30:57'),
(476, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 10:35:57'),
(477, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 10:40:57'),
(478, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 10:45:57'),
(479, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 10:50:57'),
(480, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 10:55:57'),
(481, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 11:00:57'),
(482, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 11:05:57'),
(483, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 11:10:57'),
(484, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 11:15:57'),
(485, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 11:20:57'),
(486, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 11:25:57'),
(487, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 11:30:57'),
(488, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 11:35:57'),
(489, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 11:40:57'),
(490, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 11:45:57'),
(491, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 11:50:57'),
(492, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 11:55:57'),
(493, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 12:00:57'),
(494, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 12:05:57'),
(495, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 12:10:57'),
(496, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 12:15:57'),
(497, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 12:20:57'),
(498, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 12:25:57'),
(499, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 12:30:57'),
(500, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 12:35:57'),
(501, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 12:40:57'),
(502, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 12:45:57'),
(503, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 12:50:57'),
(504, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 12:55:57'),
(505, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 13:00:57'),
(506, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 13:05:57'),
(507, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 13:10:57'),
(508, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 13:15:57'),
(509, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 13:20:57'),
(510, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 13:25:57'),
(511, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 13:30:57'),
(512, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 13:35:57'),
(513, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 13:40:57'),
(514, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 13:45:57'),
(515, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 13:50:57'),
(516, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 13:55:57'),
(517, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 14:00:57'),
(518, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 14:05:57'),
(519, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 14:10:57'),
(520, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 14:15:57'),
(521, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 14:20:57'),
(522, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 14:25:57'),
(523, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 14:30:57'),
(524, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 14:35:57'),
(525, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 14:40:57'),
(526, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 14:45:57'),
(527, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 14:50:57'),
(528, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 14:55:57'),
(529, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 15:00:57'),
(530, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 15:05:57'),
(531, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 15:10:57'),
(532, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 15:15:57'),
(533, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 15:20:57'),
(534, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 15:25:57'),
(535, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 15:30:57'),
(536, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 15:35:56'),
(537, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 15:40:57'),
(538, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 15:45:56'),
(539, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 15:50:56'),
(540, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 15:55:57'),
(541, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 16:00:56'),
(542, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 16:05:56'),
(543, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 16:10:56'),
(544, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 16:15:56'),
(545, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 16:20:56'),
(546, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 16:25:56'),
(547, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 16:30:56'),
(548, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 16:35:56'),
(549, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 16:40:56'),
(550, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 16:45:56'),
(551, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 16:50:56'),
(552, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 16:55:56'),
(553, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 17:00:56'),
(554, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 17:05:56'),
(555, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 17:10:56'),
(556, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 17:15:56'),
(557, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 17:20:56'),
(558, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 17:25:56'),
(559, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 17:30:56'),
(560, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 17:35:56'),
(561, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 17:40:56'),
(562, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 17:45:56'),
(563, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 17:50:56'),
(564, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 17:55:56'),
(565, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 18:00:56'),
(566, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 18:05:56'),
(567, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 18:10:56'),
(568, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 18:15:56'),
(569, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 18:20:56'),
(570, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 18:25:56'),
(571, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 18:30:56'),
(572, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 18:35:56'),
(573, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 18:40:56'),
(574, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 18:45:56'),
(575, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 18:50:56'),
(576, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 18:55:56'),
(577, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 19:00:56'),
(578, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 19:05:56'),
(579, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 19:10:56'),
(580, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 19:15:56'),
(581, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 19:20:56'),
(582, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 19:25:56'),
(583, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 19:30:56'),
(584, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 19:35:56'),
(585, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 19:40:56'),
(586, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 19:45:56'),
(587, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 19:50:56'),
(588, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 19:55:56'),
(589, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 20:00:56'),
(590, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 20:05:56'),
(591, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 20:10:56'),
(592, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 20:15:56'),
(593, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 20:20:56'),
(594, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 20:25:56'),
(595, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 20:30:56'),
(596, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 20:35:56'),
(597, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 20:40:56'),
(598, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 20:45:56'),
(599, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 20:50:56'),
(600, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 20:55:56'),
(601, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 21:01:01'),
(602, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 21:05:56'),
(603, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 21:10:56'),
(604, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 21:15:56'),
(605, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 21:20:56'),
(606, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 21:25:56'),
(607, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 21:30:56'),
(608, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 21:35:56'),
(609, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 21:40:56'),
(610, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 21:45:56'),
(611, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 21:50:56'),
(612, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 21:55:56'),
(613, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:00:56'),
(614, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:05:56'),
(615, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:10:56'),
(616, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:15:56'),
(617, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:20:56'),
(618, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:25:56'),
(619, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:30:56'),
(620, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:35:56'),
(621, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:40:56'),
(622, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:45:55'),
(623, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:50:56'),
(624, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 22:55:55'),
(625, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 23:00:55'),
(626, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 23:05:56'),
(627, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 23:10:56'),
(628, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 23:15:55'),
(629, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 23:20:55'),
(630, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 23:25:55'),
(631, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 23:30:55'),
(632, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 23:35:55'),
(633, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 23:40:55'),
(634, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 23:45:55'),
(635, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 23:50:55'),
(636, 47, 6, 3, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-22 23:55:55'),
(637, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 00:00:55'),
(638, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 00:05:55'),
(639, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 00:10:55'),
(640, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 00:15:55'),
(641, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 00:20:55'),
(642, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 00:25:55'),
(643, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 00:30:55'),
(644, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 00:35:55'),
(645, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 00:40:55'),
(646, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 00:45:55'),
(647, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 00:50:55'),
(648, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 00:55:55'),
(649, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 01:00:55'),
(650, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 01:05:55'),
(651, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 01:10:55'),
(652, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 01:15:55'),
(653, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 01:20:55'),
(654, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 01:25:55'),
(655, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 01:30:55'),
(656, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 01:35:55'),
(657, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 01:40:55'),
(658, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 01:45:55'),
(659, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 01:50:55'),
(660, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 01:55:55'),
(661, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 02:00:55'),
(662, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 02:05:55'),
(663, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 02:10:55'),
(664, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 02:15:55'),
(665, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 02:20:55'),
(666, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 02:25:55'),
(667, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 02:30:55'),
(668, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 02:35:55'),
(669, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 02:40:55'),
(670, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 02:45:55'),
(671, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 02:50:55'),
(672, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 02:55:55'),
(673, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 03:00:55'),
(674, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 03:05:55'),
(675, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 03:10:55'),
(676, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 03:15:55'),
(677, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 03:20:55'),
(678, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 03:25:55'),
(679, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 03:30:55'),
(680, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 03:35:55'),
(681, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 03:40:55'),
(682, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 03:45:55'),
(683, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 03:50:55'),
(684, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 03:55:55'),
(685, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 04:00:55'),
(686, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 04:05:55'),
(687, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 04:10:55'),
(688, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 04:15:55'),
(689, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 04:20:55'),
(690, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 04:25:55'),
(691, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 04:30:55'),
(692, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 04:35:55'),
(693, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 04:40:55'),
(694, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 04:45:55'),
(695, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 04:50:55'),
(696, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 04:55:55'),
(697, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 05:00:55'),
(698, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 05:05:55'),
(699, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 05:10:55'),
(700, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 05:15:55'),
(701, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 05:20:55'),
(702, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 05:25:55'),
(703, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 05:30:55'),
(704, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 05:35:55'),
(705, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 05:40:55'),
(706, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 05:45:55'),
(707, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 05:50:55'),
(708, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 05:55:55'),
(709, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 06:00:54'),
(710, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 06:05:55'),
(711, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 06:10:55'),
(712, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 06:15:55'),
(713, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 06:20:55'),
(714, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 06:25:55'),
(715, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 06:30:55'),
(716, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 06:35:54'),
(717, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 06:40:54'),
(718, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 06:45:54'),
(719, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 06:50:54'),
(720, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 06:55:54'),
(721, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 07:00:54'),
(722, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 07:05:54'),
(723, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 07:10:54'),
(724, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 07:15:54'),
(725, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 07:20:54'),
(726, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 07:25:54'),
(727, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 07:30:54'),
(728, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 07:35:54'),
(729, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 07:40:54'),
(730, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 07:45:54'),
(731, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 07:50:54'),
(732, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 07:55:54'),
(733, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 08:00:54'),
(734, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 08:05:54'),
(735, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 08:10:54'),
(736, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 08:15:54'),
(737, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 08:20:54'),
(738, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 08:25:54'),
(739, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 08:30:54'),
(740, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 08:35:54'),
(741, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 08:40:54'),
(742, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 08:45:54'),
(743, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 08:50:54'),
(744, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 08:55:54'),
(745, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 09:00:54'),
(746, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 09:05:54'),
(747, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 09:10:54'),
(748, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 09:15:54'),
(749, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 09:20:54'),
(750, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 09:25:54'),
(751, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 09:30:54'),
(752, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 09:35:54'),
(753, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 09:40:54'),
(754, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 09:45:54'),
(755, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 09:50:54'),
(756, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 09:55:54'),
(757, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 10:00:54'),
(758, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 10:05:54'),
(759, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 10:10:54'),
(760, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 10:15:54'),
(761, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 10:20:54'),
(762, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 10:25:54'),
(763, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 10:30:54'),
(764, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 10:35:54'),
(765, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 10:40:54'),
(766, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 10:45:54'),
(767, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 10:50:54'),
(768, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 10:55:54'),
(769, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 11:00:54'),
(770, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 11:05:54'),
(771, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 11:10:54'),
(772, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 11:16:08'),
(773, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 11:21:08'),
(774, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 11:26:08'),
(775, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 11:31:08'),
(776, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 11:36:08'),
(777, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 11:41:08'),
(778, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 11:46:08'),
(779, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 11:51:08'),
(780, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 11:56:08'),
(781, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 12:01:08'),
(782, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 12:06:08'),
(783, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 12:11:08'),
(784, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 12:16:08'),
(785, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 12:21:08'),
(786, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 12:26:08'),
(787, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 12:31:08'),
(788, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 12:36:08'),
(789, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 12:41:08'),
(790, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 12:46:08'),
(791, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 12:51:08'),
(792, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 12:56:08'),
(793, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 13:01:08'),
(794, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 13:06:08'),
(795, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 13:11:08'),
(796, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 13:16:08'),
(797, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 13:21:08'),
(798, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 13:26:08'),
(799, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 13:31:08'),
(800, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 13:36:08'),
(801, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 13:41:08'),
(802, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 13:46:08'),
(803, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 13:51:08'),
(804, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 13:56:12'),
(805, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 14:01:07'),
(806, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 14:06:07'),
(807, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 14:11:07'),
(808, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 14:16:07'),
(809, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 14:21:07'),
(810, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 14:26:07'),
(811, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 14:31:07'),
(812, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 14:36:07'),
(813, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 14:41:07'),
(814, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 14:46:07'),
(815, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 14:51:07'),
(816, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 14:56:07'),
(817, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 15:01:07'),
(818, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 15:06:07'),
(819, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 15:11:07'),
(820, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 15:16:07'),
(821, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 15:21:07'),
(822, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 15:26:07'),
(823, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 15:31:07'),
(824, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 15:36:07'),
(825, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 15:41:07'),
(826, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 15:46:07'),
(827, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 15:51:07'),
(828, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 15:56:07'),
(829, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 16:01:07'),
(830, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 16:06:07'),
(831, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 16:11:07'),
(832, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 16:16:07'),
(833, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 16:21:07'),
(834, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 16:26:07'),
(835, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 16:31:07'),
(836, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 16:36:07'),
(837, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 16:41:07'),
(838, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 16:46:07'),
(839, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 16:51:07'),
(840, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 16:56:07'),
(841, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 17:01:07'),
(842, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 17:06:07'),
(843, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 17:11:07'),
(844, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 17:16:07'),
(845, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 17:21:07'),
(846, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 17:26:07'),
(847, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 17:31:07'),
(848, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 17:36:07'),
(849, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 17:41:07'),
(850, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 17:42:11'),
(851, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 17:47:07'),
(852, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 17:52:07'),
(853, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 17:57:07'),
(854, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 18:02:07'),
(855, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 18:07:07'),
(856, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 18:12:07'),
(857, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 18:17:07'),
(858, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 18:22:07'),
(859, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 18:27:07'),
(860, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 18:32:07'),
(861, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 18:37:07'),
(862, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 18:42:07'),
(863, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 18:47:07'),
(864, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 18:52:07'),
(865, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 18:57:07'),
(866, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 19:02:07'),
(867, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 19:07:07'),
(868, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 19:12:07'),
(869, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 19:17:06'),
(870, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 19:22:07'),
(871, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 19:27:06'),
(872, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 19:32:06'),
(873, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 19:37:07'),
(874, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 19:42:06'),
(875, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 19:47:06'),
(876, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 19:52:06'),
(877, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 19:57:06'),
(878, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 20:02:06');
INSERT INTO `env_readings` (`id`, `device_id`, `barn_id`, `cycle_id`, `day_age`, `temperature`, `humidity`, `heat_index`, `nh3_ppm`, `co2_ppm`, `wind_speed_ms`, `fan_rpm`, `light_lux`, `outdoor_temp`, `outdoor_humidity`, `is_raining`, `rain_mm`, `recorded_at`) VALUES
(879, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 20:07:06'),
(880, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 20:12:06'),
(881, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 20:17:06'),
(882, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 20:22:06'),
(883, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 20:27:06'),
(884, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 20:32:06'),
(885, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 20:37:06'),
(886, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 20:42:06'),
(887, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 20:47:06'),
(888, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 20:52:06'),
(889, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 20:57:06'),
(890, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 21:02:06'),
(891, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 21:07:06'),
(892, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 21:12:06'),
(893, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 21:17:06'),
(894, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 21:22:06'),
(895, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 21:27:06'),
(896, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 21:32:06'),
(897, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 21:37:06'),
(898, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 21:42:06'),
(899, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 21:47:06'),
(900, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 21:52:06'),
(901, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 21:57:06'),
(902, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 22:02:06'),
(903, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 22:07:06'),
(904, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 22:12:06'),
(905, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 22:17:06'),
(906, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 22:22:06'),
(907, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 22:27:06'),
(908, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 22:32:06'),
(909, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 22:37:06'),
(910, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 22:42:06'),
(911, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 22:47:06'),
(912, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 22:52:06'),
(913, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 22:57:06'),
(914, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 23:02:06'),
(915, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 23:07:06'),
(916, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 23:12:06'),
(917, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 23:17:06'),
(918, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 23:22:06'),
(919, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 23:27:06'),
(920, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 23:32:06'),
(921, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 23:37:06'),
(922, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 23:42:06'),
(923, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 23:47:06'),
(924, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 23:52:06'),
(925, 47, 6, 3, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-23 23:57:06'),
(926, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 00:02:06'),
(927, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 00:07:06'),
(928, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 00:12:06'),
(929, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 00:17:06'),
(930, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 00:22:06'),
(931, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 00:27:06'),
(932, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 00:32:06'),
(933, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 00:37:06'),
(934, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 00:42:06'),
(935, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 00:47:06'),
(936, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 00:52:06'),
(937, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 00:57:06'),
(938, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 01:02:06'),
(939, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 01:07:06'),
(940, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 01:12:06'),
(941, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 01:17:06'),
(942, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 01:22:06'),
(943, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 01:27:06'),
(944, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 01:32:06'),
(945, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 01:37:06'),
(946, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 01:42:06'),
(947, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 01:47:06'),
(948, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 01:52:06'),
(949, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 01:57:06'),
(950, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 02:02:06'),
(951, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 02:07:06'),
(952, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 02:12:06'),
(953, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 02:17:06'),
(954, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 02:22:06'),
(955, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 02:27:06'),
(956, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 02:32:06'),
(957, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 02:37:06'),
(958, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 02:42:05'),
(959, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 02:47:05'),
(960, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 02:52:05'),
(961, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 02:57:05'),
(962, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 03:02:06'),
(963, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 03:07:05'),
(964, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 03:12:05'),
(965, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 03:17:05'),
(966, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 03:22:05'),
(967, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 03:27:05'),
(968, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 03:32:05'),
(969, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 03:37:05'),
(970, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 03:42:05'),
(971, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 03:47:05'),
(972, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 03:52:05'),
(973, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 03:57:05'),
(974, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 04:02:05'),
(975, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 04:07:05'),
(976, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 04:12:05'),
(977, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 04:17:05'),
(978, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 04:22:05'),
(979, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 04:27:05'),
(980, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 04:32:05'),
(981, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 04:37:05'),
(982, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 04:42:05'),
(983, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 04:47:05'),
(984, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 04:52:05'),
(985, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 04:57:05'),
(986, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 05:02:05'),
(987, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 05:07:05'),
(988, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 05:12:05'),
(989, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 05:17:05'),
(990, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 05:22:05'),
(991, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 05:27:05'),
(992, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 05:32:05'),
(993, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 05:37:05'),
(994, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 05:42:05'),
(995, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 05:47:05'),
(996, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 05:52:05'),
(997, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 05:57:05'),
(998, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 06:02:05'),
(999, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 06:07:05'),
(1000, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 06:12:05'),
(1001, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 06:17:05'),
(1002, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 06:22:05'),
(1003, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 06:27:05'),
(1004, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 06:32:05'),
(1005, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 06:37:05'),
(1006, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 06:42:05'),
(1007, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 06:47:05'),
(1008, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 06:52:05'),
(1009, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 06:57:05'),
(1010, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 07:02:05'),
(1011, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 07:07:05'),
(1012, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 07:12:05'),
(1013, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 07:17:05'),
(1014, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 07:22:05'),
(1015, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 07:27:05'),
(1016, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 07:32:05'),
(1017, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 07:37:05'),
(1018, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 07:42:05'),
(1019, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 07:47:05'),
(1020, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 07:52:05'),
(1021, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 07:57:05'),
(1022, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 08:02:05'),
(1023, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 08:07:05'),
(1024, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 08:12:05'),
(1025, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 08:17:05'),
(1026, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 08:22:05'),
(1027, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 08:27:05'),
(1028, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 08:32:05'),
(1029, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 08:37:05'),
(1030, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 08:42:05'),
(1031, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 08:47:05'),
(1032, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 08:52:05'),
(1033, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 08:57:05'),
(1034, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 09:02:05'),
(1035, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 09:07:05'),
(1036, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 09:12:05'),
(1037, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 09:17:05'),
(1038, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 09:22:05'),
(1039, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 09:27:05'),
(1040, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 09:32:05'),
(1041, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 09:37:05'),
(1042, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 09:42:05'),
(1043, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 09:47:05'),
(1044, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 09:52:05'),
(1045, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 09:57:05'),
(1046, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 10:02:04'),
(1047, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 10:07:04'),
(1048, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 10:12:04'),
(1049, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 10:17:05'),
(1050, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 10:22:04'),
(1051, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 10:27:04'),
(1052, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 10:32:04'),
(1053, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 10:37:04'),
(1054, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 10:42:04'),
(1055, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 10:47:04'),
(1056, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 10:52:04'),
(1057, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 10:57:04'),
(1058, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 11:02:04'),
(1059, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 11:07:04'),
(1060, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 11:12:04'),
(1061, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 11:17:04'),
(1062, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 11:22:04'),
(1063, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 11:27:04'),
(1064, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 11:32:04'),
(1065, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 11:37:04'),
(1066, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 11:42:04'),
(1067, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 11:47:04'),
(1068, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 11:52:04'),
(1069, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 11:57:04'),
(1070, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 12:02:04'),
(1071, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 12:07:04'),
(1072, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 12:12:04'),
(1073, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 12:17:04'),
(1074, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 12:22:04'),
(1075, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 12:27:04'),
(1076, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 12:32:04'),
(1077, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 12:37:04'),
(1078, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 12:42:04'),
(1079, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 12:47:04'),
(1080, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 12:52:04'),
(1081, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 12:57:04'),
(1082, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 13:02:04'),
(1083, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 13:07:04'),
(1084, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 13:12:04'),
(1085, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 13:17:04'),
(1086, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 13:22:04'),
(1087, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 13:27:04'),
(1088, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 13:32:04'),
(1089, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 13:37:04'),
(1090, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 13:42:04'),
(1091, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 13:47:04'),
(1092, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 13:52:04'),
(1093, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 13:57:04'),
(1094, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 14:02:04'),
(1095, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 14:07:04'),
(1096, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 14:12:04'),
(1097, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 14:17:04'),
(1098, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 14:22:04'),
(1099, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 14:27:04'),
(1100, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 14:32:04'),
(1101, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 14:37:04'),
(1102, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 14:42:04'),
(1103, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 14:47:04'),
(1104, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 14:52:04'),
(1105, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 14:57:04'),
(1106, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 15:02:04'),
(1107, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 15:07:04'),
(1108, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 15:12:04'),
(1109, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 15:17:04'),
(1110, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 15:22:04'),
(1111, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 15:27:04'),
(1112, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 15:32:04'),
(1113, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 15:37:04'),
(1114, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 15:42:04'),
(1115, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 15:47:04'),
(1116, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 15:52:04'),
(1117, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 15:57:04'),
(1118, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 16:02:04'),
(1119, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 16:07:04'),
(1120, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 16:12:04'),
(1121, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 16:17:04'),
(1122, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 16:22:04'),
(1123, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 16:27:04'),
(1124, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 16:32:04'),
(1125, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 16:37:04'),
(1126, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 16:42:04'),
(1127, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 16:47:04'),
(1128, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 16:52:04'),
(1129, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 16:57:04'),
(1130, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 17:02:04'),
(1131, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 17:07:04'),
(1132, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 17:12:04'),
(1133, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 17:17:04'),
(1134, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 17:19:53'),
(1135, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 17:24:54'),
(1136, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 17:29:54'),
(1137, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 17:34:54'),
(1138, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 17:39:54'),
(1139, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 17:44:54'),
(1140, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 17:49:54'),
(1141, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 17:54:54'),
(1142, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 17:59:54'),
(1143, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 18:04:54'),
(1144, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 18:09:54'),
(1145, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 18:14:54'),
(1146, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 18:19:54'),
(1147, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 18:24:54'),
(1148, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 18:29:54'),
(1149, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 18:34:54'),
(1150, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 18:39:54'),
(1151, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 18:44:54'),
(1152, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 18:49:54'),
(1153, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 18:54:54'),
(1154, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 18:59:54'),
(1155, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 19:04:54'),
(1156, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 19:09:54'),
(1157, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 19:14:54'),
(1158, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 19:19:54'),
(1159, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 19:24:54'),
(1160, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 19:29:54'),
(1161, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 19:34:54'),
(1162, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 19:39:54'),
(1163, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 19:44:54'),
(1164, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 19:49:54'),
(1165, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 19:54:54'),
(1166, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 19:59:54'),
(1167, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 20:04:54'),
(1168, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 20:09:54'),
(1169, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 20:14:54'),
(1170, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 20:19:54'),
(1171, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 20:24:54'),
(1172, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 20:29:54'),
(1173, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 20:34:54'),
(1174, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 20:39:54'),
(1175, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 20:44:54'),
(1176, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 20:49:54'),
(1177, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 20:54:54'),
(1178, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 20:59:54'),
(1179, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 21:04:54'),
(1180, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 21:09:54'),
(1181, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 21:14:54'),
(1182, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 21:19:53'),
(1183, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 21:24:53'),
(1184, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 21:29:53'),
(1185, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 21:34:53'),
(1186, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 21:39:53'),
(1187, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 21:44:53'),
(1188, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 21:49:53'),
(1189, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 21:54:53'),
(1190, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 21:59:53'),
(1191, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 22:04:53'),
(1192, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 22:09:53'),
(1193, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 22:14:53'),
(1194, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 22:19:53'),
(1195, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 22:24:53'),
(1196, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 22:29:53'),
(1197, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 22:34:53'),
(1198, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 22:39:53'),
(1199, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 22:44:53'),
(1200, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 22:49:53'),
(1201, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 22:54:53'),
(1202, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 22:59:53'),
(1203, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 23:04:53'),
(1204, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 23:09:53'),
(1205, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 23:14:53'),
(1206, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 23:19:53'),
(1207, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 23:24:53'),
(1208, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 23:29:53'),
(1209, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 23:34:53'),
(1210, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 23:39:53'),
(1211, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 23:44:53'),
(1212, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 23:49:53'),
(1213, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 23:54:53'),
(1214, 47, 6, 3, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-24 23:59:53'),
(1215, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 00:04:53'),
(1216, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 00:09:53'),
(1217, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 00:14:53'),
(1218, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 00:19:53'),
(1219, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 00:24:53'),
(1220, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 00:29:53'),
(1221, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 00:34:53'),
(1222, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 00:39:53'),
(1223, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 00:44:53'),
(1224, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 00:49:53'),
(1225, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 00:54:53'),
(1226, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 00:59:53'),
(1227, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 01:04:53'),
(1228, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 01:09:53'),
(1229, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 01:14:53'),
(1230, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 01:19:53'),
(1231, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 01:24:53'),
(1232, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 01:29:53'),
(1233, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 01:34:53'),
(1234, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 01:39:53'),
(1235, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 01:44:53'),
(1236, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 01:49:53'),
(1237, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 01:54:53'),
(1238, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 01:59:53'),
(1239, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 02:04:53'),
(1240, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 02:09:53'),
(1241, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 02:14:53'),
(1242, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 02:19:53'),
(1243, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 02:24:53'),
(1244, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 02:29:53'),
(1245, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 02:34:53'),
(1246, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 02:39:53'),
(1247, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 02:44:53'),
(1248, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 02:49:53'),
(1249, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 02:54:53'),
(1250, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 02:59:53'),
(1251, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 03:04:53'),
(1252, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 03:09:53'),
(1253, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 03:14:53'),
(1254, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 03:19:53'),
(1255, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 03:24:53'),
(1256, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 03:29:53'),
(1257, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 03:34:53'),
(1258, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 03:39:53'),
(1259, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 03:44:53'),
(1260, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 03:49:53'),
(1261, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 03:54:53'),
(1262, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 03:59:53'),
(1263, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 04:04:53'),
(1264, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 04:09:53'),
(1265, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 04:14:53'),
(1266, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 04:19:52'),
(1267, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 04:24:52'),
(1268, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 04:29:53'),
(1269, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 04:34:53'),
(1270, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 04:39:52'),
(1271, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 04:44:52'),
(1272, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 04:49:52'),
(1273, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 04:54:52'),
(1274, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 04:59:52'),
(1275, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 05:04:52'),
(1276, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 05:09:52'),
(1277, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 05:14:52'),
(1278, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 05:19:52'),
(1279, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 05:24:52'),
(1280, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 05:29:52'),
(1281, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 05:34:52'),
(1282, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 05:39:52'),
(1283, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 05:44:52'),
(1284, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 05:49:52'),
(1285, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 05:54:52'),
(1286, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 05:59:52'),
(1287, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 06:04:52'),
(1288, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 06:09:52'),
(1289, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 06:14:52'),
(1290, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 06:19:52'),
(1291, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 06:24:52'),
(1292, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 06:29:52'),
(1293, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 06:34:52'),
(1294, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 06:39:52'),
(1295, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 06:44:52'),
(1296, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 06:49:52'),
(1297, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 06:54:52'),
(1298, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 06:59:52'),
(1299, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 07:04:52'),
(1300, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 07:09:52'),
(1301, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 07:14:52'),
(1302, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 07:19:52'),
(1303, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 07:24:52'),
(1304, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 07:29:52'),
(1305, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 07:34:52'),
(1306, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 07:39:52'),
(1307, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 07:44:52'),
(1308, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 07:49:52'),
(1309, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 07:54:52'),
(1310, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 07:59:52'),
(1311, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 08:04:52');
INSERT INTO `env_readings` (`id`, `device_id`, `barn_id`, `cycle_id`, `day_age`, `temperature`, `humidity`, `heat_index`, `nh3_ppm`, `co2_ppm`, `wind_speed_ms`, `fan_rpm`, `light_lux`, `outdoor_temp`, `outdoor_humidity`, `is_raining`, `rain_mm`, `recorded_at`) VALUES
(1312, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 08:09:52'),
(1313, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 08:14:52'),
(1314, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 08:19:52'),
(1315, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 08:24:52'),
(1316, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 08:29:52'),
(1317, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 08:34:52'),
(1318, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 08:39:52'),
(1319, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 08:44:52'),
(1320, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 08:49:52'),
(1321, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 08:54:52'),
(1322, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 08:59:52'),
(1323, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 09:04:52'),
(1324, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 09:09:52'),
(1325, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 09:14:52'),
(1326, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 09:19:52'),
(1327, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 09:24:52'),
(1328, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 09:29:52'),
(1329, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 09:34:52'),
(1330, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 09:39:52'),
(1331, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 09:44:52'),
(1332, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 09:49:52'),
(1333, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 09:54:52'),
(1334, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 09:59:52'),
(1335, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 10:04:52'),
(1336, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 10:09:52'),
(1337, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 10:14:52'),
(1338, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 10:19:52'),
(1339, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 10:24:52'),
(1340, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 10:29:52'),
(1341, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 10:34:52'),
(1342, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 10:39:52'),
(1343, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 10:44:52'),
(1344, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 10:49:52'),
(1345, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 10:54:52'),
(1346, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 10:59:52'),
(1347, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 11:04:52'),
(1348, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 11:09:52'),
(1349, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 11:14:52'),
(1350, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 11:19:52'),
(1351, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 11:24:52'),
(1352, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 11:29:52'),
(1353, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 11:34:51'),
(1354, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 11:39:51'),
(1355, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 11:44:51'),
(1356, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 11:49:51'),
(1357, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 11:54:51'),
(1358, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 11:59:51'),
(1359, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 12:04:51'),
(1360, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 12:09:51'),
(1361, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 12:14:51'),
(1362, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 12:19:51'),
(1363, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 12:24:51'),
(1364, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 12:29:51'),
(1365, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 12:34:51'),
(1366, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 12:39:51'),
(1367, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 12:44:51'),
(1368, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 12:49:51'),
(1369, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 12:54:51'),
(1370, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 12:59:51'),
(1371, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 13:04:51'),
(1372, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 13:09:51'),
(1373, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 13:14:51'),
(1374, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 13:19:51'),
(1375, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 13:24:51'),
(1376, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 13:29:51'),
(1377, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 13:34:51'),
(1378, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 13:39:51'),
(1379, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 13:44:51'),
(1380, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 13:49:51'),
(1381, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 13:54:51'),
(1382, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 13:59:51'),
(1383, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 14:04:51'),
(1384, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 14:09:51'),
(1385, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 14:14:51'),
(1386, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 14:19:51'),
(1387, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 14:24:51'),
(1388, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 14:29:51'),
(1389, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 14:34:51'),
(1390, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 14:39:51'),
(1391, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 14:44:51'),
(1392, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 14:49:51'),
(1393, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 14:54:51'),
(1394, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 14:59:51'),
(1395, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 15:04:51'),
(1396, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 15:09:51'),
(1397, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 15:14:51'),
(1398, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 15:19:51'),
(1399, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 15:24:51'),
(1400, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 15:29:51'),
(1401, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 15:34:51'),
(1402, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 15:39:51'),
(1403, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 15:44:51'),
(1404, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 15:49:51'),
(1405, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 15:54:51'),
(1406, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 15:59:51'),
(1407, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 16:04:51'),
(1408, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 16:09:51'),
(1409, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 16:14:51'),
(1410, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 16:19:51'),
(1411, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 16:24:51'),
(1412, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 16:29:51'),
(1413, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 16:34:51'),
(1414, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 16:39:51'),
(1415, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 16:44:51'),
(1416, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 16:49:51'),
(1417, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 16:54:51'),
(1418, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 16:59:51'),
(1419, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 17:04:51'),
(1420, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 17:09:51'),
(1421, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 17:14:51'),
(1422, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 17:19:51'),
(1423, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 17:24:51'),
(1424, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 17:29:51'),
(1425, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 17:34:51'),
(1426, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 17:39:51'),
(1427, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 17:44:51'),
(1428, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 17:49:51'),
(1429, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 17:54:51'),
(1430, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 17:59:51'),
(1431, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 18:04:51'),
(1432, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 18:09:51'),
(1433, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 18:14:51'),
(1434, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 18:19:51'),
(1435, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 18:24:51'),
(1436, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 18:29:51'),
(1437, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 18:34:51'),
(1438, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 18:39:51'),
(1439, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 18:44:51'),
(1440, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 18:49:51'),
(1441, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 18:54:50'),
(1442, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 18:59:51'),
(1443, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 19:04:50'),
(1444, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 19:09:50'),
(1445, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 19:14:50'),
(1446, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 19:19:50'),
(1447, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 19:24:50'),
(1448, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 19:29:50'),
(1449, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 19:34:50'),
(1450, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 19:39:50'),
(1451, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 19:44:50'),
(1452, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 19:49:50'),
(1453, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 19:54:50'),
(1454, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 19:59:50'),
(1455, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 20:04:50'),
(1456, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 20:09:50'),
(1457, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 20:14:50'),
(1458, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 20:19:50'),
(1459, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 20:24:50'),
(1460, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 20:29:50'),
(1461, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 20:34:50'),
(1462, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 20:39:50'),
(1463, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 20:44:50'),
(1464, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 20:49:50'),
(1465, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 20:54:50'),
(1466, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 20:59:50'),
(1467, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 21:04:50'),
(1468, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 21:09:50'),
(1469, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 21:14:50'),
(1470, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 21:19:50'),
(1471, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 21:24:50'),
(1472, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 21:29:50'),
(1473, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 21:34:50'),
(1474, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 21:39:50'),
(1475, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 21:44:50'),
(1476, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 21:49:50'),
(1477, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 21:54:50'),
(1478, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 21:59:50'),
(1479, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 22:04:50'),
(1480, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 22:09:50'),
(1481, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 22:14:50'),
(1482, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 22:19:50'),
(1483, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 22:24:50'),
(1484, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 22:29:50'),
(1485, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 22:34:50'),
(1486, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 22:39:50'),
(1487, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 22:44:50'),
(1488, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 22:49:50'),
(1489, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 22:54:50'),
(1490, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 22:59:50'),
(1491, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 23:04:50'),
(1492, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 23:09:50'),
(1493, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 23:14:50'),
(1494, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 23:19:50'),
(1495, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 23:24:50'),
(1496, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 23:29:50'),
(1497, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 23:34:50'),
(1498, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 23:39:50'),
(1499, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 23:44:50'),
(1500, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 23:49:50'),
(1501, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 23:54:50'),
(1502, 47, 6, 3, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-25 23:59:50'),
(1503, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 00:04:50'),
(1504, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 00:09:50'),
(1505, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 00:14:50'),
(1506, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 00:19:50'),
(1507, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 00:24:50'),
(1508, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 00:29:50'),
(1509, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 00:34:50'),
(1510, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 00:39:50'),
(1511, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 00:44:50'),
(1512, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 00:49:50'),
(1513, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 00:54:50'),
(1514, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 00:59:50'),
(1515, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 01:04:50'),
(1516, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 01:09:50'),
(1517, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 01:14:50'),
(1518, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 01:19:50'),
(1519, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 01:24:50'),
(1520, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 01:29:50'),
(1521, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 01:34:50'),
(1522, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 01:39:50'),
(1523, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 01:44:50'),
(1524, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 01:49:50'),
(1525, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 01:54:50'),
(1526, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 01:59:50'),
(1527, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 02:04:50'),
(1528, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 02:09:50'),
(1529, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 02:14:50'),
(1530, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 02:19:50'),
(1531, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 02:24:49'),
(1532, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 02:29:50'),
(1533, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 02:34:49'),
(1534, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 02:39:49'),
(1535, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 02:44:50'),
(1536, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 02:49:49'),
(1537, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 02:54:49'),
(1538, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 02:59:49'),
(1539, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 03:04:49'),
(1540, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 03:09:49'),
(1541, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 03:14:49'),
(1542, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 03:19:49'),
(1543, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 03:24:49'),
(1544, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 03:29:49'),
(1545, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 03:34:49'),
(1546, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 03:39:49'),
(1547, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 03:44:49'),
(1548, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 03:49:49'),
(1549, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 03:54:49'),
(1550, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 03:59:49'),
(1551, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 04:04:49'),
(1552, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 04:09:49'),
(1553, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 04:14:49'),
(1554, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 04:19:49'),
(1555, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 04:24:49'),
(1556, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 04:29:49'),
(1557, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 04:34:49'),
(1558, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 04:39:49'),
(1559, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 04:44:49'),
(1560, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 04:49:49'),
(1561, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 04:54:49'),
(1562, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 04:59:49'),
(1563, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 05:04:49'),
(1564, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 05:09:49'),
(1565, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 05:14:49'),
(1566, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 05:19:49'),
(1567, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 05:24:49'),
(1568, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 05:29:49'),
(1569, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 05:34:49'),
(1570, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 05:39:49'),
(1571, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 05:44:49'),
(1572, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 05:49:49'),
(1573, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 05:54:49'),
(1574, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 05:59:49'),
(1575, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 06:04:49'),
(1576, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 06:09:49'),
(1577, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 06:14:49'),
(1578, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 06:19:49'),
(1579, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 06:24:49'),
(1580, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 06:29:49'),
(1581, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 06:34:49'),
(1582, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 06:39:49'),
(1583, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 06:44:49'),
(1584, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 06:49:49'),
(1585, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 06:54:49'),
(1586, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 06:59:49'),
(1587, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 07:04:49'),
(1588, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 07:09:49'),
(1589, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 07:14:49'),
(1590, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 07:19:49'),
(1591, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 07:24:49'),
(1592, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 07:29:49'),
(1593, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 07:34:49'),
(1594, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 07:39:49'),
(1595, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 07:44:49'),
(1596, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 07:49:49'),
(1597, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 07:54:49'),
(1598, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 07:59:49'),
(1599, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 08:04:49'),
(1600, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 08:09:49'),
(1601, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 08:14:49'),
(1602, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 08:19:49'),
(1603, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 08:24:49'),
(1604, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 08:29:49'),
(1605, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 08:34:49'),
(1606, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 08:39:49'),
(1607, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 08:44:49'),
(1608, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 08:49:49'),
(1609, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 08:54:49'),
(1610, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 08:59:49'),
(1611, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 09:04:49'),
(1612, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 09:09:49'),
(1613, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 09:14:49'),
(1614, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 09:19:49'),
(1615, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 09:24:49'),
(1616, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 09:29:49'),
(1617, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 09:34:49'),
(1618, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 09:39:49'),
(1619, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 09:44:48'),
(1620, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 09:49:49'),
(1621, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 09:54:48'),
(1622, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 09:59:48'),
(1623, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 10:04:48'),
(1624, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 10:09:48'),
(1625, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 10:14:48'),
(1626, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 10:19:48'),
(1627, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 10:24:48'),
(1628, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 10:29:48'),
(1629, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 10:34:48'),
(1630, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 10:39:48'),
(1631, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 10:44:48'),
(1632, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 10:49:48'),
(1633, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 10:54:48'),
(1634, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 10:59:48'),
(1635, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 11:04:48'),
(1636, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 11:09:48'),
(1637, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 11:14:48'),
(1638, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 11:19:48'),
(1639, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 11:24:48'),
(1640, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 11:29:48'),
(1641, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 11:34:48'),
(1642, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 11:39:48'),
(1643, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 11:44:48'),
(1644, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 11:49:48'),
(1645, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 11:54:48'),
(1646, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 11:59:48'),
(1647, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 12:04:48'),
(1648, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 12:09:48'),
(1649, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 12:14:48'),
(1650, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 12:19:48'),
(1651, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 12:24:48'),
(1652, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 12:29:48'),
(1653, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 12:34:48'),
(1654, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 12:39:48'),
(1655, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 12:44:48'),
(1656, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 12:49:48'),
(1657, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 12:54:48'),
(1658, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 12:59:48'),
(1659, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 13:04:48'),
(1660, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 13:09:48'),
(1661, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 13:14:48'),
(1662, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 13:19:48'),
(1663, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 13:24:48'),
(1664, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 13:29:48'),
(1665, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 13:34:48'),
(1666, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 13:39:48'),
(1667, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 13:44:48'),
(1668, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 13:49:48'),
(1669, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 13:54:48'),
(1670, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 13:59:48'),
(1671, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 14:04:48'),
(1672, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 14:09:48'),
(1673, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 14:14:48'),
(1674, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 14:19:48'),
(1675, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 14:24:48'),
(1676, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 14:29:48'),
(1677, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 14:34:48'),
(1678, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 14:39:48'),
(1679, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 14:44:48'),
(1680, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 14:49:48'),
(1681, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 14:54:48'),
(1682, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 14:59:48'),
(1683, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 15:04:48'),
(1684, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 15:09:48'),
(1685, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 15:14:48'),
(1686, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 15:19:48'),
(1687, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 15:24:48'),
(1688, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 15:29:48'),
(1689, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 15:32:48'),
(1690, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 15:37:48'),
(1691, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 15:42:48'),
(1692, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 15:47:48'),
(1693, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 15:52:48'),
(1694, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 15:57:48'),
(1695, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 16:02:48'),
(1696, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 16:07:48'),
(1697, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 16:12:48'),
(1698, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 16:17:48'),
(1699, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 16:22:48'),
(1700, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 16:27:48'),
(1701, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 16:32:48'),
(1702, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 16:37:48'),
(1703, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 16:42:48'),
(1704, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 16:47:48'),
(1705, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 16:52:48'),
(1706, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 16:57:48'),
(1707, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 17:02:48'),
(1708, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 17:07:48'),
(1709, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 17:12:48'),
(1710, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 17:17:48'),
(1711, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 17:22:48'),
(1712, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 17:27:48'),
(1713, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 17:33:14'),
(1714, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 17:38:15'),
(1715, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 17:43:15'),
(1716, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 17:50:09'),
(1717, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 17:55:09'),
(1718, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 18:00:09'),
(1719, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 18:05:09'),
(1720, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 18:10:09'),
(1721, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 18:15:09'),
(1722, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 18:20:09'),
(1723, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 18:25:09'),
(1724, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 18:30:09'),
(1725, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 18:35:09'),
(1726, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 18:40:09'),
(1727, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 18:45:09'),
(1728, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 18:50:09'),
(1729, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 18:55:09'),
(1730, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 19:00:09'),
(1731, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 19:05:09'),
(1732, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 19:10:09'),
(1733, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 19:15:09'),
(1734, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 19:20:09'),
(1735, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 19:25:09'),
(1736, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 19:30:09'),
(1737, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 19:35:09'),
(1738, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 19:40:09'),
(1739, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 19:45:09'),
(1740, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 19:50:09'),
(1741, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 19:55:09'),
(1742, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 20:00:09'),
(1743, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 20:05:09');
INSERT INTO `env_readings` (`id`, `device_id`, `barn_id`, `cycle_id`, `day_age`, `temperature`, `humidity`, `heat_index`, `nh3_ppm`, `co2_ppm`, `wind_speed_ms`, `fan_rpm`, `light_lux`, `outdoor_temp`, `outdoor_humidity`, `is_raining`, `rain_mm`, `recorded_at`) VALUES
(1744, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 20:10:09'),
(1745, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 20:15:09'),
(1746, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 20:20:09'),
(1747, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 20:25:09'),
(1748, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 20:30:09'),
(1749, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 20:35:09'),
(1750, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 20:40:09'),
(1751, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 20:45:09'),
(1752, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 20:50:09'),
(1753, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 20:55:09'),
(1754, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 21:00:09'),
(1755, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 21:05:09'),
(1756, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 21:10:09'),
(1757, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 21:15:09'),
(1758, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 21:20:09'),
(1759, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 21:25:09'),
(1760, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 21:30:09'),
(1761, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 21:35:09'),
(1762, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 21:40:09'),
(1763, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 21:45:08'),
(1764, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 21:50:08'),
(1765, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 21:55:08'),
(1766, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 22:00:09'),
(1767, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 22:05:08'),
(1768, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 22:10:08'),
(1769, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 22:15:08'),
(1770, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 22:20:08'),
(1771, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 22:25:08'),
(1772, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 22:30:08'),
(1773, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 22:35:08'),
(1774, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 22:40:08'),
(1775, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 22:45:08'),
(1776, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 22:50:08'),
(1777, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 22:55:08'),
(1778, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 23:00:08'),
(1779, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 23:05:08'),
(1780, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 23:10:08'),
(1781, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 23:15:08'),
(1782, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 23:20:08'),
(1783, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 23:25:08'),
(1784, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 23:30:08'),
(1785, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 23:35:08'),
(1786, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 23:40:08'),
(1787, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 23:45:08'),
(1788, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 23:50:08'),
(1789, 47, 6, 3, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-26 23:55:08'),
(1790, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 00:00:08'),
(1791, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 00:05:08'),
(1792, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 00:10:08'),
(1793, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 00:15:08'),
(1794, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 00:20:08'),
(1795, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 00:25:08'),
(1796, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 00:30:08'),
(1797, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 00:35:08'),
(1798, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 00:40:08'),
(1799, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 00:45:08'),
(1800, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 00:50:08'),
(1801, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 00:55:08'),
(1802, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 01:00:08'),
(1803, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 01:05:08'),
(1804, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 01:10:08'),
(1805, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 01:15:08'),
(1806, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 01:20:08'),
(1807, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 01:25:08'),
(1808, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 01:30:08'),
(1809, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 01:35:08'),
(1810, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 01:40:08'),
(1811, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 01:45:08'),
(1812, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 01:50:08'),
(1813, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 01:55:08'),
(1814, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 02:00:08'),
(1815, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 02:05:08'),
(1816, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 02:10:08'),
(1817, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 02:15:08'),
(1818, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 02:20:08'),
(1819, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 02:25:08'),
(1820, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 02:30:08'),
(1821, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 02:35:08'),
(1822, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 02:40:08'),
(1823, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 02:45:08'),
(1824, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 02:50:08'),
(1825, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 02:55:08'),
(1826, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 03:00:08'),
(1827, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 03:05:08'),
(1828, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 03:10:08'),
(1829, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 03:15:08'),
(1830, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 03:20:08'),
(1831, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 03:25:08'),
(1832, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 03:30:08'),
(1833, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 03:35:08'),
(1834, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 03:40:08'),
(1835, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 03:45:08'),
(1836, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 03:50:08'),
(1837, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 03:55:08'),
(1838, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 04:00:08'),
(1839, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 04:05:08'),
(1840, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 04:10:08'),
(1841, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 04:15:08'),
(1842, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 04:20:08'),
(1843, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 04:25:08'),
(1844, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 04:30:08'),
(1845, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 04:35:08'),
(1846, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 04:40:08'),
(1847, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 04:45:08'),
(1848, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 04:50:08'),
(1849, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 04:55:07'),
(1850, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 05:00:08'),
(1851, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 05:05:08'),
(1852, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 05:10:07'),
(1853, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 05:15:07'),
(1854, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 05:20:07'),
(1855, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 05:25:07'),
(1856, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 05:30:07'),
(1857, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 05:35:07'),
(1858, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 05:40:07'),
(1859, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 05:45:07'),
(1860, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 05:50:07'),
(1861, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 05:55:07'),
(1862, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 06:00:07'),
(1863, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 06:05:07'),
(1864, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 06:10:07'),
(1865, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 06:15:07'),
(1866, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 06:20:07'),
(1867, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 06:25:07'),
(1868, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 06:30:07'),
(1869, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 06:35:07'),
(1870, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 06:40:07'),
(1871, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 06:45:07'),
(1872, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 06:50:07'),
(1873, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 06:55:07'),
(1874, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 07:00:07'),
(1875, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 07:05:07'),
(1876, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 07:10:07'),
(1877, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 07:15:07'),
(1878, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 07:20:07'),
(1879, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 07:25:07'),
(1880, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 07:30:07'),
(1881, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 07:35:07'),
(1882, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 07:40:07'),
(1883, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 07:45:07'),
(1884, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 07:50:07'),
(1885, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 07:55:07'),
(1886, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 08:00:07'),
(1887, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 08:05:07'),
(1888, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 08:10:07'),
(1889, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 08:15:07'),
(1890, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 08:20:07'),
(1891, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 08:25:07'),
(1892, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 08:30:07'),
(1893, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 08:35:07'),
(1894, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 08:40:07'),
(1895, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 08:45:07'),
(1896, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 08:50:07'),
(1897, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 08:55:07'),
(1898, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 09:00:07'),
(1899, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 09:05:07'),
(1900, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 09:10:07'),
(1901, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 09:17:19'),
(1902, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 09:22:19'),
(1903, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 09:27:19'),
(1904, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 09:32:19'),
(1905, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 09:37:19'),
(1906, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 09:42:19'),
(1907, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 09:47:19'),
(1908, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 09:52:19'),
(1909, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 09:57:19'),
(1910, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 10:02:19'),
(1911, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 10:07:19'),
(1912, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 10:12:19'),
(1913, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 10:17:19'),
(1914, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 10:22:19'),
(1915, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 10:27:19'),
(1916, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 10:32:19'),
(1917, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 10:37:19'),
(1918, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 10:42:19'),
(1919, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 10:47:19'),
(1920, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 10:52:19'),
(1921, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 10:57:19'),
(1922, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 11:02:19'),
(1923, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 11:07:19'),
(1924, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 11:12:19'),
(1925, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 11:17:19'),
(1926, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 11:22:19'),
(1927, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 11:27:19'),
(1928, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 11:32:19'),
(1929, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 11:37:19'),
(1930, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 11:42:19'),
(1931, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 11:47:19'),
(1932, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 11:52:19'),
(1933, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 11:57:19'),
(1934, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 12:02:19'),
(1935, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 12:07:19'),
(1936, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 12:12:19'),
(1937, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 12:17:19'),
(1938, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 12:22:19'),
(1939, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 12:27:19'),
(1940, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 12:32:19'),
(1941, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 12:37:19'),
(1942, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 12:42:19'),
(1943, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 12:47:19'),
(1944, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 12:52:19'),
(1945, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 12:57:19'),
(1946, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 13:02:19'),
(1947, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 13:07:19'),
(1948, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 13:12:19'),
(1949, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 13:17:19'),
(1950, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 13:22:19'),
(1951, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 13:27:19'),
(1952, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 13:32:19'),
(1953, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 13:37:19'),
(1954, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 13:42:19'),
(1955, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 13:47:19'),
(1956, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 13:52:19'),
(1957, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 13:57:19'),
(1958, 47, 6, 3, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-03-27 14:02:19');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `env_weather`
--

CREATE TABLE `env_weather` (
  `id` bigint NOT NULL,
  `device_id` int NOT NULL COMMENT 'Thiet bi thoi tiet',
  `barn_id` bigint UNSIGNED DEFAULT NULL COMMENT 'Khu vuc / chuong gan nhat',
  `cycle_id` bigint UNSIGNED DEFAULT NULL COMMENT 'Chu ky nuoi (neu co)',
  `day_age` smallint DEFAULT NULL COMMENT 'Ngay tuoi ga',
  `wind_speed_ms` decimal(5,2) DEFAULT NULL COMMENT 'Toc do gio (m/s)',
  `wind_direction_deg` smallint DEFAULT NULL COMMENT 'Huong gio (0-360 do)',
  `is_raining` tinyint(1) DEFAULT NULL COMMENT 'Dang mua (0/1)',
  `rainfall_mm` decimal(6,2) DEFAULT NULL COMMENT 'Luong mua tich luy (mm)',
  `outdoor_temp` decimal(5,2) DEFAULT NULL COMMENT 'Nhiet do ngoai troi (Â°C)',
  `outdoor_humidity` decimal(5,2) DEFAULT NULL COMMENT 'Do am ngoai troi (%)',
  `recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thoi diem ghi nhan'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Du lieu thoi tiet ngoai troi (tram thoi tiet rieng)';

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `feed_brands`
--

CREATE TABLE `feed_brands` (
  `id` bigint UNSIGNED NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'TÃªn hÃ£ng: C-P, Dabaco, Greenfeed...',
  `kg_per_bag` decimal(6,2) NOT NULL COMMENT 'Trá»ng lÆ°á»£ng má»—i bao (kg)',
  `note` text COLLATE utf8mb4_unicode_ci,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `feed_brands`
--

INSERT INTO `feed_brands` (`id`, `name`, `kg_per_bag`, `note`, `status`, `created_at`) VALUES
(1, 'Tongwei', '25.00', NULL, 'active', '2026-03-01 12:54:12');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `feed_trough_checks`
--

CREATE TABLE `feed_trough_checks` (
  `id` bigint UNSIGNED NOT NULL,
  `cycle_id` bigint UNSIGNED NOT NULL,
  `ref_feed_id` bigint UNSIGNED NOT NULL,
  `remaining_pct` tinyint UNSIGNED NOT NULL,
  `checked_at` datetime NOT NULL,
  `note` text,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `feed_types`
--

CREATE TABLE `feed_types` (
  `id` bigint UNSIGNED NOT NULL,
  `feed_brand_id` bigint UNSIGNED NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'MÃ£ cÃ¡m: 311H, 312, 550S...',
  `price_per_bag` decimal(12,0) UNSIGNED DEFAULT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'TÃªn Ä‘áº§y Ä‘á»§ náº¿u cÃ³',
  `suggested_stage` enum('chick','grower','adult','all') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all',
  `note` text COLLATE utf8mb4_unicode_ci,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `feed_types`
--

INSERT INTO `feed_types` (`id`, `feed_brand_id`, `code`, `price_per_bag`, `name`, `suggested_stage`, `note`, `status`, `created_at`) VALUES
(1, 1, '311H', NULL, 'Cám sữa', 'chick', NULL, 'active', '2026-03-01 12:54:28'),
(2, 1, '311', '305000', 'Cám gà con', 'chick', NULL, 'active', '2026-03-01 12:54:40'),
(3, 1, '312', NULL, 'Cám gà lẩu', 'grower', NULL, 'active', '2026-03-01 12:54:56'),
(7, 1, '313', NULL, 'Cám gà to', 'adult', NULL, 'active', '2026-03-14 08:24:38');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `health_notes`
--

CREATE TABLE `health_notes` (
  `id` bigint UNSIGNED NOT NULL,
  `cycle_id` bigint UNSIGNED NOT NULL,
  `recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `day_age` smallint UNSIGNED NOT NULL,
  `severity` enum('mild','moderate','severe') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mild',
  `symptoms` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `resolved` tinyint(1) NOT NULL DEFAULT '0',
  `resolved_at` datetime DEFAULT NULL,
  `image_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `inventory_consumable_assets`
--

CREATE TABLE `inventory_consumable_assets` (
  `id` bigint UNSIGNED NOT NULL,
  `item_id` bigint UNSIGNED NOT NULL,
  `serial_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('stock','installed','broken','disposed') COLLATE utf8mb4_unicode_ci DEFAULT 'stock',
  `barn_id` bigint UNSIGNED DEFAULT NULL,
  `install_location` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ref_device_id` int DEFAULT NULL,
  `installed_at` date DEFAULT NULL,
  `warranty_until` date DEFAULT NULL,
  `purchase_id` bigint UNSIGNED DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `inventory_items`
--

CREATE TABLE `inventory_items` (
  `id` bigint UNSIGNED NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` enum('production','consumable') COLLATE utf8mb4_unicode_ci NOT NULL,
  `sub_category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ref_medication_id` bigint UNSIGNED DEFAULT NULL,
  `ref_feed_brand_id` bigint UNSIGNED DEFAULT NULL,
  `ref_feed_type_id` int DEFAULT NULL,
  `min_stock_alert` decimal(10,2) DEFAULT '0.00',
  `supplier_id` bigint UNSIGNED DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `inventory_items`
--

INSERT INTO `inventory_items` (`id`, `name`, `category`, `sub_category`, `unit`, `ref_medication_id`, `ref_feed_brand_id`, `ref_feed_type_id`, `min_stock_alert`, `supplier_id`, `note`, `status`, `created_at`) VALUES
(1, 'Trấu', 'production', 'litter', 'kg', NULL, NULL, NULL, '30.00', NULL, '', 'inactive', '2026-03-12 03:44:39'),
(2, 'Trấu', 'production', 'litter', 'KG', NULL, NULL, NULL, '0.00', NULL, NULL, 'active', '2026-03-13 07:11:10'),
(24, '311H - Tongwei - Cám sữa', 'production', 'feed', 'bao', NULL, 1, 1, '0.00', NULL, NULL, 'active', '2026-03-14 11:20:02'),
(25, '311 - Tongwei - Cám gà con', 'production', 'feed', 'bao', NULL, 1, 2, '0.00', NULL, '', 'active', '2026-03-14 11:20:02'),
(26, '312 - Tongwei - Cám gà lẩu', 'production', 'feed', 'bao', NULL, 1, 3, '0.00', NULL, NULL, 'active', '2026-03-14 11:20:02'),
(27, '313 - Tongwei - Cám gà to', 'production', 'feed', 'bao', NULL, 1, 7, '0.00', NULL, NULL, 'active', '2026-03-14 11:20:02'),
(31, 'ESP32', 'consumable', 'iot_device', 'cái', NULL, NULL, NULL, '0.00', NULL, NULL, 'active', '2026-03-14 12:50:11');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `inventory_purchases`
--

CREATE TABLE `inventory_purchases` (
  `id` bigint UNSIGNED NOT NULL,
  `item_id` bigint UNSIGNED NOT NULL,
  `supplier_id` bigint UNSIGNED DEFAULT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `unit_price` decimal(15,0) UNSIGNED NOT NULL,
  `total_price` decimal(15,0) UNSIGNED NOT NULL,
  `purchased_at` date NOT NULL,
  `expiry_date` date DEFAULT NULL,
  `batch_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `storage_location` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `inventory_purchases`
--

INSERT INTO `inventory_purchases` (`id`, `item_id`, `supplier_id`, `quantity`, `unit_price`, `total_price`, `purchased_at`, `expiry_date`, `batch_no`, `storage_location`, `note`, `created_at`) VALUES
(5, 25, NULL, '1.00', '305000', '305000', '2026-03-15', NULL, NULL, NULL, NULL, '2026-03-15 12:02:57'),
(6, 25, NULL, '1.00', '305000', '305000', '2026-03-15', NULL, NULL, NULL, NULL, '2026-03-15 12:17:56');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `inventory_sales`
--

CREATE TABLE `inventory_sales` (
  `id` bigint UNSIGNED NOT NULL,
  `item_id` bigint UNSIGNED NOT NULL,
  `buyer_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `buyer_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `unit_price` decimal(15,0) UNSIGNED NOT NULL,
  `total_price` decimal(15,0) UNSIGNED NOT NULL,
  `sold_at` date NOT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `inventory_stock`
--

CREATE TABLE `inventory_stock` (
  `id` bigint UNSIGNED NOT NULL,
  `item_id` bigint UNSIGNED NOT NULL,
  `barn_id` bigint UNSIGNED DEFAULT NULL,
  `quantity` decimal(10,2) NOT NULL DEFAULT '0.00',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `inventory_stock`
--

INSERT INTO `inventory_stock` (`id`, `item_id`, `barn_id`, `quantity`, `updated_at`) VALUES
(1, 25, 6, '1.00', '2026-03-15 12:18:21');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `inventory_transactions`
--

CREATE TABLE `inventory_transactions` (
  `id` bigint UNSIGNED NOT NULL,
  `item_id` bigint UNSIGNED NOT NULL,
  `txn_type` enum('purchase','transfer_out','transfer_in','use_feed','use_medicine','use_litter','use_consumable','sell','adjust','dispose') COLLATE utf8mb4_unicode_ci NOT NULL,
  `from_barn_id` bigint UNSIGNED DEFAULT NULL,
  `to_barn_id` bigint UNSIGNED DEFAULT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `unit_price` decimal(15,0) DEFAULT NULL,
  `ref_purchase_id` bigint UNSIGNED DEFAULT NULL,
  `ref_care_feed_id` bigint UNSIGNED DEFAULT NULL,
  `ref_care_medication_id` bigint UNSIGNED DEFAULT NULL,
  `cycle_id` bigint UNSIGNED DEFAULT NULL,
  `install_location` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `recorded_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `inventory_transactions`
--

INSERT INTO `inventory_transactions` (`id`, `item_id`, `txn_type`, `from_barn_id`, `to_barn_id`, `quantity`, `unit_price`, `ref_purchase_id`, `ref_care_feed_id`, `ref_care_medication_id`, `cycle_id`, `install_location`, `note`, `recorded_at`, `created_at`) VALUES
(1, 25, 'purchase', NULL, 6, '1.00', '305000', 5, NULL, NULL, NULL, NULL, NULL, '2026-03-15 00:00:00', '2026-03-15 12:02:57'),
(2, 25, 'use_feed', 6, NULL, '1.00', NULL, NULL, 11, NULL, 3, NULL, 'Tự động từ care_feeds #11', '2026-03-15 19:03:14', '2026-03-15 12:03:14'),
(3, 25, 'purchase', NULL, 6, '1.00', '305000', 6, NULL, NULL, NULL, NULL, NULL, '2026-03-15 00:00:00', '2026-03-15 12:17:56'),
(4, 25, 'use_feed', 6, NULL, '1.00', NULL, NULL, 12, NULL, 3, NULL, 'Tự động từ care_feeds #12', '2026-03-15 19:18:06', '2026-03-15 12:18:06');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `medications`
--

CREATE TABLE `medications` (
  `id` bigint UNSIGNED NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'TÃªn thuá»‘c',
  `unit` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ÄÆ¡n vá»‹: ml, g, viÃªn, gÃ³i...',
  `category` enum('vaccine','antibiotic','vitamin','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `manufacturer` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `price_per_unit` decimal(12,0) UNSIGNED DEFAULT NULL,
  `recommended_dose` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `medications`
--

INSERT INTO `medications` (`id`, `name`, `unit`, `category`, `manufacturer`, `price_per_unit`, `recommended_dose`, `note`, `status`, `created_at`) VALUES
(2, 'Sunpha Tiger', 'g', 'antibiotic', NULL, '15000', NULL, 'trisunpha của TigerVet', 'active', '2026-03-01 14:10:32');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `notification_settings`
--

CREATE TABLE `notification_settings` (
  `id` bigint UNSIGNED NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `level` enum('red','orange','blue') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'blue',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `interval_min` int UNSIGNED NOT NULL DEFAULT '1440' COMMENT 'Sá»‘ phÃºt giá»¯a 2 láº§n gá»­i',
  `send_at_hour` tinyint DEFAULT NULL COMMENT 'Giá» gá»­i cá»‘ Ä‘á»‹nh (null = gá»­i theo interval)',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `notification_settings`
--

INSERT INTO `notification_settings` (`id`, `code`, `label`, `level`, `enabled`, `interval_min`, `send_at_hour`, `updated_at`) VALUES
(1, 'MISSING_FEED', 'Bỏ bữa cho ăn', 'orange', 1, 360, NULL, '2026-03-07 02:56:57'),
(2, 'FEED_DROP', 'Lượng cám giảm đột ngột', 'blue', 1, 1440, 7, '2026-03-06 06:00:35'),
(3, 'DEATH_SPIKE', 'Hao hụt tăng đột biến', 'blue', 1, 1440, 7, '2026-03-06 06:00:35'),
(4, 'HIGH_DEATH_RATE', 'Tỷ lệ hao hụt vượt ngưỡng', 'blue', 1, 1440, 7, '2026-03-06 06:00:35'),
(5, 'NO_WEIGH', 'Chưa cân gà định kỳ', 'blue', 1, 1440, 7, '2026-03-06 06:00:35'),
(6, 'REMIND_WEIGH', 'Nhắc cân gà', 'blue', 1, 1440, 8, '2026-03-06 06:00:35'),
(7, 'DAILY_REPORT', 'Báo cáo cuối ngày', 'blue', 1, 1440, 20, '2026-03-06 06:00:35'),
(8, 'VACCINE_REMIND', 'Nhắc lịch tiêm vaccine', 'red', 1, 1440, 7, '2026-03-06 14:25:50');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `push_notifications_log`
--

CREATE TABLE `push_notifications_log` (
  `id` bigint UNSIGNED NOT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `cycle_id` bigint UNSIGNED DEFAULT NULL,
  `sent_count` int DEFAULT '0',
  `failed_count` int DEFAULT '0',
  `acknowledged_at` datetime DEFAULT NULL COMMENT 'Thá»i Ä‘iá»ƒm user xÃ¡c nháº­n Ä‘Ã£ biáº¿t',
  `sent_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Lá»‹ch sá»­ push notification Ä‘Ã£ gá»­i';

--
-- Đang đổ dữ liệu cho bảng `push_notifications_log`
--

INSERT INTO `push_notifications_log` (`id`, `type`, `title`, `body`, `cycle_id`, `sent_count`, `failed_count`, `acknowledged_at`, `sent_at`) VALUES
(1, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 11:47 mà chưa có bản ghi cho ăn nào', 1, 1, 0, NULL, '2026-03-06 04:47:07'),
(2, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 11:47 mà chưa có bản ghi cho ăn nào', 2, 1, 0, NULL, '2026-03-06 04:47:08'),
(3, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 11:49 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-06 04:49:09'),
(4, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 11:49 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-06 04:49:10'),
(5, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 18:00 mà chưa có bản ghi cho ăn nào', 1, 2, 1, NULL, '2026-03-06 11:00:02'),
(6, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 18:00 mà chưa có bản ghi cho ăn nào', 2, 2, 0, NULL, '2026-03-06 11:00:02'),
(7, 'DAILY_REPORT', '📊 Báo cáo 06/03', 'Barn Test 1: 3,000 con | Barn Test 2: 4,000 con', NULL, 2, 0, NULL, '2026-03-06 13:00:01'),
(8, 'TEST', '✅ CFarm Test', 'Thông báo hoạt động bình thường! 09:57 07/03/2026', NULL, 4, 0, NULL, '2026-03-07 02:57:24'),
(9, 'TEST', '✅ CFarm Test', 'Thông báo hoạt động bình thường! 09:57 07/03/2026', NULL, 3, 1, NULL, '2026-03-07 02:57:33'),
(10, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-07 03:00:01'),
(11, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-07 03:00:02'),
(12, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 16:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-07 09:00:02'),
(13, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 16:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-07 09:00:03'),
(14, 'DAILY_REPORT', '📊 Báo cáo 07/03', 'Barn Test 1: 2,998 con, FCR 48.312 | Barn Test 2: 4,000 con', NULL, 3, 0, NULL, '2026-03-07 13:00:02'),
(15, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 23:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-07 16:00:02'),
(16, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 23:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-07 16:00:03'),
(17, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Barn Test 2', 'Chưa cân 8 ngày. Hãy cân mẫu hôm nay!', 2, 3, 0, NULL, '2026-03-08 01:00:02'),
(18, 'TEST', '✅ CFarm Test', 'Thông báo hoạt động bình thường! 08:02 08/03/2026', NULL, 3, 0, NULL, '2026-03-08 01:02:08'),
(19, 'TEST', '✅ CFarm Test', 'Thông báo hoạt động bình thường! 08:02 08/03/2026', NULL, 3, 0, NULL, '2026-03-08 01:02:12'),
(20, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-08 03:00:02'),
(21, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-08 03:00:03'),
(22, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-08 10:00:02'),
(23, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-08 10:00:02'),
(24, 'DAILY_REPORT', '📊 Báo cáo 08/03', 'Barn Test 1: 2,998 con, FCR 48.312 | Barn Test 2: 4,000 con', NULL, 3, 0, NULL, '2026-03-08 13:00:02'),
(25, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Barn Test 2', 'Chưa cân 9 ngày. Hãy cân mẫu hôm nay!', 2, 3, 0, NULL, '2026-03-09 01:00:01'),
(26, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-09 03:00:02'),
(27, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-09 03:00:02'),
(28, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 11:34 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-09 04:34:03'),
(29, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 11:34 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-09 04:34:03'),
(30, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 14:47 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-09 07:47:12'),
(31, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 14:47 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-09 07:47:13'),
(32, 'device_offline', '⚠️ Thiết bị mất kết nối', 'esp32-barn2 (Barn Test 2) không phản hồi 10 phút', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-09 07:51:08'),
(33, 'device_offline', '⚠️ Thiết bị mất kết nối', 'esp32-barn2 (Barn Test 2) không phản hồi 40 phút', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-09 08:21:36'),
(34, 'DAILY_REPORT', '📊 Báo cáo 09/03', 'Barn Test 1: 2,998 con, FCR 48.312 | Barn Test 2: 4,000 con', NULL, 3, 0, NULL, '2026-03-09 13:00:02'),
(35, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 21:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-09 14:00:01'),
(36, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 21:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-09 14:00:02'),
(37, 'VACCINE_REMIND', '🚨 Barn Test 2 · b2-20260301', 'Lịch tiêm: Vaccine cầu trùng — Hôm nay · 10/03/2026', 2, 3, 0, NULL, '2026-03-09 17:00:02'),
(38, 'VACCINE_REMIND', '🚨 Barn Test 2 · b2-20260301', 'Lịch tiêm: Vaccine cầu trùng — Hôm nay · 10/03/2026', 2, 3, 0, NULL, '2026-03-10 00:00:02'),
(39, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Barn Test 2', 'Chưa cân 10 ngày. Hãy cân mẫu hôm nay!', 2, 3, 0, NULL, '2026-03-10 01:00:02'),
(40, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-10 03:00:02'),
(41, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-10 03:00:03'),
(42, 'VACCINE_REMIND', '🚨 Barn Test 2 · b2-20260301', 'Lịch tiêm: Vaccine cầu trùng — Hôm nay · 10/03/2026', 2, 3, 0, NULL, '2026-03-10 07:00:02'),
(43, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-10 10:00:02'),
(44, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-10 10:00:03'),
(45, 'DAILY_REPORT', '📊 Báo cáo 10/03', 'Barn Test 1: 2,998 con, FCR 48.312 | Barn Test 2: 4,000 con', NULL, 3, 0, NULL, '2026-03-10 13:00:02'),
(46, 'VACCINE_REMIND', '🚨 Barn Test 2 · b2-20260301', 'Lịch tiêm: Vaccine cầu trùng — Hôm nay · 10/03/2026', 2, 3, 0, NULL, '2026-03-10 14:00:02'),
(47, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Barn Test 2', 'Chưa cân 11 ngày. Hãy căn mẫu hôm nay!', 2, 3, 0, NULL, '2026-03-11 01:00:02'),
(48, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-11 03:00:02'),
(49, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-11 03:00:03'),
(50, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-11 10:00:02'),
(51, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-11 10:00:03'),
(52, 'DAILY_REPORT', '📊 Báo cáo 11/03', 'Barn Test 1: 2,998 con, FCR 48.312 | Barn Test 2: 4,000 con', NULL, 3, 0, NULL, '2026-03-11 13:00:02'),
(53, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 21:43 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-11 14:43:48'),
(54, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 21:43 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-11 14:43:48'),
(55, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Barn Test 1', 'Chưa cân 7 ngày. Hãy cân mẫu hôm nay!', 1, 3, 0, NULL, '2026-03-12 01:00:02'),
(56, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Barn Test 2', 'Chưa cân 12 ngày. Hãy cân mẫu hôm nay!', 2, 3, 0, NULL, '2026-03-12 01:00:03'),
(57, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-12 03:00:02'),
(58, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-12 03:00:03'),
(59, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-12 10:00:02'),
(60, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-12 10:00:03'),
(61, 'DAILY_REPORT', '📊 Báo cáo 12/03', 'Barn Test 1: 2,998 con, FCR 48.312 | Barn Test 2: 4,000 con', NULL, 3, 0, NULL, '2026-03-12 13:00:02'),
(62, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Barn Test 1', 'Chưa cân 8 ngày. Hãy cân mẫu hôm nay!', 1, 3, 0, NULL, '2026-03-13 01:00:02'),
(63, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Barn Test 2', 'Chưa cân 13 ngày. Hãy cân mẫu hôm nay!', 2, 3, 0, NULL, '2026-03-13 01:00:03'),
(64, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-13 03:00:02'),
(65, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-13 03:00:02'),
(66, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-13 10:00:02'),
(67, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-13 10:00:03'),
(68, 'DAILY_REPORT', '📊 Báo cáo 13/03', 'Barn Test 1: 2,998 con, FCR 48.312 | Barn Test 2: 4,000 con', NULL, 3, 0, NULL, '2026-03-13 13:00:02'),
(69, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Barn Test 1', 'Chưa cân 9 ngày. Hãy cân mẫu hôm nay!', 1, 3, 0, NULL, '2026-03-14 01:00:02'),
(70, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Barn Test 2', 'Chưa cân 14 ngày. Hãy cân mẫu hôm nay!', 2, 3, 0, NULL, '2026-03-14 01:00:02'),
(71, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-14 03:00:01'),
(72, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-14 03:00:02'),
(73, 'MISSING_FEED', '🚨 Barn Test 1 · b1-20260228', 'Chưa ghi chép cho ăn hôm nay — Đã qua 16:00 mà chưa có bản ghi cho ăn nào', 1, 3, 0, NULL, '2026-03-14 09:00:02'),
(74, 'MISSING_FEED', '🚨 Barn Test 2 · b2-20260301', 'Chưa ghi chép cho ăn hôm nay — Đã qua 16:00 mà chưa có bản ghi cho ăn nào', 2, 3, 0, NULL, '2026-03-14 09:00:03'),
(75, 'DAILY_REPORT', '📊 Báo cáo 14/03', 'Barn Test 1: 2,998 con, FCR 48.312 | Barn Test 2: 4,000 con', NULL, 3, 0, NULL, '2026-03-14 13:00:02'),
(76, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-15 03:00:02'),
(77, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-15 10:00:02'),
(78, 'DAILY_REPORT', '📊 Báo cáo 15/03', 'Chuồng 1: 4,000 con', NULL, 3, 0, NULL, '2026-03-15 13:00:02'),
(79, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-16 03:00:02'),
(80, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-16 10:00:02'),
(81, 'DAILY_REPORT', '📊 Báo cáo 16/03', 'Chuồng 1: 4,000 con', NULL, 3, 0, NULL, '2026-03-16 13:00:01'),
(82, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-17 03:00:02'),
(83, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-17 10:00:02'),
(84, 'DAILY_REPORT', '📊 Báo cáo 17/03', 'Chuồng 1: 4,000 con', NULL, 3, 0, NULL, '2026-03-17 13:00:02'),
(85, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-18 03:00:02'),
(86, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-18 10:00:02'),
(87, 'DAILY_REPORT', '📊 Báo cáo 18/03', 'Chuồng 1: 4,000 con', NULL, 3, 0, NULL, '2026-03-18 13:00:02'),
(88, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-19 03:00:02'),
(89, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 16:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-19 09:00:02'),
(90, 'DAILY_REPORT', '📊 Báo cáo 19/03', 'Chuồng 1: 4,000 con', NULL, 3, 0, NULL, '2026-03-19 13:00:02'),
(91, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 23:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-19 16:00:02'),
(92, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-20 03:00:02'),
(93, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-20 10:00:01'),
(94, 'DAILY_REPORT', '📊 Báo cáo 20/03', 'Chuồng 1: 4,000 con', NULL, 3, 0, NULL, '2026-03-20 13:00:01'),
(95, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Relay Chuồng 1 (esp-chuong1-relay-001) offline 2.4 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:12:22'),
(96, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Mixed Chuồng 1 (esp-chuong1-mixed-002) offline 5.5 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:12:23'),
(97, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Relay Chuồng 1 (esp-chuong1-relay-001) offline 2.5 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:14:02'),
(98, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Mixed Chuồng 1 (esp-chuong1-mixed-002) offline 5.6 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:14:03'),
(99, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Relay Chuồng 1 (esp-chuong1-relay-001) offline 2.5 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:16:01'),
(100, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Mixed Chuồng 1 (esp-chuong1-mixed-002) offline 5.6 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:16:02'),
(101, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Relay Chuồng 1 (esp-chuong1-relay-001) offline 2.5 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:17:02'),
(102, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Mixed Chuồng 1 (esp-chuong1-mixed-002) offline 5.6 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:17:03'),
(103, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Relay Chuồng 1 (esp-chuong1-relay-001) offline 2.5 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:19:02'),
(104, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Mixed Chuồng 1 (esp-chuong1-mixed-002) offline 5.6 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:19:02'),
(105, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Relay Chuồng 1 (esp-chuong1-relay-001) offline 2.6 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:21:02'),
(106, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Mixed Chuồng 1 (esp-chuong1-mixed-002) offline 5.7 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:21:03'),
(107, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Relay Chuồng 1 (esp-chuong1-relay-001) offline 2.6 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:23:02'),
(108, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Mixed Chuồng 1 (esp-chuong1-mixed-002) offline 5.7 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:23:03'),
(109, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Relay Chuồng 1 (esp-chuong1-relay-001) offline 2.6 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:24:01'),
(110, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Mixed Chuồng 1 (esp-chuong1-mixed-002) offline 5.7 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:24:02'),
(111, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Relay Chuồng 1 (esp-chuong1-relay-001) offline 2.6 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:25:02'),
(112, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Mixed Chuồng 1 (esp-chuong1-mixed-002) offline 5.7 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:25:02'),
(113, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Relay Chuồng 1 (esp-chuong1-relay-001) offline 2.7 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:26:02'),
(114, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Mixed Chuồng 1 (esp-chuong1-mixed-002) offline 5.8 giờ', NULL, 3, 0, '2026-03-20 21:26:16', '2026-03-20 14:26:03'),
(115, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 23:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-20 16:00:02'),
(116, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Chuồng 1', 'Chưa cân 8 ngày. Hãy cân mẫu hôm nay!', 3, 3, 0, NULL, '2026-03-21 01:00:02'),
(117, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-21 03:00:02'),
(118, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 16:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-21 09:00:02'),
(119, 'DAILY_REPORT', '📊 Báo cáo 21/03', 'Chuồng 1: 4,000 con', NULL, 3, 0, NULL, '2026-03-21 13:00:01'),
(120, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 23:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-21 16:00:01'),
(121, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Sensor Chuồng 1 (esp-chuong1-sensor-003) offline 1 phút', NULL, 3, 0, NULL, '2026-03-21 18:37:02'),
(122, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Sensor Chuồng 1 (esp-chuong1-sensor-003) offline 2 phút', NULL, 3, 0, NULL, '2026-03-21 18:38:02'),
(123, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Sensor Chuồng 1 (esp-chuong1-sensor-003) offline 3 phút', NULL, 3, 0, NULL, '2026-03-21 18:39:02'),
(124, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Sensor Chuồng 1 (esp-chuong1-sensor-003) offline 1 phút', NULL, 3, 0, NULL, '2026-03-21 19:32:01'),
(125, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Sensor Chuồng 1 (esp-chuong1-sensor-003) offline 2 phút', NULL, 3, 0, NULL, '2026-03-21 19:33:02'),
(126, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Sensor Chuồng 1 (esp-chuong1-sensor-003) offline 3 phút', NULL, 3, 0, NULL, '2026-03-21 19:34:02'),
(127, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Sensor Chuồng 1 (esp-chuong1-sensor-003) offline 4 phút', NULL, 3, 0, NULL, '2026-03-21 19:35:02'),
(128, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Chuồng 1', 'Chưa cân 9 ngày. Hãy cân mẫu hôm nay!', 3, 3, 0, NULL, '2026-03-22 01:00:02'),
(129, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-22 03:00:02'),
(130, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-22 10:00:02'),
(131, 'DAILY_REPORT', '📊 Báo cáo 22/03', 'Chuồng 1: 4,000 con', NULL, 3, 0, NULL, '2026-03-22 13:00:02'),
(132, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Chuồng 1', 'Chưa cân 10 ngày. Hãy cân mẫu hôm nay!', 3, 3, 0, NULL, '2026-03-23 01:00:02'),
(133, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-23 03:00:01'),
(134, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Sensor Chuồng 1 (esp-chuong1-sensor-003) offline 1 phút', NULL, 3, 0, NULL, '2026-03-23 04:15:02'),
(135, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 16:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-23 09:00:02'),
(136, 'DAILY_REPORT', '📊 Báo cáo 23/03', 'Chuồng 1: 4,000 con', NULL, 3, 0, NULL, '2026-03-23 13:00:02'),
(137, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 23:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-23 16:00:02'),
(138, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Chuồng 1', 'Chưa cân 11 ngày. Hãy cân mẫu hôm nay!', 3, 3, 0, NULL, '2026-03-24 01:00:02'),
(139, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-24 03:00:02'),
(140, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 16:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-24 09:00:02'),
(141, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Sensor Chuồng 1 (esp-chuong1-sensor-003) offline 1 phút', NULL, 3, 0, NULL, '2026-03-24 10:19:02'),
(142, 'DAILY_REPORT', '📊 Báo cáo 24/03', 'Chuồng 1: 4,000 con', NULL, 3, 0, NULL, '2026-03-24 13:00:02'),
(143, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 22:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-24 15:00:02'),
(144, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Chuồng 1', 'Chưa cân 12 ngày. Hãy cân mẫu hôm nay!', 3, 3, 0, NULL, '2026-03-25 01:00:02'),
(145, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-25 03:00:02'),
(146, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-25 10:00:02'),
(147, 'DAILY_REPORT', '📊 Báo cáo 25/03', 'Chuồng 1: 4,000 con', NULL, 3, 0, NULL, '2026-03-25 13:00:02'),
(148, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Chuồng 1', 'Chưa cân 13 ngày. Hãy cân mẫu hôm nay!', 3, 3, 0, NULL, '2026-03-26 01:00:01'),
(149, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-26 03:00:02'),
(150, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 17:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-26 10:00:01'),
(151, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Sensor Chuồng 1 (esp-chuong1-sensor-003) offline 2 phút', NULL, 3, 0, NULL, '2026-03-26 10:48:02'),
(152, 'DEVICE_OFFLINE', '⚠️ Thiết bị mất kết nối · Chuồng 1', 'Sensor Chuồng 1 (esp-chuong1-sensor-003) offline 3 phút', NULL, 3, 0, NULL, '2026-03-26 10:49:02'),
(153, 'DAILY_REPORT', '📊 Báo cáo 26/03', 'Chuồng 1: 4,000 con', NULL, 3, 0, NULL, '2026-03-26 13:00:03'),
(154, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 23:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-26 16:00:02'),
(155, 'REMIND_WEIGH', '⚖️ Nhắc cân gà — Chuồng 1', 'Chưa cân 14 ngày. Hãy cân mẫu hôm nay!', 3, 3, 0, NULL, '2026-03-27 01:00:02'),
(156, 'MISSING_FEED', '🚨 Chuồng 1 · b1-20260314', 'Chưa ghi chép cho ăn hôm nay — Đã qua 10:00 mà chưa có bản ghi cho ăn nào', 3, 3, 0, NULL, '2026-03-27 03:00:01');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `push_subscriptions`
--

CREATE TABLE `push_subscriptions` (
  `id` bigint UNSIGNED NOT NULL,
  `endpoint` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `p256dh` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `auth` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'TÃªn thiáº¿t bá»‹/ngÆ°á»i dÃ¹ng',
  `active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `push_subscriptions`
--

INSERT INTO `push_subscriptions` (`id`, `endpoint`, `p256dh`, `auth`, `label`, `active`, `created_at`, `last_used_at`) VALUES
(2, 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABpqltUEtRwy9p6f2LEWQhME_qXqmOEqIrtT9JR6zEZ0oqbwtWC2sKKaL0qAGaWPYuWGpzlp5RfhflNbzdRYDKa8XbYHT8SPCLGwBnnKYzG2iPARyNhW36I-zSiEk6XRBJ-RRez0K9fmrFqQHj3dyVRX1LXVdeQVq8t4oZXQw7ZPL4TjBU', 'BAGa9pBQoobB68FYv9GetdNs6Mk6tx-ma40nM6DMzx6TcbPHMmyGKNH7xqwhu1xsNyD5dpkuyRc7KJsc0rQF4iA', 'fy29-0da_kQEoioLRtYo5g', NULL, 1, '2026-03-06 04:43:00', NULL),
(3, 'https://fcm.googleapis.com/fcm/send/cOJfDQ7AZ3s:APA91bEvgl5Y4zyBNgWg2Glaod21JlTKtkEyxvmqfdO-p87lIEDur062JDa4Imt_1iMBCd7FD_N5QT7UwnJYdZd1tG9dKp9xIjkdtBnzDzYuDKufj4nS-eOAMMqAW9vyul6C2sgD7-t4', 'BJ8hJlkZg3DMTCuJKKmb-qvKAxFykFJFz_7kdoUZJ_4cu6Ped-aFOK8qtOAfQAeqdr_Xd113RZQyi9m-XOv5QlE', 'bH9qwLMtdNw5YGT4bbStdA', NULL, 0, '2026-03-06 04:48:48', NULL),
(4, 'https://fcm.googleapis.com/fcm/send/eVgmg02lGl4:APA91bGb2JIOfWWNkajvqxZmlRNeksZsxyQmMsQSEFpMR-OpuRs0uu__tmcLIcRYrdnxpD0O3lfhuznxsMQ8T1sMYJK8CC5Qntzaeu1TI_6Q3pw-nBtLr6C1ZLJjwTCVj3wCIm3njfTi', 'BOg3tKn2rHq8MMbwaxQGXCm3g0O-657RV6j1fAytDnEnJUKCBCyb4mUSkiNP2zyQmsRN9Qq78Qr_BpdIt8zcMfs', '7Nxj-0mIvUT8YLRvRv3Euw', NULL, 0, '2026-03-06 04:48:49', NULL),
(5, 'https://fcm.googleapis.com/fcm/send/ehltdp9ocnU:APA91bGdJ0hUBeSPyzVfdPN4eKcjBlBzBIaqZKaYaky2aQpnZ-iIG1UZLgpftCPSx6HmUUw9aEVtkTCkW2MT2bOQCOwiczY1GWXhBliVb1DWfs-YXbpcj6Cls7D-M-LJrs4UrY2fWgke', 'BPDgy18vd2qLQBdwo3EuJw8mk8WSIBFBPFZEjuVyVzpnnXev0RbkuoSacqE0ibz0tHsFOhpk5tnTGdfbfWfn3zM', 'z6fyTxi49PR6YmjYNxdwxw', NULL, 0, '2026-03-06 13:30:22', NULL),
(6, 'https://fcm.googleapis.com/fcm/send/djvC7_tuq4Y:APA91bEj1-ynVYy7vHolywbQqhh6xvljHUBxgJ7737xK8eEjeBhdck9qVK30nSIQENqEB3lgndl8I-iydBB-j1in1V_QZnDQECXISDddeoqjwMlYkWwflCNwLOIi_Y-iYIn9rWiHnqwF', 'BMBUkI8oMk7pVsSHu8aDO3EBjeKXlHSsSFK8Ds5i3yEFhPs4-pi81flqM3F2qZUbAh4jPngpKxkLwlkdBdk-OcQ', 'c9NKHGRkA6YOMY_vF4udLQ', NULL, 0, '2026-03-07 02:57:10', NULL),
(7, 'https://fcm.googleapis.com/fcm/send/eSq7y6tq5mc:APA91bH0lQXnMHSn2f7x7AXgfhwEt7zWtWs1UtQJAcTIJcAOtXM18ZrTfUFn9m-LT3o8cbmQi6d_89Nfv3hAHdq3m2rzazF0ZvCdmBntalUQv0z9S_Sopc60iBVEmyWszlFRHhN7EKMd', 'BNvMzBiqdq234E5u5UaSlS7Rz8AHMSj3ymyRImKZIGh8hJdRFyebmJFdk9kHKiVW7GNk8zx0f9M-2fM2OMzUgpE', '424ncDSTao7F7_VlDVC1Ww', NULL, 1, '2026-03-07 02:57:12', NULL),
(8, 'https://fcm.googleapis.com/fcm/send/dqer8EYrlUg:APA91bGnqdRFp_pFjiCZ6qzNgs5LsLze8jz2yncveNvRnjKFvXE3fZVyGYIVNUY1zk1bGryVlWvxXGyAz5Ptdq7mhE4izuvBno-V3W-T327QFjAguFHxTjfJw04MxTH9BB_qvLHvQujB', 'BIPOLxSE8S7fK5yhFz79ukd8-jRM4k2LEHcdiWA0FV6Pe83gdDsqDdKom3lBN8SdlSNCz3dcYd76iSN7zY5_JQI', 'lv4UtUNqujC0soZDMiFYGg', NULL, 1, '2026-03-20 12:18:34', NULL);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `remember_tokens`
--

CREATE TABLE `remember_tokens` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `remember_tokens`
--

INSERT INTO `remember_tokens` (`id`, `user_id`, `token`, `expires_at`, `created_at`) VALUES
(1, 1, 'dd33a6d93bc28aa29978e5e6de116963dc51af2903e2c5ad335173314106537c', '2026-04-22 10:09:42', '2026-03-09 20:16:45'),
(2, 1, '367b350c1500e2a10f743b1467c14a7b576f473d1c4dd8cdab7af8ddcb978665', '2026-04-25 17:49:24', '2026-03-09 20:17:20');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `sensor_readings`
--

CREATE TABLE `sensor_readings` (
  `id` bigint UNSIGNED NOT NULL,
  `device_id` int NOT NULL,
  `temperature` decimal(5,2) DEFAULT NULL,
  `humidity` decimal(5,2) DEFAULT NULL,
  `heat_index` decimal(5,2) DEFAULT NULL,
  `recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Dá»¯ liá»‡u cáº£m biáº¿n nhiá»‡t Ä‘á»™/Ä‘á»™ áº©m theo thá»i gian';

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `suppliers`
--

CREATE TABLE `suppliers` (
  `id` bigint UNSIGNED NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `note` text COLLATE utf8mb4_unicode_ci,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `users`
--

CREATE TABLE `users` (
  `id` int NOT NULL,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `users`
--

INSERT INTO `users` (`id`, `username`, `password_hash`, `created_at`) VALUES
(1, 'admin', '$2y$12$5M.FkCYVVvru8W9tk6XlK.kEHCIM.XsG.loZC9JwO7pHXm0Heev3y', '2026-03-09 20:07:46');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `vaccine_brands`
--

CREATE TABLE `vaccine_brands` (
  `id` bigint UNSIGNED NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `vaccine_brands`
--

INSERT INTO `vaccine_brands` (`id`, `name`, `note`, `created_at`) VALUES
(1, 'DKVET', NULL, '2026-03-06 13:29:56');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `vaccine_programs`
--

CREATE TABLE `vaccine_programs` (
  `id` bigint UNSIGNED NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `vaccine_programs`
--

INSERT INTO `vaccine_programs` (`id`, `name`, `note`, `active`, `created_at`) VALUES
(1, 'Vaccine cho gà chọi', NULL, 1, '2026-03-06 13:29:26');

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `vaccine_program_items`
--

CREATE TABLE `vaccine_program_items` (
  `id` bigint UNSIGNED NOT NULL,
  `program_id` bigint UNSIGNED NOT NULL,
  `vaccine_brand_id` bigint UNSIGNED DEFAULT NULL,
  `vaccine_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `day_age` smallint UNSIGNED NOT NULL COMMENT 'NgÃ y tuá»•i tiÃªm',
  `method` enum('drink','inject','eye_drop','spray') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'drink',
  `remind_days` tinyint UNSIGNED NOT NULL DEFAULT '1',
  `sort_order` smallint UNSIGNED DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `vaccine_program_items`
--

INSERT INTO `vaccine_program_items` (`id`, `program_id`, `vaccine_brand_id`, `vaccine_name`, `day_age`, `method`, `remind_days`, `sort_order`) VALUES
(1, 1, 1, 'Vaccine cầu trùng', 10, 'drink', 1, 1);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `vaccine_schedules`
--

CREATE TABLE `vaccine_schedules` (
  `id` bigint UNSIGNED NOT NULL,
  `cycle_id` bigint UNSIGNED NOT NULL,
  `vaccine_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scheduled_date` date NOT NULL,
  `day_age_target` smallint UNSIGNED DEFAULT NULL COMMENT 'NgÃ y tuá»•i dá»± kiáº¿n tiÃªm',
  `method` enum('drink','inject','eye_drop','spray') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'drink',
  `dosage` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `remind_days` tinyint UNSIGNED NOT NULL DEFAULT '1' COMMENT 'Nháº¯c trÆ°á»›c X ngÃ y',
  `done` tinyint(1) NOT NULL DEFAULT '0',
  `done_at` datetime DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `skipped` tinyint(1) DEFAULT '0',
  `skip_reason` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vaccine_brand_id` bigint UNSIGNED DEFAULT NULL,
  `program_item_id` bigint UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Đang đổ dữ liệu cho bảng `vaccine_schedules`
--

INSERT INTO `vaccine_schedules` (`id`, `cycle_id`, `vaccine_name`, `scheduled_date`, `day_age_target`, `method`, `dosage`, `remind_days`, `done`, `done_at`, `notes`, `created_at`, `skipped`, `skip_reason`, `vaccine_brand_id`, `program_item_id`) VALUES
(2, 2, 'Vaccine cầu trùng', '2026-03-10', 10, 'drink', NULL, 1, 0, NULL, NULL, '2026-03-07 09:51:02', 0, NULL, 1, 1);

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `weight_samples`
--

CREATE TABLE `weight_samples` (
  `id` bigint UNSIGNED NOT NULL,
  `session_id` bigint UNSIGNED NOT NULL,
  `weight_g` decimal(8,1) NOT NULL COMMENT 'Gram',
  `gender` enum('male','female','unknown') NOT NULL DEFAULT 'unknown',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Cấu trúc bảng cho bảng `weight_sessions`
--

CREATE TABLE `weight_sessions` (
  `id` bigint UNSIGNED NOT NULL,
  `cycle_id` bigint UNSIGNED NOT NULL,
  `day_age` smallint UNSIGNED NOT NULL COMMENT 'NgÃ y tuá»•i lÃºc cÃ¢n',
  `sample_count` smallint UNSIGNED NOT NULL DEFAULT '0' COMMENT 'Sá»‘ con Ä‘Ã£ cÃ¢n',
  `avg_weight_g` decimal(8,1) DEFAULT NULL COMMENT 'Trung bÃ¬nh gram/con (tá»± tÃ­nh)',
  `note` text,
  `weighed_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Chỉ mục cho các bảng đã đổ
--

--
-- Chỉ mục cho bảng `barns`
--
ALTER TABLE `barns`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `number` (`number`);

--
-- Chỉ mục cho bảng `care_deaths`
--
ALTER TABLE `care_deaths`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_category` (`cycle_id`,`death_category`);

--
-- Chỉ mục cho bảng `care_expenses`
--
ALTER TABLE `care_expenses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cycle` (`cycle_id`),
  ADD KEY `idx_date` (`recorded_at`);

--
-- Chỉ mục cho bảng `care_feeds`
--
ALTER TABLE `care_feeds`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cycle_id` (`cycle_id`),
  ADD KEY `feed_type_id` (`feed_type_id`);

--
-- Chỉ mục cho bảng `care_litters`
--
ALTER TABLE `care_litters`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cycle_id` (`cycle_id`),
  ADD KEY `item_id` (`item_id`);

--
-- Chỉ mục cho bảng `care_medications`
--
ALTER TABLE `care_medications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cycle_id` (`cycle_id`),
  ADD KEY `medication_id` (`medication_id`);

--
-- Chỉ mục cho bảng `care_sales`
--
ALTER TABLE `care_sales`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cycle_id` (`cycle_id`);

--
-- Chỉ mục cho bảng `curtain_configs`
--
ALTER TABLE `curtain_configs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `barn_id` (`barn_id`),
  ADD KEY `device_id` (`device_id`),
  ADD KEY `up_channel_id` (`up_channel_id`),
  ADD KEY `down_channel_id` (`down_channel_id`);

--
-- Chỉ mục cho bảng `cycles`
--
ALTER TABLE `cycles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`),
  ADD KEY `barn_id` (`barn_id`),
  ADD KEY `parent_cycle_id` (`parent_cycle_id`);

--
-- Chỉ mục cho bảng `cycle_daily_snapshots`
--
ALTER TABLE `cycle_daily_snapshots`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_cycle_day` (`cycle_id`,`day_age`),
  ADD KEY `idx_cycle_date` (`cycle_id`,`snapshot_date`),
  ADD KEY `idx_fcr` (`cycle_id`,`fcr_cumulative`),
  ADD KEY `idx_date_age` (`snapshot_date`,`day_age`);

--
-- Chỉ mục cho bảng `cycle_feed_programs`
--
ALTER TABLE `cycle_feed_programs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cycle_id` (`cycle_id`),
  ADD KEY `feed_brand_id` (`feed_brand_id`);

--
-- Chỉ mục cho bảng `cycle_feed_program_items`
--
ALTER TABLE `cycle_feed_program_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cfpi_program` (`cycle_feed_program_id`),
  ADD KEY `idx_cfpi_stage` (`stage`);

--
-- Chỉ mục cho bảng `cycle_feed_stages`
--
ALTER TABLE `cycle_feed_stages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cycle_id` (`cycle_id`),
  ADD KEY `primary_feed_type_id` (`primary_feed_type_id`),
  ADD KEY `mix_feed_type_id` (`mix_feed_type_id`);

--
-- Chỉ mục cho bảng `cycle_splits`
--
ALTER TABLE `cycle_splits`
  ADD PRIMARY KEY (`id`),
  ADD KEY `from_cycle_id` (`from_cycle_id`),
  ADD KEY `to_cycle_id` (`to_cycle_id`);

--
-- Chỉ mục cho bảng `devices`
--
ALTER TABLE `devices`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `device_code` (`device_code`),
  ADD KEY `device_type_id` (`device_type_id`),
  ADD KEY `idx_barn` (`barn_id`),
  ADD KEY `idx_device_code` (`device_code`),
  ADD KEY `idx_mqtt_topic` (`mqtt_topic`),
  ADD KEY `idx_is_online` (`is_online`),
  ADD KEY `idx_ping_status` (`is_online`,`last_ping_sent_at`);

--
-- Chỉ mục cho bảng `device_channels`
--
ALTER TABLE `device_channels`
  ADD PRIMARY KEY (`id`),
  ADD KEY `device_id` (`device_id`);

--
-- Chỉ mục cho bảng `device_commands`
--
ALTER TABLE `device_commands`
  ADD PRIMARY KEY (`id`),
  ADD KEY `device_id` (`device_id`);

--
-- Chỉ mục cho bảng `device_firmwares`
--
ALTER TABLE `device_firmwares`
  ADD PRIMARY KEY (`id`),
  ADD KEY `device_type_id` (`device_type_id`);

--
-- Chỉ mục cho bảng `device_pings`
--
ALTER TABLE `device_pings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_device_status` (`device_id`,`status`),
  ADD KEY `idx_sent_at` (`ping_sent_at`);

--
-- Chỉ mục cho bảng `device_states`
--
ALTER TABLE `device_states`
  ADD PRIMARY KEY (`id`),
  ADD KEY `device_id` (`device_id`);

--
-- Chỉ mục cho bảng `device_state_log`
--
ALTER TABLE `device_state_log`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `device_types`
--
ALTER TABLE `device_types`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_device_class` (`device_class`);

--
-- Chỉ mục cho bảng `env_readings`
--
ALTER TABLE `env_readings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_device_time` (`device_id`,`DESC`),
  ADD KEY `idx_barn_time` (`barn_id`,`DESC`),
  ADD KEY `idx_recorded` (`DESC`),
  ADD KEY `idx_cycle_time` (`cycle_id`,`DESC`);

--
-- Chỉ mục cho bảng `env_weather`
--
ALTER TABLE `env_weather`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cycle_id` (`cycle_id`),
  ADD KEY `idx_device` (`device_id`),
  ADD KEY `idx_barn` (`barn_id`),
  ADD KEY `idx_recorded` (`recorded_at`),
  ADD KEY `idx_barn_recorded` (`barn_id`,`recorded_at`);

--
-- Chỉ mục cho bảng `feed_brands`
--
ALTER TABLE `feed_brands`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `feed_trough_checks`
--
ALTER TABLE `feed_trough_checks`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ref_feed_id` (`ref_feed_id`),
  ADD KEY `idx_cycle_date` (`cycle_id`,`checked_at`);

--
-- Chỉ mục cho bảng `feed_types`
--
ALTER TABLE `feed_types`
  ADD PRIMARY KEY (`id`),
  ADD KEY `feed_brand_id` (`feed_brand_id`);

--
-- Chỉ mục cho bảng `health_notes`
--
ALTER TABLE `health_notes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cycle` (`cycle_id`),
  ADD KEY `idx_resolved` (`resolved`),
  ADD KEY `idx_severity_resolved` (`cycle_id`,`severity`,`resolved`);

--
-- Chỉ mục cho bảng `inventory_consumable_assets`
--
ALTER TABLE `inventory_consumable_assets`
  ADD PRIMARY KEY (`id`),
  ADD KEY `item_id` (`item_id`),
  ADD KEY `barn_id` (`barn_id`),
  ADD KEY `ref_device_id` (`ref_device_id`),
  ADD KEY `purchase_id` (`purchase_id`);

--
-- Chỉ mục cho bảng `inventory_items`
--
ALTER TABLE `inventory_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ref_medication_id` (`ref_medication_id`),
  ADD KEY `ref_feed_brand_id` (`ref_feed_brand_id`),
  ADD KEY `supplier_id` (`supplier_id`),
  ADD KEY `idx_ref_feed_type_id` (`ref_feed_type_id`);

--
-- Chỉ mục cho bảng `inventory_purchases`
--
ALTER TABLE `inventory_purchases`
  ADD PRIMARY KEY (`id`),
  ADD KEY `item_id` (`item_id`),
  ADD KEY `supplier_id` (`supplier_id`);

--
-- Chỉ mục cho bảng `inventory_sales`
--
ALTER TABLE `inventory_sales`
  ADD PRIMARY KEY (`id`),
  ADD KEY `item_id` (`item_id`);

--
-- Chỉ mục cho bảng `inventory_stock`
--
ALTER TABLE `inventory_stock`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_item_barn` (`item_id`,`barn_id`),
  ADD KEY `barn_id` (`barn_id`);

--
-- Chỉ mục cho bảng `inventory_transactions`
--
ALTER TABLE `inventory_transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `item_id` (`item_id`);

--
-- Chỉ mục cho bảng `medications`
--
ALTER TABLE `medications`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `notification_settings`
--
ALTER TABLE `notification_settings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Chỉ mục cho bảng `push_notifications_log`
--
ALTER TABLE `push_notifications_log`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `push_subscriptions`
--
ALTER TABLE `push_subscriptions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_endpoint` (`endpoint`(200));

--
-- Chỉ mục cho bảng `remember_tokens`
--
ALTER TABLE `remember_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `token` (`token`),
  ADD KEY `idx_token` (`token`),
  ADD KEY `idx_expires` (`expires_at`);

--
-- Chỉ mục cho bảng `sensor_readings`
--
ALTER TABLE `sensor_readings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_device_time` (`device_id`,`DESC`);

--
-- Chỉ mục cho bảng `suppliers`
--
ALTER TABLE `suppliers`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- Chỉ mục cho bảng `vaccine_brands`
--
ALTER TABLE `vaccine_brands`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `vaccine_programs`
--
ALTER TABLE `vaccine_programs`
  ADD PRIMARY KEY (`id`);

--
-- Chỉ mục cho bảng `vaccine_program_items`
--
ALTER TABLE `vaccine_program_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_program` (`program_id`);

--
-- Chỉ mục cho bảng `vaccine_schedules`
--
ALTER TABLE `vaccine_schedules`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cycle` (`cycle_id`),
  ADD KEY `idx_date` (`scheduled_date`),
  ADD KEY `idx_done` (`done`);

--
-- Chỉ mục cho bảng `weight_samples`
--
ALTER TABLE `weight_samples`
  ADD PRIMARY KEY (`id`),
  ADD KEY `session_id` (`session_id`);

--
-- Chỉ mục cho bảng `weight_sessions`
--
ALTER TABLE `weight_sessions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_cycle_day` (`cycle_id`,`day_age`);

--
-- AUTO_INCREMENT cho các bảng đã đổ
--

--
-- AUTO_INCREMENT cho bảng `barns`
--
ALTER TABLE `barns`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT cho bảng `care_deaths`
--
ALTER TABLE `care_deaths`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT cho bảng `care_expenses`
--
ALTER TABLE `care_expenses`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `care_feeds`
--
ALTER TABLE `care_feeds`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT cho bảng `care_litters`
--
ALTER TABLE `care_litters`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT cho bảng `care_medications`
--
ALTER TABLE `care_medications`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `care_sales`
--
ALTER TABLE `care_sales`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `curtain_configs`
--
ALTER TABLE `curtain_configs`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT cho bảng `cycles`
--
ALTER TABLE `cycles`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT cho bảng `cycle_daily_snapshots`
--
ALTER TABLE `cycle_daily_snapshots`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=265;

--
-- AUTO_INCREMENT cho bảng `cycle_feed_programs`
--
ALTER TABLE `cycle_feed_programs`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT cho bảng `cycle_feed_program_items`
--
ALTER TABLE `cycle_feed_program_items`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `cycle_feed_stages`
--
ALTER TABLE `cycle_feed_stages`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `cycle_splits`
--
ALTER TABLE `cycle_splits`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `devices`
--
ALTER TABLE `devices`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=48;

--
-- AUTO_INCREMENT cho bảng `device_channels`
--
ALTER TABLE `device_channels`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=313;

--
-- AUTO_INCREMENT cho bảng `device_commands`
--
ALTER TABLE `device_commands`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT cho bảng `device_firmwares`
--
ALTER TABLE `device_firmwares`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT cho bảng `device_pings`
--
ALTER TABLE `device_pings`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=89;

--
-- AUTO_INCREMENT cho bảng `device_states`
--
ALTER TABLE `device_states`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `device_state_log`
--
ALTER TABLE `device_state_log`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `device_types`
--
ALTER TABLE `device_types`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT cho bảng `env_readings`
--
ALTER TABLE `env_readings`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1959;

--
-- AUTO_INCREMENT cho bảng `env_weather`
--
ALTER TABLE `env_weather`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `feed_brands`
--
ALTER TABLE `feed_brands`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT cho bảng `feed_trough_checks`
--
ALTER TABLE `feed_trough_checks`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT cho bảng `feed_types`
--
ALTER TABLE `feed_types`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT cho bảng `health_notes`
--
ALTER TABLE `health_notes`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT cho bảng `inventory_consumable_assets`
--
ALTER TABLE `inventory_consumable_assets`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `inventory_items`
--
ALTER TABLE `inventory_items`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=39;

--
-- AUTO_INCREMENT cho bảng `inventory_purchases`
--
ALTER TABLE `inventory_purchases`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT cho bảng `inventory_sales`
--
ALTER TABLE `inventory_sales`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `inventory_stock`
--
ALTER TABLE `inventory_stock`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT cho bảng `inventory_transactions`
--
ALTER TABLE `inventory_transactions`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT cho bảng `medications`
--
ALTER TABLE `medications`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT cho bảng `notification_settings`
--
ALTER TABLE `notification_settings`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT cho bảng `push_notifications_log`
--
ALTER TABLE `push_notifications_log`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=157;

--
-- AUTO_INCREMENT cho bảng `push_subscriptions`
--
ALTER TABLE `push_subscriptions`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT cho bảng `remember_tokens`
--
ALTER TABLE `remember_tokens`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT cho bảng `sensor_readings`
--
ALTER TABLE `sensor_readings`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `suppliers`
--
ALTER TABLE `suppliers`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT cho bảng `users`
--
ALTER TABLE `users`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT cho bảng `vaccine_brands`
--
ALTER TABLE `vaccine_brands`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT cho bảng `vaccine_programs`
--
ALTER TABLE `vaccine_programs`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT cho bảng `vaccine_program_items`
--
ALTER TABLE `vaccine_program_items`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT cho bảng `vaccine_schedules`
--
ALTER TABLE `vaccine_schedules`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT cho bảng `weight_samples`
--
ALTER TABLE `weight_samples`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT cho bảng `weight_sessions`
--
ALTER TABLE `weight_sessions`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- Các ràng buộc cho các bảng đã đổ
--

--
-- Các ràng buộc cho bảng `care_deaths`
--
ALTER TABLE `care_deaths`
  ADD CONSTRAINT `care_deaths_ibfk_1` FOREIGN KEY (`cycle_id`) REFERENCES `cycles` (`id`);

--
-- Các ràng buộc cho bảng `care_feeds`
--
ALTER TABLE `care_feeds`
  ADD CONSTRAINT `care_feeds_ibfk_1` FOREIGN KEY (`cycle_id`) REFERENCES `cycles` (`id`),
  ADD CONSTRAINT `care_feeds_ibfk_2` FOREIGN KEY (`feed_type_id`) REFERENCES `feed_types` (`id`);

--
-- Các ràng buộc cho bảng `care_litters`
--
ALTER TABLE `care_litters`
  ADD CONSTRAINT `care_litters_ibfk_1` FOREIGN KEY (`cycle_id`) REFERENCES `cycles` (`id`),
  ADD CONSTRAINT `care_litters_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`id`) ON DELETE SET NULL;

--
-- Các ràng buộc cho bảng `care_medications`
--
ALTER TABLE `care_medications`
  ADD CONSTRAINT `care_medications_ibfk_1` FOREIGN KEY (`cycle_id`) REFERENCES `cycles` (`id`),
  ADD CONSTRAINT `care_medications_ibfk_2` FOREIGN KEY (`medication_id`) REFERENCES `medications` (`id`);

--
-- Các ràng buộc cho bảng `care_sales`
--
ALTER TABLE `care_sales`
  ADD CONSTRAINT `care_sales_ibfk_1` FOREIGN KEY (`cycle_id`) REFERENCES `cycles` (`id`);

--
-- Các ràng buộc cho bảng `curtain_configs`
--
ALTER TABLE `curtain_configs`
  ADD CONSTRAINT `curtain_configs_ibfk_1` FOREIGN KEY (`barn_id`) REFERENCES `barns` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `curtain_configs_ibfk_2` FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`),
  ADD CONSTRAINT `curtain_configs_ibfk_3` FOREIGN KEY (`up_channel_id`) REFERENCES `device_channels` (`id`),
  ADD CONSTRAINT `curtain_configs_ibfk_4` FOREIGN KEY (`down_channel_id`) REFERENCES `device_channels` (`id`);

--
-- Các ràng buộc cho bảng `cycles`
--
ALTER TABLE `cycles`
  ADD CONSTRAINT `cycles_ibfk_1` FOREIGN KEY (`barn_id`) REFERENCES `barns` (`id`),
  ADD CONSTRAINT `cycles_ibfk_2` FOREIGN KEY (`parent_cycle_id`) REFERENCES `cycles` (`id`);

--
-- Các ràng buộc cho bảng `cycle_feed_programs`
--
ALTER TABLE `cycle_feed_programs`
  ADD CONSTRAINT `cycle_feed_programs_ibfk_1` FOREIGN KEY (`cycle_id`) REFERENCES `cycles` (`id`),
  ADD CONSTRAINT `cycle_feed_programs_ibfk_2` FOREIGN KEY (`feed_brand_id`) REFERENCES `feed_brands` (`id`);

--
-- Các ràng buộc cho bảng `cycle_feed_stages`
--
ALTER TABLE `cycle_feed_stages`
  ADD CONSTRAINT `cycle_feed_stages_ibfk_1` FOREIGN KEY (`cycle_id`) REFERENCES `cycles` (`id`),
  ADD CONSTRAINT `cycle_feed_stages_ibfk_2` FOREIGN KEY (`primary_feed_type_id`) REFERENCES `feed_types` (`id`),
  ADD CONSTRAINT `cycle_feed_stages_ibfk_3` FOREIGN KEY (`mix_feed_type_id`) REFERENCES `feed_types` (`id`);

--
-- Các ràng buộc cho bảng `cycle_splits`
--
ALTER TABLE `cycle_splits`
  ADD CONSTRAINT `cycle_splits_ibfk_1` FOREIGN KEY (`from_cycle_id`) REFERENCES `cycles` (`id`),
  ADD CONSTRAINT `cycle_splits_ibfk_2` FOREIGN KEY (`to_cycle_id`) REFERENCES `cycles` (`id`);

--
-- Các ràng buộc cho bảng `devices`
--
ALTER TABLE `devices`
  ADD CONSTRAINT `devices_ibfk_1` FOREIGN KEY (`barn_id`) REFERENCES `barns` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `devices_ibfk_2` FOREIGN KEY (`device_type_id`) REFERENCES `device_types` (`id`);

--
-- Các ràng buộc cho bảng `device_channels`
--
ALTER TABLE `device_channels`
  ADD CONSTRAINT `device_channels_ibfk_1` FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `device_commands`
--
ALTER TABLE `device_commands`
  ADD CONSTRAINT `device_commands_ibfk_1` FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`);

--
-- Các ràng buộc cho bảng `device_firmwares`
--
ALTER TABLE `device_firmwares`
  ADD CONSTRAINT `device_firmwares_ibfk_1` FOREIGN KEY (`device_type_id`) REFERENCES `device_types` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `device_states`
--
ALTER TABLE `device_states`
  ADD CONSTRAINT `device_states_ibfk_1` FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `env_readings`
--
ALTER TABLE `env_readings`
  ADD CONSTRAINT `fk_env_barn` FOREIGN KEY (`barn_id`) REFERENCES `barns` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_env_cycle` FOREIGN KEY (`cycle_id`) REFERENCES `cycles` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_env_device` FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `env_weather`
--
ALTER TABLE `env_weather`
  ADD CONSTRAINT `env_weather_ibfk_1` FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`),
  ADD CONSTRAINT `env_weather_ibfk_2` FOREIGN KEY (`barn_id`) REFERENCES `barns` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `env_weather_ibfk_3` FOREIGN KEY (`cycle_id`) REFERENCES `cycles` (`id`) ON DELETE SET NULL;

--
-- Các ràng buộc cho bảng `feed_trough_checks`
--
ALTER TABLE `feed_trough_checks`
  ADD CONSTRAINT `feed_trough_checks_ibfk_1` FOREIGN KEY (`cycle_id`) REFERENCES `cycles` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `feed_trough_checks_ibfk_2` FOREIGN KEY (`ref_feed_id`) REFERENCES `care_feeds` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `feed_types`
--
ALTER TABLE `feed_types`
  ADD CONSTRAINT `feed_types_ibfk_1` FOREIGN KEY (`feed_brand_id`) REFERENCES `feed_brands` (`id`);

--
-- Các ràng buộc cho bảng `inventory_consumable_assets`
--
ALTER TABLE `inventory_consumable_assets`
  ADD CONSTRAINT `inventory_consumable_assets_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`id`),
  ADD CONSTRAINT `inventory_consumable_assets_ibfk_2` FOREIGN KEY (`barn_id`) REFERENCES `barns` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `inventory_consumable_assets_ibfk_3` FOREIGN KEY (`ref_device_id`) REFERENCES `devices` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `inventory_consumable_assets_ibfk_4` FOREIGN KEY (`purchase_id`) REFERENCES `inventory_purchases` (`id`) ON DELETE SET NULL;

--
-- Các ràng buộc cho bảng `inventory_items`
--
ALTER TABLE `inventory_items`
  ADD CONSTRAINT `inventory_items_ibfk_1` FOREIGN KEY (`ref_medication_id`) REFERENCES `medications` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `inventory_items_ibfk_2` FOREIGN KEY (`ref_feed_brand_id`) REFERENCES `feed_brands` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `inventory_items_ibfk_3` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL;

--
-- Các ràng buộc cho bảng `inventory_purchases`
--
ALTER TABLE `inventory_purchases`
  ADD CONSTRAINT `inventory_purchases_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`id`),
  ADD CONSTRAINT `inventory_purchases_ibfk_2` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL;

--
-- Các ràng buộc cho bảng `inventory_sales`
--
ALTER TABLE `inventory_sales`
  ADD CONSTRAINT `inventory_sales_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`id`);

--
-- Các ràng buộc cho bảng `inventory_stock`
--
ALTER TABLE `inventory_stock`
  ADD CONSTRAINT `inventory_stock_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`id`),
  ADD CONSTRAINT `inventory_stock_ibfk_2` FOREIGN KEY (`barn_id`) REFERENCES `barns` (`id`) ON DELETE SET NULL;

--
-- Các ràng buộc cho bảng `inventory_transactions`
--
ALTER TABLE `inventory_transactions`
  ADD CONSTRAINT `inventory_transactions_ibfk_1` FOREIGN KEY (`item_id`) REFERENCES `inventory_items` (`id`);

--
-- Các ràng buộc cho bảng `sensor_readings`
--
ALTER TABLE `sensor_readings`
  ADD CONSTRAINT `fk_sensor_device` FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `weight_samples`
--
ALTER TABLE `weight_samples`
  ADD CONSTRAINT `weight_samples_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `weight_sessions` (`id`) ON DELETE CASCADE;

--
-- Các ràng buộc cho bảng `weight_sessions`
--
ALTER TABLE `weight_sessions`
  ADD CONSTRAINT `weight_sessions_ibfk_1` FOREIGN KEY (`cycle_id`) REFERENCES `cycles` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
