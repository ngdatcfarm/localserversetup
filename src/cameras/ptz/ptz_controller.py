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
    """Điều khiển PTZ cho camera qua Uniview LAPI."""

    LAPI_PATH = "/LAPI/V1.0/Channel/0/PTZ/PTZCtrl"

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

    async def _send_command(self, cmd: int, speed: int = 6) -> dict:
        """Gửi lệnh PTZ đến camera."""
        url = f"{self._base_url}{self.LAPI_PATH}"
        payload = self._build_payload(cmd, speed)
        auth = httpx.DigestAuth(self.username, self.password)

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.put(url, json=payload, auth=auth)

                if response.status_code == 200:
                    logger.info(f"PTZ cmd {cmd} -> {self.camera_ip}: OK")
                    return {"success": True, "message": "OK"}

                # Some cameras use Basic auth instead of Digest
                if response.status_code == 401:
                    response = await client.put(
                        url, json=payload,
                        auth=(self.username, self.password)
                    )
                    if response.status_code == 200:
                        logger.info(f"PTZ cmd {cmd} -> {self.camera_ip}: OK (basic auth)")
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


def get_ptz_controller(camera_config) -> Optional[PTZController]:
    """Tạo PTZController từ CameraConfig."""
    return PTZController(
        camera_ip=camera_config.ip,
        username=camera_config.username,
        password=camera_config.password,
    )
