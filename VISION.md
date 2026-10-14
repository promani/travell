# Visión

## Propósito

Travell es un **compañero de viaje que vive en el celular y funciona sin internet**. Junta en un solo lugar lo que un viajero necesita consultar durante el viaje: qué hay que hacer hoy, cómo llegar, dónde se duerme, los códigos y documentos, las fotos y quién pagó qué.

Nació para un viaje concreto (China y Japón, noviembre–diciembre 2026), planificado en una planilla de Excel. La idea es que **sirva para cualquier viaje**: la app es genérica y el viaje se describe con archivos JSON.

## Problemas que resuelve

| Problema | Respuesta de Travell |
|---|---|
| El plan está repartido entre un Excel, mails, PDFs y capturas | Un único lugar con todo, ordenado por día |
| En el avión, el subte o un país sin roaming no hay datos | Todo se guarda en el dispositivo y funciona offline |
| En China no funcionan Google Maps ni otros servicios de Google | Mapas con Leaflet y tiles de AutoNavi (Gaode) en China continental |
| En la llegada a un lugar nuevo no sabés cómo ir al hotel | Tarjeta de llegada con opciones de transporte, mapa y links útiles |
| En el aeropuerto hay que encontrar rápido el código de reserva o el QR | Códigos en pantalla completa y adjuntos guardados offline |
| Las cuentas compartidas se desordenan | División de gastos en varias monedas con "quién le paga a quién" |
| Los preparativos se olvidan (una noche sin hotel, la vacuna de la fiebre amarilla) | Sugerencias automáticas de "te falta…" y tareas asignables a cada viajero |
| En una ciudad desconocida el grupo se dispersa | Cada uno puede compartir su ubicación (opcional, cifrada) y ver dónde están los demás |
| Hay muchas esperas (vuelos de 12 horas, trenes, filas) y el grupo no tiene un momento en común | **Juego del día**: cuatro rompecabezas cortos (Tango, Zip, Queens y Patches), los mismos para todos cada día, con ranking del día y récords del viaje. Sin internet, sin cuentas, sin publicidad. Para jugar solo: **Mate** y **Entrenar** |
| El plan cambia durante el viaje | Alta, baja y modificación de lugares, hoteles, actividades y tareas desde el celular, con la ubicación tomada del GPS o del mapa |

## Principios

1. **Offline primero.** Lo que importa durante el viaje tiene que andar sin conexión. Internet suma (links, mapas nuevos), pero no es requisito.
2. **Backend mínimo.** Un solo servidor chico (`server/relay.mjs`, Node sin dependencias), sin cuentas de usuario. Sirve la app, sincroniza entre viajeros lo que hace falta compartir (tareas asignadas, ubicación, resultados de los juegos), sube fotos y adjuntos a R2 y baja el clima. La app no depende de él para funcionar: sin conexión todo sigue andando y lo pendiente (sincronización, subidas) se manda al volver la conexión.
3. **Los datos del viaje son JSON legibles.** Se editan a mano o se generan desde una planilla. La app no esconde el plan en un formato propio.
4. **Todo está anclado a días.** Actividades, transportes, hospedajes, documentos, fotos y gastos se relacionan con un día del viaje. El día es la unidad de navegación.
5. **Contexto según el momento.** La pantalla de inicio cambia antes, durante y después del viaje: cuenta regresiva, día de salida, llegada a una ciudad, lo que sigue hoy.
6. **Privacidad donde importa, no en todo.** La ubicación se comparte solo si cada uno la activa. Las fotos y los adjuntos se respaldan en la nube (R2), sin cifrar.
   El cifrado entre celulares se va a limitar a lo que a un agente le da igual: la ubicación del GPS, las marcas personales de cada celular y los resultados del Juego del día. Lo que es el viaje en sí (actividades, lugares, tareas, gastos, recursos) tiene que poder verlo y cambiarlo un agente por el MCP, igual que en la app. Por ahora el cifrado sigue como está, y no se suma a nada nuevo que sea parte del viaje.
7. **Juegos como ritual, no como producto.** Un rato por día, el mismo desafío para todo el grupo, y la charla de quién lo hizo más rápido. Los juegos tienen que:
   - resolverse con lógica, sin adivinar, y tener una sola solución cuando el juego lo pide;
   - generarse en el celular a partir de la fecha, así funcionan sin internet;
   - arrancar con **Iniciar**: el tablero está tapado y hay una cuenta regresiva de 4 segundos, para que el tiempo sea parejo para todos;
   - festejar cuando se resuelven.

   Los tiempos de los demás se ven recién cuando lo resolviste. No hay notificaciones que insistan: la tarjeta de Inicio avisa quién falta y nada más.
8. **Funciona en el mundo real.** Celular con una mano, poca batería, mala señal, servicios bloqueados según el país.
9. **Simple de mantener.** JavaScript sin framework ni build, dependencias vendorizadas (Leaflet) y código que se lee de corrido.

## Para quién es

- **Quien viaja con un plan armado** y quiere tenerlo a mano y en contexto, sin depender de la señal.
- **Grupos chicos** (pareja, amigos, familia) que comparten gastos.
- **Quien quiere reutilizarla** para otro viaje: alcanza con escribir nuevos JSON.

## Qué no es

- No es un buscador ni una agencia: no reserva vuelos ni hoteles.
- No es una red social ni una nube de fotos.
- No es un editor colaborativo en tiempo real: la sincronización es simple (gana la última edición) y opcional.
- No es una app de juegos: los juegos son un rato del día del viaje, no un fin en sí mismos. No hay tienda, puntos para gastar ni competencia fuera del grupo.
- No es un rastreador: la ubicación se comparte solo si cada uno lo activa, y solo con la app abierta.

## Hacia dónde va

A corto plazo: completar lo que falta para usarla de punta a punta en este viaje (códigos, hoteles, mapas offline, respaldo de datos). A mediano plazo: que armar un viaje nuevo sea fácil (importar desde planilla, selector de viajes, validación de datos) y sumar funciones opcionales con internet (cotizaciones). Achicar el cifrado a lo que a un agente le da igual, para que el MCP vea el viaje completo (también lo que se edita desde los celulares). Ver [BACKLOG.md](BACKLOG.md).

Documentos relacionados: [ARCHITECTURE.md](ARCHITECTURE.md) · [FEATURES.md](FEATURES.md) · [BACKLOG.md](BACKLOG.md)
