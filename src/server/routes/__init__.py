"""Server routes package."""
from .cameras import router as cameras_router
from .ptz import router as ptz_router

__all__ = ["cameras_router", "ptz_router"]
