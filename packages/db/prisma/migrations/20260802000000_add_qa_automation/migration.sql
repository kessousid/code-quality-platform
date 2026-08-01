-- CreateEnum
CREATE TYPE "QaAutomationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "QaAutomationTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateTable
CREATE TABLE "qa_automation_runs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" "QaAutomationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "triggeredBy" "QaAutomationTrigger" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qa_automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_automation_test_results" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "details" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qa_automation_test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qa_automation_schedules" (
    "orgId" TEXT NOT NULL,
    "intervalHours" INTEGER NOT NULL DEFAULT 12,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastDailyCheckAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qa_automation_schedules_pkey" PRIMARY KEY ("orgId")
);

-- CreateIndex
CREATE INDEX "qa_automation_runs_orgId_createdAt_idx" ON "qa_automation_runs"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "qa_automation_test_results_runId_idx" ON "qa_automation_test_results"("runId");

-- AddForeignKey
ALTER TABLE "qa_automation_runs" ADD CONSTRAINT "qa_automation_runs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_automation_test_results" ADD CONSTRAINT "qa_automation_test_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "qa_automation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_automation_schedules" ADD CONSTRAINT "qa_automation_schedules_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
