// offer.test.mjs · THE OFFERING ROAD: the fixes read off a transcript, the card and its raw turns, the span read without the rest, the gate and its canaries,
// the cut whole, the watcher on its cause, and the measure's undoing of a fix. Every session, path, name and secret here is invented.
// node --test tools/embertide-mesh/tracenet-offer/offer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkOf, verdictOf, countsOf, signatureOf, eventsOf, fixesOf } from './fixes.mjs';
import { cardOf, rawOf, TYPED } from './card.mjs';
import { transcriptsOf, spanLines, hoursOf } from './span.mjs';
import { gateText, gate, recallOf, canaryBank, ownSecretsOf, dirsOf, edPublic, isKeypair, b58decode, b58encode, mnemonicOf, BIP39_SHA256 } from './gate.mjs';
import { cutOffer, writeOffer, lastOf, watch, strings, rebuilt, SPAN_REF, LAST_REF } from './offer.mjs';
import { applied, reversed, promptOf } from './measure.mjs';

const HOME = '/home/mira', REPO = `${HOME}/work/kiln`, T0 = Date.parse('2021-03-04T10:00:00Z');
let n = 0; const uuid = () => `u-${String(++n).padStart(4, '0')}`;
const at = (s) => new Date(T0 + s * 1000).toISOString();
/** a little transcript: a check fails, an edit that does not hold, the check fails again, the agent says why, the right edit, the check passes, a commit */
function session() {
  n = 0; const L = [], base = { cwd: REPO, sessionId: 's-kiln', gitBranch: 'lane/the-kiln' };
  const use = (s, id, name, input, text) => L.push({ ...base, type: 'assistant', timestamp: at(s), uuid: uuid(), message: { content: [...(text ? [{ type: 'text', text }] : []), { type: 'tool_use', id, name, input }] } });
  const res = (s, id, content, extra = {}) => L.push({ ...base, type: 'user', timestamp: at(s), uuid: uuid(), message: { content: [{ type: 'tool_result', tool_use_id: id, content, ...extra.block }] }, ...(extra.result ? { toolUseResult: extra.result } : {}) });
  L.push({ ...base, type: 'user', timestamp: at(0), uuid: uuid(), message: { content: 'make the kiln test pass please' } });
  use(1, 't1', 'Bash', { command: `cd ~/work/kiln && perl -e 'alarm 60; exec @ARGV' node --test lib/heat.test.mjs 2>&1 | tail -5` });
  res(2, 't1', 'ℹ tests 4\nℹ pass 3\nℹ fail 1\n✖ the kiln holds its heat (2ms)\nAssertionError [ERR_ASSERTION]: expected 900 got 0');
  use(3, 't2', 'Edit', { file_path: `${REPO}/lib/heat.mjs`, old_string: 'return 0;', new_string: 'return null;' });
  res(4, 't2', 'ok', { result: { originalFile: 'export const heat = () => { return 0; };\n' } });
  use(5, 't3', 'Bash', { command: 'cd ~/work/kiln && node --test lib/heat.test.mjs' });
  res(6, 't3', 'ℹ tests 4\nℹ pass 3\nℹ fail 1\n✖ the kiln holds its heat (1ms)\nAssertionError [ERR_ASSERTION]: expected 900 got null', { block: { is_error: true } });
  L.push({ ...base, type: 'assistant', timestamp: at(7), uuid: uuid(), message: { content: [{ type: 'thinking', thinking: 'a private thought' }, { type: 'text', text: 'The kiln returns no heat at all: the heat is the fuel times its burn. <system-reminder>never offered</system-reminder>' }] } });
  use(8, 't4', 'Edit', { file_path: `${REPO}/lib/heat.mjs`, old_string: 'return null;', new_string: 'return fuel * burn;' });
  res(9, 't4', 'ok', { result: { originalFile: null } });
  use(10, 't5', 'Bash', { command: 'cd ~/work/kiln && node --test lib/heat.test.mjs lib/door.test.mjs' });
  res(11, 't5', 'ℹ tests 7\nℹ pass 7\nℹ fail 0');
  use(12, 't6', 'Bash', { command: 'cd ~/work/kiln && git commit -q -am "The kiln holds its heat: fuel times burn" && git log --oneline -1' });
  res(13, 't6', 'abc1234 The kiln holds its heat: fuel times burn');
  return L;
}

test('a check is read off its wrappers, its cd (a home said ~) and its pipes; what it says is a fail, a pass, or nothing to trust', () => {
  const c = checkOf(`cd ~/work/kiln && perl -e 'alarm 60; exec @ARGV' nice -n 19 node --test lib/heat.test.mjs 2>&1 | tail -5`, '/elsewhere', HOME);
  assert.deepEqual([c.dir, c.core, c.files], [REPO, 'node --test lib/heat.test.mjs', ['lib/heat.test.mjs']]);
  assert.equal(checkOf('git status && ls', REPO), null);
  assert.equal(checkOf('cargo test --locked', REPO).core, 'cargo test --locked');
  assert.equal(verdictOf('ℹ tests 4\nℹ pass 3\nℹ fail 1', false), 'fail', 'a fail count, whatever the exit');
  assert.equal(verdictOf('# tests 2\n# pass 2\n# fail 0', false), 'pass');
  assert.equal(verdictOf('Exit code 1\nℹ tests 21\nℹ pass 21\nℹ fail 0\n(eval):1: no matches found: x*.test.mjs', true), null, 'a shell error after a green run says nothing');
  assert.equal(verdictOf('test result: FAILED. 3 passed; 1 failed', false), 'fail');
  assert.equal(verdictOf('    Finished `test` profile\ntest result: ok. 12 passed; 0 failed', false), 'pass');
  assert.equal(verdictOf('Exit code 1\nTypeError: x is not a function', true), 'fail');
  assert.deepEqual(countsOf('ℹ tests 7\nℹ pass 7\nℹ fail 0'), { pass: 7, fail: 0, tests: 7 });
  assert.deepEqual(countsOf('=== 5 passed, 2 failed in 0.3s ==='), { pass: 5, fail: 2, tests: 7 });
  assert.match(signatureOf('ℹ fail 1\n✖ the kiln holds its heat (2ms)\nAssertionError [ERR_ASSERTION]: expected 900 got 0'), /^✖ the kiln holds its heat \(2ms\) · AssertionError/);
});

test('a solved fix: the failure, the try that did not hold, the words before the edit that did, the passing check that names its file; one fix answers two checks once', () => {
  const f = fixesOf(eventsOf(session(), { home: HOME }));
  assert.equal(f.length, 1);
  const x = f[0];
  assert.equal(x.check.core, 'node --test lib/heat.test.mjs'); assert.equal(x.pass.core, 'node --test lib/heat.test.mjs lib/door.test.mjs', 'a wider run that names the file answers it');
  assert.equal(x.tries.length, 1, 'the first edit did not hold'); assert.match(x.tries[0].sig, /got null/);
  assert.deepEqual(x.words, ['The kiln returns no heat at all: the heat is the fuel times its burn.'], 'the agent\'s own words, the harness\'s reminder out');
  assert.deepEqual(x.files, [`${REPO}/lib/heat.mjs`]); assert.equal(x.edits.length, 2);
  // a pass with no edit since the failure is no fix; a change over the bounds is no one fix
  const flake = session().filter((d) => !JSON.stringify(d).includes('"name":"Edit"') && !JSON.stringify(d).includes('originalFile'));
  assert.equal(fixesOf(eventsOf(flake, { home: HOME })).length, 0);
  assert.equal(fixesOf(eventsOf(session(), { home: HOME }), { maxEdits: 1 }).length, 0);
  // the commit after the pass is an event with its sha, even when -q prints no [branch sha]
  const commit = eventsOf(session(), { home: HOME }).find((e) => e.kind === 'commit'); assert.equal(commit.sha, 'abc1234'); assert.equal(commit.text, 'The kiln holds its heat: fuel times burn');
});

test('the card: where the check runs and the files from the deepest folder holding them, the why, the fix, the check, the try; the raw turns hold no thought and no typed word', () => {
  const L = session(), x = fixesOf(eventsOf(L, { home: HOME }))[0], c = cardOf(x, { session: 's-kiln', project: 'work-kiln' });
  assert.deepEqual(c.localize, ['lib/heat.mjs']); assert.equal(c.when.check, 'node --test lib/heat.test.mjs'.replace(/^/, 'cd . && ').replace('cd . && ', ''));
  assert.deepEqual(c.when.langs, ['JavaScript']); assert.match(c.understand, /fuel times its burn/);
  assert.deepEqual(c.fix.map((h) => [h.file, h.new]), [['lib/heat.mjs', 'return null;'], ['lib/heat.mjs', 'return fuel * burn;']]);
  assert.equal(c.verify.said, 'pass 7 of 7'); assert.equal(c.tried.length, 1);
  assert.match(c.md, /^### ✖ the kiln holds its heat/); assert.match(c.md, /\*\*Fix:\*\* in `lib\/heat\.mjs`, `return null;` → `return fuel \* burn;`/);
  assert.ok(c.md.length < 1500, `a card is short: ${c.md.length}`); assert.equal(cardOf(x, { session: 's-kiln' }).id, c.id, 'the same fix, the same id');
  const raw = rawOf(L, x), all = JSON.stringify(raw);
  assert.equal(raw[0].typed, 'withheld'); assert.ok(!all.includes('a private thought'), 'no thinking'); assert.ok(!all.includes('never offered'), 'no reminder');
  const typed = rawOf(L, { ...x, fail: { ...x.fail, i: 0 } }); assert.equal(typed[1].content[0].text, TYPED, 'a typed message is withheld');
  assert.equal(rawOf(L, { ...x, fail: { ...x.fail, i: 0 } }, { hisWords: true })[1].content[0].text, 'make the kiln test pass please', 'kept only when his hand says so');
});

test('the span: every line inside it, in the file\'s order, a block a fork copied with older times included; only those lines parsed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-span-')), f = path.join(dir, 'long.jsonl'), pad = 'x'.repeat(3000), lines = [];
  for (let k = 0; k < 4000; k++) lines.push(JSON.stringify({ type: 'assistant', timestamp: new Date(T0 + k * 60000).toISOString(), k, message: { content: [{ type: 'text', text: pad }] } }));
  lines.push(lines[2003].replace('"k":2003', '"k":-2003'), '{"type":"summary","summary":"no time"}', lines[10]);   // a fork's copy of older lines after newer ones
  fs.writeFileSync(f, lines.join('\n') + '\n');
  try {
    const s = await spanLines(f, T0 + 2000 * 60000, T0 + 2009 * 60000);
    assert.deepEqual(s.lines.map((d) => d.k), [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, -2003]);
    assert.equal(s.bytes, fs.statSync(f).size, 'every byte read once: no order to search by');
    assert.deepEqual((await spanLines(f, T0 - 3600e3, T0 + 60000)).lines.map((d) => d.k), [0, 1]);
    const list = await transcriptsOf(dir, T0, T0 + 1); assert.deepEqual(list.map((t) => t.session), ['long'], 'written after the span began');
    // THE CUT READS ITS HOURS: the first indexed read reads the file once; the next reads its hours' bytes and the guard; an append grows the index by its tail
    const hours = path.join(dir, 'hours'), size = fs.statSync(f).size;
    const a = await spanLines(f, T0 + 2000 * 60000, T0 + 2009 * 60000, { dir: hours });
    assert.deepEqual(a.lines.map((d) => d.k), [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, -2003], 'the same lines, the fork\'s copy included');
    assert.ok(a.bytes >= size && a.bytes < size + 400000, `the first indexed read: ${a.bytes} of ${size}`);
    const b = await spanLines(f, T0 + 2000 * 60000, T0 + 2009 * 60000, { dir: hours });
    assert.deepEqual(b.lines.map((d) => d.k), a.lines.map((d) => d.k)); assert.ok(b.bytes < size / 10, `the second read: ${b.bytes} of ${size}`);
    fs.appendFileSync(f, JSON.stringify({ type: 'assistant', timestamp: new Date(T0 + 2005 * 60000 + 1).toISOString(), k: 9999, message: { content: [] } }) + '\n');
    const c = await spanLines(f, T0 + 2000 * 60000, T0 + 2009 * 60000, { dir: hours });
    assert.equal(c.lines.at(-1).k, 9999, 'an appended line inside the span is found'); assert.ok(c.bytes < size / 10, `after an append: ${c.bytes}`);
    const idx = await hoursOf(f, { dir: hours }); assert.equal(idx.bytes, 256, 'nothing new: only the guard is read'); assert.ok(Object.keys(idx.hours).length >= 60);
    fs.writeFileSync(f, lines.slice(0, 50).join('\n') + '\n');   // a rewrite: indexed again from its first byte
    const d = await spanLines(f, T0, T0 + 3 * 60000, { dir: hours }); assert.deepEqual(d.lines.map((x) => x.k), [0, 1, 2, 3]);
    assert.deepEqual((await spanLines(f, T0 + 2000 * 60000, T0 + 2009 * 60000, { dir: hours })).lines, [], 'the rewritten file holds none of the old span');
    assert.deepEqual(await transcriptsOf(dir, Date.now() + 864e5), [], 'a transcript untouched since before the span holds none of it');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the gate: invisible characters out, the creator\'s own secrets exactly, the shapes, the Nest\'s pass; the canaries, all 22 kinds caught', () => {
  const own = ['own-ZqT3xVb8nLm2KpR7'];
  const g = gateText(`a​b‮c token own-ZqT3xVb8nLm2KpR7 and sk_live_0123456789abcdefABCD\nDB_PASSWORD=hunter2hunter2 and https://u:p4ssw0rd@git.example.net\n` +
    `the password is Opal-Sky-Nine and +44 20 7946 0958 and a@b.io at 10.0.0.9 in /Users/mira/notes`, { own });
  for (const gone of ['​', '‮', 'own-ZqT3', 'sk_live_', 'hunter2', 'p4ssw0rd', 'Opal-Sky', '7946', 'a@b.io', '10.0.0.9', '/Users/mira']) assert.ok(!g.text.includes(gone), gone);
  assert.ok(g.text.includes('DB_PASSWORD=') && g.text.includes('https://u:'), 'the names stay, the values go');
  assert.equal(g.withheld.invisible, 2); assert.equal(g.withheld.own, 1); assert.ok(g.withheld.shapes >= 5);
  const r = recallOf(['line one\nline two', 'another text'], { scanners: [] }, 7);
  assert.equal(r.seeded, 22); assert.deepEqual(r.missed, []); assert.equal(r.caught, 22);
  for (const sd of [1, 2, 3, 99]) assert.deepEqual(recallOf(['some text'], { scanners: [] }, sd).missed, [], `seed ${sd}`);
  assert.deepEqual(canaryBank(7), canaryBank(7), 'the same seed, the same canaries'); assert.notDeepEqual(canaryBank(7).items, canaryBank(8).items);
  assert.equal(gate(['x'], { scanners: [] }).texts[0], 'x');
});

test('the keys, by proof: a keypair in base58 or hex, a seed phrase, an 0x key and a key said; a signature, a hash and prose stay', () => {
  const words = fs.readFileSync(new URL('./bip39-english.txt', import.meta.url), 'utf8');
  assert.equal(crypto.createHash('sha256').update(words).digest('hex'), BIP39_SHA256, 'the standard\'s own list'); assert.equal(words.trim().split('\n').length, 2048);
  assert.equal(mnemonicOf(Buffer.alloc(16, 0)), 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', 'BIP39 vector');
  assert.equal(mnemonicOf(Buffer.alloc(16, 0xff)), 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong', 'BIP39 vector');
  assert.equal(edPublic(Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex')).toString('hex'),
    'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'RFC 8032 test 1');
  const seed = crypto.createHash('sha256').update('kiln').digest(), pair = Buffer.concat([seed, edPublic(seed)]), sig = crypto.createHash('sha512').update('a signature').digest();
  assert.ok(isKeypair(pair) && !isKeypair(sig)); assert.ok(b58decode(b58encode(pair)).equals(pair)); assert.equal(b58encode(Buffer.from([0, 0, 1])), '112');
  const phrase = mnemonicOf(crypto.createHash('sha256').update('mira').digest().subarray(0, 16)), typo = phrase.split(' ').slice(0, 11).concat('zoo').join(' ');
  const hash = crypto.createHash('sha256').update('a file').digest('hex'), hex = crypto.createHash('sha256').update('k').digest('hex');
  const g = gateText([`the deploy key ${b58encode(pair)} and a sig ${b58encode(sig)}`, `hex ${pair.toString('hex')} and ${sig.toString('hex')}`,
    `my words: ${phrase}`, `typed wrong: ${typo}`, `evm 0x${hex}`, `private key: ${hex}`, `the file's sha256 ${hash}`,
    'every line read through the gate keeps what passed and drops what failed before cards reach anyone', BIP39_SHA256,
    'const secp256k1P=BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f")'].join('\n'));
  for (const gone of [b58encode(pair), pair.toString('hex'), phrase, typo, `0x${hex}`, `key: ${hex}`]) assert.ok(!g.text.includes(gone), gone.slice(0, 12));
  for (const kept of [b58encode(sig), sig.toString('hex'), hash, 'every line read through the gate keeps', 'private key: [withheld', BIP39_SHA256, 'fffffffefffffc2f'])
    assert.ok(g.text.includes(kept), kept.slice(0, 24));
  assert.equal(g.withheld.keys, 6);
  const eleven = phrase.split(' ').slice(0, 11).join(' '); assert.ok(gateText(`- ${eleven}.`).text.includes(eleven), 'eleven words are not a phrase');
});

test('the creator\'s own secrets: the environment\'s secret-named values and the .env files of the folders worked in, never a path, a word of no length or a flag', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-own-'));
  try {
    fs.writeFileSync(path.join(dir, '.env'), 'API_TOKEN=tok_8f7e6d5c4b3a\nexport DEBUG=true\nSHORT=abc\n');
    fs.writeFileSync(path.join(dir, 'k.key.json'), JSON.stringify({ seat: 'x', private_pem: '-----BEGIN PRIVATE KEY-----\\nMC4CAQAwBQYDK2VwBCIEIKkvT9\\n-----END PRIVATE KEY-----\\n' }));
    const own = ownSecretsOf({ env: { MY_SECRET_KEY: 'sec_1234567890', PATH: '/usr/bin:/bin', SSH_AUTH_SOCK: '/tmp/agent.sock' }, dirs: [dir], keyFiles: [path.join(dir, 'k.key.json')] });
    for (const v of ['sec_1234567890', 'tok_8f7e6d5c4b3a', 'MC4CAQAwBQYDK2VwBCIEIKkvT9']) assert.ok(own.has(v), v);
    for (const v of ['/usr/bin:/bin', '/tmp/agent.sock', 'true', 'abc']) assert.ok(!own.has(v), v);
    assert.ok(own.has(Buffer.from('sec_1234567890').toString('base64').replace(/=+$/, '')), 'its base64 too');
    assert.deepEqual(dirsOf([`${HOME}/work/kiln/lib`], HOME), [`${HOME}/work/kiln/lib`, `${HOME}/work/kiln`, `${HOME}/work`]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the cut whole: a span of a folder of transcripts -> one card, every string gated, the recall said; the bundle is private; the last cut says counts only', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-cut-')), out = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-out-')), proj = path.join(root, '-home-mira-work-kiln');
  fs.mkdirSync(proj); const L = session(); L[7].message.content[1].text += ' The deploy key was ghp_abcdefghijklmnopqrstuvwxyz0123456789 once.';
  fs.writeFileSync(path.join(proj, 's-kiln.jsonl'), L.map((d) => JSON.stringify(d)).join('\n') + '\n');
  try {
    const c = await cutOffer({ from: T0, to: T0 + 60000, root, scanners: [], env: {}, keyFiles: [], hoursDir: path.join(out, 'hours') });
    assert.equal(c.cards.length, 1); assert.equal(c.offer.fixes, 1); assert.equal(c.offer.read.transcripts, 1);
    assert.ok(!c.raws[0].includes('ghp_abcdef') && !JSON.stringify(c.cards).includes('ghp_abcdef'), 'a token in the agent\'s words is withheld in the card and the raw');
    assert.equal(c.offer.gate.recall.seeded, 22); assert.equal(c.offer.gate.recall.caught, 22);
    const dir = writeOffer(out, c);
    assert.equal(fs.statSync(dir).mode & 0o777, 0o700); assert.equal(fs.statSync(path.join(dir, 'offer.json')).mode & 0o777, 0o600);
    assert.ok(fs.existsSync(path.join(dir, 'cards', `${c.cards[0].id}.md`)) && fs.existsSync(path.join(dir, 'raw', `${c.cards[0].id}.jsonl`)));
    const last = lastOf(c.offer, 3, dir); assert.equal(last.cards, 1); assert.equal(last.span.rev, 3); assert.equal(last.span.from_ms, T0);
    assert.ok(!JSON.stringify(last).includes('kiln holds'), 'the last cut carries no word of a card');
    await assert.rejects(cutOffer({ from: T0, to: T0, root, hoursDir: null }), /a span/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true }); }
  const o = { a: ['x', { b: 'y' }], c: 3 }; let k = 0; assert.deepEqual(strings(o), ['x', 'y']); assert.deepEqual(rebuilt(o, () => `#${k++}`), { a: ['#0', { b: '#1' }], c: 3 });
});

test('the watcher cuts a span once, on its cause; a span already cut is not cut again; it writes the last cut signed through its client', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-watch-')), out = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-wout-')), proj = path.join(root, 'p');
  fs.mkdirSync(proj); fs.writeFileSync(path.join(proj, 's-kiln.jsonl'), session().map((d) => JSON.stringify(d)).join('\n') + '\n');
  const refs = { [SPAN_REF]: { rev: 2, value: { from_ms: T0, to_ms: T0 + 60000 } } }, writes = [];
  const client = { ref: async (name) => refs[name] ?? null, cas: async (name, value, rev) => { writes.push({ name, value, rev }); refs[name] = { rev: (rev || 0) + 1, value }; return refs[name]; } };
  try {
    const c = await watch({ client, nest: 'http://127.0.0.1:1', out, root, scanners: [], hoursDir: path.join(out, 'hours'), say: () => {}, once: true });
    assert.equal(c.cards.length, 1); assert.equal(writes.length, 1); assert.equal(writes[0].name, LAST_REF); assert.equal(writes[0].value.span.rev, 2);
    assert.equal(await watch({ client, nest: 'http://127.0.0.1:1', out, root, scanners: [], hoursDir: path.join(out, 'hours'), say: () => {}, once: true }), null, 'the same span: no second cut');
    assert.equal(writes.length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true }); }
});

test('the measure undoes a fix from the file after it, and its prompts differ only by the card', () => {
  const before = 'const a = 1;\nconst b = 2;\n', edits = [{ old: 'const a = 1;', new: 'const a = 10;' }, { old: 'const b = 2;', new: 'const b = 20;' }];
  const after = applied(before, edits); assert.equal(after, 'const a = 10;\nconst b = 20;\n'); assert.equal(reversed(after, edits), before);
  assert.equal(reversed('const a = 10;\nconst a = 10;\n', edits.slice(0, 1)), null, 'an edit that does not undo exactly once');
  assert.equal(reversed('x', [{ write: true, new: 'x' }]), null, 'a file written whole with no first state');
  const p = promptOf({ check: 'node --test a.test.mjs', sig: '✖ a' }), q = promptOf({ check: 'node --test a.test.mjs', sig: '✖ a', card: '### the card' });
  assert.ok(q.startsWith(p) && q.endsWith('### the card') && !p.includes('card from'));
});
