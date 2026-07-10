# EIRI Arena — Pantalla de competencia en vivo

**Fecha:** 2026-07-02 · **Estado:** aprobado por Adrean

## Objetivo

Una URL nueva (`/arena`) para operar la competencia Battlebots en vivo, proyectada
en una sola pantalla. Permite seleccionar un partido del bracket, correr un combate
con timer configurable y 3 corazones por equipo, decidir el ganador según las reglas,
y persistir el resultado al bracket público — incluyendo el partido por el 3er lugar.

## Reglas del combate

- Cada equipo empieza con **3 corazones**.
- **KO:** el primero que pierde sus 3 corazones pierde el combate de inmediato.
- **Por tiempo:** al agotarse el timer gana el equipo con más corazones.
- **Empate al agotarse el tiempo → MUERTE SÚBITA:** alarma, modo visual dramático
  (rojo), timer contando hacia arriba desde 0; el próximo corazón que caiga define
  al ganador.
- Timer configurable por el operador antes del combate (default **3:00**, pasos de 30s).
- El operador puede quitar **y devolver** corazones (corrección de errores).

## Decisiones tomadas (con el usuario)

1. **Una sola pantalla proyectada** — el operador controla en el mismo computador
   que se proyecta. Sin sincronización multi-pantalla.
2. **Música:** MP3 por equipo (subido desde el panel admin con el upload existente)
   + efectos de sonido built-in generados con Web Audio API.
3. **Persistencia con confirmación:** al terminar el combate el operador debe
   pulsar "Confirmar resultado" para escribir al bracket público. "Descartar"
   no guarda nada.
4. **3er lugar visible en la arena Y en el bracket público** de la home.
5. **Desempate: muerte súbita.**

## Arquitectura

Página server-rendered integrada al patrón existente del repo (como `/admin`):

- Ruta Express `GET /arena` protegida con `requireAdmin` (redirige a `/admin/login`
  si no hay sesión).
- Template `templates/arena.html`, lógica en `static/js/arena.js`, estilos en
  `static/css/arena.css`. Vanilla JS, sin dependencias nuevas (lucide ya está).
- Estado del combate en el navegador; persistencia solo al confirmar, vía API.
- El estado de un combate en curso se respalda en `localStorage` (partido, timer
  restante, corazones, fase) y se ofrece recuperar si la página se recarga.

## Flujo de pantallas (4 estados en una URL)

### ① Selección de partido
- Render del bracket completo (mismo layout de la home) + partido de 3er lugar.
- Partidos **jugables** (ambos equipos definidos, sin ganador): borde dorado
  brillante, clickeables. Partidos jugados: muestran resultado, no clickeables.
- Control del timer del combate (default 3:00, − / + en pasos de 30s).
- Barra lateral "resultados de la jornada": últimos combates confirmados
  (ej. "Vortyx eliminó a El Vacío 3–0").

### ② Presentación (VS screen)
- Pantalla dividida en diagonal; logo gigante + nombre de cada equipo entra
  animado desde su lado; "VS" central con destello.
- Botón por equipo para reproducir su tema (si tiene `anthem`); botón stop.
- Nombre de la ronda en grande ("CUARTOS DE FINAL", "SEMIFINAL", "GRAN FINAL",
  "3ER LUGAR").
- Botón "¡A la arena!" → pasa al combate.

### ③ Combate
- Layout simétrico: cada lado con logo grande, nombre y 3 corazones.
- Quitar corazón: click en el corazón o teclas (`Q` quita al izquierdo, `P` al
  derecho); devolver: `A` / `L` o click en corazón vacío. `Espacio` pausa/reanuda.
  `F` alterna fullscreen.
- Centro: timer gigante. Al iniciar: countdown 3-2-1-FIGHT con beeps y gong.
- Últimos 10 segundos: timer rojo, pulso, beep por segundo.
- Perder corazón: animación de corazón rompiéndose + flash del lado + golpe grave.
- Fin por KO o por tiempo según reglas; empate → transición a muerte súbita.
- La **GRAN FINAL** lleva tratamiento especial: borde dorado y partículas de fondo.

### ④ Victoria
- Confeti, logo del ganador al centro con corona, marcador final en corazones
  (ej. "3 – 1"), canción del ganador con fade-in (o fanfarria built-in si no tiene).
- **"Confirmar resultado"** → `PUT /api/admin/bracket/match`, vuelve a ① con el
  bracket avanzado. **"Descartar"** → vuelve a ① sin guardar.

## Cambios de datos y API

### `bracket_data` (site_config)
- Nuevo campo `third: { a, b, scoreA, scoreB, winner }` junto a `size` y `rounds`.
- `resolveBracket()` además de propagar ganadores coloca a los **perdedores de las
  semifinales** (penúltima ronda) en `third.a` / `third.b`.
- `sanitizeBracket()` valida `third` igual que un match normal.
- Brackets existentes sin `third` se normalizan al vuelo (compatibilidad).

### `teams`
- Nueva columna `anthem TEXT DEFAULT ''` (URL del MP3). Migración con
  `ALTER TABLE` tolerante a que la columna ya exista (patrón del repo si lo hay,
  o try/catch).
- `GET /api/teams`, `GET /api/bracket` y los endpoints admin de teams incluyen
  `anthem`. El form de equipo en el panel admin agrega campo "Canción / tema"
  con el mismo flujo de upload de los logos.

### Endpoint nuevo
- `PUT /api/admin/bracket/match` (requireAdmin). Body:
  `{ round, index, scoreA, scoreB, winner }` o `{ third: true, scoreA, scoreB, winner }`.
  Actualiza solo ese partido dentro de `bracket_data`, re-resuelve el bracket y
  guarda. Los scores son los corazones restantes. Registra en el log admin
  (`update_bracket_match`).

## Bracket público (home)

- Tarjeta de **3er lugar** bajo la final en la columna central, estilo actual
  (solo logos, nombre al hover), con ícono de medalla.
- Cuando tenga ganador: línea discreta "3er lugar: [equipo]" con medalla 🥉
  bajo el campeón.

## Audio

- **Built-in (Web Audio API, sin archivos):** beeps de countdown, gong de inicio,
  golpe grave al perder corazón, alarma de muerte súbita, beeps de últimos 10s,
  fanfarria de victoria.
- **Temas por equipo:** `<audio>` apuntando al MP3 de CloudFront; reproducción a
  demanda en presentación, automática (fade-in) en victoria.
- El audio se inicializa tras la primera interacción del usuario (política de
  autoplay de los navegadores) — el flujo de selección ya lo garantiza.
- Control global de mute visible en todas las fases.

## Manejo de errores

- Fetch del bracket falla en ①: mensaje con botón reintentar.
- Confirmación falla (red caída): el resultado queda en pantalla con botón
  reintentar; nunca se pierde el estado del combate por un error de red.
- MP3 que no carga: se ignora silenciosamente y suena el built-in.
- Recarga accidental a mitad de combate: al volver a `/arena` se ofrece
  "Reanudar combate en curso" desde el respaldo en `localStorage`.

## Testing

- Manual (es una interfaz de evento en vivo): checklist de flujo completo —
  seleccionar partido, presentación, combate con KO, combate por tiempo, empate →
  muerte súbita, confirmar, verificar bracket público avanzado y 3er lugar
  poblado tras las semis.
- Verificación de reglas de `resolveBracket` + `third` y del endpoint
  `bracket/match` con curl contra el server local.

## Archivos

| Archivo | Cambio |
|---|---|
| `templates/arena.html` | nuevo |
| `static/js/arena.js` | nuevo |
| `static/css/arena.css` | nuevo |
| `server.js` | ruta `/arena`, `third`, columna `anthem`, `PUT /api/admin/bracket/match` |
| `static/js/app.js`, `static/css/style.css` | 3er lugar en bracket público |
| `templates/admin.html`, `static/js/admin.js` | campo canción en form de equipos |

## Fuera de alcance

- Sincronización multi-pantalla / websockets.
- Estadísticas históricas de combates (solo la barra de resultados de la jornada).
- Doble eliminación u otros formatos de bracket.
