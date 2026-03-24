"""PTZ Controller - Điều khiển Pan/Tilt/Zoom qua Uniview LAPI."""

import logging
import httpx
from enum import IntEnum
from typing import Optional

logger = logging.getLogger(__name__)


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
    """Điều khiển PTZ cho camera qua Uniview LAPI + Dahua CGI fallback."""

    LAPI_PTZ_PATH = "/LAPI/V1.0/Channel/0/PTZ/PTZCtrl"
    LAPI_PRESET_PATH = "/LAPI/V1.0/Channel/0/PTZ/Presets"
    DAHUA_CGI_PATH = "/cgi-bin/ptz.cgi"

    def __init__(self, camera_ip: str, username: str, password: str, port: int = 80):
        self.camera_ip = camera_ip
        self.username = username
        self.password = password
        self.port = port
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
        return await self._send_command(start_cmd, speed)

    async def stop(self, direction: str, speed: int = 6) -> dict:
        """Dừng di chuyển theo hướng."""
        if direction not in PTZ_DIRECTIONS:
            return {"success": False, "message": f"Invalid direction: {direction}"}
        _, stop_cmd = PTZ_DIRECTIONS[direction]
        return await self._send_command(stop_cmd, speed)

    # ── Preset Management ──────────────────────────────────

    async def set_preset(self, preset_number: int) -> dict:
        """Lưu vị trí hiện tại vào preset. Thử LAPI → Dahua CGI fallback."""
        # Try 1: Uniview LAPI
        result = await self._set_preset_lapi(preset_number)
        if result["success"]:
            return result

        # Try 2: Dahua CGI
        logger.info(f"LAPI set_preset failed, trying Dahua CGI for preset {preset_number}")
        return await self._set_preset_dahua(preset_number)

    async def goto_preset(self, preset_number: int) -> dict:
        """Di chuyển camera đến vị trí preset. Thử LAPI → Dahua CGI fallback."""
        # Try 1: Uniview LAPI
        result = await self._goto_preset_lapi(preset_number)
        if result["success"]:
            return result

        # Try 2: Dahua CGI
        logger.info(f"LAPI goto_preset failed, trying Dahua CGI for preset {preset_number}")
        return await self._goto_preset_dahua(preset_number)

    async def _set_preset_lapi(self, preset_number: int) -> dict:
        """Set preset qua Uniview LAPI."""
        url = f"{self._base_url}{self.LAPI_PRESET_PATH}/{preset_number}"
        payload = {"ID": preset_number, "Name": f"Preset_{preset_number}"}
        try:
            response = await self._send_request("put", url, json=payload)
            if response.status_code == 200:
                logger.info(f"LAPI set_preset {preset_number} -> {self.camera_ip}: OK")
                return {"success": True, "message": "OK", "method": "lapi"}
            return {"success": False, "message": f"LAPI HTTP {response.status_code}"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    async def _goto_preset_lapi(self, preset_number: int) -> dict:
        """Goto preset qua Uniview LAPI."""
        url = f"{self._base_url}{self.LAPI_PRESET_PATH}/{preset_number}/Goto"
        try:
            response = await self._send_request("put", url, json={"ID": preset_number})
            if response.status_code == 200:
                logger.info(f"LAPI goto_preset {preset_number} -> {self.camera_ip}: OK")
                return {"success": True, "message": "OK", "method": "lapi"}
            return {"success": False, "message": f"LAPI HTTP {response.status_code}"}
        except Exception as e:
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
            if response.status_code == 200:
                logger.info(f"Dahua set_preset {preset_number} -> {self.camera_ip}: OK")
                return {"success": True, "message": "OK", "method": "dahua_cgi"}
            return {"success": False, "message": f"Dahua CGI HTTP {response.status_code}"}
        except Exception as e:
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
            if response.status_code == 200:
                logger.info(f"Dahua goto_preset {preset_number} -> {self.camera_ip}: OK")
                return {"success": True, "message": "OK", "method": "dahua_cgi"}
            return {"success": False, "message": f"Dahua CGI HTTP {response.status_code}"}
        except Exception as e:
            return {"success": False, "message": str(e)}


def get_ptz_controller(camera_config) -> Optional[PTZController]:
    """Tạo PTZController từ CameraConfig."""
    return PTZController(
        camera_ip=camera_config.ip,
        username=camera_config.username,
        password=camera_config.password,
    )
