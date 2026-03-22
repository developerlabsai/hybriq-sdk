# SDK Development Process

> **TD-SDK-2026 · v1.1.0 · March 2026**
>
> Complete testing strategy, quality assurance workflow, and release management for the HybrIQ TypeScript SDK.

---

## 1. Overview

The HybrIQ SDK (`@hybriq/sdk`) is a TypeScript package providing **cache-wrapped LLM execution** with a federated library and billing system. It supports two operational modes: **cloud** (V2 SaaS client routing through the HybrIQ API) and **local** (OSS self-hosted with Ed25519 license validation and direct LLM calls).

This document defines the complete development lifecycle from local development through production release, ensuring quality, stability, and **zero disruption to production users**.

| Metric | Value |
|--------|-------|
| Test Cases | 87+ |
| Test Layers | 4 |
| Full Suite Runtime | ~10s |

### Package Summary

| Property | Value |
|----------|-------|
| Package Name | `@hybriq/sdk` |
| Version | 0.1.0 (Developer Preview) |
| Entry Point | `dist/index.js` |
| Type Declarations | `dist/index.d.ts` |
| CLI Binary | `hybriq` — `npx hybriq stats` |
| Runtime | Node.js 18+ (ES2022 target) |
| Module System | NodeNext (ESM) |
| License | MIT |

> **Key Principle**: SDK testing is fundamentally different from UI testing. It is **deterministic**, **fully automatable**, and **version-isolated** — users control when they upgrade, so a bug in `v0.2.1` never affects users on `v0.2.0`.

---

## 2. SDK Architecture

The SDK provides a unified `HybrIQSDK` class with mode-switched internals. The constructor accepts a `HybrIQConfig` that determines whether execution routes through the **HybrIQ cloud API** or runs **locally** with direct provider calls.

```
┌──────────────────────────────────────────────────────────────────┐
│                         HybrIQSDK                                │
│                    mode: "cloud" | "local"                        │
├─────────────────────────┬────────────────────────────────────────┤
│       CLOUD MODE        │           LOCAL MODE                   │
│                         │                                        │
│  ┌───────────────────┐  │  ┌───────────────────┐                 │
│  │  HybrIQApiClient  │  │  │  License Validator │                │
│  │  (HTTP + Retry)    │  │  │  (Ed25519 Offline) │                │
│  └────────┬──────────┘  │  └────────┬──────────┘                 │
│           │              │           │                            │
│  ┌────────▾──────────┐  │  ┌────────▾──────────┐                 │
│  │  Execute (2-step)  │  │  │  ExecuteLocal      │                │
│  │  start → complete  │  │  │  (Direct LLM Call)  │                │
│  └───────────────────┘  │  └────────┬──────────┘                 │
│                         │           │                            │
│  ┌───────────────────┐  │  ┌────────▾──────────┐                 │
│  │  AgentsModule      │  │  │  LocalCache        │                │
│  │  LibraryModule     │  │  │  Tier 1: SHA-256   │                │
│  │  BillingModule     │  │  │  Tier 2: Semantic   │                │
│  │  EnrichmentModule  │  │  │  (TF-IDF / OpenAI)  │                │
│  └───────────────────┘  │  └───────────────────┘                 │
│                         │                                        │
│                         │  ┌───────────────────┐                 │
│                         │  │  LocalMetering     │                 │
│                         │  │  LocalConfig       │                 │
│                         │  │  PackExport        │                 │
│                         │  └───────────────────┘                 │
└─────────────────────────┴────────────────────────────────────────┘
```

### Cloud Mode Capabilities

- **API key + base URL** authentication with automatic Bearer token injection
- **Retry logic** — exponential backoff on 5xx, Retry-After on 429, no retry on 402
- **Credit metering** — two-step execute (reserve → finalize) with balance tracking
- **Library browsing** — agents, skills, specialties, team clusters with subscribe/unsubscribe
- **Agent execution** — synchronous runs and SSE streaming with version pinning
- **Enrichment caching** — cross-tenant contact/account/domain enrichment

### Local Mode Capabilities

- **Ed25519 license validation** — offline signature verification, no network call required
- **Direct LLM calls** — Anthropic and OpenAI provider wrappers with cost estimation
- **Two-tier SQLite cache** — exact SHA-256 match + semantic TF-IDF/OpenAI embeddings
- **Local metering** — SQLite execution logging with 30-day and all-time usage reports
- **YAML config** — `.hybriq/agents/*.yaml` and `.hybriq/skills/*.yaml` loader
- **Pack export** — `.tar.gz` migration archive with manifest, agents, skills, and cache

### Dependencies

| Package | Type | Purpose |
|---------|------|---------|
| @noble/ed25519 | Production | Ed25519 license signature verification |
| sql.js | Production | SQLite WASM for local cache and metering |
| tar | Production | Archive creation for pack export |
| @anthropic-ai/sdk | Peer (optional) | Anthropic Claude API wrapper |
| openai | Peer (optional) | OpenAI API wrapper |
| vitest | Dev | Test runner and assertion framework |
| @vitest/coverage-v8 | Dev | V8 code coverage instrumentation |
| msw | Dev | Mock Service Worker for HTTP interception |

---

## 3. Environment & Release Channels

Unlike web applications with dev/staging/production servers, SDKs use **npm release channels** (dist-tags). Each channel maps to a stability level. Production users on `latest` never see unstable versions unless they explicitly opt in.

| Channel | npm Tag | Version Format | Purpose | Audience |
|---------|---------|---------------|---------|----------|
| Development | *(unpublished)* | N/A | Local development via `npm pack` | SDK developers only |
| Alpha | `--tag alpha` | `0.1.0-alpha.1` | Earliest testable builds | Internal team |
| Beta | `--tag beta` | `0.1.0-beta.1` | Feature-complete pre-release | Early adopters, internal products |
| Release Candidate | `--tag rc` | `0.1.0-rc.1` | Final validation | QA team, select partners |
| Production | `latest` | `0.1.0` | Stable public release | All users |

### Installing Specific Channels

```bash
# Production (default — what all users get)
npm install @hybriq/sdk

# Beta channel — for early adopters
npm install @hybriq/sdk@beta

# Specific version — pinned for stability
npm install @hybriq/sdk@0.1.0-beta.3

# Release candidate — final pre-production
npm install @hybriq/sdk@rc
```

> **User Safety Guarantee**: Users who run `npm install @hybriq/sdk` always receive the stable `latest` tag. Pre-release versions are **never** installed unless the user explicitly requests a tagged version.

---

## 4. Testing Strategy — Four Layers

The SDK test infrastructure is organized into **four layers**, each catching a different class of defect.

### Layer 1: Unit Tests

**Command**: `npm test` (~10s)

Unit tests use **Vitest 4.x** with **MSW** (Mock Service Worker) to intercept HTTP at the network level. No real API server is required.

- **SDK initialization & mode selection** — cloud/local constructor validation, mode gating
- **Error classes** — HybrIQError, AuthError, InsufficientCreditsError, RateLimitError, ProviderError
- **HTTP client retry logic** — 5xx exponential backoff, 429 Retry-After, no retry on 402
- **Billing module** — balance, plans, and usage queries via mocked API
- **Local cache** — exact match, stats tracking, hash computation, semantic matching
- **Embeddings** — TF-IDF vector generation, cosine similarity, L2 normalization
- **License validation** — prefix check, base64url decoding, signature verification, feature gating
- **Type exports** — all 19+ public types importable

### Layer 2: Contract Tests

**Command**: `npm test` (included in unit suite)

Contract tests verify that SDK type definitions match actual API response shapes. They use MSW recorded responses as fixtures, validating `BalanceInfo`, `PlanInfo[]`, `UsageReport`, and `LibraryItem[]` shapes. If an API endpoint changes format, these tests catch the mismatch **before users discover it**.

### Layer 3: Integration Tests

**Command**: `npm run test:integration` (~30s)

End-to-end verification against a **running local HybrIQ API**. Creates real tenants, generates API keys, and executes SDK methods against the live local database.

- **Prerequisites**: `pnpm dev` running, database seeded, `ADMIN_PASSWORD` env var
- **Tests**: balance retrieval, plan listing, usage reports, library browsing, auth error handling
- **Timeout**: 30 seconds per test (accounts for API cold start)

### Layer 4: Smoke Tests

**Command**: `npm run test:smoke` (~300ms)

Verifies that the SDK is importable, all public exports work, and both modes can be instantiated. Catches broken exports, missing modules, import cycles, and build artifact issues.

### Coverage Thresholds

| Metric | Current (v0.1.0) | Target (v0.2.0) | Target (v0.3.0) |
|--------|------------------|-----------------|-----------------|
| Statements | 35% | 50% | 70% |
| Branches | 20% | 40% | 60% |
| Functions | 40% | 55% | 70% |
| Lines | 35% | 50% | 70% |

If coverage drops below the configured thresholds, the `test:coverage` command and CI `coverage` job will fail. This prevents merging PRs that reduce test quality.

---

## 5. Test Infrastructure

### Directory Structure

```
├── vitest.config.ts              ── Unit + contract tests config
├── vitest.integration.config.ts  ── Integration tests config
├── vitest.smoke.config.ts        ── Smoke tests config
├── tests/
│   ├── setup.ts                  ── Global: NODE_ENV, console suppression
│   ├── mocks/
│   │   ├── handlers.ts           ── MSW handlers (simulates HybrIQ API)
│   │   └── server.ts             ── MSW server instance for Node.js
│   ├── unit/
│   │   ├── sdk-init.test.ts      ── SDK initialization & mode gating
│   │   ├── types.test.ts         ── Error classes & type exports
│   │   ├── client.test.ts        ── HTTP client & retry logic
│   │   ├── billing.test.ts       ── Billing module (balance, plans, usage)
│   │   ├── cache.test.ts         ── Local cache (exact + semantic)
│   │   ├── embeddings.test.ts    ── TF-IDF embeddings & cosine similarity
│   │   └── license.test.ts       ── License validation & feature access
│   ├── contract/
│   │   └── api-contracts.test.ts ── API response shape validation
│   ├── integration/
│   │   └── cloud-flow.test.ts    ── End-to-end cloud mode flow
│   └── smoke/
│       └── examples.test.ts      ── Import & instantiation verification
```

### MSW Mock Server

The test infrastructure uses **Mock Service Worker (MSW)** to intercept HTTP requests at the network level:

- **Each API endpoint** has a corresponding handler in `tests/mocks/handlers.ts`
- **Handlers validate** auth headers, parse request bodies, and return typed responses
- **State management** via `resetMockState()` between tests prevents cross-test interference
- **Response fixtures** serve as living API documentation

### Available Scripts

| Command | Description | Speed |
|---------|-------------|-------|
| `npm test` | Unit + contract tests | ~10s |
| `npm run test:watch` | Watch mode for development | Continuous |
| `npm run test:coverage` | With V8 coverage report | ~12s |
| `npm run test:integration` | Against running local API | ~30s |
| `npm run test:smoke` | Import/export verification | ~300ms |
| `npm run test:all` | Unit + smoke combined | ~11s |
| `npm run test:ci` | CI mode with JUnit reporter | ~12s |

---

## 6. Local Development Workflow

### Development Loop

1. **Write code** — Modify source files in `src/`
2. **Run unit tests** — `npm test` to verify logic
3. **Watch mode** — `npm run test:watch` during active development
4. **Integration tests** — Run `test:integration` if API contracts changed
5. **Build the package** — `npm run build` to compile TypeScript
6. **Local testing via npm pack** — Create a tarball and install it in a test project
7. **Smoke tests** — `npm run test:smoke` to verify exports
8. **Coverage report** — `npm run test:coverage` before PR

### Local Package Testing

```bash
# Build and pack the SDK into a tarball
npm run build
npm pack    # Creates hybriq-sdk-0.1.0.tgz

# Install in a separate test project
cd /path/to/test-project
npm install ../hybriq-sdk/hybriq-sdk-0.1.0.tgz

# Verify the import works
node -e "const { HybrIQSDK } = require('@hybriq/sdk'); console.log('OK');"
```

> **npm pack vs npm link**: Always use `npm pack` over `npm link` for local testing. `npm link` creates symlinks that cause peer dependency resolution issues, especially with optional peer deps like `@anthropic-ai/sdk` and `openai`.

### SDK vs UI: Why Testing Is Easier

| Dimension | SDK | UI |
|-----------|-----|-----|
| Determinism | Same input = same output | Browser rendering quirks, viewport differences |
| Automation | Every method tested programmatically | Requires Playwright/Cypress for E2E |
| Versioning | Users control upgrades | All users see changes immediately |
| Contracts | Types compile = SDK works | Visual regression testing needed |
| Speed | ~10s unit, ~300ms smoke | Minutes to hours for full E2E |
| Isolation | MSW intercepts at network level | Requires running servers |

---

## 7. Quality Gates

Every SDK change passes through a series of quality gates. Each gate must pass completely before advancing.

### Gate 1: Merge to Main

- **All unit tests pass** — 78+ test cases in `tests/unit/`
- **All contract tests pass** — API response shape verification in `tests/contract/`
- **All smoke tests pass** — 9+ import/export checks in `tests/smoke/`
- **Coverage thresholds met** — 70% statements, 60% branches, 70% functions, 70% lines
- **TypeScript compilation succeeds** — strict mode, no errors
- **No unhandled promise rejections** — all async errors properly consumed

### Gate 2: Publish to Beta

- **All Gate 1 requirements pass**
- **Integration tests pass** against staging API
- **Examples run without errors** — `examples/cloud-quickstart.ts` and `examples/local-quickstart.ts`
- **Version bump follows semver** — patch, minor, or major as appropriate
- **CHANGELOG updated** with release notes

### Gate 3: Promote to Production

- **Beta tested by internal products** for minimum 3 days
- **No regression reports** from beta users
- **Release candidate (RC) published and tested**
- **Manual approval from engineering lead**

> **Breaking Change Protocol**: Any change that modifies a public API signature, removes an export, or changes default behavior is a **breaking change** requiring a major version bump. Never introduce breaking changes in a patch or minor release.

---

## 8. Release Process

### Semantic Versioning Rules

| Bump | Version | When | User Action |
|------|---------|------|-------------|
| patch | `0.1.1` | Bug fixes, no API changes | Safe to auto-upgrade |
| minor | `0.2.0` | New features, backwards compatible | Users get new capabilities |
| major | `1.0.0` | Breaking changes | Users must update code (migration guide) |

### Publishing Workflow

1. **Update version** — Bump version in `package.json` according to semver rules
2. **Run full test suite** — `npm run test:all`
3. **Build** — `npm run build`
4. **Publish beta** — `npm publish --tag beta`
5. **Validate beta** — Install in consuming project: `npm install @hybriq/sdk@beta`
6. **Publish RC** — Bump to `-rc.1` suffix, `npm publish --tag rc`
7. **Final validation** — Test RC in staging environment
8. **Promote to production** — `npm publish` (gets `latest` tag)

### CI/CD Pipeline

```
┌────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  PR Opened │───▸│  Unit Tests +    │───▸│  Merge to Main   │───▸│  Integration     │
│            │    │  Build (auto)    │    │                  │    │  Tests (auto)    │
└────────────┘    └──────────────────┘    └──────────────────┘    └────────┬─────────┘
                                                                          │
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│  npm latest      │◂───│  Manual Promote  │◂───│  npm beta (auto) │◂─────┘
│  (approval req.) │    │  (eng lead)      │    │  Tag: v0.x.x-    │
└──────────────────┘    └──────────────────┘    │  beta.x          │
                                                └──────────────────┘
```

### GitHub Actions Workflow Jobs

| Job | Trigger | What It Does | Node Versions |
|-----|---------|-------------|---------------|
| test | PR + push | Unit + contract + smoke tests across Node matrix | 18, 20, 22 |
| coverage | PR + push | V8 coverage report with threshold enforcement | 22 |
| build-verify | PR + push | TypeScript build + `npm pack` dry-run verification | 22 |
| publish-prerelease | Tag `v*-beta.*` | Auto-publish to npm with `--tag beta` | 22 |
| publish-production | Manual dispatch | Publish to npm `latest` (requires approval) | 22 |

### One-Touch Prerelease Validation

```bash
# Run the full prerelease pipeline (one command)
npm run prerelease

# What it does under the hood:
#   1. npm run clean      → Removes dist/ for a fresh build
#   2. npm run build      → TypeScript compilation (strict mode)
#   3. npm run test:all   → Unit + contract + smoke tests (87+ tests)
#   4. npm run test:coverage → V8 coverage with threshold enforcement
#   5. Echo "All checks passed — ready to publish"
```

> **Why Tests Don't Auto-Update**: Tests are **contracts that define expected behavior**. When code changes and a test breaks, the failing test is a signal — it means behavior changed and a human needs to decide: was this intentional (update the test) or a regression (fix the code)?

---

## 9. Security & Dependencies

### Package Security

- **Files whitelist** — The `files` field in `package.json` restricts published content to `dist/` only. Source code, tests, and configs are never published.
- **No bundled secrets** — API keys, credentials, and environment variables are never included in the build output.
- **Ed25519 public key only** — The license validator embeds the public key for offline verification. The private signing key is never shipped.
- **Bearer token auth** — All HTTP communication uses `Authorization: Bearer` headers, never URL parameters.
- **No retry on 402** — Insufficient credits errors are never retried (prevents runaway credit consumption).
- **Local-only storage** — SQLite databases (`.hybriq/cache.db`, `.hybriq/metering.db`) are strictly local, never uploaded.

### Dependency Audit

| Package | Category | Size Impact | Security Notes |
|---------|----------|-------------|----------------|
| @noble/ed25519 | Cryptography | Minimal (~8KB) | Audited, no native deps, pure JS |
| sql.js | Database | ~1.2MB (WASM) | SQLite compiled to WASM, sandboxed |
| tar | Archive | Minimal | Read/write only, no shell execution |
| vitest | Dev only | N/A (not shipped) | Dev dependency, not in published package |
| msw | Dev only | N/A (not shipped) | Dev dependency, HTTP interception for tests |

### Troubleshooting Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `Cache not initialized` | Using cache before `init()` | Call `await cache.init()` before cache operations |
| Unhandled promise rejection in local mode tests | Fake license key triggers async `initLocalMode` rejection | Consume via `expect(sdk.execute(...)).rejects.toThrow()` |
| MSW handler not matching | URL mismatch (missing base URL) | Use `onUnhandledRequest: "error"` to catch unmatched requests |
| Integration tests failing | Local API not running | Start with `pnpm dev`, seed DB, set `ADMIN_PASSWORD` |
| Coverage below threshold | Uncovered branches | Run `test:coverage` and add tests for uncovered paths |

---

## 10. Deprecation Policy

Features marked for deprecation will be maintained for a minimum of **two minor versions** before removal. Deprecated features will emit console warnings and be documented in the CHANGELOG. Major version bumps will include a migration guide.

---

## 11. Repository Structure

The SDK is developed in two locations:

| Location | Purpose |
|----------|---------|
| `Hivemind v2/packages/sdk/` | Development home — integrated with API server for integration tests |
| `github.com/developerlabsai/hybriq-sdk` | Public standalone repo — CI/CD, npm publish, external contributors |

Changes flow from the monorepo to the standalone repo via the sync script (`scripts/sync-from-monorepo.sh`). See [Sync Process](sync-process.md) for details.

---

## Planned Improvements

- **Performance benchmarks** — Track execution time per module across versions using `vitest.bench`
- **Mutation testing** — Use Stryker to verify test quality beyond coverage metrics
- **Property-based testing** — Use `fast-check` for cache hash collision testing and edge cases
- **Visual test reports** — HTML coverage reports published as CI artifacts
- **Automated release notes** — Generate from conventional commits via `changesets`
- **Browser bundle tests** — If SDK gets a browser build, add Playwright-based tests
- **Load testing** — Verify cache performance at scale (10K+ entries, concurrent reads)
