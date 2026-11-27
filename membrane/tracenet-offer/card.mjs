// card.mjs · THE OFFERING ROAD: one solved fix -> its card, and its raw turns behind it. The card is the unit the state of the art ranks first (REM, Oct
// 2026: typed cards matched at 66.7-68.7 % against raw trajectories' 22.2 %; about 270 tokens: where, why, the fix, the check); the raw turns ride behind it
// as the evidence a reader opens only when it struggles (the offering-traces hypertrace, dimensions 1 and 6).
//   cardOf(fix, {session, project}) -> { schema, id, title, when, localize, understand, fix, verify, tried, source, md }   pure
//   mdOf(card)                      -> the card as a reader reads it
//   rawOf(lines, fix, {hisWords})   -> the turns from the failure to the pass, one slim object each (a JSON line once gated): what was said and done, never the model's thinking;
//                                      a typed message (his, or a seat's to this one) is withheld unless hisWords says otherwise (his hand)
import { createHash } from 'node:crypto';
import path from 'node:path';
import { clip, textOf } from './fixes.mjs';

export const CARD_SCHEMA = 'embertide.trace-card/v1';
export const RAW_SCHEMA = 'embertide.trace-raw/v1';
export const TYPED = '[withheld: a typed message]';
const LANGS = { mjs: 'JavaScript', js: 'JavaScript', cjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', py: 'Python', rs: 'Rust', swift: 'Swift', go: 'Go', kt: 'Kotlin',
  java: 'Java', html: 'HTML', css: 'CSS', json: 'JSON', sh: 'shell', c: 'C', h: 'C', m: 'Objective-C', wgsl: 'WGSL', sql: 'SQL' };
export const langOf = (f) => LANGS[String(f || '').split('.').pop().toLowerCase()] || null;
const home = (p) => String(p).replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, '~');
/** the deepest folder holding the check's folder and every file it edited: the card's paths are read from there */
function baseOf(dirs) { const parts = dirs.filter(Boolean).map((p) => p.split('/')); if (!parts.length) return ''; let n = 0; while (n < parts[0].length && parts.every((p) => p[n] === parts[0][n])) n++; return parts[0].slice(0, n).join('/') || '/'; }

export function cardOf(fix, { session = null, project = null } = {}) {
  const base = baseOf([fix.check.dir, ...fix.files.map((f) => path.posix.dirname(f))]), rel = (f) => home(base && base !== '/' ? path.posix.relative(base, f) || '.' : f);
  const where = rel(fix.check.dir || base), core = clip(fix.check.core, 240), check = where && where !== '.' ? `cd ${where} && ${core}` : core;
  const hunks = fix.edits.filter((e) => !e.shell).slice(-4).map((e) => (e.write ? { file: rel(e.file), wrote: clip(e.new, 160) } : { file: rel(e.file), old: clip(e.old, 140), new: clip(e.new, 200) }));
  const shells = fix.edits.filter((e) => e.shell).slice(-2).map((e) => ({ file: rel(e.file), shell: clip(e.shell, 160) }));
  const id = createHash('sha256').update(`${session}\n${fix.fail.uuid}\n${fix.pass.ruuid}`).digest('hex').slice(0, 16);
  const card = { schema: CARD_SCHEMA, id, title: clip(fix.fail.sig, 120),
    when: { langs: [...new Set(fix.files.map(langOf).filter(Boolean))], check, error: clip(fix.fail.sig, 240) },
    localize: fix.files.map(rel), understand: clip(fix.words.join(' '), 480), fix: [...hunks, ...shells].slice(0, 5),
    verify: { check, said: fix.pass.sig, counts: fix.pass.counts || null }, tried: fix.tries.slice(0, 3).map((t) => clip(t.sig, 160)),
    source: { session, project, from: fix.fail.uuid, to: fix.pass.ruuid, from_ms: fix.fail.at, to_ms: fix.pass.at, lines: [fix.fail.i, fix.pass.ri], edits: fix.edits.length } };
  card.md = mdOf(card);
  return card;
}

export function mdOf(c) {
  const code = (s) => '`' + String(s).replace(/`/g, "'") + '`';
  const out = [`### ${c.title}`, `- **When:** ${c.when.langs.join(', ') || 'code'}; ${code(c.when.check)} fails with: ${c.when.error}`, `- **Where:** ${c.localize.map(code).join(', ')}`];
  if (c.understand) out.push(`- **Why:** ${c.understand}`);
  for (const f of c.fix) out.push(f.shell ? `- **Fix:** in ${code(f.file)}, by ${code(f.shell)}` : f.wrote != null ? `- **Fix:** ${code(f.file)} written whole, beginning ${code(f.wrote)}` : `- **Fix:** in ${code(f.file)}, ${code(f.old)} → ${code(f.new)}`);
  out.push(`- **Check:** ${code(c.verify.check)} → ${c.verify.said}`);
  if (c.tried.length) out.push(`- **Tried first, and it failed:** ${c.tried.join('; ')}`);
  return out.join('\n') + '\n';
}

const cut = (s, n = 4000) => { s = String(s ?? ''); return s.length <= n ? s : `${s.slice(0, Math.round(n * 0.6))}\n[… ${s.length - n} characters …]\n${s.slice(-Math.round(n * 0.4))}`; };
function slim(b, type, hisWords) {
  if (!b || typeof b !== 'object') return null;
  if (b.type === 'text') return type === 'user' && !hisWords ? { type: 'text', text: TYPED } : { type: 'text', text: cut(textOf(b.text)) };
  if (b.type === 'tool_use') { const j = JSON.stringify(b.input ?? {}); return { type: 'tool_use', name: b.name, input: j.length <= 6000 ? b.input ?? {} : { clipped: cut(j, 6000) } }; }
  if (b.type === 'tool_result') return { type: 'tool_result', is_error: !!b.is_error, content: cut(textOf(b.content)) };
  return null;   // thinking, images, documents: never in the raw
}
/** rawOf(lines, fix, {hisWords}): the turns from the failing check to the passing one, slim objects (the first names what they are) */
export function rawOf(lines, fix, { hisWords = false } = {}) {
  const out = [{ schema: RAW_SCHEMA, from: fix.fail.uuid, to: fix.pass.ruuid, typed: hisWords ? 'kept' : 'withheld' }];
  for (let i = fix.fail.i; i <= fix.pass.ri && i < lines.length; i++) {
    const d = lines[i]; if (!d || !d.message || (d.type !== 'user' && d.type !== 'assistant')) continue;
    const c = d.message.content, blocks = typeof c === 'string' ? [{ type: 'text', text: c }] : Array.isArray(c) ? c : [];
    const content = blocks.map((b) => slim(b, d.type, hisWords)).filter(Boolean);
    if (content.length) out.push({ type: d.type, at: d.timestamp, content });
  }
  return out;
}
