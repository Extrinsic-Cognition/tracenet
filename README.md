# TraceNet — Open Traces Protocol & Privacy Membrane

**Open Source** ships final code. **Open Traces** ships *the code plus the sanitized, consent-signed reasoning and execution trajectory that produced and proved it*.

> **Status:** Draft specification + working privacy membrane & canary-tested offering gate · **PRIVATE until license & public launch confirmation.**

## Core Law: `COGNITIO SALVATA` (Retrieve Before Recompute)

1. **Trace (raw ore):** Unprocessed agent execution record — stays local (`C3_PRIVATE` never leaves the human's machine).
2. **Privacy Membrane (`membrane/`):** Deterministic multi-stage redaction gate with **cryptographic keypair detection by proof** (verifies 64-byte base58/hex Ed25519 keypairs via `edPublic(seed) == pub`, BIP39 12+ word seed phrases, NFKC + invisible/bidi stripping, secret shapes, L0 private paths, emails, LAN IPs, optional `gitleaks` + `trufflehog`) and a **22-kind seeded canary recall test** run alongside every offer.
3. **Crystal (refined unit):** Consent-signed, distilled cognition artifact permanently addressed by `BLAKE3(canonical_json)`.
4. **P2P Exchange (`TRACENET2.md`):**
   - **`iroh-gossip` (`/iroh-gossip/1`):** Capability beacons (`tracenet/presence/v1`, carrying BitTorrent-style `share_ratio` for tit-for-tat throttling) and crystal announcements (`tracenet/domain/<tag>/v1`, `tracenet/branch/<ns>/v1`).
   - **`iroh-docs`:** Shared CRDT KV index keyed `crystal/<domain_tag>/<task_fingerprint>/<author_key> → BLAKE3(crystal)`.
   - **`iroh-blobs`:** Chunk-verified BLAKE3 streaming transfer.
   - **4-key identity:** `transport_key` (ephemeral Iroh NodeID), `author_key` (reputation), `human_key` (mandatory signed export consent), `solana_key` (anchored via signed Pkarr DNS record).
   - **Private fleet complement:** For small private swarms (2–20 claws), [SwarmClock](https://github.com/Extrinsic-Cognition/swarmclock) uses direct QUIC bi-streams (`ec/ingress/v1`) with fail-closed admission & Merkle-rooted event ordering.

## Layout

```
TRACENET.md                Original TraceNet v0.1.0 protocol & cognitive liberty commitments
TRACENET2.md               P2P Iroh engineering specification (crystals, gossip, iroh-docs, settlement)
COLLECTI-LICENSE-DRAFT.md  Draft copyleft-for-traces licensing concept (for legal review)
specs/                     Envelope, beacon, bazaar, GIS lattice (C0-C3/T0-T3), and membrane specs
membrane/
  membrane.mjs             L0/L1/L2 path classification
  receipt-schema.mjs       Sanitized receipt schema & ref naming
  tracenet-sanitize.mjs    Deterministic L0 sanitizer & receipt builder
  tracenet-offer/
    gate.mjs               5-stage privacy gate + cryptographic key detection + 22-kind canary recall
    offer.mjs              Transcript span -> solved-fix cards + gated raw turns bundler
    card.mjs               Solved-fix card extractor
    fixes.mjs              Fix/check event pairing
    span.mjs               Transcript time-span indexer
    measure.mjs            Retrieve-before-recompute ablation harness
    bip39-english.txt      Standard BIP39 wordlist for seed-phrase detection
```

## Running the P2P Node & Tests

```bash
# Privacy membrane + 22-kind canary recall tests (Node, zero npm dependencies)
node --test membrane/tracenet-sanitize.test.mjs membrane/tracenet-offer/offer.test.mjs

# Live 2-peer iroh 0.97 P2P integration tests (handshake, iroh-blobs, consent, tit-for-tat)
cargo test --manifest-path node/Cargo.toml

# Run the live 2-peer Open Traces demo (privacy gate -> dual-sign -> iroh-gossip + iroh-blobs -> receipt)
cargo run --manifest-path node/Cargo.toml -- demo

# CLI commands
cargo run --manifest-path node/Cargo.toml -- init
cargo run --manifest-path node/Cargo.toml -- offer path/to/trace.txt rust
```

## Syncing From a Private Forge

[`scripts/sync-public.sh`](scripts/sync-public.sh) exports committed changes from the private `house` monorepo into standalone `tracenet`, `poleis`, and `swarmbook`, scrubbing local paths, running full test suites + `gitleaks`, and refusing to push unless every check passes:

```bash
bash scripts/sync-public.sh all          # dry-run commit locally
bash scripts/sync-public.sh all --push   # verify + push
```

## License

- **Specifications (`TRACENET.md`, `TRACENET2.md`, `specs/`):** [CC0-1.0](LICENSE-CC0)
- **Code (`membrane/` & SDKs):** [Apache-2.0](LICENSE) (see [NOTICE](NOTICE))
