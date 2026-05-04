"""Camera Preset Service - Config-based preset management (system 1).

Presets are stored in cameras.yaml config file with structure:
  presets:
    cam_001:
    - number: 1
      name: window
      pan: -2
      tilt: 0
"""

import logging
import asyncio
import time
from typing import List, Optional, Dict, Any

from src.services.storage.config_service import ConfigService
from src.cameras.ptz.ptz_controller import get_ptz_controller

logger = logging.getLogger(__name__)


class PresetService:
    """Service for managing camera presets via config file."""

    def __init__(self):
        self.config_service = ConfigService()

    # ── Config-based CRUD Operations ────────────────────────

    def get_presets(self, camera_id: str) -> List[Dict[str, Any]]:
        """Get all presets for a camera from config."""
        presets = self.config_service.get_presets(camera_id)
        # Add 'id' field mapped from 'number' for frontend compatibility
        for p in presets:
            p['id'] = p.get('number')
            p['preset_type'] = 'ptz_position'
            p['config'] = {'pan': p.get('pan', 0), 'tilt': p.get('tilt', 0)}
        return presets

    def get_preset_by_id(self, preset_id: int, camera_id: str = None) -> Optional[Dict[str, Any]]:
        """Get a single preset by number (id for frontend)."""
        # If camera_id not provided, search all cameras
        if camera_id:
            presets = self.config_service.get_presets(camera_id)
            for p in presets:
                if p.get('number') == preset_id:
                    p['id'] = p.get('number')
                    p['preset_type'] = 'ptz_position'
                    p['config'] = {'pan': p.get('pan', 0), 'tilt': p.get('tilt', 0), 'preset_number': p.get('number')}
                    return p
        else:
            # Search all cameras
            config = self.config_service.load_config()
            for cam_id, presets in config.get('presets', {}).items():
                for p in presets:
                    if p.get('number') == preset_id:
                        p['id'] = p.get('number')
                        p['preset_type'] = 'ptz_position'
                        p['config'] = {'pan': p.get('pan', 0), 'tilt': p.get('tilt', 0), 'preset_number': p.get('number')}
                        return p
        return None

    def get_active_presets(self, camera_id: str, preset_type: str = None) -> List[Dict[str, Any]]:
        """Get all presets (config has no is_active concept)."""
        presets = self.get_presets(camera_id)
        if preset_type:
            presets = [p for p in presets if p.get('preset_type') == preset_type]
        return presets

    def create_preset(
        self,
        camera_id: str,
        preset_type: str = 'ptz_position',
        name: str = None,
        config: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Create a new preset. Finds next available number."""
        if preset_type not in ['ptz_position']:
            raise ValueError(f"Invalid preset_type: {preset_type}. Only ptz_position supported in config-based system.")

        # Find next available preset number
        existing = self.config_service.get_presets(camera_id)
        used_numbers = [p.get('number', 0) for p in existing]
        preset_number = 1
        while preset_number in used_numbers:
            preset_number += 1

        # Extract pan/tilt from config
        pan = config.get('pan', 0) if config else 0
        tilt = config.get('tilt', 0) if config else 0
        preset_name = name or f"preset_{preset_number}"

        # Save to config
        self.config_service.set_preset(camera_id, preset_number, preset_name, pan, tilt)

        return {
            'id': preset_number,
            'number': preset_number,
            'name': preset_name,
            'pan': pan,
            'tilt': tilt,
            'preset_type': 'ptz_position',
            'config': {'pan': pan, 'tilt': tilt}
        }

    def update_preset(
        self,
        preset_id: int,
        camera_id: str = None,
        name: str = None,
        config: Dict[str, Any] = None,
        is_active: bool = None
    ) -> Optional[Dict[str, Any]]:
        """Update an existing preset by number."""
        preset = self.get_preset_by_id(preset_id, camera_id)
        if not preset:
            return None

        preset_number = preset_id
        cam_id = camera_id or preset.get('camera_id')

        # Get current values
        current_name = name if name is not None else preset.get('name', f"preset_{preset_number}")
        current_pan = config.get('pan', 0) if config else preset.get('pan', 0)
        current_tilt = config.get('tilt', 0) if config else preset.get('tilt', 0)

        # Update via config service
        self.config_service.set_preset(cam_id, preset_number, current_name, current_pan, current_tilt)

        return {
            'id': preset_number,
            'number': preset_number,
            'name': current_name,
            'pan': current_pan,
            'tilt': current_tilt,
            'preset_type': 'ptz_position',
            'config': {'pan': current_pan, 'tilt': current_tilt}
        }

    def delete_preset(self, preset_id: int, camera_id: str = None) -> bool:
        """Delete a preset by number."""
        if camera_id:
            return self.config_service.delete_preset(camera_id, preset_id)
        else:
            # Need to find which camera has this preset
            config = self.config_service.load_config()
            for cam_id, presets in config.get('presets', {}).items():
                for p in presets:
                    if p.get('number') == preset_id:
                        return self.config_service.delete_preset(cam_id, preset_id)
        return False

    # ── Execution ──────────────────────────────────────────

    async def execute_preset(self, preset_id: int, camera_id: str = None) -> Dict[str, Any]:
        """Execute a preset's action (go to PTZ, capture snapshots, record video)."""
        # Find the preset - need to know camera_id for config-based lookup
        if not camera_id:
            # Search all cameras to find preset
            config = self.config_service.load_config()
            for cam_id, presets in config.get('presets', {}).items():
                for p in presets:
                    if p.get('number') == preset_id:
                        camera_id = cam_id
                        break
                if camera_id:
                    break

        if not camera_id:
            return {"success": False, "message": f"Preset {preset_id} not found"}

        preset = self.get_preset_by_id(preset_id, camera_id)
        if not preset:
            return {"success": False, "message": f"Preset {preset_id} not found"}

        preset_type = preset.get('preset_type', 'ptz_position')
        config = preset.get('config') or {}
        cam_id = preset.get('camera_id') or camera_id

        if preset_type == 'ptz_position':
            return await self._execute_ptz(cam_id, config)
        elif preset_type == 'snapshot':
            return await self._execute_snapshot(cam_id, config)
        elif preset_type == 'video':
            return await self._execute_video(cam_id, config)
        elif preset_type == 'alert_trigger':
            return await self._execute_alert(cam_id, config)
        else:
            return {"success": False, "message": f"Unknown preset type: {preset_type}"}

    async def _execute_ptz(self, camera_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Execute PTZ position preset - use hardware preset only."""
        camera = self.config_service.get_camera(camera_id)
        if not camera:
            return {"success": False, "message": f"Camera {camera_id} not found"}

        preset_number = config.get('preset_number')
        if not preset_number:
            return {"success": False, "message": "No preset_number in config"}

        controller = get_ptz_controller(camera)
        if not controller:
            return {"success": False, "message": "PTZ controller not available"}

        # Use hardware preset goto
        result = await controller.goto_preset(preset_number)
        return result

    async def _execute_snapshot(self, camera_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Execute snapshot preset - capture multiple photos."""
        from src.cameras.capture.camera_manager import camera_manager
        import cv2
        from pathlib import Path
        from datetime import datetime

        count = config.get('count', 1)
        interval = config.get('interval_sec', 2)

        # Ensure snapshot dir exists
        snapshot_dir = Path("data/snapshots")
        snapshot_dir.mkdir(parents=True, exist_ok=True)

        camera_info = camera_manager.get_camera(camera_id)
        if not camera_info or not camera_info.client:
            return {"success": False, "message": f"Camera {camera_id} not available"}

        results = []
        for i in range(count):
            raw_frame = camera_info.client.get_latest_frame()
            if raw_frame is None:
                results.append({"success": False, "message": "No frame"})
                continue

            jpeg_bytes = cv2.imencode('.jpg', raw_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes()

            # Save to disk
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{camera_id}_{ts}_{i+1}.jpg"
            filepath = snapshot_dir / filename
            Path(filepath).write_bytes(jpeg_bytes)

            results.append({"success": True, "path": str(filepath), "filename": filename})

            if i < count - 1 and interval > 0:
                await asyncio.sleep(interval)

        all_ok = all(r.get('success', False) for r in results)
        return {
            "success": all_ok,
            "message": f"Snapshot {count}x done",
            "results": results,
            "camera_id": camera_id
        }

    async def _execute_video(self, camera_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Execute video preset - record for specified duration."""
        from src.services.storage.recording_service import recording_service

        duration = config.get('duration_sec', 10)

        # Start recording
        recording_service.start_recording(camera_id)

        # Wait for duration
        await asyncio.sleep(duration)

        # Stop recording
        recording_service.stop_recording(camera_id)

        return {
            "success": True,
            "message": f"Recorded {duration}s video",
            "camera_id": camera_id,
            "duration_sec": duration
        }

    async def _execute_alert(self, camera_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Execute alert trigger preset - log alert for external system."""
        event_types = config.get('event_types', [])
        logger.info(f"Alert trigger preset executed for {camera_id}: {event_types}")

        return {
            "success": True,
            "message": f"Alert triggered: {event_types}",
            "camera_id": camera_id,
            "event_types": event_types
        }


# Global instance
preset_service = PresetService()