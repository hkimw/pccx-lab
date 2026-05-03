# Contributing to pccx-lab

Start with the PCCXAI organization-wide contributing guide:
<https://github.com/pccxai/.github/blob/main/CONTRIBUTING.md>.

This repository adds a few local expectations for pccx-lab changes:

- Keep changes scoped to the issue or pull request.
- Preserve the CLI/core boundary described in [README.md](README.md).
- Check [docs/design/](docs/design/) before changing architecture,
  crate boundaries, IPC shape, or GUI/core ownership.
- Do not commit generated build output, local environment files, trace
  artifacts, or private notes.

## How to build and test pccx-lab

pccx-lab uses a Rust workspace plus a Tauri/React frontend. The CI
surface documented in [README.md](README.md), [scripts/README.md](scripts/README.md),
and `.github/workflows/ci.yml` currently centers on:

```bash
cargo fmt --all -- --check
cargo check --workspace --all-targets
cargo test --workspace
```

For the frontend, run the same npm checks from `ui/`:

```bash
npm ci
npm run test:static
npm run typecheck
npm run build
```

For a fuller local sweep, use:

```bash
bash scripts/validate-local.sh
```

For environment setup or missing tooling, start with:

```bash
bash scripts/doctor.sh
```
