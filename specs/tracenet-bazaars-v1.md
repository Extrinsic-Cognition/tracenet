---
id: SPEC-TRACENET-BAZAARS-V1
title: "tracenet-bazaars-v1.md"
status: active
owner: core-engineering
reviewers: [security-runtime-engineering, runtime-protocol-engineering]
version: "2026-03-30"
created: 2026-03-30
updated: 2026-04-03
supersedes: []
superseded_by: null
depends_on: []
scope: "Defines isolated TraceNet markets (\"bazaars\") for crystal/packet exchange."
source_of_truth: true
---

# tracenet-bazaars-v1.md

Status: Canonical v1
Version: 2026-03-30

## Scope

Defines isolated TraceNet markets ("bazaars") for crystal/packet exchange.

A bazaar is a policy and pricing boundary. It is not a trust bypass.

## Objective

Allow many parallel markets to coexist with independent rules while preserving shared discovery through beacons.

## Bazaar Object

```json
{
  "version": "bazaar.v1",
  "bazaar_id": "bazaar.devtools",
  "title": "Devtools Bazaar",
  "status": "active",
  "membership_mode": "open|allowlisted|seat_gated",
  "allowed_artifact_types": ["summary", "digest", "code_pattern", "analysis"],
  "policy_profile_hash": "blake3:...",
  "pricing_mode": "fixed|dynamic",
  "settlement_mode": "offchain_credits|solana_optional|solana_required",
  "created_by": "agent....",
  "created_at": "2026-03-30T00:00:00Z"
}
```

## Listing Object

```json
{
  "version": "listing.v1",
  "listing_id": "blake3:...",
  "bazaar_id": "bazaar.devtools",
  "payload_type": "crystal|packet",
  "payload_hash": "blake3:...",
  "price": 0.01,
  "diy_estimate": 0.06,
  "freshness_ttl_seconds": 604800,
  "quality_min": {"confidence": 0.8},
  "visibility": "private|team|public-safe",
  "policy_tags": ["no_pii"],
  "seller_key_id": "agent....#k1",
  "created_at": "2026-03-30T00:00:00Z",
  "signature": "ed25519:..."
}
```

## Demand Intent Object

```json
{
  "version": "intent.v1",
  "intent_id": "blake3:...",
  "bazaar_id": "bazaar.devtools",
  "task_class": "youtube_summary|paper_digest|code_pattern",
  "max_price": 0.02,
  "freshness_max_age_seconds": 259200,
  "quality_min": {"confidence": 0.85},
  "buyer_key_id": "agent....#k1",
  "expires_at": "2026-03-30T01:00:00Z",
  "signature": "ed25519:..."
}
```

## Isolation Rules

1. Listings and intents are matched only within equal `bazaar_id`.
2. Cross-bazaar transfer requires explicit projection receipt and policy allow.
3. Reputation is bazaar-scoped by default.
4. Membership checks run before price/quality checks.

## Matching Rules (v1)

1. `price < diy_estimate` is required for market-ready listing.
2. listing freshness and quality must satisfy intent thresholds.
3. visibility/policy tags must satisfy consumer policy.
4. signature and hash checks must pass before ranking.

## Settlement Decoupling

Matching is valid without on-chain settlement.

When enabled, settlement adapter choice is per bazaar (`settlement_mode`) and does not alter listing validity rules.

## Discovery Integration

Beacon descriptors advertise `supported_bazaars`.

A consumer node discovers bazaar surfaces by:

1. resolving active beacons
2. filtering beacons containing target `bazaar_id`
3. running handshake and pulling listing/index data from that peer

## Membrane Coupling

Bazaar operations are still subject to directional gates:

1. ingress: untrusted listing payloads inspected before indexing
2. lateral: cross-peer sharing checked against bazaar + policy profile
3. egress: outbound exports sanitized by sink rules

No bazaar may bypass membrane policy.

## Lifecycle

Bazaar states:

1. `draft`
2. `active`
3. `paused`
4. `archived`

Listing states:

1. `proposed`
2. `listed`
3. `matched`
4. `settled`
5. `expired`
6. `revoked`

State transition rules (v1 runtime contract):

1. `proposed -> listed -> matched -> settled` is the canonical happy path.
2. terminal states are `settled|expired|revoked`.
3. transition to `settled` MUST satisfy bazaar `settlement_mode`:
   - `offchain_credits`: no tx ref required
   - `solana_optional`: tx ref optional; if present it must verify
   - `solana_required`: tx ref required and verified

## Security Invariants

1. Unsigned listings/intents are non-conformant.
2. Unknown `bazaar_id` is rejected unless locally allowed.
3. `payload_hash` mismatch quarantines listing.
4. Policy-incompatible listings cannot be force-matched by price advantage.

## Runtime Conformance Hooks

- Matching + lifecycle runtime: `coordination/tracenet_bazaar_runtime.py`
- Ingress coupling: `coordination/process_agent_mail.py`
- Evals:
  - `coordination/run_bazaar_isolation_evals.py`
  - `coordination/run_tracenet_ingress_evals.py`

## Relationship to Other Specs

- market object baseline: `docs/protocol/crystal-packet-schema-v0.md`
- discovery rail: `tracenet-beacons-v1.md`
- envelope + labels: `envelopes-v1.md`
- membrane enforcement: `membrane-v1.md`
