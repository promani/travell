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
- [ ] **Respaldo completo de datos locales**: hoy "Exportar datos" incluye tareas, lugares, alojamientos, actividades, viajeros, gastos y ubicaciones, pero no **fotos, adjuntos, códigos cargados, actividades hechas ni checklists**.
- [ ] **Alojar el relay** (si se quiere la sincronización automática): un servidor con HTTPS accesible desde China y Japón. Probar la latencia desde China.
- [ ] **Publicar en HTTPS** (GitHub Pages, Netlify o similar) para que el service worker funcione en el celular. Probar la instalación en iOS y Android.
- [ ] **Aviso de nueva versión** cuando el service worker se actualiza ("Hay datos nuevos, tocá para recargar"). Hoy se toma en la siguiente apertura o desde Ajustes.

### Mapas offline
- [ ] **Precargar mapas de cada ciudad** desde Ajustes, con un botón por ciudad y progreso, en lugar de hacerlo zona por zona desde el mapa.
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
- [ ] **Restaurar** un registro del JSON que se editó o borró en la app (hoy hay que borrar los datos locales).
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
- [ ] **Buscador global** de actividades, lugares, tareas y documentos (hoy solo se busca en Lugares).
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

- [ ] **Tests automatizados** (fase del viaje, saldos de gastos, GCJ-02 ida y vuelta, `rebuild()` del overlay, reglas de sugerencias, sincronización con el relay) e integración continua. Hoy solo hubo pruebas manuales con Playwright, con dos celulares simulados y el relay local.
- [ ] Linter y formato (ESLint/Prettier).
- [ ] La lista de precarga del service worker (`CORE` en `sw.js`) se mantiene a mano: generarla o validarla.
- [ ] Límite de tiles en caché por cantidad (2500) en lugar de por tamaño; las respuestas opacas ocupan más cuota de la real.
- [ ] Revisar el modo oscuro: no se probó visualmente.
- [ ] Al volver a dibujar una vista se recrean sus mapas; se podría actualizar solo lo que cambió.
- [ ] El relay guarda todo en memoria y en un JSON por grupo: alcanza para grupos de viaje, no para muchos usuarios.
- [ ] Migraciones del formato de los registros locales (hoy hay una sola, de la v1 a la v2).

Ver también: [VISION.md](VISION.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [FEATURES.md](FEATURES.md)
