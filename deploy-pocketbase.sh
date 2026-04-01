#!/bin/bash
# ============================================
# PocketBase VPS Deployment Script (Ubuntu)
# Run this on your VPS as root or with sudo
# ============================================

set -e

echo "=== PocketBase VPS Deployment ==="

# --- 1. Update system ---
echo "[1/6] Updating system..."
apt update && apt upgrade -y

# --- 2. Install essentials ---
echo "[2/6] Installing essentials..."
apt install -y unzip wget ufw

# --- 3. Download PocketBase ---
echo "[3/6] Downloading PocketBase..."
PB_VERSION="0.25.9"
mkdir -p /opt/pocketbase
cd /opt/pocketbase
wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -O pocketbase.zip
unzip -o pocketbase.zip
rm pocketbase.zip
chmod +x pocketbase

echo "PocketBase binary ready at /opt/pocketbase/pocketbase"

# --- 4. Create systemd service ---
echo "[4/6] Creating systemd service..."
cat > /etc/systemd/system/pocketbase.service << 'EOF'
[Unit]
Description=PocketBase
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/pocketbase
ExecStart=/opt/pocketbase/pocketbase serve --http=0.0.0.0:8090
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pocketbase
systemctl start pocketbase

echo "PocketBase service started on port 8090"

# --- 5. Configure firewall ---
echo "[5/6] Configuring firewall..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 8090/tcp  # PocketBase
ufw --force enable

echo "Firewall configured"

# --- 6. Done ---
echo ""
echo "=== DEPLOYMENT COMPLETE ==="
echo ""
echo "PocketBase is running at: http://YOUR_VPS_IP:8090"
echo ""
echo "NEXT STEPS:"
echo "1. Open http://YOUR_VPS_IP:8090/_/ in browser to create admin account"
echo "2. Create your collections: shops, shop_users, shop_sync, shop_photos"
echo "3. Update your .env with: VITE_POCKETBASE_URL=http://YOUR_VPS_IP:8090"
echo ""
echo "For HTTPS with domain (recommended), run: deploy-nginx.sh"
