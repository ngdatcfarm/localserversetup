"""PTZ Controller - Điều khiển Pan/Tilt/Zoom qua Uniview LAPI."""

import logging
import httpx
from enum import IntEnum
from typing import Optional, Dict
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class RelativePosition:
    """Relative position tracked by server (in seconds of hold time)."""
    pan: int = 0    # seconds moving left/right
    tilt: int = 0   # seconds moving up/down


class PositionTracker:
    """Track relative position of camera based on move commands (in seconds)."""

    def __init__(self):
        self._positions: Dict[str, RelativePosition] = {}
        self._move_start: Dict[str, float] = {}  # camera_id -> start_time
        self._move_direction: Dict[str, str] = {}  # camera_id -> direction

    def get_position(self, camera_id: str) -> RelativePosition:
        if camera_id not in self._positions:
            self._positions[camera_id] = RelativePosition()
        return self._positions[camera_id]

    def reset(self, camera_id: str):
        """Reset to origin (call when camera starts)."""
        self._positions[camera_id] = RelativePosition()
        self._move_start.pop(camera_id, None)
        self._move_direction.pop(camera_id, None)
        logger.info(f"Position reset for {camera_id}")

    def start_move(self, camera_id: str, direction: str):
        """Record start of move (only if not already moving)."""
        import time
        if camera_id not in self._move_start:
            self._move_start[camera_id] = time.time()
            self._move_direction[camera_id] = direction

    def end_move(self, camera_id: str, direction: str):
        """Calculate duration and update position when move stops."""
        import time
        start_time = self._move_start.get(camera_id)
        dir_at_start = self._move_direction.get(camera_id)

        if start_time and dir_at_start == direction:
            duration = time.time() - start_time
            # Round to integer seconds
            seconds = max(1, round(duration))
            self.move(camera_id, direction, seconds)

        # Clear
        self._move_start.pop(camera_id, None)
        self._move_direction.pop(camera_id, None)

    def move(self, camera_id: str, direction: str, seconds: int = 1):
        """Update position by seconds of movement."""
        pos = self.get_position(camera_id)
        if direction == "left":
            pos.pan -= seconds
        elif direction == "right":
            pos.pan += seconds
        elif direction == "up":
            pos.tilt += seconds
        elif direction == "down":
            pos.tilt -= seconds
        logger.info(f"{camera_id} position: pan={pos.pan}, tilt={pos.tilt} (+{seconds}s {direction})")

    def get_position_dict(self, camera_id: str) -> dict:
        """Get position as dict."""
        pos = self.get_position(camera_id)
        return {"pan": pos.pan, "tilt": pos.tilt}


# Global position tracker
position_tracker = PositionTracker()


class PTZCommand(IntEnum):
    """PTZ command codes (Uniview LAPI)."""
    UP_START = 1026
    UP_STOP = 1025
    DOWN_START = 1028
    DOWN_STOP = 1027
    LEFT_START = 1284
    LEFT_STOP = 1283
    RIGHT_START = 1282
    RIGHT_STOP = 1281


# Map direction -> (start_cmd, stop_cmd)
PTZ_DIRECTIONS = {
    "up": (PTZCommand.UP_START, PTZCommand.UP_STOP),
    "down": (PTZCommand.DOWN_START, PTZCommand.DOWN_STOP),
    "left": (PTZCommand.LEFT_START, PTZCommand.LEFT_STOP),
    "right": (PTZCommand.RIGHT_START, PTZCommand.RIGHT_STOP),
}


class PTZController:
    """Điều khiển PTZ cho camera qua Uniview LAPI."""

    LAPI_PTZ_PATH = "/LAPI/V1.0/Channels/0/PTZ/PTZCtrl"
    LAPI_RECTIFY_PATH = "/LAPI/V1.0/Channels/0/PTZ/Rectify"  # Tare - đặt về gốc
    LAPI_PRESET_LIST_PATH = "/LAPI/V1.0/Channels/0/PTZ/Presets"  # List & Create preset
    LAPI_PRESET_GOTO_PATH = "/LAPI/V1.0/Channels/0/PTZ/Presets/{}/Goto"  # Goto preset

    def __init__(self, camera_ip: str, username: str, password: str, port: int = 80, camera_id: str = None):
        self.camera_ip = camera_ip
        self.username = username
        self.password = password
        self.port = port
        self.camera_id = camera_id
        self._base_url = f"http://{camera_ip}:{port}" if port != 80 else f"http://{camera_ip}"

    def _build_payload(self, cmd: int, speed: int = 6) -> dict:
        return {
            "PTZCmd": cmd,
            "ContinueTime": 0,
            "Para1": speed,
            "Para2": speed,
            "Para3": 0,
        }

    async def _send_request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Gửi HTTP request với Digest auth, fallback Basic auth."""
        auth = httpx.DigestAuth(self.username, self.password)
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await getattr(client, method)(url, auth=auth, **kwargs)
            if response.status_code == 401:
                response = await getattr(client, method)(
                    url, auth=(self.username, self.password), **kwargs
                )
            return response

    async def _send_command(self, cmd: int, speed: int = 6) -> dict:
        """Gửi lệnh PTZ đến camera."""
        url = f"{self._base_url}{self.LAPI_PTZ_PATH}"
        payload = self._build_payload(cmd, speed)

        try:
            response = await self._send_request("put", url, json=payload)
            if response.status_code == 200:
                logger.info(f"PTZ cmd {cmd} -> {self.camera_ip}: OK")
                return {"success": True, "message": "OK"}
            logger.warning(f"PTZ cmd {cmd} -> {self.camera_ip}: HTTP {response.status_code}")
            return {"success": False, "message": f"HTTP {response.status_code}"}

        except httpx.TimeoutException:
            logger.error(f"PTZ timeout: {self.camera_ip}")
            return {"success": False, "message": "Timeout"}
        except Exception as e:
            logger.error(f"PTZ error: {self.camera_ip}: {e}")
            return {"success": False, "message": str(e)}

    async def move(self, direction: str, speed: int = 6) -> dict:
        """Bắt đầu di chuyển theo hướng."""
        if direction not in PTZ_DIRECTIONS:
            return {"success": False, "message": f"Invalid direction: {direction}"}
        start_cmd, _ = PTZ_DIRECTIONS[direction]
        result = await self._send_command(start_cmd, speed)

        # Record start time for position tracking
        if result.get("success") and self.camera_id:
            position_tracker.start_move(self.camera_id, direction)

        return result

    async def stop(self, direction: str, speed: int = 6) -> dict:
        """Dừng di chuyển theo hướng và cập nhật vị trí."""
        if direction not in PTZ_DIRECTIONS:
            return {"success": False, "message": f"Invalid direction: {direction}"}
        _, stop_cmd = PTZ_DIRECTIONS[direction]
        result = await self._send_command(stop_cmd, speed)

        # Calculate duration and update position
        if result.get("success") and self.camera_id:
            position_tracker.end_move(self.camera_id, direction)

        return result

    # ── Relative Position Tracking ─────────────────────────────

    def get_relative_position(self) -> dict:
        """Lấy vị trí tương đối (so với gốc đã đặt)."""
        if not self.camera_id:
            return {"success": False, "message": "No camera_id"}
        return position_tracker.get_position_dict(self.camera_id)

    async def rectify(self) -> dict:
        """Gửi lệnh Rectify (Tare) - đặt vị trí hiện tại làm gốc tọa độ."""
        url = f"{self._base_url}{self.LAPI_RECTIFY_PATH}"
        try:
            response = await self._send_request("put", url, json={})
            if response.status_code == 200:
                data = response.json()
                logger.info(f"Rectify {self.camera_ip}: {data}")
                # Reset local position tracker
                if self.camera_id:
                    position_tracker.reset(self.camera_id)
                return {"success": True, "message": "Rectified", "raw": data}
            return {"success": False, "message": f"HTTP {response.status_code}"}
        except Exception as e:
            logger.error(f"Rectify error: {e}")
            return {"success": False, "message": str(e)}

    def set_origin(self) -> dict:
        """Đặt vị trí hiện tại làm gốc tọa độ (Tare) - sync wrapper."""
        if not self.camera_id:
            return {"success": False, "message": "No camera_id"}
        # This is sync, actual rectify should be called via rectify()
        position_tracker.reset(self.camera_id)
        logger.info(f"Origin set for camera {self.camera_id}")
        return {"success": True, "message": "Origin set (local tracker reset)"}

    def on_camera_online(self):
        """Gọi khi camera online trở lại - sau 30s sẽ auto-tare."""
        if not self.camera_id:
            return
        logger.info(f"Camera {self.camera_id} online - scheduling auto-tare in 30s")
        import threading
        def delayed_tare():
            import time
            time.sleep(30)
            position_tracker.reset(self.camera_id)
            logger.info(f"Auto-tare: {self.camera_id} origin reset after 30s")

        threading.Thread(target=delayed_tare, daemon=True).start()

    def on_camera_offline(self):
        """Gọi khi camera mất kết nối - xóa position tracking."""
        if not self.camera_id:
            return
        # Position will be lost when offline - no action needed
        # It will auto-tare when comes back online
        logger.info(f"Camera {self.camera_id} offline - position tracking reset")

    # ── Preset Management ──────────────────────────────────

    async def set_preset(self, preset_number: int, name: str = None) -> dict:
        """Lưu vị trí hiện tại vào preset trên camera UNV."""
        preset_name = name or str(preset_number)

        # Gọi UNV LAPI để save preset
        url = f"{self._base_url}{self.LAPI_PRESET_LIST_PATH}"
        payload = {"ID": preset_number, "Name": preset_name}

        try:
            response = await self._send_request("post", url, json=payload)
            if response.status_code == 200:
                data = response.json()
                logger.info(f"Set preset {preset_number}: {data}")

                # Lưu vào config để backup
                if self.camera_id:
                    current_pos = position_tracker.get_position(self.camera_id)
                    from src.services.storage.config_service import ConfigService
                    config_svc = ConfigService()
                    config_svc.set_preset(self.camera_id, preset_number, preset_name, current_pos.pan, current_pos.tilt)

                return {"success": True, "message": "OK", "method": "unv_lapi", "raw": data}
            return {"success": False, "message": f"HTTP {response.status_code}"}
        except Exception as e:
            logger.error(f"Set preset error: {e}")
            return {"success": False, "message": str(e)}

    async def list_presets(self) -> dict:
        """Lấy danh sách presets từ camera."""
        url = f"{self._base_url}{self.LAPI_PRESET_LIST_PATH}?Limit=200&Offset=0"
        try:
            response = await self._send_request("get", url)
            if response.status_code == 200:
                data = response.json()
                logger.info(f"List presets: {data}")
                return {"success": True, "presets": data, "method": "unv_lapi"}
            return {"success": False, "message": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    async def goto_preset(self, preset_number: int, preset_pan: int = None, preset_tilt: int = None) -> dict:
        """Di chuyển camera đến vị trí preset."""
        # Thử UNV hardware preset trước
        url = f"{self._base_url}{self.LAPI_PRESET_GOTO_PATH.format(preset_number)}"
        try:
            response = await self._send_request("put", url, json={"ID": preset_number})
            if response.status_code == 200:
                data = response.json()
                logger.info(f"Goto preset {preset_number}: {data}")
                return {"success": True, "message": "OK", "method": "unv_lapi", "raw": data}
        except Exception as e:
            logger.info(f"UNV goto preset failed: {e}")

        # Fallback: Thử relative position nếu có
        if preset_pan is not None and preset_tilt is not None:
            logger.info(f"Falling back to relative position: pan={preset_pan}, tilt={preset_tilt}")
            return await self._goto_relative_position(preset_pan, preset_tilt)

        return {"success": False, "message": "Hardware preset failed and no relative position available"}

    async def _goto_relative_position(self, target_pan: int, target_tilt: int) -> dict:
        """Di chuyển đến vị trí tương đối (tính theo giây giữ nút)."""
        if not self.camera_id:
            return {"success": False, "message": "No camera_id"}

        # Lấy vị trí hiện tại
        current_pos = position_tracker.get_position(self.camera_id)
        delta_pan = target_pan - current_pos.pan
        delta_tilt = target_tilt - current_pos.tilt

        logger.info(f"Goto relative: current=({current_pos.pan},{current_pos.tilt}), target=({target_pan},{target_tilt}), delta=({delta_pan},{delta_tilt})")

        import asyncio

        # Di chuyển Pan
        if delta_pan != 0:
            direction = "right" if delta_pan > 0 else "left"
            duration = abs(delta_pan)  # seconds
            logger.info(f"Moving {direction} for {duration}s")
            await self.move(direction, 6)
            await asyncio.sleep(duration)
            await self.stop(direction)

        # Di chuyển Tilt
        if delta_tilt != 0:
            direction = "up" if delta_tilt > 0 else "down"
            duration = abs(delta_tilt)
            logger.info(f"Moving {direction} for {duration}s")
            await self.move(direction, 6)
            await asyncio.sleep(duration)
            await self.stop(direction)

        return {"success": True, "message": f"Moved to ({target_pan},{target_tilt})", "method": "relative"}

    def _check_response(self, response, action: str, method_name: str) -> dict:
        """Kiểm tra response từ camera, log chi tiết body để debug."""
        body = response.text.strip()
        logger.info(f"{method_name} {action} -> {self.camera_ip}: HTTP {response.status_code} | Body: {body[:200]}")

        if response.status_code != 200:
            return {"success": False, "message": f"{method_name} HTTP {response.status_code}: {body[:100]}"}

        # Uniview LAPI trả JSON có Response.ResponseCode
        try:
            data = response.json()
            resp = data.get("Response", {})
            code = resp.get("ResponseCode", 0)
            if code != 0:
                msg = resp.get("ResponseString", f"ErrorCode={code}")
                logger.warning(f"{method_name} {action}: camera trả lỗi: {msg}")
                return {"success": False, "message": f"{method_name}: {msg}"}
        except Exception:
            pass  # Không phải JSON (Dahua CGI trả text) → OK nếu 200

        # Dahua CGI trả "Error" trong body
        if "error" in body.lower() and "ok" not in body.lower():
            logger.warning(f"{method_name} {action}: body chứa error: {body[:100]}")
            return {"success": False, "message": f"{method_name}: {body[:100]}"}

        return {"success": True, "message": "OK", "method": method_name}

    async def _set_preset_lapi(self, preset_number: int) -> dict:
        """Set preset qua Uniview LAPI."""
        url = f"{self._base_url}{self.LAPI_PRESET_PATH}/{preset_number}"
        payload = {"ID": preset_number, "Name": f"Preset_{preset_number}"}
        try:
            response = await self._send_request("put", url, json=payload)
            return self._check_response(response, f"set_preset({preset_number})", "LAPI")
        except Exception as e:
            logger.error(f"LAPI set_preset exception: {e}")
            return {"success": False, "message": str(e)}

    async def _goto_preset_lapi(self, preset_number: int) -> dict:
        """Goto preset qua Uniview LAPI."""
        url = f"{self._base_url}{self.LAPI_PRESET_PATH}/{preset_number}/Goto"
        try:
            response = await self._send_request("put", url, json={"ID": preset_number})
            return self._check_response(response, f"goto_preset({preset_number})", "LAPI")
        except Exception as e:
            logger.error(f"LAPI goto_preset exception: {e}")
            return {"success": False, "message": str(e)}

    async def _set_preset_dahua(self, preset_number: int) -> dict:
        """Set preset qua Dahua CGI API."""
        url = f"{self._base_url}{self.DAHUA_CGI_PATH}"
        params = {
            "action": "start",
            "channel": 0,
            "code": "SetPreset",
            "arg1": 0,
            "arg2": preset_number,
            "arg3": 0,
        }
        try:
            response = await self._send_request("get", url, params=params)
            return self._check_response(response, f"set_preset({preset_number})", "Dahua_CGI")
        except Exception as e:
            logger.error(f"Dahua set_preset exception: {e}")
            return {"success": False, "message": str(e)}

    async def _goto_preset_dahua(self, preset_number: int) -> dict:
        """Goto preset qua Dahua CGI API."""
        url = f"{self._base_url}{self.DAHUA_CGI_PATH}"
        params = {
            "action": "start",
            "channel": 0,
            "code": "GotoPreset",
            "arg1": 0,
            "arg2": preset_number,
            "arg3": 0,
        }
        try:
            response = await self._send_request("get", url, params=params)
            return self._check_response(response, f"goto_preset({preset_number})", "Dahua_CGI")
        except Exception as e:
            logger.error(f"Dahua goto_preset exception: {e}")
            return {"success": False, "message": str(e)}

    # ── Position Query ─────────────────────────────────────

    async def get_current_position(self) -> dict:
        """Lấy vị trí hiện tại của camera (Pan/Tilt)."""
        # Try 1: UNV LAPI position query
        result = await self._get_position_lapi()
        if result.get("success"):
            return result

        # Try 2: UNV CGI
        logger.info("LAPI position query failed, trying CGI")
        return await self._get_position_cgi()

    async def _get_position_lapi(self) -> dict:
        """Lấy vị trí qua LAPI."""
        # Thử nhiều endpoint có thể của UNV
        endpoints = [
            "/LAPI/V1.0/Channels/0/PTZ/Status",
            "/LAPI/V1.0/Channels/0/PTZ/Channels/0/Status",
            "/LAPI/V1.0/Channel/0/PTZ/Position",
        ]
        for url_path in endpoints:
            url = f"{self._base_url}{url_path}"
            try:
                response = await self._send_request("get", url)
                if response.status_code == 200:
                    data = response.json()
                    logger.info(f"Position query OK ({url_path}): {data}")
                    return {
                        "success": True,
                        "method": "lapi",
                        "endpoint": url_path,
                        "pan": data.get("Pan") or data.get("pan"),
                        "tilt": data.get("Tilt") or data.get("tilt"),
                        "zoom": data.get("Zoom") or data.get("zoom"),
                        "raw": data
                    }
            except Exception as e:
                logger.info(f"Position query {url_path} failed: {e}")
                continue

        return {"success": False, "message": "No working position endpoint found"}

    async def _get_position_cgi(self) -> dict:
        """Lấy vị trí qua CGI."""
        url = f"{self._base_url}/cgi-bin/ptz.cgi"
        params = {
            "action": "get",
            "channel": 0,
        }
        try:
            response = await self._send_request("get", url, params=params)
            if response.status_code == 200:
                return {
                    "success": True,
                    "method": "cgi",
                    "raw": response.text
                }
            return {"success": False, "message": f"CGI HTTP {response.status_code}", "raw": response.text}
        except Exception as e:
            return {"success": False, "message": str(e)}


def get_ptz_controller(camera_config) -> Optional[PTZController]:
    """Tạo PTZController từ CameraConfig."""
    return PTZController(
        camera_ip=camera_config.ip,
        username=camera_config.username,
        password=camera_config.password,
        camera_id=camera_config.id,
    )
