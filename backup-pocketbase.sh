#!/bin/bash
# ============================================
# PocketBase Backup to Google Drive
# Runs on VPS via cron
# Backs up SQLite DB + uploaded files to Google Drive
# ============================================

set -euo pipefail

# --- Configuration ---
PB_DIR="/opt/pocketbase"
PB_DATA="${PB_DIR}/pb_data"
BACKUP_DIR="/opt/pocketbase/backups"
RCLONE_REMOTE="gdrive"
GDRIVE_FOLDER="PocketBase-Backups"
RETENTION_DAYS=7
GDRIVE_RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="pb_backup_${TIMESTAMP}"
LOG_FILE="/var/log/pocketbase-backup.log"

# --- Logging helper ---
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

log "=== Starting PocketBase backup ==="

# --- Create backup directory ---
mkdir -p "${BACKUP_DIR}/${BACKUP_NAME}"

# --- Step 1: Safely backup SQLite database ---
log "Backing up SQLite database..."
if command -v sqlite3 &> /dev/null; then
    sqlite3 "${PB_DATA}/data.db" ".backup '${BACKUP_DIR}/${BACKUP_NAME}/data.db'"
    log "SQLite backup completed via sqlite3 .backup"
else
    log "ERROR: sqlite3 not found. Install it with: apt install sqlite3"
    exit 1
fi

# --- Step 2: Copy uploaded files (storage directory) ---
log "Copying storage directory..."
if [ -d "${PB_DATA}/storage" ]; then
    cp -r "${PB_DATA}/storage" "${BACKUP_DIR}/${BACKUP_NAME}/storage"
    log "Storage directory copied"
else
    log "No storage directory found, skipping"
fi

# --- Step 3: Compress backup ---
log "Compressing backup..."
cd "${BACKUP_DIR}"
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
rm -rf "${BACKUP_DIR}/${BACKUP_NAME}"
BACKUP_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
log "Backup compressed: ${BACKUP_NAME}.tar.gz (${BACKUP_SIZE})"

# --- Step 4: Upload to Google Drive ---
log "Uploading to Google Drive..."
if rclone copy "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/" --log-file="${LOG_FILE}" --log-level INFO; then
    log "Upload to Google Drive successful"
else
    log "ERROR: Upload to Google Drive failed!"
    exit 1
fi

# --- Step 5: Clean up old local backups ---
log "Cleaning up local backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "pb_backup_*.tar.gz" -mtime +${RETENTION_DAYS} -delete
log "Local cleanup done"

# --- Step 6: Clean up old remote backups ---
log "Cleaning up remote backups older than ${GDRIVE_RETENTION_DAYS} days..."
rclone delete "${RCLONE_REMOTE}:${GDRIVE_FOLDER}/" --min-age "${GDRIVE_RETENTION_DAYS}d" --log-file="${LOG_FILE}" --log-level INFO || true
log "Remote cleanup done"

log "=== Backup complete ==="
