# Farm & Barn Data Completion Checklist

> **Tracking**: Tasks to sync and enrich barn data between Local (PostgreSQL) and Cloud (MySQL)
> **Last Updated**: 2026-04-03 - Added Farm entity, multi-farm support planned

---

## [ ] 0. Farm Entity (NEW - Multi-farm Support)

**Priority**: HIGH — top-level entity, prerequisite for everything else

### Add `farms` table to Local (PostgreSQL)

**Script**: `scripts/015_add_farms_table.sql`

```sql
CREATE TABLE IF NOT EXISTS farms (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    address TEXT,
    contact_name VARCHAR(100),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(100),
    notes TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default farm (ID=1) for existing single-farm setup
INSERT INTO farms (id, name, active) VALUES ('farm-01', 'Trang trại chính', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Add farm_id to barns (default = 'farm-01' for backward compatibility)
ALTER TABLE barns ADD COLUMN IF NOT EXISTS farm_id VARCHAR(50) DEFAULT 'farm-01';
UPDATE barns SET farm_id = 'farm-01' WHERE farm_id IS NULL;
ALTER TABLE barns ALTER COLUMN farm_id SET NOT NULL;
```

### Add `farms` table to Cloud (MySQL)

```sql
CREATE TABLE IF NOT EXISTS farms (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    address TEXT,
    contact_name VARCHAR(100),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(100),
    notes TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add farm_id to barns
ALTER TABLE barns ADD COLUMN farm_id BIGINT UNSIGNED DEFAULT 1;
UPDATE barns SET farm_id = 1 WHERE farm_id IS NULL;
ALTER TABLE barns MODIFY farm_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE barns ADD FOREIGN KEY (farm_id) REFERENCES farms(id);
```

### Sync Handler for Farms

**Local → Cloud**: Push farm changes via `sync_service.queue_change("farms", ...)`

**Cloud → Local**: Add `_sync_farms` handler in `sync_service.py`

| Item | Status | Notes |
|------|--------|-------|
| Add `farms` table to local | ⬜ | Migration script ready |
| Add `farms` table to cloud | ⬜ | SQL above |
| Add `farm_id` to `barns` table | ⬜ | Backward compatible |
| Create `_sync_farms` handler | ⬜ | Bidirectional sync |
| Update barn_service to set farm_id | ⬜ | Default = 'farm-01' |

---

## Hierarchy (Updated 2026-04-03)

```
Farm (top-level - multi-farm ready)
└── Barn (farm_id FK)
    ├── Cycle (barn_id FK)
    ├── Device (barn_id FK)
    └── Warehouse (barn_id FK, nullable)

Reference Data (independent):
├── feed_brands, feed_types
├── medications, suppliers
└── vaccine_programs, vaccine_program_items

Sync Infrastructure:
├── sync_queue, sync_log, sync_config
```

---

## [ ] 1. Add missing columns to local `barns` table (from cloud)

**Priority**: HIGH — required for sync

| Field | Type | Source (Cloud) | Migration |
|-------|------|----------------|-----------|
| `number` | INT | `barns.number` | Pull from cloud via sync |
| `length_m` | DECIMAL(5,2) | `barns.length_m` | Pull from cloud via sync |
| `width_m` | DECIMAL(5,2) | `barns.width_m` | Pull from cloud via sync |
| `height_m` | DECIMAL(5,2) | `barns.height_m` | Pull from cloud via sync |

**Migration script** (`scripts/013_add_barn_dimensions.sql`):
```sql
ALTER TABLE barns ADD COLUMN IF NOT EXISTS number INT;
ALTER TABLE barns ADD COLUMN IF NOT EXISTS length_m DECIMAL(5,2);
ALTER TABLE barns ADD COLUMN IF NOT EXISTS width_m DECIMAL(5,2);
ALTER TABLE barns ADD COLUMN IF NOT EXISTS height_m DECIMAL(5,2);
```

---

### [ ] 2. Add CapEx fields to both local and cloud

**Priority**: MEDIUM — needed for financial analysis

| Field | Type | Local Add | Cloud Add |
|-------|------|-----------|-----------|
| `construction_cost` | DECIMAL(12,2) | `ALTER TABLE barns ADD COLUMN construction_cost DECIMAL(12,2);` | ALTER TABLE |
| `construction_year` | INT | `ALTER TABLE barns ADD COLUMN construction_year INT;` | ALTER TABLE |
| `expected_lifespan_years` | INT | `ALTER TABLE barns ADD COLUMN expected_lifespan_years INT DEFAULT 15;` | ALTER TABLE |
| `construction_type` | VARCHAR(50) | `ALTER TABLE barns ADD COLUMN construction_type VARCHAR(50);` | ALTER TABLE |

**Local script** (`scripts/014_add_barn_capex.sql`):
```sql
ALTER TABLE barns ADD COLUMN IF NOT EXISTS construction_cost DECIMAL(12,2);
ALTER TABLE barns ADD COLUMN IF NOT EXISTS construction_year INT;
ALTER TABLE barns ADD COLUMN IF NOT EXISTS expected_lifespan_years INT DEFAULT 15;
ALTER TABLE barns ADD COLUMN IF NOT EXISTS construction_type VARCHAR(50);
```

---

### [ ] 3. Update sync handler for barns (Local ← Cloud)

**Priority**: HIGH — ensure dimension fields sync correctly

**Current issue**: `_sync_barns` in `sync_service.py` maps `length_m`, `width_m`, `height_m` but `number` mapping may need verify.

**Verify in `sync_service.py` line 339**:
```python
str(p["id"]), self._to_int(p.get("number")), p["name"],
self._to_float(p.get("length_m")), self._to_float(p.get("width_m")),
self._to_float(p.get("height_m")), p.get("status", "active"),
```

**Check**: `barn_id` in local is VARCHAR(50), cloud `barns.id` is `bigint UNSIGNED` — confirm upsert by ID works correctly.

---

### [ ] 4. Sync `capacity` from Local → Cloud (reverse direction)

**Priority**: MEDIUM — cloud needs capacity field

**Currently**: `barns.capacity` exists in local but NOT in cloud schema.

**Action**: Add `capacity` column to cloud `barns` table, update cloud sync handler to receive it.

**Cloud (MySQL) - add column**:
```sql
ALTER TABLE barns ADD COLUMN capacity INT COMMENT 'Số gà tối đa';
```

**Then update cloud's sync handler** to insert/update `capacity` from local payload.

---

### [ ] 5. Create migration scripts for both databases

**Files to create**:
- [ ] `scripts/013_add_barn_dimensions.sql` — add number, length_m, width_m, height_m to local
- [ ] `scripts/014_add_barn_capex.sql` — add construction_cost, construction_year, lifespan, type to local
- [ ] Cloud migration: add `capacity` to cloud `barns`
- [ ] Cloud migration: add 4 CapEx fields to cloud `barns`

---

### [ ] 6. Update Barn Service and API

**Priority**: MEDIUM

| Item | Status | Notes |
|------|--------|-------|
| Update `barn_service.py` to handle new fields | ⬜ | `create()`, `update()` methods |
| Update `POST /api/farm/barns` to accept dimensions | ⬜ | Validate positive numbers |
| Update `PUT /api/farm/barns/{id}` to accept dimensions | ⬜ | Partial update support |
| Update `GET /api/farm/barns/{id}` to return computed fields | ⬜ | volume_m3, annual_depreciation, etc. |

---

### [ ] 7. Frontend - Barn form (if exists)

**Priority**: LOW (check if barn UI exists in local)

| Item | Status | Notes |
|------|--------|-------|
| Add dimension fields to barn create/edit form | ⬜ | length, width, height inputs |
| Add capacity field to form | ⬜ | Number input |
| Add CapEx fields to form | ⬜ | cost, year, lifespan, type |
| Display computed fields (volume, depreciation) | ⬜ | Read-only display |

---

## Field Mapping Summary

### Barns Sync (Local ↔ Cloud)

| Local Field | Cloud Field | Direction | Status |
|-------------|-------------|-----------|--------|
| `id` (VARCHAR) | `id` (bigint) | Bidirectional | ✅ Synced |
| `number` | `number` | Cloud→Local | ✅ Handler exists |
| `name` | `name` | Bidirectional | ✅ Synced |
| `length_m` | `length_m` | Cloud→Local | ✅ Handler exists |
| `width_m` | `width_m` | Cloud→Local | ✅ Handler exists |
| `height_m` | `height_m` | Cloud→Local | ✅ Handler exists |
| `status` | `status` | Bidirectional | ✅ Synced |
| `note` | `note` | Bidirectional | ✅ Synced |
| `capacity` | ❌ (missing) | Local→Cloud | ⬜ Need to add to cloud |
| `construction_cost` | ❌ (missing) | Neither | ⬜ Add to both |
| `construction_year` | ❌ (missing) | Neither | ⬜ Add to both |
| `expected_lifespan_years` | ❌ (missing) | Neither | ⬜ Add to both |
| `construction_type` | ❌ (missing) | Neither | ⬜ Add to both |
| `active` | ❌ (soft delete) | Local→Cloud? | ⬜ Clarify |

---

## Blocked By

| Task | Blocker |
|------|---------|
| Test Local→Cloud capacity sync | Need `capacity` column in cloud first |
| Verify reverse sync (Local→Cloud) | Confirm cloud has upsert handler for barns |

---

## Quick Commands

### Local: Check barns table schema
```sql
\d barns
```

### Local: Check sync handler
```bash
grep -n "_sync_barns" src/sync/sync_service.py
```

### Cloud: Check barns table (via phpmyadmin or cli)
```sql
DESCRIBE cfarm_app_raw.barns;
```