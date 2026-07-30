#!/usr/bin/env node
/**
 * fetch-x.mjs — ingesta determinista de X/Twitter vía CLI externo.
 *
 * Hermano de fetch-news.mjs: emite por stdout SOLO los tuits no vistos y deja
 * el detalle en data/x/latest.json. Plano-máquina efímero (gitignored) que
 * alimenta el parte de /gather-updates — nunca el panel.
 *
 * A diferencia del RSS, aquí las invariantes del proyecto son asserts:
 *   - sin permalink al tuit → descartado (el tier system exige URL concreta)
 *   - timestamp ausente, ilegible o FUTURO → descartado (invariante 4)
 *   - autor o texto vacíos → descartado
 *
 * Aislamiento de credenciales (twitter-cli lee cookies del navegador cuando las
 * variables faltan O CADUCAN — twitter_cli/auth.py:get_cookies). Un fallback así
 * cambiaría de cuenta en silencio y devolvería datos que parecen buenos. Se
 * neutraliza lanzando el hijo con HOME en un directorio vacío: las rutas de
 * cookies salen de expanduser("~"), no encuentra nada y falla ruidosamente.
 * El env del hijo se construye desde cero; nunca hereda el nuestro.
 *
 * VÍA OPERATIVA: perfiles oficiales vía `user-posts`, no búsqueda por hashtag.
 * Desde el 29-jul-2026 `twitter search` devuelve 404: X migró su cliente web y
 * la cabecera X-Client-Transaction-Id ya no puede derivarse (el bundle
 * ondemand.s del que se leían los índices ya no se sirve). Se pierde la capa
 * ciudadana del hashtag —prensa local, vecinos, cortes de carretera—; el parte
 * lo declara en cada ciclo para que la ausencia no se lea como "no hay novedad".
 * Cada ciclo sondea search: si revive, avisa (y `queries` sigue en la config).
 *
 * Uso: node scripts/fetch-x.mjs        (barrido real)
 *      node scripts/fetch-x.mjs --dry  (fixture, sin red ni escritura)
 *
 * Exit: 0 ok · 2 auth caducada/ausente · 3 salida malformada · 4 backend ausente
 *       5 capacidad upstream desaparecida (autenticado, pero el endpoint ya no existe)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const CFG = JSON.parse(readFileSync(new URL('../incident.config.json', import.meta.url), 'utf8'));
const X = CFG.x ?? {};
const ACCOUNTS = X.accounts?.length ? X.accounts : [];
const CONTROL_ACCOUNT = X.controlAccount ?? ACCOUNTS[0];
const EXCLUDE_RT = X.excludeRetweets ?? true;
const PROBE = X.probeSearch ?? true;
const QUERIES = X.queries?.length ? X.queries : [CFG.hashtag].filter(Boolean);
const MAX = X.max ?? 40;
const WINDOW_H = X.windowHours ?? 36;
const BIN = X.bin ?? 'twitter';
const CRED_FILE = (X.credFile ?? join('~', '.config', 'vera-fires', 'x.env'))
  .replace(/^~(?=$|\/)/, homedir());

const DRY = process.argv.includes('--dry');

const DIR = new URL('../data/x/', import.meta.url);
if (!DRY) mkdirSync(DIR, { recursive: true });
const SEEN_PATH = new URL('seen.json', DIR);
const seen = existsSync(SEEN_PATH) ? new Set(JSON.parse(readFileSync(SEEN_PATH, 'utf8'))) : new Set();

const die = (code, msg) => { console.error(msg); process.exit(code); };

/* ---------- credenciales: fichero fuera del repo, solo al proceso hijo ---------- */
function readCreds() {
  if (!existsSync(CRED_FILE)) return null;
  const creds = {};
  for (const line of readFileSync(CRED_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?(TWITTER_AUTH_TOKEN|TWITTER_CT0)\s*=\s*(.+?)\s*$/);
    if (m) creds[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return creds.TWITTER_AUTH_TOKEN && creds.TWITTER_CT0 ? creds : null;
}

/* Jaula: HOME vacío para que la extracción de cookies del navegador no encuentre
   nada. Sin esto, una credencial caducada degrada a la sesión real del usuario. */
function makeCage() {
  const cage = join(tmpdir(), `vera-x-cage-${process.pid}`);
  mkdirSync(cage, { recursive: true });
  return cage;
}

/* Clasifica en vez de morir: la sonda de `search` necesita distinguir "capacidad
   ausente" (hoy lo esperado, no debe tumbar el ciclo) de un fallo del barrido. */
const FAIL = { AUTH: 'auth', GONE: 'capability', BAD: 'malformed' };

function runBackend(argv, creds, cage) {
  const res = spawnSync(BIN, [...argv, '--json'], {
    env: { PATH: process.env.PATH, HOME: cage, LANG: 'C.UTF-8', ...creds },
    encoding: 'utf8',
    timeout: 60000,
  });
  if (res.error?.code === 'ENOENT') die(4, `✗ backend '${BIN}' no encontrado en PATH`);
  const stderr = (res.stderr ?? '').trim();

  /* El payload manda sobre el código de salida: el backend emite su error
     estructurado {ok:false,error:{code,message}} por STDOUT y aun así sale con
     código 1. Mirar antes el status confundiría las categorías entre sí. */
  let payload = null;
  try { payload = JSON.parse(res.stdout); } catch { /* no es JSON: se decide abajo */ }

  const isAuth = t => /auth|cookie|login|credential|\b401\b|\b403\b/i.test(t);
  /* Autenticado pero el endpoint ya no existe: ni credenciales ni formato. */
  const isGone = t => /not_found|\b404\b/i.test(t);

  if (payload?.ok === false) {
    const { code = '?', message = '' } = payload.error ?? {};
    const t = `${code} ${message}`;
    const kind = isAuth(t) ? FAIL.AUTH : isGone(t) ? FAIL.GONE : FAIL.BAD;
    return { kind, msg: `[${code}] ${message}` };
  }
  const data = payload?.data;
  if (Array.isArray(data)) return { items: data };
  if (Array.isArray(data?.tweets)) return { items: data.tweets };

  /* Sin payload utilizable: clasificar por stderr y código de salida. */
  if (isAuth(stderr)) return { kind: FAIL.AUTH, msg: stderr };
  if (isGone(stderr)) return { kind: FAIL.GONE, msg: stderr };
  if (res.status !== 0) return { kind: FAIL.BAD, msg: `código ${res.status}\n${stderr}` };
  return { kind: FAIL.BAD, msg: `esquema inesperado (sin data[]; schema_version=${payload?.schema_version ?? 'sin JSON'})` };
}

/* El barrido sí muere: aquí un fallo significa que no hay parte fiable. */
function fetchAccount(handle, creds, cage) {
  const r = runBackend(['user-posts', handle, '--max', String(MAX)], creds, cage);
  if (r.items) return r.items;
  if (r.kind === FAIL.AUTH) die(2, `✗ X: credenciales ausentes o caducadas — barrido NO realizado\n  ${r.msg}`);
  if (r.kind === FAIL.GONE) die(5, `✗ X: capacidad upstream desaparecida en 'user-posts @${handle}' — autenticado, pero el endpoint ya no responde\n  ${r.msg}\n  El barrido de X queda SIN HACER: no confundir con "sin novedades".`);
  die(3, `✗ X: fallo del backend en 'user-posts @${handle}'\n  ${r.msg}`);
}

/* Sonda: hoy se espera que falle. Solo informa; nunca tumba el ciclo. */
function probeSearch(creds, cage) {
  const q = QUERIES[0];
  if (!q) return null;
  const r = runBackend(['search', q, '-t', 'Latest', '--max', '1'], creds, cage);
  if (r.items) return { revived: true, n: r.items.length };
  return { revived: false, kind: r.kind, msg: r.msg };
}

/* ---------- validación: cada invariante del proyecto, como assert ----------
   El backend NO emite permalink; sí emite id y author.screenName, y el enlace
   canónico se construye con ambos. Por eso los obligatorios son esos dos: sin
   ellos no hay "URL concreta al tuit" y el item no sirve para el tier system. */
const pick = (o, ...keys) => keys.map(k => k.split('.').reduce((a, p) => a?.[p], o)).find(v => v != null && v !== '');

function validate(raw, now) {
  /* Un retuit no es declaración propia de la cuenta oficial, y `author` apunta
     al autor original: atribuirlo al perfil oficial falsearía la fuente. */
  if (EXCLUDE_RT && raw?.isRetweet === true) return { drop: 'retuit' };

  const id = pick(raw, 'id', 'id_str', 'rest_id');
  const author = pick(raw, 'author.screenName', 'author.screen_name', 'screenName', 'screen_name', 'username');
  const text = pick(raw, 'text', 'full_text', 'content');
  const rawTime = pick(raw, 'createdAtISO', 'createdAt', 'created_at');

  if (!id || !/^\d+$/.test(String(id))) return { drop: 'sin id de tuit' };
  if (!author) return { drop: 'sin autor' };
  if (!text) return { drop: 'sin texto' };
  if (!rawTime) return { drop: 'sin timestamp' };

  const t = new Date(rawTime);
  if (Number.isNaN(t.getTime())) return { drop: 'timestamp ilegible' };
  if (t.getTime() > now + 120000) return { drop: `timestamp FUTURO (${t.toISOString()})` };

  const handle = String(author).replace(/^@/, '');
  return {
    ok: {
      url: `https://x.com/${handle}/status/${id}`,
      author: handle,
      text: String(text).replace(/\s+/g, ' ').trim(),
      publishedAt: t.toISOString(),
    },
  };
}

/* ---------- ciclo ---------- */
let cage = null;
let items = [];
const dropped = [];

/* Modo real: desde la hora actual. Modo --dry: desde el ancla del fixture, para
   que las comprobaciones de ventana y de futuro no caduquen con el calendario. */
let now = Date.now();

let probe = null;

if (DRY) {
  const fx = JSON.parse(readFileSync(new URL('fixtures/x-user-posts.json', import.meta.url), 'utf8'));
  items = fx.items;
  now = new Date(fx._anchorNow).getTime();
  console.error(`· --dry: fixture x-user-posts.json · ancla ${fx._anchorNow} (${items.length} items crudos, sin red ni escritura)`);
} else {
  if (!ACCOUNTS.length) die(3, '✗ X: no hay cuentas configuradas (incident.config.json → x.accounts)');
  const creds = readCreds();
  if (!creds) die(2, `✗ X: sin credenciales en ${CRED_FILE} — barrido NO realizado\n  (fichero con TWITTER_AUTH_TOKEN y TWITTER_CT0; cuenta secundaria de solo lectura)`);
  cage = makeCage();
  try {
    for (const h of ACCOUNTS) items.push(...fetchAccount(h, creds, cage));
    /* 0 resultados puede ser "no hay novedad" o "la sesión devuelve vacío". Las
       cuentas de control publican a diario: si ella también viene vacía, no es
       silencio informativo, es el barrido roto. */
    if (!items.length && CONTROL_ACCOUNT && fetchAccount(CONTROL_ACCOUNT, creds, cage).length === 0) {
      die(2, `✗ X: la cuenta de control (@${CONTROL_ACCOUNT}) tampoco devuelve nada — se asume sesión muerta, barrido NO realizado`);
    }
    if (PROBE) probe = probeSearch(creds, cage);
  } finally {
    rmSync(cage, { recursive: true, force: true });
  }
}

const cutoff = now - WINDOW_H * 3600e3;
const fresh = [];
const dedup = new Set();
for (const raw of items) {
  const v = validate(raw, now);
  if (v.drop) { dropped.push(v.drop); continue; }
  const k = v.ok.url;
  if (dedup.has(k) || seen.has(k)) continue;
  if (new Date(v.ok.publishedAt).getTime() < cutoff) continue;
  dedup.add(k);
  fresh.push(v.ok);
}
fresh.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

if (!DRY) {
  for (const it of fresh) seen.add(it.url);
  writeFileSync(SEEN_PATH, JSON.stringify([...seen].slice(-800), null, 1));
  writeFileSync(new URL('latest.json', DIR), JSON.stringify({ fetchedAt: new Date().toISOString(), items: fresh }, null, 1));
}

if (dropped.length) {
  const tally = dropped.reduce((a, d) => (a[d.replace(/\(.*\)/, '').trim()] = (a[d.replace(/\(.*\)/, '').trim()] ?? 0) + 1, a), {});
  console.error(`⚠ descartados ${dropped.length}: ${Object.entries(tally).map(([k, n]) => `${k} ×${n}`).join(', ')}`);
}

/* La cobertura perdida se declara SIEMPRE: un barrido de perfiles vacío no
   significa que no pase nada en la calle, solo que las cuentas oficiales callan. */
console.log(`· X vía perfiles oficiales (${ACCOUNTS.map(h => '@' + h).join(', ') || '—'}). SIN capa ciudadana: el hashtag no es consultable, así que prensa local, vecinos y cortes de carretera NO están cubiertos aquí.`);
if (probe?.revived) {
  console.log(`🎉 X: 'search' VUELVE A RESPONDER (sonda '${QUERIES[0]}' → ${probe.n} resultado/s). Se puede recuperar la búsqueda por hashtag: ver x.queries en incident.config.json.`);
} else if (probe) {
  console.log(`· sonda de 'search': sigue caída (${probe.kind}) — la cobertura del hashtag continúa sin estar disponible.`);
}

if (!fresh.length) {
  console.log('✓ X: sin tuits nuevos desde el último ciclo (sesión viva)');
} else {
  console.log(`✓ X: ${fresh.length} tuits NUEVOS${DRY ? ' (--dry: nada escrito)' : ' (detalle en data/x/latest.json)'}`);
  for (const it of fresh.slice(0, 20)) {
    const hhmm = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(it.publishedAt));
    console.log(`- ${hhmm} · @${it.author} · ${it.text.slice(0, 110)}${it.text.length > 110 ? '…' : ''}\n  ${it.url}`);
  }
  if (fresh.length > 20) console.log(`  … y ${fresh.length - 20} más en latest.json`);
}
