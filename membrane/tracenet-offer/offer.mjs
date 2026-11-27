#!/usr/bin/env node
// offer.mjs · THE OFFERING ROAD (Oct 30 2026): a span of his traces -> one card per solved fix with its raw turns behind it, both through the gate, the
// gate's recall measured by canaries in the same run. The bundle stays on this Mac (~/.embertide/tracenet/offers: the membrane's level 0, nothing crosses)
// until his hand publishes a card through the Nest's receipt and the publisher (tracenet-sanitize.mjs, dyson-society/tools/tracenet-publish.mjs).
// His words, UTC: Oct 30 02:21:21 "we must figure out how it works to offer traces... we have nothing for it"; then "Build it" on the seat's words "a span
// picked in the traces laboratory, cut into one card per solved fix with its raw turns gated behind it, through the Nest's gate with a canary recall test,
// and one agent measured with and without it on this house" (the last is measure.mjs).
//   node tools/embertide-mesh/tracenet-offer/offer.mjs cut --from <time> --to <time> [--root <transcripts>] [--project <words>] [--out <dir>]
//        [--scanners gitleaks,trufflehog|none] [--his-words] [--seed <n>] [--nest <url> --seat <seat>]
//   node .../offer.mjs cut --span nest [--nest <url>]   the span his hand picked in the traces laboratory (the Nest's ref tracenet/offer/span)
//   node .../offer.mjs watch [--nest <url>] [--seat <seat>] [--root <transcripts>] [--out <dir>]   THE CUT ON ITS CAUSE: the span ref followed on the Nest's
//        stream; each new span his hand picks is cut on this Mac, and tracenet/offer/last says the cut's counts and recall (never a word of a card), which the
//        strip under the laboratory shows. At rest: one open stream, no read, no write. It signs as the Nest's own place when this Mac holds that seat's key
//        (else --seat, NEST_SEAT, or mac). Kept alive by gg.embertide.tracenet-offer.plist (his install).
//   node .../offer.mjs show <offer folder>
// --hours <dir> names where each transcript's hour index is kept (default ~/.embertide/tracenet/hours; span.mjs hoursOf).
// A time is ISO 8601 or epoch ms. --his-words keeps the typed messages in the raw turns (his call; withheld by default). --nest stands each card's receipt
// on the Nest (tracenet-sanitize.mjs stand: the blob and the signed ref), which the publisher asks for; without it nothing is written there.
// COST: per transcript the span's bytes (span.mjs); one pass over their lines; one gitleaks and one trufflehog run over every card and raw, and the same
// over the canary copy; no model, no process left, nothing at rest.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transcriptsOf, spanLines } from './span.mjs';
import { eventsOf, fixesOf } from './fixes.mjs';
import { cardOf, rawOf } from './card.mjs';
import { gate, recallOf, ownSecretsOf, dirsOf, scannersHere, SCANNERS, GATE_VERSION } from './gate.mjs';

export const OFFER_SCHEMA = 'embertide.tracenet-offer/v1';
export const SPAN_REF = 'tracenet/offer/span';   // the span his hand picked in the traces laboratory: { from_ms, to_ms, by, at } (life-menu/traces-span.mjs)
export const LAST_REF = 'tracenet/offer/last';   // the last cut of a span: its counts and the gate's recall, never a word of a card
export const LAST_SCHEMA = 'embertide.tracenet-offer-last/v1';
const HOME = os.homedir();
export const timeOf = (v) => { if (v == null || v === true) return NaN; const n = Number(v); return Number.isFinite(n) && String(v).trim() !== '' && /^\d+$/.test(String(v)) ? n : Date.parse(v); };
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 13) + 'Z';
const tilde = (p) => (p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p);

/** every string of a value in its own order, and the value rebuilt with each string from `next` in that order */
export function strings(o, out = []) { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; }
export function rebuilt(o, next) { if (typeof o === 'string') return next(); if (Array.isArray(o)) return o.map((x) => rebuilt(x, next)); if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rebuilt(v, next)])); return o; }
export function keyFilesOf(home = HOME) {
  const out = []; const nest = path.join(home, '.embertide', 'nest');
  try { for (const n of fs.readdirSync(nest)) if (n.endsWith('.key.json')) out.push(path.join(nest, n)); } catch {}
  const sol = path.join(home, '.config', 'solana', 'id.json'); if (fs.existsSync(sol)) out.push(sol);
  return out;
}

/** cutOffer({from, to, root, project, scanners, hisWords, seed, env}) -> { offer, cards (gated), raws (gated, JSONL text) }; writes nothing */
export const HOURS_DIR = path.join(HOME, '.embertide', 'tracenet', 'hours');   // THE CUT READS ITS HOURS: each transcript's hour index (span.mjs hoursOf)
export async function cutOffer({ from, to, root = path.join(HOME, '.claude', 'projects'), project = null, scanners = SCANNERS, hisWords = false, seed = 1, env = process.env, keyFiles = keyFilesOf(), hoursDir = HOURS_DIR } = {}) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new Error('a span: --from and --to, the end after the start');
  const t0 = Date.now(), list = (await transcriptsOf(root, from)).filter((x) => !project || x.project.includes(project) || x.file.includes(project));
  const cards = [], raws = [], cwds = new Set(), seen = new Set(); let bytes = 0, lines = 0, fixes = 0;   // seen: a fix a forked or resumed transcript repeats is one card
  for (const t of list) {
    const s = await spanLines(t.file, from, to, { dir: hoursDir }); bytes += s.bytes; lines += s.lines.length;
    for (const d of s.lines) if (d && d.cwd) cwds.add(d.cwd);
    for (const fx of fixesOf(eventsOf(s.lines))) { const same = fx.edits.map((x) => x.uuid).sort().join('|'); if (seen.has(same)) continue; seen.add(same); fixes++; cards.push(cardOf(fx, { session: t.session, project: t.project })); raws.push(rawOf(s.lines, fx, { hisWords })); }
  }
  const own = ownSecretsOf({ env, dirs: dirsOf([...cwds]), keyFiles }), objs = [...cards, ...raws], leaves = objs.flatMap((o) => strings(o));
  const g = gate(leaves, { own, scanners }); let k = 0; const next = () => g.texts[k++];
  const gated = objs.map((o) => rebuilt(o, next)), gc = gated.slice(0, cards.length), gr = gated.slice(cards.length);
  const recall = leaves.length ? recallOf(leaves, { own, scanners }, seed) : null;
  const offer = { schema: OFFER_SCHEMA, id: `${stamp(from)}-${stamp(to)}`, span: { from: new Date(from).toISOString(), to: new Date(to).toISOString() }, root: tilde(root), project,
    read: { transcripts: list.length, bytes, lines }, fixes, cards: gc.map((c) => ({ id: c.id, title: c.title, langs: c.when.langs, session: c.source.session, at: c.source.to_ms })),
    gate: { version: GATE_VERSION, scanners, withheld: g.withheld, n: g.n, by_scanner: g.scanners, own: own.size, recall }, typed: hisWords ? 'kept' : 'withheld', ms: Date.now() - t0, at: new Date().toISOString() };
  return { offer, cards: gc, raws: gr.map((r) => r.map((x) => JSON.stringify(x)).join('\n') + '\n') };
}

/** writeOffer(out, cut) -> the bundle's folder: offer.json, cards/<id>.md and .json, raw/<id>.jsonl (the folder 0700, every file 0600) */
export function writeOffer(out, { offer, cards, raws }) {
  const dir = path.join(out, offer.id); fs.mkdirSync(path.join(dir, 'cards'), { recursive: true, mode: 0o700 }); fs.mkdirSync(path.join(dir, 'raw'), { recursive: true, mode: 0o700 });
  const put = (f, s) => fs.writeFileSync(path.join(dir, f), s, { mode: 0o600 });
  cards.forEach((c, i) => { put(`cards/${c.id}.md`, c.md); put(`cards/${c.id}.json`, JSON.stringify(c, null, 1) + '\n'); put(`raw/${c.id}.jsonl`, raws[i]); });
  put('offer.json', JSON.stringify(offer, null, 1) + '\n');
  return dir;
}

/** lastOf(offer, rev, dir): tracenet/offer/last's value: what the cut found and the gate measured, counts only */
export function lastOf(offer, rev, dir) {
  const r = offer.gate.recall;
  return { schema: LAST_SCHEMA, span: { from_ms: Date.parse(offer.span.from), to_ms: Date.parse(offer.span.to), rev }, id: offer.id, cards: offer.cards.length, fixes: offer.fixes,
    read: offer.read, withheld: offer.gate.n, recall: r ? { recall: r.recall, caught: r.caught, seeded: r.seeded, missed: r.missed } : null, bundle: tilde(dir), ms: offer.ms, at: new Date().toISOString() };
}
/** watch({client, nest, out, root, scanners, say}): THE CUT ON ITS CAUSE. The span is read at the start (a pick made while away is cut once), then on every line
 *  the Nest's stream says of it; a span already cut (its rev in tracenet/offer/last) is not cut again. A dropped stream is said once and its return once. */
export async function watch({ client, nest, out, root, scanners, hoursDir = HOURS_DIR, say = console.log, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), fetchImpl = fetch, once = false }) {
  let done = (await client.ref(LAST_REF).catch(() => null))?.value?.span?.rev ?? 0, dropped = 0;
  async function put(name, value) { for (let k = 0; k < 3; k++) { const cur = await client.ref(name).catch(() => null); try { return await client.cas(name, value, cur?.rev ?? 0); } catch (e) { if (e.status !== 409) throw e; } } throw new Error(`${name}: three writers won the race`); }
  async function maybe() {
    const r = await client.ref(SPAN_REF).catch(() => null), v = r && r.value;
    if (!v || !Number.isFinite(v.from_ms) || !Number.isFinite(v.to_ms) || r.rev <= done) return null;
    done = r.rev;
    const c = await cutOffer({ from: v.from_ms, to: v.to_ms, root, scanners, hoursDir }), dir = writeOffer(out, c), w = await put(LAST_REF, lastOf(c.offer, r.rev, dir));
    say(`span rev ${r.rev} cut: ${c.cards.length} cards from ${c.offer.read.transcripts} transcripts, recall ${c.offer.gate.recall ? Math.round(c.offer.gate.recall.recall * 100) + ' %' : '-'}; ${LAST_REF} rev ${w.rev}`);
    return c;
  }
  for (;;) {
    try {
      const first = await maybe(); if (once) return first;
      const res = await fetchImpl(`${nest}/nest/stream?types=ref&refs=${SPAN_REF}`, { headers: { accept: 'text/event-stream' } });
      if (!res.ok || !res.body) throw new Error(`the stream answered ${res.status}`);
      if (dropped) { say(`the Nest's stream is back after ${dropped} tries`); dropped = 0; }
      let buf = '';
      for await (const chunk of res.body) {
        buf += Buffer.from(chunk).toString('utf8'); let i;
        while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); if (/(?:^|\n)data: /.test(block) && block.includes(SPAN_REF)) await maybe(); }
      }
      throw new Error('the stream ended');
    } catch (e) { if (!dropped) say(`the Nest's stream dropped (${e.message}); trying again every 10 s`); dropped++; await sleep(10000); }
  }
}

function flagsOf(argv) { const f = { _: [] }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); f[k] = v !== undefined ? v : argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; } else f._.push(a); } return f; }
const isMain = (() => { try { return fs.realpathSync(process.argv[1] || '') === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const f = flagsOf(process.argv.slice(2)), verb = f._[0];
  try {
    if (verb === 'cut') {
      let from = timeOf(f.from), to = timeOf(f.to), client = null;
      const nest = f.nest || process.env.EMBERTIDE_NEST || 'http://127.0.0.1:8904';
      if (f.span === 'nest' || f.nest) { const { NestClient } = await import('../nest-client.mjs'); client = new NestClient(typeof nest === 'string' ? nest : 'http://127.0.0.1:8904', f.seat || process.env.NEST_SEAT || 'mac'); }
      if (f.span === 'nest') { const r = await client.ref(SPAN_REF).catch(() => null); if (!r || !r.value) throw new Error(`${SPAN_REF}: no span picked on the Nest`); from = r.value.from_ms; to = r.value.to_ms; }
      const c = await cutOffer({ from, to, root: f.root || undefined, project: typeof f.project === 'string' ? f.project : null, hisWords: !!f['his-words'], seed: Number(f.seed) || 1, hoursDir: typeof f.hours === 'string' ? f.hours : HOURS_DIR,
        scanners: f.scanners === 'none' ? [] : scannersHere(typeof f.scanners === 'string' ? f.scanners.split(',') : SCANNERS) });
      const out = typeof f.out === 'string' ? f.out : path.join(HOME, '.embertide', 'tracenet', 'offers'), dir = writeOffer(out, c), o = c.offer, r = o.gate.recall;
      const w = Object.entries(o.gate.withheld).filter(([k, n]) => n && k !== 'homes').map(([k, n]) => `${n} ${k}`).join(', ');
      console.log(`offer ${o.id}: ${o.read.transcripts} transcripts, ${(o.read.bytes / 1e6).toFixed(1)} MB read, ${o.read.lines} lines; ${o.fixes} solved fixes, ${c.cards.length} cards`);
      console.log(`gate: ${w || 'nothing withheld'}${o.gate.withheld.homes ? `; ${o.gate.withheld.homes} homes as ~` : ''}; scanners ${o.gate.scanners.join(', ') || 'none'} (${JSON.stringify(o.gate.by_scanner)})`);
      if (r) console.log(`canaries: ${r.caught} of ${r.seeded} caught, recall ${(r.recall * 100).toFixed(1)} %${r.missed.length ? `; missed: ${r.missed.join(', ')}` : ''}`);
      if (f.nest && c.cards.length) { const { stand } = await import('../tracenet-sanitize.mjs');
        if (!client.key) throw new Error(`no key for seat ${client.seat}: a receipt is signed or not written`);
        for (const card of c.cards) { const s = await stand({ bytes: Buffer.from(card.md), name: `${card.id}.md`, client }); console.log(`${card.id}: ${s.ref} ${s.stood ? 'stands' : `rev ${s.rev}`}`); } }
      console.log(`bundle: ${tilde(dir)} (${c.cards.length} cards); ${o.ms} ms`);
    } else if (verb === 'watch') {
      const { NestClient } = await import('../nest-client.mjs'), { loadKey } = await import('../lib/nest-author.mjs'), nest = typeof f.nest === 'string' ? f.nest : process.env.EMBERTIDE_NEST || 'http://127.0.0.1:8904';
      // the seat that signs the last cut: the one named, else the Nest's own place when this Mac holds its key (ANY ROOM: no seat of his in the code). A Nest
      // that does not answer at the start ends this run; launchd starts it again (the plist's KeepAlive, 30 s apart)
      let seat = typeof f.seat === 'string' ? f.seat : process.env.NEST_SEAT || null;
      if (!seat) { const place = await fetch(`${nest}/nest/head`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).then((h) => h && h.place).catch(() => null);
        if (!place) throw new Error(`the Nest at ${nest} did not answer: its place names the seat`); seat = loadKey(place) ? place : 'mac'; }
      const client = new NestClient(nest, seat); if (!client.key) throw new Error(`no key for seat ${client.seat}: ${LAST_REF} is signed or not written`);
      const say = (...x) => console.log(new Date().toISOString().slice(11, 19), ...x);
      await watch({ client, nest, out: typeof f.out === 'string' ? f.out : path.join(HOME, '.embertide', 'tracenet', 'offers'), root: typeof f.root === 'string' ? f.root : undefined, hoursDir: typeof f.hours === 'string' ? f.hours : HOURS_DIR,
        scanners: f.scanners === 'none' ? [] : scannersHere(typeof f.scanners === 'string' ? f.scanners.split(',') : SCANNERS), say });
    } else if (verb === 'show') {
      const dir = f._[1]; if (!dir) throw new Error('offer.mjs show <offer folder>'); const o = JSON.parse(fs.readFileSync(path.join(dir, 'offer.json'), 'utf8'));
      console.log(JSON.stringify({ id: o.id, read: o.read, fixes: o.fixes, cards: o.cards.map((c) => `${c.id} ${c.title}`), recall: o.gate.recall }, null, 1));
    } else { console.error('offer.mjs cut --from <time> --to <time> [--root <dir>] [--project <words>] [--out <dir>] [--scanners a,b|none] [--his-words] [--seed n] [--nest <url> --seat <seat>] | cut --span nest | show <folder>'); process.exit(2); }
  } catch (e) { console.error(`offer: ${e.message}`); process.exit(1); }
}
