# AI Logic Feature Design

## Context

AI Logic is a new automation feature that extends the existing **Automation** tab (relay ON/OFF with cron/sensor triggers) with multi-step sequences involving PTZ presets, video recording, snapshots, and delays.

Example use cases:
- "Goto preset 1 → record 10s → goto preset water → stop recording"
- "Every day at 6pm, patrol all presets while recording"

---

## Data Model

### `ai_logic_rules`

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| name | VARCHAR(255) | Rule name |
| description | TEXT | Optional description |
| enabled | BOOLEAN | Default TRUE |
| trigger_type | VARCHAR(50) | 'schedule' or 'manual' |
| cron_expression | VARCHAR(100) | Cron for schedule trigger |
| cooldown_seconds | INTEGER | Default 60 |
| last_triggered_at | TIMESTAMPTZ | Last execution time |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `ai_logic_steps`

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| rule_id | INTEGER | FK to ai_logic_rules |
| step_order | INTEGER | Execution order |
| action_type | VARCHAR(50) | One of the action types below |
| camera_id | VARCHAR(100) | Target camera |
| preset_id | INTEGER | For goto_preset |
| duration_seconds | INTEGER | For record_video, wait |
| config | JSONB | Extra config (count, interval for snapshots) |

### Action Types

| Action | Description | Parameters |
|--------|-------------|------------|
| `goto_preset` | Move camera to preset | `camera_id`, `preset_id` |
| `record_video` | Start recording, wait duration, stop | `camera_id`, `duration_seconds` |
| `record_snapshot` | Take one or more snapshot photos | `camera_id`, `config.count`, `config.interval_sec` |
| `wait` | Delay between steps | `duration_seconds` |
| `stop_recording` | Stop active recording | `camera_id` (optional, stops all if null) |

---

## Backend Implementation

### `src/iot/ai_logic_service.py`

- `start()` / `stop()`: manage background loop
- `execute_rule(rule_id)`: load rule + steps, execute each step in order
- `_execute_step(step)`: dispatch to action handler
- `_do_goto_preset()`: use PTZ controller to goto preset
- `_do_record_video()`: start recording → sleep → stop recording
- `_do_record_snapshot()`: capture JPEG frames from camera
- `_do_wait()`: asyncio.sleep
- `_do_stop_recording()`: stop recording service
- Full CRUD: `list_rules`, `get_rule`, `create_rule`, `update_rule`, `delete_rule`, `toggle_rule`
- Schedule evaluation loop (every 30s) using croniter

### `src/server/routes/ai_logic.py`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/ai-logic/rules | List all rules |
| POST | /api/ai-logic/rules | Create rule |
| GET | /api/ai-logic/rules/{id} | Get rule with steps |
| PUT | /api/ai-logic/rules/{id} | Update rule |
| DELETE | /api/ai-logic/rules/{id} | Delete rule |
| POST | /api/ai-logic/rules/{id}/execute | Manually trigger |
| POST | /api/ai-logic/rules/{id}/toggle | Enable/disable |

---

## Frontend Implementation

### Route & Nav

- Route: `/ai-logic` → `static/js/pages/ai_logic.js`
- Nav item: `{ path: '/ai-logic', icon: '🤖', label: 'AI Logic' }` in sidebar

### `static/js/pages/ai_logic.js`

Vue 3 component with:
- **List view**: table of rules with trigger type, step count, enable toggle, and action buttons
- **Form modal**: create/edit rule with fields for name, trigger type, cron, cooldown, enabled
- **Step builder**: dynamic form with action type dropdown, shows relevant fields per action type (camera_id, preset_id, duration, etc.)
- **"+" button** to add steps, "✕" to remove
- **Test button** (▶): manually execute rule, show result JSON
- **Toggle button**: enable/disable rule

### Step Builder Fields by Action Type

| Action | Fields shown |
|--------|-------------|
| goto_preset | camera_id, preset_id |
| record_video | camera_id, duration_seconds |
| record_snapshot | camera_id, count, interval_sec |
| wait | duration_seconds |
| stop_recording | camera_id (optional) |

---

## UI Mockup (List View)

```
┌─────────────────────────────────────────────────────────────┐
│ AI Logic                                      [+ Thêm mới] │
├─────────────────────────────────────────────────────────────┤
│ 🔵 Tuần tra chuồng 1                      [Bật] [▶] [✎] [🗑]│
│    Trigger: schedule 0 6 * * * (6:00 daily)                │
│    Steps: 1. Goto preset #1 → Record 10s                   │
│           2. Goto preset #2                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Reused Patterns

- `automation_service.py` - schedule evaluation loop, croniter usage
- `preset_service.py` - `goto_preset()` via PTZ controller
- `recording_service.py` - `start_recording()`, `stop_recording()`
- `static/js/pages/automation.js` - Vue component modal form pattern