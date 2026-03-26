-- ============================================
-- Phase 2: Farm Management - Barns, Cycles, Inventory, Care
-- Trại gà: kho chung + kho chuồng, cho ăn, tử vong, thuốc, cân
-- ============================================

-- 1. Barns (Chuồng)
CREATE TABLE IF NOT EXISTS barns (
    id VARCHAR(50) PRIMARY KEY,                    -- barn_01, barn_02...
    name VARCHAR(200) NOT NULL,
    capacity INT,                                  -- sức chứa tối đa
    area_sqm FLOAT,                                -- diện tích (m²)
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Cycles (Đợt nuôi)
CREATE TABLE IF NOT EXISTS cycles (
    id SERIAL PRIMARY KEY,
    barn_id VARCHAR(50) REFERENCES barns(id),
    name VARCHAR(200) NOT NULL,                    -- "Đợt 1 - 2026"
    breed VARCHAR(100),                            -- giống gà
    initial_count INT NOT NULL,                    -- số con nhập ban đầu
    current_count INT,                             -- số con hiện tại (tự tính)
    start_date DATE NOT NULL,
    expected_end_date DATE,
    actual_end_date DATE,
    status VARCHAR(20) DEFAULT 'active',           -- active, closed, cancelled
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cycles_barn ON cycles (barn_id, status);
CREATE INDEX IF NOT EXISTS idx_cycles_active ON cycles (status) WHERE status = 'active';

-- 3. Warehouses (Kho)
CREATE TABLE IF NOT EXISTS warehouses (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,              -- main_feed, main_medicine, barn_01_feed
    name VARCHAR(200) NOT NULL,
    warehouse_type VARCHAR(20) NOT NULL,            -- 'feed' hoặc 'medicine'
    barn_id VARCHAR(50) REFERENCES barns(id),      -- NULL = kho chung
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Products (Sản phẩm: loại cám, loại thuốc)
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,              -- cam_s1, cam_s2, vaccine_nd
    name VARCHAR(200) NOT NULL,
    product_type VARCHAR(20) NOT NULL,              -- 'feed' hoặc 'medicine'
    unit VARCHAR(20) DEFAULT 'kg',                 -- kg, bao, lọ, liều
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Inventory (Tồn kho hiện tại)
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    warehouse_id INT REFERENCES warehouses(id),
    product_id INT REFERENCES products(id),
    quantity DOUBLE PRECISION DEFAULT 0,            -- số lượng hiện tại
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(warehouse_id, product_id)
);

-- 6. Inventory Transactions (Nhập/Xuất kho)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id SERIAL PRIMARY KEY,
    warehouse_id INT REFERENCES warehouses(id),
    product_id INT REFERENCES products(id),
    transaction_type VARCHAR(20) NOT NULL,          -- 'import' (nhập), 'export' (xuất), 'transfer' (chuyển kho)
    quantity DOUBLE PRECISION NOT NULL,             -- dương = nhập, âm = xuất
    reference_type VARCHAR(50),                    -- 'purchase', 'feed_log', 'transfer', 'adjustment'
    reference_id INT,                              -- ID bản ghi liên quan
    from_warehouse_id INT REFERENCES warehouses(id), -- chuyển kho: từ kho nào
    supplier VARCHAR(200),                         -- nhà cung cấp (khi nhập)
    unit_price DOUBLE PRECISION,                   -- đơn giá
    batch_number VARCHAR(100),                     -- số lô
    expiry_date DATE,                              -- hạn sử dụng
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_warehouse ON inventory_transactions (warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_tx_product ON inventory_transactions (product_id, created_at DESC);

-- 7. Care: Feed Logs (Cho ăn)
CREATE TABLE IF NOT EXISTS care_feeds (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    feed_date DATE NOT NULL,
    meal VARCHAR(20),                              -- 'morning', 'noon', 'afternoon', 'evening', 'all_day'
    product_id INT REFERENCES products(id),        -- loại cám
    quantity DOUBLE PRECISION NOT NULL,             -- kg cho ăn
    remaining DOUBLE PRECISION,                    -- kg còn trong máng (trough check)
    warehouse_id INT REFERENCES warehouses(id),    -- xuất từ kho nào
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feeds_cycle ON care_feeds (cycle_id, feed_date DESC);

-- 8. Care: Mortality (Tử vong)
CREATE TABLE IF NOT EXISTS care_deaths (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    death_date DATE NOT NULL,
    count INT NOT NULL DEFAULT 1,                  -- số con chết
    cause VARCHAR(200),                            -- nguyên nhân
    symptoms TEXT,                                 -- triệu chứng
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deaths_cycle ON care_deaths (cycle_id, death_date DESC);

-- 9. Care: Medication (Thuốc/Vaccine)
CREATE TABLE IF NOT EXISTS care_medications (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    med_date DATE NOT NULL,
    med_type VARCHAR(20) NOT NULL,                 -- 'medicine', 'vaccine', 'vitamin', 'probiotic'
    product_id INT REFERENCES products(id),
    quantity DOUBLE PRECISION,                     -- liều lượng
    method VARCHAR(50),                            -- 'water' (pha nước), 'inject' (tiêm), 'spray' (phun), 'feed' (trộn cám)
    warehouse_id INT REFERENCES warehouses(id),    -- xuất từ kho nào
    purpose TEXT,                                  -- mục đích sử dụng
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meds_cycle ON care_medications (cycle_id, med_date DESC);

-- 10. Care: Weight Sampling (Cân trọng lượng)
CREATE TABLE IF NOT EXISTS care_weights (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    weigh_date DATE NOT NULL,
    sample_count INT NOT NULL,                     -- số con cân
    total_weight DOUBLE PRECISION NOT NULL,         -- tổng kg
    avg_weight DOUBLE PRECISION GENERATED ALWAYS AS (total_weight / NULLIF(sample_count, 0)) STORED,
    min_weight DOUBLE PRECISION,
    max_weight DOUBLE PRECISION,
    uniformity DOUBLE PRECISION,                   -- % đồng đều (CV)
    day_age INT,                                   -- ngày tuổi
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weights_cycle ON care_weights (cycle_id, weigh_date DESC);

-- 11. Weight Reminders (Nhắc cân)
CREATE TABLE IF NOT EXISTS weight_reminders (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    remind_every_days INT DEFAULT 7,               -- cân mỗi X ngày
    next_remind_date DATE,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Cycle Daily Snapshots (Tổng hợp KPI hàng ngày)
CREATE TABLE IF NOT EXISTS cycle_daily_snapshots (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    snapshot_date DATE NOT NULL,
    day_age INT NOT NULL,                          -- ngày tuổi
    alive_count INT,                               -- số con sống
    total_deaths INT,                              -- tổng tử vong tích lũy
    daily_deaths INT,                              -- tử vong trong ngày
    mortality_rate DOUBLE PRECISION,               -- % tử vong tích lũy
    daily_feed_kg DOUBLE PRECISION,                -- kg cám trong ngày
    cumulative_feed_kg DOUBLE PRECISION,           -- tổng cám tích lũy
    avg_weight DOUBLE PRECISION,                   -- trọng lượng TB (nếu cân)
    fcr DOUBLE PRECISION,                          -- Feed Conversion Ratio
    feed_per_bird DOUBLE PRECISION,                -- g cám/con/ngày
    avg_temperature DOUBLE PRECISION,              -- nhiệt độ TB trong ngày
    avg_humidity DOUBLE PRECISION,                 -- độ ẩm TB trong ngày
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cycle_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_cycle ON cycle_daily_snapshots (cycle_id, snapshot_date DESC);

-- 13. Sales/Culling (Xuất bán/loại)
CREATE TABLE IF NOT EXISTS care_sales (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    sale_date DATE NOT NULL,
    count INT NOT NULL,                            -- số con
    total_weight DOUBLE PRECISION,                 -- tổng kg
    avg_weight DOUBLE PRECISION,                   -- kg/con
    unit_price DOUBLE PRECISION,                   -- giá/kg
    total_amount DOUBLE PRECISION,                 -- tổng tiền
    buyer VARCHAR(200),                            -- người mua
    sale_type VARCHAR(20) DEFAULT 'sale',          -- 'sale', 'cull' (loại)
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: example barns
-- INSERT INTO barns (id, name, capacity) VALUES
--     ('barn_01', 'Chuồng 1', 5000),
--     ('barn_02', 'Chuồng 2', 5000);

DO $$ BEGIN RAISE NOTICE '=== Farm management tables created! ==='; END $$;
