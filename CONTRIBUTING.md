# Contributing to @hybriq/sdk

Thank you for your interest in contributing to the HybrIQ SDK. This document provides guidelines and instructions for contributing.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/developerlabsai/hybriq-sdk.git
cd hybriq-sdk

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Development Workflow

1. **Fork** the repository and create a feature branch from `main`.
2. **Install** dependencies with `npm install`.
3. **Make** your changes in the `src/` directory.
4. **Add tests** for any new functionality in `tests/`.
5. **Run the full test suite** to ensure nothing is broken:
   ```bash
   npm run test:all
   ```
6. **Build** to verify TypeScript compilation:
   ```bash
   npm run build
   ```
7. **Submit** a pull request against `main`.

## Code Standards

- **TypeScript**: All source code must be TypeScript with strict type checking.
- **Types**: Export all public interfaces from `src/types.ts`.
- **Error handling**: Use the SDK error hierarchy (`HybrIQError`, `AuthError`, etc.) — never throw raw `Error`.
- **No side effects on import**: The SDK must not execute code at module load time.
- **Peer dependencies**: LLM provider SDKs (`@anthropic-ai/sdk`, `openai`) are optional peer dependencies — use dynamic imports.

## Testing

We maintain four test tiers:

| Tier | Command | Purpose |
|------|---------|---------|
| Unit | `npm test` | Core logic, mocked HTTP |
| Integration | `npm run test:integration` | Full cloud execution flow |
| Smoke | `npm run test:smoke` | Example code validation |
| Contract | (included in unit) | API endpoint shape verification |

All PRs must pass unit tests. Integration tests run in CI with credentials.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(cache): add TTL expiration for semantic cache entries
fix(client): handle 503 responses with retry
docs: update cloud quickstart example
test(billing): add coverage for plan upgrade flow
```

## Pull Request Process

1. Ensure all tests pass and coverage does not decrease.
2. Update the README if you changed public API surface.
3. Add a CHANGELOG entry under `## [Unreleased]`.
4. One approval required from a maintainer before merge.

## Reporting Bugs

Open an issue using the **Bug Report** template. Include:
- SDK version (`npm list @hybriq/sdk`)
- Node.js version (`node -v`)
- Minimal reproduction code
- Expected vs actual behavior

## Requesting Features

Open an issue using the **Feature Request** template. Describe the use case and proposed API surface.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
