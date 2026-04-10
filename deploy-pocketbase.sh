#!/bin/bash
# ============================================
# PocketBase VPS Deployment Script (Ubuntu)
# Run this on your VPS as root or with sudo.
# Exposes PocketBase only through Nginx/HTTPS, not public port 8090.
# ============================================

set -e

echo "=== PocketBase VPS Deployment ==="

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo."
  exit 1
fi

# --- 1. Update system ---
echo "[1/6] Updating system..."
apt update && apt upgrade -y

# --- 2. Install essentials ---
echo "[2/6] Installing essentials..."
apt install -y unzip wget ufw

# --- 3. Download PocketBase ---
echo "[3/6] Downloading PocketBase..."
PB_VERSION="0.25.9"
id -u pocketbase >/dev/null 2>&1 || useradd --system --home /opt/pocketbase --shell /usr/sbin/nologin pocketbase
mkdir -p /opt/pocketbase
cd /opt/pocketbase
wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -O pocketbase.zip
unzip -o pocketbase.zip
rm pocketbase.zip
chmod +x pocketbase
mkdir -p /opt/pocketbase/pb_data
chown -R pocketbase:pocketbase /opt/pocketbase

echo "PocketBase binary ready at /opt/pocketbase/pocketbase"

# --- 4. Create systemd service ---
echo "[4/6] Creating systemd service..."
cat > /etc/systemd/system/pocketbase.service << 'EOF'
[Unit]
Description=PocketBase
After=network.target

[Service]
Type=simple
User=pocketbase
Group=pocketbase
WorkingDirectory=/opt/pocketbase
ExecStart=/opt/pocketbase/pocketbase serve --http=127.0.0.1:8090
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pocketbase
systemctl start pocketbase

echo "PocketBase service started on 127.0.0.1:8090"

# --- 5. Configure firewall ---
echo "[5/6] Configuring firewall..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable

echo "Firewall configured"

# --- 6. Done ---
echo ""
echo "=== DEPLOYMENT COMPLETE ==="
echo ""
echo "PocketBase is listening only on localhost:8090"
echo ""
echo "NEXT STEPS:"
echo "1. Create an SSH tunnel when you need the PocketBase admin UI: ssh -L 8090:127.0.0.1:8090 root@YOUR_VPS_IP"
echo "2. Open http://127.0.0.1:8090/_/ locally through the tunnel to create the admin account"
echo "3. Create your collections: shops, shop_users, inventory, transactions, photos, app_settings"
echo "4. Put Nginx in front with HTTPS and update your app to use the HTTPS domain"
echo ""
echo "For HTTPS with domain (recommended), run: deploy-nginx-ssl.sh yourdomain.com admin@example.com"
