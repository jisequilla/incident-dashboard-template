#!/usr/bin/env node
/**
 * PROYECTOR: knowledge/incident-okf/ (+ data/layers.json) → data/incident.json
 *
 * El bundle OKF es la fuente de verdad; incident.json es un ARTEFACTO GENERADO.
 * La identidad del incidente (nombres, hashtag, coordenadas, órdenes de
 * conceptos, textos propios) vive en `incident.config.json`; aquí, en PRES,
 * queda SOLO la presentación genérica del template (colores, vocabularios de
 * etiquetas, estructura de la leyenda).
 *
 * Uso: node scripts/project-dashboard.mjs [--check]
 *   --check: no escribe incident.json; emite data/incident.projected.json.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadBundle, parseSource, mdToHtml, mdToHtmlRich } from './lib/okf.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CFG = JSON.parse(readFileSync(join(ROOT, 'incident.config.json'), 'utf8'));
const bundle = loadBundle(join(ROOT, 'knowledge', 'incident-okf'));
const layers = JSON.parse(readFileSync(join(ROOT, 'data', 'layers.json'), 'utf8'));

/* ── Presentación GENÉRICA del template (sin nada del incidente) ──────── */
const PRES = {
  zoneTag: { evacuado: 'Evacuado', confinado: 'Confinado', foco: 'Foco', precaucion: 'Precaución', seguro: 'Seguro' },
  zoneTone: { seguro: ['s', 'safe'], precaucion: ['w', 'warn'], default: ['e', 'evac'] },
  riskEmoji: '🌬️',
  markerColor: { origin: '#b3350a', affected: '#b3350a', evacuated: '#b3350a', safe: '#1f8a5b', home: '#1f8a5b', authority: '#2a6f97', shelter: '#7a3fb0', hotel: '#0f8a8a' },
  routeColor: '#2a6f97',
  roadColor: { cortada: '#c9971a', reabierta: '#1f8a5b' },
  phaseFillOpacity: 0.25,
  evacZoneFromPhase: 1,
  legendFixed: [
    { color: '#e8531f', label: 'Fases estimadas (aproximado)' },
    { color: '#b3350a', label: 'Zona evacuada' },
    { color: '#c9971a', label: 'Carretera cortada' },
    { color: '#1f8a5b', label: 'Carretera reabierta' },
    { color: '#1f8a5b', label: 'Tu zona / segura' },
    { color: '#2a6f97', label: 'Ruta de evacuación' },
    { color: '#7a3fb0', label: 'Punto de acogida' },
    { color: '#0f8a8a', label: 'Hotel' },
  ],
};
/* ─────────────────────────────────────────────────────────────────────── */

const DAYS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
function deriveLabel(iso) {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function nowMadrid() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(now).replace(' ', 'T');
  const offsetMin = -Math.round((now - new Date(parts + 'Z')) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${parts}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

const get = (domain, slug) => {
  const c = bundle[domain]?.[slug];
  if (!c) throw new Error(`Concepto no encontrado: ${domain}/${slug}`);
  return c;
};
const opt = (domain, slug) => (slug ? bundle[domain]?.[slug] ?? null : null);
const byType = (domain, type) => Object.values(bundle[domain] ?? {}).filter(c => c.type === type && c.status !== 'superseded');
const sources = c => (c.sources ?? []).map(parseSource);
/** Interpola {state.<slug>.<clave>} en etiquetas de config (p. ej. la stat compuesta). */
const interpolate = s => s.replace(/\{(\w+)\.([\w-]+)\.(\w+)\}/g, (_, dom, slug, key) => get(dom, slug)[key]);

/* meta */
const situacion = byType('state', 'status-summary')[0];
const out = {
  meta: {
    updatedAt: nowMadrid(),
    incidentName: CFG.name,
    startedAt: CFG.startedAt,
    liveLabel: CFG.liveLabel,
    kicker: CFG.kicker,
    title: CFG.shortTitle,
    titleSuffix: CFG.titleSuffix,
    dek: CFG.dek,
    hashtag: CFG.hashtag,
    hashtagUrl: CFG.hashtagUrl,
  },
};

/* stats */
out.stats = CFG.orders.stats.map(s => {
  const m = get('state', s.slug);
  return { n: String(m.value), l: interpolate(s.l), cls: s.cls };
});

/* banners */
out.banners = CFG.orders.banners.map(slug => {
  const c = get('state', slug);
  return { tone: c.tone, title: c.title, html: mdToHtml(c.body) };
});

/* timeline */
const events = byType('events', 'event').sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
const latest = events[events.length - 1];
out.timeline = events.map(e => {
  const ev = {
    time: e.timestamp,
    timeLabel: e.time_label ?? deriveLabel(e.timestamp),
    kind: e.kind ?? '',
    title: e.title,
    html: mdToHtml(e.body),
    sources: sources(e),
  };
  if (e.confidence === 'observacion') ev.observation = true;
  if (e === latest) ev.current = true;
  return ev;
});

/* zones */
out.zones = CFG.orders.zones.map(slug => {
  const z = get('state', slug);
  const tone = PRES.zoneTone[z.estado] ?? PRES.zoneTone.default;
  return { tag: z.tag_label ?? PRES.zoneTag[z.estado], tagTone: tone[0], cls: tone[1], html: mdToHtml(z.body) };
});

/* carreteras (tarjetas) */
out.roadClosures = CFG.orders.roads.map(slug => ({ html: mdToHtml(get('state', slug).body) }));

/* ventana meteo + consejo */
const forecast = byType('state', 'forecast')[0];
out.riskWindow = {
  secTitle: CFG.sections.riskWindow.secTitle, secNote: CFG.sections.riskWindow.secNote,
  tone: forecast.tone,
  title: `${PRES.riskEmoji} ${forecast.title}`,
  html: mdToHtml(forecast.body),
};
const consejo = get('state', CFG.orders.advice);
out.advice = { secTitle: CFG.sections.advice.secTitle, secNote: CFG.sections.advice.secNote, tone: consejo.tone, title: consejo.title, html: mdToHtml(consejo.body) };

/* AEMET — plano-máquina (dato crudo junto al forecast curado) */
if (layers.aemet) {
  out.riskWindow.aemet = { municipio: layers.aemet.municipio, resumen: layers.aemet.resumen, fetchedAtUtc: layers.aemet.fetchedAtUtc };
}

/* guía de autoprotección */
if (CFG.orders.guides?.length) {
  out.guideSec = { title: CFG.sections.guides.secTitle, note: CFG.sections.guides.secNote };
  out.guide = CFG.orders.guides.map(slug => {
    const g = get('guides', slug);
    return { title: g.title, html: mdToHtmlRich(g.body), sources: sources(g) };
  });
}

/* directorio */
out.officialAccounts = CFG.orders.accounts.map(slug => {
  const a = get('directory', slug);
  return { name: a.title.replace(/\s*\(X\)$/, ''), url: a.resource, desc: a.description };
});
out.contacts = CFG.orders.contacts.map(slug => {
  const c = get('directory', slug);
  return { label: c.title.replace(/\s*\([^)]*\)$/, ''), number: String(c.number), tel: String(c.tel), desc: c.description };
});
out.officialPages = CFG.orders.pages.map(slug => {
  const p = get('directory', slug);
  return { name: p.title, url: p.resource, desc: p.description };
});

out.footer = CFG.footer;

/* mapa */
const roadPopup = r => `<b>${r.road} ${r.estado.toUpperCase()}</b><br>${r.description}`;
const legend = [];
if (layers.copernicus) {
  legend.push(
    { color: '#7a1200', label: `Área quemada · Copernicus (oficial, ${layers.copernicus.acquiredLabel})` },
    { color: '#ff2d00', label: 'Frentes de fuego · Copernicus (oficial)' },
  );
}
if (layers.firms) {
  legend.push(
    { color: '#ff0000', label: 'Foco de calor < 6 h (FIRMS)' },
    { color: '#ff7a00', label: 'Foco 6–12 h (FIRMS)' },
    { color: '#8a7a6c', label: 'Foco > 12 h (FIRMS)' },
  );
}
legend.push(...PRES.legendFixed);

const route = opt('geo', CFG.orders.route);
const evacZone = opt('geo', CFG.orders.evacZone);
out.map = {
  eyebrow: CFG.map.eyebrow,
  sub: CFG.map.sub,
  noticeHtml: null,
  statusPill: situacion.pill,
  center: CFG.map.center,
  zoom: CFG.map.zoom,
  fitBounds: CFG.map.fitBounds,
  markers: CFG.orders.markers.map(slug => {
    const m = get('geo', slug);
    return { lat: m.lat, lng: m.lng, color: PRES.markerColor[m.marker_type], label: m.title, popup: mdToHtml(m.body) };
  }),
  route: route ? { coords: route.coords, color: PRES.routeColor, popup: `<b>Ruta de evacuación</b><br>${mdToHtml(route.body)}` } : null,
  closures: CFG.orders.roads.map(slug => {
    const r = get('state', slug);
    return { coords: r.coords, color: PRES.roadColor[r.estado], dashArray: CFG.orders.roadDash[slug] ?? null, popup: roadPopup(r) };
  }),
  firePhases: byType('geo', 'fire-phase')
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(p => ({
      circle: { lat: p.circle.lat, lng: p.circle.lng, radiusM: p.circle.radius_m, fillOpacity: PRES.phaseFillOpacity },
      t: p.time_label ?? deriveLabel(p.timestamp),
      ti: p.title.replace(/^Fase \d+ · /, ''),
      d: p.body.replace(/\*\*/g, '').replace(/\n+/g, ' ').trim(),
    })),
  evacZone: evacZone ? { coords: evacZone.coords, fromPhase: PRES.evacZoneFromPhase } : null,
  links: CFG.map.links,
  legend,
  disclaimer: CFG.map.disclaimer,
  copernicus: layers.copernicus,
  firms: layers.firms,
};

/* salida */
const json = JSON.stringify(out, null, 2) + '\n';
if (process.argv.includes('--check')) {
  writeFileSync(join(ROOT, 'data', 'incident.projected.json'), json);
  console.log('✓ proyección escrita en data/incident.projected.json (modo --check, incident.json intacto)');
} else {
  writeFileSync(join(ROOT, 'data', 'incident.json'), json);
  console.log(`✓ data/incident.json proyectado desde el bundle (${out.timeline.length} eventos, ${out.zones.length} zonas, ${out.map.markers.length} marcadores)`);
}
