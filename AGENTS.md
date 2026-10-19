# AGENTS.md — Travell (web)

Guía para agentes. Las reglas de flujo del repo están en `CLAUDE.md` (los humanos trabajan directo en `main`; el agente de Zordon usa `agent/<TAREA>` + PR; la IA toca el viaje solo por el MCP, imágenes solo se asignan). Más detalle: `ARCHITECTURE.md`, `FEATURES.md`, `BACKLOG.md`, `VISION.md`.

## Qué es
PWA de viaje offline (HTML + CSS + módulos ES, **sin framework ni build**) más un backend mínimo sin dependencias (`server/relay.mjs`). Node >= 22.9, sin `node_modules`: `npm install` no instala nada.

## Comandos (`.agent/project.toml`)
| Qué | Comando | Notas |
|---|---|---|
| install | `npm install` | no-op (sin dependencias) |
| test | `npm test` | `node --test tests/*.test.mjs` |
| start | `npm run start` | sirve la PWA y el relay en `PORT` (por defecto 8787); lee `.env.local` si existe |
| lint / build | — | no existen; la CI (`.github/workflows/ci.yml`) corre `npm install` y `npm test` |

## Mapa del código
- `index.html`, `css/app.css`, `manifest.webmanifest`, `icons/`, `vendor/leaflet`: shell de la app.
- `sw.js`: service worker. Precachea el shell (lista `CORE`), red primero para app y JSON, caché primero para tiles, stale-while-revalidate para imágenes. **Al agregar o renombrar un archivo de `js/` hay que agregarlo a `CORE` y subir `VERSION`** (`tests/sw.test.mjs` lo verifica).
- `js/main.js`: arranque, router por hash (`ROUTES`), delegación de eventos y reloj.
- `js/store.js`: modelo de datos. `BASE` (JSON de solo lectura) + `cols` (registros del overlay en `localStorage`) → `rebuild()` produce `D` (datos combinados) e `I` (índices). Las vistas solo leen `D`/`I`. `EDITABLE` son las colecciones editables en la app; `LOCAL_ONLY` solo viven en el overlay.
- `js/views/*.js`: una vista por pantalla (`home`, `day`, `mapview`, `places`, `docs`, `expenses`, `tasks`, `people`, `photos`, `games`…). `forms.js` tiene los formularios de alta/edición.
- `js/ui.js`, `js/util.js`: componentes, acciones, modales, formato. `js/sync.js`: sync cifrada entre celulares vía relay. `js/admin.js`: recarga los datos cuando el servidor cambia (`/v1/trip/rev`). `js/gate.js`: código del viaje. `js/upload.js`: fotos y adjuntos a R2. Otros: `map.js`, `geo.js`, `weather.js`, `ticket.js`/`qr.js`, `ics.js`, `money.js`, `suggest.js`, juegos (`mate*.js`, `tango.js`, `queens.js`).
- `data/*.json`: el viaje (itinerario, transportes, hoteles, lugares, tareas…). Se editan a mano en el repo; es a propósito.
- `server/relay.mjs`: HTTP único. Sirve estáticos (`SERVE_STATIC`), `/data/*.json` con los cambios del admin aplicados, sync (`/v1/:gid/records`), archivos en R2 (`r2.mjs`), clima (`weather.mjs`), código del viaje, `/health`, API admin y `/mcp`. `redis.mjs` guarda estado en Redis (o archivo en `RELAY_DATA`).
- `server/tripdata.mjs`: colecciones editables por el servidor (`COLS`), validación y `apply()`. `server/mcp.mjs`: servidor MCP (JSON-RPC por HTTP) que usa esa misma validación.
- `tests/*.test.mjs`: pruebas con `node:test`; `tests/helpers.mjs` tiene utilidades comunes.

## Cómo fluye un pedido
1. El navegador pide `index.html` y los módulos; el service worker responde de la red o del caché.
2. `main.js` llama a `loadData()` (`store.js`): baja `/data/<archivo>.json` del relay, que devuelve el JSON del repo + los cambios de admin guardados en Redis.
3. `rebuild()` superpone los registros locales (`cols`) y deja `D`/`I`; el router pinta la vista según el hash.
4. Una edición en la app crea un registro `{id, updatedAt, by, ...}` en `cols` (`localStorage`), `sync.js` lo cifra y lo envía a `POST /v1/:gid/records`; los demás celulares lo traen con `GET ...?since=N`.
5. Un cambio por MCP/admin pasa por `tripdata.apply()`, sube la revisión y `admin.js` hace que los celulares recarguen los datos sin deploy.

## Convenciones
- Código en inglés con comentarios breves; textos de la UI y del viaje en castellano. Sin dependencias nuevas salvo justificación.
- Si se agrega una acción o colección a la app, se agrega al MCP (`COLS` y validación en `server/tripdata.mjs`, reglas en `server/mcp.mjs`).
- No cifrar nada nuevo que sea parte del viaje. No agregar IA a la app.
- Imágenes: solo `name` + `prompt` en los datos (ver `CLAUDE.md`); nunca generarlas ni pedirlas a mano.
- Rutas protegidas (`.agent/protected-paths`): `.github/workflows/`, `.agent/`, `Dockerfile`.
- Cada push a `main` despliega en Dokploy (https://travell.unab.dpdns.org).
