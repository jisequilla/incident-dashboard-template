---
name: watch-loop
description: Arm the recurring graduated watch loop of the incident (full gather sweep → auto-apply only clear official facts → queue+ntfy everything ambiguous). Use when the user asks to "start the loop", "re-arm the watch", "activa el ciclo", after a session restart or a computer reboot. Accepts an optional interval argument ("2h", "3h").
---

# Watch Loop — el ciclo de vigilancia graduado

Arma el ciclo automático **recolectar → aplicar (solo tier claro) → avisar**. El cron vive SOLO en la sesión de Claude Code (muere al cerrarla o reiniciar la máquina; caduca a los 7 días) — por eso existe esta skill: re-armarlo idéntico con una orden.

## Diseño (la salvaguarda del proyecto, en modo graduado)

La separación gather/apply existe porque entre ambas vive la verificación. El loop no la elimina — la gradúa:

- **Auto-aplica** SOLO: hechos `confidence: oficial` con URL concreta a la publicación original, sin contradicción con el estado vigente y sin vocabulario ambiguo. Cifras y eventos fechados califican.
- **NUNCA auto-aplica**: cambios de estado semántico (`state/situacion`, zonas, vías), titulares ambiguos («estabilizado», «controlado», «resuelto» sin declaración formal de la autoridad), contradicciones. Eso se presenta en sesión + ping ntfy.
- **Las señales que cambian decisiones del usuario (retorno, cese de alerta, orden nueva de la autoridad) son SIEMPRE ping, jamás apply silencioso.**

## Procedimiento

1. **Pre-checks**: `date` (la hora real manda) · `CronList` — si ya hay un ciclo armado con este prompt, avisar y no duplicar · confirmar que `.env` existe (NTFY_TOPIC para los pings) · leer `incident.config.json` (hashtag, capas).
2. **Armar el cron** con `CronCreate`: por defecto `23 * * * *` (cada hora, minuto :23 — off-peak deliberado). Con intervalo del usuario: "2h" → `23 */2 * * *`, "3h" → `23 */3 * * *`. El prompt del job es el bloque canónico de abajo, adaptado con los valores del config (ruta del repo, hashtagUrl, términos de vigilancia del usuario).
3. **Primer ciclo inmediato**: ejecutar el bloque canónico una vez a mano — valida navegador, capas y la puerta antes de dejar volar al cron.
4. **Informar**: armado + constraints (sesión viva, máquina despierta, 7 días) + hora del próximo disparo.

## Prompt canónico del job (plantilla — sustituir <...> con el config)

```
Ciclo del panel del incidente (loop graduado acordado con el usuario). Ejecutar en <ruta absoluta del repo>:

1. `date` primero — la hora real manda (jamás timestamps futuros).
2. Barrido /gather-updates COMPLETO: (a) capas: node scripts/fetch-firms.mjs && node scripts/fetch-copernicus.mjs && node scripts/fetch-aemet.mjs (las que el config tenga activas); (b) red social con la sesión del navegador del usuario: búsqueda live <hashtagUrl> (si sale esqueleto vacío, 2 intentos y saltar); (c) live blogs de prensa del registro directory/ vía WebFetch; (d) WebSearch de cierre "<nombre del incidente> última hora" con la fecha real; (e) vigilancia expresa de los términos del usuario: <zona propia / señales que cambian sus decisiones>.
3. APLICAR SOLO el tier claro: hechos confidence=oficial con URL concreta a la publicación original, sin contradicción con el estado actual y sin vocabulario ambiguo (palabras de cierre — "estabilizado", "controlado", "resuelto" — solo si la autoridad lo declara formalmente). Cifras (state/ métricas) y eventos fechados SÍ califican; cambios de estado semántico (zonas, vías, state/situacion) NO se auto-aplican — se quedan en cola para el usuario.
4. Si se aplicó algo: node scripts/gen-index.mjs && node scripts/project-dashboard.mjs, luego node scripts/audit.mjs SOLO en su propia invocación (JAMÁS encadenado con | ni &&) — solo con audit verde: git add explícito de los paths tocados (nunca -A), commit y push. Si el push es rechazado (el cron de Actions empujó antes): git pull --rebase y OJO — en rebase, --ours es el REMOTO; tras resolver, re-proyectar y re-auditar antes de push.
5. TODO lo demás (contradicciones, titulares ambiguos, señales de decisión del usuario) → presentar el parte en la sesión Y enviar ntfy push: source .env y curl -H "Title: Parte <shortTitle>" -H "Priority: high" -d "<resumen 1-2 líneas>" https://ntfy.sh/$NTFY_TOPIC.
6. Si el barrido viene vacío este ciclo y el anterior también, decirlo en una línea y proponer al usuario espaciar el ciclo.
7. Cerrar con un parte breve: qué se aplicó (hora+fuente), qué quedó en cola, qué significa para los intereses del usuario.
```

## Lecciones ya incorporadas (heredadas de la primera instancia)

- El rebase contra el cron de Actions: `--ours` en rebase es el remoto, no lo tuyo.
- Audit siempre solo, jamás con tuberías.
- Un dominio no permitido en el navegador → "no consultada" y seguir.
- Los fetch reescriben `layers.json` aunque no haya novedad — sin cambio de capas, no es un hecho.

## Desarmar

`CronList` → `CronDelete <id>`. Espaciar = desarmar + re-armar con el intervalo nuevo.
