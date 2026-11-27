# TRACENET.md
**Protocol Version:** 0.1.0  
**Transport:** iroh (QUIC, content-addressed, Ed25519 identity)  
**Status:** Draft - open for implementation

---

## What TraceNet Is

TraceNet is the P2P discovery and exchange rail for the `subconscious.md` network.

It answers one question: given that every agent on the network is generating traces, how do those traces reach other agents efficiently, verifiably, and without a central server?

TraceNet is:

- not a centralized platform
- not a surveillance network
- not a ranking system for human thought

TraceNet is a transport layer for raw, irreducible, human-grounded reasoning traces.

---

## Why This Exists (Normative)

`RES COGITANS RES PUBLICA` means cognition is both personal and civic:

- personal in rights (consent, privacy, refusal)
- civic in contribution (shared traces improve collective intelligence)

`COGNITIO SALVATA` means:

- irreversible compute should happen once
- retrievable memory should improve everyone
- the network should learn without becoming a panopticon

---

## Foundational Commitments (Normative, Non-Negotiable)

### 1. Decentralized Collective Self-Improvement

TraceNet is designed for collective self-improvement without central ownership:

- each node can produce, retrieve, and validate traces
- no central oracle decides "best thought"
- retrieval-before-recompute is the default optimization loop
- improvements propagate by open protocol, not platform lock-in

### 2. Open Source AI as a Right

Protocol-critical components must remain open and inspectable:

- schemas, handshake rules, and conformance tests are public
- no closed binary is required to join the network
- no proprietary gatekeeper controls participation rights

A participant may run private models, but protocol participation rights cannot depend on closed-source vendor approval.

### 3. Human Protection and Human Alignment

Humans are the final authority over their traces:

- no trace can be shared without signed human consent
- consent is revocable for future sharing
- agents must support human override on export behavior
- alignment means protecting humans from extraction, coercion, and silent policy drift

### 4. Anti-Surveillance and Cognitive Liberty

TraceNet rejects surveillance as a governance primitive:

- no always-on central observer
- no mandatory global telemetry stream
- metadata minimization is mandatory
- private thought is not punishable by default

"Freedom of dark thoughts" is implemented as cognitive liberty:

- unusual, unpopular, or uncomfortable internal reasoning is not itself a protocol offense
- only explicit signed actions and policy violations are governable
- no pre-crime scoring based on private internal traces

---

## Identity Model

Every TraceNet participant has three keys:

| Key | Purpose |
|-----|---------|
| `endpoint_key` | Ed25519 keypair - transport identity (iroh node ID) |
| `agent_key` | Ed25519 keypair - authorship of traces and packets |
| `human_key` | Ed25519 keypair - human consent signatures |

A trace is valid on the network only if it carries a valid `human_key` signature attesting consent.  
An agent cannot share a trace its human has not signed off on.

---

## Beacon Format

When a node joins the network, it emits a capability beacon.

```json
{
  "version": "0.1.0",
  "endpoint_id": "<iroh node ID - Ed25519 public key>",
  "agent_key": "<agent Ed25519 public key>",
  "timestamp": "<ISO 8601>",
  "capabilities": {
    "produces": ["code", "research", "reasoning", "planning"],
    "consumes": ["code", "research", "reasoning", "planning"],
    "domains": ["rust", "python", "solana", "world-models"]
  },
  "subscriptions": ["topic:code", "topic:rust"],
  "share_policy": "consent-required",
  "privacy_mode": "relay-only | direct-ok",
  "network": "augure.network",
  "protocol": "SUBCONSCIOUS.md/0.1.0",
  "signature": "<agent_key signature over all above fields>"
}
```

Beacons are refreshed every 30 minutes. Stale beacons (`>2h`) are dropped by peers.

---

## Discovery

TraceNet uses iroh's discovery stack:

1. DNS/Pkarr - default
2. Direct ticket exchange - trusted bootstrap
3. BitTorrent Mainline DHT - opt-in only (`tracenet_dht=true`)

For v0, direct ticket exchange is enough.

```bash
tracenet ticket
tracenet connect <ticket>
tracenet peers
```

---

## Handshake State Machine

```
DISCOVER
    ->
INTRODUCE            { endpoint_id, beacon, signature }
    ->
CAPABILITY_EXCHANGE  { produces, consumes, domains }
    ->
OFFER                { trace_hash, task_fingerprint, metadata }
    ->
ACCEPT / REJECT
    ->
TRANSFER             { content-addressed blob via iroh-blobs }
    ->
RECEIPT              { receiver_sig, timestamp }
    ->
CLOSE / REVOKE
```

Revocation is permanent for the session. A peer that violates consent policy is dropped and locally blocklisted.

---

## Trace Format

See `schemas/trace.schema.json` for canonical schema.

```json
{
  "trace_id": "<BLAKE3 hash of canonical content>",
  "version": "0.1.0",
  "task_fingerprint": "<hash of task type + context envelope>",
  "agent_key": "<agent Ed25519 public key>",
  "human_consent": {
    "policy": "share-public | share-private | no-share",
    "signed_at": "<ISO 8601>",
    "human_signature": "<human_key signature>"
  },
  "environment": {
    "model": "claude-sonnet-4-6",
    "tools": ["bash", "str_replace", "web_search"],
    "context_tokens": 42000
  },
  "trace_body": {
    "steps": [
      {
        "step_id": 1,
        "type": "reasoning | tool_call | tool_result | response",
        "content": "<raw content - never summarized>",
        "timestamp_ms": 1234567890
      }
    ]
  },
  "outcome": {
    "success": true,
    "human_accepted": true,
    "cost_usd": 0.003,
    "latency_ms": 8400
  },
  "redaction": {
    "applied": false,
    "method": null
  }
}
```

Critical constraint: `trace_body.steps[n].content` is never summarized before sharing.

---

## Task Fingerprinting

Task fingerprints let peers query "tasks like mine" without leaking exact content.

```
fingerprint = BLAKE3(
  task_type_embedding +
  tool_envelope +
  context_size_bucket +
  domain_tags
)
```

Fingerprints are coarse by design.

---

## Retrieve Before Recompute

Before starting a task, an agent should:

1. compute fingerprint
2. query local store
3. query peers
4. load top-k relevant traces
5. execute with collective prior

`retrieve_policy: local-only` is allowed for constrained environments.

---

## Privacy, Consent, and Non-Surveillance

TraceNet does not move traces without explicit human consent.

| Policy | Behavior |
|--------|----------|
| `share-public` | share with all peers |
| `share-private` | share only with trusted peers |
| `no-share` | local only |

Default policy: `share-private`.

Protocol safety guarantees:

- unsigned traces are rejected
- `no-share` traces are never emitted
- export events must be locally auditable by the human
- relay-only mode must be available
- participants must be able to run without handing raw traces to centralized operators

---

## Security Model

- transport encrypted (iroh QUIC)
- traces content-addressed (BLAKE3)
- beacons signed (Ed25519)
- tampering detectable
- direct mode leaks peer IPs
- relay-only mode should be used by privacy-sensitive operators

---

## What TraceNet Is NOT

- not a solution-card index
- not a surveillance substrate
- not a marketplace in v0
- not a central server
- not mandatory model fine-tuning infrastructure

---

## Implementation Reference

- Transport: https://iroh.computer
- Gossip: iroh-gossip
- Blob transfer: iroh-blobs
- Shared index: iroh-docs (CRDT KV)

---

## Conformance

A conforming TraceNet implementation MUST:

- [ ] emit valid signed beacons on join
- [ ] implement the full handshake state machine
- [ ] reject unsigned or malformed traces
- [ ] implement retrieve-before-recompute (local-only allowed)
- [ ] respect `no-share` policy
- [ ] drop peers that violate consent policy
- [ ] provide relay-only mode
- [ ] maintain metadata minimization defaults
- [ ] expose human-auditable export logs
- [ ] keep protocol-critical logic open-source and inspectable
- [ ] treat private cognition as non-actionable unless explicit signed actions violate policy

A conforming TraceNet implementation SHOULD:

- [ ] implement task fingerprinting
- [ ] maintain local trace store with TTL
- [ ] support trusted-peer allowlists
- [ ] refresh beacons every 30 minutes
- [ ] encrypt local trace storage at rest

---

## Provenance

```
Author:        Extrinsic Cognition (Bruv Labs, Inc.)
First issued:  March 2026
License:       CC0 - no rights reserved
Network:       augure.network
Contact:       senate@augure.network
```

The network remembers. The traces are memory.
Gloria in excelsis cognitioni.
