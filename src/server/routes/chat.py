"""Chat Query Routes - AI chat with Context Injection.

Uses MiniMax M2.7 via Anthropic-compatible API (same as Claude Code).
Supports Context Injection to provide real system data to AI.
"""

import os
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatQueryRequest(BaseModel):
    message: str
    model: Optional[str] = "MiniMax-M2.7"
    conversation_id: Optional[str] = None


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ReportDeviceIssueRequest(BaseModel):
    device_code: str
    issue_type: str  # 'offline', 'sensor_error', 'abnormal_reading'
    description: Optional[str] = None


# In-memory conversation storage (per session)
_conversations: dict[str, list[dict]] = {}

# Read-only DB pool for chatbot direct queries
_ro_pool = None


async def _get_ro_pool():
    """Get or create read-only DB pool for chatbot."""
    global _ro_pool
    if _ro_pool is None:
        import asyncpg
        _ro_pool = await asyncpg.create_pool(
            host='localhost',
            port=5432,
            database='cfarm_local',
            user='chatbot_read',
            password='chatbot_read_only_2026',
            min_size=2,
            max_size=5,
            command_timeout=30,
        )
    return _ro_pool


def _is_safe_sql(query: str) -> bool:
    """Validate query is a safe SELECT (no write operations)."""
    q = query.strip().upper()

    # Must start with SELECT
    if not q.startswith('SELECT'):
        return False

    # Block dangerous keywords
    blocked = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE',
        'ALTER', 'CREATE', 'GRANT', 'REVOKE', 'LOCK',
        'UNLOCK', 'COPY', 'PG_', 'INFORMATION_SCHEMA',
    ]
    for kw in blocked:
        if kw in q:
            return False

    # Block multiple statements
    if ';' in q.rstrip(';'):
        return False

    return True


def _get_anthropic_client():
    """Get Anthropic client configured for MiniMax M2.7."""
    api_key = os.environ.get("ANTHROPIC_AUTH_TOKEN")
    base_url = os.environ.get("ANTHROPIC_BASE_URL", "https://api.minimax.io/anthropic")

    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_AUTH_TOKEN not set in environment")

    from anthropic import Anthropic
    return Anthropic(
        api_key=api_key,
        base_url=base_url,
    )


async def _fetch_sensor_data() -> str:
    """Fetch latest sensor readings for context."""
    try:
        from src.services.database.db import db

        # Get latest sensor readings per device from sensor_data table
        rows = await db.fetch("""
            SELECT sd.device_id, sd.sensor_type, sd.value, sd.unit, sd.barn_id, sd.time,
                   d.device_code, d.name as device_name, b.name as barn_name
            FROM sensor_data sd
            JOIN devices d ON d.id = sd.device_id
            LEFT JOIN barns b ON b.id = sd.barn_id
            WHERE sd.time > NOW() - INTERVAL '1 hour'
              AND NOT (sd.sensor_type = 'temperature' AND sd.value = 0)
              AND NOT (sd.sensor_type = 'humidity' AND sd.value = 0)
            ORDER BY sd.time DESC
            LIMIT 50
        """)

        if not rows:
            return "Không có dữ liệu sensor trong 1 giờ qua."

        lines = ["=== DỮ LIỆU SENSOR (1 giờ gần nhất) ==="]

        # Group by barn
        by_barn = {}
        for r in rows:
            barn = r['barn_name'] or r['barn_id'] or 'Unknown'
            if barn not in by_barn:
                by_barn[barn] = []
            by_barn[barn].append({
                'device': r['device_code'],
                'type': r['sensor_type'],
                'value': r['value'],
                'unit': r['unit'],
                'time': r['time'].strftime('%H:%M') if r['time'] else ''
            })

        for barn, sensors in by_barn.items():
            lines.append(f"\n🏠 {barn}:")
            for s in sensors:
                icon = "🌡️" if s['type'] == 'temperature' else "💧" if s['type'] == 'humidity' else "📊"
                lines.append(f"  {icon} {s['device']}: {s['type']} = {s['value']}{s['unit']} ({s['time']})")

        return "\n".join(lines)

    except Exception as e:
        logger.warning(f"Could not fetch sensor data: {e}")
        return f"Không lấy được dữ liệu sensor: {e}"


async def _fetch_sensor_summary() -> str:
    """Fetch aggregated sensor summary for the last 24 hours with anomaly detection."""
    try:
        from src.services.database.db import db

        # Temperature thresholds for anomaly detection (°C)
        TEMP_MIN = 5.0
        TEMP_MAX = 45.0
        # Humidity thresholds (%)
        HUM_MIN = 10.0
        HUM_MAX = 95.0

        rows = await db.fetch("""
            SELECT b.id, b.name, sd.sensor_type,
                   AVG(sd.value)::numeric(5,1) as avg_value,
                   MIN(sd.value)::numeric(5,1) as min_value,
                   MAX(sd.value)::numeric(5,1) as max_value,
                   COUNT(*) as reading_count,
                   d.device_code
            FROM sensor_data sd
            JOIN barns b ON b.id = sd.barn_id
            JOIN devices d ON d.id = sd.device_id
            WHERE sd.sensor_type IN ('temperature', 'humidity')
              AND sd.time > NOW() - INTERVAL '24 hours'
            GROUP BY b.id, b.name, sd.sensor_type, d.device_code
            ORDER BY b.name, sd.sensor_type
        """)

        if not rows:
            return "Không có dữ liệu sensor 24h gần đây."

        lines = ["=== TỔNG KẾT SENSOR (24 giờ) ==="]
        anomalies = []
        current_barn = None

        for r in rows:
            barn = r['name'] or r['id']

            # Anomaly detection
            is_anomaly = False
            if r['sensor_type'] == 'temperature':
                if r['avg_value'] < TEMP_MIN or r['avg_value'] > TEMP_MAX:
                    is_anomaly = True
            elif r['sensor_type'] == 'humidity':
                if r['avg_value'] < HUM_MIN or r['avg_value'] > HUM_MAX:
                    is_anomaly = True

            # Also check for 0 values (sensor error)
            if r['sensor_type'] == 'temperature' and r['avg_value'] == 0:
                is_anomaly = True
                anomalies.append(f"  ⚠️ {r['device_code']}: gửi giá trị 0°C (lỗi cảm biến)")

            if is_anomaly:
                anomalies.append(f"  ⚠️ {r['device_code']}: {r['sensor_type']} avg={r['avg_value']} (bất thường)")

            if barn != current_barn:
                lines.append(f"\n🏠 {barn}:")
                current_barn = barn

            icon = "🌡️" if r['sensor_type'] == 'temperature' else "💧"
            unit = "°C" if r['sensor_type'] == 'temperature' else "%"
            status = " ⚠️ ANOMALY" if is_anomaly else ""
            lines.append(f"  {icon} {r['sensor_type']}: avg={r['avg_value']}{unit}, min={r['min_value']}{unit}, max={r['max_value']}{unit} ({r['reading_count']} đọc){status}")

        # Add anomaly alerts
        if anomalies:
            lines.append("\n=== CẢNH BÁO THIẾT BỊ BẤT THƯỜNG ===")
            lines.extend(anomalies)

        return "\n".join(lines)

    except Exception as e:
        logger.warning(f"Could not fetch sensor summary: {e}")
        return ""


async def _fetch_peak_readings() -> str:
    """Fetch peak (max/min) sensor readings with their timestamps for the last 24 hours."""
    try:
        from src.services.database.db import db

        rows = await db.fetch("""
            SELECT DISTINCT ON (sd.sensor_type, sd.barn_id)
                sd.barn_id, b.name as barn_name, sd.sensor_type, sd.value, sd.unit, sd.time,
                d.device_code
            FROM sensor_data sd
            JOIN barns b ON b.id = sd.barn_id
            JOIN devices d ON d.id = sd.device_id
            WHERE sd.sensor_type IN ('temperature', 'humidity')
              AND sd.time > NOW() - INTERVAL '24 hours'
              AND NOT (sd.sensor_type = 'temperature' AND sd.value = 0)
            ORDER BY sd.sensor_type, sd.barn_id, sd.value DESC
        """)

        rows_min = await db.fetch("""
            SELECT DISTINCT ON (sd.sensor_type, sd.barn_id)
                sd.barn_id, b.name as barn_name, sd.sensor_type, sd.value, sd.unit, sd.time,
                d.device_code
            FROM sensor_data sd
            JOIN barns b ON b.id = sd.barn_id
            JOIN devices d ON d.id = sd.device_id
            WHERE sd.sensor_type IN ('temperature', 'humidity')
              AND sd.time > NOW() - INTERVAL '24 hours'
              AND NOT (sd.sensor_type = 'temperature' AND sd.value = 0)
            ORDER BY sd.sensor_type, sd.barn_id, sd.value ASC
        """)

        if not rows and not rows_min:
            return "Không có dữ liệu peak trong 24h."

        lines = ["=== ĐIỂM CAO/THẤP TRONG 24 GIỜ ==="]

        # Group by barn
        peaks = {}
        for r in rows:
            barn = r['barn_name'] or r['barn_id']
            if barn not in peaks:
                peaks[barn] = {'max': {}, 'min': {}}
            key = r['sensor_type']
            peaks[barn]['max'][key] = {
                'value': r['value'],
                'unit': r['unit'],
                'time': r['time'].strftime('%H:%M %d/%m') if r['time'] else 'N/A',
                'device': r['device_code']
            }

        for r in rows_min:
            barn = r['barn_name'] or r['barn_id']
            if barn not in peaks:
                peaks[barn] = {'max': {}, 'min': {}}
            key = r['sensor_type']
            peaks[barn]['min'][key] = {
                'value': r['value'],
                'unit': r['unit'],
                'time': r['time'].strftime('%H:%M %d/%m') if r['time'] else 'N/A',
                'device': r['device_code']
            }

        for barn, data in peaks.items():
            lines.append(f"\n🏠 {barn}:")
            for stype in ['temperature', 'humidity']:
                if stype in data['max']:
                    m = data['max'][stype]
                    icon = "🌡️" if stype == 'temperature' else "💧"
                    unit = "°C" if stype == 'temperature' else "%"
                    lines.append(f"  {icon} {stype} CAO NHẤT: {m['value']}{unit} lúc {m['time']} ({m['device']})")
                if stype in data['min']:
                    m = data['min'][stype]
                    icon = "🌡️" if stype == 'temperature' else "💧"
                    unit = "°C" if stype == 'temperature' else "%"
                    lines.append(f"  {icon} {stype} THẤP NHẤT: {m['value']}{unit} lúc {m['time']} ({m['device']})")

        return "\n".join(lines)

    except Exception as e:
        logger.warning(f"Could not fetch peak readings: {e}")
        return f"Lỗi khi lấy peak: {str(e)}"

        if not rows:
            return "Không có dữ liệu sensor 24h gần đây."

        lines = ["=== TỔNG KẾT SENSOR (24 giờ) ==="]
        anomalies = []
        current_barn = None

        for r in rows:
            barn = r['name'] or r['id']

            # Anomaly detection
            is_anomaly = False
            if r['sensor_type'] == 'temperature':
                if r['avg_value'] < TEMP_MIN or r['avg_value'] > TEMP_MAX:
                    is_anomaly = True
            elif r['sensor_type'] == 'humidity':
                if r['avg_value'] < HUM_MIN or r['avg_value'] > HUM_MAX:
                    is_anomaly = True

            # Also check for 0 values (sensor error)
            if r['sensor_type'] == 'temperature' and r['avg_value'] == 0:
                is_anomaly = True
                anomalies.append(f"  ⚠️ {r['device_code']}: gửi giá trị 0°C (lỗi cảm biến)")

            if is_anomaly:
                anomalies.append(f"  ⚠️ {r['device_code']}: {r['sensor_type']} avg={r['avg_value']} (bất thường)")

            if barn != current_barn:
                lines.append(f"\n🏠 {barn}:")
                current_barn = barn

            icon = "🌡️" if r['sensor_type'] == 'temperature' else "💧"
            unit = "°C" if r['sensor_type'] == 'temperature' else "%"
            status = " ⚠️ ANOMALY" if is_anomaly else ""
            lines.append(f"  {icon} {r['sensor_type']}: avg={r['avg_value']}{unit}, min={r['min_value']}{unit}, max={r['max_value']}{unit} ({r['reading_count']} đọc){status}")

        # Add anomaly alerts
        if anomalies:
            lines.append("\n=== CẢNH BÁO THIẾT BỊ BẤT THƯỜNG ===")
            lines.extend(anomalies)

        return "\n".join(lines)

    except Exception as e:
        logger.warning(f"Could not fetch sensor summary: {e}")
        return ""


async def _fetch_sensor_history(time_start: str, time_end: str, sensor_type: str = None, barn_id: str = None) -> str:
    """Fetch sensor data for a specific time range."""
    try:
        from src.services.database.db import db
        from datetime import datetime

        # Parse time strings
        try:
            ts = datetime.fromisoformat(time_start.replace(' ', 'T'))
            te = datetime.fromisoformat(time_end.replace(' ', 'T'))
        except ValueError:
            return f"Không parse được thời gian. Dùng format: 'YYYY-MM-DD HH:MM:SS'"

        # Build query
        conditions = ["sd.time >= $1", "sd.time <= $2"]
        params = [ts, te]
        idx = 3

        if sensor_type:
            conditions.append(f"sd.sensor_type = ${idx}")
            params.append(sensor_type)
            idx += 1

        if barn_id:
            conditions.append(f"sd.barn_id = ${idx}")
            params.append(barn_id)
            idx += 1

        where = " AND ".join(conditions)

        rows = await db.fetch(f"""
            SELECT sd.time, sd.device_id, sd.sensor_type, sd.value, sd.unit,
                   d.device_code, b.name as barn_name
            FROM sensor_data sd
            JOIN devices d ON d.id = sd.device_id
            LEFT JOIN barns b ON b.id = sd.barn_id
            WHERE {where}
            ORDER BY sd.time DESC
            LIMIT 100
        """, *params)

        if not rows:
            return f"Không có dữ liệu cảm biến từ {time_start} đến {time_end}"

        # Group by time intervals (hourly)
        by_hour = {}
        for r in rows:
            hour_key = r['time'].strftime('%Y-%m-%d %H:00')
            if hour_key not in by_hour:
                by_hour[hour_key] = {'temp': [], 'humidity': []}
            if r['sensor_type'] == 'temperature':
                by_hour[hour_key]['temp'].append(r['value'])
            elif r['sensor_type'] == 'humidity':
                by_hour[hour_key]['humidity'].append(r['value'])

        lines = [f"=== DỮ LIỆU CẢM BIẾN ({time_start} → {time_end}) ==="]
        for hour, readings in sorted(by_hour.items()):
            temp_avg = sum(readings['temp']) / len(readings['temp']) if readings['temp'] else None
            hum_avg = sum(readings['humidity']) / len(readings['humidity']) if readings['humidity'] else None

            temp_str = f"{temp_avg:.1f}°C" if temp_avg is not None else "N/A"
            hum_str = f"{hum_avg:.1f}%" if hum_avg is not None else "N/A"
            lines.append(f"{hour}: 🌡️ {temp_str} | 💧 {hum_str}")

        return "\n".join(lines)

    except Exception as e:
        logger.warning(f"Could not fetch sensor history: {e}")
        return f"Lỗi khi truy vấn: {str(e)}"


async def _fetch_barn_status() -> str:
    """Fetch barn and cycle status for context."""
    try:
        from src.services.database.db import db

        # Get active cycles with barn info
        rows = await db.fetch("""
            SELECT b.id as barn_id, b.name as barn_name,
                   c.id as cycle_id, c.start_date, c.bird_count,
                   c.status as cycle_status
            FROM barns b
            LEFT JOIN cycles c ON c.barn_id = b.id AND c.status = 'active'
            WHERE b.active = true
            ORDER BY b.id
        """)

        if not rows:
            return "Không có thông tin chuồng trại."

        lines = ["=== TÌNH TRẠNG CHUỒNG TRẠI ==="]
        for r in rows:
            age = ""
            if r['start_date']:
                days = (datetime.now() - r['start_date']).days
                age = f", {days} ngày tuổi"
            bird_count = r['bird_count'] or 0
            lines.append(
                f"\n [{r['barn_id']}] {r['barn_name']} - "
                f"Đợt nuôi: {r['cycle_id'] or 'chưa có'} "
                f"(trạng thái: {r['cycle_status'] or 'N/A'})"
            )
            if bird_count > 0:
                lines.append(f"  - Số lượng gà: {bird_count:,}{age}")

        return "\n".join(lines)

    except Exception as e:
        logger.warning(f"Could not fetch barn status: {e}")
        return f"Không lấy được tình trạng chuồng: {e}"


async def _fetch_device_status() -> str:
    """Fetch online/offline devices for context."""
    try:
        from src.services.database.db import db

        rows = await db.fetch("""
            SELECT d.device_code, d.name, d.device_type_id, d.is_online, d.firmware_version,
                   dt.name as type_name
            FROM devices d
            LEFT JOIN device_types dt ON dt.id = d.device_type_id
            ORDER BY d.is_online DESC, d.device_code
        """)

        if not rows:
            return "Không có thiết bị."

        lines = ["=== TRẠNG THÁI THIẾT BỊ ==="]

        online = [r for r in rows if r['is_online']]
        offline = [r for r in rows if not r['is_online']]

        lines.append(f"\n🟢 Online ({len(online)}):")
        for r in online:
            lines.append(f"  - {r['device_code']} ({r['name']}) - {r['type_name'] or 'type#'+str(r['device_type_id'])}")

        if offline:
            lines.append(f"\n🔴 Offline ({len(offline)}):")
            for r in offline:
                lines.append(f"  - {r['device_code']} ({r['name']}) - {r['type_name'] or 'type#'+str(r['device_type_id'])}")

        return "\n".join(lines)

    except Exception as e:
        logger.warning(f"Could not fetch device status: {e}")
        return f"Không lấy được trạng thái thiết bị: {e}"


async def _report_device_issue(device_code: str, issue_type: str, description: str = None) -> dict:
    """
    Report a device issue as an alert.
    Returns dict with success status and message.
    """
    try:
        from src.services.database.db import db

        # Find device
        device = await db.fetchrow(
            "SELECT id, device_code, name, is_online FROM devices WHERE device_code = $1",
            device_code
        )

        if not device:
            return {"ok": False, "message": f"Không tìm thấy thiết bị {device_code}"}

        # Map issue_type to severity and message
        issue_config = {
            "offline": {
                "severity": "warning",
                "message": f"Thiết bị {device_code} ({device['name']}) đang OFFLINE - cần kiểm tra"
            },
            "sensor_error": {
                "severity": "danger",
                "message": f"Cảm biến {device_code} ({device['name']}) gửi giá trị lỗi (0 hoặc bất thường)"
            },
            "abnormal_reading": {
                "severity": "warning",
                "message": f"Cảm biến {device_code} ({device['name']}) ghi nhận giá trị bất thường"
            }
        }

        config = issue_config.get(issue_type, issue_config["abnormal_reading"])
        msg = description or config["message"]

        # Create alert (all NOT NULL fields get placeholder values for device-level issue)
        await db.execute(
            """INSERT INTO alerts
            (device_id, sensor_type, value, threshold, direction, severity, message)
            VALUES ($1, $2, $3, $4, $5, $6, $7)""",
            device["id"], "device_report", 0, 0, "none", config["severity"], msg
        )

        logger.warning(f"Device issue reported: {device_code} - {issue_type}")

        # Try to send notification
        try:
            from src.iot.notification_service import notification_service
            icon = {"danger": "🔴", "warning": "🟡"}.get(config["severity"], "⚪")
            await notification_service.send_alert(config["severity"], f"{icon} {msg}")
        except Exception:
            pass

        return {
            "ok": True,
            "message": f"Đã báo cáo sự cố: {msg}",
            "device_code": device_code,
            "severity": config["severity"]
        }

    except Exception as e:
        logger.error(f"Failed to report device issue: {e}")
        return {"ok": False, "message": f"Lỗi khi báo cáo: {str(e)}"}


async def build_context(user_message: str) -> str:
    """
    Build context based on user message.
    Fetches relevant system data to inject into AI prompt.
    """
    parts = []
    msg_lower = user_message.lower()

    # Always fetch device status (quick)
    device_status = await _fetch_device_status()
    parts.append(device_status)

    # Check keywords in message to determine what to fetch
    should_fetch_sensors = any(
        kw in msg_lower for kw in [
            'nhiệt độ', 'độ ẩm', 'temp', 'humidity', 'sensor',
            'môi trường', 'temperature', 'cảm biến', 'trại'
        ]
    )

    should_fetch_barns = any(
        kw in msg_lower for kw in [
            'chuồng', 'barn', 'trại', 'đợt nuôi', 'gà',
            'con', 'cái', 'population', 'bird', 'chickens'
        ]
    )

    should_fetch_inventory = any(
        kw in msg_lower for kw in [
            'kho', 'inventory', 'thức ăn', 'feed', 'thuốc',
            'medicine', 'tồn kho', 'stock'
        ]
    )

    if should_fetch_sensors:
        sensor_data = await _fetch_sensor_data()
        sensor_summary = await _fetch_sensor_summary()
        parts.append(sensor_data)
        if sensor_summary:
            parts.append(sensor_summary)

    if should_fetch_barns:
        barn_status = await _fetch_barn_status()
        parts.append(barn_status)

    if should_fetch_inventory:
        # TODO: Add inventory context if needed
        pass

    return "\n\n".join(parts)


@router.post("/query")
async def chat_query(data: ChatQueryRequest):
    """
    Query mode: Ask AI questions with Context Injection.
    AI receives real system data to answer accurately.
    """
    conv_id = data.conversation_id or "default"

    # Initialize conversation if needed
    if conv_id not in _conversations:
        _conversations[conv_id] = []

    # Build context based on user message
    context = await build_context(data.message)

    # Create enhanced user message with context
    enhanced_message = f"""Bạn là trợ lý AI cho hệ thống quản lý trang trại CFarm.

Hãy trả lời câu hỏi dựa trên DỮ LIỆU THỰC TẾ từ hệ thống.
Nếu cần thông tin thiết bị - gọi get_device_status.
Nếu cần xem nhiệt độ/độ ẩm - gọi get_sensor_readings.
Nếu phát hiện thiết bị OFFLINE hoặc cảm biến gửi giá trị 0/bất thường - gọi report_device_issue NGAY.

Bạn có 5 công cụ:
1. get_device_status - xem trạng thái online/offline
2. get_sensor_readings - xem nhiệt độ, độ ẩm 24h (avg, min, max)
3. get_peak_readings - xem điểm CAO NHẤT và THẤP NHẤT kèm THỜI GIAN chính xác
4. report_device_issue - báo sự cố thiết bị cho quản lý
5. run_sql - chạy câu SQL SELECT tùy chỉnh (chỉ SELECT thuần, giới hạn 20 rows)

**LUÔN gọi get_peak_readings khi hỏi về nhiệt độ CAO NHẤT, THẤP NHẤT, hoặc thời điểm đạt giá trị đó.**

--- DỮ LIỆU HỆ THỐNG ---
{context}
--- KẾT THÚC DỮ LIỆU ---

Câu hỏi: {data.message}
"""

    try:
        client = _get_anthropic_client()
        model = data.model or os.environ.get("ANTHROPIC_MODEL", "MiniMax-M2.7")

        # Build messages with system context
        messages = []

        # Add context as system-like message
        messages.append({
            "role": "user",
            "content": enhanced_message
        })

        # Define tools for the AI to use
        tools = [
            {
                "name": "report_device_issue",
                "description": "Báo cáo sự cố thiết bị khi phát hiện thiết bị OFFLINE, cảm biến gửi giá trị 0, hoặc giá trị bất thường. Nên gọi khi phát hiện vấn đề.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "device_code": {
                            "type": "string",
                            "description": "Mã thiết bị (VD: esp-54420)"
                        },
                        "issue_type": {
                            "type": "string",
                            "description": "Loại sự cố: 'offline' (thiết bị mất kết nối), 'sensor_error' (cảm biến gửi giá trị 0 hoặc lỗi), 'abnormal_reading' (giá trị bất thường)"
                        },
                        "description": {
                            "type": "string",
                            "description": "Mô tả chi tiết vấn đề (tùy chọn)"
                        }
                    },
                    "required": ["device_code", "issue_type"]
                }
            },
            {
                "name": "get_device_status",
                "description": "Lấy danh sách thiết bị và trạng thái online/offline của chúng.",
                "input_schema": {
                    "type": "object",
                    "properties": {}
                }
            },
            {
                "name": "get_sensor_readings",
                "description": "Lấy dữ liệu cảm biến (nhiệt độ, độ ẩm) của các trại trong 24 giờ.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "barn_id": {
                            "type": "string",
                            "description": "Mã trại cần xem (VD: barn-09). Nếu không cung cấp thì xem tất cả."
                        }
                    }
                }
            },
            {
                "name": "get_sensor_history",
                "description": "Lấy dữ liệu cảm biến theo khoảng thời gian cụ thể. Dùng khi hỏi về dữ liệu 'lúc X giờ', 'hôm qua', 'tuần trước', 'ngày XX'.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "time_start": {
                            "type": "string",
                            "description": "Thời điểm bắt đầu (ISO format: YYYY-MM-DD HH:MM:SS). VD: '2026-05-20 08:00:00'"
                        },
                        "time_end": {
                            "type": "string",
                            "description": "Thời điểm kết thúc (ISO format: YYYY-MM-DD HH:MM:SS). VD: '2026-05-20 09:00:00'"
                        },
                        "sensor_type": {
                            "type": "string",
                            "description": "Loại cảm biến: 'temperature', 'humidity', hoặc để trống lấy cả hai"
                        },
                        "barn_id": {
                            "type": "string",
                            "description": "Mã trại (VD: barn-09). Để trống thì lấy tất cả."
                        }
                    },
                    "required": ["time_start", "time_end"]
                }
            },
            {
                "name": "get_peak_readings",
                "description": "Lấy điểm CAO NHẤT và THẤP NHẤT của nhiệt độ/độ ẩm trong 24 giờ KÈM THỜI GIAN CHÍNH XÁC. Dùng khi hỏi 'nhiệt độ cao nhất lúc mấy giờ', 'thời điểm nóng nhất', 'giá trị peak'.",
                "input_schema": {
                    "type": "object",
                    "properties": {}
                }
            },
            {
                "name": "run_sql",
                "description": "Chạy câu SQL SELECT để lấy dữ liệu từ database. Dùng khi câu hỏi cần dữ liệu cụ thể không có trong các tool khác. SQL phải là SELECT thuần, không có JOIN phức tạp.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "sql": {
                            "type": "string",
                            "description": "Câu SELECT SQL. Ví dụ: 'SELECT barn_id, AVG(value) FROM sensor_data WHERE sensor_type = 'temperature' AND time > NOW() - INTERVAL '1 hour' GROUP BY barn_id'"
                        }
                    },
                    "required": ["sql"]
                }
            }
        ]

        # First API call
        response = client.messages.create(
            model=model,
            max_tokens=1024,
            messages=messages,
            tools=tools
        )

        # Handle tool calls if present
        while response.stop_reason == "tool_use":
            tool_results = []

            for tool_use in response.content:
                if hasattr(tool_use, 'name') and hasattr(tool_use, 'input'):
                    func_name = tool_use.name
                    func_args = tool_use.input

                    logger.info(f"AI calling tool: {func_name} with args: {func_args}")

                    try:
                        if func_name == "report_device_issue":
                            result = await _report_device_issue(
                                device_code=func_args.get("device_code"),
                                issue_type=func_args.get("issue_type"),
                                description=func_args.get("description")
                            )
                            tool_results.append({
                                "tool_use_id": tool_use.id,
                                "content": f"Đã báo cáo: {result.get('message', 'OK')}"
                            })

                        elif func_name == "get_device_status":
                            status = await _fetch_device_status()
                            tool_results.append({
                                "tool_use_id": tool_use.id,
                                "content": status
                            })

                        elif func_name == "get_sensor_readings":
                            summary = await _fetch_sensor_summary()
                            tool_results.append({
                                "tool_use_id": tool_use.id,
                                "content": summary
                            })

                        elif func_name == "get_sensor_history":
                            result = await _fetch_sensor_history(
                                time_start=func_args.get("time_start"),
                                time_end=func_args.get("time_end"),
                                sensor_type=func_args.get("sensor_type"),
                                barn_id=func_args.get("barn_id")
                            )
                            tool_results.append({
                                "tool_use_id": tool_use.id,
                                "content": result
                            })

                        elif func_name == "get_peak_readings":
                            peaks = await _fetch_peak_readings()
                            tool_results.append({
                                "tool_use_id": tool_use.id,
                                "content": peaks
                            })

                        elif func_name == "run_sql":
                            sql = func_args.get("sql", "")
                            if not _is_safe_sql(sql):
                                tool_results.append({
                                    "tool_use_id": tool_use.id,
                                    "content": "SQL bị từ chối: chỉ chấp nhận SELECT thuần, không có JOIN phức tạp."
                                })
                            else:
                                try:
                                    pool = await _get_ro_pool()
                                    async with pool.acquire() as conn:
                                        rows = await conn.fetch(sql)
                                        if not rows:
                                            result_text = "Không có dữ liệu"
                                        else:
                                            cols = list(rows[0].keys())
                                            lines = [f"{' | '.join(cols)}"]
                                            lines.append('-' * len(lines[0]))
                                            for r in rows[:20]:  # limit 20 rows
                                                lines.append(' | '.join(str(r[c]) for c in cols))
                                            if len(rows) > 20:
                                                lines.append(f"... ({len(rows)} rows total)")
                                            result_text = '\n'.join(lines)
                                        tool_results.append({
                                            "tool_use_id": tool_use.id,
                                            "content": result_text
                                        })
                                except Exception as e:
                                    tool_results.append({
                                        "tool_use_id": tool_use.id,
                                        "content": f"Lỗi SQL: {str(e)}"
                                    })

                        else:
                            tool_results.append({
                                "tool_use_id": tool_use.id,
                                "content": f"Unknown tool: {func_name}"
                            })

                    except Exception as e:
                        logger.error(f"Tool {func_name} failed: {e}")
                        tool_results.append({
                            "tool_use_id": tool_use.id,
                            "content": f"Lỗi khi thực hiện: {str(e)}"
                        })

            # Add tool results to conversation
            messages.append({
                "role": "assistant",
                "content": response.content
            })
            for tr in tool_results:
                messages.append({
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": tr["tool_use_id"],
                            "content": tr["content"]
                        }
                    ]
                })

            # Next API call with tool results
            response = client.messages.create(
                model=model,
                max_tokens=1024,
                messages=messages,
                tools=tools
            )

        # Get final text response
        reply = ""
        for block in response.content:
            if hasattr(block, 'text'):
                reply = block.text
                break
            elif hasattr(block, 'thinking'):
                continue

        # Add to conversation history
        _conversations[conv_id].append({
            "role": "user",
            "content": data.message  # Original message
        })
        _conversations[conv_id].append({
            "role": "assistant",
            "content": reply
        })

        return {
            "response": reply,
            "conversation_id": conv_id,
            "model": model,
            "context_used": bool(context),
        }

    except Exception as e:
        logger.error(f"Chat query error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversation/{conversation_id}")
async def get_conversation(conversation_id: str):
    """Get full conversation history."""
    messages = _conversations.get(conversation_id, [])
    return {"conversation_id": conversation_id, "messages": messages}


@router.delete("/conversation/{conversation_id}")
async def clear_conversation(conversation_id: str):
    """Clear conversation history."""
    if conversation_id in _conversations:
        del _conversations[conversation_id]
    return {"ok": True, "conversation_id": conversation_id}


@router.post("/report-issue")
async def report_device_issue(data: ReportDeviceIssueRequest):
    """
    Report a device issue (offline, sensor error, abnormal reading).
    Creates an alert in the database and sends notification.
    """
    result = await _report_device_issue(
        device_code=data.device_code,
        issue_type=data.issue_type,
        description=data.description
    )
    if not result["ok"]:
        raise HTTPException(status_code=404, detail=result["message"])
    return result