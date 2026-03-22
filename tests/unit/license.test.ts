/**
 * Unit tests for license validation and feature gating.
 */

import { describe, it, expect } from "vitest";
import {
  validateLicense,
  checkFeatureAccess,
  InvalidLicenseError,
} from "../../src/license/validator.js";
import type { ValidatedLicense } from "../../src/license/validator.js";

describe("License validation", () => {
  describe("validateLicense", () => {
    it("should reject keys without hiq_oss_ prefix", async () => {
      await expect(validateLicense("bad_prefix_xyz")).rejects.toThrow(
        InvalidLicenseError
      );
      await expect(validateLicense("bad_prefix_xyz")).rejects.toThrow(
        "Expected prefix"
      );
    });

    it("should reject keys with invalid base64url encoding", async () => {
      await expect(validateLicense("hiq_oss_!!!invalid!!!")).rejects.toThrow(
        InvalidLicenseError
      );
    });

    it("should reject keys that are too short", async () => {
      // Base64url of less than 64 bytes
      const shortPayload = Buffer.from("short").toString("base64url");
      await expect(
        validateLicense(`hiq_oss_${shortPayload}`)
      ).rejects.toThrow(InvalidLicenseError);
    });

    it("should reject keys with invalid signatures", async () => {
      // Create a fake payload + fake 64-byte signature
      const payload = JSON.stringify({
        tier: "community",
        email: "test@example.com",
        createdAt: "2026-01-01",
        entitlements: { maxAgents: 5, maxSkills: 10 },
      });
      const payloadBytes = Buffer.from(payload);
      const fakeSignature = Buffer.alloc(64, 0xff);
      const combined = Buffer.concat([payloadBytes, fakeSignature]);
      const encoded = combined.toString("base64url");

      await expect(validateLicense(`hiq_oss_${encoded}`)).rejects.toThrow(
        InvalidLicenseError
      );
    });
  });

  describe("checkFeatureAccess", () => {
    /** Create a mock validated license for testing. */
    function mockLicense(
      tier: "community" | "pro",
      maxAgents: number,
      maxSkills: number
    ): ValidatedLicense {
      return {
        valid: true,
        payload: {
          tier,
          email: "test@example.com",
          createdAt: "2026-01-01",
          entitlements: { maxAgents, maxSkills },
        },
        licenseKey: "hiq_oss_mock",
      };
    }

    it("should allow agents under the limit", () => {
      const license = mockLicense("community", 5, 10);
      expect(checkFeatureAccess(license, "agent", 3)).toBe(true);
    });

    it("should deny agents at the limit", () => {
      const license = mockLicense("community", 5, 10);
      expect(checkFeatureAccess(license, "agent", 5)).toBe(false);
    });

    it("should deny agents over the limit", () => {
      const license = mockLicense("community", 5, 10);
      expect(checkFeatureAccess(license, "agent", 6)).toBe(false);
    });

    it("should allow unlimited agents when maxAgents is -1", () => {
      const license = mockLicense("pro", -1, -1);
      expect(checkFeatureAccess(license, "agent", 999)).toBe(true);
    });

    it("should allow skills under the limit", () => {
      const license = mockLicense("community", 5, 10);
      expect(checkFeatureAccess(license, "skill", 7)).toBe(true);
    });

    it("should deny skills at the limit", () => {
      const license = mockLicense("community", 5, 10);
      expect(checkFeatureAccess(license, "skill", 10)).toBe(false);
    });

    it("should allow unlimited skills when maxSkills is -1", () => {
      const license = mockLicense("pro", -1, -1);
      expect(checkFeatureAccess(license, "skill", 999)).toBe(true);
    });
  });
});
