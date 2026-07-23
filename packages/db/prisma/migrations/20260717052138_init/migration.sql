-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "RepoProvider" AS ENUM ('LOCAL', 'GITHUB', 'GITLAB');

-- CreateEnum
CREATE TYPE "ScanMode" AS ENUM ('FULL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "AnalysisCategory" AS ENUM ('CODE_QUALITY', 'SECURITY', 'DEPENDENCY_VULNERABILITY', 'SECRET_DETECTION', 'ARCHITECTURE', 'PERFORMANCE', 'DATABASE', 'DEVOPS_IAC', 'TEST_COVERAGE', 'DOCUMENTATION', 'BEST_PRACTICES', 'TECHNICAL_DEBT');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'FIXED', 'IGNORED', 'FALSE_POSITIVE');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('HTML', 'PDF', 'JSON', 'SARIF');

-- CreateTable
CREATE TABLE "orgs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repos" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "RepoProvider" NOT NULL DEFAULT 'LOCAL',
    "remoteUrl" TEXT,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "mode" "ScanMode" NOT NULL DEFAULT 'FULL',
    "status" "ScanStatus" NOT NULL DEFAULT 'QUEUED',
    "baseScanId" TEXT,
    "dependencyGraphStorageKey" TEXT,
    "triggeredByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "category" "AnalysisCategory" NOT NULL,
    "source" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "cwe" TEXT,
    "owaspCategory" TEXT,
    "rootCause" TEXT NOT NULL,
    "riskDescription" TEXT NOT NULL,
    "recommendedFix" TEXT NOT NULL,
    "exampleCode" TEXT,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "patchPrConfirmedByUser" BOOLEAN NOT NULL DEFAULT false,
    "fingerprint" TEXT NOT NULL,
    "firstSeenScanId" TEXT NOT NULL,
    "lastSeenScanId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_locations" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "startLine" INTEGER NOT NULL,
    "endLine" INTEGER,
    "startColumn" INTEGER,
    "endColumn" INTEGER,

    CONSTRAINT "finding_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_references" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "finding_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_finding_enrichments" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "plainEnglishExplanation" TEXT NOT NULL,
    "businessImpact" TEXT NOT NULL,
    "suggestedPatch" TEXT,
    "patchConfidence" "Confidence",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_finding_enrichments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_correlations" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "relatedFindingId" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "finding_correlations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_history" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "status" "FindingStatus" NOT NULL,
    "severity" "Severity" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finding_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patches" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "diff" TEXT NOT NULL,
    "createdByAi" BOOLEAN NOT NULL DEFAULT true,
    "prUrl" TEXT,
    "prCreatedByUserId" TEXT,
    "prCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orgs_slug_key" ON "orgs"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_orgId_idx" ON "users"("orgId");

-- CreateIndex
CREATE INDEX "repos_orgId_idx" ON "repos"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "repos_orgId_name_key" ON "repos"("orgId", "name");

-- CreateIndex
CREATE INDEX "scans_orgId_repoId_createdAt_idx" ON "scans"("orgId", "repoId", "createdAt");

-- CreateIndex
CREATE INDEX "findings_orgId_status_idx" ON "findings"("orgId", "status");

-- CreateIndex
CREATE INDEX "findings_orgId_severity_idx" ON "findings"("orgId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "findings_repoId_fingerprint_key" ON "findings"("repoId", "fingerprint");

-- CreateIndex
CREATE INDEX "finding_locations_findingId_idx" ON "finding_locations"("findingId");

-- CreateIndex
CREATE INDEX "finding_references_findingId_idx" ON "finding_references"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_finding_enrichments_findingId_key" ON "ai_finding_enrichments"("findingId");

-- CreateIndex
CREATE INDEX "finding_correlations_findingId_idx" ON "finding_correlations"("findingId");

-- CreateIndex
CREATE INDEX "finding_correlations_relatedFindingId_idx" ON "finding_correlations"("relatedFindingId");

-- CreateIndex
CREATE UNIQUE INDEX "finding_correlations_findingId_relatedFindingId_key" ON "finding_correlations"("findingId", "relatedFindingId");

-- CreateIndex
CREATE INDEX "finding_history_scanId_idx" ON "finding_history"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "finding_history_findingId_scanId_key" ON "finding_history"("findingId", "scanId");

-- CreateIndex
CREATE INDEX "patches_orgId_findingId_idx" ON "patches"("orgId", "findingId");

-- CreateIndex
CREATE INDEX "reports_orgId_scanId_idx" ON "reports"("orgId", "scanId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_scanId_format_key" ON "reports"("scanId", "format");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repos" ADD CONSTRAINT "repos_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "repos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_baseScanId_fkey" FOREIGN KEY ("baseScanId") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "repos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_firstSeenScanId_fkey" FOREIGN KEY ("firstSeenScanId") REFERENCES "scans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_lastSeenScanId_fkey" FOREIGN KEY ("lastSeenScanId") REFERENCES "scans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_locations" ADD CONSTRAINT "finding_locations_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_references" ADD CONSTRAINT "finding_references_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_finding_enrichments" ADD CONSTRAINT "ai_finding_enrichments_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_correlations" ADD CONSTRAINT "finding_correlations_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_correlations" ADD CONSTRAINT "finding_correlations_relatedFindingId_fkey" FOREIGN KEY ("relatedFindingId") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_history" ADD CONSTRAINT "finding_history_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_history" ADD CONSTRAINT "finding_history_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patches" ADD CONSTRAINT "patches_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patches" ADD CONSTRAINT "patches_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patches" ADD CONSTRAINT "patches_prCreatedByUserId_fkey" FOREIGN KEY ("prCreatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

