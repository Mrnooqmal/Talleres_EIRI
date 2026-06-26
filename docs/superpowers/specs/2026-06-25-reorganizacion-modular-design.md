# Reorganización modular — EIRI Talleres (Next-ready)

**Fecha:** 2026-06-25
**Estado:** Diseño aprobado, pendiente de plan de implementación
**Alcance:** Limpiar y modularizar el proyecto actual dejándolo profesional y *framework-ready*. No se construye aún la plataforma mayor ni se migra a Next.

---

## 1. Contexto y objetivo

El proyecto es el portal de los talleres de robótica EIRI (Battlebots 2026). La visión a futuro es que esta página crezca hasta ser la **plataforma general de robótica**, donde Battlebots pasa a ser *un módulo/sección*. Este trabajo prepara el terreno: deja el código profesional, modular y con fronteras claras, sin construir todavía esa plataforma.

### Decisiones fijadas

| Decisión | Valor |
|---|---|
| Alcance ahora | Limpiar + modularizar lo actual, *framework-ready*. No construir plataforma ni migrar a Next todavía. |
| Despliegue | Vercel + Turso (serverless). AWS/Terraform pasa a legado y se elimina del repo. |
| Stack ahora | Vanilla: Express + Nunjucks + JS/CSS, reorganizado por dominio. |
| Framework destino | Next.js (migración futura, fuera de este alcance). |
| Arquitectura | Monolito modular *feature-first* (no microservicios). |
| Build | esbuild (bundle + minify de CSS y JS de cliente). |
| Testing | Verificación manual por fase (sin suite automatizada). |
| Carpeta assets | Se mantiene `static/` y la URL `/static/*` (reorganización interna). |
| Comentarios | Solo puntuales (el *por qué* no obvio); sin banners ni narración. |

### Fuera de alcance (YAGNI)

- Microservicios (over-engineering a esta escala; Vercel ya da granularidad serverless).
- Construir el *shell* de la plataforma multi-sección.
- Migrar el frontend a Next.js / React.
- Renombrar `static/` → `public/`.
- Suite de tests automatizada.

---

## 2. Arquitectura actual (diagnóstico)

Monolito server-rendered (Express + SSR Nunjucks) organizado por *tipo de archivo*, no por dominio:

- **`server.js` (875 líneas)** concentra middleware, auth JWT, subida de archivos (S3/disco) y los ~55 handlers de ruta con SQL inline. Sin separación rutas / servicios / datos.
- **Vistas:** Nunjucks SSR con dos parciales (`_site_header`, `_footer`). Sin layout base con bloques; el `<head>` está duplicado entre `index.html` y `admin.html`.
- **Cliente:** JS/CSS plano por página. `style.css` (1673 líneas) mezcla tokens, reset, utilidades, componentes y estilos de página. Los tokens `:root` están **duplicados en 3 CSS** (style, admin, sesion). `app.js` (800 líneas) tiene 13 funciones `init*`/`load*` y 5 globals `window.*`.
- **Datos:** ya abstraídos en `lib/db.js` (libsql; sirve `file:` local y Turso remoto). Auth ya es JWT stateless → la migración a Vercel + Turso está casi completa.

---

## 3. Arquitectura objetivo

### 3.1 Backend — capas

Flujo de una request, 3 capas sobre infra transversal:

```
src/server.js (bootstrap: app, middleware, monta routers)
  └─ modules/<dominio>/<dominio>.routes.js     HTTP: parseo, auth, status, JSON/render
       └─ <dominio>.service.js                 lógica de negocio, validación, orquestación
            └─ <dominio>.queries.js            SQL (sentencias preparadas) — único que toca DB
src/core/  db · auth · storage · render · logger   infra, sin lógica de dominio
```

**Reglas:**
- El SQL vive **solo** en `*.queries.js`. La lógica vive **solo** en `*.service.js`. Las rutas no contienen SQL.
- Un único *error handler* central en `server.js`. Los servicios lanzan errores tipados; las rutas no repiten try/catch. Respuestas de error con forma consistente `{ error }`.
- Cada `service` queda portable casi 1:1 a un *route handler / server action* de Next.

### 3.2 Mapa de módulos

Cada módulo es dueño de **sus** rutas públicas y admin (admin co-localizado por dominio).

| Módulo | Rutas que absorbe |
|---|---|
| `home` | `/` (landing; compone datos de otros módulos) |
| `sessions` | `/sesiones/:id`, `/api/sessions`, admin sessions + **projects** (código) + **assets** (descargas) |
| `gallery` | `/galeria`, `/api/gallery`, admin gallery (+reorder) |
| `teams` | `/api/teams`, admin teams |
| `bracket` | `/api/bracket`, admin bracket |
| `ranking` | `/api/rankings`, admin rankings |
| `feedback` | `/api/feedback`, admin feedback |
| `account` | login/logout/me/change-password + **tutores** (gestión de usuarios `is_super`) |
| `site` | `/api/config` + admin config + `/api/admin/logs` |
| `admin` | shell SPA (`/admin`, `/admin/*`, `/admin/login`) + `/api/admin/upload` |

`projects` y `assets` son contenido de una sesión → viven dentro de `sessions`. `account` es módulo separado del shell `admin`.

**Anatomía de módulo** (ej. `sessions`):
```
src/modules/sessions/
  sessions.routes.js
  sessions.service.js
  sessions.queries.js
```

**core/** (infra sin dominio): `db.js` (mueve `lib/db.js`), `auth.js` (JWT + `requireAdmin`/`requireSuper`), `storage.js` (S3/disco, sale de server.js), `render.js` (config Nunjucks + helpers), `logger.js` (logs de auditoría).

### 3.3 Vistas — shell de layout compartido

`{% extends %}` + `{% block %}` reemplaza el `<head>` duplicado y los `include` de página.

```
views/
  layouts/
    root.html      <html><head> ÚNICO: meta, favicons, fonts, lucide + bloques {head}{content}{scripts}
    public.html    extends root → include header + {% block content %} + include footer
    admin.html     extends root → include sidebar + topbar + {% block content %}
  partials/
    header.html    (= _site_header)   footer.html (= _footer)
    sidebar.html   (nav admin extraído de admin.html)
    seo.html       meta/OG parametrizable por sección
  pages/
    home.html  gallery.html  session.html
    admin/  app.html  login.html
```

- Un solo `<head>` en `root.html`; cada página sobre-escribe `{% block head %}` solo lo suyo (Prism en sesión, `style.css` vs `admin.css`).
- Header/footer/sidebar incluidos por el layout, no por cada página.
- `seo.html` deja el SEO por sección listo para la plataforma.
- El admin sigue siendo SPA (un shell + JS que cambia vistas con `data-view`).
- **Mapeo Next:** `layouts/public.html` ≈ layout del grupo público, `layouts/admin.html` ≈ layout de `/admin`, partials ≈ componentes; los bloques anidados ≈ *nested layouts* de Next.

### 3.4 Design-system — CSS

```
static/styles/
  tokens.css     :root ÚNICO: colores, tipografía, espaciado, easings, sombras
  base.css       reset, html/body, focus-visible, .container, .section, utilidades
  components/    buttons · header · footer · cards · bracket · gallery · forms · …
  pages/         home · session · gallery
  admin/         admin · sidebar  (reusan tokens.css + base.css, ya no redefinen :root)
```

Los 3 bloques `:root` duplicados colapsan en `tokens.css` (fuente única).

### 3.5 JS de cliente — módulos ES

```
static/scripts/
  shared/    dom.js (escapeHtml, $) · api.js (fetch helpers) · markdown.js
  modules/   carousel · navbar · search · gallery · bracket · ranking · feedback · …  (cada uno exporta init())
  entries/   public.js · session.js · admin.js  (importan los módulos que usan)
```

Elimina los globals `window.*` y los archivos monolíticos. Cada módulo mapea a un componente/island de React a futuro.

### 3.6 Build — esbuild

- Una dependencia (`esbuild`) y un script `npm run build`.
- Empaqueta + minifica `static/styles/` → `static/dist/*.css` y `static/scripts/entries/*.js` → `static/dist/*.js`.
- Los templates enlazan los bundles de `static/dist/`.
- Vercel ejecuta el build en cada deploy (script `build` / `vercel-build`).
- `static/dist/` se ignora en git (artefacto).

### 3.7 Estructura final del repo

```
src/        server.js · config/ · core/ · modules/ · shared/
views/      layouts/ · partials/ · pages/
static/     styles/ · scripts/ · dist/(build) · img/ · uploads/
docs/       product.md · design.md · architecture.md
package.json · vercel.json · .gitignore
```

---

## 4. Plan por fases

Cada fase es desplegable y **preserva el comportamiento** (verificación manual al cierre: correr la app, recorrer portal + panel admin). La limpieza de comentarios ocurre dentro de cada fase al tocar cada archivo.

| Fase | Qué hace |
|---|---|
| **0 — Andamiaje** | Añadir esbuild + script `build`; crear esqueleto de carpetas (`src/`, `views/`, `static/styles\|scripts`); wiring de `vercel.json`. Sin cambio de comportamiento. |
| **1 — Backend en capas** | Partir `server.js` → `src/server.js` + `core/` + `modules/*` (routes/service/queries). Mover `lib/db.js` → `src/core/db.js`. Error handler central. |
| **2 — Shell de vistas** | `views/layouts/{root,public,admin}` + partials; páginas con `{% extends %}`; dedup `<head>`. |
| **3 — Design-system CSS** | Extraer `tokens.css`; dividir `components/` y `pages/`; dedup de los 3 `:root`; bundles esbuild de CSS. |
| **4 — JS de cliente** | `app/admin/sesion.js` → `static/scripts/modules` + `entries`; bundles esbuild; eliminar `window.*`. |
| **5 — Higiene & docs** | Eliminar `terraform/`, scripts de deploy AWS y `scripts/import_to_turso.js` (migración puntual ya cumplida); ajustar `.gitignore` (`static/dist/`, `eiri.db*`, `.env`, `.vercel`); consolidar docs en `docs/`; actualizar README (Vercel como prod, nueva estructura, build); barrido final de comentarios. |

### Verificación manual por fase

Tras cada fase, correr `npm run dev` y comprobar:
- Portal: home (hero, sesiones, ranking, bracket, galería), `/galeria`, `/sesiones/:id`.
- Panel: login, cada vista del sidebar (sesiones, config, galería, equipos, ranking, torneo, tutores, feedback), subida de archivo, reorder drag-and-drop.

---

## 5. Riesgos

- **Refactor sin tests automatizados:** la verificación manual debe ser disciplinada por fase. Mitigación: fases chicas y desplegables; cada una se valida antes de seguir.
- **Mover server.js (Fase 1):** es el cambio de mayor superficie. Mitigación: preservar exactamente rutas y respuestas; revisar el diff endpoint por endpoint contra el mapa de módulos.
- **Build en Vercel:** verificar que el bundle esbuild se genera en deploy y que las URLs de `static/dist/` resuelven. Mitigación: probar `npm run build` local y un deploy de preview antes de producción.
