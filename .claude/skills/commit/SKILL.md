---
name: commit
description: Coherence-enforced commit for this incident panel repo — audits the OKF bundle, regenerates stale indexes/projections, catches stale docs (README/CLAUDE.md), then commits and pushes (push = publish to the public panel). Use for ANY commit in this repo — "commit this", "haz commit", "publica los cambios", "push".
---

# Commit — coherencia antes de publicar

En este repo un push **publica** (Pages redespliega el panel ). Nada sale sin pasar la auditoría. Este flujo existe porque ya nos pasó: README enseñando el flujo viejo tras dos flips, un `git add -A` que se tragó worktrees como gitlinks, proyecciones olvidadas.

## El flujo

### 1. Revisar QUÉ hay (nunca `git add -A` a ciegas)

```bash
git status --short
```

Leer la lista. Sorpresas típicas a excluir: worktrees/gitlinks (`.claude/worktrees/` ya está en .gitignore — si aparece un modo `160000`, parar), ficheros temporales, `data/incident.projected.json` (residuo del modo --check).

### 2. Auditoría determinista

```bash
node scripts/audit.mjs   # SOLO, jamás encadenado con | (tail, grep…): la tubería
                         # enmascara el exit code y el && continúa con el audit en rojo.
                         # Ya pasó: un "| tail -1" publicó un timestamp futuro.
```

| Check | Si falla |
|---|---|
| A. Bundle válido | Arreglar el concepto (clave que falta, confidence inválida, timestamp futuro) — nunca "commitear y ya" |
| B. Índices stale | El audit los regenera solo — añadirlos al commit |
| C. Proyección stale | `node scripts/project-dashboard.mjs` y añadir `data/incident.json` al commit |
| D. Ruta muerta en docs | Corregir la referencia en README/CLAUDE.md |

Salida 1 = no se commitea hasta resolver.

### 3. Revisión semántica de docs (lo que el script no puede ver)

Si el diff toca **`scripts/`, `.github/workflows/`, `.claude/skills/`, el perfil OKF o la estructura del repo** → leer las secciones afectadas de `README.md` y `CLAUDE.md` y preguntarse: *¿siguen enseñando el flujo que este diff acaba de cambiar?* Actualizar en estilo canónico (como si siempre hubiera sido así — sin "Updated to…", sin rastros de la edición).

Casos que ya nos mordieron: sección "Actualizar datos" del README enseñando `update.mjs` tras el flip; descripción de una skill mencionando un fichero congelado.

### 4. Commit y push

```bash
git add <rutas explícitas>
git commit -m "..."   # resumen imperativo en español + cuerpo si aporta; terminar con:
                      # Co-Authored-By: Claude <modelo> <noreply@anthropic.com>
git pull --rebase && git push
```

- El mensaje describe el **estado resultante**, no la sesión ("Proyector: bundle → incident.json", no "arreglos varios").
- Tras el push, si el cambio es visible en el panel: verificar la URL pública (`curl` del JSON o vistazo en el navegador) — el deploy tarda ~45 s.

### 5. ¿Material narrable en el diff?

Si el commit encierra un error cazado, una decisión de diseño o un dato notable → sugerir capturarlo como concepto `lesson`/`decision` (skill `update-blog`, modo A) — en el MISMO commit si es natural.

## Regla de cierre

Un commit que deja el repo enseñando dos verdades (el código una, los docs otra) no está terminado, por verde que esté el audit.
