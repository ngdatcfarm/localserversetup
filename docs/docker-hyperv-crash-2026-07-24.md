# Docker Desktop Crash Investigation — 2026-07-24

## Tóm tắt

Docker Desktop bị treo vĩnh viễn — không thể recover bằng cách kill process + restart.
Chỉ Windows restart mới khắc phục được. Nguyên gốc: **mount namespace isolation bug**
trong Docker Desktop 4.80.0 khiến `wsl-bootstrap` không thấy containerd socket.

## Triệu chứng

- `docker info` / `docker ps` timeout vô hạn
- Docker Desktop UI hiển thị "Starting..." rồi treo
- `docker-compose ps` trả lỗi 500 Internal Server Error
- Kill process + `wsl --shutdown` + restart Docker Desktop → **vẫn treo**
- `wsl --terminate docker-desktop` → vẫn treo
- Unregister distro + tạo mới → **vẫn treo** (vì Hyper-V VM state không reset)
- **Windows restart → hoạt động bình thường**

## Root Cause: Mount Namespace Isolation

### Kiến trúc Docker Desktop trên WSL2

Docker Desktop dùng `wsl-bootstrap` làm init system bên trong Hyper-V VM.
Quy trình khởi động:

```
wsl-bootstrap (PID 13, outer namespace mnt:[4026532217])
  └─ unshare -mpf --propagation=unchanged   ← tạo namespace mới
      └─ initd (PID 42, inner namespace mnt:[4026532288])
          └─ containerd (PID 116, inner namespace)
              └─ dockerd (không bao giờ start)
```

### Vấn đề

`wsl-bootstrap` chờ socket tại `/run/containerd/containerd.sock` trước khi
launch `dockerd`. Nhưng socket chỉ tồn tại trong **inner namespace**:

```
/proc/116/root/run/containerd/containerd.sock  → TỒN TẠI (containerd tạo)
/proc/13/root/run/containerd/containerd.sock   → KHÔNG TỒN TẠI
```

So sánh `/run/` của 2 namespace:
- wsl-bootstrap (outer): 11 items — chỉ WSL cơ bản
- containerd (inner): 20+ items — docker.sock, containerd.sock, grpcfuse, etc.

`unshare -mpf --propagation=unchanged` tạo mount namespace mới nhưng giữ
propagation settings cũ. Mount trong inner namespace **không propagate** về
outer namespace. wsl-bootstrap không thấy socket → treo vĩnh viễn.

### Tại sao Windows restart thì OK?

Windows restart **destroy toàn bộ Hyper-V VM** → tạo mới từ scratch.
Quy trình init chạy đúng thứ tự: containerd tạo socket trước khi
wsl-bootstrap check. Khi `wsl --shutdown` + restart Docker Desktop,
có **race condition** — wsl-bootstrap check socket trước khi containerd
kịp tạo trong namespace đúng, hoặc namespace setup bị lỗi sau nhiều
lần restart liên tiếp.

### Bằng chứng chi tiết

```
# Mount namespace mismatch
PID 1  (init)          → mnt:[4026532217]  (outer)
PID 13 (wsl-bootstrap) → mnt:[4026532217]  (outer) ← chờ socket ở đây
PID 42 (initd)         → mnt:[4026532288]  (inner)
PID 116 (containerd)   → mnt:[4026532288]  (inner) ← socket ở đây

# Socket existence
stat /proc/116/root/run/containerd/containerd.sock → socket, 0 bytes
stat /proc/13/root/run/containerd/containerd.sock  → No such file

# Containerd file descriptors (chạy OK trong inner namespace)
fd 10 → /var/lib/desktop-containerd/daemon
fd 8  → /var/lib/desktop-containerd/daemon/io.containerd.metadata.v1.bolt/meta.db
fd 12 → socket:[12349]

# Docker data KHỎE (không bị corrupt)
/tmp/docker-desktop-root/var/lib/docker/              → intact
/tmp/docker-desktop-root/var/lib/desktop-containerd/  → intact
/tmp/docker-desktop-root/run/desktop-containerd/daemon/ → subdirs exist
```

## Docker Watchdog Fix

### Vấn đề với watchdog cũ

Watchdog cũ bị kẹt trong vòng lặp vô hạn:
```
Docker unresponsive → kill + restart → still dead → kill + restart → ...
(mỗi cycle ~5 phút, lặp mãi mãi, tốn CPU/IO)
```

### Fix: Hibernation mode

Thêm `failed_restart_cycles` counter. Khi 3 lần restart cycle liên tiếp
thất bại → vào HIBERNATION:

1. Ngừng restart hoàn toàn (không tốn tài nguyên)
2. Log cảnh báo mỗi 10 phút: "restart Windows to fix"
3. Vẫn poll `docker info` — nếu Docker tự recovery (user restart Windows)
   → reset counter, tiếp tục bình thường

Thay đổi trong `scripts/docker_watchdog.py`:
- `restart_docker()` giờ trả `bool` (True = recovered, False = still dead)
- Thêm `MAX_FAILED_RESTARTS = 3` và `HIBERNATION_LOG_INTERVAL = 600`
- Main loop track `failed_restart_cycles`, vào hibernation khi đạt threshold
- Hibernation vẫn monitor — auto-recover khi Docker hoạt động lại

### Flow mới

```
Docker unresponsive (3 lần) → restart cycle 1 → still dead
→ restart cycle 2 → still dead
→ restart cycle 3 → still dead
→ HIBERNATION: "restart Windows to fix"
→ poll mỗi 60s, nếu Docker OK → reset, tiếp tục bình thường
```

## Cải tiến tương lai

### 1. Detect namespace mismatch sớm (không cần restart cycle)

Thêm check trực tiếp vào watchdog — so sánh socket existence giữa
wsl-bootstrap namespace và containerd namespace:

```python
def detect_namespace_mismatch() -> bool:
    """Check if containerd socket is visible to wsl-bootstrap."""
    try:
        r = sp.run(
            ["wsl", "-d", "docker-desktop", "--",
             "test", "-S", "/proc/13/root/run/containerd/containerd.sock"],
            capture_output=True, timeout=10, creationflags=NO_WINDOW,
        )
        if r.returncode != 0:
            # Socket exists in containerd ns but not wsl-bootstrap ns
            r2 = sp.run(
                ["wsl", "-d", "docker-desktop", "--",
                 "test", "-S", "/proc/116/root/run/containerd/containerd.sock"],
                capture_output=True, timeout=10, creationflags=NO_WINDOW,
            )
            return r2.returncode == 0  # True = namespace mismatch confirmed
    except Exception:
        pass
    return False
```

Nếu detect mismatch → skip restart cycle, vào hibernation ngay.

### 2. Docker Desktop version pinning

Docker Desktop 4.80.0 có bug này. Cân nhắc:
- Pin version hiện tại nếu đang ổn định
- Test kỹ trước khi update major version
- Theo dõi changelog cho fix liên quan đến namespace

### 3. Health check nhanh hơn

Hiện tại watchdog poll mỗi 60s. Có thể giảm xuống 30s cho lần đầu
phát hiện (sau đó tăng interval khi stable).

### 4. Integration với guardian

Guardian.py quản lý app_8002, app_8003, cloudflared — nhưng không biết
Docker bị chết. Thêm Docker health check vào guardian:
- Nếu Docker unresponsive → log warning, không restart app (vì Docker chết
  thì app cũng không chạy được)
- Tránh guardian restart app liên tục khi Docker down

## Timeline sự kiện

| Thời gian | Sự kiện |
|-----------|---------|
| ~08:25 | Docker bắt đầu treo (docker-compose ps lỗi 500) |
| 08:25-09:23 | Nhiều lần kill + restart Docker Desktop → vẫn treo |
| 09:23 | Watchdog bắt đầu cycle restart liên tục |
| 09:23-10:30 | 4+ restart cycles thất bại |
| 10:30 | Watchdog vào HIBERNATION (code mới) |
| 10:32 | Log: "HIBERNATION: Hyper-V VM state is likely corrupted" |
| ~10:44 | User restart Windows → Docker recovery |
| 10:44 | Watchdog log: "Docker recovered after hibernation" |

## Environment

- Docker Desktop 4.80.0 (29.6.1)
- Windows 11 Home (10.0.26200)
- WSL2: docker-desktop distro, kernel 6.18.33.2
- `.wslconfig`: memory=4GB, autoMemoryReclaim=gradual, sparseVhd=true
