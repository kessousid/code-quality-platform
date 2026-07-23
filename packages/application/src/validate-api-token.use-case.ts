import type { ApiTokenRepository, ApiTokenValidationResult } from '@cqp/core';
import { hashApiToken } from './api-token-hash.js';

/**
 * Backs ApiTokenGuard (apps/api). Returns null rather than throwing on an
 * invalid/revoked token — the guard, not this use case, decides that's a
 * 401, since "no match" isn't exceptional at this layer.
 */
export class ValidateApiTokenUseCase {
  constructor(private readonly apiTokenRepository: ApiTokenRepository) {}

  async execute(rawToken: string): Promise<ApiTokenValidationResult | null> {
    const tokenHash = hashApiToken(rawToken);
    const result = await this.apiTokenRepository.findActiveByHash(tokenHash);
    if (result) {
      await this.apiTokenRepository.touchLastUsed(result.tokenId);
    }
    return result;
  }
}
