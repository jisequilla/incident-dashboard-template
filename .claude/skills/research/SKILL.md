---
name: research
description: Deep-dive research on ONE background question about the incident or its aftermath — producing a verified dossier concept in the knowledge bundle. Use when the user asks to "investiga", "research X", "expand on", "profundiza en", or a question that a news sweep can't answer. NOT for the daily sweep (that's /gather-updates).
---

# Research — profundizar en UNA pregunta

Responde una pregunta de fondo con fuentes verificadas y deja el resultado como **dossier** en el bundle (`knowledge/incident-okf/research/`). Se diferencia de `/gather-updates` en el eje: aquello es amplitud y recencia (el parte del día); esto es **profundidad** sobre una cuestión que las noticias no responden.

## 1. Encuadrar la pregunta

Una pregunta por dossier, concreta y accionable. Si el encargo es vago ("investiga sobre seguros"), afinarla ANTES de barrer: ¿qué decisión informa? (ej.: "¿qué cubre un seguro de hogar típico en España ante daños por incendio forestal y qué pasos exige tras el siniestro?"). Preguntas con dueño natural en el incidente: protocolo de retorno tras incendios en Andalucía · seguros y siniestro · ayudas públicas post-incendio · recuperación del terreno quemado · Valle del Este (historia, plan de autoprotección, comunidad).

## 2. Barrer en profundidad

- **WebSearch** con variantes (español + inglés si aplica; términos legales exactos: "plan INFOCA fase de vuelta", "Consorcio de Compensación de Seguros", BOE/BOJA).
- **WebFetch** de las fuentes primarias que la búsqueda cite — normativa (BOE/BOJA), organismos (Junta, Consorcio, ayuntamientos), no solo prensa.
- Preguntas GRANDES (multi-fuente, contrastación fuerte): valorar delegar el barrido en la skill global `deep-research` y quedarse con la verificación + OKF-ificación del resultado.
- Fuentes que exijan sesión (Facebook del ayuntamiento, X) → navegador del usuario.

## 3. Verificar (no negociable)

- **Patrón EMSR671**: cada fuente clave se ABRE y se confirma que dice lo que el buscador resume — los buscadores ofrecen La Palma 2023 como si fuera tu incendio.
- Afirmación importante → mínimo dos fuentes independientes, o se marca la confianza que le corresponde (`pista`, `prensa`).
- Normativa: citar la disposición concreta (no "la ley dice"), con fecha — el derecho caduca.
- Lo no encontrado se declara: "no localizado protocolo específico X" es un hallazgo.

## 4. El dossier — concepto en `research/`

`research/<slug-de-la-pregunta>.md`, type `dossier`:

```yaml
---
type: dossier
title: <la pregunta, como título>
description: <la respuesta en una frase>
timestamp: <cuándo se investigó — JAMÁS futuro>
confidence: <del conjunto: la del eslabón más débil de las afirmaciones portantes>
status: vigente
sources:
  - "Nombre <url>"        # las fuentes ABIERTAS y verificadas, no las meramente vistas
relates_to: [<conceptos del bundle a los que informa>]
tags: [dossier, <tema>]
---
```

Cuerpo: **respuesta primero** (2-4 párrafos), luego "Lo verificado" (afirmación → fuente → confianza, por puntos), luego "Lo NO confirmado / abierto". Prosa útil para un evacuado, no un paper.

## 5. Propagar

- `node scripts/gen-index.mjs` (el dominio research/ se indexa como los demás).
- Si el dossier cambia conocimiento operativo (ej.: el protocolo de retorno matiza `state/zona-valle-del-este`) → aplicarlo vía `/update-dashboard` (conceptos + proyección), citando el dossier en `relates_to`.
- Fuentes nuevas valiosas descubiertas → proponer su concepto en `directory/`.
- Cerrar con `/commit` (audit incluido — jamás en tubería).

## Reglas

- Un dossier NO es un evento ni una noticia: si lo que se encontró es "ha pasado X", eso es del parte de `/gather-updates`.
- La pregunta y la respuesta van en español (el bundle es del autor); las fuentes, en el idioma en que estén.
- `confidence` honesta del conjunto: un dossier construido sobre prensa no es `oficial` por muy bien escrito que esté.
