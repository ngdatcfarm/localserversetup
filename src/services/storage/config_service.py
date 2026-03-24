"""Camera configuration storage service."""

import os
import yaml
from pathlib import Path
from typing import List, Optional
from src.models.camera import CameraConfig


class ConfigService:
    """Service to manage camera configurations."""

    def __init__(self, config_path: str = "config/cameras.yaml"):
        self.config_path = Path(config_path)
        self._ensure_config_exists()

    def _ensure_config_exists(self):
        """Create default config if not exists."""
        if not self.config_path.exists():
            self.config_path.parent.mkdir(parents=True, exist_ok=True)
            default_config = {
                "server": {"host": "0.0.0.0", "port": 8000},
                "cameras": [],
                "storage": {
                    "snapshot_dir": "data/snapshots",
                    "recording_dir": "data/recordings",
                    "export_dir": "data/exports"
                },
                "stream": {
                    "hls_dir": "data/hls",
                    "segment_duration": 2
                }
            }
            with open(self.config_path, 'w') as f:
                yaml.dump(default_config, f, default_flow_style=False)

    def load_config(self) -> dict:
        """Load full configuration."""
        with open(self.config_path, 'r') as f:
            return yaml.safe_load(f)

    def save_config(self, config: dict):
        """Save full configuration."""
        with open(self.config_path, 'w') as f:
            yaml.dump(config, f, default_flow_style=False, sort_keys=False)

    def get_cameras(self) -> List[CameraConfig]:
        """Get all camera configurations."""
        config = self.load_config()
        cameras = []
        for cam_data in config.get('cameras', []):
            try:
                cameras.append(CameraConfig(**cam_data))
            except Exception as e:
                print(f"Error loading camera {cam_data.get('id')}: {e}")
        return cameras

    def get_camera(self, camera_id: str) -> Optional[CameraConfig]:
        """Get single camera by ID."""
        cameras = self.get_cameras()
        for cam in cameras:
            if cam.id == camera_id:
                return cam
        return None

    def add_camera(self, camera: CameraConfig) -> CameraConfig:
        """Add new camera."""
        config = self.load_config()
        config.setdefault('cameras', [])

        # Check duplicate
        for existing in config['cameras']:
            if existing['id'] == camera.id:
                raise ValueError(f"Camera {camera.id} already exists")

        config['cameras'].append(camera.model_dump())
        self.save_config(config)
        return camera

    def update_camera(self, camera: CameraConfig) -> CameraConfig:
        """Update existing camera."""
        config = self.load_config()
        found = False

        for i, existing in enumerate(config.get('cameras', [])):
            if existing['id'] == camera.id:
                config['cameras'][i] = camera.model_dump()
                found = True
                break

        if not found:
            raise ValueError(f"Camera {camera.id} not found")

        self.save_config(config)
        return camera

    def delete_camera(self, camera_id: str) -> bool:
        """Delete camera by ID."""
        config = self.load_config()
        original_len = len(config.get('cameras', []))
        config['cameras'] = [c for c in config.get('cameras', []) if c['id'] != camera_id]

        if len(config['cameras']) == original_len:
            return False

        self.save_config(config)
        return True

    def get_server_config(self) -> dict:
        """Get server configuration."""
        config = self.load_config()
        return config.get('server', {"host": "0.0.0.0", "port": 8000})

    def get_storage_config(self) -> dict:
        """Get storage configuration."""
        config = self.load_config()
        return config.get('storage', {})

    def get_stream_config(self) -> dict:
        """Get stream configuration."""
        config = self.load_config()
        return config.get('stream', {})

    # ── Preset Management ──────────────────────────────────

    def get_presets(self, camera_id: str) -> list:
        """Get presets for a camera."""
        config = self.load_config()
        return config.get('presets', {}).get(camera_id, [])

    def set_preset(self, camera_id: str, number: int, name: str, pan: int = 0, tilt: int = 0) -> dict:
        """Add or update a preset for a camera with relative position."""
        config = self.load_config()
        config.setdefault('presets', {})
        config['presets'].setdefault(camera_id, [])

        # Update existing or add new
        for preset in config['presets'][camera_id]:
            if preset['number'] == number:
                preset['name'] = name
                preset['pan'] = pan
                preset['tilt'] = tilt
                self.save_config(config)
                return preset

        new_preset = {"number": number, "name": name, "pan": pan, "tilt": tilt}
        config['presets'][camera_id].append(new_preset)
        self.save_config(config)
        return new_preset

    def delete_preset(self, camera_id: str, number: int) -> bool:
        """Delete a preset."""
        config = self.load_config()
        presets = config.get('presets', {}).get(camera_id, [])
        original_len = len(presets)
        config['presets'][camera_id] = [p for p in presets if p['number'] != number]

        if len(config['presets'][camera_id]) == original_len:
            return False

        self.save_config(config)
        return True
