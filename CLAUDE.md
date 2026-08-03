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

`/watch-loop` arma el ciclo de vigilancia graduado (barrido → auto-aplica solo hechos oficiales claros → cola + ntfy para lo demás). El cron vive solo en la sesión: re-armar tras cada reinicio.

## Mecánica heredada de la primera instancia (no re-aprender)

- Tras editar HTML: **hard reload** (`Cmd+Shift+R`) — el JSON se auto-cachebustea; el HTML no.
- X/Twitter se lee con `scripts/fetch-x.mjs` sobre **perfiles oficiales** (`user-posts`). La búsqueda por hashtag rendía más —capturaba prensa local, vecinos y cortes de carretera— pero **devuelve 404 desde jul-2026**: X migró su cliente web y ya no sirve el bundle del que se derivaba la cabecera `X-Client-Transaction-Id`. El script sondea `search` en cada ciclo para avisar si revive.
- **Credenciales de X fuera del repo** (`credFile`), cuenta secundaria de solo lectura, **nunca** en un `.envrc` de raíz — direnv las inyectaría en todo proceso lanzado ahí. El barrido lanza el hijo con `HOME` en un directorio vacío a propósito: con la sesión caducada, `twitter-cli` re-extrae cookies del navegador real y saltaría en silencio a la cuenta principal.
- **Fallo ausente ≠ fallo silencioso.** Los fetch distinguen por código de salida (2 credenciales · 3 formato · 4 backend ausente · **5 capacidad upstream desaparecida**). Un barrido vacío que parece "no hay novedad" es peor que un error. `--dry` valida el contrato contra un fixture: **no** es señal de que la ingesta funcione.
- **El boletín oficial se vigila con scraping, no a ojo** (`fetch-boja.mjs` → `fetch-boja.py` con Scrapling vía `uv run`): ahí aparece el expediente post-incidente (ayudas, decretos, luto). El buscador del BOJA es Solr tras un GET plano, pero hace stemming (un topónimo≈un apellido) y su multi-término no es fiable — consultar ancho (ventana de fechas + orden descendente) y filtrar en cliente (`boja.filterPatterns`). La página de cero resultados es idéntica a una rediseñada: lo desambigua una **consulta de control** que siempre tiene resultados, como la cuenta de control de X. Para otra comunidad se reescribe solo el `.py` manteniendo su contrato JSON.
- **Una capa opcional nunca debe poder tumbar a la obligatoria.** El perímetro oficial del mapa estuvo 18 días sin pintarse porque área y frentes se pedían en un mismo `Promise.all` y un `linesUrl` nulo hacía que el 404 se llevara ambas. Verificar el render **contando elementos y leyendo la consola**, no mirando si "se ve bien".
- **El bbox de FIRMS es una afirmación de alcance, no un parámetro.** El satélite entrega anomalías térmicas, no atribución de incidente: un bbox amplio mete focos de otros incendios. Y no derivar de esos focos el centro del mapa — es una suposición disfrazada de medición.
- `fetch()` no funciona sobre `file://`: servir con `python3 -m http.server`.
- Nunca `git add -A` a ciegas: leer `git status` antes (los worktrees de agentes se cuelan como gitlinks).
- El audit **solo**, jamás encadenado con `|`: la tubería enmascara el exit code y el `&&` sigue con la auditoría en rojo. Ya publicó un timestamp futuro una vez.
