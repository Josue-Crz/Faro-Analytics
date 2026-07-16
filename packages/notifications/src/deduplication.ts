export interface NotificationDeduplicator {
  claim(workspaceId: string, deduplicationKey: string, now: Date, ttlMs: number): Promise<boolean>;
  release(workspaceId: string, deduplicationKey: string): Promise<void>;
}

export class InMemoryNotificationDeduplicator implements NotificationDeduplicator {
  private readonly claims = new Map<string, number>();

  async claim(
    workspaceId: string,
    deduplicationKey: string,
    now: Date,
    ttlMs: number,
  ): Promise<boolean> {
    const key = `${workspaceId}\u0000${deduplicationKey}`;
    const existingExpiry = this.claims.get(key);
    if (existingExpiry !== undefined && existingExpiry > now.getTime()) return false;
    this.claims.set(key, now.getTime() + Math.max(1, ttlMs));
    return true;
  }

  async release(workspaceId: string, deduplicationKey: string): Promise<void> {
    this.claims.delete(`${workspaceId}\u0000${deduplicationKey}`);
  }
}
