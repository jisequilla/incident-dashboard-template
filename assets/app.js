/* Carga y refresco de data/incident.json — compartido por index.html y map.html */

const INCIDENT_URL = './data/incident.json';
const POLL_MS = 15 * 60 * 1000;

function timeAgo(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  if (h < 24) return rest ? `hace ${h} h ${rest} min` : `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d ${h % 24} h`;
}

function fmtStamp(iso) {
  const d = new Date(iso);
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${months[d.getMonth()]} · ${hh}:${mm}`;
}

function renderStamp(data) {
  const el = document.getElementById('updatedStamp');
  if (el && data && data.meta) {
    el.textContent = `Última revisión: ${fmtStamp(data.meta.updatedAt)} (CEST) · ${timeAgo(data.meta.updatedAt)}`;
  }
}

/* Arranca la carga inicial + polling. `render(data)` la implementa cada página. */
function startIncident(render) {
  let current = null;
  async function load() {
    try {
      const res = await fetch(`${INCIDENT_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      current = await res.json();
      const err = document.getElementById('loadError');
      if (err) err.style.display = 'none';
      render(current);
      renderStamp(current);
    } catch (e) {
      console.error('No se pudo cargar incident.json:', e);
      const err = document.getElementById('loadError');
      if (err) err.style.display = 'block';
    }
  }
  load();
  setInterval(load, POLL_MS);
  setInterval(() => renderStamp(current), 30 * 1000);
}

/* Estilos de los banners por tono (mismos valores que los artefactos originales) */
const BANNER_TONES = {
  safe:  { bg: 'linear-gradient(100deg,rgba(31,138,91,.1),rgba(201,151,26,.06))',  border: 'var(--safe)',  color: 'var(--safe)' },
  water: { bg: 'linear-gradient(100deg,rgba(42,111,151,.1),rgba(42,111,151,.04))', border: 'var(--water)', color: 'var(--water)' },
  ember: { bg: 'linear-gradient(100deg,rgba(232,83,31,.12),rgba(201,151,26,.06))', border: 'var(--ember)', color: 'var(--ember-deep)' },
  warn:  { bg: '', border: '', color: '' }
};

function bannerHtml(b) {
  const tone = BANNER_TONES[b.tone] || BANNER_TONES.warn;
  const style = tone.bg
    ? ` style="background:${tone.bg};border-color:${tone.border};border-left-color:${tone.border}"`
    : '';
  const tStyle = tone.color ? ` style="color:${tone.color}"` : '';
  return `<div class="banner"${style}><div class="t"${tStyle}>${b.title}</div><p>${b.html}</p></div>`;
}
