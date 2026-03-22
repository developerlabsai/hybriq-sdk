/**
 * T047/T051: SDK license validator and feature gating.
 *
 * Validates Ed25519-signed license keys offline using the bundled public key.
 * No network call required — the public key is embedded in the SDK at build time.
 *
 * Format: `hiq_oss_[base64url(JSON payload + 64-byte Ed25519 signature)]`
 */

import * as ed from "@noble/ed25519";
import { PUBLIC_KEY } from "./public-key.js";

/** License payload structure. */
export interface LicensePayload {
  tier: "community" | "pro";
  email: string;
  createdAt: string;
  entitlements: {
    maxAgents: number;
    maxSkills: number;
  };
}

/** Validated license with payload and key. */
export interface ValidatedLicense {
  valid: true;
  payload: LicensePayload;
  licenseKey: string;
}

/** Error thrown when a license key is invalid or tampered with. */
export class InvalidLicenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLicenseError";
  }
}

/** Ed25519 signature length in bytes. */
const SIGNATURE_LENGTH = 64;

/**
 * Validate a license key offline using the bundled Ed25519 public key.
 *
 * @param licenseKey - The license key in `hiq_oss_[base64url]` format.
 * @returns The validated license with decoded payload.
 * @throws InvalidLicenseError if the key is malformed, tampered, or has an invalid signature.
 */
export async function validateLicense(
  licenseKey: string
): Promise<ValidatedLicense> {
  // Check prefix
  if (!licenseKey.startsWith("hiq_oss_")) {
    throw new InvalidLicenseError(
      "Invalid license key format. Expected prefix 'hiq_oss_'."
    );
  }

  // Decode base64url payload
  const base64Part = licenseKey.slice("hiq_oss_".length);
  let combined: Uint8Array;
  try {
    combined = Uint8Array.from(Buffer.from(base64Part, "base64url"));
  } catch {
    throw new InvalidLicenseError("Invalid license key encoding.");
  }

  if (combined.length <= SIGNATURE_LENGTH) {
    throw new InvalidLicenseError(
      "License key is too short — missing payload or signature."
    );
  }

  // Split payload and signature
  const payloadBytes = combined.slice(0, combined.length - SIGNATURE_LENGTH);
  const signature = combined.slice(combined.length - SIGNATURE_LENGTH);

  // Verify Ed25519 signature
  const publicKeyBytes = Uint8Array.from(Buffer.from(PUBLIC_KEY, "base64"));
  let valid: boolean;
  try {
    valid = await ed.verifyAsync(signature, payloadBytes, publicKeyBytes);
  } catch {
    throw new InvalidLicenseError("Signature verification failed.");
  }

  if (!valid) {
    throw new InvalidLicenseError(
      "License key signature is invalid — key may have been tampered with."
    );
  }

  // Parse payload JSON
  let payload: LicensePayload;
  try {
    const payloadJson = new TextDecoder().decode(payloadBytes);
    payload = JSON.parse(payloadJson) as LicensePayload;
  } catch {
    throw new InvalidLicenseError("License key payload is malformed.");
  }

  // Basic validation
  if (!payload.tier || !payload.email || !payload.entitlements) {
    throw new InvalidLicenseError(
      "License key payload is missing required fields."
    );
  }

  return { valid: true, payload, licenseKey };
}

/**
 * T051: Check if a feature is accessible under the given license.
 *
 * Community tier has limits: max 5 agents, max 10 skills.
 * Pro tier has unlimited access (-1 means unlimited).
 *
 * @param license - The validated license.
 * @param feature - The feature to check: 'agent' or 'skill'.
 * @param currentCount - How many of this feature the user currently has.
 * @returns `true` if the feature can be used, `false` if at the limit.
 */
export function checkFeatureAccess(
  license: ValidatedLicense,
  feature: "agent" | "skill",
  currentCount: number
): boolean {
  const { entitlements } = license.payload;

  if (feature === "agent") {
    // -1 means unlimited
    if (entitlements.maxAgents === -1) return true;
    return currentCount < entitlements.maxAgents;
  }

  if (feature === "skill") {
    if (entitlements.maxSkills === -1) return true;
    return currentCount < entitlements.maxSkills;
  }

  return false;
}
