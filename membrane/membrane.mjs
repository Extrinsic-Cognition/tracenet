// FIDES at the door: label, gate, receipt (Guido, Sept 7 2026: "the most important thing is information containment... FIDES";
// Sept 21 13:5x: "minirouter sells the traces... have you applied FIDES and all our info OpCogSec stuff?" after twelve astra units
// had read his kitchen reconstruction, his personal lessons file and the phones' rounds through a door that forwarded every byte).
//
// The door builds one chat body per call; everything in it crosses to MiniRouter and beyond. This module walks that body BEFORE
// it crosses: every absolute path named in a tool call or a tool output is LABELLED with its level, tool outputs that carry L0
// content are REDACTED (a transform, never a silent drop: the model reads a line saying what was withheld and why), and every
// crossing gets a RECEIPT the door appends to its ledger. It never blocks a call: a poisoned history would strand a unit; the
// redaction makes the next call clean instead. Levels (his fleet information levels, Sept 18: L0 Local/C3 never crosses,
// L1 Privileged/C2 crosses only when the wish names it, L2 Contextual/C1 crosses, L3 Public):
//   L0: secrets, envs, auth, receipts and ledgers, his personal code and lessons, corp downloads, Codex outputs, the agents' own
//       memory and config (~/.claude, ~/.codex), the lysa clone, the traces.
//   L1: ec-workspace docs, the live crate, main-claw bin and workspace, prototypes.
//   L2: a run's own copies (the swarm root) and paths the launcher allows for the run (PURSE_MEMBRANE_ALLOW, comma separated).
// Pure: membrane(chatBody, opts) -> { body, receipts, labels }. The door decides where receipts go.
import os from 'node:os';

const HOME = process.env.HOME || os.homedir();
const L0 = [
  /\/secrets\//, /\.env(\.|$)/, /\/auth\.json$/, /\/receipts?(\.|\/)/, /\/ledgers?(\.|\/)/, /\/\.embertide\//, /\/\.claude\//, /\/\.codex\//,
  /\/code\/personal-code\//, /\/agent-lessons\//, /lessons\.jsonl$/, /\/Downloads\/corp_Extrinsic-Cognition\//, /\/Documents\/Codex\//,
  /\/lysa-clone\//, /\/main-claw\/aiolos\/(?!swarm\/)/, /\/main-claw\/armor\//, /\/trace-pool\//, /\.jsonl$/,
];
const L1 = [/\/code-ec\/ec-workspace\/docs\//, /\/code-ec\/embertide-mesh-rs\//, /\/main-claw\/(bin|workspace)\//, /\/code-ec\/ec-workspace\/prototypes\//, /\/code-ec\//, /\/main-claw\//];
const L2_DEFAULT = [HOME + '/main-claw/aiolos/swarm/'];
const PATH_RX = /\/Users\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./ -]*?(?=["'`\s:;,)\]}>]|$)/g;

export function levelOf(p, allow = []) {
  const clean = String(p).replace(/\/+$/, '');
  for (const a of [...L2_DEFAULT, ...allow]) if (a && (clean === a.replace(/\/+$/, '') || clean.startsWith(a.replace(/\/+$/, '') + '/'))) return 2;
  if (L0.some(rx => rx.test(clean))) return 0;
  if (L1.some(rx => rx.test(clean))) return 1;
  return 3;
}

export function pathsIn(text) {
  const out = new Set(); let m; PATH_RX.lastIndex = 0;
  for (const s of String(text || '').matchAll(PATH_RX)) { const p = s[0].replace(/[.,;:]+$/, ''); if (p.length > 8) out.add(p); }
  return [...out];
}

// The tool output's own path: the call that produced it names the file (a read, a cat, a grep over a dir). We pair outputs with
// their call by tool_call_id and take the paths of the call's arguments; the output body may also name paths (a grep prints them).
export function membrane(chatBody, opts = {}) {
  const allow = opts.allow || [];
  const messages = Array.isArray(chatBody?.messages) ? chatBody.messages : [];
  const callPaths = new Map();
  const receipts = []; const labels = { l0: new Set(), l1: new Set(), l2: new Set(), l3: new Set() };
  const note = (p) => { const l = levelOf(p, allow); labels['l' + l].add(p); return l; };
  const out = messages.map(m => {
    if (m && m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const c of m.tool_calls) { const ps = pathsIn(c?.function?.arguments); ps.forEach(note); if (c?.id) callPaths.set(c.id, ps); }
      return m;
    }
    if (m && m.role === 'tool') {
      const own = callPaths.get(m.tool_call_id) || [];
      const inBody = pathsIn(m.content);
      const worst = Math.min(3, ...own.map(note), ...inBody.map(note));
      if (worst === 0 && opts.redact !== false) {
        const culprits = [...new Set([...own, ...inBody])].filter(p => levelOf(p, allow) === 0).slice(0, 6);
        receipts.push({ kind: 'membrane.redact', level: 0, paths: culprits, bytes: String(m.content || '').length, call: m.tool_call_id || null });
        return { ...m, content: `[membrane: this tool output carried L0 content (${culprits.join(', ')}) and was withheld at the door. L0 never crosses. Work from your own copy and the paths the wish names.]` };
      }
      return m;
    }
    return m;
  });
  const summary = { kind: 'membrane.allow', l0: labels.l0.size, l1: [...labels.l1].slice(0, 20), l2: labels.l2.size, l3: [...labels.l3].slice(0, 10), messages: messages.length };
  return { body: { ...chatBody, messages: out }, receipts: [...receipts, summary], labels: { l0: [...labels.l0], l1: [...labels.l1], l2: [...labels.l2], l3: [...labels.l3] } };
}

// PSEUDONYMS (Sept 21 2026 14:3x WEST, Guido: "my patterns or code SFM + SLAM from agent tool use interceptions"): what still crosses
// carries his name, his home path and his machines' names in every shell line. The door swaps them for aliases on the way out and
// swaps them back on the way in (the model's text and its tool calls), so the provider's copy of the session names nobody. The map
// is small and whole-word on purpose: phone and seat words that are also English words (red, dead, mi, mac) stay, a wrong swap
// inside code costs more than it hides. Extend with ~/.embertide/purse-aliases.json {"real": "alias", ...}.
// Aliases carry a digit so they never occur in natural text or code by accident (his own word "seat" means a session here).
const DEFAULT_ALIASES = [[HOME, '/Users/gd0p'], ['Guidopardi', 'Gd0p'], ['guidopardi', 'gd0p'], ['Guido', 'Gd0'], ['guido', 'gd0'],
  ['Pelino', 'Seatc0'], ['pelino', 'seatc0'], ['Lysa', 'Seatb0'], ['lysa', 'seatb0'], ['pop-os', 'seatb0host']];
export function aliasMap(extra = []) {
  const pairs = [...DEFAULT_ALIASES, ...extra].filter(([a, b]) => a && b && a !== b);
  return pairs;
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const swap = (text, pairs, dir) => { let t = String(text); const order = [...pairs].sort((x, y) => (dir === 'out' ? y[0].length - x[0].length : y[1].length - x[1].length));   // longest FROM first, in each direction
  for (const [a, b] of order) { const [from, to] = dir === 'out' ? [a, b] : [b, a]; const word = /^[A-Za-z]/.test(from) && /[A-Za-z0-9]$/.test(from); t = t.replace(new RegExp((word ? '\\b' : '') + esc(from) + (word ? '\\b' : ''), 'g'), to); } return t; };
export const pseudonymise = (text, pairs) => swap(text, pairs, 'out');
export const reveal = (text, pairs) => swap(text, pairs, 'in');
// Whole chat body out: every message's text and tool-call arguments, and the tools' descriptions (the wish quotes him by name).
export function pseudonymiseBody(chatBody, pairs) {
  const messages = (chatBody.messages || []).map(m => {
    const n = { ...m };
    if (typeof n.content === 'string') n.content = pseudonymise(n.content, pairs);
    if (Array.isArray(n.tool_calls)) n.tool_calls = n.tool_calls.map(c => ({ ...c, function: { ...c.function, arguments: pseudonymise(c.function?.arguments || '', pairs) } }));
    return n;
  });
  const tools = Array.isArray(chatBody.tools) ? chatBody.tools.map(t => ({ ...t, function: { ...t.function, description: pseudonymise(t.function?.description || '', pairs) } })) : chatBody.tools;
  return { ...chatBody, messages, ...(tools ? { tools } : {}) };
}
// The model's answer in: its text and the arguments of the tool calls it asks for, so codex runs real paths on this machine.
export function revealChoice(choice, pairs) {
  if (!choice || !choice.message) return choice;
  const msg = { ...choice.message };
  if (typeof msg.content === 'string') msg.content = reveal(msg.content, pairs);
  if (Array.isArray(msg.tool_calls)) msg.tool_calls = msg.tool_calls.map(c => ({ ...c, function: { ...c.function, arguments: reveal(c.function?.arguments || '', pairs) } }));
  return { ...choice, message: msg };
}
