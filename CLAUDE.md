# Panel de incidente (instancia de incident-dashboard-template)

Panel ciudadano de seguimiento de un incidente. La información puede influir en decisiones reales: precisión y honestidad ante todo.

## Reglas de oro (invariantes — no se negocian)

1. **El 112 (o la autoridad competente) manda.** El panel es informativo; nunca redactar contenido que suene a instrucción oficial. El disclaimer es permanente.
2. **Nunca inventar cifras ni coordenadas.** Sin confirmación, se mantiene el valor anterior con su timestamp o se marca como estimación. Coordenadas: solo geocodificadas (Nominatim).
3. **Cada hecho lleva fuente y hora** (`sources` con URL concreta, `timestamp`). Distinguir oficial de observación propia (`confidence`).
4. **Prohibidos los timestamps futuros.** Comprobar la hora real (`date`) antes de fechar. Imprecisión honesta → `time_precision`/`time_label`.
5. **Verificar antes de enlazar**: abrir y confirmar que una página/activación/producto corresponde a ESTE incidente.
6. **Contradicciones entre fuentes se muestran** (findings/), no se resuelven en silencio; prevalece la versión más cauta.

## Arquitectura

- `knowledge/incident-okf/` — **única fuente de verdad** (perfil: skill `okf-incident-reference`). Tras cambiar conceptos: `node scripts/gen-index.mjs && node scripts/project-dashboard.mjs`.
- `incident.config.json` — identidad del incidente y órdenes de conceptos (un concepto nuevo en dominio ordenado → añadir su slug aquí).
- `data/incident.json` — **artefacto generado; jamás editarlo a mano.**
- `data/layers.json` — plano-máquina (satélites/meteo; lo escriben los fetch).

## Flujo agéntico

`/gather-updates` (recolectar, sin tocar nada) → revisión → `/update-dashboard` (conceptos + proyección) → `/update-blog` (opcional: crónica) → `/commit` (auditoría + push = publicar). **Todo commit pasa por `/commit`** — `node scripts/audit.mjs` es la puerta, y JAMÁS se ejecuta encadenado a una tubería (enmascara el exit code).

## Mecánica heredada de la primera instancia (no re-aprender)

- Tras editar HTML: **hard reload** (`Cmd+Shift+R`) — el JSON se auto-cachebustea; el HTML no.
- X/Twitter solo se lee con la sesión del usuario en el navegador; la búsqueda live del hashtag rinde más que los perfiles.
- `fetch()` no funciona sobre `file://`: servir con `python3 -m http.server`.
- Nunca `git add -A` a ciegas: leer `git status` antes (los worktrees de agentes se cuelan como gitlinks).
