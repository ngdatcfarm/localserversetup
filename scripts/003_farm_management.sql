-- ============================================
-- Phase 2: Farm Management Tables
-- ============================================
SET client_encoding = 'UTF8';

-- 1. Barns
DROP TABLE IF EXISTS care_sales CASCADE;
DROP TABLE IF EXISTS cycle_daily_snapshots CASCADE;
DROP TABLE IF EXISTS weight_reminders CASCADE;
DROP TABLE IF EXISTS care_weights CASCADE;
DROP TABLE IF EXISTS care_medications CASCADE;
DROP TABLE IF EXISTS care_deaths CASCADE;
DROP TABLE IF EXISTS care_feeds CASCADE;
DROP TABLE IF EXISTS inventory_transactions CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS warehouses CASCADE;
DROP TABLE IF EXISTS cycles CASCADE;
DROP TABLE IF EXISTS barns CASCADE;

CREATE TABLE IF NOT EXISTS barns (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    capacity INT,
    area_sqm FLOAT,
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Cycles
CREATE TABLE IF NOT EXISTS cycles (
    id SERIAL PRIMARY KEY,
    barn_id VARCHAR(50) REFERENCES barns(id),
    name VARCHAR(200) NOT NULL,
    breed VARCHAR(100),
    initial_count INT NOT NULL,
    current_count INT,
    start_date DATE NOT NULL,
    expected_end_date DATE,
    actual_end_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cycles_barn ON cycles (barn_id, status);
CREATE INDEX IF NOT EXISTS idx_cycles_active ON cycles (status) WHERE status = 'active';

-- 3. Warehouses
CREATE TABLE IF NOT EXISTS warehouses (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    warehouse_type VARCHAR(20) NOT NULL,
    barn_id VARCHAR(50) REFERENCES barns(id),
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Products
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    product_type VARCHAR(20) NOT NULL,
    unit VARCHAR(20) DEFAULT 'kg',
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Inventory
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    warehouse_id INT REFERENCES warehouses(id),
    product_id INT REFERENCES products(id),
    quantity DOUBLE PRECISION DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(warehouse_id, product_id)
);

-- 6. Inventory Transactions
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id SERIAL PRIMARY KEY,
    warehouse_id INT REFERENCES warehouses(id),
    product_id INT REFERENCES products(id),
    transaction_type VARCHAR(20) NOT NULL,
    quantity DOUBLE PRECISION NOT NULL,
    reference_type VARCHAR(50),
    reference_id INT,
    from_warehouse_id INT REFERENCES warehouses(id),
    supplier VARCHAR(200),
    unit_price DOUBLE PRECISION,
    batch_number VARCHAR(100),
    expiry_date DATE,
    notes TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_warehouse ON inventory_transactions (warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_tx_product ON inventory_transactions (product_id, created_at DESC);

-- 7. Care: Feed Logs
CREATE TABLE IF NOT EXISTS care_feeds (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    feed_date DATE NOT NULL,
    meal VARCHAR(20),
    product_id INT REFERENCES products(id),
    quantity DOUBLE PRECISION NOT NULL,
    remaining DOUBLE PRECISION,
    warehouse_id INT REFERENCES warehouses(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feeds_cycle ON care_feeds (cycle_id, feed_date DESC);

-- 8. Care: Mortality
CREATE TABLE IF NOT EXISTS care_deaths (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    death_date DATE NOT NULL,
    count INT NOT NULL DEFAULT 1,
    cause VARCHAR(200),
    symptoms TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deaths_cycle ON care_deaths (cycle_id, death_date DESC);

-- 9. Care: Medication
CREATE TABLE IF NOT EXISTS care_medications (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    med_date DATE NOT NULL,
    med_type VARCHAR(20) NOT NULL,
    product_id INT REFERENCES products(id),
    quantity DOUBLE PRECISION,
    method VARCHAR(50),
    warehouse_id INT REFERENCES warehouses(id),
    purpose TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meds_cycle ON care_medications (cycle_id, med_date DESC);

-- 10. Care: Weight Sampling
CREATE TABLE IF NOT EXISTS care_weights (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    weigh_date DATE NOT NULL,
    sample_count INT NOT NULL,
    total_weight DOUBLE PRECISION NOT NULL,
    avg_weight DOUBLE PRECISION GENERATED ALWAYS AS (total_weight / NULLIF(sample_count, 0)) STORED,
    min_weight DOUBLE PRECISION,
    max_weight DOUBLE PRECISION,
    uniformity DOUBLE PRECISION,
    day_age INT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weights_cycle ON care_weights (cycle_id, weigh_date DESC);

-- 11. Weight Reminders
CREATE TABLE IF NOT EXISTS weight_reminders (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    remind_every_days INT DEFAULT 7,
    next_remind_date DATE,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Cycle Daily Snapshots
CREATE TABLE IF NOT EXISTS cycle_daily_snapshots (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    snapshot_date DATE NOT NULL,
    day_age INT NOT NULL,
    alive_count INT,
    total_deaths INT,
    daily_deaths INT,
    mortality_rate DOUBLE PRECISION,
    daily_feed_kg DOUBLE PRECISION,
    cumulative_feed_kg DOUBLE PRECISION,
    avg_weight DOUBLE PRECISION,
    fcr DOUBLE PRECISION,
    feed_per_bird DOUBLE PRECISION,
    avg_temperature DOUBLE PRECISION,
    avg_humidity DOUBLE PRECISION,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cycle_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_cycle ON cycle_daily_snapshots (cycle_id, snapshot_date DESC);

-- 13. Sales
CREATE TABLE IF NOT EXISTS care_sales (
    id SERIAL PRIMARY KEY,
    cycle_id INT REFERENCES cycles(id),
    barn_id VARCHAR(50) REFERENCES barns(id),
    sale_date DATE NOT NULL,
    count INT NOT NULL,
    total_weight DOUBLE PRECISION,
    avg_weight DOUBLE PRECISION,
    unit_price DOUBLE PRECISION,
    total_amount DOUBLE PRECISION,
    buyer VARCHAR(200),
    sale_type VARCHAR(20) DEFAULT 'sale',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN RAISE NOTICE '=== Farm management tables created! ==='; END $$;
