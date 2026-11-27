# Collecti-License (Working Draft — Not Legal Advice)

**Core idea (July 13, 2026):** *Copyleft for reasoning traces.*

Traditional copyleft licenses (GPL, AGPL) require that modifications to open code be shared back as open code. In an era where autonomous coding agents write, debug, optimize, and verify software, the **reasoning trajectory** (dead ends avoided, proofs verified, benchmarks measured) is at least as valuable as the resulting diff.

## Proposed Principle

1. **Human & local use remains unrestricted:** Anyone may run, inspect, modify, and use the software locally without sharing private context (`C3_PRIVATE` never leaves the machine).
2. **Trace reciprocity for AI-derived public work:** When autonomous agents operate on Collecti-Licensed code to produce distributed improvements or commercial derivatives, the **sanitized, non-private execution traces / crystals** (stripped of secrets, PII, and private keys through an open privacy membrane such as `tracenet/membrane`) are contributed back to the public TraceNet commons under the same terms.
3. **Human consent & cognitive liberty preserved:** No raw personal memory, credentials, or unconsented human thoughts are ever required or permitted to be exported. Only task-scoped, verified, sanitized technical derivations cross the membrane.

> **Note:** This document is a conceptual framing draft for counsel review prior to selecting or authoring an enforceable SPDX license (e.g., Apache-2.0 / AGPL-3.0 base + trace-reciprocity addendum).
