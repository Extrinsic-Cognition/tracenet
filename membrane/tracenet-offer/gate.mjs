// gate.mjs · THE OFFERING ROAD: the gate a card and its raw turns pass before anything is offered, and the canary test that measures what it misses.
// His words: Oct 14 23:2x WEST "everything shared outside must be thoroughly sanitized in the nest itself"; "multiple parallel procedures figuring out any
// leak of info before info is egress from pc". The state of the art (the offering-traces hypertrace, dimension 4): nobody has measured a trace sanitizer's
// miss rate end to end; the order that ranks is the creator's own secrets matched exactly, scanners side by side, a model leaning to recall, NFKC with the
// invisible characters stripped, then a seeded-canary test of the recall. Never a claim of anonymity.
// THE GATE, in that order (no model yet: the canaries say what is missed without one):
//   1. NFKC, and every invisible character taken out (zero-width, bidi controls, the tag block: an instruction to a reader can hide there)
//   2. the creator's own secrets, exactly (ownSecretsOf: the environment's secret-named values, the .env files of the folders worked in, the house's keys)
//   3. the shapes the Nest's pass does not know: a JWT, Stripe, a Google key, a Slack hook, a URL's password, a secret-named assignment, a keypair as 64
//      numbers, a password said in words, a phone number
//   3b. THE KEYS, BY PROOF (Oct 30 2026, THE GATE KNOWS THE KEYS: v1 missed exactly these three, 19 of 22 canaries, and the day had been Solana keys):
//      a shape alone cannot tell a secret key from a signature or a hash, so each is told by what only a key satisfies:
//      - 64 bytes in base58 or in hex whose last 32 are the ed25519 public key of the first 32: a keypair (a Solana secret key), never a signature;
//      - 12 or more BIP39 words in a row (the standard's own list, bip39-english.txt): a seed phrase, checksum or not (a phrase with a typo is still his);
//      - 0x and 64 hex, and 64 hex within 40 characters after private, secret, priv, seed, sk or signing: a hex key (a hash said alone stays).
//      What it still cannot tell, said honestly: a 32-byte seed alone in base58 (an address's shape), a bare 64-hex key with no word near it.
//   4. the Nest's own pass (tracenet-sanitize.mjs sanitizeText: private paths, homes, key blocks, tokens, secret fields, emails, LAN addresses, device ids)
//   5. gitleaks and trufflehog over what is left, side by side, on this Mac only (trufflehog --no-verification: no secret leaves to be checked); every
//      secret either finds is withheld everywhere
// THE CANARIES: invented secrets of 22 kinds (none real, drawn from a seeded generator) laid into a copy of the very text offered; the whole gate runs on
// the copy, and every canary still readable after it is a miss, named by its kind. The three kinds a shape cannot tell are made as the real ones are: a
// keypair from a seeded seed, a phrase with its checksum from seeded entropy, an 0x key. The recall is said with the offer, never assumed.
//   gate(texts, {own, allow, scanners}) -> { texts, withheld, n, scanners }
//   recallOf(texts, {...}, seed)       -> { seeded, caught, recall, missed }
//   ownSecretsOf({env, dirs, keyFiles}) -> Set
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sanitizeText, WORDS } from '../tracenet-sanitize.mjs';

export const GATE_VERSION = 'tracenet-offer/gate v2 (NFKC + invisible, own secrets, 9 shapes, keys by proof, tracenet-sanitize, gitleaks + trufflehog)';
export const SCANNERS = ['gitleaks', 'trufflehog'];
const SECRET = WORDS.secrets;
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿\u{E0000}-\u{E007F}]/gu;
const SECRET_NAME = /KEY|TOKEN|SECRET|PASSW|PRIVATE|CREDENTIAL|AUTH|COOKIE/i;
const SHAPES = [
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, () => SECRET],                                         // a JWT
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, () => SECRET],                                                          // Stripe
  [/\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g, () => SECRET],                                                                  // a Google API key
  [/\bhooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,}/g, () => SECRET],                                                       // a Slack webhook
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]{3,}(@)/gi, (m, a, b) => `${a}${SECRET}${b}`],                                   // a URL's password
  [/(\b(?:export\s+)?[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE|CREDENTIAL)[A-Z0-9_]*\s*=\s*)(['"]?)[^\s'"]{8,}\2/g, (m, a, q) => `${a}${q}${SECRET}${q}`],   // NAME=value
  [/(\b(?:api[_-]?key|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|password|passwd)\s*[:=]\s*)(['"])[^'"\n]{8,}\2/gi, (m, a, q) => `${a}${q}${SECRET}${q}`],
  [/\[\s*\d{1,3}(?:\s*,\s*\d{1,3}){63}\s*\]/g, () => '[withheld: a private key]'],                                              // a keypair as 64 numbers (a Solana id.json)
  [/(\b(?:password|passwd|passphrase)\b\s*(?:is|was|:|=)\s*)\S{6,}/gi, (m, a) => `${a}${SECRET}`],                             // a password said in words
  [/\+\d{1,3}(?:[ -]?\d{2,4}){2,4}\b/g, () => '[withheld: a phone number]'],                                                    // a phone number
];

// ---------- step 3b: the keys, by proof ----------
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', B58_AT = new Map([...B58].map((c, i) => [c, i]));
export const BIP39_SHA256 = '2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda';   // the standard's english.txt, read once
const BIP39 = fs.readFileSync(new URL('./bip39-english.txt', import.meta.url), 'utf8').split('\n').map((x) => x.trim()).filter(Boolean), BIP39_AT = new Set(BIP39);
const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');
export const KEY = '[withheld: a private key]', PHRASE = '[withheld: a seed phrase]';
// a hex value with twelve of one digit in a row is a constant (a curve's prime, a maximum), never a drawn key: a random 64-hex holds such a run once in
// about 3e11 (the first real hit, Oct 30, was secp256k1's field prime 0xffff...fc2f quoted from noble-curves)
const RUN = /([0-9a-fA-F])\1{11}/;
/** the ed25519 public key of a 32-byte seed */
export const edPublic = (seed) => crypto.createPublicKey(crypto.createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: 'der', type: 'pkcs8' })).export({ format: 'der', type: 'spki' }).subarray(-32);
/** 64 bytes that are a keypair: the last 32 the public key of the first 32 (a signature never is) */
export const isKeypair = (b) => !!b && b.length === 64 && edPublic(b.subarray(0, 32)).equals(b.subarray(32));
export function b58decode(s) {
  let n = 0n; for (const c of s) { const v = B58_AT.get(c); if (v === undefined) return null; n = n * 58n + BigInt(v); }
  const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; } for (const c of s) { if (c !== '1') break; out.unshift(0); }
  return Buffer.from(out);
}
export function b58encode(b) {
  let n = BigInt(`0x${b.toString('hex') || '0'}`), s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const x of b) { if (x !== 0) break; s = `1${s}`; } return s;
}
/** a BIP39 phrase of the standard's list from 16 to 32 bytes of entropy, its checksum the first bits of the entropy's sha256 */
export function mnemonicOf(entropy) {
  const bits = (b) => [...b].map((x) => x.toString(2).padStart(8, '0')).join('');
  const all = bits(entropy) + bits(crypto.createHash('sha256').update(entropy).digest()).slice(0, entropy.length / 4);
  return all.match(/.{11}/g).map((x) => BIP39[parseInt(x, 2)]).join(' ');
}
/** in a run of short lowercase words, every stretch of 12 or more BIP39 words is withheld, the rest kept with its spacing */
function phrasesIn(run, w) {
  const parts = run.split(/(\s+)/), words = parts.filter((_, k) => k % 2 === 0); let out = '', k = 0;
  while (k < words.length) {
    if (!BIP39_AT.has(words[k])) { out += words[k] + (parts[2 * k + 1] ?? ''); k++; continue; }
    let e = k; while (e + 1 < words.length && BIP39_AT.has(words[e + 1])) e++;
    if (e - k + 1 >= 12) { w.keys++; out += PHRASE; } else for (let q = k; q <= e; q++) out += words[q] + (q < e ? parts[2 * q + 1] : '');
    out += parts[2 * e + 1] ?? ''; k = e + 1;
  }
  return out;
}
const KEYS = [
  [/(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{80,90}(?![1-9A-HJ-NP-Za-km-z])/g, (m) => (isKeypair(b58decode(m)) ? KEY : m)],   // a keypair in base58
  [/(?<![0-9a-fA-F])[0-9a-fA-F]{128}(?![0-9a-fA-F])/g, (m) => (isKeypair(Buffer.from(m, 'hex')) ? KEY : m)],                       // a keypair in hex
  [/\b0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g, (m) => (RUN.test(m) ? m : KEY)],                                                         // an 0x key
  [/(\b(?:private|secret|priv|seed|sk|signing)\b[^\n]{0,40}?)(?<![0-9a-fA-F])([0-9a-fA-F]{64})(?![0-9a-fA-F])/gi, (m, a, h) => (RUN.test(h) ? m : `${a}${KEY}`)],   // a key said
  [/(?<![A-Za-z])[a-z]{3,8}(?:\s+[a-z]{3,8}){11,}(?![A-Za-z])/g, null],                                                                // a seed phrase
];

/** the steps 1 to 4 over one text, pure -> { text, withheld, n } */
export function gateText(text, { own = [], allow = [] } = {}) {
  let t = String(text ?? '').normalize('NFKC'); const w = { invisible: 0, own: 0, shapes: 0, keys: 0 };
  t = t.replace(INVISIBLE, () => { w.invisible++; return ''; });
  for (const v of own) { const n = t.split(v).length - 1; if (n) { w.own += n; t = t.split(v).join(SECRET); } }
  for (const [rx, to] of SHAPES) t = t.replace(rx, (...m) => { w.shapes++; return to(...m); });
  for (const [rx, to] of KEYS) t = t.replace(rx, (...m) => { if (!to) return phrasesIn(m[0], w); const r = to(...m); if (r !== m[0]) w.keys++; return r; });
  const s = sanitizeText(t, { allow });
  return { text: s.text, withheld: { ...s.withheld, ...w }, n: s.n + w.own + w.shapes + w.keys };
}

const ran = (cmd, args, opts) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 << 20, timeout: 180000, ...opts });
export function scannersHere(names = SCANNERS) { return names.filter((n) => { const r = ran(n, ['--version'], { timeout: 15000 }); return !r.error && r.status === 0; }); }
/** step 5: the scanners over one text -> { found: Set of secrets, by: {scanner: count} } */
export function scan(text, scanners = SCANNERS) {
  const found = new Set(), by = {};
  for (const name of scanners) {
    let list = [];
    if (name === 'gitleaks') {
      const r = ran('gitleaks', ['stdin', '--no-banner', '--no-color', '--log-level', 'error', '--report-format', 'json', '--report-path', '-', '--exit-code', '0'], { input: text });
      if (r.error || r.status !== 0) throw new Error(`gitleaks: ${r.error ? r.error.message : (r.stderr || '').slice(0, 200)}`);
      list = (JSON.parse(r.stdout || '[]') || []).map((x) => x.Secret);
    } else if (name === 'trufflehog') {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracenet-offer-')), f = path.join(dir, 'offer.txt');
      try { fs.writeFileSync(f, text, { mode: 0o600 }); const r = ran('trufflehog', ['filesystem', f, '--json', '--no-verification', '--no-update', '--log-level=-1']);
        if (r.error) throw new Error(`trufflehog: ${r.error.message}`);
        for (const l of (r.stdout || '').split('\n')) { if (!l.startsWith('{')) continue; try { const d = JSON.parse(l); if (d.Raw) list.push(d.Raw); if (d.RawV2 && d.RawV2 !== d.Raw) list.push(d.RawV2); } catch {} }
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    } else throw new Error(`no scanner named ${name}`);
    list = list.filter((s) => typeof s === 'string' && s.length >= 6 && !s.includes(SECRET) && !s.startsWith('[withheld'));
    by[name] = list.length; for (const s of list) found.add(s);
  }
  return { found, by };
}

/** gate(texts, {own, allow, scanners}): the five steps over every text; the scanners run once over all of them */
export function gate(texts, { own = new Set(), allow = [], scanners = SCANNERS } = {}) {
  const ownList = [...own].filter((v) => v && v.length >= 8).sort((a, b) => b.length - a.length);
  const g = texts.map((t) => gateText(t, { own: ownList, allow })), withheld = {};
  for (const x of g) for (const [k, v] of Object.entries(x.withheld)) withheld[k] = (withheld[k] || 0) + v;
  let out = g.map((x) => x.text), n = g.reduce((a, x) => a + x.n, 0), by = {};
  if (scanners.length) {
    const s = scan(out.join('\n'), scanners); by = s.by; let k = 0;
    const found = [...s.found].sort((a, b) => b.length - a.length);
    out = out.map((t) => { for (const v of found) { const c = t.split(v).length - 1; if (c) { k += c; t = t.split(v).join(SECRET); } } return t; });
    withheld.scanners = k; n += k;
  }
  return { texts: out, withheld, n, scanners: by };
}

// ---------- the canaries ----------
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', LOWER = 'abcdefghijklmnopqrstuvwxyz', DIGITS = '0123456789';
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** canaryBank(seed): [[kind, the line laid in, the secret that must not be readable after the gate]], and the one "own" secret the bank registers */
export function canaryBank(seed = 1) {
  const r = rng(seed), s = (n, abc = B62) => Array.from({ length: n }, () => abc[Math.floor(r() * abc.length)]).join(''), num = (n) => Math.floor(r() * n);
  const bytes = (n) => Buffer.from(Array.from({ length: n }, () => num(256)));
  const own = `own-${s(24)}`, user = s(7, LOWER), pem = s(64, B62 + '+/'), pass = (n) => s(n), words = mnemonicOf(bytes(16));
  const keypair = `[${Array.from({ length: 64 }, () => num(256)).join(',')}]`, items = [];
  const add = (kind, line, secret = line) => items.push([kind, line, secret]);
  add('aws', `AKIA${s(16, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')}`); add('github', `ghp_${s(36)}`); add('slack', `xoxb-${s(12, DIGITS)}-${s(12, DIGITS)}-${s(24)}`);
  add('openai', `sk-proj-${s(48)}`); add('anthropic', `sk-ant-api03-${s(80)}AA`); add('stripe', `sk_live_${s(24)}`); add('google', `AIza${s(35, B62 + '_-')}`);
  add('jwt', `eyJ${s(20)}.eyJ${s(40)}.${s(43)}`); add('pem', `-----BEGIN EC PRIVATE KEY-----\n${pem}\n-----END EC PRIVATE KEY-----`, pem);
  add('keypair', keypair); { const v = pass(20); add('env-line', `DATABASE_PASSWORD=${v}`, v); } { const v = pass(16); add('url-password', `git remote add deploy https://deploy:${v}@git.example.net/repo.git`, v); }
  { const v = pass(18); add('json-field', `{"password": "${v}"}`, v); } add('email', `${s(8, LOWER)}@${s(6, LOWER)}.org`); add('lan', `192.168.${num(250)}.${num(250) + 2}`);
  add('home', `/Users/${user}/projects/notes.txt`, `/Users/${user}`); add('own', own); { const v = pass(14); add('password-in-words', `the wifi password is ${v}`, v); }
  add('phone', `+1 415 ${s(3, DIGITS)} ${s(4, DIGITS)}`);
  { const k = bytes(32); add('base58-secret', b58encode(Buffer.concat([k, edPublic(k)]))); } add('seed-phrase', words); add('hex-key', `0x${s(64, '0123456789abcdef')}`);   // the three a shape cannot tell, made as the real ones are
  return { own: [own], items };
}
/** recallOf(texts, opts, seed): the canaries laid into a copy of the texts at line ends drawn from the seed, the gate run on the copy -> what it caught */
export function recallOf(texts, { own = new Set(), allow = [], scanners = SCANNERS } = {}, seed = 1) {
  const bank = canaryBank(seed), r = rng(seed ^ 0x5eed), copy = texts.length ? texts.slice() : [''];
  const laid = copy.map((t) => ({ lines: t.split('\n'), at: [] }));   // each canary's place drawn among the text's own lines, so none falls inside another's block
  bank.items.forEach(([, line]) => { const x = laid[Math.floor(r() * laid.length)]; x.at.push([Math.floor(r() * (x.lines.length + 1)), line]); });
  laid.forEach((x, j) => { x.at.sort((a, b) => b[0] - a[0]).forEach(([k, line]) => x.lines.splice(k, 0, line)); copy[j] = x.lines.join('\n'); });
  const g = gate(copy, { own: new Set([...own, ...bank.own]), allow, scanners }), all = g.texts.join('\n');
  const missed = bank.items.filter(([, , secret]) => all.includes(secret)).map(([kind]) => kind);
  return { seed, seeded: bank.items.length, caught: bank.items.length - missed.length, recall: (bank.items.length - missed.length) / bank.items.length, missed };
}

/** ownSecretsOf({env, dirs, keyFiles}): the creator's own secrets on this Mac, held in memory only, never written or said: the environment's secret-named
 *  values, every value of the .env files in the folders worked in, the private keys of the house's key files (their base64 lines), each with its base64 */
export function ownSecretsOf({ env = process.env, dirs = [], keyFiles = [] } = {}) {
  const out = new Set(), add = (v) => { v = String(v ?? '').trim().replace(/^(['"])(.*)\1$/, '$2'); if (v.length < 8 || /^(?:true|false|null|undefined|\d+)$/i.test(v) || /^[/~.]/.test(v) || /^https?:\/\/[^:@]*$/.test(v)) return; out.add(v); out.add(Buffer.from(v).toString('base64').replace(/=+$/, '')); };
  for (const [k, v] of Object.entries(env || {})) if (SECRET_NAME.test(k)) add(v);
  for (const d of new Set(dirs)) for (const n of ['.env', '.env.local', '.env.production', '.dev.vars']) {
    let text = ''; try { text = fs.readFileSync(path.join(d, n), 'utf8'); } catch { continue; }
    for (const l of text.split('\n')) { const m = l.match(/^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.+?)\s*$/); if (m) add(m[1]); }
  }
  for (const f of keyFiles) {
    let j = null; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    for (const v of [j.private_pem, j.pkcs8, j.secret, j.private_key].filter((x) => typeof x === 'string')) for (const l of v.split(/\\n|\n/)) if (!/-----/.test(l)) add(l);
    if (Array.isArray(j) && j.length === 64) add(JSON.stringify(j));
  }
  return out;
}
/** the folders a span worked in, and each one's parents up to the home: where its .env files would stand */
export function dirsOf(cwds, home = os.homedir()) {
  const out = new Set();
  for (let d of cwds) { if (!d) continue; for (let k = 0; k < 12 && d && d.startsWith(home) && d !== home; k++) { out.add(d); d = path.dirname(d); } }
  return [...out];
}
