"""Wrapper to run the server with correct PYTHONPATH."""
import sys
sys.path.insert(0, 'C:/Local/server')

from src.server.main import app
import uvicorn

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
