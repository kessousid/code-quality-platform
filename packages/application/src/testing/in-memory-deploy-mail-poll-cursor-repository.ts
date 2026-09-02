import type { DeployMailPollCursor, DeployMailPollCursorRepository } from '@cqp/core';

export class InMemoryDeployMailPollCursorRepository implements DeployMailPollCursorRepository {
  private readonly cursors = new Map<string, DeployMailPollCursor>();

  async get(orgId: string): Promise<DeployMailPollCursor> {
    let cursor = this.cursors.get(orgId);
    if (!cursor) {
      cursor = { lastPolledAt: null };
      this.cursors.set(orgId, cursor);
    }
    return cursor;
  }

  async updateLastPolledAt(orgId: string, lastPolledAt: Date): Promise<DeployMailPollCursor> {
    const updated: DeployMailPollCursor = { lastPolledAt };
    this.cursors.set(orgId, updated);
    return updated;
  }
}
