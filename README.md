# Travell — asistente de viaje offline (PWA)

App web estática (HTML + JavaScript, sin backend ni build). Lee JSON, funciona sin internet y se instala en el celular.
Incluido: el viaje **China y Japón 2026** (convertido del Excel), pero sirve para cualquier viaje: solo cambian los JSON.

## Documentación
- [VISION.md](VISION.md): propósito y principios
- [ARCHITECTURE.md](ARCHITECTURE.md): arquitectura de la PWA y modo offline
- [FEATURES.md](FEATURES.md): funcionalidades
- [BACKLOG.md](BACKLOG.md): lo que falta implementar

## Probarla
```bash
python3 -m http.server 8123      # cualquier servidor estático sirve (también GitHub Pages, Netlify…)
# abrir http://localhost:8123
```
Con HTTPS (o localhost) se registra el service worker: la primera visita con internet deja todo guardado y después anda offline.
Para ver cada momento del viaje: **Más → Ajustes → Probar con otra fecha**.

## Tests
```bash
npm test        # node --test, sin dependencias
npm start       # app + relay en http://localhost:3000
```

## Deploy con Docker (app + sincronización en un contenedor)
```bash
docker build -t travell . && docker run -p 3000:3000 -v travell-data:/data travell
```
`server/relay.mjs` sirve la PWA (solo `index.html`, `css/`, `js/`, `data/`, `icons/`, `vendor/`, `sw.js` y el manifest) y la sincronización en el mismo puerto (`PORT`, 3000 por defecto). Como `trip.json` tiene `"sync": {"relayUrl": "same-origin"}`, en la app solo hay que cargar el código del grupo. Sirve para Dokploy o cualquier plataforma que construya desde el `Dockerfile`.

## Sincronización opcional (relay)
```bash
PORT=8787 RELAY_DATA=./relay-data node server/relay.mjs   # Node 18+, sin dependencias
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
- **Inicio**: "Faltan N días para tu viaje" + accesos a *Pasajes y códigos* y *Visas y documentos*. El día de salida: "Hoy es el día del viaje", hora de salir, hora de estar en el aeropuerto y cuenta regresiva. En cada día con tarjeta (p. ej. llegada a Shanghai) muestra cómo llegar al hospedaje, mapa con la ruta y links de interés (red de metro, etc.). Muestra el clima del día.
- **Día**: actividades con horario, detalle, marcado como hecho, alertas, logística, documentos, fotos y gastos del día.
- **Mapa**: Leaflet (no usa Google). En China continental usa tiles de AutoNavi/Gaode (con conversión GCJ-02), fuera de China OpenStreetMap. Filtros por categoría (gastronomía, cultura…), cerca/día/todo, GPS y "Guardar zona offline".
- **Fotos**: se guardan en el dispositivo (IndexedDB), por día.
- **Gastos**: multi-moneda, división igual o a medida, saldos y "quién le paga a quién". Exportar/Importar JSON para juntar las cuentas de todos sin servidor.
- **Documentos**: códigos de reserva en pantalla completa, adjuntar PDFs/capturas (QR) offline.
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
| `phrases.json` | frases útiles en mandarín y japonés (escritura local + pinyin / romaji) |

## Cosas a completar / revisar
- Códigos de reserva y adjuntos: cargarlos en la app (Documentos) o en `documents.json`.
- Viajeros: `travelers.json` trae "Yo" y "Viajero 2" de ejemplo (se editan en la app).
- Cotizaciones de `trip.json` y de Ajustes son de ejemplo.
- Coordenadas con `"approx": true` (hoteles por reservar, algunos lugares y las "sugerencias") son aproximadas.
- Las descargas offline de mapa usan servidores públicos de tiles: usalas con moderación.
