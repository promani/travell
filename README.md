# Travell — asistente de viaje offline (PWA)

App web estática (HTML + JavaScript, sin backend ni build). Lee JSON, funciona sin internet y se instala en el celular.
Incluido: el viaje **China y Japón 2026** (convertido del Excel), pero sirve para cualquier viaje: solo cambian los JSON.

## Probarla
```bash
python3 -m http.server 8123      # cualquier servidor estático sirve (también GitHub Pages, Netlify…)
# abrir http://localhost:8123
```
Con HTTPS (o localhost) se registra el service worker: la primera visita con internet deja todo guardado y después anda offline.
Para ver cada momento del viaje: **Más → Ajustes → Probar con otra fecha**.

## Qué hace
- **Inicio**: "Faltan N días para tu viaje" + accesos a *Pasajes y códigos* y *Visas y documentos*. El día de salida: "Hoy es el día del viaje", hora de salir, hora de estar en el aeropuerto y cuenta regresiva. En cada día con tarjeta (p. ej. llegada a Shanghai) muestra cómo llegar al hospedaje, mapa con la ruta y links de interés (red de metro, etc.). Siempre hay un mapa con puntos de interés cercanos.
- **Día**: actividades con horario, detalle, marcado como hecho, alertas, logística, documentos, fotos y gastos del día.
- **Mapa**: Leaflet (no usa Google). En China continental usa tiles de AutoNavi/Gaode (con conversión GCJ-02), fuera de China OpenStreetMap. Filtros por categoría (gastronomía, cultura…), cerca/día/todo, GPS y "Guardar zona offline".
- **Fotos**: se guardan en el dispositivo (IndexedDB), por día.
- **Gastos**: multi-moneda, división igual o a medida, saldos y "quién le paga a quién". Exportar/Importar JSON para juntar las cuentas de todos sin servidor.
- **Documentos**: códigos de reserva en pantalla completa, adjuntar PDFs/capturas (QR) offline.

## Datos (`data/*.json`)
Todo está anclado a días (`"day": "d03"`). `?data=trips/otro` carga otra carpeta de viaje.

| Archivo | Contenido |
|---|---|
| `trip.json` | título, fechas, ciudades (con proveedor de mapa), categorías, monedas |
| `itinerary.json` | **itinerario principal**: días → actividades y tarjetas (`departure`, `arrival`, `info`) |
| `transport.json` | vuelos, trenes, traslados |
| `lodging.json` | hospedajes (check-in/out, coordenadas) |
| `places.json` | lugares de interés (gastronomía, cultura…) con coordenadas |
| `documents.json` | pasajes, visas, entradas, confirmaciones |
| `travelers.json` | viajeros (para dividir gastos) |
| `tasks.json`, `notes.json`, `links.json` | pendientes, alertas, enlaces |

## Cosas a completar / revisar
- Códigos de reserva y adjuntos: cargarlos en la app (Documentos) o en `documents.json`.
- Viajeros: `travelers.json` trae "Yo" y "Viajero 2" de ejemplo.
- Cotizaciones de `trip.json` y de Ajustes son de ejemplo.
- Coordenadas con `"approx": true` (hoteles por reservar, algunos lugares y las "sugerencias") son aproximadas.
- Las descargas offline de mapa usan servidores públicos de tiles: usalas con moderación.
