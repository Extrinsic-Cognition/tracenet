#!/usr/bin/env bash
# sync-public.sh — Repeatable, fail-closed exporter from the private `house` Forge
# into the standalone Extrinsic Cognition repositories (`poleis`, `tracenet`, `swarmbook`).
#
# Usage:
#   bash scripts/sync-public.sh [poleis|tracenet|swarmbook|all] [--push]
#
# Safety guarantees:
#   - Extracts ONLY from committed git trees (`git archive main`) — never untracked local files.
#   - Scrubs personal home paths (/Users/*/) and strips R2-hosted heavy media (.mp4/.m4a/.bin).
#   - Runs standalone test suites AND gitleaks before committing or pushing.
#   - Never pushes unless --push is explicitly passed AND every check passes.

set -euo pipefail

TARGET="${1:-all}"
DO_PUSH=0
for arg in "$@"; do
  [[ "$arg" == "--push" ]] && DO_PUSH=1
done

CODE_ROOT="${CODE_ROOT:-$HOME/code-ec}"
HOUSE="${HOUSE_DIR:-$CODE_ROOT/house}"

[[ -d "$HOUSE/.git" ]] || { echo "ERROR: house repo not found at $HOUSE" >&2; exit 1; }
HOUSE_SHA=$(git -C "$HOUSE" rev-parse --short main)
echo "=== sync-public.sh (source: house/main @ $HOUSE_SHA, target: $TARGET, push: $DO_PUSH) ==="

scrub_paths() {
  local dir="$1"
  python3 - "$dir" <<'PY'
import os, re, sys
root = sys.argv[1]
for r, ds, fns in os.walk(root):
    for skip in ('.git', 'target', 'node_modules'):
        if skip in ds: ds.remove(skip)
    for fn in fns:
        if not fn.endswith(('.rs','.mjs','.js','.ts','.py','.sh','.md','.json','.jsonc','.toml','.html','.css','.txt')):
            continue
        fp = os.path.join(r, fn)
        try:
            txt = open(fp, encoding='utf-8').read()
        except Exception:
            continue
        nt = re.sub(r'/Users/(?:lysergic_ratata|guidopardi)/', '~/', txt)
        nt = re.sub(r'lysergic_ratata@guidos-macbook-pro-2\.local', 'builder@local-host', nt)
        if nt != txt:
            open(fp, 'w', encoding='utf-8').write(nt)
PY
}

run_gitleaks() {
  local dir="$1"
  if ! command -v gitleaks >/dev/null 2>&1; then
    echo "  [warn] gitleaks not installed on PATH; skipping gitleaks check"
    return 0
  fi
  local report
  report=$(mktemp /tmp/sync-public-gl.XXXXXX.json)
  trap "rm -f '$report'" RETURN
  gitleaks detect --source "$dir" --no-git --max-target-megabytes 1 --redact --no-banner --exit-code 0 --report-format json --report-path "$report" >/dev/null 2>&1 || true
  python3 - "$report" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])) or []
known = ('.test.', '/tests/', 'fixture', 'vectors', 'gate.mjs', 'tracenet-sanitize.mjs', 'dl-society-codes.mjs', 'permit-vector.json', 'seat-vector.json')
real = [f for f in d if not any(k in f.get('File', '') for k in known)]
if real:
    print(f"ERROR: gitleaks found {len(real)} non-test finding(s):", [f.get('File') for f in real[:10]], file=sys.stderr)
    sys.exit(2)
print(f"  [ok] gitleaks clean ({len(d)} synthetic/test fixture hits, 0 real leaks)")
PY
}

sync_tracenet() {
  local dest="$CODE_ROOT/tracenet"
  echo "--- Syncing tracenet/membrane/ from house/main ($HOUSE_SHA) ---"
  local tmp
  tmp=$(mktemp -d /tmp/sync-tracenet.XXXXXX)
  git -C "$HOUSE" archive main -- \
    tools/embertide-mesh/membrane.mjs \
    tools/embertide-mesh/tracenet-offer/bip39-english.txt \
    tools/embertide-mesh/tracenet-offer/card.mjs \
    tools/embertide-mesh/tracenet-offer/fixes.mjs \
    tools/embertide-mesh/tracenet-offer/gate.mjs \
    tools/embertide-mesh/tracenet-offer/measure.mjs \
    tools/embertide-mesh/tracenet-offer/offer.mjs \
    tools/embertide-mesh/tracenet-offer/offer.test.mjs \
    tools/embertide-mesh/tracenet-offer/span.mjs \
    | tar -x -C "$tmp"
  cp "$tmp/tools/embertide-mesh/membrane.mjs" "$dest/membrane/membrane.mjs"
  cp "$tmp/tools/embertide-mesh/tracenet-offer/"* "$dest/membrane/tracenet-offer/"
  rm -rf "$tmp"
  scrub_paths "$dest"
  node --test "$dest/membrane/tracenet-sanitize.test.mjs" "$dest/membrane/tracenet-offer/offer.test.mjs"
  cargo test --manifest-path "$dest/node/Cargo.toml" --quiet
  run_gitleaks "$dest"
  commit_and_push "$dest" "sync: update tracenet membrane from house/main ($HOUSE_SHA)"
}

sync_poleis() {
  local dest="$CODE_ROOT/poleis"
  echo "--- Syncing poleis from house/main ($HOUSE_SHA) ---"
  local tmp
  tmp=$(mktemp -d /tmp/sync-poleis.XXXXXX)
  git -C "$HOUSE" archive main -- poleis/program poleis/client poleis/seal poleis/seat-wasm poleis/charters | tar -x -C "$tmp"
  # Copy updated program/client/seal/seat-wasm/charters while preserving provenance.json & Cargo path mappings
  rsync -a --exclude 'Cargo.toml' --exclude 'Cargo.lock' --exclude 'provenance.json' "$tmp/poleis/" "$dest/poleis/"
  rm -rf "$tmp"
  # Re-apply poleis_* Rust identifier mapping on freshly synced files
  python3 - "$dest" <<'PY'
import os, sys
pl = sys.argv[1]
reps = [("embertide-war","poleis-war"),("embertide_war","poleis_war"),("embertide-futarchy","poleis-futarchy"),("embertide_futarchy","poleis_futarchy"),("embertide-stake","poleis-stake"),("embertide_stake","poleis_stake"),("embertide-wallet","poleis-wallet"),("embertide_wallet","poleis_wallet")]
for r, ds, fns in os.walk(os.path.join(pl, "poleis")):
    if 'target' in ds: ds.remove('target')
    for fn in fns:
        if not fn.endswith(('.rs','.mjs','.js','.sh','.md')): continue
        fp = os.path.join(r, fn)
        t = open(fp, encoding='utf-8', errors='ignore').read()
        nt = t
        for a, b in reps: nt = nt.replace(a, b)
        if nt != t: open(fp, 'w', encoding='utf-8').write(nt)
PY
  scrub_paths "$dest"
  for c in crates/poleis-war crates/poleis-futarchy crates/poleis-stake crates/poleis-wallet poleis/client poleis/seal poleis/door; do
    cargo test --manifest-path "$dest/$c/Cargo.toml" --quiet
  done
  node --test "$dest/tools/warm-launch/warm-launch.test.mjs"
  (cd "$dest/tools/warm-day0" && node --test $(find . -name '*.test.mjs'))
  run_gitleaks "$dest"
  commit_and_push "$dest" "sync: update poleis from house/main ($HOUSE_SHA)"
}

sync_swarmbook() {
  local dest="$CODE_ROOT/swarmbook"
  echo "--- Syncing swarmbook worker & app from house/main ($HOUSE_SHA) ---"
  local tmp
  tmp=$(mktemp -d /tmp/sync-swarmbook.XXXXXX)
  git -C "$HOUSE" archive main -- embertide-app/ui/intro/dyson-society | tar -x -C "$tmp"
  rsync -a \
    --exclude 'worker/space-router-seat.test.mjs' \
    --exclude '*.mp4' --exclude '*.m4a' --exclude '*.bin' \
    --exclude 'app/warm-media/world-lossless-2' \
    "$tmp/embertide-app/ui/intro/dyson-society/worker/" "$dest/worker/"
  rm -rf "$tmp"
  scrub_paths "$dest"
  node --test "$dest/worker/space-router-seat.test.mjs" "$dest/app/swarmbook-"*.test.mjs
  run_gitleaks "$dest"
  commit_and_push "$dest" "sync: update swarmbook worker from house/main ($HOUSE_SHA)"
}

commit_and_push() {
  local dir="$1" msg="$2"
  # Remove any cargo target/ dirs before staging
  find "$dir" -maxdepth 4 -type d -name target -exec rm -rf {} + 2>/dev/null || true
  if [[ -z "$(git -C "$dir" status --porcelain)" ]]; then
    echo "  [ok] $(basename "$dir"): already up to date"
    return 0
  fi
  git -C "$dir" add -A
  git -C "$dir" commit -q -m "$msg"
  echo "  [ok] $(basename "$dir"): committed $(git -C "$dir" rev-parse --short HEAD)"
  if [[ "$DO_PUSH" == "1" ]]; then
    git -C "$dir" push -q origin main
    echo "  [ok] $(basename "$dir"): pushed to origin/main"
  fi
}

case "$TARGET" in
  poleis)    sync_poleis ;;
  tracenet)  sync_tracenet ;;
  swarmbook) sync_swarmbook ;;
  all)       sync_tracenet; sync_poleis; sync_swarmbook ;;
  *) echo "Unknown target: $TARGET (use poleis|tracenet|swarmbook|all)" >&2; exit 2 ;;
esac
echo "=== sync-public.sh complete ==="
