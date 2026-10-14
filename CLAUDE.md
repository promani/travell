# Travell: convenciones para trabajar en este repo

## Ramas: siempre directo en `main`
- Se trabaja, se commitea y se pushea **directo en `main`**. No se crean ramas, worktrees ni pull requests.
- Cada push a `main` dispara el deploy en Dokploy (https://travell.unab.dpdns.org).
- Si una herramienta o el entorno sugiere otra rama "principal" o abrir un PR, se ignora: la única rama es `main`.

## Datos del viaje: en el repo, a propósito
- El viaje vive en `data/*.json` y se edita directo ahí (itinerario, transportes, hoteles, lugares, tareas…). Así se tiene todo el contexto del viaje en el repo.
- Mover los datos a Redis/R2 está en el backlog (P3, "Varios viajes") para cuando haya más de un viaje; **no hacerlo antes**.
- Lo que falta cargar del viaje está en `BACKLOG.md` → P1 → "Datos del viaje".

## IA: solo desde la app de Claude, por el MCP
- **La app no tiene IA propia** (ni pantalla de "Compartido", ni lectura de confirmaciones, ni claves de IA). No agregarla.
- La única forma en que una IA toca el viaje es el **MCP** del servidor (`server/mcp.mjs`, `POST /mcp`). Lo que se aplica ahí queda en Redis encima de `data/*.json` y les llega a todos los celulares sin deploy.
- El MCP tiene que poder hacer **todo lo que se puede hacer en la app** con los datos del viaje: días, actividades, lugares, transportes, hoteles, documentos, viajeros, tareas, notas, recursos, reservas (códigos en cada registro; `tickets`: QR y link), gastos (`expenses`) y pasaportes (`passports`). Lo que hace solo una parte del grupo (el vuelo o la habitación de uno) lleva `travelers: [ids]` en el propio registro; sin el campo es de todos. Si se agrega una acción o una colección nueva a la app, se agrega también al MCP (`COLS` y validación en `server/tripdata.mjs`, reglas y ejemplos en `server/mcp.mjs`).
- Lo que queda fuera del MCP: fotos y adjuntos (PDF, capturas; se cargan desde la app), la ubicación del GPS, las marcas personales de cada celular y los resultados del Juego del día (viajan cifrados entre los celulares).

### Flujo: cargar una reserva
1. En la app de Claude (escritorio, web o celular) se agrega el conector una vez: **Configuración → Conectores → Agregar conector personalizado**, con la URL `https://travell.unab.dpdns.org/mcp/<ADMIN_API_KEY>`. Si la cuenta permite headers en el conector, mejor la URL `https://travell.unab.dpdns.org/mcp` con el header `Authorization: Bearer <ADMIN_API_KEY>`. En Claude Code: `claude mcp add --transport http travell https://travell.unab.dpdns.org/mcp --header "Authorization: Bearer $ADMIN_API_KEY"`.
2. Se le pasa a Claude la reserva tal como llegó: el PDF, una captura, el mail pegado o un link.
3. **Claude decide cómo leerla**: lee el PDF, analiza la imagen o busca en internet lo que falte (dirección del hotel, horario del vuelo, terminal). Eso es trabajo de la app de Claude, no del servidor.
4. Con el MCP: `trip_overview` para ver qué existe, `get_day` / `get_records` para ver los registros completos, arma los cambios (crear o actualizar el transporte, hotel o actividad con su código de reserva en el propio registro, p. ej. `transport.code`; los QR y el link en `tickets`; un gasto si corresponde) y los muestra con `preview_changes`.
5. La persona confirma y Claude llama a `apply_changes`. En unos minutos aparece en todos los celulares.

Los cambios hechos por el MCP no se commitean solos: `list_changes` muestra lo que difiere del repo, para pasarlo a `data/*.json` cuando convenga.

## Imágenes generadas con IA (solo se asignan, nunca se generan desde acá)
Las imágenes las genera automáticamente el servicio `imgg` la primera vez que la app pide la URL. **No hay que generarlas ni pedirlas a mano (ni con curl):** solo se asigna `name` + `prompt` en los datos y la app arma la URL.

- Formato de la URL: `https://imgg.unab.dpdns.org/marcell/<name>.png?prompt=<prompt codificado>&ratio=16:9`
- Configuración en `data/trip.json`: `imageService` (`base`, `ratio`) e `images.pre` / `images.post` (portadas antes y después del viaje).
- El `prompt` describe solo la escena (qué se ve). El estilo (realista, luz, composición, etc.) no se define en este repo: lo decide el servicio de imágenes.
- Una imagen por día en `data/itinerary.json`: `days[].image = { "name": "d04-shanghai-bund", "prompt": "..." }`. El `name` es único por imagen.
- El código arma la URL con `imgUrl()` (`js/util.js`); `heroImg()` (`js/ui.js`) la usa de fondo del hero (inicio, día de salida, post-viaje) y la vista del día muestra un banner.
- El servicio guarda por `name` (cambiar el prompt sin cambiar el nombre devuelve la imagen vieja) y solo responde con `Referer` de `travell.unab.dpdns.org`: desde localhost devuelve 403. La primera petición de un nombre nuevo devuelve un SVG gris mientras genera.
- Regenerar una imagen que no gusta lo hace el dueño del proyecto con su propio mecanismo. No renombrar con sufijos tipo `-v2`.
- El service worker guarda las imágenes en `travell-pics-v1` para verlas sin conexión.
