// span.mjs · THE OFFERING ROAD: the transcripts' lines inside a span of time. A transcript is NOT in time order: a fork or a resume copies its parent's lines
// with their own times after newer ones (read on the new Mac, Oct 30 2026: in the 40 newest transcripts, 181,097 of 278,993 assistant lines stood more than a
// minute behind a line before them), so no search by time over the bytes holds. A line's own time is read off its bytes (the first "timestamp":" in a line is
// its own: 537,557 of 537,557 lines sampled), and only a line inside the span is parsed.
// THE CUT READS ITS HOURS (Oct 30 2026 10:4x UTC). His two picks under the laboratory at 07:55 each read 796 transcripts whole, 16.1 GB, to cut a span of
// three days and one of an hour (20 s each). A transcript is append-only, so where each hour's lines lie is kept beside the offers, one small file per
// transcript, and grown by its appends only (the same file, no shorter than what was indexed, the 256 bytes before that end unchanged; anything else is
// indexed again from its first byte). A cut reads the index, each transcript's new tail, and its own hours' bytes; nothing else.
//   transcriptsOf(root, from)         -> [{ file, project, session, size, mtime }]   every *.jsonl under root, its subagents' too, written since `from`
//   hoursOf(file, {dir})              -> { hours: { 'YYYY-MM-DDTHH': [[start, end], ...] }, bytes (read now) }   the index, grown to the file's end
//   spanLines(file, from, to, {dir})  -> { lines (parsed, in the file's order), bytes (read) }   with no dir, every byte is read (the first cut's way)
// COST: the first cut over a transcript reads it once, as before; after it, a cut reads its hours' bytes and what was appended since. The index of a
// transcript is a few hundred bytes to a few KB (~/.embertide/tracenet/hours, the membrane's level 0). Nothing runs at rest.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const CHUNK = 4 << 20, LINE_MAX = 64 << 20, GUARD = 256, KEY = Buffer.from('"timestamp":"'), HOUR = 3600e3, INDEX_V = 1;
export const projectOf = (dir) => dir.replace(/^-(?:Users|home)-[^-]+-/, '').slice(0, 64);
export const hourKeyOf = (ms) => new Date(Math.floor(ms / HOUR) * HOUR).toISOString().slice(0, 13);

export async function transcriptsOf(root, from, { fsp = fs.promises } = {}) {
  const out = [];
  async function walk(dir, project, depth) {
    let names = []; try { names = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < 3) await walk(f, project ?? projectOf(e.name), depth + 1); continue; }
      if (!e.name.endsWith('.jsonl')) continue;
      let st; try { st = await fsp.stat(f); } catch { continue; }
      if (st.mtimeMs < from) continue;   // untouched since before the span began: none of its lines is inside it
      out.push({ file: f, project: project ?? '', session: e.name.replace(/\.jsonl$/, ''), size: st.size, mtime: st.mtimeMs });
    }
  }
  await walk(root, null, 0);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** a line's own time, off its bytes: [ms, its hour's key] or null */
function stampOf(line) {
  const k = line.indexOf(KEY); if (k < 0) return null;
  const s = k + KEY.length, e = line.indexOf(34, s); if (e < 0) return null;
  const iso = line.toString('latin1', s, e), t = Date.parse(iso); if (!Number.isFinite(t)) return null;
  return [t, /^\d{4}-\d\d-\d\dT\d\d/.test(iso) && iso.endsWith('Z') ? iso.slice(0, 13) : hourKeyOf(t)];
}
/** read [a, b) of an open file in chunks, calling each(line, start) for every whole line -> the byte after the last newline read */
async function eachLine(fh, a, b, each) {
  let pos = a, rest = null, restAt = a, skip = false, last = a;
  while (pos < b) {
    const n = Math.min(CHUNK, b - pos), chunk = Buffer.allocUnsafe(n), { bytesRead } = await fh.read(chunk, 0, n, pos); if (!bytesRead) break; pos += bytesRead;
    const buf = rest ? Buffer.concat([rest, chunk.subarray(0, bytesRead)]) : chunk.subarray(0, bytesRead); let at = 0, nl;
    while ((nl = buf.indexOf(10, at)) >= 0) { if (skip) skip = false; else each(buf.subarray(at, nl), restAt + at); at = nl + 1; last = restAt + at; }
    rest = at < buf.length ? Buffer.from(buf.subarray(at)) : null; restAt += at;
    if (rest && rest.length > LINE_MAX) { rest = null; skip = true; restAt = pos; }   // a line longer than any a transcript writes: passed over to its end
  }
  return last;
}
const indexFile = (dir, file) => path.join(dir, createHash('sha1').update(path.resolve(file)).digest('hex').slice(0, 24) + '.json');

/** hoursOf(file, {dir}): the transcript's hour index, grown by what was appended since it was last read (or built from the first byte) */
export async function hoursOf(file, { dir, fsp = fs.promises } = {}) {
  const fh = await fsp.open(file, 'r');
  try {
    const st = await fh.stat(), f = indexFile(dir, file); let idx = null, bytes = 0;
    try { idx = JSON.parse(await fsp.readFile(f, 'utf8')); } catch { idx = null; }
    if (idx && (idx.v !== INDEX_V || idx.ino !== st.ino || st.size < idx.done)) idx = null;
    if (idx && idx.done > 0) {   // the bytes before the indexed end are the ones seen: an append, not a rewrite
      const g = Buffer.alloc(Math.min(GUARD, idx.done)), { bytesRead } = await fh.read(g, 0, g.length, idx.done - g.length); bytes += bytesRead;
      if (g.toString('base64') !== idx.guard) idx = null;
    }
    if (!idx) idx = { v: INDEX_V, file: path.basename(file), ino: st.ino, done: 0, guard: '', hours: {} };
    if (st.size > idx.done) {
      const h = idx.hours;
      const done = await eachLine(fh, idx.done, st.size, (line, start) => {
        const s = stampOf(line); if (!s) return;
        const end = start + line.length + 1, r = h[s[1]] || (h[s[1]] = []), lastR = r[r.length - 1];
        if (lastR && lastR[1] === start) lastR[1] = end; else r.push([start, end]);
      });
      bytes += st.size - idx.done;
      if (done > idx.done) {
        const g = Buffer.alloc(Math.min(GUARD, done)); await fh.read(g, 0, g.length, done - g.length);
        idx.done = done; idx.guard = g.toString('base64');
        await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
        const tmp = `${f}.${process.pid}.tmp`; await fsp.writeFile(tmp, JSON.stringify(idx), { mode: 0o600 }); await fsp.rename(tmp, f);
      }
    }
    return { hours: idx.hours, bytes, done: idx.done };
  } finally { await fh.close(); }
}

export async function spanLines(file, from, to, { dir = null, fsp = fs.promises } = {}) {
  const lines = [], take = (line) => { const s = stampOf(line); if (!s || !(s[0] >= from && s[0] <= to)) return; try { lines.push(JSON.parse(line.toString('utf8'))); } catch { /* a line cut short */ } };
  if (!dir) {   // every byte once, in order
    const fh = await fsp.open(file, 'r');
    try { const size = (await fh.stat()).size, end = await eachLine(fh, 0, size, take); if (end < size) { const tail = Buffer.alloc(size - end); await fh.read(tail, 0, tail.length, end); take(tail); } return { lines, bytes: size }; }
    finally { await fh.close(); }
  }
  const idx = await hoursOf(file, { dir, fsp }), ranges = [];
  for (let t = Math.floor(from / HOUR) * HOUR; t <= to; t += HOUR) for (const r of idx.hours[hourKeyOf(t)] || []) ranges.push(r);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = []; for (const r of ranges) { const m = merged[merged.length - 1]; if (m && r[0] <= m[1]) m[1] = Math.max(m[1], r[1]); else merged.push([r[0], r[1]]); }
  let bytes = idx.bytes; const fh = await fsp.open(file, 'r');
  try { for (const [a, b] of merged) { bytes += b - a; await eachLine(fh, a, b, take); } } finally { await fh.close(); }
  return { lines, bytes };
}
