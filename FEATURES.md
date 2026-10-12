# Funcionalidades

Estado: ✅ implementado · 🟡 parcial (ver [BACKLOG.md](BACKLOG.md))

La navegación principal es una barra inferior con **Inicio · Día · Mapa · Gastos · Más**. Tareas y Fotos están en Más (y se llega desde el inicio y desde cada día); la lista editable de Lugares, desde el Mapa.

---

## 1. Inicio contextual ✅

La pantalla de inicio cambia según el momento del viaje.

| Momento | Qué muestra |
|---|---|
| **Antes del viaje** | "Faltan **N** días para tu viaje", fechas y día de salida. Accesos a **Pasajes y QR** y **Visas y documentos**. Documentos clave fijados. Próximos pendientes con su vencimiento. |
| **Día de salida** | "**Hoy es el día del viaje**" con hora de salir de casa, hora de estar en el aeropuerto (despegue menos la anticipación configurada), hora de despegue y vuelo. Cuenta regresiva en vivo y checklist "Antes de salir". |
| **Durante el viaje** | "Día N de M · ciudad", título, resumen y dónde se duerme. Tarjetas del día (llegada, salida). La actividad **actual** y la **siguiente**. Alertas del día. |
| **Después del viaje** | "¡Volviste!" con accesos a fotos y gastos. |

En todos los casos hay:

- un **mapa con puntos de interés cercanos** y los **otros viajeros**, con una lista ordenada por distancia;
- **Mis tareas** (asignadas a mí o sin asignar) y **💡 Te falta…** (sugerencias automáticas);
- al principio, el pedido de **permiso de ubicación** y la pregunta **"¿Quién usa este celular?"**.

## 2. Agenda de viaje ✅

- **Itinerario** (Más → Itinerario): lista de días con fecha, ciudad y resumen. El día actual aparece resaltado.
- **Exportar al calendario** (Itinerario): un `.ics` con las actividades con horario, las noches de hotel, la hora de salir al aeropuerto (con aviso 30 min antes) y mis tareas con vencimiento. Horarios en UTC y UID estables: reimportarlo actualiza los eventos.
- **Zonas horarias**: cada ciudad tiene su `tz` (IANA) en `trip.json` y un día puede fijar la suya. Los horarios del JSON son siempre la hora local del lugar, no la del celular. Los días de viaje empiezan en la zona de donde salís y, después del vuelo del día, pasan a la de destino; el día de vuelta termina a la medianoche de casa. La vista de día avisa en qué hora están los horarios cuando no coincide con la del celular.
- **Vista de día** (`#/dia/dNN`):
  - Tira de días deslizable y flechas de anterior/siguiente.
  - Título, fecha, ciudad, resumen y dónde se duerme.
  - **Actividades del día** con horario, categoría, prioridad (⭐ imperdible / opcional) y si necesita reserva. Al tocar una se ve el detalle, la zona, cómo llegar, el costo, el estado, el link y "Ver en el mapa".
  - **＋ Actividad** y **✏️ Editar** en cada actividad (ver ABM).
  - Marcar actividades como **hechas**. Resaltado de **Ahora** y **Sigue** cuando el día es hoy.
  - Filtro **Solo imperdibles**.
  - **Logística**: transportes del día, check-in y check-out.
  - Aviso **"No hay hospedaje cargado para esta noche"** con botón para cargarlo.
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
- **👥 Viajeros** en el mapa: un círculo con las iniciales y el color de cada uno, y cuándo se actualizó.
- **＋ Lugar acá**: crea un lugar en tu ubicación GPS o en el centro del mapa.
- **Lugares en JSON extensibles**: `places.json` es el archivo inicial, con coordenadas. `trip.json → placeFiles` lista más archivos que lo extienden (incluido `places-extra.json` con 15 lugares más). En total hay 105 lugares cargados.

## 5. Documentos y comprobantes ✅

- **Documentos** (`#/docs`) solo tiene lo que no está modelado en otro lado: visas y trámites (NZeTA, entrada a China, Visit Japan Web) y seguro.
- Los **pasajes** están en cada transporte (Más → Transporte y la logística del día), las **entradas** en su actividad (con reserva), las **reservas de hotel** en su alojamiento y el **pasaporte** en cada viajero.
- Cada uno tiene un **comprobante**: código de reserva (se copia y se muestra en **pantalla completa**), **QR escaneados con la cámara** del celular o desde una captura (se vuelven a dibujar en grande, en blanco y negro, para mostrar en la puerta de embarque o el molinete; los códigos Aztec/PDF417 se guardan como foto), **link a la reserva** y PDFs/capturas adjuntos. Todo se ve sin internet.
- Los QR se pueden marcar por viajero ("Yo", "Viajero 2"). El código y los QR se sincronizan con el grupo; los adjuntos se suben a R2.
- Al actualizar, los códigos y adjuntos que estaban en los documentos viejos se mueven solos a su pasaje, entrada, hotel o pasaporte.

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
- Se comparten por la **sincronización del grupo** o con **exportar e importar** el archivo. La unión es por id y gana la edición más reciente; los borrados se respetan.
- Cotizaciones editables en Ajustes.

## 8. Módulo de tareas ✅

- Tareas con título, notas, **asignada a** (cualquier viajero o "sin asignar"), vencimiento (fecha y hora), día del viaje, prioridad (normal o 🔥 alta) y estado.
- **Alta, baja y modificación** desde la app. Las del Excel (`tasks.json`) también se editan.
- Filtros: **Mías** (asignadas a mí o sin asignar) · Todas · Sin asignar · por viajero · Hechas.
- Cada tarea muestra a quién está asignada (iniciales y color), quién la creó, el vencimiento ("en 7 días", "venció…") y el día.
- **Asignar a otro viajero**: con la sincronización activa, la tarea aparece en su celular con un aviso ("Yo te asignó: …"), y una notificación si dio permiso. Sin sincronización, se comparte por archivo.
- En el inicio, **Mis tareas** y cuántas hay asignadas a otros.

## 9. Sugerencias: "te falta…" ✅

La app revisa los datos del viaje y propone lo que parece pendiente:

| Regla | Ejemplo |
|---|---|
| Noche sin ningún hospedaje cargado | "Falta hospedaje la noche del 25 nov en Osaka" → botón **Cargar hospedaje** con fechas y ciudad completas |
| Hospedaje "por reservar" | "Reservar hospedaje en Osaka (25 nov, 1 noche)" |
| Tarea marcada como hecha pero el hospedaje sigue pendiente | "Completá los datos del hospedaje en Osaka" |
| Transporte sin comprar | "Comprar: Shinjuku → Hakone-Yumoto (Odakyu Romancecar)" |
| Actividad que necesita reserva | "Reservar: teamLab Borderless" |
| Documento pendiente o pasaje sin código | "Cargá el código de reserva: Pasaje MU746" |
| **Preparativos** de `requirements.json`, filtrados por los países del viaje | "Certificado internacional de vacunación contra la fiebre amarilla", pasaporte, seguro, tarjetas, eSIM, efectivo en yenes, adaptador |

- Cada sugerencia tiene: **＋ Tarea** (la convierte en tarea asignable), la acción directa (cargar hospedaje, ir a documentos), **✓ Ya está** y **No aplica**. Las descartadas se pueden restaurar.
- No repite lo que ya es una tarea: cada tarea declara qué cubre (`covers`).

## 10. ABM desde la app ✅

Alta, baja y modificación sin tocar los JSON. Lo cargado se guarda en el celular encima de los archivos y se puede sincronizar o exportar.

| Qué | Dónde | Ubicación |
|---|---|---|
| **Lugares** | Más → Lugares, ficha del lugar, "＋ Lugar acá" en el mapa | Obligatoria |
| **Alojamientos** | Más → Alojamientos, tarjeta de llegada, vista de día, sugerencias | Opcional |
| **Actividades** | Vista de día (＋ Actividad / ✏️ Editar), ficha de lugar ("Agregar al itinerario") | Vía el lugar |
| **Tareas** | Tareas, inicio, sugerencias | — |
| **Viajeros** | Viajeros | — |

**Cómo se elige la ubicación**:

- **Deducida del GPS**: si estás en la ciudad del lugar, el formulario arranca con tu posición.
- **📍 Usar mi ubicación**: pide el permiso si hace falta y muestra la precisión.
- **Tocar el mapa o arrastrar el marcador**. En China se corrige el desfasaje de los mapas chinos (GCJ-02) para guardar coordenadas GPS estándar.
- **Escribir o pegar** "lat, lon".
- La ciudad se completa sola según el punto elegido.

**Lugares, además**: búsqueda y filtros por ciudad y categoría; **importar** un JSON con una lista de lugares; **exportar** los cargados en la app en el formato de `places.json` para sumarlos al repo; agregar el lugar nuevo directamente al itinerario de un día y a una hora.

## 11. Viajeros y ubicación del grupo ✅

- **¿Quién usa este celular?**: define "mis tareas" y de quién es la ubicación que se comparte.
- **Permiso de ubicación**: la app lo pide con una explicación (banner en el inicio y en Viajeros). Si está bloqueado, explica cómo habilitarlo.
- **Compartir mi ubicación** (opcional y desactivado por defecto): se actualiza cada ~2 minutos, o al moverse más de 50 m, mientras la app está abierta.
- **Dónde está cada uno**: mapa y lista con "hace X min" y la distancia a vos. Los datos viejos se ven atenuados.
- **Sin servidor**: "Mandar mi ubicación por link" (WhatsApp, etc.). Al abrir el link en otro celular con la app, esa ubicación queda registrada y se muestra en el mapa.
- ABM de viajeros con nombre y color.

## 12. Sincronización con el grupo (opcional) ✅

- Un **relay mínimo** incluido (`server/relay.mjs`: Node, sin dependencias, un archivo) sincroniza tareas, lugares, alojamientos, actividades, viajeros, gastos, ubicaciones y sugerencias descartadas.
- **Cifrado de punta a punta**: AES-GCM con una clave derivada del código del grupo. El servidor solo guarda texto cifrado y no conoce el código.
- Cada 60 s, al volver a la app, al recuperar la conexión y unos segundos después de cada cambio. Si dos personas editan lo mismo, gana la última edición.
- **Sin relay**: exportar e importar un archivo con todos los datos cargados en la app.

## 13. Transporte y alojamientos ✅

- **Transporte**: todos los tramos por día, con medio, servicio, horarios, precio, estado, dónde y cuándo comprar, y link.
- **Alojamientos**: fechas, noches, horarios, zona, dirección (también en idioma local, con "Mostrar al taxista"), número de reserva, notas y estado. Se pueden agregar, editar y borrar.
- Los enlaces (transporte por ciudad, trámites y fuentes consultadas) ahora son **Recursos** (ver 18).

## 14. Offline e instalación ✅

- Se instala como app (manifest con íconos e inicio en pantalla completa).
- Service worker: la app y los datos quedan en caché y los mapas se guardan a medida que se ven o con la precarga.
- Aviso de **sin conexión** en el encabezado y mensajes al perder o recuperar la señal.
- Almacenamiento persistente solicitado al guardar fotos o archivos.

## 15. Buscador ✅

- 🔎 en el encabezado. Busca en todo el viaje: días, actividades, lugares (también por nombre en idioma local), tareas, documentos (también por código), alojamientos, transporte, alertas, sugerencias y preparativos.
- Ignora tildes y mayúsculas. Varias palabras se combinan (por ejemplo "kioto templo"). Los resultados se agrupan por tipo y llevan a la pantalla correspondiente.

## 16. Ajustes y herramientas ✅

- Elegir la capa de mapa (automática, OSM o AutoNavi).
- Editar cotizaciones.
- **Simulador de día** 🧪: en Ajustes, para ver toda la app como si fuera cualquier día y hora del viaje, antes de salir o después de volver. Una barra naranja avisa que se está simulando y permite pasar al día anterior/siguiente, cambiar o salir. Usa la hora local de donde vas a estar ese día. Es solo de este celular y no toca los datos.
- **Mapas offline por ciudad**: descargar los tiles de cada ciudad (o de todas) con progreso y fecha de la última descarga.
- **Respaldo completo**: exporta e importa todo lo que hay en el celular (fotos, adjuntos, códigos, tareas, lugares, gastos, marcas, checklists). Sirve para cambiar de celular. Al importar, se suma a lo que ya hay.
- **Cambios sobre el JSON**: lista de registros del itinerario original editados o borrados en la app, con "Restaurar".
- **Aviso de nueva versión** cuando se publica una actualización.
- Espacio usado, actualizar app y datos, borrar datos locales.

## 17. Pasaportes ✅

- Son un dato de cada viajero: están en **Más → Viajeros** (`#/pasaportes` redirige ahí). Número, nombre completo, nacionalidad, nacimiento, emisión y vencimiento, más fotos o escaneos del pasaporte.
- Aviso si vence antes de terminar el viaje o a menos de 6 meses del regreso, y sugerencia “Cargá el pasaporte de…” mientras falte.
- Modo pantalla completa con el número en grande para mostrar en migraciones.
- Los datos se sincronizan cifrados con el grupo (si está configurado); las fotos se suben a R2.

## 18. Recursos ✅

- **Recursos** (Más → Recursos): enlaces, mapas del metro, guías, apps y trámites por ciudad, con enlace y/o imágenes y PDFs adjuntos que se ven sin internet. Vienen cargados los metros de Shanghai, Tokio y Pekín (enlace oficial: adjuntá una captura del mapa) y Visit Japan Web. Reemplaza a la vieja sección Enlaces (`#/enlaces` redirige acá). Las **fuentes consultadas** quedan plegadas al final. El día muestra los recursos de su ciudad.

## 19. Cheat sheet ✅
- **Más → Cheat sheet** (`#/cheatsheet`; `#/frases` redirige): **phrases** para decir gracias, por favor, la cuenta, sin picante, ¿cuánto cuesta?, a esta dirección (taxi), emergencias, etc., en **mandarín** (hanzi + pinyin) y **japonés** (kana/kanji + romaji). Elige sola el idioma de la ciudad del día.
- **Kanji / hanzi útiles**: los que aparecen en carteles (entrada, salida, baño, empujar/tirar, abierto, prohibido fumar), estaciones (andén, molinetes, asiento reservado), menús (cerdo, pollo, picante) y servicios (efectivo, farmacia, onsen). En chino, con caracteres simplificados.
- Tocar una frase la muestra en grande para mostrársela a alguien; 🔊 la lee con la voz del celular. Incluye los números de emergencia de cada país. También aparecen en el buscador.
- Se agregan, editan y borran desde la app; en cada día aparecen los de su ciudad.

## 20. Compartir a la app: confirmaciones ✅

- **Android** (con la app instalada): Travell aparece en el menú *Compartir* de Gmail, el visor de PDF, la galería, etc. Recibe texto, link y archivos (PDF, capturas, `.eml`). El service worker los guarda en una bandeja (`travell-inbox`) y abre **Más → Compartido** (`#/compartido`).
- **iPhone o compu** (Safari no soporta recibir lo compartido): en la misma pantalla se pega el texto del mail, un link o se eligen archivos. También desde Documentos → "Cargar desde una confirmación".
- Por cada cosa recibida la app **sugiere** el código de reserva (por ejemplo después de "código de reserva", "localizador", "PNR") y a qué pasaje, hotel, entrada o documento corresponde (vuelo, nombre del hotel). Todo se revisa antes de guardar.
- Al guardar: el código y el link van a la reserva elegida (en hoteles, a `confirmation` y al link de la reserva), los archivos quedan adjuntos (offline y subidos a la nube). También puede ir a un **recurso nuevo**.
- Hoy la lectura es por reglas simples; el paso siguiente es leer la confirmación con IA (ver backlog).

## 19. Multiviaje 🟡

- La app es genérica: el viaje se define en `data/*.json` y `?data=carpeta` carga otro.
- El estado local (fotos, gastos, códigos) se separa por viaje.
- Falta un selector de viajes y una forma simple de crear uno nuevo (ver backlog).

Ver también: [VISION.md](VISION.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [BACKLOG.md](BACKLOG.md)
