// fixes.mjs · THE OFFERING ROAD (Oct 30 2026): the solved fixes in a Claude Code transcript, read off its own structure (no model). His words, UTC:
// 02:21:21 "we must figure out how it works to offer traces... we have nothing for it"; 02:45:44 "hypertrace, long lineage of brainstorming about it...
// then sota based on dimensions"; then "Build it" on the seat's words "a span picked in the traces laboratory, cut into one card per solved fix with its
// raw turns gated behind it, through the Nest's gate with a canary recall test, and one agent measured with and without it on this house".
// The state of the art it follows (ec-workspace docs/offering-traces-hypertrace-and-the-state-of-the-art-2026-10-30.md, dimension 1): a short card of one
// verified fix, matched to the problem, cuts a reader's cost; a raw transcript adds tokens and gains nothing.
//
// A SOLVED FIX: a check (a test, a build, a proof) that failed, then edits, then the same check passing. Its words are the agent's own between the last
// failure and the first edit after it; its tries are the failures in between, each after an edit that did not hold.
//   checkOf(command, cwd)   -> { key, dir, core, files } | null   the check a Bash command runs (its wrappers, cd and pipes read off)
//   verdictOf(text, error)  -> 'fail' | 'pass' | null              what its output says (null: nothing a reader can trust, e.g. a shell error after a green run)
//   countsOf(text)          -> { pass, fail, tests } | null         the runner's own counts
//   signatureOf(text)       -> the failure in one line
//   eventsOf(lines)         -> [event]                             the checks, edits and words of one transcript, in its order
//   fixesOf(events)         -> [fix]                               pure
// COST: one pass over the span's lines, no model, no process.
import os from 'node:os';
import path from 'node:path';

export const EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const WRAP = /^(?:(?:perl\s+-e\s+'[^']*'|perl\s+-e\s+"[^"]*"|nice(?:\s+-n)?\s*-?\d*|timeout\s+\d+[smh]?|env(?:\s+-\w+)*|time|caffeinate(?:\s+-\w+)*|[A-Z_][A-Z0-9_]*=\S*)\s+)+/;
const RUNNER = /^(?:node\s+(?:--[\w-]+(?:=\S+)?\s+)*--test\b|node\s+(?:--[\w-]+(?:=\S+)?\s+)*\S+\.(?:test|proof)\.[cm]?js\b|(?:npm|pnpm|yarn)\s+(?:run\s+)?test\b|npx\s+(?:vitest|jest|playwright\s+test|tsc)\b|bun\s+test\b|deno\s+test\b|python3?\s+(?:-\w+\s+)*-m\s+(?:pytest|unittest)\b|pytest\b|cargo\s+(?:test|build|check|clippy|nextest)\b|go\s+(?:test|build|vet)\b|swift\s+(?:build|test)\b|xcodebuild\b|tsc\b|make\s+(?:test|check)\b)/;
const TEST_FILE = /[\w./@-]+\.(?:test|spec|proof)\.[cm]?[jt]s\b|[\w./-]*test_[\w-]+\.py\b|[\w./-]+_test\.(?:py|go)\b/g;
const FAILS = [/(?:^|\n)\s*(?:ℹ|#)\s*fail\s+[1-9]/, /(?:^|\n)\s*not ok \d+/, /(?:^|\n)\s*✖ /, /\b[1-9]\d* (?:failed|failing)\b/, /(?:^|\n)FAIL\b/, /\btest result: FAILED\b/,
  /\*\* BUILD FAILED \*\*/, /(?:^|\n)error(?:\[E\d+\])?: /, /\berror TS\d+:/, /(?:^|\n)\S+:\d+:\d+: error: /, /(?:^|\n)--- FAIL: /, /(?:^|\n)FAILED /];
const PASSES = [/(?:^|\n)\s*(?:ℹ|#)\s*pass\s+[1-9]/, /\btest result: ok\b/, /\b[1-9]\d* passed\b/, /\*\* BUILD SUCCEEDED \*\*/, /(?:^|\n)ok\s+\S/, /(?:^|\n)\s*Finished\b/, /\bPASS\b/, /Build complete!/];
const SYSTEM = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

export const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };
/** textOf(content): a tool result's content as text (a string, or blocks of text), the harness's reminders taken out. */
export function textOf(c) { const t = typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b && b.type === 'text' ? b.text : '')).join('\n') : ''; return t.replace(SYSTEM, '').trim(); }

/** split a shell line into its commands at && || ; | and newlines, outside quotes */
function segmentsOf(cmd) {
  const out = []; let cur = '', q = null;
  for (let i = 0; i < cmd.length; i++) { const ch = cmd[i];
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === '\n' || ch === ';' || ch === '|' || ch === '&') { if ((ch === '&' || ch === '|') && cmd[i + 1] === ch) i++; else if (ch === '&' && cmd[i - 1] === '>') { cur += ch; continue; } out.push(cur); cur = ''; continue; }
    cur += ch; }
  out.push(cur); return out.map((s) => s.trim()).filter(Boolean);
}
/** checkOf(command, cwd): the first check the line runs -> { key (its folder and its words), dir, core, files (the test files it names) } */
export function checkOf(command, cwd = '', home = os.homedir()) {
  let dir = cwd || '';
  for (const seg of segmentsOf(String(command || ''))) {
    const cd = seg.match(/^cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))$/); if (cd) { const to = (cd[1] || cd[2] || cd[3]).replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/, home); dir = to.startsWith('/') ? path.posix.normalize(to) : path.posix.join(dir || '/', to); continue; }
    const core = seg.replace(WRAP, '').replace(/\s+\d?>&?\s*\S+/g, '').replace(/\s+/g, ' ').trim();
    if (!RUNNER.test(core)) continue;
    return { key: `${dir}\t${core}`, dir, core, files: [...new Set(core.match(TEST_FILE) || [])] };
  }
  return null;
}
/** verdictOf(text, isError): 'fail' | 'pass' | null */
export function verdictOf(text, isError) {
  const t = String(text || '');
  if (FAILS.some((rx) => rx.test(t))) return 'fail';
  if (isError) return /\b[A-Z]\w*Error\b(?: \[\w+\])?:|\bError: |\bCannot find module\b/.test(t) ? 'fail' : null;
  if (PASSES.some((rx) => rx.test(t))) return 'pass';
  return t.trim().split('\n').filter(Boolean).length <= 2 ? 'pass' : null;   // a build that says nothing passed
}
/** countsOf(text): { pass, fail, tests } as the runner said them (node and TAP, pytest, cargo, jest), or null */
export function countsOf(text) {
  const t = String(text || ''), n = (rx) => { const m = t.match(rx); return m ? Number(m[1]) : null; };
  const pass = n(/(?:^|\n)\s*(?:ℹ|#)\s*pass\s+(\d+)/) ?? n(/\b(\d+) passed\b/), fail = n(/(?:^|\n)\s*(?:ℹ|#)\s*fail\s+(\d+)/) ?? n(/\b(\d+) failed\b/) ?? (pass != null ? 0 : null);
  const tests = n(/(?:^|\n)\s*(?:ℹ|#)\s*tests\s+(\d+)/) ?? (pass != null ? pass + (fail || 0) : null);
  return pass == null && fail == null ? null : { pass: pass ?? 0, fail: fail ?? 0, tests: tests ?? 0 };
}
/** signatureOf(text): the failure in one line: its first failing line and its first error */
export function signatureOf(text) {
  const lines = textOf(text).split('\n').map((s) => s.trim()).filter((s) => s && !/^Exit code \d+$/.test(s));
  const head = lines.find((l) => /^(?:✖|not ok|FAIL|--- FAIL|error|E\s{2,})/.test(l)) || lines.find((l) => /\berror(?:\[E\d+\])?:|Error:/.test(l));
  const err = lines.find((l) => /(?:AssertionError|[A-Z]\w*Error)(?: \[\w+\])?:/.test(l));
  return clip([head, err && err !== head ? err : null].filter(Boolean).join(' · ') || lines.at(-1) || 'failed', 240);
}
/** summaryOf(text): the passing line a reader checks */
export function summaryOf(text) {
  const c = countsOf(text); if (c) return `pass ${c.pass} of ${c.tests}`;
  const t = String(text || ''); const m = t.match(/test result: ok[^\n]*|\*\* BUILD SUCCEEDED \*\*|[^\n]*\bPASS\b[^\n]*|Finished[^\n]*|Build complete![^\n]*/);
  return clip(m ? m[0] : 'passed', 120);
}

function editsOf(name, input, result) {
  const file = input.file_path || input.notebook_path || null, original = result && typeof result.originalFile === 'string' ? result.originalFile : null;
  if (name === 'Edit') return [{ file, old: input.old_string ?? '', new: input.new_string ?? '', all: !!input.replace_all, original }];
  if (name === 'MultiEdit') return (input.edits || []).map((e, k) => ({ file, old: e.old_string ?? '', new: e.new_string ?? '', all: !!e.replace_all, original: k ? null : original }));
  if (name === 'Write') return [{ file, old: null, new: input.content ?? '', write: true, original }];
  return [{ file, old: null, new: input.new_source ?? '', original: null }];
}
/** a shell line that writes a file in place (sed -i, perl -pi, a heredoc or a redirect into a source file) -> { file } */
function shellEditOf(cmd) {
  const m = String(cmd).match(/\b(?:sed\s+-i(?:\s+''|\s+"")?|perl\s+-[0-9]*pi(?:\s+-e)?)\b[^\n]*?\s([\w./-]+\.[A-Za-z]{1,6})\s*$/m) || String(cmd).match(/(?:^|\s)(?:cat|printf|echo)\b[^\n|]*>\s*([\w./-]+\.(?:m?js|ts|py|rs|swift|go|json|css|html))\b/m);
  return m ? { file: m[1] } : null;
}

/** the first paragraph of a commit's message, when the line commits (-m "...", or a heredoc) */
const COMMIT = /\bgit\s+(?:-C\s+\S+\s+)?commit\b/;
function commitOf(cmd) {
  if (!COMMIT.test(cmd)) return null;
  const m = cmd.match(/<<\s*'?EOF'?\n([\s\S]*?)\nEOF/) || cmd.match(/\s-[a-zA-Z]*m\s+"((?:[^"\\]|\\.)*)"/) || cmd.match(/\s-[a-zA-Z]*m\s+'([^']*)'/);
  return m ? m[1].replace(/\\(["$`\\])/g, '$1').split(/\n\s*\n/)[0].trim() || null : null;
}
/** eventsOf(lines, {originals, home}): the transcript's checks (with their verdicts), edits, words and commits, in its order. originals: keep each edit's whole
 *  file before it, where the transcript holds it; home: the home a ~ in a check's cd names (the Mac's own, where the transcript was written). */
export function eventsOf(lines, { originals = false, home = os.homedir() } = {}) {
  const uses = new Map(), ev = [];
  lines.forEach((d, i) => {
    if (!d || typeof d !== 'object' || !d.message) return;
    const at = Date.parse(d.timestamp || '') || null, content = Array.isArray(d.message.content) ? d.message.content : [];
    if (d.type === 'assistant') { for (const c of content) {
      if (c.type === 'text' && c.text && c.text.trim()) ev.push({ kind: 'say', text: c.text.replace(SYSTEM, '').trim(), at, i, uuid: d.uuid });
      else if (c.type === 'tool_use') uses.set(c.id, { name: c.name, input: c.input || {}, at, i, uuid: d.uuid, cwd: d.cwd || '', branch: d.gitBranch || null }); } return; }
    if (d.type !== 'user') return;
    for (const c of content) {
      if (!c || c.type !== 'tool_result') continue; const u = uses.get(c.tool_use_id); if (!u) continue;
      const err = !!c.is_error, base = { at: u.at, i: u.i, ri: i, uuid: u.uuid, ruuid: d.uuid, cwd: u.cwd, branch: u.branch };
      if (u.name === 'Bash') {
        const text = textOf(c.content), k = checkOf(u.input.command || '', u.cwd, home);
        if (k) { const v = verdictOf(text, err); if (v) ev.push({ kind: 'check', ...base, ...k, verdict: v, sig: v === 'fail' ? signatureOf(text) : summaryOf(text), counts: countsOf(text), command: u.input.command }); continue; }
        if (!err && COMMIT.test(u.input.command || '')) { const sha = text.match(/\[[^\]\n]*?\b([0-9a-f]{7,40})\]/) || text.match(/(?:^|\n)([0-9a-f]{7,40})(?= |\n|$)/); ev.push({ kind: 'commit', ...base, text: commitOf(u.input.command), sha: sha ? sha[1] : null }); continue; }
        const f = !err && shellEditOf(u.input.command || ''); if (f) ev.push({ kind: 'edit', ...base, file: f.file.startsWith('/') ? f.file : path.posix.join(u.cwd || '/', f.file), shell: clip(u.input.command, 240), old: null, new: null });
      } else if (EDITS.has(u.name) && !err) for (const e of editsOf(u.name, u.input, d.toolUseResult)) ev.push({ kind: 'edit', ...base, ...e, original: originals ? e.original : undefined });
    }
  });
  return ev;
}

/** fixesOf(events, {maxFiles, maxEdits}): every failure a later pass of the same check answered after edits. A pass with no edit since is no fix (a flake,
 *  or another cause); a window over maxFiles files or maxEdits edits is a broad change, not one fix. */
export function fixesOf(ev, { maxFiles = 4, maxEdits = 12 } = {}) {
  const open = new Map(), out = [], seen = new Set();
  for (let at = 0; at < ev.length; at++) {
    const e = ev[at];
    if (e.kind !== 'check') { for (const o of open.values()) o.seq.push(e); continue; }
    if (e.verdict === 'fail') {
      const o = open.get(e.key);
      if (!o) { open.set(e.key, { first: e, last: e, tries: [], seq: [], tried: 0 }); continue; }
      const edits = o.seq.filter((x) => x.kind === 'edit').length;
      if (edits > o.tried) o.tries.push({ sig: e.sig, at: e.at, after: edits - o.tried });
      o.last = e; o.tried = edits; continue;
    }
    for (const [key, o] of open) {
      const answers = key === e.key || (o.first.dir === e.dir && o.first.files.length > 0 && o.first.files.every((f) => e.files.includes(f)));
      if (!answers) continue;
      open.delete(key);
      const edits = o.seq.filter((x) => x.kind === 'edit'), files = [...new Set(edits.map((x) => x.file).filter(Boolean))];
      if (!edits.length || files.length > maxFiles || edits.length > maxEdits) continue;
      const after = o.seq.filter((x) => x.i > o.last.ri), cut = after.findIndex((x) => x.kind === 'edit');
      let words = after.slice(0, cut < 0 ? after.length : cut).filter((x) => x.kind === 'say').map((x) => x.text);
      if (!words.length) { const first = o.seq.findIndex((x) => x.kind === 'edit'); words = o.seq.slice(0, first).filter((x) => x.kind === 'say').map((x) => x.text); }
      if (!words.length) { const next = ev.slice(at + 1, at + 40), stop = next.findIndex((x) => x.kind === 'check' || x.kind === 'edit'), commit = next.slice(0, stop < 0 ? next.length : stop).find((x) => x.kind === 'commit' && x.text);
        words = commit ? [commit.text] : next.slice(0, stop < 0 ? 6 : Math.min(stop, 6)).filter((x) => x.kind === 'say').map((x) => x.text); }
      const same = edits.map((x) => `${x.uuid}:${x.file}`).sort().join('|'); if (seen.has(same)) continue; seen.add(same);   // one fix answered two checks: one card
      out.push({ check: { key, dir: o.first.dir, core: o.first.core, files: o.first.files }, fail: o.first, last: o.last, pass: e, tries: o.tries, edits, files, words });
    }
  }
  return out;
}
