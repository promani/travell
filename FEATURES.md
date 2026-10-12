# Funcionalidades

Estado: ✅ implementado · 🟡 parcial (ver [BACKLOG.md](BACKLOG.md))

La navegación principal es una barra inferior con **Inicio · Día · Mapa · Fotos · Gastos · Más**.

---

## 1. Inicio contextual ✅

La pantalla de inicio cambia según el momento del viaje.

| Momento | Qué muestra |
|---|---|
| **Antes del viaje** | "Faltan **N** días para tu viaje", fechas y día de salida. Accesos a **Pasajes y códigos** y **Visas y documentos**. Documentos clave fijados. Próximos pendientes con su vencimiento. |
| **Día de salida** | "**Hoy es el día del viaje**" con hora de salir de casa, hora de estar en el aeropuerto (despegue menos la anticipación configurada), hora de despegue y vuelo. Cuenta regresiva en vivo y checklist "Antes de salir". |
| **Durante el viaje** | "Día N de M · ciudad", título, resumen y dónde se duerme. Tarjetas del día (llegada, salida). La actividad **actual** y la **siguiente**. Alertas del día. |
| **Después del viaje** | "¡Volviste!" con accesos a fotos y gastos. |

En todos los casos hay un **mapa con puntos de interés cercanos** y una lista ordenada por distancia.

## 2. Agenda de viaje ✅

- **Itinerario completo** (Más → Itinerario): lista de días con fecha, ciudad y resumen. El día actual aparece resaltado.
- **Vista de día** (`#/dia/dNN`):
  - Tira de días deslizable y flechas de anterior/siguiente.
  - Título, fecha, ciudad, resumen y dónde se duerme.
  - **Actividades del día** con horario, categoría, prioridad (⭐ imperdible / opcional) y si necesita reserva. Al tocar una se ve el detalle, la zona, cómo llegar, el costo, el estado, el link y "Ver en el mapa".
  - Marcar actividades como **hechas**. Resaltado de **Ahora** y **Sigue** cuando el día es hoy.
  - Filtro **Solo imperdibles**.
  - **Logística**: transportes del día, check-in y check-out.
  - Documentos del día, links de interés de la ciudad, fotos del día y total gastado del día.
- **Alertas** por día (cierres, feriados, clima, requisitos), con nivel de aviso o información.

## 3. Tarjetas de llegada y salida ✅

Se configuran en el JSON del día.

- **Salida (`departure`)**: vuelo, anticipación en el aeropuerto, hora de salida, checklist con casillas que se guardan y accesos a documentos. Incluidas: salida de Buenos Aires, vuelo Shanghai → Tokio y vuelta desde Pekín.
- **Llegada (`arrival`)**: cómo llegar al hospedaje con varias opciones (duración, costo, cuál se sugiere), mapa con la ruta dibujada y leyenda, hospedaje del día y **links de interés** (red de metro, apps de transporte). Incluidas: Shanghai (Maglev + metro, taxi/DiDi, metro directo), Tokio (Narita Express, Skyliner) y Pekín (Airport Express, taxi).
- **Información (`info`)**: tarjeta libre con texto y links.

## 4. Mapa y lugares de interés ✅

- Mapa con Leaflet, sin Google. En **China continental** usa tiles de **AutoNavi/Gaode** con corrección de coordenadas GCJ-02; en el resto, **OpenStreetMap**. El cambio es automático según la zona y también se puede elegir a mano.
- Alcance: **Cerca** (por GPS o la ciudad del día) · **Día** (lugares de un día elegido) · **Todo** el viaje.
- Filtros por categoría: 🍜 gastronomía, 🏯 cultura, 🌿 naturaleza, 🛍️ compras, 🌙 noche, ⛴️ aventura, ♨️ onsen y 🚆 traslados.
- Marcadores de hospedajes, tu ubicación con precisión y lista ordenada por distancia.
- **Ficha de lugar**: nombre en el idioma local con botón **Copiar** (para mostrar o pegar en un taxi), descripción, costo, en qué días aparece, aviso de ubicación aproximada y botones para abrir en Amap, OSM o Google.
- **Guardar zona offline**: precarga los tiles del área visible.
- 90 lugares cargados para este viaje: 85 del itinerario y 5 sugerencias gastronómicas.

## 5. Documentos ✅

- Tipos: 🎫 pasajes · 🛂 visas y trámites · 🎟️ entradas · 🏨 hospedaje · 🪪 identidad · 🛡️ seguro.
- **Códigos de reserva**: se cargan en la app, se copian con un toque y se muestran en **pantalla completa** con letra grande (para el mostrador o la puerta).
- **Adjuntos offline**: PDFs y capturas (por ejemplo el QR de Visit Japan Web o de una entrada) guardados en el dispositivo. Las imágenes aparecen junto al código en pantalla completa.
- Estado (reservado o pendiente), día asociado, notas y link oficial.
- Documentos **fijados** en la pantalla de inicio.
- Incluidos: pasajes MU746, MU745 y 9C6217, NZeTA de Nueva Zelanda, entrada a China, Visit Japan Web, hoteles, entradas (teamLab, Shibuya Sky, Ciudad Prohibida, jardín de Suzhou), pasaporte y seguro.

## 6. Fotos ✅

- Agregar desde la galería (varias a la vez) o **sacar una foto** con la cámara.
- Cada foto queda asociada a un **día**. Se elige al subirla y se puede cambiar después.
- Se guarda en el dispositivo, reducida a 1800 px, con una miniatura de 360 px. Funciona offline.
- Galería agrupada por día con filtros, vista ampliada, descripción, descarga y borrado.
- Miniaturas del día en la vista de día.

## 7. División de gastos ✅

- Gastos con descripción, monto, **moneda** (USD, CNY, JPY, ARS), quién pagó, categoría y día.
- División **en partes iguales** entre las personas elegidas o con **montos a medida**.
- **Resumen** en la moneda elegida: total gastado y, por persona, cuánto pagó, cuánto le corresponde y su saldo.
- **Para quedar a mano**: transferencias mínimas sugeridas ("A le paga X a B").
- Filtro por día y total del día en la vista de día.
- **Exportar e importar** el archivo de gastos para juntar las cuentas de varios celulares. La unión es por id y gana la edición más reciente; los borrados se respetan.
- Cotizaciones editables en Ajustes.

## 8. Pendientes y reservas ✅

- Lista de reservas y trámites con vencimiento ("en 7 días", "venció", "Ya") y día asociado.
- Se ordenan por urgencia y se marcan como hechos.
- Los próximos aparecen en la pantalla de inicio.

## 9. Transporte, alojamientos y enlaces ✅

- **Transporte**: todos los tramos por día, con medio, servicio, horarios, precio, estado, dónde y cuándo comprar, y link.
- **Alojamientos**: fechas, noches, horarios de check-in y check-out, zona, notas y estado (reservado o por reservar).
- **Enlaces**: transporte por ciudad, trámites y fuentes consultadas. Se marcan con 🌐 porque necesitan internet.

## 10. Offline e instalación ✅

- Se instala como app (manifest con íconos e inicio en pantalla completa).
- Service worker: la app y los datos quedan en caché y los mapas se guardan a medida que se ven o con la precarga.
- Aviso de **sin conexión** en el encabezado y mensajes al perder o recuperar la señal.
- Almacenamiento persistente solicitado al guardar fotos o archivos.

## 11. Ajustes y herramientas ✅

- Elegir la capa de mapa (automática, OSM o AutoNavi).
- Editar cotizaciones.
- **Probar con otra fecha**: simula fecha y hora para revisar la cuenta regresiva, el día de salida o cualquier día del viaje. Tiene atajos a los días con tarjetas.
- Espacio usado, actualizar app y datos, borrar datos locales.

## 12. Multiviaje 🟡

- La app es genérica: el viaje se define en `data/*.json` y `?data=carpeta` carga otro.
- El estado local (fotos, gastos, códigos) se separa por viaje.
- Falta un selector de viajes y una forma simple de crear uno nuevo (ver backlog).

Ver también: [VISION.md](VISION.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [BACKLOG.md](BACKLOG.md)
