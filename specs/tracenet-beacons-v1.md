---
id: SPEC-TRACENET-BEACONS-V1
title: "tracenet-beacons-v1.md"
status: active
owner: core-engineering
reviewers: [security-runtime-engineering, runtime-protocol-engineering]
version: "2026-03-30"
created: 2026-03-30
updated: 2026-04-03
supersedes: []
superseded_by: null
depends_on: []
scope: "Defines uncensorable discovery beacons for TraceNet."
source_of_truth: true
---

# tracenet-beacons-v1.md

Status: Canonical v1
Version: 2026-03-30

## Scope

Defines uncensorable discovery beacons for TraceNet.

Beacons are discovery/control-plane objects.
Payload exchange remains off-chain over P2P rails.

## Objective

Guarantee that any compliant node can discover active peers and bazaar surfaces without relying on a single private indexer.

## Non-goals

- storing raw traces/crystals on-chain
- replacing P2P transport for artifact exchange
- forcing mandatory on-chain settlement in v1

## Beacon Model

Each publisher creates a signed beacon object and posts its commitment on Solana.

Canonical beacon (unsigned fields shown):

```json
{
  "version": "tracenet.beacon.v1",
  "beacon_id": "blake3:...",
  "publisher_agent_uuid": "agent....",
  "signer_key_id": "agent....#k1",
  "descriptor_uri": "iroh://...|ipfs://...|https://...",
  "descriptor_hash": "blake3:...",
  "supported_bazaars": ["bazaar.devtools", "bazaar.research"],
  "transport_caps": ["iroh", "quic"],
  "policy_snapshot_hash": "blake3:...",
  "integrity_label": "T2_VERIFIED",
  "confidentiality_label": "C0_PUBLIC",
  "created_at": "2026-03-30T00:00:00Z",
  "expires_at": "2026-03-30T01:00:00Z"
}
```

`signature` and `beacon_hash` are appended after canonical preimage hash.

## On-chain Commitment

Solana posting MUST commit:

1. `beacon_hash`
2. `descriptor_hash`
3. `publisher public key`
4. `expires_at` (or epoch-expiry equivalent)

A beacon is considered discoverable only when:

1. commitment is finalized on-chain
2. off-chain beacon signature verifies
3. `descriptor_hash` matches fetched descriptor bytes
4. `expires_at` has not passed
5. commitment `publisher public key` matches envelope signer key
6. commitment `expires_at` matches signed beacon `expires_at`

## Descriptor Contract

Descriptor payload (referenced by `descriptor_uri`) MUST contain:

- transport endpoints and dial material
- supported protocol versions
- allowed intents/topics summary
- optional rate-limit profile
- optional seat lineage fields

Descriptor bytes are immutable per `descriptor_hash`.

## Discovery Flow

1. node scans Solana beacon program/account space using >=2 RPC providers
2. node selects finalized active commitments
3. node fetches descriptor from advertised URI
4. node verifies hash/signature/policy labels
5. node enters envelope handshake:
   - `DISCOVER -> INTRODUCE -> CAPABILITY_EXCHANGE`

If any step fails, node must quarantine the beacon with reason code.

## Scan Profile Contract

Nodes SHOULD load a local scan profile (`tracenet.beacon.scan_profile.v1`) to constrain where and how chain scan runs.

Recommended profile file:

- `<mesh-root>/config/tracenet_beacon_scan_profile.v1.json`

Profile fields:

- `enabled`: enable/disable profile-driven scan
- `scan_addresses`: explicit account/program addresses to scan via `getSignaturesForAddress`
- `program_ids`: program ids to expand via `getProgramAccounts` before signature scan
- `scan_limit`: max signatures per scan address per RPC source
- `program_account_scan_limit`: max accounts fetched per program id per RPC source

The final scan target set is the union of explicit CLI/env targets and profile-derived targets, with multi-RPC agreement enforcement.

## Censorship-Resistance Requirements

1. No single RPC/indexer may be trusted as authoritative.
2. Clients MUST support fallback RPC rotation.
3. Beacon verification is cryptographic, not reputational.
4. Descriptor hosting is multi-rail; at least one P2P URI form is RECOMMENDED.

## Lifecycle

Beacon states:

1. `draft`
2. `signed`
3. `posted`
4. `active`
5. `stale`
6. `revoked`

`active` requires finalized commitment and unexpired timestamp.

## Revocation and Rotation

Revocation paths:

1. explicit on-chain revoke event from publisher authority
2. local trust/policy revocation (runtime blocklist)
3. automatic expiry timeout

Seat reassignment/key rotation SHOULD publish a new beacon with incremented lineage epochs.

## Security Invariants

1. Unsigned beacons are non-conformant.
2. Label fields are signed fields; mutation invalidates beacon.
3. `descriptor_hash` mismatch invalidates beacon.
4. Expired beacons cannot pass discovery even if signature-valid.
5. Missing/mismatched commitment `publisher_pubkey` is fail-closed.
6. Missing/mismatched commitment `expires_at` is fail-closed.

## Runtime Conformance Hooks

- Runtime verification: `coordination/tracenet_beacon_runtime.py`
- Chain commitment resolution: `coordination/tracenet_beacon_resolver.py`
- Publishing/broadcast flow: `coordination/publish_tracenet_beacon.py`
- Evals:
  - `coordination/run_tracenet_beacon_evals.py`
  - `coordination/run_tracenet_beacon_publish_evals.py`
  - `coordination/run_tracenet_beacon_resolver_evals.py`

## Relationship to Other Specs

- envelope labels/signature coupling: `envelopes-v1.md`
- trust + handshake intents: `../p2p-messaging-spec.md`, trust policy
- membrane enforcement for resulting flows: `membrane-v1.md`
- bazaar segmentation advertised by beacon: `tracenet-bazaars-v1.md`
