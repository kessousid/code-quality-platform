import type { ObjectStorage } from '@cqp/core';

export class ObjectNotFoundError extends Error {
  constructor(key: string) {
    super(`Object not found: ${key}`);
    this.name = 'ObjectNotFoundError';
  }
}

/** In-memory test double for `ObjectStorage` — the real filesystem adapter is tested in packages/storage. */
export class InMemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, Buffer>();

  async put(key: string, content: Buffer | string): Promise<void> {
    this.objects.set(key, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8'));
  }

  async get(key: string): Promise<Buffer> {
    const content = this.objects.get(key);
    if (!content) {
      throw new ObjectNotFoundError(key);
    }
    return content;
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
}
