@echo off
cd /d "C:\Local server"
set PYTHONPATH=.
python -c 'import sys; sys.path.insert(0, "C:/Local/server"); from src.server.main import app; import uvicorn; uvicorn.run(app, host="0.0.0.0", port=8002)'
