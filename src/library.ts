/**
 * SDK Library module — Browse and subscribe to library items.
 */
import type { HybrIQApiClient } from "./client.js";
import type { LibraryItem, SubscriptionInfo } from "./types.js";

export class LibraryModule {
  constructor(private apiClient: HybrIQApiClient) {}

  async browseAgents(params?: { category?: string; search?: string }): Promise<LibraryItem[]> {
    const query: Record<string, string> = {};
    if (params?.category) query.category = params.category;
    if (params?.search) query.search = params.search;
    return this.apiClient.get<LibraryItem[]>("/api/v1/library/agents", query);
  }

  async browseSkills(params?: { category?: string }): Promise<LibraryItem[]> {
    const query: Record<string, string> = {};
    if (params?.category) query.category = params.category;
    return this.apiClient.get<LibraryItem[]>("/api/v1/library/skills", query);
  }

  async browseSpecialties(params?: { domain?: string }): Promise<LibraryItem[]> {
    const query: Record<string, string> = {};
    if (params?.domain) query.domain = params.domain;
    return this.apiClient.get<LibraryItem[]>("/api/v1/library/specialties", query);
  }

  async browseClusters(): Promise<LibraryItem[]> {
    return this.apiClient.get<LibraryItem[]>("/api/v1/library/clusters");
  }

  async subscribe(itemType: string, itemId: string, overrides?: Record<string, unknown>): Promise<SubscriptionInfo> {
    return this.apiClient.post<SubscriptionInfo>("/api/v1/library/subscribe", {
      itemType,
      itemId,
      configOverrides: overrides,
    });
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    await this.apiClient.delete(`/api/v1/library/subscribe/${subscriptionId}`);
  }

  async listSubscriptions(): Promise<SubscriptionInfo[]> {
    return this.apiClient.get<SubscriptionInfo[]>("/api/v1/library/subscriptions");
  }
}
