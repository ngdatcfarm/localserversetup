"""Server routes package."""

from .cameras import router as cameras_router
from .ptz import router as ptz_router
from .recording import router as recording_router
from .sync import router as sync_router

__all__ = ["cameras_router", "ptz_router", "recording_router", "sync_router"]
