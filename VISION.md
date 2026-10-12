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

## Principios

1. **Offline primero.** Lo que importa durante el viaje tiene que andar sin conexión. Internet suma (links, mapas nuevos), pero no es requisito.
2. **Sin backend.** Archivos estáticos que se publican en cualquier hosting. No hay cuentas, servidores ni bases de datos que mantener.
3. **Los datos del viaje son JSON legibles.** Se editan a mano o se generan desde una planilla. La app no esconde el plan en un formato propio.
4. **Todo está anclado a días.** Actividades, transportes, hospedajes, documentos, fotos y gastos se relacionan con un día del viaje. El día es la unidad de navegación.
5. **Contexto según el momento.** La pantalla de inicio cambia antes, durante y después del viaje: cuenta regresiva, día de salida, llegada a una ciudad, lo que sigue hoy.
6. **Privacidad por defecto.** Fotos, códigos y gastos quedan en el dispositivo. Para compartirlos, el usuario exporta un archivo de forma explícita.
7. **Funciona en el mundo real.** Celular con una mano, poca batería, mala señal, servicios bloqueados según el país.
8. **Simple de mantener.** JavaScript sin framework ni build, dependencias vendorizadas (Leaflet) y código que se lee de corrido.

## Para quién es

- **Quien viaja con un plan armado** y quiere tenerlo a mano y en contexto, sin depender de la señal.
- **Grupos chicos** (pareja, amigos, familia) que comparten gastos.
- **Quien quiere reutilizarla** para otro viaje: alcanza con escribir nuevos JSON.

## Qué no es

- No es un buscador ni una agencia: no reserva vuelos ni hoteles.
- No es una red social ni una nube de fotos.
- No es un planificador colaborativo en tiempo real (no hay servidor que sincronice).

## Hacia dónde va

A corto plazo: completar lo que falta para usarla de punta a punta en este viaje (códigos, hoteles, mapas offline, respaldo de datos). A mediano plazo: que armar un viaje nuevo sea fácil (importar desde planilla, selector de viajes, validación de datos) y sumar funciones opcionales con internet (clima, cotizaciones, sincronización simple). Ver [BACKLOG.md](BACKLOG.md).

Documentos relacionados: [ARCHITECTURE.md](ARCHITECTURE.md) · [FEATURES.md](FEATURES.md) · [BACKLOG.md](BACKLOG.md)
