/**
 * Global test setup — runs before all test suites.
 *
 * Sets up environment variables and mock server when needed.
 */

// Ensure NODE_ENV is set for test detection
process.env.NODE_ENV = "test";

// Suppress console noise during tests unless DEBUG is set
if (!process.env.DEBUG) {
  const noop = () => {};
  globalThis.console.debug = noop;
}
