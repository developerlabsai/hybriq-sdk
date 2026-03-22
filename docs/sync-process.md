# Monorepo → Standalone Sync Process

The HybrIQ SDK is developed in two locations. This document explains how changes flow between them.

## Repositories

| Repo | Path | Purpose |
|------|------|---------|
| **Hivemind v2** (monorepo) | `packages/sdk/` | Development home, integration tests against live API |
| **hybriq-sdk** (standalone) | `github.com/developerlabsai/hybriq-sdk` | Public repo, CI/CD, npm publish, external contributors |

## Sync Direction

```
Hivemind v2/packages/sdk/  ──sync──▸  hybriq-sdk/
       (source of truth)                (public mirror)
```

The **monorepo is the source of truth** for SDK code. The standalone repo adds:
- `.github/` (CI workflows, issue/PR templates)
- `docs/` (development process, sync process)
- `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
- `.gitignore`, `.editorconfig`, `.npmrc`

## Using the Sync Script

```bash
# From the standalone repo root
./scripts/sync-from-monorepo.sh

# What it does:
# 1. Copies src/, tests/, examples/ from monorepo
# 2. Copies package.json, tsconfig.json, vitest configs
# 3. Copies LICENSE
# 4. Does NOT overwrite: .github/, docs/, CONTRIBUTING.md, CHANGELOG.md, etc.
```

## When to Sync

- **Before every release**: Sync, then tag and publish
- **After significant SDK changes**: Especially if they affect the public API
- **Before accepting external PRs**: Ensure the standalone repo is up to date

## Handling External Contributions

If a contributor opens a PR on the standalone repo:

1. Review and merge to standalone `main`
2. Manually port the changes back to `Hivemind v2/packages/sdk/`
3. Run integration tests in the monorepo
4. Next sync will be a no-op for those files

## Files Never Synced

These files exist only in the standalone repo and are never overwritten:

- `.github/` — CI workflows and templates
- `docs/` — Development documentation
- `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
- `.gitignore`, `.editorconfig`, `.npmrc`
- `scripts/` — Sync and utility scripts
