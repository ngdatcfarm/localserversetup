# Phase 1: Backend Foundation Plan

**Mục tiêu:** Xây dựng Backend Foundation hoàn chỉnh trước khi code

> ⚠️ **Nguyên tắc:** Phải hoàn thiện từng bước, bước sau phụ thuộc bước trước

---

## Bước 1️⃣: System Design / Backend Foundation

### 1.1 Database Schema Design
- [ ] **Farm → Barn → Warehouse hierarchy**
  - [ ] Tables: farms, barns, warehouses
  - [ ] Relationships: farm has many barns, barn has many warehouses
  - [ ] Indexes for performance

- [ ] **Device → Equipment/Sensor hierarchy**
  - [ ] Tables: devices, equipment, sensors
  - [ ] Relationships: barn has many devices, device has many sensors

- [ ] **Product → Inventory hierarchy**
  - [ ] Tables: products, inventory, transactions
  - [ ] Relationships: warehouse has many products

### 1.2 API Structure Design
- [ ] **RESTful API endpoints**
  - [ ] Resource naming convention
  - [ ] HTTP methods (GET/POST/PUT/DELETE)
  - [ ] Response format standardization

- [ ] **API versioning strategy**
  - [ ] /api/v1/ structure

### 1.3 System Architecture
- [ ] **Monolith vs Microservices decision**
  - Current: Monolith (FastAPI)
- [ ] **Database connection pooling**
- [ ] **Authentication/Authorization structure**

---

## Bước 2️⃣: Business Logic Implementation

### 2.1 CRUD Constraints
- [ ] **Farm constraints**
  - [ ] Cannot delete if has barns
  - [ ] Cannot delete if has warehouses

- [ ] **Barn constraints**
  - [ ] Cannot delete if has active cycle
  - [ ] Cannot delete if has devices
  - [ ] Cannot change farm_id if has cycles

- [ ] **Warehouse constraints**
  - [ ] Cannot delete if has inventory

- [ ] **Cycle constraints**
  - [ ] Cannot create if barn has active cycle
  - [ ] Cannot delete (only close)

### 2.2 Validation Rules
- [ ] **Data validation**
  - [ ] Required fields
  - [ ] Min/max values
  - [ ] Format validation (regex for IDs)
  - [ ] Enum values

### 2.3 Business Rules
- [ ] **Inventory rules**
  - [ ] Import → increase stock
  - [ ] Export → decrease stock (check available)
  - [ ] Transfer → move between warehouses

- [ ] **Care operations rules**
  - [ ] Death log → decrease cycle count
  - [ ] Sale log → decrease cycle count
  - [ ] Feed log → deduct from warehouse

---

## Bước 3️⃣: Frontend Logic

### 3.1 API Integration
- [ ] **API service layer**
  - [ ] Base API client
  - [ ] Error handling
  - [ ] Retry logic

- [ ] **State management**
  - [ ] Farm/Barn/Cycle state
  - [ ] Inventory state
  - [ ] Care logs state

### 3.2 Forms & Validation
- [ ] **Form validation (client-side)**
  - [ ] Required fields
  - [ ] Input format
  - [ ] Server-side validation display

---

## Bước 4️⃣: UI/UX Polish

### 4.1 Visual Design
- [ ] **Responsive layout**
- [ ] **Loading states**
- [ ] **Error states**
- [ ] **Empty states**

### 4.2 User Experience
- [ ] **Navigation**
- [ ] **Feedback messages**
- [ ] **Confirmation dialogs**

---

## Current Status

### ✅ Already Done (Phase 1.1 - 1.4)

**Database Schema:**
- 77 tables created via migrations 002-031 + 032
- Farm → Barn → Warehouse hierarchy ✅
- Device → Equipment/Sensor hierarchy ✅ (Equipment: 2026-04-13)
- Product → Inventory hierarchy ✅

**API Structure:**
- 72+ API endpoints implemented
- RESTful naming convention
- Standard response format

**Business Logic:**
- Farm delete → check barns ✅
- Barn delete → check active cycle ✅
- Barn delete → check devices ✅
- Barn update → prevent farm_id change ✅
- Warehouse delete → check inventory ✅
- Cycle create → check barn exists ✅
- Cycle create → check no active cycle ✅
- Export stock → check available qty ✅
- Cycle close → validate feeds recorded ✅
- DELETE endpoints for care logs ✅
- Barn create → validate farm_id exists ✅
- Feed log → validate warehouse/product exists ✅

**Care V2 Backend:**
- care_water_logs table + API ✅
- care_health_notes with health_flags ✅
- Water consumption logging ✅
- Health flags (cough, diarrhea, lethargy, respiratory) ✅
- Shift support (sang/chieu/all_day) for deaths, medications, water ✅

**Equipment System (2026-04-13):**
- EquipmentType CRUD ✅
- Equipment instance CRUD ✅
- Device channel assignment ✅
- Maintenance tracking ✅

**Sensor System:**
- SensorType CRUD ✅
- Sensor instance CRUD ✅
- Threshold configs ✅
- Calibration tracking ✅

### ❌ Still Needed

**Business Logic:**
- [ ] Cycle create → validate barn_id exists
- [ ] Death log → validate cycle_id exists
- [ ] Medication log → validate cycle_id exists
- [ ] Import stock → validate warehouse/product exists
- [ ] Product delete → check transactions

**Frontend Logic:**
- [ ] Vue 3 forms → API calls integration (partial)
- [ ] Error handling UI (partial)

**UI/UX:**
- [ ] Loading/empty states (partial)
- [ ] User feedback polish

---

## Đề xuất lộ trình (Outdated - 2026-04-15)

**Status:** Phase 1-4 largely complete. Focus shifting to:
1. Verify remaining business logic validations
2. Complete Phase 3 (Inventory/Products) if needed
3. Cloud sync verification
4. iOS push via FCM

---
