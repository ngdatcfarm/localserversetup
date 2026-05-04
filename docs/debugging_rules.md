# Debugging Rules - Notification System

## Khi gặp lỗi "value too long for type character varying(100)"

### Nguyên nhân
Thường do endpoint Push Subscription (Mozilla/Firefox Push Service) quá dài (~230 ký tự) nhưng cột trong database chỉ VARCHAR(100).

### Cách debug
1. Kiểm tra log: `grep -a "Failed to send" /tmp/server_log.txt`
2. Stack trace sẽ cho biết chính xác dòng lệnh gây lỗi
3. Thêm debug logging vào notification_service.send_to_all()

### Cách fix đã áp dụng

**1. Truncate endpoint trong DELETE statement (notification_service.py)**
```python
# Clean up expired subscriptions
for ep in failed_endpoints:
    try:
        ep_safe = ep[:100] if ep else ""  # Truncate to 100 chars
        await db.execute("DELETE FROM push_subscriptions WHERE endpoint = $1", ep_safe)
    except Exception as delete_err:
        logger.error(f"Failed to remove expired subscription...")
```

**2. Truncate title/body trước khi insert notification_history**
```python
# Truncate title/body to prevent VARCHAR(100) overflow in notification_history
safe_title = title[:100] if title else ""
safe_body = body[:500] if body else ""
await db.execute("INSERT INTO notification_history (type, title, body, ...) VALUES ($1, $2, $3, ...)",
    notification_type, safe_title, safe_body, ...)
```

**3. Truncate title/body trong các notification services**
- care_notification_service.py - `_send_feed_reminder()`, `_send_medication_reminder()`
- weight_notification_service.py - `_send_weight_reminder()`
- vaccine_notification_service.py - notification sending

## Khi gặp lỗi "column X does not exist"

### Nguyên nhân
Code reference một column không tồn tại trong local schema (do schema đồng bộ từ cloud không có column đó).

### Cách xử lý

**1. Wrap query trong try/except và fallback**
```python
async def get_vaccines_due_for_notification(self) -> list[dict]:
    try:
        rows = await db.fetch("""SELECT ... WHERE notified_at IS NULL ...""")
        return [dict(r) for r in rows]
    except Exception as e:
        if "notified_at" in str(e) and "does not exist" in str(e):
            logger.warning("vaccine_schedules.notified_at column missing, using fallback query")
            rows = await db.fetch("""SELECT ... (without notified_at filter)""")
            return [dict(r) for r in rows]
        raise
```

**2. Handle mark_notified khi column không tồn tại**
```python
async def mark_notified(self, schedule_id: int):
    try:
        await db.execute("UPDATE vaccine_schedules SET notified_at = NOW() WHERE id = $1", schedule_id)
    except Exception as e:
        if "notified_at" in str(e) and "does not exist" in str(e):
            logger.warning(f"vaccine_schedules.notified_at missing, skipping mark_notified for {schedule_id}")
        else:
            raise
```

## Khi restart server trên Windows

### Vấn đề
Python Windows Store version không hoạt động với `python run_server.py` từ bash.

### Cách fix
```bash
# Kill all python processes
taskkill //F //IM python.exe
taskkill //F //IM python3.12.exe

# Clear Python cache
find /c/Local/server -name "*.pyc" -delete
find /c/Local/server -name "__pycache__" -type d -exec rm -rf {} +

# Start server
cd "/c/Local server" && python run_server.py > /tmp/server_log.txt 2>&1 &
```

## Architecture Notes

### Notification Flow
1. Local notification service kiểm tra điều kiện (feed, weight, vaccine)
2. Gửi push notification đến local subscribers qua webpush
3. Gửi notification lên cloud qua `sync_service.send_notification_to_cloud()`
4. Cloud lưu vào notification_logs và gửi đến iPhone subscribers

### Sync Queue
- Table: `sync_queue`
- Các thay đổi được queue và sync lên cloud định kỳ (60s)
- Có trigger tự động thêm vào queue khi có thay đổi

### Các loại Notification
- `ALERT_DANGER`, `ALERT_WARNING`, `ALERT_INFO` - từ alert_service
- `CARE_FEED_MISSING` - từ care_notification_service (sáng/chiều)
- `CARE_MEDICATION_REMINDER` - từ care_notification_service
- `WEIGHT_REMINDER` - từ weight_notification_service
- `VACCINE_REMINDER` - từ vaccine_notification_service
