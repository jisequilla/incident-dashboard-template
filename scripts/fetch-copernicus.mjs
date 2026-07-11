#!/usr/bin/env node
/**
 * Descarga la cartografía vectorial más reciente de Copernicus EMS para EMSR892
 * (área quemada + frentes de fuego) y actualiza la config del mapa.
 *
 * Uso: node scripts/fetch-copernicus.mjs
 *
 * Elige el producto más nuevo entre la delineación y sus monitorizaciones
 * (DEL, MON1, MON2…) que tenga capas vectoriales publicadas.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CFG = JSON.parse(readFileSync(join(ROOT, 'incident.config.json'), 'utf8'));
const ACTIVATION = CFG.layers.copernicus?.activation;
if (!ACTIVATION) { console.log('⚠ Sin activación Copernicus configurada — se omite'); process.exit(0); }
const API = `https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=${ACTIVATION}`;
const UA = { headers: { 'User-Agent': 'vera-wild-fires-dashboard/1.0' } };

const res = await fetch(API, UA);
if (!res.ok) throw new Error(`API Copernicus: HTTP ${res.status}`);
const activation = (await res.json()).results[0];

const products = activation.aois.flatMap(aoi => aoi.products);
const candidates = products
  .map(p => {
    const area = p.layers?.find(l => l.json?.includes('observedEventA'));
    const lines = p.layers?.find(l => l.json?.includes('observedEventL'));
    const acquired = p.images?.[0]?.acquisitionTime;
    return area && acquired ? { p, area, lines, acquired } : null;
  })
  .filter(Boolean)
  .sort((a, b) => new Date(b.acquired) - new Date(a.acquired));

if (!candidates.length) throw new Error('Ningún producto con capas vectoriales publicadas todavía.');

const best = candidates[0];
const tag = best.p.monitoring ? `MON${best.p.monitoringNumber}` : 'DEL';
const version = best.p.version?.number ?? 1;
console.log(`Producto más reciente: ${tag} v${version} · imagen ${best.acquired} UTC`);

mkdirSync(join(ROOT, 'data', 'copernicus'), { recursive: true });
const areaFile = `EMSR892_AOI01_${tag}_observedEventA_v${version}.json`;
const linesFile = `EMSR892_AOI01_${tag}_observedEventL_v${version}.json`;

async function download(url, file) {
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const body = await r.text();
  JSON.parse(body); // validar antes de escribir
  writeFileSync(join(ROOT, 'data', 'copernicus', file), body);
  console.log(`✓ ${file} (${(body.length / 1024).toFixed(0)} KB)`);
}

await download(best.area.json, areaFile);
if (best.lines) await download(best.lines.json, linesFile);

// Plano-máquina: la config de capas vive en layers.json; el proyector la funde en incident.json
const layersPath = join(ROOT, 'data', 'layers.json');
const layers = JSON.parse(readFileSync(layersPath, 'utf8'));
const acquiredUtc = new Date(best.acquired + 'Z');
const cest = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(acquiredUtc);
layers.copernicus = {
  product: `EMSR892 · ${tag} v${version}`,
  areaUrl: `./data/copernicus/${areaFile}`,
  linesUrl: best.lines ? `./data/copernicus/${linesFile}` : null,
  acquiredLabel: `${cest} CEST`,
  attribution: '© European Union, Copernicus Emergency Management Service'
};
writeFileSync(layersPath, JSON.stringify(layers, null, 2) + '\n');
console.log(`✓ copernicus → ${tag} v${version} (imagen ${cest} CEST) en data/layers.json`);
console.log('Recuerda: node scripts/project-dashboard.mjs para regenerar incident.json');
