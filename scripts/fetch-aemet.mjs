#!/usr/bin/env node
/**
 * Descarga la predicción horaria de AEMET OpenData para el municipio del
 * incidente (Vera, Almería por defecto), agrega las próximas 12 horas
 * (viento/rachas/temperatura máximos, humedad mínima) y actualiza la clave
 * `aemet` de data/layers.json.
 *
 * Uso:  node scripts/fetch-aemet.mjs          (real; requiere AEMET_API_KEY)
 *       node scripts/fetch-aemet.mjs --dry    (fixture, sin red ni escritura)
 *
 * API de dos pasos: la primera respuesta es {datos: <url>, estado: 200} y los
 * datos reales se descargan de esa URL. Si la horaria falla, se intenta la
 * diaria como fallback (agregación más gruesa: máx/mín del día).
 * Sin key, o con cualquier error de red/HTTP, el script avisa y sale con 0:
 * el cron no debe romper.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CFG = JSON.parse(readFileSync(join(ROOT, 'incident.config.json'), 'utf8'));
const API = 'https://opendata.aemet.es/opendata/api';
const UA = 'vera-wild-fires-dashboard/1.0';
const TIMEOUT_MS = 20_000;
const ATTRIBUTION = '© AEMET OpenData, predicción por municipio';

const DRY = process.argv.includes('--dry');

// --- Config: env directo, o .env en la raíz (parseo a mano, sin dependencias) ---
function loadDotEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return {};
  const vars = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || m[0].trimStart().startsWith('#')) continue;
    vars[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return vars;
}

const dotEnv = loadDotEnv();
const API_KEY = process.env.AEMET_API_KEY ?? dotEnv.AEMET_API_KEY;
const MUNICIPIO = process.env.AEMET_MUNICIPIO ?? dotEnv.AEMET_MUNICIPIO ?? CFG.layers.aemet.municipio;

// --- Red: fetch con timeout; los datos de AEMET pueden venir en ISO-8859-15 ---
async function fetchDecoded(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, api_key: API_KEY },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url.split('?')[0]}`);
  const type = res.headers.get('content-type') ?? '';
  const charset = /8859/.test(type) ? 'iso-8859-15' : 'utf-8';
  return JSON.parse(new TextDecoder(charset).decode(await res.arrayBuffer()));
}

async function fetchAemet(endpoint) {
  const paso1 = await fetchDecoded(`${API}${endpoint}?api_key=${encodeURIComponent(API_KEY)}`);
  if (paso1.estado !== 200 || !paso1.datos) {
    throw new Error(`estado ${paso1.estado}: ${paso1.descripcion ?? 'sin descripción'}`);
  }
  return fetchDecoded(paso1.datos);
}

// --- Agregación horaria: próximas 12 horas ---
// Los `periodo` de la horaria son horas locales (Europe/Madrid).
function nowMadridKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}`;
}

function flattenHoras(municipio) {
  const horas = [];
  for (const dia of municipio.prediccion.dia) {
    const fecha = dia.fecha.slice(0, 10);
    const byPeriodo = (arr = []) => Object.fromEntries(arr.map(e => [e.periodo, e]));
    const hum = byPeriodo(dia.humedadRelativa);
    const viento = byPeriodo(dia.vientoAndRachaMax?.filter(e => e.direccion));
    const rachas = byPeriodo(dia.vientoAndRachaMax?.filter(e => e.value !== undefined));
    for (const t of dia.temperatura ?? []) {
      horas.push({
        key: `${fecha}T${t.periodo}`,
        tempC: +t.value,
        humedadPct: hum[t.periodo] ? +hum[t.periodo].value : null,
        vientoKmh: viento[t.periodo] ? +viento[t.periodo].velocidad[0] : null,
        vientoDir: viento[t.periodo]?.direccion[0] ?? null,
        rachaKmh: rachas[t.periodo] ? +rachas[t.periodo].value : null
      });
    }
  }
  return horas.sort((a, b) => a.key.localeCompare(b.key));
}

function agregaHoraria(municipio) {
  const horas = flattenHoras(municipio);
  if (!horas.length) throw new Error('la predicción horaria no trae horas');

  // Modo real: desde la hora actual. Modo --dry: desde el inicio del fixture
  // (determinista). Si la predicción ya no cubre "ahora", se avisa y se usan
  // las primeras horas disponibles antes que inventar datos.
  let ventana = DRY ? horas : horas.filter(h => h.key >= nowMadridKey());
  if (!ventana.length) {
    console.warn('⚠ La predicción no cubre la hora actual — se usan las primeras horas publicadas');
    ventana = horas;
  }
  ventana = ventana.slice(0, 12);

  const max = sel => ventana.reduce((m, h) => (sel(h) !== null && sel(h) > (sel(m) ?? -Infinity) ? h : m), ventana[0]);
  const min = sel => ventana.reduce((m, h) => (sel(h) !== null && sel(h) < (sel(m) ?? Infinity) ? h : m), ventana[0]);

  const peorViento = max(h => h.vientoKmh);
  return {
    vientoDir: peorViento.vientoDir,
    vientoKmh: peorViento.vientoKmh,
    rachasKmh: max(h => h.rachaKmh).rachaKmh,
    tempMaxC: max(h => h.tempC).tempC,
    humedadMinPct: min(h => h.humedadPct).humedadPct
  };
}

// --- Fallback diaria: agregación más gruesa (día de hoy) ---
function agregaDiaria(municipio) {
  const dia = municipio.prediccion.dia[0];
  const vientos = (dia.viento ?? []).filter(v => v.velocidad !== '' && v.velocidad != null);
  const peor = vientos.reduce((m, v) => (+v.velocidad > +(m?.velocidad ?? -Infinity) ? v : m), null);
  const rachas = (dia.rachaMax ?? []).map(r => +r.value).filter(Number.isFinite);
  return {
    vientoDir: peor?.direccion ?? null,
    vientoKmh: peor ? +peor.velocidad : null,
    rachasKmh: rachas.length ? Math.max(...rachas) : null,
    tempMaxC: dia.temperatura?.maxima ?? null,
    humedadMinPct: dia.humedadRelativa?.minima ?? null
  };
}

function construyeSalida(municipio, agg) {
  const rachas = agg.rachasKmh !== null ? ` (rachas ${agg.rachasKmh})` : '';
  return {
    municipio: `${municipio.nombre} (${municipio.id})`,
    fetchedAtUtc: new Date().toISOString().slice(0, 16) + 'Z',
    proximas12h: agg,
    resumen: `${agg.vientoDir} ${agg.vientoKmh} km/h${rachas} · máx ${agg.tempMaxC} °C · HR mín ${agg.humedadMinPct} %`,
    attribution: ATTRIBUTION
  };
}

// --- Main ---
if (DRY) {
  const fixture = JSON.parse(readFileSync(join(ROOT, 'scripts', 'fixtures', 'aemet-horaria.json'), 'utf8'));
  const salida = construyeSalida(fixture[0], agregaHoraria(fixture[0]));
  console.log(JSON.stringify(salida, null, 2));
  console.log(`✓ Modo --dry: agregado desde el fixture, sin escribir data/layers.json`);
  process.exit(0);
}

if (!API_KEY) {
  console.warn('⚠ AEMET_API_KEY no configurada — se omite (el cron no debe romper)');
  process.exit(0);
}

let salida;
try {
  const horaria = await fetchAemet(`/prediccion/especifica/municipio/horaria/${MUNICIPIO}`);
  salida = construyeSalida(horaria[0], agregaHoraria(horaria[0]));
  console.log(`✓ Predicción horaria de ${salida.municipio} — ${salida.resumen}`);
} catch (eHoraria) {
  console.warn(`⚠ Horaria falló (${eHoraria.message}) — probando la diaria`);
  try {
    const diaria = await fetchAemet(`/prediccion/especifica/municipio/diaria/${MUNICIPIO}`);
    salida = construyeSalida(diaria[0], agregaDiaria(diaria[0]));
    salida.resumen += ' (agregado diario)';
    console.log(`✓ Predicción diaria (fallback) de ${salida.municipio} — ${salida.resumen}`);
  } catch (eDiaria) {
    console.warn(`⚠ AEMET no disponible (${eDiaria.message}) — se omite (el cron no debe romper)`);
    process.exit(0);
  }
}

const layersPath = join(ROOT, 'data', 'layers.json');
const layers = JSON.parse(readFileSync(layersPath, 'utf8'));
layers.aemet = salida;
writeFileSync(layersPath, JSON.stringify(layers, null, 2) + '\n');
console.log('✓ aemet actualizado en data/layers.json');
console.log('Recuerda: node scripts/project-dashboard.mjs para regenerar incident.json');
