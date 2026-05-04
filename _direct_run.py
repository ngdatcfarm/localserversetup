"""Direct server runner - bypasses -m uvicorn import issue."""
import sys
sys.path.insert(0, 'C:/Local/server')

from src.server.main import app
import uvicorn

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8002, log_level="info")
