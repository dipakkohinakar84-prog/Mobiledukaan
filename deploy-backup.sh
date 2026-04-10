#!/bin/bash
# ============================================
# Deploy PocketBase Backup System
# Run this on your VPS as root or with sudo
# Sets up: rclone, backup script, cron job
# ============================================

set -e

echo "=== PocketBase Backup System Setup ==="

# --- 1. Install dependencies ---
echo "[1/5] Installing dependencies..."
apt update
apt install -y sqlite3 rclone

echo "sqlite3 and rclone installed"

# --- 2. Create backup directory ---
echo "[2/5] Creating backup directory..."
mkdir -p /opt/pocketbase/backups
touch /var/log/pocketbase-backup.log

# --- 3. Deploy backup script ---
echo "[3/5] Installing backup script..."
cp backup-pocketbase.sh /opt/pocketbase/backup-pocketbase.sh
chmod +x /opt/pocketbase/backup-pocketbase.sh

echo "Backup script installed at /opt/pocketbase/backup-pocketbase.sh"

# --- 4. Configure rclone for Google Drive ---
echo "[4/5] Configuring rclone..."
echo ""
echo "You need a Google Cloud Service Account for headless backup."
echo ""
echo "PREREQUISITE STEPS (do these before continuing):"
echo "  1. Go to https://console.cloud.google.com/"
echo "  2. Create a project (or use existing)"
echo "  3. Enable 'Google Drive API' for the project"
echo "  4. Go to IAM & Admin > Service Accounts > Create Service Account"
echo "  5. Create a JSON key and download it"
echo "  6. Copy the JSON key to this VPS at: /opt/pocketbase/service-account.json"
echo "  7. In Google Drive, create a folder called 'PocketBase-Backups'"
echo "  8. Share that folder with the service account email"
echo "     (the email looks like: name@project.iam.gserviceaccount.com)"
echo "  9. Open the shared folder in Drive and copy the folder ID from the URL"
echo "     (URL looks like: https://drive.google.com/drive/folders/FOLDER_ID)"
echo ""

read -p "Path to service account JSON key [/opt/pocketbase/service-account.json]: " SA_KEY_PATH
SA_KEY_PATH="${SA_KEY_PATH:-/opt/pocketbase/service-account.json}"

if [ ! -f "${SA_KEY_PATH}" ]; then
    echo "ERROR: Service account key not found at ${SA_KEY_PATH}"
    echo "Please copy it there and re-run this script."
    exit 1
fi

read -p "Google Drive folder ID (from URL of shared folder): " FOLDER_ID

if [ -z "${FOLDER_ID}" ]; then
    echo "ERROR: Folder ID is required"
    exit 1
fi

# Create rclone config
mkdir -p /root/.config/rclone
cat > /root/.config/rclone/rclone.conf << EOF
[gdrive]
type = drive
scope = drive
service_account_file = ${SA_KEY_PATH}
root_folder_id = ${FOLDER_ID}
EOF

chmod 600 /root/.config/rclone/rclone.conf
chmod 600 "${SA_KEY_PATH}"

echo "rclone configured"

# Verify rclone connection
echo "Verifying Google Drive connection..."
if rclone lsd gdrive: 2>/dev/null; then
    echo "Google Drive connection verified!"
else
    echo "WARNING: Could not list Google Drive. Check your service account setup."
    echo "You can test manually with: rclone lsd gdrive:"
fi

# --- 5. Set up cron job ---
echo "[5/5] Setting up daily cron job..."

# Run daily at 3:00 AM server time
CRON_LINE="0 3 * * * /opt/pocketbase/backup-pocketbase.sh >> /var/log/pocketbase-backup.log 2>&1"

# Add to crontab (avoid duplicates)
(crontab -l 2>/dev/null | grep -v "backup-pocketbase.sh"; echo "${CRON_LINE}") | crontab -

echo "Cron job installed: daily at 3:00 AM"

echo ""
echo "=== BACKUP SYSTEM SETUP COMPLETE ==="
echo ""
echo "Backup script: /opt/pocketbase/backup-pocketbase.sh"
echo "Local backups: /opt/pocketbase/backups/"
echo "Log file:      /var/log/pocketbase-backup.log"
echo "Schedule:      Daily at 3:00 AM"
echo ""
echo "To test now:   sudo /opt/pocketbase/backup-pocketbase.sh"
echo "To view logs:  tail -f /var/log/pocketbase-backup.log"
echo "To check cron: crontab -l"
echo ""
