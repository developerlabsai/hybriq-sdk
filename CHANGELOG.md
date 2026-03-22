# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-22

### Added
- **Cloud mode**: API-driven execution with server-side caching and credit billing.
- **Local mode**: Self-hosted execution with SQLite-backed two-tier semantic cache.
- **Agent orchestration**: Sync, streaming (SSE), and async webhook execution.
- **Federated library**: Browse and subscribe to agents, skills, specialties, and team clusters.
- **Enrichment**: Cross-tenant entity enrichment with caching.
- **Billing**: Real-time credit balance, usage reports, and plan queries.
- **CLI**: `npx hybriq stats` for local cache and execution analytics.
- **License validation**: Offline Ed25519 signature verification for OSS tier gating.
- **Pack export**: `.tar.gz` migration from local to cloud.
- **Two embedding strategies**: Local TF-IDF (offline) and OpenAI text-embedding-3-small.
- **Provider support**: Anthropic Claude and OpenAI GPT models.
- **Error hierarchy**: `HybrIQError`, `AuthError`, `InsufficientCreditsError`, `RateLimitError`, `ProviderError`.
- **HTTP client**: Automatic retry with exponential backoff for 5xx and 429 responses.

[Unreleased]: https://github.com/developerlabsai/hybriq-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/developerlabsai/hybriq-sdk/releases/tag/v0.1.0
