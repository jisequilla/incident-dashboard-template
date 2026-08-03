#!/usr/bin/env node
/**
 * fetch-boja.mjs — vigía del BOJA (Boletín Oficial de la Junta de Andalucía).
 *
 * El expediente del incendio (ayudas, declaraciones, nombramientos) se publica
 * en el BOJA, que no tiene RSS útil. Su buscador sí es consultable: Solr detrás
 * de un GET plano. El fetch real lo hace scripts/fetch-boja.py (Scrapling, via
 * uv run) como proceso hijo; este script pone el contrato: invariantes, filtro,
 * dedupe y el parte por stdout. Hermano de fetch-news.mjs y fetch-x.mjs: emite
 * SOLO publicaciones no vistas y deja el detalle en data/boja/latest.json
 * (plano-máquina efímero, gitignored — alimenta el parte de /gather-updates).
 *
 * El buscador hace stemming (un topónimo ≈ un apellido) y su semántica
 * multi-término no es de fiar (medido en la primera instancia: una consulta de
 * tres palabras devolvía 0 resultados; una de una, 16): consultas de UNA palabra
 * o frase entrecomillada, ventana ancha (fecha + orden descendente), y la
 * relevancia la decide el filtro estricto de filterPatterns aquí, en cliente.
 * Un decreto de ayudas puede no nombrar al municipio: por eso hay varias
 * consultas y varios patrones, no una de cada.
 *
 * PARA OTRA COMUNIDAD AUTÓNOMA (BOCM, DOGC, BOE…): se reescribe fetch-boja.py
 * manteniendo su contrato JSON ({ok,queries:[{q,total,scanned,items[]}]} o
 * {ok:false,kind,msg}); este script no cambia.
 *
 * Invariantes como asserts (los de fetch-x):
 *   - sin enlace concreto al documento → descartado
 *   - sin fecha de boletín, o fecha FUTURA → descartado (invariante 4)
 *
 * Uso: node scripts/fetch-boja.mjs        (barrido real)
 *      node scripts/fetch-boja.mjs --dry  (fixture, sin red ni escritura)
 *
 * Exit: 0 ok · 3 forma/red rota (incluye rediseño del buscador) ·
 *       4 backend ausente (uv) · 5 capacidad upstream desaparecida (search.do ya no existe)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CFG = JSON.parse(readFileSync(new URL('../incident.config.json', import.meta.url), 'utf8'));
const B = CFG.boja ?? {};
const QUERIES = B.queries ?? [];
const START_DATE = B.startDate;
const PATTERNS = (B.filterPatterns ?? []).map(p => new RegExp(p, 'iu'));
const MAX_PAGES = B.maxPages ?? 5;
const BIN = B.bin ?? 'uv';
const PY = fileURLToPath(new URL('fetch-boja.py', import.meta.url));

const DRY = process.argv.includes('--dry');

const DIR = new URL('../data/boja/', import.meta.url);
if (!DRY) mkdirSync(DIR, { recursive: true });
const SEEN_PATH = new URL('seen.json', DIR);
const seen = existsSync(SEEN_PATH) ? new Set(JSON.parse(readFileSync(SEEN_PATH, 'utf8'))) : new Set();

const die = (code, msg) => { console.error(msg); process.exit(code); };

/* ---------- proceso hijo: uv run fetch-boja.py ---------- */
function runBackend() {
  const payload = { queries: QUERIES, startDate: START_DATE, maxPages: MAX_PAGES, controlQuery: B.controlQuery ?? 'decreto' };
  const res = spawnSync(BIN, ['run', '--quiet', PY, JSON.stringify(payload)], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8' },
    encoding: 'utf8',
    timeout: 180000, // la primera ejecución resuelve el entorno Python (uv cachea después)
  });
  if (res.error?.code === 'ENOENT') die(4, `✗ BOJA: backend '${BIN}' no encontrado en PATH (instalar uv: https://docs.astral.sh/uv/)`);

  let out = null;
  try { out = JSON.parse(res.stdout); } catch { /* se decide abajo */ }

  if (out?.ok === false) {
    if (out.kind === 'gone') die(5, `✗ BOJA: capacidad upstream desaparecida — ${out.msg}\n  El barrido del BOJA queda SIN HACER: no confundir con "sin novedades".`);
    die(3, `✗ BOJA: ${out.kind === 'shape' ? 'estructura inesperada (¿rediseño del buscador?)' : 'fallo de red'} — ${out.msg}\n  El barrido del BOJA queda SIN HACER.`);
  }
  if (!Array.isArray(out?.queries)) {
    die(3, `✗ BOJA: salida ilegible del hijo Python (código ${res.status})\n${(res.stderr ?? '').trim().slice(-800)}`);
  }
  return out.queries;
}

/* ---------- validación: invariantes del proyecto, como asserts ----------
   El texto de cada item trae la ficha completa: "<título>. Organismo: <org>
   (Boletín número N de DD/MM/YYYY Sección: …)". Sin enlace o sin fecha de
   boletín, el item no sirve para el tier system y se descarta con motivo. */
function validate(raw, todayISO) {
  let link = (raw.link ?? '').trim();
  if (!/^https?:\/\//.test(link)) return { drop: 'sin enlace al documento' };
  link = link.replace(/^http:\/\/(www\.juntadeandalucia\.es)/, 'https://$1');

  const text = raw.text ?? '';
  const mBol = text.match(/\(?Bolet[íi]n n[úu]mero (\d+) de (\d{2})\/(\d{2})\/(\d{4})/);
  if (!mBol) return { drop: 'sin fecha de boletín' };
  const [, num, dd, mm, yyyy] = mBol;
  const date = `${yyyy}-${mm}-${dd}`;
  if (date > todayISO) return { drop: `fecha de boletín FUTURA (${date})` };

  const title = (text.split(/ Organismo:/)[0] ?? text).trim();
  const organismo = (text.match(/Organismo:\s*([^(]+)/)?.[1] ?? '').trim();
  return { ok: { url: link, title, organismo, boletin: num, publishedAt: date } };
}

/* ---------- ciclo ---------- */
if (!QUERIES.length || !START_DATE) die(3, '✗ BOJA: configuración incompleta (incident.config.json → boja.queries / boja.startDate)');

let results;
let todayISO;

if (DRY) {
  const fx = JSON.parse(readFileSync(new URL('fixtures/boja-search.json', import.meta.url), 'utf8'));
  results = fx.payload.queries;
  todayISO = fx._anchorToday;
  console.error(`· --dry: fixture boja-search.json · ancla ${todayISO} (sin red ni escritura)`);
} else {
  results = runBackend();
  todayISO = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
}

const dropped = [];
const fresh = [];
let scanned = 0;
let filteredOut = 0;
const dedup = new Set();

for (const r of results) {
  scanned += r.scanned;
  for (const raw of r.items) {
    const v = validate(raw, todayISO);
    if (v.drop) { dropped.push(v.drop); continue; }
    if (PATTERNS.length && !PATTERNS.some(p => p.test(raw.text))) { filteredOut++; continue; }
    if (dedup.has(v.ok.url) || seen.has(v.ok.url)) continue;
    dedup.add(v.ok.url);
    fresh.push(v.ok);
  }
}
fresh.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

if (!DRY) {
  for (const it of fresh) seen.add(it.url);
  writeFileSync(SEEN_PATH, JSON.stringify([...seen].slice(-800), null, 1));
  writeFileSync(new URL('latest.json', DIR), JSON.stringify({ fetchedAt: new Date().toISOString(), items: fresh }, null, 1));
}

/* Techo declarado, nunca silencioso: la consulta va ordenada por fecha
   descendente, así que lo no escaneado es siempre lo más antiguo. */
for (const r of results) {
  if (r.total > r.scanned) console.error(`⚠ consulta ${r.q}: escaneados ${r.scanned} de ${r.total} (los más recientes primero; subir boja.maxPages si hace falta el fondo)`);
}
if (dropped.length) {
  const tally = dropped.reduce((a, d) => (a[d.replace(/\(.*\)/, '').trim()] = (a[d.replace(/\(.*\)/, '').trim()] ?? 0) + 1, a), {});
  console.error(`⚠ descartados ${dropped.length}: ${Object.entries(tally).map(([k, n]) => `${k} ×${n}`).join(', ')}`);
}

console.log(`· BOJA vía buscador oficial (${QUERIES.map(q => `'${q}'`).join(', ')}; desde ${START_DATE}). El buscador hace stemming y su multi-término no es fiable: la relevancia la decide el filtro en cliente, no él.`);

if (!fresh.length) {
  console.log(`✓ BOJA: sin publicaciones nuevas relevantes (${scanned} escaneadas, ${filteredOut} fuera de filtro)`);
} else {
  console.log(`✓ BOJA: ${fresh.length} publicaciones NUEVAS relevantes${DRY ? ' (--dry: nada escrito)' : ' (detalle en data/boja/latest.json)'}`);
  for (const it of fresh.slice(0, 20)) {
    const [y, m, d] = it.publishedAt.split('-');
    console.log(`- ${d}/${m} · BOJA ${it.boletin} · ${it.organismo || '¿organismo?'} · ${it.title.slice(0, 130)}${it.title.length > 130 ? '…' : ''}\n  ${it.url}`);
  }
  if (fresh.length > 20) console.log(`  … y ${fresh.length - 20} más en latest.json`);
}
