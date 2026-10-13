# Backlog

Solo lo que **falta**: lo que ya funciona está en [FEATURES.md](FEATURES.md). Prioridades:

- **P1**: necesario para usar la app en este viaje (salida: 12/11/2026).
- **P2**: mejora clara del uso diario.
- **P3**: a futuro o "estaría bueno".

---

## P1 — Antes de viajar

### Datos del viaje
Los datos viven en `data/*.json`, en el repo, y se completan editándolos ahí (o desde la app).
- [ ] **Hoteles por reservar**: Shanghai (14–18/11), Tokio (18–23/11), Osaka (25–26/11), extensión del Portopia (30/11–1/12) y Pekín (1–4/12). Cuando estén: nombre, dirección, dirección en idioma local y ubicación exacta.
- [ ] **Transportes por reservar** (`status: "pendiente"` en `transport.json`, con cuándo comprar cada uno): Shanghai ↔ Suzhou, Narita Express, Fuji Excursion (venta desde el 20/10), Romancecar (desde el 23/10), Hakone Free Pass, Hikari Odawara → Shin-Osaka, Kansai → Pekín, Pekín ↔ Mutianyu y Pekín → Pudong.
- [ ] **Códigos de reserva y QR** de los vuelos (MU746, MU745, 9C6217), hoteles y entradas: se cargan en la app, en cada pasaje, entrada u hotel.
- [ ] **Documentos sin código**: Visit Japan Web, NZeTA y seguro de viaje (`documents.json`). China no pide visa (estadías de menos de 10 días, hasta el 31/12/2026).
- [ ] **Revisar `requirements.json`** (preparativos sugeridos): confirmar con fuentes oficiales el resto de lo que pide cada país (el certificado de fiebre amarilla para China ya está confirmado y es un documento).
- [ ] **Verificar coordenadas aproximadas** (`approx: true`): todos los alojamientos, Ubako y Hoto en Hakone, y las 5 sugerencias gastronómicas (`p-x-*`).
- [ ] **Separación del grupo el 1/12**: vuelo de Facundo a Inglaterra (desde dónde y a qué hora), para que el día 20 lo muestre.
- [ ] **Horarios pendientes**: vuelo Kansai → Pekín (1/12, falta `departAt`: sin él, la mañana de ese día se lee en hora de Pekín) y Pekín → Pudong (4/12, hoy estimado a las 15:00).

### Mapas offline
- [ ] **Imágenes offline de los mapas de metro** (Shanghai, Tokio, Osaka, Pekín) como adjuntos o archivos en `data/`.

### Pruebas en condiciones reales
- [ ] **Instalación** en iOS y Android.
- [ ] **Modo avión** de punta a punta en el celular.
- [ ] **Desde China** (sin VPN): que el dominio abra, la latencia del relay, y AutoNavi con la conversión GCJ-02.

## P2 — Mejoras del uso diario

### Zonas horarias
- [ ] Vencimiento de tareas con zona: hoy se guarda en la hora del celular que la cargó.

### Editar desde la app
Ya hay ABM de lugares, alojamientos, actividades, tareas y viajeros. Falta:
- [ ] ABM de **transportes**, **documentos**, **alertas** y **tarjetas de día** (llegada / salida).
- [ ] Editar la **checklist** de salida.
- [ ] Ver el **historial** de un registro (quién lo cambió y cuándo; hoy solo se guarda la última edición).

### Tareas y grupo
- [ ] **Tareas repetitivas** o con subtareas (checklist dentro de una tarea).
- [ ] **Comentarios** en una tarea.
- [ ] Avisar cuando un viajero **completa** una tarea que yo le asigné.
- [ ] **Ubicación en segundo plano**: una web no puede compartirla con la app cerrada. Haría falta una app nativa, o sugerir abrir la app.
- [ ] Botón **"¿Dónde nos encontramos?"**: proponer un punto de encuentro en el mapa y avisar al grupo.
- [ ] **Autenticación** en el backend (token por grupo): hoy cualquiera puede escribir en un grupo, subir o borrar archivos en R2 (`/v1/files`) y leer `data/*.json` (nombres, vuelos, hoteles).
- [ ] Resolver **conflictos** campo por campo en vez de "gana la última edición".

### Recordatorios
- [ ] **Notificaciones programadas** para tareas con fecha (ventanas de venta del Fuji Excursion, Romancecar, Shibuya Sky) y para la hora de salir al aeropuerto. Hoy solo hay avisos al recibir una tarea asignada, y con la app abierta.
- [ ] Más **reglas de sugerencias**: vuelos sin hora confirmada, días sin actividades, actividades fuera del horario de apertura, conexiones ajustadas entre transportes.

### Documentos
- [ ] **Agente de IA** siempre disponible ("cambiá el itinerario del día 5 por esto"): conversación que propone cambios con el mismo formato y validación que "Leer con IA" (ver ARCHITECTURE → Cambios de administración e IA).
- [ ] Pantalla de **historial de cambios** de administración, con "volver al repo" por registro y un export para pasarlos al repo.
- [ ] Reenviar el mail a una dirección del grupo (Cloudflare Email Routing → Worker): choca con el cifrado de punta a punta del relay.
- [ ] Generar **QR o código de barras** a partir del código cargado.
- [ ] Vencimientos de documentos (pasaporte, seguro) con aviso.

### Gastos
- [ ] Foto del **comprobante** asociada al gasto.
- [ ] Gráfico por categoría y por día.
- [ ] Liquidación en una moneda elegida por persona.
- [ ] Cotizaciones automáticas cuando hay internet.

### Fotos
- [ ] Ubicación de la foto (EXIF o GPS al sacarla) y **mapa de fotos**.
- [ ] Exportar el álbum de un día o del viaje (zip).

### Búsqueda y navegación
- [ ] Atajo "Cómo vuelvo al hotel" desde la ubicación actual.

## P3 — A futuro

### Armar viajes nuevos
- [ ] **Conversor Excel → JSON** dentro del repo (`tools/`) o importación de planilla desde la app. El conversor usado para este viaje fue un script descartable que no está en el repo.
- [ ] **Selector de viajes** en la app (hoy solo con `?data=carpeta`).
- [ ] **JSON Schema** y validación de datos con mensajes claros cuando un archivo tiene errores.
- [ ] Plantilla de viaje vacía y guía para crear uno.

### Varios viajes: el storage sale del repo
**No por ahora.** Mientras haya un solo viaje, que todo esté en el repo es a propósito: se edita el viaje desde acá, con todo el contexto a mano. Cuando haya varios viajes:
- [ ] **Datos del viaje en Redis**: un documento por archivo actual (`<REDIS_KEY_PREFIX>trip:<tripId>:itinerary`, etc.) y un índice de viajes. Endpoints en el backend (`GET /v1/trips`, `GET /v1/trips/:id`) y la app los pide en lugar de `data/`. `data/` queda como semilla, para importar un viaje y para los tests.
- [ ] **Acceso por viaje**: el token de "Autenticación en el backend" (P2), por viaje, para leer sus datos y sus archivos.
- [ ] **Relay en Redis** en lugar de memoria + un JSON por grupo en el volumen `/data` (secuencia con `INCR`, registros por `seq`), así el contenedor no tiene estado y se puede reiniciar o escalar.
- [ ] **Clima por viaje**: hoy el backend lo calcula solo para el `trip.json` que encuentra al arrancar.
- [ ] **Archivos estáticos del viaje** (mapas de metro, adjuntos de recursos) en R2, bajo `<tripId>/`, no en el repo.
- [ ] **Offline**: el service worker precarga `data/*.json` por nombre; con datos dinámicos tiene que guardar `/v1/trips/:id` (y la app su copia) para seguir andando sin conexión.
- [ ] Decidir si los datos del viaje en Redis van **en claro** (el backend puede leerlos: clima, leer confirmaciones con IA) o **cifrados** con la clave del grupo, como el relay.

### Funciones con internet (opcionales)
- [ ] Sincronizar **fotos** entre celulares (hoy la sincronización no incluye archivos).
- [ ] Compartir el itinerario en solo lectura con familia o amigos.

### Mapas
- [ ] **Mapas vectoriales offline** autoalojados (PMTiles / Protomaps) para no depender de tiles públicos ni de sus límites de uso.
- [ ] Rutas a pie o en transporte entre actividades.

### Otros
- [ ] Traducciones offline.
- [ ] Interfaz en otros idiomas (hoy solo español).
- [ ] Auditoría de accesibilidad (lectores de pantalla, contraste en modo oscuro, tamaños de toque).

## Deuda técnica

- [ ] **Tests antes del deploy**: cada push a `main` despliega sin correr `npm test` (por ejemplo, `RUN npm test` en el `Dockerfile` o GitHub Actions). Y tests de interfaz automatizados: hoy las pruebas con Playwright se corren a mano.
- [ ] Linter y formato (ESLint/Prettier).
- [ ] Límite de tiles en caché por cantidad (2500) en lugar de por tamaño; las respuestas opacas ocupan más cuota de la real.
- [ ] Revisar el modo oscuro: no se probó visualmente.
- [ ] Al volver a dibujar una vista se recrean sus mapas; se podría actualizar solo lo que cambió.
- [ ] Migraciones del formato de los registros locales (hoy hay una sola, de la v1 a la v2).

Ver también: [VISION.md](VISION.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [FEATURES.md](FEATURES.md)
