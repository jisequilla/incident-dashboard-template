#!/usr/bin/env node
/**
 * Detecta cambios relevantes del panel (data/incident.json, data/layers.json,
 * data/firms/heatspots.json) comparando el working tree contra una base git,
 * y notifica vía ntfy.sh. Pensado como paso final de CI: NUNCA rompe el
 * pipeline (exit 0 siempre; los errores son avisos).
 *
 * Uso: node scripts/notify-changes.mjs [--base <ref>] [--dry]
 *   --base <ref>  base git para comparar (default: HEAD^)
 *   --dry         calcula e imprime el mensaje, sin hacer POST
 *
 * Config: NTFY_TOPIC en el entorno o en .env de la raíz.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CFG = JSON.parse(readFileSync(join(ROOT, 'incident.config.json'), 'utf8'));
const PANEL_URL = CFG.panelUrl;
const FIRMS_WINDOW_H = 3;

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'HEAD^';

function gitShowJson(path) {
  try {
    return JSON.parse(execSync(`git show ${base}:${path}`, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  } catch {
    return null;
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
  } catch {
    return null;
  }
}

function ntfyTopic() {
  if (process.env.NTFY_TOPIC) return process.env.NTFY_TOPIC.trim();
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return null;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*NTFY_TOPIC\s*=\s*(.*?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '') || null;
  }
  return null;
}

// Nombre de una zona: primer <b>…</b> de su html (las zonas no llevan id propio)
const zoneName = (z, i) => (z.html?.match(/<b>(.*?)<\/b>/)?.[1] ?? `zona #${i + 1}`).replace(/<[^>]+>/g, '');

// Focos FIRMS recientes: adquiridos hace menos de FIRMS_WINDOW_H horas
function recentSpots(geojson) {
  if (!geojson?.features) return 0;
  const cutoff = Date.now() - FIRMS_WINDOW_H * 3600 * 1000;
  return geojson.features.filter(f => new Date(f.properties?.acquiredUtc).getTime() > cutoff).length;
}

try {
  const cur = readJson('data/incident.json');
  const prev = gitShowJson('data/incident.json');
  if (!cur) { console.log('⚠ data/incident.json ilegible — sin notificación'); process.exit(0); }
  if (!prev) { console.log(`⚠ base ${base} no disponible (primer commit o fetch-depth insuficiente) — sin notificación`); process.exit(0); }

  const changes = []; // { line, high }
  const add = (line, high = false) => changes.push({ line, high });

  // 1. stats — cambio de n (identificadas por su etiqueta l; fallback: posición)
  for (const [i, s] of (cur.stats ?? []).entries()) {
    const old = (prev.stats ?? []).find(p => p.l === s.l) ?? prev.stats?.[i];
    if (old && old.n !== s.n) add(`${s.l}: ${old.n} → ${s.n}`, s.cls === 'fatal');
  }

  // 2. map.statusPill — cambio de texto
  if (prev.map?.statusPill !== cur.map?.statusPill && cur.map?.statusPill) {
    add(`Estado: «${prev.map?.statusPill ?? '—'}» → «${cur.map.statusPill}»`);
  }

  // 3. zones — cambio de tag, zona nueva o retirada (identidad: primer <b>…</b>)
  {
    const prevZones = new Map((prev.zones ?? []).map((z, i) => [zoneName(z, i), z]));
    const curNames = new Set();
    for (const [i, z] of (cur.zones ?? []).entries()) {
      const name = zoneName(z, i);
      curNames.add(name);
      const old = prevZones.get(name);
      if (!old) add(`Zona nueva: ${name} [${z.tag}]`);
      else if (old.tag !== z.tag) add(`Zona ${name}: ${old.tag} → ${z.tag}`);
    }
    for (const name of prevZones.keys()) if (!curNames.has(name)) add(`Zona retirada: ${name}`);
  }

  // 4. evento current nuevo (comparado por su time)
  {
    const curEv = (cur.timeline ?? []).filter(e => e.current).pop();
    const prevEv = (prev.timeline ?? []).filter(e => e.current).pop();
    if (curEv && curEv.time !== prevEv?.time) add(`Nuevo evento: ${curEv.timeLabel} — ${curEv.title}`);
  }

  // 5. layers.copernicus.product — producto nuevo (la monitorización esperada)
  {
    const curLayers = readJson('data/layers.json');
    const prevLayers = gitShowJson('data/layers.json');
    const curProd = curLayers?.copernicus?.product;
    if (curProd && prevLayers && prevLayers.copernicus?.product !== curProd) {
      add(`Copernicus: nuevo producto ${curProd} (antes ${prevLayers.copernicus?.product ?? '—'})`);
    }
  }

  // 6. FIRMS — focos de las últimas 3 h: de 0 a >0, o duplicados por encima de 10
  {
    const nowN = recentSpots(readJson('data/firms/heatspots.json'));
    const oldN = recentSpots(gitShowJson('data/firms/heatspots.json'));
    if (oldN === 0 && nowN > 0) add(`FIRMS: ${nowN} focos de calor en las últimas ${FIRMS_WINDOW_H} h (antes 0)`);
    else if (oldN > 0 && nowN > 10 && nowN >= 2 * oldN) add(`FIRMS: los focos recientes se disparan: ${oldN} → ${nowN} (últimas ${FIRMS_WINDOW_H} h)`);
  }

  if (!changes.length) { console.log('✓ sin cambios relevantes'); process.exit(0); }

  const MAX = 5;
  const lines = changes.slice(0, MAX).map(c => c.line);
  if (changes.length > MAX) lines.push(`+${changes.length - MAX} cambios más`);
  const body = lines.join('\n') + `\n\n${PANEL_URL}`;
  const priority = changes.some(c => c.high) ? 'high' : 'default';
  // Guion ASCII: undici rechaza valores de cabecera fuera de latin-1 (—)
  const title = `${CFG.shortTitle} - cambios`;

  if (dry) {
    console.log(`— mensaje (--dry, sin POST) — Title: ${title} · Priority: ${priority} · Tags: fire`);
    console.log(body);
    process.exit(0);
  }

  const topic = ntfyTopic();
  if (!topic) { console.log('⚠ NTFY_TOPIC no configurado — sin notificación'); process.exit(0); }

  const res = await fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    headers: { Title: title, Priority: priority, Tags: 'fire' },
    body
  });
  res.ok
    ? console.log(`✓ notificados ${changes.length} cambios a ntfy.sh/${topic}`)
    : console.log(`⚠ ntfy.sh respondió HTTP ${res.status} — notificación no entregada`);
} catch (e) {
  console.log(`⚠ notify-changes: ${e.message} — sin notificación`);
}
process.exit(0);
