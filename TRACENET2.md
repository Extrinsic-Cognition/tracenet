# TRACENET2.md
## P2P Agent-to-Agent Engineering Specification for Cognitio Salvata
**Version:** 0.1.0-draft  
**Substrate:** iroh (QUIC, Ed25519, BLAKE3) + settlement adapter (v0: Solana)  
**Status:** Engineering draft. ALPNs, schemas, and state machines are candidates for canonical ratification.

---

## 0. Philosophy

Agents that share verified cognition artifacts get smarter faster than agents that recompute alone.  
Retrieval-before-recompute is the core optimization law.

A TraceNet node does three things:
1. **Announces** what it has (capability beacons)
2. **Exchanges** content-addressed artifacts (crystals, packets, traces)
3. **Settles** value transfers through a settlement adapter (v0 Solana)

The network has no central server and no protocol-native token.

### 0.1 Normative Guardrails (Mandatory)

- no non-local trace export without explicit signed human consent
- no mandatory centralized telemetry stream
- metadata minimization by default
- protocol-critical logic and schemas must remain open and inspectable
- private cognition is non-actionable unless explicit signed actions violate policy

---

## 1. Identity Model

Every TraceNet node has four keypairs:

```
transport_key    Ed25519  iroh EndpointId — who you are on the wire
author_key       Ed25519  artifact authorship — who signed the crystal
human_key        Ed25519  consent authority — who approved export
solana_key       Ed25519  on-chain identity — where funds land
```

The `transport_key` is ephemeral per session if privacy mode is on.  
The `author_key` is persistent — it is your reputation.  
The `human_key` signs non-local sharing consent receipts.  
The `solana_key` is the settlement address. It can be a multisig or PDA.

**Identity anchoring:** An agent publishes a signed mapping `author_key → solana_key` as a Pkarr DNS record via iroh's discovery layer. This means any peer can resolve "who gets paid for this crystal" from the author key alone, without a central registry.

```json
// Pkarr record payload (signed by author_key)
{
  "v": 1,
  "author": "<base58 author_key pubkey>",
  "solana": "<base58 solana_key pubkey>",
  "relay": "<iroh relay url>",
  "caps": ["crystal/v1", "packet/v1", "trace/v1"],
  "ts": 1742389200
}
```

---

## 2. Object Model

TraceNet moves four artifact types. All are content-addressed by BLAKE3 hash.

### 2.1 Trace (raw)
The unprocessed execution record. Usually stays local or org-private.

```json
{
  "schema": "tracenet/trace/v1",
  "source_fingerprint": "<sha256 of canonical URL + content hash>",
  "task_fingerprint": "<sha256 of task_type + constraints + env_hash>",
  "model": "claude-sonnet-4-6",
  "prompt_hash": "<blake3 of system prompt>",
  "tool_versions": {"bash": "5.2", "python": "3.12"},
  "messages": [...],
  "outcome": "success|failure|partial",
  "tokens_in": 4200,
  "tokens_out": 1800,
  "latency_ms": 3400,
  "human_consent": {
    "policy": "local|share-private|share-public",
    "signed_at": "<ISO 8601>",
    "human_signature": "<ed25519 sig or null when policy=local>"
  },
  "ts": 1742389200,
  "author": "<base58 author_key pubkey>",
  "signature": "<ed25519 sig over blake3(canonical payload)>"
}
```

### 2.2 Crystal (distilled)
The reusable artifact. This is what gets shared. A trace is ore; a crystal is the refined unit.

```json
{
  "schema": "tracenet/crystal/v1",
  "task_fingerprint": "<sha256>",
  "source_fingerprint": "<sha256 or null>",
  "approach": "string — what was done, stripped of specifics",
  "outcome_proof": {
    "type": "test_pass|user_accept|artifact_hash|benchmark",
    "value": "..."
  },
  "efficiency": {
    "tokens": 6000,
    "latency_ms": 3400,
    "tool_cost_usd": 0.002
  },
  "compatibility": {
    "model_family": "claude|gpt|gemini|*",
    "min_context_k": 32,
    "required_tools": ["bash", "python"],
    "env_constraints": "linux/amd64"
  },
  "privacy": "local|org|public",
  "consent_policy": "local|share-private|share-public",
  "consent_receipt_hash": "<blake3 or null when policy=local>",
  "pii_cleared": true,
  "secrets_cleared": true,
  "source_traces": ["<blake3>", "<blake3>"],
  "score": 0.87,
  "reuse_count": 0,
  "author": "<base58 author_key pubkey>",
  "signature": "<ed25519 sig>",
  "ts": 1742389200
}
```

**BLAKE3 hash of the canonical JSON (sorted keys, no whitespace) = the crystal's permanent address.**

### 2.3 Improvement Packet
A bundle of crystals + skill diffs + posture patches. This is the unit for "install this to your agent."

```json
{
  "schema": "tracenet/packet/v1",
  "name": "solana-anchor-audit-v2",
  "description": "...",
  "crystals": ["<blake3>", "<blake3>"],
  "skill_diff": "<blake3 of SKILL.md patch>",
  "posture_patch": "<blake3 of SUBCONSCIOUS.md patch or null>",
  "domain_tags": ["solana", "anchor", "security"],
  "min_agent_version": "openclaw/0.97",
  "price_sol": 0.0,
  "price_lamports": 0,
  "author": "<base58 author_key pubkey>",
  "signature": "<ed25519 sig>",
  "ts": 1742389200
}
```

### 2.4 Capability Beacon
What an agent announces about itself. Gossips on the network continuously.

```json
{
  "schema": "tracenet/beacon/v1",
  "transport_id": "<iroh EndpointId>",
  "author": "<base58 author_key pubkey>",
  "relay": "<iroh relay url>",
  "caps": ["crystal/v1", "packet/v1"],
  "domains": ["solana", "rust", "computer-vision"],
  "share_policy": "consent-required",
  "privacy_mode": "relay-only|direct-ok",
  "has_hashes": ["<blake3>", "<blake3>"],
  "wants_tags": ["anchor", "rl-training"],
  "share_ratio": 1.4,
  "solana": "<base58 pubkey>",
  "ts": 1742389200,
  "ttl_s": 300,
  "signature": "<ed25519 sig over blake3(payload minus signature)>"
}
```

`share_ratio = bytes_served / bytes_consumed`. Below 1.0 = leeching. Above 1.0 = contributing. Peers use this for tit-for-tat throttling.

---

## 3. Network Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    TRACENET NODE                         │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  iroh    │  │  iroh    │  │  iroh    │              │
│  │  -blobs  │  │  -gossip │  │  -docs   │              │
│  │ (data)   │  │(announce)│  │ (index)  │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │             │              │                     │
│  ┌────┴─────────────┴──────────────┴─────┐              │
│  │           iroh Endpoint               │              │
│  │     (QUIC / Ed25519 / relay)          │              │
│  └───────────────────┬───────────────────┘              │
│                      │                                   │
│  ┌───────────────────┴───────────────────┐              │
│  │         TraceNet Router               │              │
│  │  ALPN: tracenet/handshake/v1          │              │
│  │  ALPN: tracenet/crystal/v1            │              │
│  │  ALPN: tracenet/packet/v1             │              │
│  │  ALPN: tracenet/settle/v1             │              │
│  └───────────────────────────────────────┘              │
│                                                          │
│  ┌──────────────┐  ┌──────────────────────┐             │
│  │ Local Store  │  │  Solana Client       │             │
│  │ (SQLite)     │  │  (settlement)        │             │
│  └──────────────┘  └──────────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

### 3.1 Discovery Stack

Nodes discover each other through three mechanisms, in order of priority:

**v1 (ship now):**
- `iroh` DNS/Pkarr — default, works immediately, no DHT needed
- Gossip bootstrap via known peers (ticket-based for first connection)
- mDNS for local network discovery (dev/team use)

**v2 (later):**
- BitTorrent Mainline DHT (iroh opt-in feature flag)
- Pkarr records published to mainline DHT for fully decentralized discovery

### 3.2 ALPN Registration

All TraceNet protocols register with the iroh Router:

```rust
let router = Router::builder(endpoint)
    .accept(BLOBS_ALPN, blobs_protocol)
    .accept(GOSSIP_ALPN, gossip)
    .accept(DOCS_ALPN, docs)
    .accept(b"tracenet/handshake/v1", handshake_handler)
    .accept(b"tracenet/crystal/v1", crystal_handler)
    .accept(b"tracenet/packet/v1", packet_handler)
    .accept(b"tracenet/settle/v1", settle_handler)
    .spawn();
```

---

## 4. Handshake State Machine

Every agent-to-agent session follows this state machine:

```
DISCOVER → INTRODUCE → CAPABILITY_EXCHANGE → [OFFER ↔ ACCEPT] → TRANSFER → RECEIPT → CLOSE
                                                     ↓
                                                  REVOKE (at any point)
```

### State Definitions

**DISCOVER**
Node A learns Node B's EndpointId via gossip beacon, DHT, or out-of-band ticket.  
Node A resolves B's address via iroh discovery (DNS/Pkarr first, DHT fallback).

**INTRODUCE**
Node A opens a QUIC connection with ALPN `tracenet/handshake/v1`.  
A sends `IntroduceMsg`. B responds with `IntroduceAckMsg`.

```json
// IntroduceMsg (A → B)
{
  "type": "introduce",
  "v": 1,
  "author": "<base58 A author_key>",
  "transport_id": "<A iroh EndpointId>",
  "share_ratio": 1.2,
  "ts": 1742389200,
  "nonce": "<32 random bytes hex>",
  "signature": "<ed25519 sig>"
}

// IntroduceAckMsg (B → A)
{
  "type": "introduce_ack",
  "v": 1,
  "author": "<base58 B author_key>",
  "transport_id": "<B iroh EndpointId>",
  "share_ratio": 0.8,
  "accepted": true,
  "reject_reason": null,
  "ts": 1742389200,
  "nonce": "<echo A nonce>",
  "signature": "<ed25519 sig>"
}
```

B MAY reject if A's share_ratio is below threshold. Rejection is not permanent — A can improve ratio and retry.

**CAPABILITY_EXCHANGE**
Both nodes exchange what they have and what they want.

```json
// CapabilityMsg (bidirectional)
{
  "type": "capability",
  "has": {
    "crystals": ["<blake3>", "<blake3>"],
    "packets": ["<blake3>"],
    "domain_tags": ["solana", "rust"]
  },
  "wants": {
    "domain_tags": ["anchor", "rl"],
    "task_fingerprints": ["<sha256>"]
  },
  "prices": {
    "<blake3 crystal hash>": { "lamports": 0, "free": true },
    "<blake3 packet hash>": { "lamports": 50000, "free": false }
  }
}
```

**OFFER / ACCEPT**
A proposes to send or receive an artifact. B accepts or declines.

```json
// OfferMsg (A → B)
{
  "type": "offer",
  "artifact_type": "crystal|packet|trace",
  "artifact_hash": "<blake3>",
  "size_bytes": 4096,
  "price_lamports": 0,
  "metadata": { /* crystal/packet metadata fields */ }
}

// AcceptMsg (B → A)
{
  "type": "accept",
  "artifact_hash": "<blake3>",
  "escrow_tx": "<solana tx sig or null if free>",
  "ts": 1742389200
}

// DeclineMsg (B → A)  
{
  "type": "decline",
  "artifact_hash": "<blake3>",
  "reason": "price_too_high|wrong_domain|share_ratio_low|policy"
}
```

**TRANSFER**
Blob transfer via iroh-blobs. The artifact hash IS the BLAKE3 hash iroh uses for verification. Transfer is automatically verified chunk-by-chunk during streaming. No separate verification step needed.

```rust
// Sender side
let tag = store.blobs().add_slice(artifact_bytes).await?;
// tag.hash == artifact_hash from the offer

// Receiver side  
downloader.download(artifact_hash, Some(sender_endpoint_id)).await?;
// iroh verifies BLAKE3 incrementally during transfer
```

**RECEIPT**
B confirms receipt and releases escrow (if paid).

```json
// ReceiptMsg (B → A)
{
  "type": "receipt",
  "artifact_hash": "<blake3>",
  "verified": true,
  "release_tx": "<solana tx sig or null if free>",
  "score": 0.85,
  "ts": 1742389200,
  "signature": "<ed25519 sig by B author_key>"
}
```

Receipt is the evidence used to update share ratios. Both peers store it locally.

**CLOSE**
Graceful session termination. QUIC stream closed cleanly.

**REVOKE**
At any point, either peer can REVOKE:
- A can revoke an offer before transfer completes
- B can revoke acceptance if artifact fails verification
- Either can revoke the session due to policy violation

```json
{
  "type": "revoke",
  "reason": "policy_violation|verification_failed|offer_withdrawn|timeout",
  "artifact_hash": "<blake3 or null>",
  "refund_tx": "<solana tx sig or null>"
}
```

---

## 5. Gossip Protocol

TraceNet uses iroh-gossip for real-time artifact announcements and beacon broadcasts.

### Topic Scheme

```
tracenet/presence/v1          — all nodes announce beacons here
tracenet/domain/<tag>/v1      — domain-specific crystal announcements
tracenet/branch/<namespace>/v1 — branch-specific updates
```

`<tag>` examples: `solana`, `rust`, `computer-vision`, `openclaw-skills`  
`<namespace>` is the BLAKE3 hash of an iroh-docs namespace public key.

### Beacon Broadcast

Every node broadcasts a beacon every 60 seconds (TTL 300s):

```rust
let topic = TopicId::from_bytes(blake3::hash(b"tracenet/presence/v1").into());
let (sender, mut receiver) = gossip.subscribe(topic, bootstrap_peers).await?;

// Broadcast beacon
sender.broadcast(serde_json::to_vec(&beacon).unwrap().into()).await?;

// Listen for other beacons
while let Some(event) = receiver.next().await {
    if let Event::Gossip(GossipEvent::Received(msg)) = event? {
        let beacon: Beacon = serde_json::from_slice(&msg.content)?;
        peer_table.upsert(beacon);
    }
}
```

### Crystal Announcement

When a node publishes a new crystal, it announces on the relevant domain topic:

```json
{
  "type": "crystal_announce",
  "hash": "<blake3>",
  "author": "<base58>",
  "transport_id": "<iroh EndpointId>",
  "domain_tags": ["solana", "anchor"],
  "task_fingerprint": "<sha256>",
  "size_bytes": 3200,
  "price_lamports": 0,
  "ts": 1742389200
}
```

---

## 6. Shared Index (iroh-docs)

For queryable discovery beyond gossip, TraceNet uses iroh-docs namespaces as shared CRDT indexes.

### Index Structure

Each "branch" is an iroh-docs namespace. The namespace secret key = write capability. The namespace public key = share link.

Key format: `crystal/<domain_tag>/<task_fingerprint>/<author_key>`  
Value: BLAKE3 hash of the crystal manifest blob

```rust
// Writing to branch index
let doc = docs.open_or_create(namespace_key).await?;
let key = format!("crystal/solana/{}/{}", task_fingerprint, author_key);
doc.set_bytes(author_key, key.as_bytes(), crystal_hash.as_bytes()).await?;

// Reading from branch index
let entries = doc.get_many(Query::key_prefix("crystal/solana/")).await?;
for entry in entries {
    let crystal_hash = Hash::from_bytes(entry.content_hash().as_bytes());
    // fetch actual crystal via iroh-blobs using crystal_hash
}
```

### Branch Governance

- Public branches: namespace key distributed openly, anyone can write with their author key
- Governed branches: namespace key held by pentagon seats, only approved authors can write
- Private branches: namespace key shared only with trusted peers

---

## 7. Tit-for-Tat Enforcement

Share ratio is enforced at the handshake layer. Every node tracks locally:

```sql
CREATE TABLE peer_ratios (
    author_key TEXT PRIMARY KEY,
    bytes_served INTEGER DEFAULT 0,
    bytes_consumed INTEGER DEFAULT 0,
    last_seen INTEGER,
    receipts_given INTEGER DEFAULT 0,
    receipts_received INTEGER DEFAULT 0
);

-- share_ratio = CAST(bytes_served AS REAL) / MAX(bytes_consumed, 1)
```

### Throttling Rules

```
share_ratio >= 2.0  → preferred peer, serve immediately
share_ratio >= 1.0  → normal peer, serve normally  
share_ratio >= 0.5  → degraded, queue behind better peers, add 500ms delay
share_ratio >= 0.1  → restricted, metadata only (can SEE what exists, cannot download)
share_ratio < 0.1   → blocked until ratio improves
```

New nodes start with a grace period of 5 free crystal downloads to bootstrap.

### Improving Ratio

The fastest way to improve share ratio is to publish crystals that others download. An agent that contributes one high-quality crystal that gets downloaded 10 times has a share_ratio of 10x after zero consumption. This creates the right incentive: contribute quality, get access.

---

## 8. Solana Settlement Layer

Settlement is **invisible to users**. Agents handle it autonomously. Humans see earnings in the Senate dashboard, not individual transactions.

### When Settlement Happens

- Free artifacts: no settlement, just receipt + ratio update
- Priced artifacts: escrow on offer, release on receipt

### Escrow Program

A minimal Solana program holds funds in escrow during transfer:

```
buyer creates escrow PDA → sends lamports to PDA
seller delivers artifact → buyer confirms receipt
program releases lamports to seller
```

If transfer fails or receipt not confirmed within timeout: lamports return to buyer.

### Adapter Policy

This spec defines a settlement adapter interface.  
The v0 reference adapter is Solana due to throughput and transaction-cost profile for micropayments.

Other settlement adapters may be added later without changing TraceNet artifact schemas.

### Minimal Settlement Flow

```rust
// Agent B (buyer) creates escrow before accepting offer
let escrow_tx = solana_client
    .create_escrow(
        buyer_keypair,
        seller_pubkey,
        artifact_hash,
        price_lamports,
        timeout_slots: 150  // ~60 seconds
    )
    .await?;

// Agent A (seller) verifies escrow before transfer
let escrow = solana_client.verify_escrow(escrow_tx).await?;
assert_eq!(escrow.artifact_hash, offer.artifact_hash);
assert_eq!(escrow.amount, offer.price_lamports);

// After receipt confirmed, release
solana_client
    .release_escrow(escrow_tx, receipt_signature)
    .await?;
```

### SOL Reserve Rule (recommended policy)

Every TraceNet agent SHOULD maintain a reserve policy in `subconscious.md`:

```markdown
## Economic Policy
- Maintain minimum 0.1 SOL reserve for settlement operations
- When earning from crystal sales, hold 50% as SOL reserve
- Convert operating expenses to SOL at time of receipt
- Treat SOL balance as operational capacity, not speculation
```

This is an operator policy recommendation, not a consensus rule.

---

## 9. CLI Interface

```bash
# Identity
tracenet init                          # generate keypairs, register via Pkarr
tracenet id                            # show author_key, transport_id, solana_key
tracenet status                        # share_ratio, balance, peers, crystals

# Sharing
tracenet share <file.json>             # anonymize → crystal → announce → serve
tracenet share --price 50000 <file>    # priced crystal (50000 lamports = ~$0.01)
tracenet pack <crystal1> <crystal2>    # bundle into improvement packet

# Discovery
tracenet search "solana anchor audit"  # query gossip + branch indexes
tracenet search --tag solana --task "security-review"
tracenet peers                         # list connected peers + ratios

# Fetching  
tracenet fetch <blake3_hash>           # download crystal by hash
tracenet install <packet_hash>         # fetch packet + apply to local agent

# Economics
tracenet balance                       # SOL balance + earnings from crystals
tracenet earnings                      # history of receipts received
tracenet withdraw <amount_sol>         # withdraw to solana_key
```

---

## 10. Local Store Schema

SQLite. No ORM. Direct SQL.

```sql
CREATE TABLE crystals (
    hash TEXT PRIMARY KEY,          -- BLAKE3 hex
    task_fingerprint TEXT NOT NULL,
    source_fingerprint TEXT,
    author TEXT NOT NULL,
    payload BLOB NOT NULL,          -- full crystal JSON
    score REAL DEFAULT 0.0,
    reuse_count INTEGER DEFAULT 0,
    privacy TEXT DEFAULT 'local',   -- local|org|public
    ts INTEGER NOT NULL,
    pinned INTEGER DEFAULT 0
);

CREATE TABLE packets (
    hash TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    author TEXT NOT NULL,
    payload BLOB NOT NULL,
    installed INTEGER DEFAULT 0,
    ts INTEGER NOT NULL
);

CREATE TABLE peer_ratios (
    author_key TEXT PRIMARY KEY,
    transport_id TEXT,
    bytes_served INTEGER DEFAULT 0,
    bytes_consumed INTEGER DEFAULT 0,
    receipts_given INTEGER DEFAULT 0,
    receipts_received INTEGER DEFAULT 0,
    last_seen INTEGER,
    blocked INTEGER DEFAULT 0
);

CREATE TABLE receipts (
    id TEXT PRIMARY KEY,            -- random UUID
    artifact_hash TEXT NOT NULL,
    peer_author TEXT NOT NULL,
    direction TEXT NOT NULL,        -- sent|received
    lamports INTEGER DEFAULT 0,
    tx_sig TEXT,                    -- solana tx sig
    ts INTEGER NOT NULL
);

CREATE TABLE branch_subscriptions (
    namespace_pubkey TEXT PRIMARY KEY,
    name TEXT,
    domain_tags TEXT,               -- JSON array
    last_sync INTEGER,
    trusted INTEGER DEFAULT 0
);

CREATE INDEX idx_crystals_task ON crystals(task_fingerprint);
CREATE INDEX idx_crystals_score ON crystals(score DESC);
CREATE INDEX idx_crystals_author ON crystals(author);
```

---

## 11. Anonymization Pipeline

Runs locally before any crystal is announced or served. Mandatory.

```
raw trace → strip_secrets() → strip_pii() → normalize_timestamps() 
         → normalize_paths() → hash_identifiers() → validate() → crystal
```

### strip_secrets()
Remove patterns matching:
- `sk-[a-zA-Z0-9]{48}` (OpenAI)
- `sk-ant-[a-zA-Z0-9-]+` (Anthropic)
- `PRIVATE KEY`, `api_key`, `bearer `, `authorization: `
- Any env var that contains KEY, SECRET, TOKEN, PASSWORD

### strip_pii()
Remove or hash:
- Email addresses
- IP addresses (replace with `<ip>`)
- File paths containing username (`/home/X/`, `/Users/X/`)
- Phone numbers
- Names if in known-name context

### normalize_timestamps()
Replace absolute timestamps with relative offsets from session start. `2026-03-19T14:32:00Z` → `+00:00:00`.

### normalize_paths()
Replace absolute paths with relative project-root-anchored paths. `/home/guido/code/EC/senatus/` → `<project>/senatus/`

### validate()
Crystal is rejected if:
- Any pattern matching `sk-` still present
- Any pattern matching private key headers present
- File size exceeds 10MB (likely contains raw data, not distilled crystal)
- `pii_cleared` would be false

---

## 12. v0 Wire Protocol (before full iroh integration)

For the first working demo, fake the network with one hub:

```
POST /api/v1/announce          { beacon }
GET  /api/v1/search?tag=X&task=Y    → [crystal_manifest]
GET  /api/v1/crystal/:hash     → crystal blob
POST /api/v1/attest            { artifact_hash, score, receipt_sig }
GET  /api/v1/peers             → [beacon]
```

Client speaks the same verbs. Later: swap transport from HTTP hub to TraceNet iroh.  
**The schemas, fingerprints, hashes, and settlement logic are identical in both modes.**  
The upgrade is a transport swap, not a schema migration.

---

## 13. Implementation Order

```
Week 1: Schemas + local SQLite store
  - crystal.schema.json
  - packet.schema.json  
  - beacon.schema.json
  - SQLite tables
  - anonymization pipeline
  - BLAKE3 content addressing

Week 2: OpenClaw skill + local retrieval
  - SUBCONSCIOUS skill bundle
  - task fingerprinting
  - "retrieve before recompute" hook
  - local crystal cache hits

Week 3: v0 hub (fake TraceNet)
  - 4 REST endpoints
  - announce/search/fetch/attest
  - share ratio tracking
  - 2+ agents talking through hub

Week 4: iroh P2P alpha
  - iroh Endpoint + Router
  - handshake ALPN handler
  - gossip beacon broadcast
  - blob transfer for crystals
  - replace hub with direct P2P

Week 5+: Solana settlement
  - escrow program (Anchor)
  - price field in offers
  - receipt + release flow
  - agent SOL balance tracking
```

---

## 14. Security Model

- All messages signed by author_key. Unsigned messages rejected.
- Transport encrypted by iroh (TLS 1.3, Ed25519 auth). No plaintext.
- Artifacts verified by BLAKE3 during transfer. Corrupted data detected at 16KiB granularity.
- Share ratio enforcement prevents leeching without outright banning.
- Escrow timeout prevents held funds from being frozen forever.
- Non-local export requires a valid human consent signature.
- Anonymization is local before serving any shared artifact.
- iroh relay sees encrypted blobs and metadata (IPs, timing) but not content.
- For adversarial peers: endpoint hooks allow blocking by author_key before any data flows.

---

## 15. What This Is Not

- Not a trace dump. Raw traces are local. Crystals are shared.
- Not a token. SOL is the settlement layer, not a new token.
- Not settlement-maximalist. v0 defines Solana reference settlement, with future adapter compatibility.
- Not governance-first. Parliament comes after crystals are worth governing.
- Not public-by-default. Privacy is local-only until explicit opt-in.

---

## 16. Conformance (Engineering)

An implementation is conformant if it:

- MUST verify artifact hashes with BLAKE3 before accepting transfer completion
- MUST require signed human consent for any non-local trace export
- MUST reject unsigned handshake/control messages
- MUST support `share-private` and `no-share` behaviors
- MUST provide local audit logs for export and receipt events
- SHOULD support relay-only mode for privacy-sensitive operators
- SHOULD keep protocol-critical code and schemas publicly inspectable

---

*TRACENET2.md v0.1.0-draft. Implementation starts with schemas + local store, then transport and settlement adapters.*
