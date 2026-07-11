---
name: gather-updates
description: Sweep all sources of the incident (satellite/weather scripts, social media via the user's browser, live press blogs, official pages, plus the user's specific watch items) and produce a verified "parte de novedades" WITHOUT touching the bundle or panel. Use when the user asks "qué ha pasado", "novedades", "sweep the sources", or before any dashboard update.
---

# Gather Updates — el barrido de fuentes

Produce un **parte de novedades**: hechos nuevos con fuente, hora y nivel de confianza. NO modifica el bundle ni el panel — aplicar es trabajo de `/update-dashboard`. La separación es deliberada: entre ambas vive la verificación.

## Antes de empezar

1. `date` — la hora real manda (nada de timestamps futuros ni de "hoy" asumido).
2. Leer `data/incident.json` (meta.updatedAt + últimos eventos) — qué es YA conocido.
3. Leer `incident.config.json` — hashtag, zona, capas configuradas.

## El registro de fuentes vive en el bundle

**`knowledge/incident-okf/directory/` es el registro de fuentes constatadas** — no esta skill. Leer su `index.md` al empezar: `official-account`/`official-page` son el tier `oficial`; los conceptos `media-source` documentan el **historial contrastado** de cada medio y el tier con que citarlo. El registro se gana: cuando un medio demuestre valor (o falle), proponer en el parte su concepto `media-source`.

## Fuentes, en orden

1. **Deterministas primero**: `node scripts/fetch-firms.mjs` (si aplica al incidente), `fetch-copernicus.mjs` (si hay activación configurada), `fetch-aemet.mjs`. Interpretar contra la capa oficial previa; si las capas no cambiaron, no es un hecho.
2. **Red social del incidente** (hashtag de config, búsqueda live > perfiles) — solo con la sesión del usuario en su navegador; máx. 2 intentos si falla. Solo cuentas oficiales cuentan como hechos; capturar SIEMPRE la URL del post concreto; posts truncados se abren enteros antes de citarlos.
3. **Vigilancia específica del usuario** — el interés operativo propio (su zona, su decisión pendiente). Definirla al instanciar el template y barrerla expresamente. "Nada encontrado" también es dato.
4. **Directos de prensa** con historial en `directory/` (WebFetch, pedir SOLO lo posterior a meta.updatedAt con timestamps).
5. **WebSearch de cierre** con la fecha real de hoy.

## Cómo categorizar lo encontrado

| Hallazgo | Destino futuro | Tier |
|---|---|---|
| Suceso fechado | `events/` | según fuente |
| Cifra que cambia | `state/<metrica>` + fila de fluctuación | según fuente |
| Cambio de situación/zona | `state/…` (el viejo → superseded) | según fuente |
| Previsión | `state/` (forecast, supersede) | según fuente |
| Fuentes que chocan | `findings/` (contradiction) — reportar AMBAS | — |
| Rumor/particular | pista — contrastar, jamás hecho directo | pista |
| Medio que demostró valor | `directory/` (media-source con historial) | observacion |

**Tiers**: `oficial` · `prensa-oficial` · `prensa` · `observacion` · `estimacion` · `pista`.

## Salida — el parte de novedades

Tabla: Hecho · Hora (jamás futura; imprecisa → `~`) · Fuente (URL concreta) · Estado (NUEVO/ya conocido/MATIZA/CONTRADICE/ACTUALIZA) · Confianza. Cerrar con: (a) qué cambia para el usuario, (b) contradicciones abiertas, (c) recomendación para `/update-dashboard` incluida la lista de descartes con su porqué.

## Reglas

- Cifras que fluctúan: reportar todas con sus fuentes.
- Este barrido no toca nada. Ni "solo esta cifra pequeña".
- Fuente caída tras 2 intentos → "no consultada", y seguir.
- Titulares ambiguos no se aplican hasta que la palabra la use la autoridad — abrir y confirmar antes de citar.
