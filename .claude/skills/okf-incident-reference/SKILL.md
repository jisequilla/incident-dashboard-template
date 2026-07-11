---
name: okf-incident-reference
description: Incident profile of the Open Knowledge Format (OKF) for the incident knowledge bundle. Defines the bundle layout, the six domains, concept types and frontmatter axes (confidence, status, personal), and the projection contract. Use when creating, validating or reading concepts in knowledge/incident-okf/, or when the canonical vocabulary is needed.
---

# okf-incident-reference — perfil `incident` de OKF

OKF (Open Knowledge Format, Google Cloud, v0.1 draft, Apache 2.0) empaqueta conocimiento como un directorio de Markdown con frontmatter YAML: un **concepto = un `.md`**, la ruta sin `.md` es su identidad; `index.md` y `log.md` son reservados. Solo `type` es obligatorio; las claves extra son extensiones que el consumidor preserva. Spec: `github.com/GoogleCloudPlatform/knowledge-catalog` (okf/SPEC.md).

Este perfil especializa OKF para un **incidente en curso**: el bundle es la fuente de verdad; el dashboard (`data/incident.json`) y la crónica (`blog/`) son **proyecciones**.

## Principio rector

**El conocimiento lleva su epistemología en el frontmatter.** Cada concepto declara de dónde sale (`sources`), cuándo (`timestamp`), cuánto fiarse (`confidence`) y si sigue vigente (`status`). Un hecho sin fuente y hora no entra — regla de oro del proyecto hecha schema.

## Layout del bundle

```
knowledge/incident-okf/
├── index.md          # root: frontmatter `profile: incident` + listado de dominios (generado)
├── log.md            # historial append-only del bundle (solo aquí)
├── events/           # cronología — append-only, nunca se reescribe un evento
├── state/            # estado ACTUAL: métricas, zonas, carreteras, meteo — se supersede
├── directory/        # contactos, cuentas y páginas oficiales — cambia despacio
├── geo/              # marcadores, rutas, fases aproximadas, capas satelitales
├── findings/         # contradicciones y pistas sin confirmar — cola de triaje
├── lessons/          # lecciones y decisiones — la cantera de la crónica
├── guides/           # guía de autoprotección — recomendaciones oficiales verificadas
└── research/         # dossieres en profundidad — una pregunta de fondo por concepto
```

Cada dominio lleva su `index.md` (frase de dominio + listado **generado** por `scripts/gen-index.mjs` entre `<!-- okf:index:begin/end -->`). Meta-ficheros con prefijo `_`. Regenerar índices tras cada cambio de conceptos.

## Frontmatter común (todos los conceptos)

| Clave | Oblig. | Valores / formato |
|---|---|---|
| `type` | ✔ | ver vocabulario por dominio |
| `title` | ✔ | corto; alimenta los índices |
| `description` | ✔ | una frase; alimenta los índices |
| `timestamp` | ✔ | ISO 8601 con offset — cuándo ocurrió/rige el hecho. **Nunca futuro** |
| `sources` | ✔* | lista de `"Nombre <url>"` (URL concreta: tuit, artículo, producto). *Excepción: `confidence: observacion` puede ir sin URL |
| `confidence` | ✔ | `oficial` · `prensa-oficial` (prensa citando fuente oficial) · `prensa` · `observacion` (sentidos del autor) · `estimacion` (aproximación propia, p. ej. fases dibujadas) · `pista` |
| `status` |  | `vigente` (default) · `superseded` · `descartado` |
| `supersedes` |  | concept-id al que este sustituye (el viejo pasa a `superseded`, no se borra) |
| `relates_to` |  | lista de concept-ids relativos al root del bundle |
| `personal` |  | `true` si expone la situación del autor (privacidad estructural: la proyección pública puede filtrarlo) |
| `tags` |  | lista YAML |

`time_precision: exacta|aproximada|franja` + `time_label` (opcional) capturan imprecisión honesta ("~15:00", "madrugada") sin inventar minutos.

## Vocabulario de `type` por dominio

| Dominio | Types (seed set — vocabulario abierto) | Notas |
|---|---|---|
| `events/` | `event` | + `kind: origin·escalate·fatal·""` (severidad para proyección). Append-only: una corrección es OTRO evento con `relates_to` (patrón "Matiz"), nunca reescritura |
| `state/` | `metric` · `zone-status` · `road-status` · `forecast` | `metric`: + `value`, `unit`; historia de fluctuación en el cuerpo. `zone-status`: + `zone`, `estado: evacuado·confinado·foco·precaucion·seguro`. `road-status`: + `road`, `estado: cortada·reabierta`. `forecast`: + `window`, `tone: safe·ember` |
| `directory/` | `contact` · `official-account` · `official-page` | `contact`: + `number`, `tel`. Páginas: verificadas antes de entrar (verificar contra ESTE incidente antes de entrar) |
| `geo/` | `marker` · `route` · `fire-phase` · `satellite-layer` | + `lat`/`lng` (SOLO geocodificadas, Nominatim) o `coords`. `fire-phase`: `approximate: true` siempre. `marker`: + `marker_type: origin·affected·evacuated·safe·home·authority·shelter·hotel` (el color lo decide la proyección) |
| `findings/` | `contradiction` · `lead` | + `triage: pending·confirmado·descartado`. Una pista confirmada se PROMUEVE: se crea el concepto real y el finding pasa a `descartado` con `relates_to` |
| `lessons/` | `lesson` · `decision` | + `chapter: N` cuando ya está incorporada a un capítulo de la crónica |
| `guides/` | `guide` | recomendaciones oficiales de autoprotección; SOLO contenido trazable a organismo oficial; proyectadas como sección del panel |
| `research/` | `dossier` | una pregunta de fondo, respuesta primero, afirmaciones con fuente y confianza; producido por la skill `research` |

## Familias que no se mezclan

Un `event` afirma lo ocurrido; una `contradiction` afirma que dos fuentes chocan — **conceptos distintos, enlazados**, nunca un flag sobre el evento (mismo principio que Spec vs Finding en el perfil SLU de referencia). Igual: `state/` dice lo que ES ahora; su historia vive en `events/` y en el cuerpo del concepto, no en reescrituras silenciosas.

## Contrato de proyección (VIGENTE — el flip está hecho)

- `scripts/project-dashboard.mjs`: bundle + `data/layers.json` → `data/incident.json` (**artefacto generado; jamás editarlo a mano**). Determinista; toda decisión de presentación (colores, orden, etiquetas de sección, textos de layout) vive en su bloque `PRES`. Un concepto nuevo en dominios ordenados por config (zonas, marcadores, directorio) requiere añadir su slug al orden en `PRES`. La proyección pública **puede** filtrar `personal: true`.
- `state/situacion.md` (status-summary) es el banner principal + la píldora del mapa (`pill`); `state/*` de type `advisory` son los avisos.
- Tras cambiar conceptos: `node scripts/gen-index.mjs && node scripts/project-dashboard.mjs`.
- La crónica cita concept-ids (`events/2026-07-11-reapertura-a7`) — verificabilidad estructural.
- Consumidor OKF genérico: el bundle es conforme (§9) — solo exigimos `type`; el resto son extensiones.

## Ejemplos

Los conceptos de ejemplo del bundle (marcados "sustituir") son las plantillas canónicas de cada familia.
