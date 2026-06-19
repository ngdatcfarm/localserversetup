# Cloudflare Tunnel & iOS PWA — Hướng dẫn vận hành

> **Cập nhật:** 2026-06-19
> **Áp dụng cho:** CFarm Local Server, Cloudflare Zero Trust Tunnel `doihong.io.vn`

---

## 1. Tổng quan kiến trúc

```
┌─────────────┐    HTTPS (LAN)   ┌──────────────────┐
│  ESP32 IoT  │ ───────────────► │  Local Server    │
│  sensors    │   MQTT 1884      │  FastAPI :8002   │
└─────────────┘                  └────────┬─────────┘
                                          │
                                          │ HTTP localhost
                                          ▼
                                 ┌──────────────────┐
                                 │   cloudflared    │
                                 │   (system svc)   │
                                 └────────┬─────────┘
                                          │ Encrypted QUIC
                                          ▼
                                 ┌──────────────────┐
                                 │  Cloudflare Edge │
                                 │  doihong.io.vn   │
                                 └────────┬─────────┘
                                          │ HTTPS (CA cert)
                                          ▼
                          ┌────────────────────────────┐
                          │ iPhone / iPad / Android / PC │
                          └────────────────────────────┘
```

**Lợi ích:**
- Cloudflare cấp **chứng chỉ CA hợp lệ** cho `doihong.io.vn` → iOS Safari tin tưởng (không còn cảnh báo self-signed)
- iOS Web Push hoạt động khi user **Add to Home Screen** (PWA), thay vì phải dùng FCM
- Truy cập từ bên ngoài LAN không cần mở port router

---

## 2. Files liên quan

| File | Vai trò |
|---|---|
| `cloudflared/config.yml` | Cấu hình tunnel (ingress rules, credentials path) |
| `cloudflared.exe` | Binary cloudflared (chưa commit — quá lớn) |
| `scripts/wrapper_cloudflared.py` | Guardian theo dõi tunnel, auto-restart |
| `scripts/guardian.py` | Service supervisor chính (cũng start cloudflared) |
| `scripts/diagnose_tunnel.ps1` | Diagnostic nhanh |
| `.env.example` | Template cho các biến môi trường nhạy cảm |

**KHÔNG commit:**
- `~/.cloudflared/<tunnel-id>.json` (credentials)
- `cloudflared/credentials.json`
- `.env`

Tất cả đã được thêm vào `.gitignore`.

---

## 3. Lần đầu thiết lập (đã làm)

### 3.1 Tạo tunnel

Trên Cloudflare dashboard:
1. **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**
2. Type: **Cloudflared**
3. Name: `cfarm` (hoặc tên bất kỳ)
4. Copy **token** (JWT-like, bắt đầu bằng `eyJh...`)

### 3.2 Cấu hình ingress

Vào tunnel vừa tạo → tab **Public Hostname**:
- Subdomain: `doihong`
- Domain: `io.vn`
- Service: `http://localhost:8002`

### 3.3 Set biến môi trường (Windows)

```powershell
# User-level env (persistent, an toàn hơn System-level)
[Environment]::SetEnvironmentVariable("CLOUDFLARE_TUNNEL_TOKEN", "eyJh...", "User")
[Environment]::SetEnvironmentVariable("CFARM_SESSION_SECRET", "chuỗi-random-32-ký-tự", "User")
[Environment]::SetEnvironmentVariable("CFARM_COOKIE_SECURE", "1", "User")

# Reload để session hiện tại thấy:
$env:CLOUDFLARE_TUNNEL_TOKEN = [Environment]::GetEnvironmentVariable("CLOUDFLARE_TUNNEL_TOKEN", "User")
```

### 3.4 Khởi động thủ công (test)

```powershell
cd C:\Users\nguye
.\cloudflared.exe tunnel --config "E:\CFarm\cloudflared\config.yml" run
```

Hoặc legacy (fallback):
```powershell
.\cloudflared.exe tunnel run --token $env:CLOUDFLARE_TUNNEL_TOKEN
```

---

## 4. Vận hành hàng ngày

### 4.1 Kiểm tra trạng thái

```powershell
# Tunnel process
Get-Process cloudflared

# Health endpoint của local server
Invoke-WebRequest http://localhost:8002/health | Select-Object statuscode

# Health endpoint qua tunnel
Invoke-WebRequest https://doihong.io.vn/health | Select-Object statuscode

# Cloudflared metrics (localhost:2000 = dashboard config)
Invoke-WebRequest http://localhost:2000/api/status
```

### 4.2 Restart tunnel

```powershell
# Cách 1: Kill + guardian tự start lại
taskkill /F /IM cloudflared.exe
# wrapper_cloudflared.py sẽ detect sau ~90s và restart

# Cách 2: Restart thủ công ngay
taskkill /F /IM cloudflared.exe
Start-Process -FilePath "C:\Users\nguye\cloudflared.exe" `
    -ArgumentList "tunnel","--config","E:\CFarm\cloudflared\config.yml","run" `
    -RedirectStandardOutput "C:\Local server\logs\cloudflared.out.log" `
    -RedirectStandardError "C:\Local server\logs\cloudflared.err.log"
```

### 4.3 Đọc log

```powershell
# Cloudflared
Get-Content "C:\Local server\logs\cloudflared.log" -Tail 50

# Guardian cloudflared
Get-Content "C:\Local server\logs\guardian_cloudflared.log" -Tail 30
```

---

## 5. Rotate tunnel token

> ⚠️ **Lý do rotate**: Token bị commit vào git (commit `ddf25aa`, file `scripts/wrapper_cloudflared.py`).
> Bất kỳ ai có quyền đọc repo đều thấy token → có thể mạo danh tunnel.

### Quy trình

1. Vào https://one.dash.cloudflare.com/ → **Zero Trust** → **Networks** → **Tunnels**
2. Click tunnel → tab **Configure**
3. Trong phần **Token** (hoặc **Install connector**), click **Rotate** / **New token**
4. Copy token mới
5. Update env var:
   ```powershell
   [Environment]::SetEnvironmentVariable("CLOUDFLARE_TUNNEL_TOKEN", "TOKEN_MỚI", "User")
   ```
6. Restart cloudflared (xem 4.2)
7. Verify tunnel lên lại: `Invoke-WebRequest https://doihong.io.vn/health`
8. **Quan trọng**: Xóa token cũ khỏi git history nếu có thể:
   ```bash
   # Cẩn thận: rewrite history, làm hỏng mọi fork/clone
   git filter-repo --invert-paths --path scripts/wrapper_cloudflared.py
   git push --force
   ```
   Hoặc đơn giản hơn: chấp nhận token cũ đã được rotate = vô hiệu hóa vĩnh viễn.

---

## 6. iOS Web Push (qua PWA)

### Điều kiện tiên quyết

| Điều kiện | Trạng thái |
|---|---|
| HTTPS hợp lệ | ✅ Qua Cloudflare (`doihong.io.vn`) |
| `manifest.json` hợp lệ | ✅ `static/manifest.json` |
| Service Worker | ✅ `static/sw.js` v2 |
| Apple-touch-icon | ✅ `static/icons/icon-192.png`, `icon-512.png` |
| iOS ≥ 16.4 | Yêu cầu phía user |

### Hướng dẫn cho user (hiện đã có modal tự động)

1. Mở `https://doihong.io.vn` bằng **Safari** (không phải Chrome iOS)
2. Nhấn nút **Chia sẻ** (hình vuông với mũi tên lên) ở thanh dưới
3. Chọn **Thêm vào màn hình chính**
4. Mở app "CFarm" từ Home Screen (KHÔNG phải từ Safari tab)
5. Khi có alert, app sẽ xin quyền notification → chọn **Cho phép**
6. Từ lần sau, thông báo sẽ hiện trên lock screen

### Test push trên iOS

1. Mở app CFarm đã cài
2. Tab **Cảnh báo** → tab **Thông báo** → nhấn **Test push**
3. Nếu thấy notification hiện → OK
4. Nếu không thấy:
   - Kiểm tra app đã mở từ Home Screen (không phải Safari)
   - iOS Settings → CFarm → Notifications → Bật

---

## 7. Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `530` từ `https://doihong.io.vn` | Tunnel mất kết nối | Xem log `cloudflared.log`, restart tunnel |
| `502` / `504` | Tunnel OK nhưng local server down | `Invoke-WebRequest http://localhost:8002/health` |
| iOS không thấy "Add to Home Screen" | Đang dùng Chrome iOS | Phải dùng Safari |
| Web Push không hoạt động trên iOS | App mở từ Safari thay vì Home Screen | Mở lại từ Home Screen |
| SW không update được | Browser cache cũ | DevTools → Application → Service Workers → Unregister |
| Token expired | Cloudflare rotated | Xem mục 5 |
| Metrics API không trả lời | `metrics:` thiếu trong config.yml | Kiểm tra `cloudflared/config.yml` có dòng `metrics: localhost:2000` |

---

## 8. Backup & Recovery

### Backup những gì?

- `cloudflared/config.yml` ✅ (đã trong git)
- Tunnel credentials JSON ❌ (KHÔNG trong git — phải backup riêng)
  ```powershell
  Copy-Item "C:\Users\nguye\.cloudflared\*.json" "F:\Backup\cloudflared-credentials\"
  ```
- Env vars → nên document lại trong password manager (1Password / Bitwarden)

### Disaster recovery

Nếu mất cả server + tunnel credentials:
1. Vào Cloudflare dashboard → Tunnel → Rotate token
2. Lấy token mới
3. Trên server mới:
   ```bash
   git clone <repo>
   cd E:\CFarm
   # Restore credentials JSON từ backup, hoặc rotate lại
   cloudflared tunnel login
   cloudflared tunnel run cfarm  # sẽ dùng config.yml + creds từ login
   ```

---

## 9. Metrics & Monitoring

### Cloudflared metrics endpoint

URL: `http://localhost:2000/api/status`

Trả về JSON gồm:
```json
{
  "tunnel": {"state": "healthy", "connections": 3},
  "connections": [...],
  "version": "2024.x.y"
}
```

Có thể scrape bằng Prometheus exporter hoặc đơn giản là health-check script định kỳ.

### Guardian log format

`C:\Local server\logs\guardian_cloudflared.log`:
```
2026-06-19 14:05:01 [INFO] Health check OK (local=OK, tunnel=OK)
2026-06-19 14:05:31 [WARNING] Health check FAILED (#1): Tunnel external check failed
2026-06-19 14:06:01 [WARNING] Health check FAILED (#2): ...
2026-06-19 14:06:31 [ERROR] === CONSECUTIVE FAILURES (3), triggering restart ===
2026-06-19 14:06:31 [WARNING] === RESTARTING CLOUDFLARED (failure #3, restart #1) ===
```

Sau **3 lần fail liên tiếp** (mỗi 30s) → guardian restart tunnel. Max **10 lần restart** rồi sleep 180s trước khi thử lại.

---

## 10. Tài liệu tham khảo

- Cloudflare Tunnel docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- iOS Web Push (16.4+): https://webkit.org/blog/13869/web-push-for-web-apps-on-ios-and-ipados/
- Web App Manifest spec: https://www.w3.org/TR/appmanifest/
- Service Worker API: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API

---

## Changelog

### 2026-06-19
- ✏️ Remove hardcoded token from `scripts/wrapper_cloudflared.py`, switch to env var
- ➕ Create `cloudflared/config.yml` (preferred over --token flag)
- ➕ Create `.env.example` template + update `.gitignore`
- ➕ iOS PWA support: meta tags, install hint, service worker v2 (offline cache)
- ➕ Initial version of this document
