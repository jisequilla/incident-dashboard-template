---
name: update-blog
description: Capture session activity as chronicle material (lesson/decision concepts) and draft chapters of the incident chronicle in the voice defined for this instance. Use when the user says "captura esto para el blog", "actualiza la crónica", or after a session with narratable material (errors caught, notable data, decisions).
---

# Update Blog — la crónica del incidente (patrón opcional)

Documentar la experiencia mientras ocurre tiene doble valor: honestidad verificable y material que otros aprovecharán. Ver `docs/patron-cronica.md` para el patrón completo probado en la primera instancia.

## Modo A — capturar material

Crear conceptos `lesson`/`decision` en `knowledge/incident-okf/lessons/` (perfil: skill `okf-incident-reference`). Qué merece captura: **errores cazados** (el corazón de una crónica honesta), datos notables con su momento, decisiones de diseño con su porqué, coincidencias entre fuentes independientes. Frontmatter honesto; tras crear: `node scripts/gen-index.mjs`.

## Modo B — redactar un capítulo

1. Definir (una vez, aquí) la voz de la serie: idioma, persona, arco. La primera instancia usó: primera persona, arranque personal/sensorial → cierre analítico con lecciones numeradas, errores contados sin esconder, humildad ante las víctimas, y una sección final fija "Nota sobre las fuentes y la honestidad" (qué es oficial, qué es observación propia, y que ante decisiones reales manda el 112).
2. Leer `lessons/` (sin `chapter:` = material fresco) y el capítulo anterior.
3. Contrastar toda cifra/hora con el bundle — la crónica no puede contradecir al conocimiento; citar concept-ids donde aporte verificabilidad.
4. Al incorporar un concepto, marcarlo `chapter: N` y regenerar índices.

## Reglas

Solo hechos que ocurrieron — la serie pierde todo su valor si algo resulta embellecido. Distinguir siempre observación de dato oficial. No inventar diálogos ni precisar horas que no constan.
