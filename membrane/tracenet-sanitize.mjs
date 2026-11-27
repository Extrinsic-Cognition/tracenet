#!/usr/bin/env node
// tracenet-sanitize.mjs · THE DROP IS SANITIZED IN THE NEST (Oct 26 2026 22:1x WET). His words: Oct 14 23:2x WEST "everything shared outside must
// be thoroughly sanitized in the nest itself"; Oct 12 13:15 "dude, we need to have repo sanitization please... come on"; Sept 7 "the most important
// thing is information containment... FIDES"; Oct 26 21:4x, over the Tracenets page that said "None published yet. The first waits on you": "you are
// so much fucking underestimating the potential here at this page".
//
// WHAT STOOD. The publisher (dyson-society/tools/tracenet-publish.mjs) publishes a file only when the Nest holds tracenet/sanitized/<sha256 of its
// bytes>, and writes that receipt ({ref, rev, seat, ts}) into the drop; the build checks it again. The pass that writes the ref was named "the next
// lane" on Oct 14 and never built: no drop could be published, so the first tracenet's register stayed empty.
//
// THE LAW HERE, the pass, deterministic (the membrane's levels, membrane.mjs: L0 never crosses): over the bytes of one file,
//   a path of level 0 (secrets, envs, receipts and ledgers, ~/.embertide, ~/.claude, the traces...) is withheld whole;
//   any other /Users/<name>/ path keeps its way with the home pseudonymised to ~/ (the work is named, the user is not);
//   a private key block (-----BEGIN ... PRIVATE KEY-----), a token of a known shape (sk-, AKIA, ghp_, xox-, a Bearer), a secret field
//   ("private_pem", "token", "secret", "api_key", "password": "..."), an email, a LAN address, an iOS device id: each withheld, in its place,
//   as a line a reader reads ([withheld: a secret]). A sha256 stays (public by nature). Nothing else moves.
// Then the sanitized bytes are PUT on the Nest as a blob, and the receipt is written as the ref tracenet/sanitized/<sha256 of the sanitized bytes>,
// signed by this Mac's seat key (nest-client.mjs cas: the signed row), once (a ref that stands is not written again). The sanitized file is left
// beside for the publisher. The receipt names the source's sha256 and every count withheld, so the drop says what it is not.
//   sanitizeText(text, {allow}) -> { text, withheld: {paths, homes, keys, secrets, emails, lan, udids}, n }   pure
//   receiptValue({...})          -> the ref's value                                                            pure
//   stand({bytes, name, client, dry}) -> { sha256, bytes, written, rev, out }                                  the pass, with a Nest client
//   node tracenet-sanitize.mjs <file> [--out <dir>] [--nest http://host:8904] [--seat <seat>] [--dry] [--drop "<title>" [--kind <kind>]]
// THE VOW MAKES THE PAGE (Nov 4 2026): --drop sends the cleaned bytes on as the house's next signed line (lib/tracenet-create.mjs drop): the site's door, then the
// Nest's chain, run on the Mac that holds the house's key. COST: one read, one PUT of the bytes, one CAS; with --drop one POST and one CAS more; nothing at rest.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { levelOf, pathsIn } from './membrane.mjs';
import { SANITIZED_REF } from './receipt-schema.mjs';

export const SCHEMA = 'embertide.tracenet-sanitized/v1';
export const REF = SANITIZED_REF;   // tracenet-register.mjs: the first 48 hex of the sha256 (the Nest's ref door takes 80 characters); the value carries the whole hash
export const WORDS = Object.freeze({ paths: '[withheld: a private path]', keys: '[withheld: a private key]', secrets: '[withheld: a secret]', emails: '[withheld: an email]', lan: '[withheld: a LAN address]', udids: '[withheld: a device id]' });
const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const TOKENS = [/\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b/g, /\bAKIA[0-9A-Z]{16}\b/g, /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, /\bxox[abp]-[A-Za-z0-9-]{10,}\b/g, /\bBearer\s+[A-Za-z0-9._-]{16,}\b/g];
const FIELDS = /("(?:private_pem|token|secret|api_key|apiKey|password|MINIROUTER_API_KEY)"\s*:\s*)"[^"\n]*"/g;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const LAN = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g;
const UDID = /\b[0-9A-F]{8}-[0-9A-F]{16}\b/g;
const HOME = /\/Users\/[A-Za-z0-9_.-]+\//g;
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** sanitizeText(text, {allow}): THE PASS, pure -> { text, withheld, n }. allow: paths of level 2 for this pass (membrane.mjs levelOf). */
export function sanitizeText(text, { allow = [] } = {}) {
  let t = String(text ?? ''); const w = { paths: 0, homes: 0, keys: 0, secrets: 0, emails: 0, lan: 0, udids: 0 };
  const count = (rx, word, key) => { t = t.replace(rx, (...m) => { w[key]++; return typeof word === 'function' ? word(...m) : word; }); };
  count(PEM, WORDS.keys, 'keys');
  for (const rx of TOKENS) count(rx, WORDS.secrets, 'secrets');
  count(FIELDS, (m, head) => `${head}"${WORDS.secrets}"`, 'secrets');
  // the paths: level 0 withheld whole (the longest first, so a path inside another is not left as a tail), the rest with the home pseudonymised
  const paths = pathsIn(t).filter((p) => levelOf(p, allow) === 0).sort((a, b) => b.length - a.length);
  for (const p of paths) { const n = t.split(p).length - 1; if (n) { w.paths += n; t = t.split(p).join(WORDS.paths); } }
  count(HOME, '~/', 'homes');
  count(EMAIL, WORDS.emails, 'emails');
  count(LAN, WORDS.lan, 'lan');
  count(UDID, WORDS.udids, 'udids');
  return { text: t, withheld: w, n: Object.values(w).reduce((a, b) => a + b, 0) - w.homes };
}

/** receiptValue({sha256, bytes, source, file, withheld, seat, at}): the ref's value, pure. */
export function receiptValue({ sha256: sha, bytes, source, file, withheld, seat, at = new Date().toISOString() }) {
  return { schema: SCHEMA, sha256: sha, bytes, source: { sha256: source.sha256, bytes: source.bytes }, file, withheld, law: 'tools/embertide-mesh/tracenet-sanitize.mjs (membrane.mjs levels: L0 never crosses)', seat, at };
}

/** stand({bytes, name, client, allow, dry, at}): the pass over one file's bytes with a Nest client ({putBlob, ref, cas, seat}) -> { out (the sanitized bytes), sha256,
 *  source, withheld, written (true: the ref written now; false: it stood), rev, ref }. dry: nothing put, nothing written. */
export async function stand({ bytes, name, client, allow = [], dry = false, at = new Date().toISOString() } = {}) {
  if (!Buffer.isBuffer(bytes)) throw new Error('the file\'s bytes');
  const source = { sha256: sha256(bytes), bytes: bytes.length };
  const s = sanitizeText(bytes.toString('utf8'), { allow }), out = Buffer.from(s.text, 'utf8'), sha = sha256(out), ref = REF(sha);
  const value = receiptValue({ sha256: sha, bytes: out.length, source, file: path.basename(name || 'drop'), withheld: s.withheld, seat: client ? client.seat : 'dry', at });
  if (dry || !client) return { out, sha256: sha, source, withheld: s.withheld, n: s.n, written: false, rev: null, ref, value, dry: true };
  const was = await client.ref(ref).catch(() => null);
  if (was && was.value && was.value.schema === SCHEMA) return { out, sha256: sha, source, withheld: s.withheld, n: s.n, written: false, rev: was.rev, ref, value: was.value, stood: true };
  await client.putBlob(out);
  const r = await client.cas(ref, value, was ? was.rev : 0);
  return { out, sha256: sha, source, withheld: s.withheld, n: s.n, written: true, rev: r.rev, ref, value };
}

function flagsOf(argv) { const f = { _: [] }; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) f[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; else f._.push(a); } return f; }
const isMain = (() => { try { return fs.realpathSync(process.argv[1] || '') === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const f = flagsOf(process.argv.slice(2)), file = f._[0];
  if (!file) { console.error('tracenet-sanitize.mjs <file> [--out <dir>] [--nest http://host:8904] [--seat <seat>] [--dry]'); process.exit(2); }
  try {
    const bytes = fs.readFileSync(file), nest = f.nest || process.env.NEST || 'http://127.0.0.1:8904', seat = f.seat || process.env.NEST_SEAT || 'mac';
    const client = f.dry ? null : (() => { throw new Error('NestClient is only available when connected to a local Nest server; use --dry or pass a custom client to stand()'); })(nest, seat); if (client && !client.key) throw new Error(`no key for seat ${seat} (~/.embertide/nest/${seat}.key.json): the receipt is signed or not at all`);
    const r = await stand({ bytes, name: file, client, dry: !!f.dry, allow: f.allow ? String(f.allow).split(',') : [] });
    const outDir = f.out || path.dirname(file), outFile = path.join(outDir, path.basename(file)); fs.mkdirSync(outDir, { recursive: true });
    if (path.resolve(outFile) === path.resolve(file) && r.n) throw new Error('--out <dir>: the sanitized file is not written over its source');
    fs.writeFileSync(outFile, r.out);
    const w = Object.entries(r.withheld).filter(([k, n]) => n && k !== 'homes').map(([k, n]) => `${n} ${k}`).join(', ');
    console.log(`${path.basename(file)}: ${r.source.bytes} bytes -> ${r.out.length} sanitized (${w || 'nothing withheld'}${r.withheld.homes ? `; ${r.withheld.homes} home paths as ~/` : ''}) at ${outFile}`);
    console.log(r.dry ? `dry: ${r.ref} not written` : r.stood ? `${r.ref} stands already (rev ${r.rev}, by ${r.value.seat})` : `${r.ref} rev ${r.rev}: the receipt, signed by ${client.seat}; the blob ${r.sha256.slice(0, 12)} on the Nest`);
    if (f.drop && !r.dry) {   // THE VOW MAKES THE PAGE: the receipt as the publisher reads it ({ref, rev, seat, ts}), then the signed line
      const [{ createTracenetDoor }, { createRefDoor }, k] = await Promise.all([import('./lib/tracenet-create.mjs'), import('./lib/music-timeline.mjs'), client.ref(r.ref)]);
      const [code, out] = await createTracenetDoor({ site: process.env.EMBERTIDE_SOCIETY_SITE || 'https://optimism.fit', door: createRefDoor({ origin: nest }) })
        .drop({ bytes: r.out, file: path.basename(file), title: String(f.drop), kind: typeof f.kind === 'string' ? f.kind : 'trace', sanitized: { ref: r.ref, rev: k.rev, seat: k.seat, ts: k.ts } });
      console.log(code === 201 ? `the drop ${out.id} stands: ${out.url}` : `the drop: ${out.error}`); if (code !== 201) process.exit(1);
    }
  } catch (e) { console.error(`tracenet-sanitize: ${e.message}`); process.exit(1); }
}
