#!/bin/bash
set -euo pipefail

apt-get update -y
apt-get install -y nginx curl git

# Node.js 24 (necesario para el modulo nativo node:sqlite)
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs

# PM2
npm install -g pm2

# Directorio de la app y carpeta persistente de subidas
mkdir -p /opt/eiri/static/uploads
chown -R ubuntu:ubuntu /opt/eiri

# .env con secreto aleatorio y configuracion de S3 si aun no existe
if [ ! -f /opt/eiri/.env ]; then
  cat > /opt/eiri/.env << ENV
SECRET_KEY=$(openssl rand -hex 32)
PORT=3000
NODE_ENV=production
S3_BUCKET=${s3_bucket}
AWS_REGION=${aws_region}
S3_PUBLIC_URL=${s3_public_url}
ENV
  chown ubuntu:ubuntu /opt/eiri/.env
fi

# Nginx reverse proxy
cat > /etc/nginx/sites-available/eiri << 'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 50m;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_min_length 256;
    gzip_comp_level 5;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml image/svg+xml font/woff2;

    # Serve static files directly from disk (bypass Node.js)
    location /static/ {
        alias /opt/eiri/static/;
        expires 7d;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri @node;
    }

    location @node {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/eiri /etc/nginx/sites-enabled/eiri
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl enable nginx

# PM2 startup automático
env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

echo "Bootstrap OK — listo para deploy con: bash scripts/deploy.sh"
