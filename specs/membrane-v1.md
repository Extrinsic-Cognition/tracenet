---
id: SPEC-MEMBRANE-V1
title: "membrane-v1.md"
status: active
owner: core-engineering
reviewers: [eval-engineering, security-runtime-engineering, runtime-protocol-engineering]
version: "2026-03-28"
created: 2026-03-28
updated: 2026-04-03
supersedes: []
superseded_by: null
depends_on: []
scope: "Defines directional membrane gates and transform/receipt behavior."
source_of_truth: true
---

# membrane-v1.md

Status: Canonical v1
Version: 2026-03-28

## Scope

Defines directional membrane gates and transform/receipt behavior.

All boundary crossings MUST pass through a directional gate.

## Directional Gate Set

1. `IngressInspector` (external -> node)
2. `EgressSanitizer` (node -> external)
3. `LateralProjector` (node -> node, same tier)
4. `DownwardProjector` (leader -> follower projection)
5. `UpwardPromoter` (child/leader -> mother canonical write)

## Deterministic Gate Pipeline

For each crossing:

1. classify: parse object + labels + sink context
2. check: evaluate lease + policy + sink constraints
3. transform: apply allowed operation set
4. sign: sign resulting envelope/hash
5. receipt: append signed decision record

No silent crossing is permitted.

## Transform Vocabulary

Allowed transform actions:

- `allow`
- `drop`
- `mask`
- `tokenize`
- `generalize`
- `summarize`
- `encrypt_for_sink`

### `summarize` Special Rule

`summarize` is non-deterministic inference and can launder taint.

When used:

1. policy MUST explicitly authorize summarize at that gate
2. output integrity label MUST be downgraded to at most `T1_OBSERVED`
3. provenance metadata MUST include source hashes and transform receipt id

## Policy Input Contract

Decision inputs MUST include:

- gate type
- actor identity + lease id
- source labels (`integrity_label`, `confidentiality_label`)
- sink identity + sink class
- payload hash + schema version
- seat assignment context (`hex_cell_uuid`, `seat_assignment_uuid`, `assignment_epoch`) when available
- control-tower policy context (`policy_epoch`, `matched_rule_id`) when available

## Receipt Contract

Each gate decision emits a signed receipt containing:

- `receipt_id`
- `gate_type`
- `decision`
- `transform`
- `policy_ref`
- `input_hash`
- `output_hash` (if transformed)
- `reason_codes[]`
- `ts`
- `signer`
- `policy_epoch` (if control-tower rule applied)
- `seat_assignment_uuid` (if seat-scoped actor)

## Signature Coupling Requirement

`integrity_label` and `confidentiality_label` are signed protocol fields.

They MUST be inside canonical envelope hash preimage. Unsigned label metadata is non-conformant.

## Enforcement Objective

Primary objective is explicit-flow containment with deterministic policy control.

Implicit-flow risk through model internals remains residual and must be controlled via selective hiding, least privilege, and governance checks.

## Conformance Hooks

The conformance baseline MUST include boundary enforcement checks for:

1. provider capture ingress decisions (`IngressInspector`)
2. widget/module bridge boundary decisions (ingress + egress where applicable)
3. supervisor status projection through `DownwardProjector`
4. quarantine + override paths with receipted denials/approvals

## Non-Normative Implementation References

These references inform implementation choices but are not protocol authority:

- Aura: validates duplex gate posture (ingress + egress + taint-aware memory)
- Privasis: candidate local transform engine for sanitization operations
- GUIGuard: highlights classify-stage failure risk and motivates stronger classify policy/testing
