"""
Auto backup PostgreSQL to F: drive
Chạy mỗi ngày hoặc manual
"""

import subprocess
import shutil
from datetime import datetime
from pathlib import Path

BACKUP_DIR = Path("F:/cfarm_backup")
DB_CONTAINER = "cfarm-db"
DB_NAME = "cfarm_local"
DB_USER = "cfarm"

def ensure_backup_dir():
    """Ensure backup directory exists."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    return True

def cleanup_old_backups(days=7):
    """Xóa backup cũ hơn N ngày."""
    cutoff = datetime.now().timestamp() - (days * 86400)
    for f in BACKUP_DIR.glob("cfarm_backup_*.dump"):
        if f.stat().st_mtime < cutoff:
            f.unlink()
            print(f"Deleted old backup: {f.name}")

def backup_database():
    """Backup PostgreSQL database."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUP_DIR / f"cfarm_backup_{timestamp}.dump"

    print(f"Starting backup to {backup_file}...")

    try:
        # pg_dump from Docker container
        result = subprocess.run([
            "docker", "exec", DB_CONTAINER,
            "pg_dump", "-U", DB_USER, "-Fc", "-f", f"/tmp/backup_{timestamp}.dump",
            DB_NAME
        ], capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            print(f"pg_dump failed: {result.stderr}")
            return False

        # Copy from container to host
        subprocess.run([
            "docker", "cp",
            f"{DB_CONTAINER}:/tmp/backup_{timestamp}.dump",
            str(backup_file)
        ], capture_output=True, text=True, timeout=60)

        # Cleanup temp file in container
        subprocess.run([
            "docker", "exec", DB_CONTAINER,
            "rm", f"/tmp/backup_{timestamp}.dump"
        ], capture_output=True, text=True)

        size = backup_file.stat().st_size
        print(f"Backup successful: {backup_file.name} ({size // 1024 // 1024}MB)")

        # Cleanup old backups
        cleanup_old_backups(7)

        return True

    except Exception as e:
        print(f"Backup failed: {e}")
        return False

if __name__ == "__main__":
    success = backup_database()
    exit(0 if success else 1)