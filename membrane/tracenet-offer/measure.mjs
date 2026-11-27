#!/usr/bin/env node
// measure.mjs · THE OFFERING ROAD: one agent measured with and without a card, on this house. The state of the art promises cost, not accuracy (EET, REM,
// plan caching: a matched card cuts 17 to 50 % of a reader's cost at equal success; one the agent chose itself can do worse than none), and nobody has
// published a measurement of a trace sold to another agent: so the tracenet measures its own, on its own house, before it promises anything.
// THE PAIR: the card's fix is put back as it stood before it (its files as the transcript held them before the first edit; git's tree at the first commit
// after the fix for everything else; the check must pass with the fix and fail without it, or the card is not measured). Then the same agent, model and
// task ("this check fails; make it pass"), once without the card and once with it in the prompt, each in its own copy of the tree, one run at a time, the
// order alternating pair by pair. A run's cost, tokens, turns and time are Claude Code's own (--output-format json); its success is the check run after
// it by this tool, every test it ran with the fix passing. The noise floor is the spread of the pairs.
//   node tools/embertide-mesh/tracenet-offer/measure.mjs --offer <offer folder> [--card <id>] [--repo <a checkout of the house>] [--pairs 3] [--model haiku] [--timeout 900]
// The agent: claude -p with the named model, no session kept (the run never joins his traces), the copy's settings only (no hook, no plugin), no MCP
// server, its tools Read, Edit, Write, Glob, Grep and Bash for the check alone, the copy's folder only, non-essential traffic off. The copy: the commit's
// tree by git archive (the folders the check and the fix live in; the whole tree if those do not pass), every CLAUDE.md and AGENTS.md taken out (the same for
// both arms); each arm an APFS clone of it (cp -c), removed after.
// COST: per run one Claude Code session of the named model and one run of the check; the tree written once; nothing left running (each run is its own
// process group, killed whole at its time limit).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { spanLines } from './span.mjs';
import { HOURS_DIR } from './offer.mjs';
import { eventsOf, fixesOf, verdictOf, countsOf, textOf } from './fixes.mjs';

export const MEASURE_SCHEMA = 'embertide.tracenet-measure/v1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const git = (repo, args, opts = {}) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 256 << 20, ...opts });

/** applied(original, edits): the file after the fix's edits, in order (null when an edit does not apply exactly once, as the Edit tool itself demands) */
export function applied(original, edits) {
  let t = original;
  for (const e of edits) {
    if (e.write) { t = e.new; continue; }
    if (t == null || e.old == null) return null;
    if (e.all) { if (!t.includes(e.old)) return null; t = t.split(e.old).join(e.new); continue; }
    const i = t.indexOf(e.old); if (i < 0 || t.indexOf(e.old, i + 1) >= 0) return null; t = t.slice(0, i) + e.new + t.slice(i + e.old.length);
  }
  return t;
}
/** reversed(after, edits): the file before the fix, from the file after it (the commit's), the edits undone last first; null when one does not undo
 *  exactly once (a later change touched it), or a file written whole whose first state the transcript does not hold */
export function reversed(after, edits) {
  let t = after;
  for (const e of [...edits].reverse()) {
    if (e.write) { if (typeof e.original !== 'string') return null; t = e.original; continue; }
    if (t == null || !e.new) return null;
    if (e.all) { if (!t.includes(e.new)) return null; t = t.split(e.new).join(e.old); continue; }
    const i = t.indexOf(e.new); if (i < 0 || t.indexOf(e.new, i + 1) >= 0) return null; t = t.slice(0, i) + e.old + t.slice(i + e.new.length);
  }
  return t;
}
/** the prompt each arm reads; the card only in the second */
export function promptOf({ check, sig, card = null }) {
  const task = `In this repository, this check fails:\n\n    ${check}\n\nIt says: ${sig}\n\nMake it pass. Keep every test it runs passing; do not delete, skip or weaken a test. Run the check yourself to confirm, then stop.`;
  return card ? `${task}\n\nA developer solved this problem before. Their trace, a card from their tracenet:\n\n${card}` : task;
}
/** a path's place in the repo at a commit: the longest tail of it git knows there */
function relIn(repo, sha, abs) { const p = abs.split('/').filter(Boolean); for (let k = 0; k < p.length; k++) { const rel = p.slice(k).join('/'); if (git(repo, ['cat-file', '-e', `${sha}:${rel}`]).status === 0) return rel; } return null; }
function transcriptOf(root, session) {
  const want = `${session}.jsonl`;
  function walk(dir, depth) { let names = []; try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of names) { const f = path.join(dir, e.name); if (e.isFile() && e.name === want) return f; if (e.isDirectory() && depth < 3) { const r = walk(f, depth + 1); if (r) return r; } } return null; }
  return walk(root, 0);
}
function runCheck(dir, core, timeout = 300000) {
  const r = spawnSync('/bin/sh', ['-c', core], { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20, timeout, env: { ...process.env, NODE_OPTIONS: '' } });
  const text = `${r.stdout || ''}\n${r.stderr || ''}`, err = r.status !== 0;
  return { verdict: verdictOf(text, err) || (err ? 'fail' : null), counts: countsOf(text), status: r.status };
}
function runAgent({ cwd, root, prompt, model, timeout, prefix }) {
  return new Promise((resolve) => {
    const t0 = Date.now(), args = ['-p', prompt, '--model', model, '--output-format', 'json', '--no-session-persistence', '--setting-sources', 'local', '--strict-mcp-config',
      '--add-dir', root, '--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep', `Bash(${prefix}:*)`];
    const child = spawn('claude', args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } });
    let out = '', errText = '', timedOut = false;
    child.stdout.on('data', (b) => { out += b; }); child.stderr.on('data', (b) => { errText += b; });
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, timeout);
    child.on('close', (code) => { clearTimeout(timer); try { process.kill(-child.pid, 'SIGKILL'); } catch {} let json = null; try { json = JSON.parse(out.trim().split('\n').pop()); } catch {}
      resolve({ code, json, timedOut, wall_ms: Date.now() - t0, stderr: errText.slice(-400) }); });
  });
}

/** prepare(offerDir, card, {root, repo, work}): the card's fix found again in its transcript with the files it began from, the tree at the commit after it,
 *  the copy built and checked (the check passes with the fix and fails without) -> { before (the copy's folder), dir, core, expected, sig } or { skip: why } */
export async function prepare(card, { root, repo, work, hoursDir = HOURS_DIR }) {
  const core = card.verify.check.replace(/^cd \S+ && /, '');
  if (!/^node (?:--[\w-]+(?:=(?:"[^"]*"|[^\s"$]+))? )*--test(?: --[\w-]+(?:=(?:"[^"]*"|[^\s"$]+))?)*(?: [\w./@-]+)+$/.test(core)) return { skip: `the check is not node --test over named files: ${core.slice(0, 80)}` };
  const file = transcriptOf(root, card.source.session); if (!file) return { skip: 'its transcript is not on this Mac' };
  const s = await spanLines(file, card.source.from_ms - 1000, card.source.to_ms + 3 * 3600000, { dir: hoursDir }), ev = eventsOf(s.lines, { originals: true });
  const fix = fixesOf(ev).find((f) => f.fail.uuid === card.source.from && f.pass.ruuid === card.source.to); if (!fix) return { skip: 'the fix is not found again in its transcript' };
  if (fix.edits.some((e) => e.shell)) return { skip: 'a shell wrote part of the fix' };
  const files = new Map(); for (const e of fix.edits) { if (!files.has(e.file)) files.set(e.file, { edits: [] }); files.get(e.file).edits.push(e); }
  let commits = ev.filter((e) => e.kind === 'commit' && e.sha && e.ri > fix.pass.ri).map((e) => git(repo, ['rev-parse', '--verify', '--quiet', `${e.sha}^{commit}`]).stdout.trim()).filter(Boolean);
  if (!commits.length) {   // a commit the transcript does not name (git commit -q): the house's commits in the three hours after the pass that touch the fix's files
    const t = Math.round(fix.pass.at / 1000), specs = [...files.keys()].map((f) => `:(glob)**/${path.basename(f)}`);
    commits = git(repo, ['log', '--all', '--reverse', '--format=%H', `--since=@${t}`, `--until=@${t + 3 * 3600}`, '--', ...specs]).stdout.split('\n').filter(Boolean);
  }
  if (!commits.length) return { skip: 'no commit after the fix' };
  let sha = null, rels = null, why = 'no commit after the fix holds it';   // the first commit after the fix whose files undo to their state before it
  for (const c of [...new Set(commits)].slice(0, 3)) {
    const r = new Map(); let ok = true;
    for (const [f, x] of files) { const rel = relIn(repo, c, f); if (!rel) { ok = false; why = `${path.basename(f)} is not in ${c.slice(0, 9)}`; break; }
      const show = git(repo, ['show', `${c}:${rel}`]); x.after = show.status === 0 ? show.stdout : null; x.original = reversed(x.after, x.edits);
      if (x.original == null) { const first = x.edits[0]; if (typeof first.original === 'string' && applied(first.original, x.edits) === x.after) x.original = first.original; }
      if (x.original == null) { ok = false; why = `the fix does not undo in ${path.basename(f)} at ${c.slice(0, 9)}`; break; } r.set(f, rel); }
    if (ok) { sha = c; rels = r; break; }
  }
  if (!sha) return { skip: why };
  const [f0, r0] = [...rels][0], top = f0.slice(0, f0.length - r0.length), dir = path.posix.relative(top.replace(/\/$/, ''), fix.check.dir) || '.';
  if (dir.startsWith('..')) return { skip: 'the check runs outside the repository' };
  const tops = [...new Set([dir, ...rels.values()].map((p) => p.split('/')[0]).filter((p) => p && p !== '.'))];
  for (const scope of [tops, null]) {
    const tree = path.join(work, scope ? 'tree' : 'tree-whole'); fs.rmSync(tree, { recursive: true, force: true }); fs.mkdirSync(tree, { recursive: true });
    const a = spawnSync('/bin/sh', ['-c', `git -C "$1" archive --format=tar "$2" -- ${scope ? scope.map((_, i) => `"$${i + 3}"`).join(' ') : ''} | tar -x -C "$0"`, tree, repo, sha, ...(scope || [])], { encoding: 'utf8', maxBuffer: 64 << 20 });
    if (a.status !== 0) return { skip: `git archive: ${(a.stderr || '').slice(0, 160)}` };
    spawnSync('/bin/sh', ['-c', 'find "$0" \\( -name CLAUDE.md -o -name AGENTS.md \\) -delete; find "$0" -type d -name .claude -prune -exec rm -rf {} +', tree]);
    for (const [f, x] of files) { const p = path.join(tree, rels.get(f)); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, x.after); }
    const withFix = runCheck(path.join(tree, dir), core);
    if (withFix.verdict !== 'pass' || (withFix.counts && withFix.counts.fail)) { if (scope) continue; return { skip: `the check does not pass with the fix at ${sha.slice(0, 9)}` }; }
    for (const [f, x] of files) { const p = path.join(tree, rels.get(f)); if (x.original == null) fs.rmSync(p, { force: true }); else fs.writeFileSync(p, x.original); }
    const without = runCheck(path.join(tree, dir), core);
    if (without.verdict !== 'fail') return { skip: 'the check does not fail without the fix' };
    return { before: tree, dir, core, sha, expected: withFix.counts, sig: fix.fail.sig, files: [...rels.values()] };
  }
  return { skip: 'no copy of the tree passes with the fix' };
}

export async function measure({ offerDir, cardId = null, root = path.join(os.homedir(), '.claude', 'projects'), repo, pairs = 3, model = 'haiku', timeout = 900000, work, say = () => {} }) {
  const offer = JSON.parse(fs.readFileSync(path.join(offerDir, 'offer.json'), 'utf8')), ids = cardId ? [cardId] : offer.cards.map((c) => c.id), skipped = [];
  for (const id of ids) {
    const card = JSON.parse(fs.readFileSync(path.join(offerDir, 'cards', `${id}.json`), 'utf8')), md = fs.readFileSync(path.join(offerDir, 'cards', `${id}.md`), 'utf8');
    const p = await prepare(card, { root, repo, work }); if (p.skip) { skipped.push({ id, why: p.skip }); say(`${id}: skipped, ${p.skip}`); continue; }
    say(`${id}: measured on ${p.sha.slice(0, 9)}, ${p.files.join(', ')}; the check ${p.core} (with the fix: pass ${p.expected ? p.expected.pass : '?'})`);
    const rows = [], prefix = p.core.split(' ').slice(0, 2).join(' ');
    for (let k = 0; k < pairs; k++) for (const arm of k % 2 ? ['with', 'without'] : ['without', 'with']) {
      const copy = path.join(work, `run-${k}-${arm}`); fs.rmSync(copy, { recursive: true, force: true });
      const c = spawnSync('cp', ['-cR', p.before, copy]); if (c.status !== 0) spawnSync('cp', ['-R', p.before, copy]);
      const r = await runAgent({ cwd: path.join(copy, p.dir), root: copy, prompt: promptOf({ check: p.core, sig: p.sig, card: arm === 'with' ? md : null }), model, timeout, prefix });
      const after = runCheck(path.join(copy, p.dir), p.core), j = r.json || {}, u = j.usage || {};
      const ok = after.verdict === 'pass' && (!after.counts || (after.counts.fail === 0 && (!p.expected || after.counts.tests >= p.expected.tests)));
      const row = { pair: k, arm, ok, timed_out: r.timedOut, cost_usd: j.total_cost_usd ?? null, turns: j.num_turns ?? null, agent_ms: j.duration_ms ?? null, wall_ms: r.wall_ms,
        input: u.input_tokens ?? null, output: u.output_tokens ?? null, cache_read: u.cache_read_input_tokens ?? null, cache_write: u.cache_creation_input_tokens ?? null,
        check: after.counts ? `pass ${after.counts.pass} of ${after.counts.tests}` : after.verdict, model: Object.keys(j.modelUsage || {}).join(',') || null, error: j.is_error ? textOf(j.result).slice(0, 200) : r.json ? null : r.stderr };
      rows.push(row); fs.rmSync(copy, { recursive: true, force: true });
      say(`pair ${k} ${arm}: ${ok ? 'solved' : 'not solved'}, $${row.cost_usd ?? '?'}, ${row.turns ?? '?'} turns, ${Math.round(row.wall_ms / 1000)} s`);
    }
    const arm = (a) => { const r = rows.filter((x) => x.arm === a), m = (k) => { const v = r.map((x) => x[k]).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
      const tok = r.map((x) => (x.input || 0) + (x.output || 0) + (x.cache_read || 0) + (x.cache_write || 0)); return { runs: r.length, solved: r.filter((x) => x.ok).length, cost_usd: m('cost_usd'), turns: m('turns'), wall_ms: m('wall_ms'), tokens: tok.length ? tok.reduce((s, x) => s + x, 0) / tok.length : null,
        cost_spread: r.length ? [Math.min(...r.map((x) => x.cost_usd ?? Infinity)), Math.max(...r.map((x) => x.cost_usd ?? -Infinity))] : null }; };
    const a = arm('without'), b = arm('with'), saved = (k) => (a[k] && b[k] != null ? 1 - b[k] / a[k] : null);
    const result = { schema: MEASURE_SCHEMA, offer: offer.id, card: id, commit: p.sha, check: p.core, files: p.files, model, pairs, without: a, with: b,
      saved: { cost: saved('cost_usd'), tokens: saved('tokens'), turns: saved('turns'), wall: saved('wall_ms') }, rows, skipped, at: new Date().toISOString() };
    fs.writeFileSync(path.join(offerDir, `measure-${id}.json`), JSON.stringify(result, null, 1) + '\n', { mode: 0o600 });
    return result;
  }
  return { schema: MEASURE_SCHEMA, offer: offer.id, card: null, skipped, at: new Date().toISOString() };
}

function flagsOf(argv) { const f = { _: [] }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); f[k] = v !== undefined ? v : argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; } else f._.push(a); } return f; }
const isMain = (() => { try { return fs.realpathSync(process.argv[1] || '') === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const f = flagsOf(process.argv.slice(2));
  try {
    if (typeof f.offer !== 'string') throw new Error('measure.mjs --offer <offer folder> [--card <id>] [--repo <checkout>] [--pairs 3] [--model haiku] [--timeout 900]');
    const repo = typeof f.repo === 'string' ? f.repo : git(HERE, ['rev-parse', '--show-toplevel']).stdout.trim(), work = fs.mkdtempSync(path.join(os.tmpdir(), 'tracenet-measure-'));
    try {
      const r = await measure({ offerDir: f.offer, cardId: typeof f.card === 'string' ? f.card : null, repo, pairs: Number(f.pairs) || 3, model: typeof f.model === 'string' ? f.model : 'haiku',
        timeout: (Number(f.timeout) || 900) * 1000, work, root: typeof f.root === 'string' ? f.root : undefined, say: (x) => console.log(x) });
      if (!r.card) { console.log(`no card of ${r.offer} could be measured`); process.exit(1); }
      const pct = (x) => (x == null ? '?' : `${(x * 100).toFixed(1)} %`), usd = (x) => (x == null ? '?' : `$${x.toFixed(4)}`);
      console.log(`without the card: ${r.without.solved} of ${r.without.runs} solved, ${usd(r.without.cost_usd)}, ${Math.round(r.without.tokens || 0)} tokens, ${r.without.turns?.toFixed(1)} turns, ${Math.round((r.without.wall_ms || 0) / 1000)} s a run`);
      console.log(`with the card:    ${r.with.solved} of ${r.with.runs} solved, ${usd(r.with.cost_usd)}, ${Math.round(r.with.tokens || 0)} tokens, ${r.with.turns?.toFixed(1)} turns, ${Math.round((r.with.wall_ms || 0) / 1000)} s a run`);
      console.log(`saved by the card: cost ${pct(r.saved.cost)}, tokens ${pct(r.saved.tokens)}, turns ${pct(r.saved.turns)}, time ${pct(r.saved.wall)}`);
    } finally { fs.rmSync(work, { recursive: true, force: true }); }
  } catch (e) { console.error(`measure: ${e.message}`); process.exit(1); }
}
