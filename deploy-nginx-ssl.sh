#!/bin/bash
# ============================================
# Nginx + SSL Setup for PocketBase
# Run AFTER deploy-pocketbase.sh
# Requires: a domain pointing to your VPS IP
# Usage: sudo bash deploy-nginx-ssl.sh yourdomain.com admin@example.com
# ============================================

set -e

DOMAIN="${1}"
CERTBOT_EMAIL="${2}"

if [ -z "$DOMAIN" ]; then
    echo "Usage: sudo bash deploy-nginx-ssl.sh yourdomain.com admin@example.com"
    exit 1
fi

if [ -z "$CERTBOT_EMAIL" ]; then
    echo "A Certbot email is required for renewal and expiry alerts."
    exit 1
fi

echo "=== Setting up Nginx + SSL for ${DOMAIN} ==="

# --- 1. Install Nginx + Certbot ---
echo "[1/4] Installing Nginx and Certbot..."
apt install -y nginx certbot python3-certbot-nginx

# --- 2. Create Nginx config ---
echo "[2/4] Configuring Nginx reverse proxy..."
cat > /etc/nginx/sites-available/pocketbase << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;

        # SSE / Realtime support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;
}
EOF

ln -sf /etc/nginx/sites-available/pocketbase /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

echo "Nginx configured"

# --- 3. Get SSL certificate ---
echo "[3/4] Getting SSL certificate..."
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --email "${CERTBOT_EMAIL}"

echo "SSL certificate installed"

# --- 4. Auto-renew ---
echo "[4/4] Setting up auto-renewal..."
systemctl enable certbot.timer
systemctl start certbot.timer

echo ""
echo "=== HTTPS SETUP COMPLETE ==="
echo ""
echo "PocketBase is now available at: https://${DOMAIN}"
echo "Admin panel: https://${DOMAIN}/_/"
echo ""
echo "Update your .env to: VITE_POCKETBASE_URL=https://${DOMAIN}"
echo ""
echo "SSL auto-renews via certbot timer."
