@echo off
echo postgres | "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d cfarm_local -f "scripts\008_fix_sync_compatibility.sql"
pause