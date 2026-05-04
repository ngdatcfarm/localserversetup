"""PTZ Controller - Điều khiển Pan/Tilt/Zoom qua Uniview LAPI."""

import logging
import httpx
from enum import IntEnum
from typing import Optional, Dict

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
        # Shared client with connection pooling for better performance
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create shared HTTP client with connection pooling."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                auth=httpx.DigestAuth(self.username, self.password),
                timeout=5.0,
                limits=httpx.Limits(max_keepalive_connections=10, max_connections=20)
            )
        return self._client

    async def _close_client(self):
        """Close the shared client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    def _build_payload(self, cmd: int, speed: int = 6) -> dict:
        return {
            "PTZCmd": cmd,
            "ContinueTime": 0,
            "Para1": speed,
            "Para2": speed,
            "Para3": 0,
        }

    # Class-level sync client pool (process-wide, reused across threads)
    _sync_clients: Dict[str, httpx.Client] = {}
    _sync_client_warmed: set = set()  # Track which clients have been warmed up

    def _get_sync_client(self) -> httpx.Client:
        """Get or create sync HTTP client for this camera (shared across threads)."""
        key = f"{self.camera_ip}:{self.username}"
        if key not in PTZController._sync_clients or PTZController._sync_clients[key].is_closed:
            PTZController._sync_clients[key] = httpx.Client(
                auth=httpx.DigestAuth(self.username, self.password),
                timeout=5.0
            )
            PTZController._sync_client_warmed.discard(key)
        return PTZController._sync_clients[key]

    def _warmup_auth(self):
        """Pre-authenticate the client by sending a harmless request first."""
        key = f"{self.camera_ip}:{self.username}"
        if key in PTZController._sync_client_warmed:
            return
        try:
            client = self._get_sync_client()
            # Send a GET request to warm up digest auth (won't trigger PTZ movement)
            test_url = f"{self._base_url}{self.LAPI_PTZ_PATH}"
            # Use a quick timeout for warmup
            temp_client = httpx.Client(auth=httpx.DigestAuth(self.username, self.password), timeout=2.0)
            try:
                temp_client.get(test_url)
            finally:
                temp_client.close()
            PTZController._sync_client_warmed.add(key)
        except Exception as e:
            logger.debug(f"Auth warmup for {self.camera_ip}: {e}")

    def _send_request_sync(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Send HTTP request synchronously using sync httpx client."""
        # Warm up auth on first request per process (avoids 401 on first PTZ cmd)
        self._warmup_auth()
        client = self._get_sync_client()
        return getattr(client, method)(url, **kwargs)

    async def _send_request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Gửi HTTP request - use sync version in executor to avoid asyncio overhead."""
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,  # Use default executor (thread pool)
            lambda: self._send_request_sync(method, url, **kwargs)
        )

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

    async def rectify(self) -> dict:
        """Gửi lệnh Rectify (Tare) - đặt vị trí hiện tại làm gốc tọa độ."""
        url = f"{self._base_url}{self.LAPI_RECTIFY_PATH}"
        try:
            response = await self._send_request("put", url, json={})
            if response.status_code == 200:
                data = response.json()
                logger.info(f"Rectify {self.camera_ip}: {data}")
                return {"success": True, "message": "Rectified", "raw": data}
            return {"success": False, "message": f"HTTP {response.status_code}"}
        except Exception as e:
            logger.error(f"Rectify error: {e}")
            return {"success": False, "message": str(e)}

    def on_camera_online(self):
        """Gọi khi camera online trở lại."""
        if not self.camera_id:
            return
        logger.info(f"Camera {self.camera_id} online")

    def on_camera_offline(self):
        """Gọi khi camera mất kết nối."""
        if not self.camera_id:
            return
        logger.info(f"Camera {self.camera_id} offline")

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

                # Lưu vào config để backup (chỉ number, name, camera_id)
                if self.camera_id:
                    from src.services.storage.config_service import ConfigService
                    config_svc = ConfigService()
                    config_svc.set_preset(self.camera_id, preset_number, preset_name, 0, 0)

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

    async def goto_preset(self, preset_number: int) -> dict:
        """Di chuyển camera đến vị trí preset (chỉ dùng hardware preset)."""
        url = f"{self._base_url}{self.LAPI_PRESET_GOTO_PATH.format(preset_number)}"
        try:
            response = await self._send_request("put", url, json={"ID": preset_number})
            if response.status_code == 200:
                data = response.json()
                resp_code = data.get("Response", {}).get("ResponseCode", -1)
                # ResponseCode 0 = success, 2 = invalid args, 3 = not found
                if resp_code == 0:
                    logger.info(f"Goto preset {preset_number}: success")
                    return {"success": True, "message": "OK", "method": "unv_lapi", "raw": data}
                else:
                    logger.info(f"UNV goto preset {preset_number} failed with ResponseCode={resp_code}")
                    return {"success": False, "message": f"Camera error: ResponseCode={resp_code}"}
            return {"success": False, "message": f"HTTP {response.status_code}"}
        except Exception as e:
            logger.error(f"Goto preset error: {e}")
            return {"success": False, "message": str(e)}

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


# Cache for PTZController instances (per camera)
_ptz_controller_cache: Dict[str, PTZController] = {}


def get_ptz_controller(camera_config) -> Optional[PTZController]:
    """Get or create cached PTZController for a camera."""
    camera_id = camera_config.id
    if camera_id not in _ptz_controller_cache:
        _ptz_controller_cache[camera_id] = PTZController(
            camera_ip=camera_config.ip,
            username=camera_config.username,
            password=camera_config.password,
            camera_id=camera_config.id,
        )
    return _ptz_controller_cache[camera_id]


def close_all_ptz_clients():
    """Close all cached PTZ client connections."""
    import asyncio
    for controller in _ptz_controller_cache.values():
        asyncio.create_task(controller._close_client())
    _ptz_controller_cache.clear()
