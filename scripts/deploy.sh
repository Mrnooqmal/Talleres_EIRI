#!/bin/bash
# Despliegue por git: actualiza el codigo en la EC2 y reinicia la app.
# Requiere haber hecho push a la rama main del repo.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TF_DIR="$SCRIPT_DIR/../terraform"

IP=$(terraform -chdir="$TF_DIR" output -raw public_ip 2>/dev/null || echo "")
if [ -z "$IP" ]; then
  echo "Error: no se encontro la IP. Ejecuta primero: cd terraform && terraform apply"
  exit 1
fi

KEY="${SSH_KEY_FILE:-$HOME/.ssh/id_rsa}"
REMOTE="ubuntu@$IP"

echo "Desplegando en $IP..."

ssh -i "$KEY" -o StrictHostKeyChecking=no "$REMOTE" 'bash -s' <<'REMOTE_CMDS'
set -e
cd /opt/eiri
git fetch -q origin
git checkout -f -B main origin/main
git log --oneline -1
npm ci --omit=dev
pm2 restart eiri --update-env || pm2 start npm --name eiri -- start
pm2 save
REMOTE_CMDS

echo ""
echo "Listo -> http://$IP"
echo "HTTPS con dominio: ssh ubuntu@$IP y luego sudo certbot --nginx -d tudominio.com"
