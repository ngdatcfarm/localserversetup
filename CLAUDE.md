# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CFarm is a Vietnamese IoT farm management system — local-first FastAPI + Vue 3 SPA managing ESP32 sensors (MQ135/MQ137), IP cameras (RTSP/PTZ), automation, barn/cycle tracking, inventory, and cloud sync. Runs on Windows at `E:\cfarm`.

## Common Commands

### Start/Stop the Stack
```bash
cfarm.bat                 # START everything (Docker + Guardian + services)
cfarm.bat stop            # STOP all services
cfarm.bat restart         # RESTART all
cfarm.bat status          # CHECK status

# Guardian control
python scripts/guardian_control.py start|stop|restart|status|health|watch
python scripts/guardian_control.py service <name> start|stop|restart
python scripts/guardian_control.py dev on|off|status
```

### Run the Server Directly (for development)
```bash
python -m uvicorn src.server.main:app --host 0.0.0.0 --port 8002
```

### Database Migrations
```bash
python run_all_new_migrations.py    # Run all SQL migrations (013-055)
```

### Tests
```bash
pytest tests/test_project_smoke.py   # Smoke tests (camera config, PTZ, camera manager)
```

### Docker (MQTT broker + TimescaleDB)
```bash
docker-compose up -d       # Start containers
docker-compose down        # Stop containers
```

## Architecture

### Backend (`src/`)

- **`src/server/main.py`** — FastAPI app entry point. Mounts all routers, configures DB/MQTT/cameras on startup, serves the Vue 3 SPA. Uses `NoCacheStaticFiles` to prevent browser caching of JS/CSS.
- **`src/server/routes/`** — 30+ route modules, each exporting a FastAPI `APIRouter`. Key routers: `auth.py`, `farm.py`, `farm_extended.py`, `devices.py`, `bats.py`, `equipment.py`, `sync.py`, `cameras.py`.
- **`src/server/auth.py`** — Session auth via signed cookie (`itsdangerous.TimestampSigner`). `require_auth`/`require_admin` dependencies.
- **`src/services/database/db.py`** — Singleton asyncpg connection pool (`Database.get_instance()`). Configured from `cameras.yaml`. Use `db.fetch()`, `db.fetchval()`, `db.execute()`, or `db.transaction()` for atomic multi-statement operations.
- **`src/iot/`** — MQTT client/listener, device service, automation, alerts, push notifications, curtain/bat control, MQ sensor tare calibration, AI logic.
- **`src/cameras/`** — RTSP stream capture, camera manager, PTZ control, MJPEG streaming.
- **`src/farm/`** — Farm management services (barns, cycles, care, inventory, feeds, medications, vaccines, suppliers).
- **`src/sync/`** — Cloud sync service (local ↔ cloud bidirectional sync).
- **`src/ml/`** — ML models for gas anomaly detection, temperature prediction, YOLO chicken detection.

### Frontend (`static/`)

No build step. Vanilla ES modules loaded via native `import()`.

- **`static/js/app.js`** — Vue 3 app with hash-based router (`createWebHashHistory`). `loadPage(name)` does dynamic `import()` of `/static/js/pages/{name}.js` with cache-busting timestamp.
- **`static/js/api.js`** — Fetch wrapper with `credentials: 'same-origin'`. Dispatches `auth:unauthorized` CustomEvent on 401.
- **`static/js/pages/*.js`** — ~35 page modules. **Each MUST use `export default { ... }` at the top level** — never a top-level `return`. They are ES modules loaded via `import()`.
- **`static/css/app.css`** — All custom styles (~150KB). Tailwind is in `static/vendor/tailwind.min.css`.
- **`static/vendor/`** — Vendored libs (Vue 3, Vue Router, Tailwind). No npm/node.
- **`src/server/templates/farm.html`** — HTML shell that loads Vue 3, Vue Router, Tailwind, api.js, app.js.

### Infrastructure

- **`scripts/guardian.py`** — Process supervisor managing 3 services: `app_8002` (FastAPI), `app_8003` (branding), `cloudflared` (Cloudflare tunnel). 4-layer auto-restart stack (shell:startup shortcut → watchdog → Task Scheduler → in-process self-respawn).
- **`scripts/guardian_watchdog.py`** — Polls guardian PID every 5s, restarts if dead (max 20/hour).
- **`scripts/wrapper_fastapi.py`** — Wraps uvicorn for guardian management (stdout/stderr logging, PID tracking).
- **`config/cameras.yaml`** — Main runtime config: server, MQTT, database, cameras, PTZ presets, VAPID keys, recording/snapshot paths.
- **`docker-compose.yml`** — Mosquitto MQTT (port 1884/9001) + TimescaleDB (port 5432).
- **`scripts/*.sql`** — 54 migration files (002-055). Idempotent with `DO $$ ... EXCEPTION WHEN OTHERS` blocks.

### Startup Sequence (`main.py` startup event)

1. Connect TimescaleDB (asyncpg pool, 2-10 connections)
2. Connect MQTT broker (port 1884)
3. Start MQTT listener (ESP32 messages → DB)
4. Start background services: offline device detection (60s), automation, alerts, vaccine/care/weight notifications, AI logic, cloud sync
5. Configure push notifications (VAPID)
6. Reconcile MQ tare sessions
7. Load curtain configs
8. Register camera frame callbacks (MJPEG, recording, snapshots)
9. Start enabled cameras (RTSP streams)
10. Serve Vue 3 SPA at `/`

## Key Conventions

### Page File Pattern
Each page module in `static/js/pages/` exports a default Vue 3 component object:
```js
export default {
    props: {},       // route props if using props: true in router
    setup(props) { ... },
    template: `...`  // template literal string
}
```
Pages use `API.get()`/`API.post()` from `api.js` for backend calls. UI text is in Vietnamese.

### Dashboard → Detail Pattern
Dashboards (inventory, bats) use two pages: a dashboard page showing cards per entity, and a detail page receiving the parent ID as a route prop (`props: true` in `app.js`). Detail pages use `router.replace()` to keep URL in sync.

### Template Literal Pitfall
Page templates are JS template literals. `\n` inside them becomes a real newline. To produce the literal JS escape `'\n'` in a Vue directive, write `'\\n'` in the source:
```html
<!-- BROKEN: \n becomes a real newline -->
:title="(reasons).join('\n')"
<!-- FIXED: escaped backslash -->
:title="(reasons).join('\\n')"
```

### Database Operations
Use `db.transaction()` for multi-statement atomic operations — never chain separate `db.execute()` calls expecting atomicity. Each `db.execute()` acquires an independent connection from the pool.

### Auth System
- Session cookie `cfarm_session` (HttpOnly, SameSite=Lax, 7-day rolling TTL)
- Default user: `admin`/`admin` (must change on first login)
- Open routes (no auth): `/health`, `/api/auth/*`, `/api/sync/*`, `/api/firmware/*`, `/stream/*`, `/static/*`, `/snapshots/*`, `/dataset/*`, `/sw.js`, `/cfarm.crt`
- Rate limit: 5 failed logins per (username+ip) per 60s

### MQTT Topics
- ESP32 devices publish sensor data on topics like `cfarm/{device_id}/telemetry`
- Server sends commands on `cfarm/{device_id}/command`
- MQTT port 1884 for devices (authenticated), port 1883 for server (anonymous)

## Environment Variables (`.env`)

| Variable | Purpose |
|----------|---------|
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare tunnel auth |
| `CFARM_SESSION_SECRET` | Cookie signing key |
| `CFARM_COOKIE_SECURE` | Set to `1` for HTTPS cookie flag |
| `ANTHROPIC_API_KEY` | AI features |

## Port Map

| Port | Service |
|------|---------|
| 8002 | FastAPI main app |
| 8003 | Branding app |
| 1884 | MQTT broker (devices, authenticated) |
| 1883 | MQTT broker (server, anonymous) |
| 9001 | MQTT WebSocket |
| 5432 | TimescaleDB |
| 2000 | Cloudflared metrics |
