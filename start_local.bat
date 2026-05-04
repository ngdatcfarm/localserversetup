@echo off
cd /d "C:\Local server"
set PYTHONPATH=.
python -m uvicorn src.server.main:app --host 0.0.0.0 --port 8002
