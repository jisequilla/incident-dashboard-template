---
name: update-dashboard
description: Apply verified facts about the incident to data/incident.json and the map layers, then verify the render in the browser. Use after /gather-updates or when the user hands over confirmed facts — "actualiza el dashboard", "añade este evento", "update the map/heat map".
---

# Update Dashboard — aplicar hechos verificados

Consume hechos verificados (del parte de `/gather-updates` o dados por el usuario) y los aplica al **Knowledge Bundle** (`knowledge/incident-okf/`); el panel se regenera proyectando. Si un hecho llega sin fuente o sin hora, pedirla o marcarlo como estimación — nunca colarlo como confirmado. Vocabulario y frontmatter: skill `okf-incident-reference`.

## Dónde va cada tipo de hecho (conceptos, no JSON)

| Hecho | Concepto | Notas |
|---|---|---|
| Suceso con hora | `events/<YYYY-MM-DD-slug>.md` (type event) | append-only; corrección = evento nuevo enlazado (patrón "Matiz") |
| Cifra global (ha, víctimas, efectivos) | `state/<metrica>.md` (metric) | actualizar `value` + `timestamp` + fila en la tabla de fluctuación del cuerpo |
| Cambio de situación general | `state/situacion.md` (status-summary) | cuerpo = banner; `pill` = píldora del mapa |
| Evacuación/confinamiento nuevo | `state/zona-<slug>.md` + `geo/marker-<slug>.md` | coordenadas SOLO de Nominatim (`curl nominatim.openstreetmap.org/search?format=json&q=...` con User-Agent) |
| Corte/reapertura de carretera | `state/carretera-<slug>.md` (road-status) | `estado: cortada\|reabierta` (el color lo pone el proyector) |
| Previsión meteo | `state/<ventana>.md` (forecast) | la vieja pasa a `status: superseded` con `supersedes` en la nueva |
| Avance del fuego (aproximado) | `geo/fase-N-<slug>.md` (fire-phase) | `approximate: true`, `confidence: estimacion` |
| Capas satelitales | `data/copernicus/`, `data/firms/` + `layers.json` | `node scripts/fetch-copernicus.mjs` / `fetch-firms.mjs` |
| Página oficial nueva | `directory/<slug>.md` (official-page) | SOLO tras abrirla y confirmar que es de ESTE incidente; añadir el slug al orden en `PRES.pageOrder` del proyector |
| Contradicción entre fuentes | `findings/<slug>.md` (contradiction) | enlazada a los conceptos que chocan |

**Cerrar SIEMPRE con:** `node scripts/gen-index.mjs && node scripts/project-dashboard.mjs`. `data/incident.json` es generado — **jamás editarlo a mano** (ni con el deprecado `update.mjs`). Si el hecho requiere un orden/color/etiqueta nuevos, eso es presentación: bloque `PRES` de `project-dashboard.mjs`.

## Reglas de datos (resumen operativo de CLAUDE.md)

- **`timestamp` < hora actual.** Comprobar la hora real antes de fechar. Impreciso → `time_precision: aproximada|franja` + `time_label`.
- `kind`: `origin` | `escalate` | `fatal` | `""`. Observación propia del usuario → `confidence: observacion`.
- Fuente = URL concreta (tuit individual, artículo), no portada ni perfil — formato `"Nombre <url>"`.
- Nada se borra: lo obsoleto pasa a `status: superseded` (el panel nunca debe implicar que un aviso caducado sigue vigente).

## Verificación (obligatoria, en este orden)

1. `node -e "JSON.parse(require('fs').readFileSync('data/incident.json','utf8'))"` — parsea.
2. Servidor vivo: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8471/index.html` (si no, `python3 -m http.server 8471 &`).
3. Navegador (pestaña del grupo MCP): recargar `index.html` y `map.html`. **Si se tocó HTML: hard reload (`cmd+shift+r`)** — la caché ya nos escondió una capa entera.
4. Comprobar con `javascript_tool`: `updatedStamp` refleja la hora nueva; nº de eventos; si se tocó el mapa, contar `path.leaflet-interactive` y capas (`copernicusLayers.length`, `firmsLayer.getLayers().length`).
5. Screenshot para el usuario si el cambio es visual.

## Al terminar

Resumir: qué se aplicó (con horas y fuentes), qué se descartó y por qué, y qué significa para el usuario (flanco este / A-7 / visto bueno del 112). Si hubo material narrable (error cazado, dato notable), sugerir `/update-blog`.
