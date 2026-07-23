-- CreateEnum
CREATE TYPE "UnitTestRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TestCaseStatus" AS ENUM ('PASSED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "unit_test_runs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "targetFunction" TEXT,
    "status" "UnitTestRunStatus" NOT NULL DEFAULT 'QUEUED',
    "filesTotal" INTEGER,
    "filesCompleted" INTEGER,
    "currentFilePath" TEXT,
    "testsTotal" INTEGER,
    "testsPassed" INTEGER,
    "testsFailed" INTEGER,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_test_files" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceFilePath" TEXT NOT NULL,
    "testFilePath" TEXT NOT NULL,
    "functionName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_test_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_case_results" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "testFilePath" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "status" "TestCaseStatus" NOT NULL,
    "durationMs" INTEGER,
    "failureMessage" TEXT,

    CONSTRAINT "test_case_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unit_test_runs_orgId_repoId_createdAt_idx" ON "unit_test_runs"("orgId", "repoId", "createdAt");

-- CreateIndex
CREATE INDEX "generated_test_files_runId_idx" ON "generated_test_files"("runId");

-- CreateIndex
CREATE INDEX "test_case_results_runId_idx" ON "test_case_results"("runId");

-- AddForeignKey
ALTER TABLE "unit_test_runs" ADD CONSTRAINT "unit_test_runs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_test_runs" ADD CONSTRAINT "unit_test_runs_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "repos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_test_files" ADD CONSTRAINT "generated_test_files_runId_fkey" FOREIGN KEY ("runId") REFERENCES "unit_test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_results" ADD CONSTRAINT "test_case_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "unit_test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
