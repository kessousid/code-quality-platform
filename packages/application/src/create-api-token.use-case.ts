import { randomBytes } from 'node:crypto';
import type { ApiTokenRepository } from '@cqp/core';
import { hashApiToken } from './api-token-hash.js';

export interface CreatedApiToken {
  id: string;
  /** Shown exactly once — the repository only ever stores the hash. */
  rawToken: string;
}

/** Used by the operator bootstrap script only — there is no public endpoint for this (ADR-0014). */
export class CreateApiTokenUseCase {
  constructor(private readonly apiTokenRepository: ApiTokenRepository) {}

  async execute(orgId: string, name: string): Promise<CreatedApiToken> {
    const rawToken = `cqp_${randomBytes(32).toString('hex')}`;
    const { id } = await this.apiTokenRepository.create({
      orgId,
      name,
      tokenHash: hashApiToken(rawToken),
    });
    return { id, rawToken };
  }
}
