# Worklog

> **Date**: 2026-04-03
> **Session**: Data schema alignment - Cycle entity deep dive

---

## Summary

Completed full Cycle entity gap analysis. Local (PostgreSQL) is primary - Cloud (MySQL) will reset to match.

---

## Changes This Session

### 1. Phase 1.1 + 1.2 Implementation ✅

**care_service.py** - Added auto-queue to 5 methods:
- `log_feed()` → queue `care_feeds` with meal→session mapping
- `log_death()` → queue `care_deaths` with count→quantity, cause→reason mapping
- `log_medication()` → queue `care_medications` with product_id→medication_id mapping
- `log_weight()` → queue `weight_sessions`
- `log_sale()` → queue `care_sales` with count→quantity, total_weight→weight_kg, unit_price→price_per_kg mapping

**inventory_service.py** - Added auto-queue to 3 methods:
- `import_stock()` → queue `inventory_transactions`
- `export_stock()` → queue `inventory_transactions`
- `transfer_stock()` → queue 2 transactions (export + import)

### 2. data_dependency_map.md - Complete Reorg ✅

- Clean entity hierarchy: Farm → Barn → [Cycle, Device, Warehouse, Equipment, SensorData]
- Device confirmed as child of Barn (has barn_id FK)
- Barn has 7 children: Cycle, Device, Warehouse, Equipment, SensorData (5 existing + 2 new)
- SensorData: merged env_readings + env_weather into single table with sensor_type column
- Equipment: new table (replaces inventory_consumable_assets in Cloud)
- Farm: new top-level entity with barn_id FK in barns

### 3. Cycle Schema - All Gaps Filled ✅

**Local cycles table** - Added 7 fields:
- `male_quantity` INT DEFAULT 0
- `female_quantity` INT DEFAULT 0
- `purchase_price` DECIMAL(12,2)
- `stage` VARCHAR(20) DEFAULT 'chick'
- `flock_source` VARCHAR(20)
- `parent_cycle_id` INT REFERENCES cycles(id)
- `split_date` DATE

**care_deaths** - Added 2 fields:
- `death_category` VARCHAR(20) -- 'disease' | 'accident' | 'weak' | 'unknown'
- `image_path` VARCHAR(500)

**care_medications** - Already has `dosage` and `unit`

**care_sales** - Already has `gender`

**New tables created in Local schema**:
- `weight_samples` (individual bird weights per session)
- `care_expenses` (feed/medication/labor/utility cost tracking)
- `care_litters` (litter management)

### 4. check_list.md - Updated ✅

Full cycle section with:
- 4.1: Cycle schema gaps (7 fields)
- 4.2: Care tables gaps (death_category, image_path, dosage, unit)
- 4.3: New tables (weight_samples, care_expenses, care_litters) with SQL
- 4.4: Sync handlers to add (5 missing)
- 4.5: Full 13-table summary with sync status

### 5. Migration Scripts

| Script | Content | Status |
|--------|---------|--------|
| scripts/015_add_farms_table.sql | farms table + barns.farm_id | ✅ Ready |
| scripts/013_add_barn_dimensions.sql | number, length_m, width_m, height_m | ✅ Ready |
| scripts/014_add_barn_capex.sql | construction_cost, construction_year, lifespan, type | ✅ Ready |
| scripts/016_add_equipment.sql | equipment table | TODO |
| scripts/017_add_cycle_gender_finance.sql | cycle new fields | TODO |

---

## Git Commits

| Commit | Message |
|--------|---------|
| f732737 | docs: reorganize data_dependency_map with clean entity hierarchy |
| 055a0ed | farm: add auto-queue sync for care operations in care_service |
| 39a42ff | farm: add sync queue for inventory import/export/transfer |

---

## Remaining Work

### HIGH PRIORITY
- [ ] Run migration scripts on Local (015, 013, 014)
- [ ] Create scripts/016_add_equipment.sql
- [ ] Create scripts/017_add_cycle_gender_finance.sql
- [ ] Create scripts/018_add_weight_samples.sql
- [ ] Create scripts/019_add_care_expenses.sql
- [ ] Create scripts/020_add_care_litters.sql
- [ ] Cloud reset: drop old tables, create new matching Local
- [ ] Add barn_id FK to Cloud care tables

### MEDIUM PRIORITY
- [ ] Add 5 sync handlers: _sync_weight_reminders, _sync_health_notes, _sync_care_expenses, _sync_care_litters, _sync_weight_samples
- [ ] Test sync loop (every 60s)

### MIGRATION ORDER
```
1. Farm entity (scripts/015)
2. Barn dimensions (scripts/013)
3. Barn CapEx (scripts/014)
4. Equipment (scripts/016)
5. Cycle fields (scripts/017)
6. New tables (018, 019, 020)
7. Cloud reset
8. Verify sync handlers
9. Run initial sync
```
