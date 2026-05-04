# ===========================================
# CFarm Local Server - Backup Script
# Auto backup to F:/Backup/cfarm_backup
# ===========================================

$ErrorActionPreference = "Stop"

$PROJECT_DIR = "C:\Local server"
$BACKUP_DIR = "F:\Backup\cfarm_backup"
$DATE = Get-Date -Format "yyyy-MM-dd_HH-mm"
$BACKUP_NAME = "cfarm_backup_$DATE"

# Docker volumes
$DOCKER_DB_DATA = "$PROJECT_DIR\docker\db\data"
$DOCKER_MOSQUITTO_CONFIG = "$PROJECT_DIR\docker\mosquitto\config"
$DOCKER_MOSQUITTO_DATA = "$PROJECT_DIR\docker\mosquitto\data"

# Backup paths
$BACKUP_PATH = "$BACKUP_DIR\$BACKUP_NAME"
$SOURCE_CODE_PATH = "$BACKUP_PATH\source"
$DOCKER_DATA_PATH = "$BACKUP_PATH\docker_data"
$CONFIG_PATH = "$BACKUP_PATH\config"

Write-Host "=== CFarm Local Server Backup ===" -ForegroundColor Cyan
Write-Host "Backup to: $BACKUP_PATH"

# Create backup directory
New-Item -ItemType Directory -Path $BACKUP_PATH -Force | Out-Null
New-Item -ItemType Directory -Path "$SOURCE_CODE_PATH" -Force | Out-Null
New-Item -ItemType Directory -Path "$DOCKER_DATA_PATH" -Force | Out-Null
New-Item -ItemType Directory -Path "$CONFIG_PATH" -Force | Out-Null

# 1. Stop Docker containers (to ensure data consistency)
Write-Host "`n[1/5] Stopping Docker containers..." -ForegroundColor Yellow
docker-compose -f "$PROJECT_DIR\docker-compose.yml" stop db mqtt
Start-Sleep -Seconds 2

# 2. Backup source code (exclude large folders)
Write-Host "`n[2/5] Backing up source code..." -ForegroundColor Yellow
$EXCLUDE = @("node_modules", ".git", "__pycache__", "*.pyc", "data/recordings", "data/exports", "logs", "cache", ".claude")
$RsyncArgs = $EXCLUDE | ForEach-Object { "--exclude=$_" }
# Using robocopy for Windows
robocopy "$PROJECT_DIR" "$SOURCE_CODE_PATH" /MIR /XF "*.log" "*.db" "*.pyc" "local_server.db" "token_debug.txt" "server.log" "sync_debug.log" /XD "logs" "cache" ".claude" "data/recordings" "data/exports" "node_modules" ".git" 2>&1 | Out-Null

# 3. Backup Docker volumes (PostgreSQL data + Mosquitto config)
Write-Host "`n[3/5] Backing up Docker volumes..." -ForegroundColor Yellow
if (Test-Path $DOCKER_DB_DATA) {
    robocopy "$DOCKER_DB_DATA" "$DOCKER_DATA_PATH\db\data" /MIR 2>&1 | Out-Null
    Write-Host "  - PostgreSQL data backed up"
}

if (Test-Path $DOCKER_MOSQUITTO_CONFIG) {
    robocopy "$DOCKER_MOSQUITTO_CONFIG" "$DOCKER_DATA_PATH\mosquitto\config" /MIR 2>&1 | Out-Null
    Write-Host "  - Mosquitto config backed up"
}

# 4. Backup config files
Write-Host "`n[4/5] Backing up config files..." -ForegroundColor Yellow
robocopy "$PROJECT_DIR\config" "$CONFIG_PATH" /MIR 2>&1 | Out-Null
robocopy "$PROJECT_DIR\firmware" "$BACKUP_PATH\firmware" /MIR 2>&1 | Out-Null

# 5. Restart Docker containers
Write-Host "`n[5/5] Restarting Docker containers..." -ForegroundColor Yellow
docker-compose -f "$PROJECT_DIR\docker-compose.yml" start db mqtt | Out-Null

# Create latest symlink
$LATEST_LINK = "$BACKUP_DIR\latest"
if (Test-Path $LATEST_LINK) {
    Remove-Item $LATEST_LINK -Force
}
New-Item -ItemType Junction -Path $LATEST_LINK -Target $BACKUP_PATH | Out-Null

# Cleanup old backups (keep last 7)
Write-Host "`n[Cleanup] Keeping last 7 backups..." -ForegroundColor Cyan
$backups = Get-ChildItem -Path $BACKUP_DIR -Directory | Where-Object { $_.Name -like "cfarm_backup_*" } | Sort-Object LastWriteTime -Descending
$toDelete = $backups | Select-Object -Skip 7
foreach ($dir in $toDelete) {
    Write-Host "  - Deleting old backup: $($dir.Name)"
    Remove-Item $dir.FullName -Recurse -Force
}

$backupSize = (Get-ChildItem $BACKUP_PATH -Recurse | Measure-Object -Property Length -Sum).Sum / 1GB
Write-Host "`n=== Backup Complete! ===" -ForegroundColor Green
Write-Host "Backup location: $BACKUP_PATH"
Write-Host "Backup size: $([math]::Round($backupSize, 2)) GB"
Write-Host "Symlink: $LATEST_LINK -> $BACKUP_PATH"
