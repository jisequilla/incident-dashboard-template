#!/usr/bin/env node
/**
 * Descarga los focos de calor de NASA FIRMS (últimas 24 h, Europa, sin API key),
 * recorta a la zona del incendio y genera data/firms/heatspots.json (GeoJSON).
 *
 * Uso: node scripts/fetch-firms.mjs
 *
 * Fuentes: VIIRS S-NPP, NOAA-20, NOAA-21 y MODIS. Cada foco lleva satélite,
 * hora de adquisición (UTC), FRP (potencia radiativa, MW) y confianza.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Zona del incidente: incident.config.json → layers.firms.bbox
const CFG = JSON.parse(readFileSync(join(ROOT, 'incident.config.json'), 'utf8'));
const BBOX = CFG.layers.firms.bbox;

const SOURCES = [
  ['S-NPP VIIRS', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Europe_24h.csv'],
  ['NOAA-20 VIIRS', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Europe_24h.csv'],
  ['NOAA-21 VIIRS', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Europe_24h.csv'],
  ['MODIS', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Europe_24h.csv'],
];

function parseCsv(text) {
  const [head, ...rows] = text.trim().split('\n');
  const cols = head.split(',');
  return rows.map(r => Object.fromEntries(r.split(',').map((v, i) => [cols[i], v])));
}

const features = [];
for (const [label, url] of SOURCES) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'vera-wild-fires-dashboard/1.0' } });
    if (!res.ok) { console.warn(`⚠ ${label}: HTTP ${res.status} — se omite`); continue; }
    const rows = parseCsv(await res.text());
    const inBox = rows.filter(r => {
      const lat = +r.latitude, lng = +r.longitude;
      return lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax;
    });
    for (const r of inBox) {
      const hhmm = r.acq_time.padStart(4, '0');
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [+r.longitude, +r.latitude] },
        properties: {
          source: label,
          acquiredUtc: `${r.acq_date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`,
          frp: +r.frp || null,
          confidence: r.confidence,
          daynight: r.daynight
        }
      });
    }
    console.log(`✓ ${label}: ${inBox.length} focos en la zona (de ${rows.length} en Europa)`);
  } catch (e) {
    console.warn(`⚠ ${label}: ${e.message} — se omite`);
  }
}

features.sort((a, b) => new Date(b.properties.acquiredUtc) - new Date(a.properties.acquiredUtc));

mkdirSync(join(ROOT, 'data', 'firms'), { recursive: true });
const out = { type: 'FeatureCollection', features };
writeFileSync(join(ROOT, 'data', 'firms', 'heatspots.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`✓ data/firms/heatspots.json — ${features.length} focos (últimas 24 h)`);

// Plano-máquina: la config de capas vive en layers.json; el proyector la funde en incident.json
const layersPath = join(ROOT, 'data', 'layers.json');
const layers = JSON.parse(readFileSync(layersPath, 'utf8'));
layers.firms = {
  url: './data/firms/heatspots.json',
  fetchedAtUtc: new Date().toISOString().slice(0, 16) + 'Z',
  attribution: 'NASA FIRMS (VIIRS/MODIS), últimas 24 h'
};
writeFileSync(layersPath, JSON.stringify(layers, null, 2) + '\n');
console.log('✓ firms actualizado en data/layers.json');
console.log('Recuerda: node scripts/project-dashboard.mjs para regenerar incident.json');
