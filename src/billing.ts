/**
 * Billing queries — Balance and plan information.
 */

import type { HybrIQApiClient } from "./client.js";
import type { BalanceInfo, PlanInfo, UsageReport } from "./types.js";

/**
 * Gets the current credit balance for the authenticated tenant.
 */
export async function getBalance(
  apiClient: HybrIQApiClient
): Promise<BalanceInfo> {
  return apiClient.get<BalanceInfo>("/api/v1/billing/balance");
}

/**
 * Lists available plans.
 */
export async function getPlans(
  apiClient: HybrIQApiClient
): Promise<PlanInfo[]> {
  return apiClient.get<PlanInfo[]>("/api/v1/billing/plans");
}

/**
 * Returns usage report for the specified billing period.
 */
export async function getUsage(
  apiClient: HybrIQApiClient,
  period?: "current" | "previous"
): Promise<UsageReport> {
  const params: Record<string, string> = {};
  if (period) params.period = period;
  return apiClient.get<UsageReport>("/api/v1/billing/usage", params);
}
