"""Camera models and configuration."""

from typing import Optional
from pydantic import BaseModel, Field


class CameraConfig(BaseModel):
    """Camera configuration model."""
    id: str = Field(..., description="Unique camera identifier")
    name: str = Field(..., description="Camera name")
    ip: str = Field(..., description="Camera IP address")
    port: int = Field(default=554, description="RTSP port")
    username: str = Field(..., description="Camera username")
    password: str = Field(..., description="Camera password")
    rtsp_path: str = Field(default="/stream1", description="RTSP path")
    enabled: bool = Field(default=True, description="Enable/disable camera")
    stream_type: str = Field(default="main", description="main or sub stream")

    @property
    def rtsp_url(self) -> str:
        """Generate RTSP URL."""
        # Handle special characters in password
        import urllib.parse
        encoded_password = urllib.parse.quote(self.password, safe='')
        return f"rtsp://{self.username}:{encoded_password}@{self.ip}:{self.port}{self.rtsp_path}"

    class Config:
        json_schema_extra = {
            "example": {
                "id": "cam_001",
                "name": "Camera cổng",
                "ip": "192.168.1.27",
                "port": 554,
                "username": "admin",
                "password": "Abc@@1234",
                "rtsp_path": "/unicast/c1/s0/live",
                "enabled": True,
                "stream_type": "main"
            }
        }


class CameraStatus(BaseModel):
    """Camera runtime status."""
    id: str
    online: bool = False
    fps: float = 0.0
    resolution: Optional[tuple[int, int]] = None
    last_frame: Optional[str] = None  # timestamp
    error: Optional[str] = None
