---
id: SPEC-TRACENET-ENVELOPE-V1
title: "tracenet-envelope-v1.md"
status: active
owner: core-engineering
reviewers: [eval-engineering, runtime-protocol-engineering]
version: "2026-03-31"
created: 2026-03-31
updated: 2026-04-03
supersedes: []
superseded_by: null
depends_on:
  - specs/conformance-v1.md
  - specs/schemas/tracenet.envelope.v1.schema.json
scope: "Defines canonical encrypted TraceNet transport envelope for inter-node message transfer."
source_of_truth: true
---

# tracenet-envelope-v1.md

Status: Canonical v1
Version: 2026-03-31
Owner: Core Engineering

## Scope

Defines canonical encrypted TraceNet transport envelope for inter-node message transfer.

This contract sits below `agent.mail.v1` payload semantics and above raw route transport.

Schema authority: `specs/schemas/tracenet.envelope.v1.schema.json`

## Route Channels

Canonical channels:

1. `handshake` -> `/tracenet/handshake/1`
2. `crystal` -> `/tracenet/crystal/1`
3. `packet` -> `/tracenet/packet/1`
4. `receipt` -> `/tracenet/receipt/1`
5. `settle` -> `/tracenet/settle/1`

Channel-route mismatch is non-conformant.

## Required Fields

A `tracenet.envelope.v1` object MUST include:

1. `version` (`"tracenet.envelope.v1"`)
2. `envelope_id`
3. `channel`
4. `route`
5. `from_node`
6. `to_node`
7. `from_agent`
8. `to_agent`
9. `nonce`
10. `created_at`
11. `expires_at`
12. `payload_ciphertext`
13. `payload_hash`
14. `aad_hash`
15. `seq`
16. `lamport`
17. `prev_hash`
18. `integrity_label`
19. `confidentiality_label`
20. `key_id`
21. `envelope_hash`
22. `signature`

## Cryptographic Rules

1. `payload_hash` and `aad_hash` use `blake3:<64-hex>` format.
2. `envelope_hash` is canonical BLAKE3 hash of unsigned envelope object.
3. `signature` is Ed25519 over canonical `envelope_hash` (`ed25519:<hex-128>`).
4. Labels are signed fields and MUST be included in preimage.

## Causality Rules

1. `seq` and `lamport` are monotonic per sender stream.
2. `prev_hash` links causal predecessor.
3. Replay attempts by duplicate `(nonce, from_node, key_id)` MUST be rejected.

## Optional Fields

Optional context fields:

1. `agent_mail_ref` (`message_id` linkage)
2. `tx_ref`
3. `e2ee` metadata (`alg`, sender/recipient key refs)
4. `metadata`

## Conformance

`conformance-v1` Suite AA validates:

1. valid TraceNet envelope schema acceptance
2. channel-route binding enforcement
3. invalid signature format rejection
4. invalid label rejection
5. missing required field rejection
6. unknown field rejection

## Runtime Conformance Hooks

Primary runtime enforcement points:

1. `coordination/iroh_routes.py` (route binding and transport ingress enforcement)
2. `coordination/process_agent_mail.py` (agent-mail signature/causality trust gates)
3. `coordination/tracenet_beacon_runtime.py` (discovery envelope context checks)

Primary eval coverage:

1. `coordination/run_tracenet_envelope_evals.py`
2. `coordination/run_tracenet_ingress_evals.py`
3. `coordination/run_tracenet_sender_capture_evals.py`
4. `coordination/run_transport_evals.py`
