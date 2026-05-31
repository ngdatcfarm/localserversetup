# Doihong Architecture

## Overview

Doihong là hệ thống farm management với 2 domain chính:

| Domain | Port | Content | Purpose |
|--------|------|---------|---------|
| `quanly.doihong.io.vn` | 8002 | Local Farm UI | Quản lý trang trại |
| `doihong.io.vn` | 8003 | Landing Page | Branding |

## Public Domains

| Domain | Port | Source Directory | Purpose |
|--------|------|------------------|---------|
| `quanly.doihong.io.vn` | 8002 | `C:\Local server` | Farm management UI |
| `doihong.io.vn` | 8003 | `E:\doihong-cfarm` | Branding / Landing page |

Cả 2 đều expose qua Cloudflare Tunnel - không cần mở port router.

## MQTT Remote Control Flow

```
Remote User → doihong.io.vn (Cloudflare Tunnel) → Local Server:8002
                                                 ↓
                                          Cloud MQTT Broker
                                          (103.166.183.215:1883)
                                                 ↓
                                           ESP32 Devices
```

**Không cần mở port vì:**
- `cloudflared` kết nối **ra** (outbound) tới Cloudflare edge
- Local server nhận HTTP request, publish command lên cloud MQTT broker
- ESP32 devices subscribe cloud MQTT để nhận commands

**Local server là cầu nối:**
1. Nhận HTTP request từ user qua Cloudflare tunnel
2. Translate command và publish lên cloud MQTT broker
3. Devices nhận command qua cloud MQTT

## Architecture Diagram

```
Internet
    |
    v
Cloudflare Tunnel (cloudflared outbound - không cần port forwarding)
    |
    v
doihong.io.vn (DNS + Hostname Routes)
    |
    +-- quanly.doihong.io.vn --> localhost:8002 (FastAPI - Farm UI)
    |
    +-- doihong.io.vn --> localhost:8003 (Python HTTP - Landing)
```

## MQTT Architecture

| Component | Connection | Purpose |
|-----------|------------|---------|
| Local MQTT (`mqtt_client.py`) | `192.168.1.9:1884` | Local devices trong LAN |
| Cloud MQTT (`cloud_mqtt_client.py`) | `103.166.183.215:1883` | Remote control via internet |
| ESP32 Devices | Dual-subscribe | Nghe cả local và cloud MQTT |

Commands từ remote user đi: HTTP → Local Server → Cloud MQTT Broker → ESP32

## Local Server Setup

### Services Running

| Service | Port | Command |
|---------|------|---------|
| FastAPI (Farm) | 8002 | `uvicorn src.server.main:app` |
| Python HTTP (Landing) | 8003 | `python -m http.server 8003` |
| Cloudflared Tunnel | - | `cloudflared.exe tunnel run --token <token>` |

### Service Reliability (NSSM + Guardian)

All services run under Windows Service (NSSM) with Guardian wrapper scripts for proactive health monitoring.

#### Architecture

```
Windows Service (NSSM)
├── CFarmFastAPI    → wrapper_fastapi.py → uvicorn (port 8002)
├── CFarmLanding    → guardian.py → python http.server (port 8003)
└── CFarmTunnel     → wrapper_cloudflared.py → cloudflared.exe tunnel run

Guardian Scripts:
- Monitor services every 30-60 seconds
- Auto-restart on crash
- Log to files for diagnostics
```

#### Guardian Scripts

| Service | Script | Log File |
|---------|--------|----------|
| FastAPI | `C:/Local server/scripts/wrapper_fastapi.py` | `C:/Local server/logs/guardian_fastapi.log` |
| Landing | `E:/doihong-cfarm/guardian.py` | `E:/doihong-cfarm/logs/guardian_landing.log` |
| Cloudflared Tunnel | `C:/Local server/scripts/wrapper_cloudflared.py` | `C:/Local server/logs/guardian_cloudflared.log` |

#### Health Monitoring

| Service | Method | Interval | On Failure |
|---------|--------|----------|------------|
| FastAPI | `GET /health` | 30s | Restart |
| Landing | TCP port check | 30s | Restart |
| Cloudflared | NSSM watchdog | On crash | Restart |

#### Installation (NSSM)

1. Download NSSM from https://nssm.cc/download and extract to `C:\tools\nssm\`
2. Register services:
```cmd
nssm install CFarmFastAPI "C:\Python\python.exe" "C:/Local server/scripts/wrapper_fastapi.py"
nssm set CFarmFastAPI AppDirectory "C:/Local server"
nssm set CFarmFastAPI Start SERVICE_AUTO_START

nssm install CFarmLanding "C:\Python\python.exe" "E:/doihong-cfarm/guardian.py"
nssm set CFarmLanding AppDirectory "E:/doihong-cfarm"
nssm set CFarmLanding Start SERVICE_AUTO_START

nssm install CFarmTunnel "C:\Python\python.exe" "C:/Local server/scripts/wrapper_cloudflared.py"
nssm set CFarmTunnel AppDirectory "C:/Local server"
nssm set CFarmTunnel Start SERVICE_AUTO_START
```

3. Configure Windows Service Recovery:
```cmd
sc failure CFarmFastAPI reset= 86400 actions= restart/5000/restart/10000/restart/30000
sc failure CFarmLanding reset= 86400 actions= restart/5000/restart/10000/restart/30000
sc failure CFarmTunnel reset= 86400 actions= restart/5000/restart/10000/restart/30000
```

4. Start services:
```cmd
net start CFarmFastAPI
net start CFarmLanding
net start CFarmTunnel
```

#### Verification

```powershell
# Check endpoints
Invoke-WebRequest -Uri "http://localhost:8002/health"
Invoke-WebRequest -Uri "http://localhost:8003"

# Check logs
type C:\Local server\logs\guardian_fastapi.log
type E:\doihong-cfarm\logs\guardian_landing.log

# Check NSSM services
nssm status CFarmFastAPI
nssm status CFarmLanding
nssm status CFarmTunnel
```

### Cloudflare Tunnel Token

```
eyJhIjoiOGE1ZWJhOGY1YmRiNWZiZDYzOGIzNTM1ZTQ0NDIzMDYiLCJ0IjoiNzU5YWVhNmUtMGU4My00ZTc1LWFmNWEtYzNjNTJiNWQ0YzI0IiwicyI6IlpXUmpaR1JrTkdNdFpUSm1PUzAwT0RSbUxUaGtZelV0WkRsaE1USmtPRFJsT0ROaCJ9
```

### Restart After Outage

Services are configured to auto-start via NSSM. For manual restart:

```bash
# Check service status
nssm status CFarmFastAPI
nssm status CFarmLanding
nssm status CFarmTunnel

# Start services (if stopped)
net start CFarmFastAPI
net start CFarmLanding
net start CFarmTunnel

# Or restart a specific service
nssm restart CFarmFastAPI
```

**Alternative (manual process start if NSSM not configured):**

```bash
# 1. Cloudflare Tunnel
cd C:\Users\nguye
cloudflared.exe tunnel run --token eyJhIjoiOGE1ZWJhOGY1YmRiNWZiZDYzOGIzNTM1ZTQ0NDIzMDYiLCJ0IjoiNzU5YWVhNmUtMGU4My00ZTc1LWFmNWEtYzNjNTJiNWQ0YzI0IiwicyI6IlpXUmpaR1JrTkdNdFpUSm1PUzAwT0RSbUxUaGtZelV0WkRsaE1USmtPRFJsT0ROaCJ9

# 2. Python Landing Server (trong CMD khác)
cd E:\doihong-cfarm
python -m http.server 8003

# 3. FastAPI Farm Server (nếu không chạy)
cd C:\Local server
uvicorn src.server.main:app --host 0.0.0.0 --port 8002
```

## DNS Configuration

### Cloudflare DNS Records

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | quanly | 192.0.2.1 | ON |
| CNAME | doihong.io.vn | doihong.io.vn.cfargotunnel.com | ON |

### Hostname Routes (Cloudflare Tunnel)

| Hostname | Service |
|----------|---------|
| `doihong.io.vn` | `http://localhost:8003` |
| `quanly.doihong.io.vn` | `http://localhost:8002` |

## Cloud Server (app.cfarm.vn)

Cloud server vẫn hoạt động như backup và data sync hub.

### Backup Functions
- IoT relay control via MQTT
- Historical data view (synced from local)
- Push notifications

### Care Proxy
Cloud care page (`/care`) proxy đến `quanly.doihong.io.vn` thay vì 192.168.1.9.

## File Locations

| Path | Purpose |
|------|---------|
| `C:\Local server` | Local server code (FastAPI) |
| `E:\doihong-cfarm` | Landing page files (branding) | Landing page files |

## Landing Page Structure (`E:\doihong-cfarm\`)

```
doihong-cfarm/
├── index.html          # Main landing page
├── css/
│   └── styles.css       # Design system & responsive styles
├── js/
│   └── main.js          # Interactions: lightbox, sensor fetch, scroll animations
├── images/
│   ├── README.md        # Image requirements
│   ├── farm-aerial.jpg  # Hero image (required)
│   ├── chicken-free-range.jpg
│   ├── persimmon-trees.jpg
│   ├── stream-nature.jpg
│   └── forest-edge.jpg
└── videos/
    └── README.md       # Video requirements
```

## Design System

| Token | Value | Usage |
|-------|-------|-------|
| `--color-earth` | `#2c3e1f` | Dark green - headings |
| `--color-leaf` | `#4a7c3f` | Medium green - accent |
| `--color-moss` | `#7d9a6a` | Light green - labels |
| `--color-cream` | `#f8f6f1` | Background |
| `--color-stone` | `#9a948a` | Muted text |
| `--font-heading` | Space Grotesk | Headings |
| `--font-body` | Be Vietnam Pro | Body text |

## Features

| Feature | Implementation | Status |
|---------|---------------|--------|
| Scroll animations | Intersection Observer API | ✅ Done |
| Photo lightbox | Custom JS modal | ✅ Done |
| Live sensor data | Fetch from local server API | ✅ Done |
| Responsive | CSS Grid + Flexbox | ✅ Done |
| Photo gallery | CSS Grid layout | ✅ Done |
| `C:\Users\nguye\cloudflared.exe` | Cloudflare tunnel binary |
| `C:\dev\cfarm.vn` | Cloud server code |

## Cloudflare Account

- Email: ngdat612@gmail.com
- Domain: doihong.io.vn
- Tunnel: connection-cloud (ID: 759aea6e-0e83-4e75-af5a-c3c52b5d4c24)

## Landing Page Strategy (doihong.io.vn:8003)

**Định hướng:** Visual-first, kể chuyện trước, product sau.

### Positioning
- "Ghi chép quá trình xây dựng farm hữu cơ tại Hải Dương"
- Không bán sản phẩm - là storytelling page
- Tôn vinh thiên nhiên và quá trình

### Visual Elements

| Element | Source | Content |
|---------|--------|---------|
| Hero Image | Static | Toàn cảnh farm |
| Farm Gallery | `quanly.doihong.io.vn` cameras hoặc static images | Hình ảnh thực từ farm |
| Live Sensor Widget | Fetch từ `/api/sensors/latest` | Nhiệt độ, độ ẩm, pH |
| Timeline | Static + content từ blog | Lộ trình phát triển |
| Landscape Grid | Static | Cảnh quan farm |

### Data Integration Points

| API Endpoint | Usage |
|--------------|-------|
| `GET /api/sensors/latest` | Live environmental data (temp, humidity) |
| `GET /api/cameras/status/all` | Camera online status |
| Camera snapshots | Hiển thị farm real-time |

### Tech Stack Hiện Tại
- HTML/CSS thuần
- `python -m http.server 8003` - đơn giản nhưng hạn chế

### Roadmap Phát Triển

**Phase 1: Visual Polish**
- [ ] Thêm hero video loop ngắn (15-30s)
- [ ] Photo gallery với lightbox
- [ ] CSS animations cho scroll reveal

**Phase 2: Dynamic Content**
- [ ] Fetch live sensor data qua JS
- [ ] Camera snapshot integration
- [ ] Auto-refresh data every 5 minutes

**Phase 3: Storytelling**
- [ ] Blog/daily log section
- [ ] Journey timeline với milestones
- [ ] Photojournal updates

**Phase 4: Community (future)**
- [ ] Newsletter signup
- [ ] Farm updates notifications
- [ ] Product showcase (khi ready)

### Design System

```css
Colors:
  --color-earth: #2c3e1f    (dark green)
  --color-leaf: #4a7c3f     (medium green)
  --color-moss: #7d9a6a     (light green)
  --color-cream: #f8f6f1    (background)
  --color-stone: #9a948a    (muted text)
  --color-water: #5a7c8a    (accent)

Fonts:
  Heading: 'Space Grotesk'
  Body: 'Be Vietnam Pro'
```

## Security Notes

- DNS Proxy ON cho cả 2 subdomain
- SSL/TLS: Full mode
- Cloudflare handles DDoS protection
- Local firewall: chỉ cho phép Cloudflare IPs