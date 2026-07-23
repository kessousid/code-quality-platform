/**
 * The processing logic is a pure function, deliberately separate from the
 * BullMQ `Worker` binding in queue.ts. This is what actually gets unit
 * tested without needing a live Redis connection — the real scan-job
 * processors (Phase 7) follow the same split.
 */

export interface HealthcheckJobData {
  ping: string;
}

export interface HealthcheckJobResult {
  pong: string;
  processedAt: string;
}

export function processHealthcheckJob(data: HealthcheckJobData): HealthcheckJobResult {
  return {
    pong: data.ping,
    processedAt: new Date().toISOString(),
  };
}
