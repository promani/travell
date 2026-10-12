# Backlog

Lo que **todavía no está implementado** o quedó a medias. Prioridades:

- **P1**: necesario para usar la app en este viaje (salida: 12/11/2026).
- **P2**: mejora clara del uso diario.
- **P3**: a futuro o "estaría bueno".

Ver lo que ya funciona en [FEATURES.md](FEATURES.md).

---

## P1 — Antes de viajar

### Datos del viaje
- [ ] **Cargar códigos de reserva** de MU746, MU745 y 9C6217, hoteles y entradas. Hoy `documents.json` los trae vacíos.
- [ ] **Hoteles por reservar** (Shanghai, Tokio, Osaka, Pekín y la extensión de Portopia): nombre, dirección, dirección en idioma local y ubicación. Ya se pueden cargar desde la app (Alojamientos → Editar); falta hacerlo.
- [ ] **Viajeros reales**: cargarlos desde Viajeros o en `travelers.json`. Hoy están "Yo" y "Viajero 2" de ejemplo.
- [ ] **Revisar `requirements.json`** (preparativos sugeridos): confirmar con fuentes oficiales qué pide cada país, por ejemplo si China exige el certificado de fiebre amarilla viniendo de Argentina. Hoy dice "verificar".
- [ ] **Verificar coordenadas aproximadas** (`approx: true`), sobre todo Hakone (hotel, Ubako, Togendai) y las 5 sugerencias gastronómicas.
- [ ] **Horarios pendientes**: vuelo Kansai → Pekín (1/12) y Pekín → Pudong (4/12, hoy estimado a las 15:00).

### Respaldo y publicación
- [x] ~~Respaldo completo de datos locales~~: Ajustes → Respaldo completo (incluye fotos, adjuntos, códigos, marcas y checklists).
- [x] ~~Alojar el relay~~: corre en el mismo contenedor que la app.
- [ ] **Probar la latencia del relay desde China** (y que el dominio sea accesible desde China y Japón).
- [x] ~~Publicar en el lab~~: https://travell.unab.dpdns.org, se despliega desde `main` del repo `unab-lab/travell`.
- [ ] **Probar la instalación** en iOS y Android.
- [x] ~~Aviso de nueva versión~~: barra "Hay una versión nueva de la app · Actualizar". La app busca versiones nuevas cada 30 minutos.

### Mapas offline
- [x] ~~Precargar mapas de cada ciudad~~: Ajustes → Mapas offline por ciudad (una ciudad o todas, con progreso).
- [ ] **Imágenes offline de los mapas de metro** (Shanghai, Tokio, Osaka, Pekín) como adjuntos o archivos en `data/`.

### Pruebas en condiciones reales
- [ ] Probar AutoNavi y la conversión GCJ-02 con un celular **dentro de China** (sin VPN).
- [ ] Probar el modo avión de punta a punta en el celular.

## P2 — Mejoras del uso diario

### Zonas horarias
- [x] ~~Zona horaria por ciudad~~ y días de vuelo largo: `tz` por ciudad en `trip.json`, día que empieza en la zona de origen y pasa a la de destino con el vuelo.
- [ ] Cargar `departAt` del vuelo Kansai → Pekín (1/12): sin él, las horas de la mañana de ese día se leen en hora de Pekín (1 h de diferencia).
- [ ] Vencimiento de tareas con zona: hoy se guarda en la hora del celular que la cargó.

### Editar desde la app
Ya hay ABM de lugares, alojamientos, actividades, tareas y viajeros. Falta:
- [ ] ABM de **transportes**, **documentos**, **alertas** y **tarjetas de día** (llegada / salida).
- [ ] Editar la **checklist** de salida.
- [x] ~~Restaurar un registro del JSON~~: botón "↺ Restaurar original" en el formulario, y lista de cambios en Ajustes (se sincroniza).
- [ ] Ver el **historial** de un registro (quién lo cambió y cuándo; hoy solo se guarda la última edición).

### Tareas y grupo
- [ ] **Tareas repetitivas** o con subtareas (checklist dentro de una tarea).
- [ ] **Comentarios** en una tarea.
- [ ] Avisar cuando un viajero **completa** una tarea que yo le asigné.
- [ ] **Ubicación en segundo plano**: una web no puede compartirla con la app cerrada. Haría falta una app nativa, o sugerir abrir la app.
- [ ] Botón **"¿Dónde nos encontramos?"**: proponer un punto de encuentro en el mapa y avisar al grupo.
- [ ] **Autenticación** en el relay (token por grupo) para evitar que alguien llene un grupo con basura.
- [ ] Resolver **conflictos** campo por campo en vez de "gana la última edición".

### Recordatorios
- [ ] **Notificaciones programadas** para tareas con fecha (ventanas de venta del Fuji Excursion, Romancecar, Shibuya Sky) y para la hora de salir al aeropuerto. Hoy solo hay avisos al recibir una tarea asignada, y con la app abierta.
- [ ] Más **reglas de sugerencias**: vuelos sin hora confirmada, días sin actividades, actividades fuera del horario de apertura, conexiones ajustadas entre transportes.

### Documentos
- [x] ~~Compartir confirmaciones a la app~~ (share target en Android, pegar en iPhone): Más → Compartido.
- [ ] **Leer la confirmación con IA** (endpoint en el relay que extrae vuelo / hotel / entrada, fechas y código) para reemplazar las reglas de `js/guess.js`, y crear el pasaje u hotel si todavía no existe.
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
- [x] ~~Buscador global~~ (🔎 en el encabezado): días, actividades, lugares, tareas, documentos, alojamientos, transporte, alertas y sugerencias.
- [ ] Atajo "Cómo vuelvo al hotel" desde la ubicación actual.

## P3 — A futuro

### Armar viajes nuevos
- [ ] **Conversor Excel → JSON** dentro del repo (`tools/`) o importación de planilla desde la app. El conversor usado para este viaje fue un script descartable que no está en el repo.
- [ ] **Selector de viajes** en la app (hoy solo con `?data=carpeta`).
- [ ] **JSON Schema** y validación de datos con mensajes claros cuando un archivo tiene errores.
- [ ] Plantilla de viaje vacía y guía para crear uno.

### Varios viajes: el storage sale del repo
Hoy el viaje vive en `data/*.json` dentro del repo y cada viaje nuevo es un commit y un deploy. Para que escale:
- [ ] **Datos del viaje en Redis**: un documento por archivo actual (`<REDIS_KEY_PREFIX>trip:<tripId>:itinerary`, etc.) y un índice de viajes. Endpoints en el backend (`GET /v1/trips`, `GET /v1/trips/:id`) y la app los pide en lugar de `data/`. `data/` queda como semilla, para importar un viaje y para los tests.
- [ ] **Acceso por viaje**: hoy `data/*.json` es público para cualquiera que conozca la URL, y R2 acepta subidas o borrados de cualquiera que arme una ruta. Un token por viaje o grupo (ver "Autenticación en el relay") que se pida para leer el viaje y para usar `/v1/files`.
- [ ] **Relay en Redis** en lugar de memoria + un JSON por grupo en el volumen `/data` (secuencia con `INCR`, registros por `seq`), así el contenedor no tiene estado y se puede reiniciar o escalar.
- [ ] **Clima por viaje**: hoy el backend lo calcula solo para el `trip.json` que encuentra al arrancar.
- [ ] **Archivos estáticos del viaje** (mapas de metro, adjuntos de recursos) en R2, bajo `<tripId>/`, no en el repo.
- [ ] **Offline**: el service worker precarga `data/*.json` por nombre; con datos dinámicos tiene que guardar `/v1/trips/:id` (y la app su copia) para seguir andando sin conexión.
- [ ] Decidir si los datos del viaje en Redis van **en claro** (el backend puede leerlos: clima, leer confirmaciones con IA) o **cifrados** con la clave del grupo, como el relay.

### Funciones con internet (opcionales)
- [x] ~~Clima de la ciudad del día~~: pronóstico o clima típico, desde el relay.
- [ ] Sincronizar **fotos** entre celulares (hoy la sincronización no incluye archivos).
- [ ] Compartir el itinerario en solo lectura con familia o amigos.

### Mapas
- [ ] **Mapas vectoriales offline** autoalojados (PMTiles / Protomaps) para no depender de tiles públicos ni de sus límites de uso.
- [ ] Rutas a pie o en transporte entre actividades.

### Otros
- [x] ~~Frases útiles offline (chino y japonés)~~: cheat sheet con kanji/hanzi.
- [ ] Traducciones offline.
- [ ] Interfaz en otros idiomas (hoy solo español).
- [ ] Auditoría de accesibilidad (lectores de pantalla, contraste en modo oscuro, tamaños de toque).

## Deuda técnica

- [x] ~~Tests automatizados~~: `npm test` (con `node:test`, sin dependencias): gastos, GCJ-02, modelo de datos con overlay, sugerencias, fase del viaje, relay, archivos y clima.
- [ ] **Integración continua** (GitHub Actions corriendo `npm test`) y tests de interfaz automatizados (hoy las pruebas con Playwright se corren a mano).
- [ ] Linter y formato (ESLint/Prettier).
- [x] ~~Validar la lista de precarga del service worker~~: `tests/sw.test.mjs` falla si falta un archivo o si un módulo o JSON no está en `CORE`.
- [ ] Límite de tiles en caché por cantidad (2500) en lugar de por tamaño; las respuestas opacas ocupan más cuota de la real.
- [ ] Revisar el modo oscuro: no se probó visualmente.
- [ ] Al volver a dibujar una vista se recrean sus mapas; se podría actualizar solo lo que cambió.
- [ ] El relay guarda todo en memoria y en un JSON por grupo: alcanza para grupos de viaje, no para muchos usuarios.
- [ ] Migraciones del formato de los registros locales (hoy hay una sola, de la v1 a la v2).

Ver también: [VISION.md](VISION.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [FEATURES.md](FEATURES.md)
