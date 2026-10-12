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
- [ ] **Hoteles por reservar** (Shanghai, Tokio, Osaka, Pekín y la extensión de Portopia): nombre, dirección y coordenadas reales. Hoy tienen la ubicación aproximada de la zona.
- [ ] **Dirección en idioma local** (`addressLocal`) de cada hotel, para el botón "Mostrar dirección al taxista". La función existe pero no hay datos.
- [ ] **Viajeros reales** en `travelers.json`. Hoy están "Yo" y "Viajero 2" de ejemplo.
- [ ] **Verificar coordenadas aproximadas** (`approx: true`), sobre todo Hakone (hotel, Ubako, Togendai) y las 5 sugerencias gastronómicas.
- [ ] **Horarios pendientes**: vuelo Kansai → Pekín (1/12) y Pekín → Pudong (4/12, hoy estimado a las 15:00).

### Respaldo y publicación
- [ ] **Respaldo completo de datos locales**: exportar e importar fotos, códigos, actividades hechas, pendientes y checklists. Hoy solo se exportan los gastos, así que si se pierde o se cambia el celular se pierde lo demás.
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
- [ ] Agregar o editar **actividades, lugares y notas propias** sin tocar el JSON (guardadas localmente y exportables).
- [ ] Editar **viajeros** y la **checklist** de salida desde la app.
- [ ] Marcar un hospedaje o un transporte como reservado y cargar su código desde la vista de día.

### Recordatorios
- [ ] **Notificaciones locales** para pendientes con fecha (ventanas de venta del Fuji Excursion, Romancecar, Shibuya Sky) y para la hora de salir al aeropuerto.

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
- [ ] **Buscador** de actividades, lugares y documentos.
- [ ] Atajo "Cómo vuelvo al hotel" desde la ubicación actual.

## P3 — A futuro

### Armar viajes nuevos
- [ ] **Conversor Excel → JSON** dentro del repo (`tools/`) o importación de planilla desde la app. El conversor usado para este viaje fue un script descartable que no está en el repo.
- [ ] **Selector de viajes** en la app (hoy solo con `?data=carpeta`).
- [ ] **JSON Schema** y validación de datos con mensajes claros cuando un archivo tiene errores.
- [ ] Plantilla de viaje vacía y guía para crear uno.

### Funciones con internet (opcionales)
- [ ] Clima de la ciudad del día.
- [ ] Sincronización opcional entre celulares (WebRTC, un gist o un archivo compartido) para gastos y fotos.
- [ ] Compartir el itinerario en solo lectura con familia o amigos.

### Mapas
- [ ] **Mapas vectoriales offline** autoalojados (PMTiles / Protomaps) para no depender de tiles públicos ni de sus límites de uso.
- [ ] Rutas a pie o en transporte entre actividades.

### Otros
- [ ] Frases útiles y traducciones offline (chino y japonés).
- [ ] Interfaz en otros idiomas (hoy solo español).
- [ ] Auditoría de accesibilidad (lectores de pantalla, contraste en modo oscuro, tamaños de toque).

## Deuda técnica

- [ ] **Tests automatizados** (lógica de fase del viaje, saldos de gastos, GCJ-02, unión de imports) e integración continua. Hoy solo hubo pruebas manuales con Playwright.
- [ ] Linter y formato (ESLint/Prettier).
- [ ] La lista de precarga del service worker (`CORE` en `sw.js`) se mantiene a mano: generarla o validarla.
- [ ] Límite de tiles en caché por cantidad (2500) en lugar de por tamaño; las respuestas opacas ocupan más cuota de la real.
- [ ] Revisar el modo oscuro: no se probó visualmente.
- [ ] Al volver a dibujar una vista se recrean sus mapas; se podría actualizar solo lo que cambió.

Ver también: [VISION.md](VISION.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [FEATURES.md](FEATURES.md)
