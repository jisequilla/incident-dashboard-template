#!/usr/bin/env node
/**
 * Regenera los index.md del Knowledge Bundle OKF (knowledge/incident-okf/).
 *
 * - Cada <dominio>/index.md: listado de conceptos (title — description) leído
 *   del frontmatter, entre los marcadores <!-- okf:index:begin/end -->.
 * - El index.md raíz: una línea por dominio (frase de dominio + nº de conceptos).
 * - La prosa humana fuera de los marcadores se preserva siempre.
 * - Avisa de .md sin frontmatter que no lleven prefijo `_`.
 *
 * Uso: node scripts/gen-index.mjs
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const BUNDLE = join(dirname(fileURLToPath(import.meta.url)), '..', 'knowledge', 'incident-okf');
const BEGIN = '<!-- okf:index:begin -->';
const END = '<!-- okf:index:end -->';

function frontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const fm = {};
  for (const line of text.slice(4, end).split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return fm;
}

function replaceBlock(file, lines) {
  const text = readFileSync(file, 'utf8');
  const from = text.indexOf(BEGIN);
  const to = text.indexOf(END);
  if (from === -1 || to === -1) throw new Error(`${file}: faltan los marcadores okf:index`);
  const block = lines.length ? `${BEGIN}\n${lines.join('\n')}\n${END}` : `${BEGIN}\n${END}`;
  writeFileSync(file, text.slice(0, from) + block + text.slice(to + END.length));
}

function domainPhrase(indexFile) {
  const body = readFileSync(indexFile, 'utf8');
  const line = body.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('<!--') && !l.startsWith('---'));
  return (line || '').trim();
}

const domains = readdirSync(BUNDLE)
  .filter(d => statSync(join(BUNDLE, d)).isDirectory())
  .sort();

const rootLines = [];
for (const domain of domains) {
  const dir = join(BUNDLE, domain);
  const entries = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
    if (f === 'index.md' || f === 'log.md') continue;
    if (f.startsWith('_')) continue;
    const fm = frontmatter(readFileSync(join(dir, f), 'utf8'));
    if (!fm || !fm.type) {
      console.warn(`⚠ ${domain}/${f}: sin frontmatter válido y sin prefijo "_" — ¿concepto malformado?`);
      continue;
    }
    const flags = [
      fm.status && fm.status !== 'vigente' ? fm.status : null,
      fm.personal === 'true' ? 'personal' : null,
    ].filter(Boolean).map(s => ` *(${s})*`).join('');
    entries.push(`- **[${fm.title || basename(f, '.md')}](${f})** — ${fm.description || ''}${flags}`);
  }
  replaceBlock(join(dir, 'index.md'), entries);
  const phrase = domainPhrase(join(dir, 'index.md'));
  rootLines.push(`- **[${domain}/](${domain}/index.md)** (${entries.length}) — ${phrase}`);
  console.log(`✓ ${domain}/index.md — ${entries.length} conceptos`);
}

replaceBlock(join(BUNDLE, 'index.md'), rootLines);
console.log(`✓ index.md raíz — ${domains.length} dominios`);
