#!/usr/bin/env node
/**
 * fetch-news.mjs — ingesta determinista de prensa vía RSS.
 *
 * Fuentes: Google News RSS (por consulta) + feeds nativos de medios locales,
 * definidos en incident.config.json (bloque "news"). Emite por stdout SOLO los
 * items no vistos en ciclos anteriores (dedupe en data/news/seen.json) y deja
 * el detalle en data/news/latest.json. Ambos ficheros son plano-máquina
 * efímero (gitignored): alimentan el parte de /gather-updates, no el panel.
 *
 * Nunca rompe el ciclo: cualquier feed caído se anota y se sigue.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const CFG = JSON.parse(readFileSync(new URL('../incident.config.json', import.meta.url), 'utf8'));
const NEWS = CFG.news ?? {
  googleQueries: [CFG.name ?? 'emergencia'],
  feeds: [],
  matchTerms: [],
  windowHours: 36,
};

const DIR = new URL('../data/news/', import.meta.url);
mkdirSync(DIR, { recursive: true });
const SEEN_PATH = new URL('seen.json', DIR);
const seen = existsSync(SEEN_PATH) ? new Set(JSON.parse(readFileSync(SEEN_PATH, 'utf8'))) : new Set();

const decode = s => s
  .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();

function parseRss(xml, fallbackSource) {
  const items = [];
  for (const m of xml.matchAll(/<item>(.*?)<\/item>/gs)) {
    const block = m[1];
    const pick = tag => decode((block.match(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 's')) ?? [, ''])[1]);
    const title = pick('title');
    if (!title) continue;
    items.push({
      title,
      link: pick('link'),
      source: pick('source') || fallbackSource,
      publishedAt: new Date(pick('pubDate') || 0).toISOString(),
    });
  }
  return items;
}

const key = it => `${it.source}::${it.title}`.toLowerCase().replace(/\s+/g, ' ');

async function fetchFeed(url, label) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'incident-dashboard/1.0 (rss watcher)' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseRss(await res.text(), label);
  } catch (e) {
    console.error(`⚠ feed caído (${label}): ${e.message} — se sigue`);
    return [];
  }
}

const cutoff = Date.now() - (NEWS.windowHours ?? 36) * 3600e3;

/* Google News RSS sirve como máximo 100 items por consulta y no lo dice: al
   volumen de un incendio grande, una consulta ancha se come el techo en un día
   y el barrido pierde titulares creyendo que los tiene todos. Medido el 30-jul
   sobre el #IFSierraOeste (Madrid): 91 titulares en 24 h contra el tope de 100,
   frente a 22 de Los Gallardos. Si el más antiguo devuelto cae DENTRO de la
   ventana, hay recorte silencioso: la consulta hay que estrechar. */
const RSS_CAP = 100;
const capWarnings = [];

const collected = [];
for (const q of NEWS.googleQueries ?? []) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es&gl=ES&ceid=ES:es`;
  const items = await fetchFeed(url, `GoogleNews:"${q}"`);
  if (items.length >= RSS_CAP) {
    const oldest = Math.min(...items.map(i => new Date(i.publishedAt).getTime()).filter(Number.isFinite));
    const horas = h => (h / 3600e3).toFixed(0);
    capWarnings.push(oldest > cutoff
      ? `✗ "${q}": ${items.length} items = TECHO, y el más antiguo es de hace ${horas(Date.now() - oldest)} h, DENTRO de la ventana de ${NEWS.windowHours ?? 36} h → HAY TITULARES QUE NO SE HAN VISTO. Estrechar la consulta (por municipio, por término) antes de fiarse de este ciclo.`
      : `⚠ "${q}": ${items.length} items = techo alcanzado; cubre hacia atrás ${horas(Date.now() - oldest)} h, aún por encima de la ventana. Sin pérdida hoy, pero al borde: estrechar la consulta antes de que muerda.`);
  }
  collected.push(...items);
}
for (const f of NEWS.feeds ?? []) {
  let items = await fetchFeed(f.url, f.name);
  const terms = (NEWS.matchTerms ?? []).map(t => t.toLowerCase());
  if (terms.length) items = items.filter(it => terms.some(t => it.title.toLowerCase().includes(t)));
  collected.push(...items);
}

const fresh = [];
const dedup = new Set();
for (const it of collected) {
  const k = key(it);
  if (dedup.has(k) || seen.has(k)) continue;
  if (new Date(it.publishedAt).getTime() < cutoff) continue;
  dedup.add(k);
  fresh.push(it);
}
fresh.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

for (const it of fresh) seen.add(key(it));
writeFileSync(SEEN_PATH, JSON.stringify([...seen].slice(-800), null, 1));
writeFileSync(new URL('latest.json', DIR), JSON.stringify({ fetchedAt: new Date().toISOString(), items: fresh }, null, 1));

/* Antes del recuento: si una consulta tocó techo, el "sin titulares nuevos" o el
   "N nuevos" de abajo son un subconjunto, no el total. Se dice primero. */
for (const w of capWarnings) console.error(w);

if (!fresh.length) {
  console.log(`✓ RSS: sin titulares nuevos desde el último ciclo${capWarnings.length ? ' (OJO: alguna consulta tocó techo — ver avisos)' : ''}`);
} else {
  console.log(`✓ RSS: ${fresh.length} titulares NUEVOS (detalle en data/news/latest.json)`);
  for (const it of fresh.slice(0, 20)) {
    const hhmm = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(it.publishedAt));
    console.log(`- ${hhmm} · ${it.source} · ${it.title}`);
  }
  if (fresh.length > 20) console.log(`  … y ${fresh.length - 20} más en latest.json`);
}
