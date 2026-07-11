# incident-dashboard-template

**De "algo está pasando" a panel público autoactualizado en menos de una hora.** Template para paneles ciudadanos de seguimiento de incidentes (incendios, DANAs, apagones…): conocimiento como sustrato (OKF), dashboard y mapa como proyecciones, ingesta satelital/meteo automática y alertas push.

> ⚠️ Un panel así es informativo y NO sustituye instrucciones oficiales. Ante emergencia real: **112**. Léelo entero antes del día que lo necesites.

## Arquitectura (heredada de un incidente real)

```
incident.config.json   ← LA IDENTIDAD del incidente: nombre, hashtag, bbox, órdenes de conceptos
knowledge/incident-okf/ ← LA FUENTE DE VERDAD: bundle OKF (conceptos con fuente, hora y confianza)
data/incident.json     ← artefacto GENERADO por el proyector — no editar a mano
data/layers.json       ← plano-máquina de capas (satélites/meteo; lo escriben los fetch)
index.html · map.html  ← proyecciones web (leen el JSON, polling 15 min)
scripts/               ← proyector, gen-index, audit, fetch-firms/copernicus/aemet, notify-changes
.github/workflows/     ← deploy (Pages) + cron de ingesta cada ~30 min
.claude/skills/        ← flujo agéntico: gather → update → blog → commit (+ research, perfil OKF)
```

Nacido del panel del incendio de Los Gallardos–Bédar (jul 2026): [vera-wild-fires](https://github.com/jisequilla/vera-wild-fires) es la primera instancia y el ejemplo completo con datos reales. La crónica de aquella experiencia — y sus lecciones — en la carpeta blog de aquel repo.

## Quickstart — día 0 (30–60 min)

1. **Crea el repo** desde este template (GitHub → Use this template) y clónalo.
2. **`incident.config.json`**: nombre, título, hashtag, `panelUrl`, centro/bbox del mapa, `layers.firms.bbox` (la zona), `layers.copernicus.activation` (si la UE activa el EMS para tu incidente — búscalo en mapping.emergency.copernicus.eu y VERIFICA que es el tuyo), `layers.aemet.municipio` (id INE).
3. **Bundle**: sustituye los conceptos de ejemplo (marcados "sustituir") por los reales — `state/situacion` (el banner), tu primera métrica, el primer evento. `node scripts/gen-index.mjs && node scripts/project-dashboard.mjs && node scripts/audit.mjs`.
4. **Prueba local**: `python3 -m http.server 8000` → el panel del ejemplo ya renderiza.
5. **Publica**: `gh repo create ... --public --source . --push` → Settings → Pages → *GitHub Actions*. El primer deploy puede necesitar un re-run si corre antes de activar Pages.
6. **Secrets opcionales** (todo degrada con gracia sin ellos): `AEMET_API_KEY` (gratuita, opendata.aemet.es) y `NTFY_TOPIC` (inventa un topic aleatorio, suscríbete en la app ntfy): `gh secret set …`. Local: `.env` (gitignored; ver `.env.example`).
7. Si el incidente NO es un incendio forestal: sustituye los 5 conceptos de `guides/` por las recomendaciones oficiales de tu tipo de incidente (misma disciplina: solo fuentes oficiales abiertas y verificadas).

## El flujo diario

`/gather-updates` (barrido de fuentes → parte de novedades, no toca nada) → revisión humana → `/update-dashboard` (hechos como conceptos + proyección) → `/commit` (auditoría + push = publicar). El cron mantiene solo las capas de datos; **automatiza los datos, nunca el juicio**.

## Reglas de oro (en CLAUDE.md, no negociables)

El 112 manda · nada sin fuente y hora · timestamps jamás futuros · verificar antes de enlazar · las contradicciones se muestran · lo obsoleto se supersede, no se borra.
