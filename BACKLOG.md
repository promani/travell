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
- [ ] **Alojar el relay** (si se quiere la sincronización automática): un servidor con HTTPS accesible desde China y Japón. Probar la latencia desde China.
- [ ] **Publicar en el lab**: la app ya está creada en Dokploy (https://travell.unab.dpdns.org) desde el repo `unab-lab/travell`, que todavía está vacío. Falta subir el código a su `main` (o apuntar Dokploy al repo de GitHub) y verificar el deploy. Después, probar la instalación en iOS y Android.
- [x] ~~Aviso de nueva versión~~: barra "Hay una versión nueva de la app · Actualizar". La app busca versiones nuevas cada 30 minutos.

### Mapas offline
- [x] ~~Precargar mapas de cada ciudad~~: Ajustes → Mapas offline por ciudad (una ciudad o todas, con progreso).
- [ ] **Imágenes offline de los mapas de metro** (Shanghai, Tokio, Osaka, Pekín) como adjuntos o archivos en `data/`.

### Pruebas en condiciones reales
- [ ] Probar AutoNavi y la conversión GCJ-02 con un celular **dentro de China** (sin VPN).
- [ ] Probar el modo avión de punta a punta en el celular.

## P2 — Mejoras del uso diario

### Zonas horarias
- [ ] **Zona horaria por ciudad** en `trip.json` y horarios con zona en transportes. Hoy las horas se interpretan en la zona del dispositivo: si el celular no cambió de zona, o en vuelos que cruzan husos, las cuentas regresivas pueden quedar corridas.
- [ ] Manejar los días de vuelo largo y el cruce de la línea de cambio de fecha (13–14/11).

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

### Funciones con internet (opcionales)
- [ ] Clima de la ciudad del día.
- [ ] Sincronizar **fotos** entre celulares (hoy la sincronización no incluye archivos).
- [ ] Compartir el itinerario en solo lectura con familia o amigos.

### Mapas
- [ ] **Mapas vectoriales offline** autoalojados (PMTiles / Protomaps) para no depender de tiles públicos ni de sus límites de uso.
- [ ] Rutas a pie o en transporte entre actividades.

### Otros
- [ ] Frases útiles y traducciones offline (chino y japonés).
- [ ] Interfaz en otros idiomas (hoy solo español).
- [ ] Auditoría de accesibilidad (lectores de pantalla, contraste en modo oscuro, tamaños de toque).

## Deuda técnica

- [x] ~~Tests automatizados~~: `npm test` (23 tests con `node:test`, sin dependencias): gastos, GCJ-02, modelo de datos con overlay, sugerencias, fase del viaje y relay.
- [ ] **Integración continua** (GitHub Actions corriendo `npm test`) y tests de interfaz automatizados (hoy las pruebas con Playwright se corren a mano).
- [ ] Linter y formato (ESLint/Prettier).
- [x] ~~Validar la lista de precarga del service worker~~: `tests/sw.test.mjs` falla si falta un archivo o si un módulo o JSON no está en `CORE`.
- [ ] Límite de tiles en caché por cantidad (2500) en lugar de por tamaño; las respuestas opacas ocupan más cuota de la real.
- [ ] Revisar el modo oscuro: no se probó visualmente.
- [ ] Al volver a dibujar una vista se recrean sus mapas; se podría actualizar solo lo que cambió.
- [ ] El relay guarda todo en memoria y en un JSON por grupo: alcanza para grupos de viaje, no para muchos usuarios.
- [ ] Migraciones del formato de los registros locales (hoy hay una sola, de la v1 a la v2).

Ver también: [VISION.md](VISION.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [FEATURES.md](FEATURES.md)
