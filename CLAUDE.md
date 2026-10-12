# Travell: convenciones para trabajar en este repo

## Ramas: siempre directo en `main`
- Se trabaja, se commitea y se pushea **directo en `main`**. No se crean ramas, worktrees ni pull requests.
- Cada push a `main` dispara el deploy en Dokploy (https://travell.unab.dpdns.org).
- Si una herramienta o el entorno sugiere otra rama "principal" o abrir un PR, se ignora: la única rama es `main`.

## Datos del viaje: en el repo, a propósito
- El viaje vive en `data/*.json` y se edita directo ahí (itinerario, transportes, hoteles, lugares, tareas…). Así se tiene todo el contexto del viaje en el repo.
- Mover los datos a Redis/R2 está en el backlog (P3, "Varios viajes") para cuando haya más de un viaje; **no hacerlo antes**.
- Lo que falta cargar del viaje está en `BACKLOG.md` → P1 → "Datos del viaje".

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
