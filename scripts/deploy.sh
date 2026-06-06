#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TF_DIR="$SCRIPT_DIR/../terraform"

IP=$(terraform -chdir="$TF_DIR" output -raw public_ip 2>/dev/null || echo "")
if [ -z "$IP" ]; then
  echo "Error: no se encontró la IP. Ejecuta primero: cd terraform && terraform apply"
  exit 1
fi

KEY="${SSH_KEY_FILE:-$HOME/.ssh/id_rsa}"
REMOTE="ubuntu@$IP"
APP_DIR="/opt/eiri"

echo "Deploying to $IP..."

rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude 'eiri.db*' \
  --exclude 'static/uploads' \
  --exclude '.env' \
  --exclude '.git' \
  --exclude 'terraform' \
  --exclude 'scripts' \
  -e "ssh -i $KEY -o StrictHostKeyChecking=no" \
  "$SCRIPT_DIR/../" "$REMOTE:$APP_DIR/"

ssh -i "$KEY" -o StrictHostKeyChecking=no "$REMOTE" << 'REMOTE_CMDS'
cd /opt/eiri
mkdir -p static/uploads
npm install --omit=dev
pm2 restart eiri 2>/dev/null || pm2 start npm --name eiri -- start
pm2 save
REMOTE_CMDS

echo ""
echo "Deployed → http://$IP"
echo ""
echo "HTTPS con dominio:"
echo "  ssh ubuntu@$IP"
echo "  sudo certbot --nginx -d tudominio.com"
