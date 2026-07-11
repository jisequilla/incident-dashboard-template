#!/usr/bin/env node
/**
 * AUDITORÍA de coherencia del repo — la parte determinista de /commit.
 *
 * Comprueba:
 *   A. Bundle OKF válido (frontmatter, vocabulario, timestamps no futuros)
 *   B. Índices del bundle frescos (los regenera y avisa si estaban stale)
 *   C. Proyección fresca (incident.json == proyector(bundle+layers), ignorando updatedAt)
 *   D. Docs sin rutas muertas (todo `path/` citado en README/CLAUDE.md existe)
 *
 * Salida 0 = coherente (posibles avisos auto-reparados que hay que commitear).
 * Salida 1 = problemas que requieren intervención.
 */

import { readdirSync, readFileSync, statSync, existsSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'knowledge', 'incident-okf');
const CONF = ['oficial', 'prensa-oficial', 'prensa', 'observacion', 'estimacion', 'pista'];
let errors = 0, warnings = 0;
const err = m => { errors++; console.log('✗', m); };
const warn = m => { warnings++; console.log('⚠', m); };
const ok = m => console.log('✓', m);

/* A — bundle válido */
{
  let total = 0, bad = 0;
  const now = Date.now();
  for (const d of readdirSync(BUNDLE).filter(x => statSync(join(BUNDLE, x)).isDirectory())) {
    for (const f of readdirSync(join(BUNDLE, d)).filter(f => f.endsWith('.md') && f !== 'index.md' && f !== 'log.md' && !f.startsWith('_'))) {
      total++;
      const text = readFileSync(join(BUNDLE, d, f), 'utf8');
      const end = text.indexOf('\n---', 3);
      const fm = {};
      if (text.startsWith('---') && end > 0) {
        for (const line of text.slice(4, end).split('\n')) {
          const m = line.match(/^([\w-]+):\s*(.*)$/);
          if (m) fm[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
      }
      const problems = [];
      for (const k of ['type', 'title', 'description', 'timestamp', 'confidence']) if (!fm[k]) problems.push(`falta ${k}`);
      if (fm.timestamp && new Date(fm.timestamp) > now) problems.push('TIMESTAMP FUTURO');
      if (fm.confidence && !CONF.includes(fm.confidence)) problems.push(`confidence inválida: ${fm.confidence}`);
      if (!text.slice(4, end).includes('sources')) problems.push('sin sources');
      if (problems.length) { bad++; err(`${d}/${f}: ${problems.join(', ')}`); }
    }
  }
  bad ? err(`bundle: ${bad}/${total} conceptos con problemas`) : ok(`bundle: ${total} conceptos válidos`);
}

/* B — índices frescos (regenera; si cambian, estaban stale) */
{
  const before = execSync('git status --porcelain -- knowledge/incident-okf', { cwd: ROOT, encoding: 'utf8' });
  execSync('node scripts/gen-index.mjs', { cwd: ROOT, stdio: 'pipe' });
  const after = execSync('git status --porcelain -- knowledge/incident-okf', { cwd: ROOT, encoding: 'utf8' });
  after !== before
    ? warn('índices del bundle estaban stale — regenerados AHORA (añádelos al commit)')
    : ok('índices del bundle frescos');
}

/* C — proyección fresca */
{
  execSync('node scripts/project-dashboard.mjs --check', { cwd: ROOT, stdio: 'pipe' });
  const cur = JSON.parse(readFileSync(join(ROOT, 'data', 'incident.json'), 'utf8'));
  const proj = JSON.parse(readFileSync(join(ROOT, 'data', 'incident.projected.json'), 'utf8'));
  unlinkSync(join(ROOT, 'data', 'incident.projected.json'));
  cur.meta.updatedAt = proj.meta.updatedAt = 'IGNORADO';
  JSON.stringify(cur) !== JSON.stringify(proj)
    ? err('proyección STALE: data/incident.json no coincide con proyector(bundle+layers) — ejecuta node scripts/project-dashboard.mjs')
    : ok('proyección fresca (incident.json == bundle proyectado)');
}

/* D — rutas citadas en docs existen */
{
  let dead = 0;
  for (const doc of ['README.md', 'CLAUDE.md']) {
    const text = readFileSync(join(ROOT, doc), 'utf8');
    const paths = [...new Set([...text.matchAll(/`((?:scripts|data|knowledge|assets|blog|originals|\.claude|\.github)\/[^`\s*]*)`?/g)].map(m => m[1].replace(/[`.,;)]+$/, '')))];
    for (const p of paths) {
      if (!existsSync(join(ROOT, p))) { dead++; err(`${doc} cita ruta inexistente: ${p}`); }
    }
  }
  dead ? null : ok('docs: todas las rutas citadas existen');
}

console.log(errors ? `\nAUDITORÍA: ${errors} errores, ${warnings} avisos` : `\nAUDITORÍA OK (${warnings} avisos auto-reparados)`);
process.exit(errors ? 1 : 0);
