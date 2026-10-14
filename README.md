# Travell — asistente de viaje offline (PWA)

PWA en HTML + JavaScript, sin framework ni build, con un backend mínimo (`server/relay.mjs`: sincronización cifrada, subida a R2 y clima). Lee JSON, funciona sin internet y se instala en el celular.
Incluido: el viaje **China y Japón 2026** (convertido del Excel), pero sirve para cualquier viaje: solo cambian los JSON.

## Documentación
- [VISION.md](VISION.md): propósito y principios
- [ARCHITECTURE.md](ARCHITECTURE.md): arquitectura de la PWA y modo offline
- [FEATURES.md](FEATURES.md): funcionalidades
- [BACKLOG.md](BACKLOG.md): lo que falta implementar

## Probarla
```bash
npm start       # app + relay en http://localhost:3000 (carga las credenciales de .env.local)
```
Con HTTPS (o localhost) se registra el service worker: la primera visita con internet deja todo guardado y después anda offline.
Para ver cada momento del viaje: **Más → Ajustes → Probar con otra fecha**.

## Tests
```bash
npm test        # node --test, sin dependencias
```

## Variables de entorno
Localmente van en `.env.local` (ignorado por git); en el servidor, en el ambiente (Dokploy).

| Variable | Para qué |
|---|---|
| `R2_ENDPOINT`, `R2_KEY`, `R2_SECRET`, `R2_BUCKET` | Cloudflare R2: ahí se suben **siempre** las fotos y los adjuntos |
| `REDIS_URL`, `REDIS_KEY_PREFIX` | Redis: el clima y los cambios de administración al viaje. Prefijo por defecto `travell:` |
| `ADMIN_API_KEY` | Clave de administrador: la piden todos los cambios al viaje (`/v1/admin/*`) y el MCP (`/mcp`). Sin ella, están apagados |
| `TRIP_CHANGES` | `file` guarda los cambios de administración en un archivo aunque haya `REDIS_URL` (para desarrollo local, donde Redis no es accesible) |
| `PORT`, `RELAY_DATA`, `SERVE_STATIC`, `WEATHER` | Puerto, carpeta de datos del relay, servir la app, apagar el clima (`0`) |

## Editar el viaje desde Claude (MCP)
La app no tiene IA propia: la IA entra solo por el MCP del servidor (`/mcp`, protegido con `ADMIN_API_KEY`). Con él, Claude lee el viaje, previsualiza cambios y los aplica (llegan a todos los celulares sin deploy). Puede hacer lo mismo que la app con los datos del viaje, incluidos códigos de reserva y QR, gastos y pasaportes.

- **App de Claude** (escritorio, web, celular): Configuración → Conectores → Agregar conector personalizado, con la URL `https://travell.unab.dpdns.org/mcp/<ADMIN_API_KEY>` (o `…/mcp` con el header `Authorization: Bearer <ADMIN_API_KEY>`, si la cuenta permite headers).
- **Claude Code**:
```bash
claude mcp add --transport http travell https://travell.unab.dpdns.org/mcp --header "Authorization: Bearer $ADMIN_API_KEY"
```
Después se le pasa una reserva (PDF, captura, mail, link) o se le pide "cambiá el itinerario del día 5 por esto": Claude la lee con sus herramientas, arma los cambios, los muestra y los aplica cuando se confirma. Los cambios quedan en Redis, encima de `data/*.json`; `list_changes` muestra lo que difiere del repo. El flujo completo está en `CLAUDE.md`.

## Deploy con Docker (app + sincronización en un contenedor)
```bash
docker build -t travell . && docker run -p 3000:3000 -v travell-data:/data travell
```
`server/relay.mjs` sirve la PWA (solo `index.html`, `css/`, `js/`, `data/`, `icons/`, `vendor/`, `sw.js` y el manifest) y la sincronización en el mismo puerto (`PORT`, 3000 por defecto). Como `trip.json` tiene `"sync": {"relayUrl": "same-origin"}`, cada celular solo tiene que ingresar el código del viaje (5 letras y números) la primera vez. Sirve para Dokploy o cualquier plataforma que construya desde el `Dockerfile`.

## Sincronización opcional (relay)
```bash
PORT=8787 RELAY_DATA=./relay-data node server/relay.mjs   # Node 22+, sin dependencias
```
## Clima
El relay descarga el clima de cada día del viaje de [Open-Meteo](https://open-meteo.com) (gratis, sin clave) **una vez por día** y lo guarda en Redis:
```bash
REDIS_URL=redis://:password@host:6379/0 npm start   # sin REDIS_URL lo guarda en un archivo en RELAY_DATA; WEATHER=0 lo apaga
```
- Días dentro de los próximos 16: pronóstico. Días más lejanos: **clima típico** de esas fechas (promedio de los últimos 5 años, ±1 día), marcado "típico".
- La app lo pide a `GET /v1/weather` como mucho una vez por día y guarda una copia en el celular, así que se ve sin conexión.
- Aparece en el hero de Inicio (el día de hoy, el día de salida o "al llegar a…" antes del viaje) y en el encabezado de cada día.

En la app: **Más → Viajeros → Sincronizar con el grupo**, con la URL del relay (HTTPS en producción) y el mismo código de grupo en todos los celulares. Los datos viajan cifrados. Sin relay, todo funciona igual en cada celular y se comparte por archivo o link.

## Qué hace
- **Inicio**: "Faltan N días para tu viaje" + accesos a *Pasajes y QR* y *Visas y documentos*. El día de salida: "Hoy es el día del viaje", hora de salir, hora de estar en el aeropuerto y cuenta regresiva. En cada día con tarjeta (p. ej. llegada a Shanghai) muestra cómo llegar al hospedaje, mapa con la ruta y links de interés (red de metro, etc.). Muestra el clima del día.
- **Día**: actividades con horario, detalle, marcado como hecho, alertas, logística, documentos, fotos y gastos del día.
- **Mapa**: Leaflet (no usa Google). En China continental usa tiles de AutoNavi/Gaode (con conversión GCJ-02), fuera de China OpenStreetMap. Filtros por categoría (gastronomía, cultura…), cerca/día/todo, GPS y "Guardar zona offline".
- **Fotos**: se guardan en el dispositivo (IndexedDB), por día, y se suben a R2 (igual que los adjuntos de documentos y pasaportes).
- **Gastos**: multi-moneda, división igual o a medida, saldos y "quién le paga a quién". Exportar/Importar JSON para juntar las cuentas de todos sin servidor.
- **Pasajes, entradas y reservas**: en su transporte, actividad u hotel, con código de reserva en pantalla completa, QR escaneados con la cámara, link a la reserva y PDFs adjuntos, todo offline. **Documentos** queda para visas, trámites y seguro.
- **Tareas** asignables a cada viajero, y **sugerencias** de lo que falta (noches sin hotel, reservas, preparativos como el certificado de fiebre amarilla).
- **ABM** de lugares, alojamientos, actividades, tareas y viajeros, con la ubicación tomada del GPS o del mapa.
- **Viajeros**: permiso de ubicación, compartirla (opcional y cifrada) y ver dónde están los demás.

## Datos (`data/*.json`)
Todo está anclado a días (`"day": "d03"`). `?data=trips/otro` carga otra carpeta de viaje.

| Archivo | Contenido |
|---|---|
| `trip.json` | título, fechas, ciudades (con proveedor de mapa), categorías, monedas |
| `itinerary.json` | **itinerario principal**: días → actividades y tarjetas (`departure`, `arrival`, `info`) |
| `transport.json` | vuelos, trenes, traslados |
| `lodging.json` | hospedajes (check-in/out, coordenadas) |
| `places.json` (+ `places-extra.json`) | lugares de interés con coordenadas; `trip.json → placeFiles` lista los archivos que los extienden |
| `documents.json` | pasajes, visas, entradas, confirmaciones |
| `travelers.json` | viajeros (para dividir gastos) |
| `tasks.json` | tareas (asignables, con `covers` para no repetir sugerencias) |
| `requirements.json` | preparativos sugeridos por país (salud, documentos, dinero…) |
| `notes.json` | alertas |
| `resources.json` | recursos por ciudad: enlaces (metro, trámites, fuentes), mapas, apps; con adjuntos offline |
| `phrases.json` | cheat sheet: frases y kanji/hanzi útiles en mandarín y japonés (escritura local + pinyin / romaji) |

## Cosas a completar / revisar
- Códigos de reserva, QR y adjuntos: cargarlos en la app, en el pasaje, la entrada o el hotel (o `code` en `transport.json` / `documents.json`).
- Cotizaciones de `trip.json` y de Ajustes son de ejemplo.
- Coordenadas con `"approx": true` (hoteles por reservar, algunos lugares y las "sugerencias") son aproximadas.
- Las descargas offline de mapa usan servidores públicos de tiles: usalas con moderación.
