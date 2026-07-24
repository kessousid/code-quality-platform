import type { PrismaClient, Prisma } from '@prisma/client';
import type {
  Finding,
  FindingFilter,
  FindingRepository,
  PaginatedResult,
  PaginationParams,
  UpsertFindingInput,
} from '@cqp/core';
import {
  categoryFromDb,
  categoryToDb,
  confidenceFromDb,
  confidenceToDb,
  findingStatusFromDb,
  findingStatusToDb,
  severityFromDb,
  severityToDb,
} from './mappers.js';

const findingInclude = {
  locations: true,
  references: true,
  aiEnrichment: true,
} satisfies Prisma.FindingInclude;

type FindingRow = Prisma.FindingGetPayload<{ include: typeof findingInclude }>;

export class PrismaFindingRepository implements FindingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(orgId: string, id: string): Promise<Finding | null> {
    const row = await this.prisma.finding.findFirst({
      where: { id, orgId },
      include: findingInclude,
    });
    return row ? this.toDomain(row) : null;
  }

  async list(
    orgId: string,
    filter: FindingFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Finding>> {
    const where: Prisma.FindingWhereInput = {
      orgId,
      ...(filter.repoId !== undefined ? { repoId: filter.repoId } : {}),
      ...(filter.severity !== undefined ? { severity: severityToDb(filter.severity) } : {}),
      ...(filter.status !== undefined ? { status: findingStatusToDb(filter.status) } : {}),
      ...(filter.category !== undefined ? { category: categoryToDb(filter.category) } : {}),
    };

    const skip = (pagination.page - 1) * pagination.pageSize;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.finding.findMany({
        where,
        include: findingInclude,
        skip,
        take: pagination.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.finding.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toDomain(row)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async listByScan(orgId: string, scanId: string): Promise<Finding[]> {
    const rows = await this.prisma.finding.findMany({
      where: { orgId, lastSeenScanId: scanId },
      include: findingInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDomain(row));
  }

  /**
   * See docs/adr/0021 for the full match/update/insert/history semantics.
   * A generous `timeout` (Prisma's interactive-transaction default is 5000ms)
   * — a per-developer worker (docs/adr/0031) reaches Postgres over Railway's
   * public proxy, not the low-latency private network a Railway-hosted
   * worker uses, so this transaction's few sequential round trips can
   * legitimately take longer than 5s without anything being wrong.
   */
  async upsertFromScan(input: UpsertFindingInput): Promise<Finding> {
    const row = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.finding.findUnique({
          where: { repoId_fingerprint: { repoId: input.repoId, fingerprint: input.fingerprint } },
        });

        const sharedData = {
          category: categoryToDb(input.category),
          source: input.source,
          ruleId: input.ruleId,
          title: input.title,
          severity: severityToDb(input.severity),
          confidence: confidenceToDb(input.confidence),
          cwe: input.cwe ?? null,
          owaspCategory: input.owaspCategory ?? null,
          rootCause: input.rootCause,
          riskDescription: input.riskDescription,
          recommendedFix: input.recommendedFix,
          exampleCode: input.exampleCode ?? null,
        };
        const locations = input.locations.map((loc) => ({
          filePath: loc.filePath,
          startLine: loc.startLine,
          endLine: loc.endLine ?? null,
          startColumn: loc.startColumn ?? null,
          endColumn: loc.endColumn ?? null,
        }));
        const references = input.references.map((ref) => ({ title: ref.title, url: ref.url }));

        const finding = existing
          ? await tx.finding.update({
              where: { id: existing.id },
              data: {
                ...sharedData,
                lastSeenScanId: input.scanId,
                // A finding that disappeared and reappeared is live again,
                // not history — see docs/adr/0021.
                status: 'OPEN',
                locations: { deleteMany: {}, create: locations },
                references: { deleteMany: {}, create: references },
              },
              include: findingInclude,
            })
          : await tx.finding.create({
              data: {
                ...sharedData,
                orgId: input.orgId,
                repoId: input.repoId,
                fingerprint: input.fingerprint,
                firstSeenScanId: input.scanId,
                lastSeenScanId: input.scanId,
                status: 'OPEN',
                locations: { create: locations },
                references: { create: references },
              },
              include: findingInclude,
            });

        await tx.findingHistory.upsert({
          where: { findingId_scanId: { findingId: finding.id, scanId: input.scanId } },
          create: {
            findingId: finding.id,
            scanId: input.scanId,
            status: finding.status,
            severity: finding.severity,
          },
          update: { status: finding.status, severity: finding.severity, occurredAt: new Date() },
        });

        return finding;
      },
      { timeout: 15_000 },
    );

    return this.toDomain(row);
  }

  private toDomain(row: FindingRow): Finding {
    return {
      id: row.id,
      scanId: row.lastSeenScanId,
      orgId: row.orgId,
      repoId: row.repoId,
      category: categoryFromDb(row.category),
      source: row.source,
      ruleId: row.ruleId,
      title: row.title,
      severity: severityFromDb(row.severity),
      confidence: confidenceFromDb(row.confidence),
      locations: row.locations.map((loc) => ({
        filePath: loc.filePath,
        startLine: loc.startLine,
        ...(loc.endLine !== null ? { endLine: loc.endLine } : {}),
        ...(loc.startColumn !== null ? { startColumn: loc.startColumn } : {}),
        ...(loc.endColumn !== null ? { endColumn: loc.endColumn } : {}),
      })),
      rootCause: row.rootCause,
      riskDescription: row.riskDescription,
      recommendedFix: row.recommendedFix,
      references: row.references.map((ref) => ({ title: ref.title, url: ref.url })),
      patchPrConfirmedByUser: row.patchPrConfirmedByUser,
      firstSeenScanId: row.firstSeenScanId,
      lastSeenScanId: row.lastSeenScanId,
      status: findingStatusFromDb(row.status),
      ...(row.exampleCode !== null ? { exampleCode: row.exampleCode } : {}),
      ...(row.cwe !== null ? { cwe: row.cwe } : {}),
      ...(row.owaspCategory !== null ? { owaspCategory: row.owaspCategory } : {}),
      ...(row.aiEnrichment
        ? {
            ai: {
              plainEnglishExplanation: row.aiEnrichment.plainEnglishExplanation,
              businessImpact: row.aiEnrichment.businessImpact,
              relatedFindingIds: [],
              ...(row.aiEnrichment.suggestedPatch !== null
                ? { suggestedPatch: row.aiEnrichment.suggestedPatch }
                : {}),
              ...(row.aiEnrichment.patchConfidence !== null
                ? { patchConfidence: confidenceFromDb(row.aiEnrichment.patchConfidence) }
                : {}),
            },
          }
        : {}),
    };
  }
}
