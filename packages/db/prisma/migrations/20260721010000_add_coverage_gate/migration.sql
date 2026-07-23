-- CreateEnum
CREATE TYPE "CoverageRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CoverageFileStatus" AS ENUM ('COVERED', 'UNCOVERED');

-- CreateEnum
CREATE TYPE "CoverageReportFormat" AS ENUM ('JSON', 'HTML', 'PDF');

-- CreateTable
CREATE TABLE "coverage_runs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "baseRef" TEXT NOT NULL,
    "status" "CoverageRunStatus" NOT NULL DEFAULT 'QUEUED',
    "gatePassed" BOOLEAN,
    "filesTotal" INTEGER,
    "filesCompleted" INTEGER,
    "currentFilePath" TEXT,
    "testsTotal" INTEGER,
    "testsPassed" INTEGER,
    "testsFailed" INTEGER,
    "changedLinesTotal" INTEGER,
    "uncoveredLinesTotal" INTEGER,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coverage_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coverage_file_results" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "changedLines" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "uncoveredLines" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "status" "CoverageFileStatus" NOT NULL,

    CONSTRAINT "coverage_file_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coverage_reports" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "coverageRunId" TEXT NOT NULL,
    "format" "CoverageReportFormat" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coverage_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coverage_runs_orgId_repoId_createdAt_idx" ON "coverage_runs"("orgId", "repoId", "createdAt");

-- CreateIndex
CREATE INDEX "coverage_file_results_runId_idx" ON "coverage_file_results"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "coverage_reports_coverageRunId_format_key" ON "coverage_reports"("coverageRunId", "format");

-- CreateIndex
CREATE INDEX "coverage_reports_orgId_coverageRunId_idx" ON "coverage_reports"("orgId", "coverageRunId");

-- AddForeignKey
ALTER TABLE "coverage_runs" ADD CONSTRAINT "coverage_runs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_runs" ADD CONSTRAINT "coverage_runs_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "repos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_file_results" ADD CONSTRAINT "coverage_file_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "coverage_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_reports" ADD CONSTRAINT "coverage_reports_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_reports" ADD CONSTRAINT "coverage_reports_coverageRunId_fkey" FOREIGN KEY ("coverageRunId") REFERENCES "coverage_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
