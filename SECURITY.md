# Security Policy

- Private keys, wallet keypairs (`id.json`, `*.key.json`), `.env` files, and personal state (`~/.embertide/`, `~/.antimirror/`) must NEVER be committed to this repository.
- Automated secret scanning runs on every push and pull request via `.github/workflows/secrets-scan.yml`.
- Report security issues privately to Extrinsic Cognition maintainers before public disclosure.
