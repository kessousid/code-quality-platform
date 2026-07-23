import { randomUUID } from 'node:crypto';
import type {
  Finding,
  FindingFilter,
  FindingRepository,
  PaginatedResult,
  PaginationParams,
  UpsertFindingInput,
} from '@cqp/core';

export class InMemoryFindingRepository implements FindingRepository {
  /** `Finding` itself has no `fingerprint` field (it's DB-only, see PrismaFindingRepository) — tracked here instead, keyed the same way as the schema's `@@unique([repoId, fingerprint])`. */
  private readonly fingerprintIndex = new Map<string, string>();

  constructor(private readonly findings: Finding[] = []) {}

  seed(finding: Finding): void {
    this.findings.push(finding);
  }

  async findById(orgId: string, id: string): Promise<Finding | null> {
    return this.findings.find((f) => f.id === id && f.orgId === orgId) ?? null;
  }

  async list(
    orgId: string,
    filter: FindingFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Finding>> {
    const filtered = this.findings.filter((f) => {
      if (f.orgId !== orgId) return false;
      if (filter.repoId !== undefined && f.repoId !== filter.repoId) return false;
      if (filter.severity !== undefined && f.severity !== filter.severity) return false;
      if (filter.status !== undefined && f.status !== filter.status) return false;
      if (filter.category !== undefined && f.category !== filter.category) return false;
      return true;
    });

    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      data: filtered.slice(start, start + pagination.pageSize),
      total: filtered.length,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async listByScan(orgId: string, scanId: string): Promise<Finding[]> {
    return this.findings.filter((f) => f.orgId === orgId && f.lastSeenScanId === scanId);
  }

  async upsertFromScan(input: UpsertFindingInput): Promise<Finding> {
    const key = `${input.repoId}:${input.fingerprint}`;
    const existingId = this.fingerprintIndex.get(key);
    const existing = existingId ? this.findings.find((f) => f.id === existingId) : undefined;

    if (existing) {
      existing.category = input.category;
      existing.source = input.source;
      existing.ruleId = input.ruleId;
      existing.title = input.title;
      existing.severity = input.severity;
      existing.confidence = input.confidence;
      existing.locations = input.locations;
      existing.rootCause = input.rootCause;
      existing.riskDescription = input.riskDescription;
      existing.recommendedFix = input.recommendedFix;
      existing.references = input.references;
      existing.lastSeenScanId = input.scanId;
      existing.status = 'open'; // reopen if it had been fixed — see docs/adr/0021
      if (input.cwe !== undefined) existing.cwe = input.cwe;
      if (input.owaspCategory !== undefined) existing.owaspCategory = input.owaspCategory;
      if (input.exampleCode !== undefined) existing.exampleCode = input.exampleCode;
      return existing;
    }

    const finding: Finding = {
      id: randomUUID(),
      scanId: input.scanId,
      orgId: input.orgId,
      repoId: input.repoId,
      category: input.category,
      source: input.source,
      ruleId: input.ruleId,
      title: input.title,
      severity: input.severity,
      confidence: input.confidence,
      locations: input.locations,
      rootCause: input.rootCause,
      riskDescription: input.riskDescription,
      recommendedFix: input.recommendedFix,
      references: input.references,
      patchPrConfirmedByUser: false,
      firstSeenScanId: input.scanId,
      lastSeenScanId: input.scanId,
      status: 'open',
      ...(input.cwe !== undefined ? { cwe: input.cwe } : {}),
      ...(input.owaspCategory !== undefined ? { owaspCategory: input.owaspCategory } : {}),
      ...(input.exampleCode !== undefined ? { exampleCode: input.exampleCode } : {}),
    };
    this.findings.push(finding);
    this.fingerprintIndex.set(key, finding.id);
    return finding;
  }
}
