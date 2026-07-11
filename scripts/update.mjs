#!/usr/bin/env node
/**
 * ⚠️ DEPRECADO desde la adopción OKF: data/incident.json es un artefacto
 * GENERADO por scripts/project-dashboard.mjs a partir de knowledge/incident-okf/.
 * Para actualizar el panel: edita/crea conceptos en el bundle y proyecta.
 * Este script se conserva solo como herramienta de emergencia (sus cambios
 * se pierden en la siguiente proyección).
 *
 * Actualiza data/incident.json sin tocar HTML.
 *
 * Uso:
 *   node scripts/update.mjs                                  sella meta.updatedAt = ahora
 *   node scripts/update.mjs --set stats.3.n="~4.200"         cambia un valor (ruta con puntos) y sella
 *   node scripts/update.mjs --set map.statusPill="..."       varios --set en una llamada
 *   node scripts/update.mjs --event '{"timeLabel":"VIE 10 · 16:00","kind":"escalate","title":"…","html":"…","sources":[{"name":"…","url":"…"}]}'
 *
 * --event añade el evento a la cronología, le pone time=ahora si falta,
 * lo marca como `current` y desmarca el anterior.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'incident.json');

function parseValue(raw) {
  try { return JSON.parse(raw); } catch { return raw; }
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let node = obj;
  for (const key of keys.slice(0, -1)) {
    if (!(key in node)) throw new Error(`Ruta no encontrada: ${path} (falta "${key}")`);
    node = node[key];
  }
  const last = keys[keys.length - 1];
  if (!(last in node)) throw new Error(`Ruta no encontrada: ${path} (falta "${last}")`);
  node[last] = value;
}

function nowMadrid() {
  // ISO con offset de Madrid (CET/CEST)
  const now = new Date();
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(now).replace(' ', 'T');
  const offsetMin = -Math.round((now - new Date(parts + 'Z')) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${parts}${sign}${hh}:${mm}`;
}

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const args = process.argv.slice(2);
const changes = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--set') {
    const assignment = args[++i];
    const eq = assignment.indexOf('=');
    if (eq === -1) throw new Error(`--set espera ruta=valor, recibido: ${assignment}`);
    const path = assignment.slice(0, eq);
    const value = parseValue(assignment.slice(eq + 1));
    setPath(data, path, value);
    changes.push(`set ${path} = ${JSON.stringify(value)}`);
  } else if (args[i] === '--event') {
    const event = JSON.parse(args[++i]);
    if (!event.title) throw new Error('--event necesita al menos "title"');
    event.time = event.time || nowMadrid();
    event.kind = event.kind || '';
    event.html = event.html || '';
    event.sources = event.sources || [];
    event.current = true;
    data.timeline.forEach(ev => { delete ev.current; });
    data.timeline.push(event);
    changes.push(`event añadido: ${event.title}`);
  } else {
    throw new Error(`Argumento desconocido: ${args[i]}`);
  }
}

data.meta.updatedAt = nowMadrid();
changes.push(`meta.updatedAt = ${data.meta.updatedAt}`);

writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n');
changes.forEach(c => console.log('✓', c));
