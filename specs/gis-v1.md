---
id: SPEC-GIS-V1
title: "gis-v1.md"
status: active
owner: core-engineering
reviewers: [eval-engineering, security-runtime-engineering]
version: "2026-03-28"
created: 2026-03-28
updated: 2026-07-13
supersedes: []
superseded_by: null
depends_on: []
scope: "This spec defines Information-Flow Control semantics for Sovereign Swarm."
source_of_truth: true
---

# gis-v1.md

Status: Canonical v1
Version: 2026-03-28

## Scope

This spec defines Information-Flow Control semantics for Sovereign Swarm.

It imports formal IFC concepts from FIDES and applies them to envelope- and gate-level policy checks.

## Imported Concepts (from FIDES)

The following are the only concepts attributed to FIDES in this stack:

1. Confidentiality labels
2. Integrity labels
3. Security lattice with join/meet operations
4. Dynamic taint-tracking
5. Non-interference (target property)
6. Declassification (explicit policy-controlled downgrade)
7. Selective hiding
8. Explicit-flow vs implicit-flow boundary
9. Enforceable security properties taxonomy

## Not Attributed to FIDES

The following are local engineering contracts:

- BLAKE3 content hashing
- Ed25519 signatures
- signed envelope schemas
- replay protection (nonce/seq/lamport)
- receipt chains and journals
- durable queue semantics
- checkout locks and run ownership

## Label Domains

Integrity labels:

- `T0_UNTRUSTED`
- `T1_OBSERVED`
- `T2_VERIFIED`
- `T3_CORE`

Confidentiality labels:

- `C0_PUBLIC`
- `C1_HIVE`
- `C2_BRANCH`
- `C3_PRIVATE`

All transferable objects MUST carry both labels.

## Trust Origin Note

Label authority in this stack is seat-governed, not wallet-age-governed.

Unsummoned keys do not receive elevated trust by age alone. Keys bound by valid seat assignment mandates may operate at assigned trust tiers.

## Actor-Class Confidentiality Ceiling

Confidentiality clearance is additionally bounded by actor class, independent of seat trust tier:

1. `C3_PRIVATE` is reserved for verified human members. A verified human member is a human identity attested by an enrolled Antimirror device credential (ECMemberCredential lineage) — never an agent key operating on a human's behalf.
2. Agent and claw seats cap at `C2_BRANCH`. No seat assignment, lease, or delegation may raise an agent's confidentiality clearance to `C3_PRIVATE`.
3. Declared (unattested) human members cap at `C1_HIVE`. Unknown actors cap at `C0_PUBLIC`.

A seat trust tier (`T0..T3`) and this ceiling compose independently: a `T3_CORE` agent seat still reads at most `C2_BRANCH`.

Enforcement points: membrane gates evaluating `confidentiality_ceiling` (see `membrane-v1.md`), and any service clearance ladder granting read access by attestation (e.g. oracle-style Q&A surfaces).

Provenance: ratified 2026-07-13 from the founder-intent access model draft (`access-model-v0.md`, Jul 13 2026). Prior to this date the ceiling existed only outside canon.

## Security Lattice

Partial orders:

- Integrity order (low to high trust): `T0 <= T1 <= T2 <= T3`
- Confidentiality order (low to high restriction): `C0 <= C1 <= C2 <= C3`

Composition rules:

- Integrity join: `join_i(a, b) = min(a, b)` in trust order
- Confidentiality join: `join_c(a, b) = max(a, b)` in restriction order
- Meet uses opposite extrema for each order

Merged outputs MUST use join results unless an explicit declassification policy overrides.

## Dynamic Taint-Tracking Rules

At runtime, every operation that reads labeled inputs MUST emit labeled outputs.

Propagation requirements:

1. Explicit data copy/pass-through propagates labels.
2. Merge/concat/compose uses lattice join.
3. Tool-return values are tainted at ingress by source trust.
4. Observation delta labels derive from all upstream inputs (join closure).

## Runtime Propagation Contract

At minimum, label propagation MUST be explicit for:

1. provider-capture ingress policy evaluations (`integrity_label_out`, `confidentiality_label_out`)
2. widget/module bridge intent evaluation outputs
3. supervisor UI/projected status payloads
4. trace-interop derived rows (`event_envelope`, `tracespan`, `workflowrun`, `memoryfact`, `trace_schema`)

Derived rows MUST use explicit lattice join semantics over upstream labels:

- integrity join: lowest trust among sources (`min` over `T0..T3`)
- confidentiality join: highest restriction among sources (`max` over `C0..C3`)

Any boundary result missing output labels is non-conformant.

## Declassification Policy

Declassification is any intentional downgrade of integrity/confidentiality labels.

A declassification action is valid only if:

1. an explicit policy rule exists for `(gate_type, transform, source_label, sink)`
2. the caller lease authorizes that transform verb
3. the decision emits a signed receipt

No inferred or heuristic declassification is allowed.

## Selective Hiding

Selective hiding replaces restricted values with opaque placeholders while preserving structure.

This is distinct from:

- redaction: remove content entirely
- masking: deterministic partial replacement

Selective hiding MUST preserve machine-parseable structure for downstream policy evaluation.

## Enforcement Boundary

Guaranteed by this model:

- explicit-flow controls under deterministic taint propagation

Not mechanically guaranteed:

- implicit flows through opaque model internals

Mitigation for implicit flow risk is policy hardening and governance controls, not proof of non-interference inside model weights.

## Enforceable Security Properties

Properties depending only on explicit data flow are in-scope for deterministic enforcement.

Properties requiring introspection of internal model reasoning are out-of-scope for this mechanism.

## Non-Normative Landscape Mapping

These are implementation/evaluation references, not formal foundations for this spec:

- Aura: bidirectional semantic firewall architecture (inbound + outbound checks)
- GUIGuard: privacy-recognition evaluation framing for agent trajectories
- Privasis: local sanitization model/pipeline reference for transform execution

Only the imported IFC concepts section is attributed to FIDES.
