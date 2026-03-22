/**
 * T048: Bundled Ed25519 public key for license validation.
 *
 * This key is used by the SDK to verify license signatures offline.
 * The corresponding private key is held by Dev Labs and is NEVER
 * distributed with the SDK.
 *
 * During build, this value should be replaced with the actual public key
 * from the LICENSE_SIGNING_PUBLIC_KEY environment variable. If not set,
 * a placeholder is used that will cause all license validations to fail.
 */

export const PUBLIC_KEY: string =
  process.env.LICENSE_SIGNING_PUBLIC_KEY ??
  "REPLACE_WITH_ACTUAL_PUBLIC_KEY_DURING_BUILD";
