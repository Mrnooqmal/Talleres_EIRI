# EIRI Talleres de Robótica, Battlebots 2026

Portal de recursos para los talleres de robótica de EIRI (Universidad del Desarrollo).
Los estudiantes acceden al material sin login; los tutores gestionan todo desde el panel de administración.

**En producción:** http://34.234.41.122 (EC2 + S3/CloudFront en AWS, region us-east-1).
Panel: http://34.234.41.122/admin/login

## Stack

- **Node.js 24** + Express
- **node:sqlite** (módulo nativo, sin compilación) en modo WAL
- **Nunjucks** para las plantillas
- **express-session** + **bcryptjs** para autenticación
- **multer** para subida de archivos
- Frontend sin framework: CSS y JS planos, iconos Lucide, Prism, marked + DOMPurify

> Requiere Node 24 porque `node:sqlite` no está disponible en versiones anteriores. Ver `.nvmrc`.

## Desarrollo local

```bash
nvm use            # toma la version de .nvmrc (24)
npm install
cp .env.example .env
npm run dev        # con --watch
```

App en http://localhost:3000, panel en http://localhost:3000/admin/login
Credenciales iniciales: `admin` / `eiri2026` (cambiar en el primer ingreso).

## Cuentas y roles

- Todos los tutores tienen el mismo rol y pueden gestionar el contenido (sesiones, recursos, galería, ranking, equipos).
- El **administrador principal** (marcado con `is_super` en la base) es el único que crea, renombra, resetea contraseñas y elimina cuentas de tutores. No puede quedar el sistema sin al menos un admin principal.
- Su nombre de usuario se puede cambiar libremente desde *Tutores* (el privilegio va por columna, no por nombre).

### Cómo dar acceso a un tutor nuevo

1. El admin principal entra a *Tutores → Nuevo tutor* y define un usuario + contraseña temporal.
2. Le pasa esas credenciales al tutor.
3. El tutor entra en `/admin/login` y usa *"Cambiar mi contraseña"* para poner la suya.

## Despliegue en AWS

Infra como código en `terraform/`:

- **EC2** Ubuntu 22.04 (Node 24 + nginx + PM2) con **Elastic IP** y security group 22/80/443.
- **S3** (bucket privado) para las subidas + **CloudFront** con Origin Access Control que las sirve por HTTPS con caché. El bucket nunca es público.
- **Rol IAM** con instance profile: la app sube a S3 usando las credenciales del rol de la instancia, sin llaves en disco (mínimos privilegios: `PutObject`/`DeleteObject` solo en `uploads/*`).

### Requisitos previos

- Cuenta AWS con credenciales configuradas localmente (`aws configure` o variables de entorno).
- Un **key pair** EC2 ya creado en la región elegida (su `.pem` en `~/.ssh/`).
- `terraform` y `aws` CLI instalados.

### Pasos

```bash
# 1. Provisionar infraestructura (crea EC2, S3, CloudFront, IAM)
cd terraform
terraform init
terraform apply -var="key_name=TU_KEYPAIR"
#   CloudFront tarda ~10-15 min en quedar disponible la primera vez.

# 2. Subir el código y arrancar la app
cd ..
SSH_KEY_FILE=~/.ssh/tu_llave.pem bash scripts/deploy.sh

# 3. Abrir la URL que imprime terraform (output "url")
```

`user_data.sh` (vía templatefile de Terraform) instala todo y genera el `.env` con un `SECRET_KEY` aleatorio y las variables `S3_BUCKET` / `AWS_REGION` / `S3_PUBLIC_URL` (dominio de CloudFront) ya rellenadas. No hay que tocar nada a mano.

Para HTTPS con dominio propio: apunta el DNS a la Elastic IP y luego `sudo certbot --nginx -d tudominio.com`.

Para destruir todo: `cd terraform && terraform destroy`.

### Actualizar el sitio (deploy de cambios)

El despliegue es por **git**: la instancia clona el repo público y hace `git pull`. Tras hacer `git push` a `main`:

```bash
# Opcion A: script (recomendado). Hace fetch + checkout + npm ci + pm2 restart.
SSH_KEY_FILE=/home/adrean/aws/adrean_cchc.pem bash scripts/deploy.sh

# Opcion B: manual por SSH
ssh -i /home/adrean/aws/adrean_cchc.pem ubuntu@34.234.41.122
cd /opt/eiri && git pull && npm ci --omit=dev && pm2 restart eiri && pm2 save
```

El `.env`, la base `eiri.db` y `static/uploads/` se conservan (no están en git).

### Almacenamiento y persistencia

- **Subidas**: van a **S3** (servidas por CloudFront). Son durables e independientes de la instancia. En desarrollo local, si `S3_BUCKET` está vacío, caen a `static/uploads/` en disco.
- **Base de datos**: `eiri.db` (SQLite) vive en el disco EBS de la instancia y **persiste entre despliegues** (el deploy no la sobrescribe). Se pierde solo si se destruye la instancia; para respaldo, snapshots EBS o copiar `eiri.db` a S3 periódicamente.

## Notas de arquitectura y escalado

Diseño de una sola instancia, suficiente para el público de un taller. Si hay que escalar:

- **Base de datos**: SQLite es de un solo nodo. Para múltiples instancias, migrar a PostgreSQL (RDS). El acceso a datos está concentrado en `server.js` con sentencias preparadas, así que el cambio es acotado.
- **Sesiones**: hoy usan el store en memoria de express-session. Con más de una instancia, mover a un store compartido (Redis/ElastiCache) o JWT.
- **Archivos**: ya resueltos con S3 + CloudFront.
- **Disponibilidad**: para alta disponibilidad, Auto Scaling Group detrás de un ALB (requiere antes los puntos de DB y sesiones).
