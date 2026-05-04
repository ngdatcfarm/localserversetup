"""Run server directly without uvicorn module."""
import sys
sys.path.insert(0, 'C:/Local/server')

# Import the app first
from src.server.main import app

# Use uvicorn's run function
import uvicorn
uvicorn.run(app, host="0.0.0.0", port=8002, log_level="info")
