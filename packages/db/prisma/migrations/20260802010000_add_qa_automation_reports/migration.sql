-- CreateEnum
CREATE TYPE "QaAutomationReportFormat" AS ENUM ('PDF');

-- CreateTable
CREATE TABLE "qa_automation_reports" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "format" "QaAutomationReportFormat" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qa_automation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qa_automation_reports_runId_format_key" ON "qa_automation_reports"("runId", "format");

-- CreateIndex
CREATE INDEX "qa_automation_reports_orgId_runId_idx" ON "qa_automation_reports"("orgId", "runId");

-- AddForeignKey
ALTER TABLE "qa_automation_reports" ADD CONSTRAINT "qa_automation_reports_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_automation_reports" ADD CONSTRAINT "qa_automation_reports_runId_fkey" FOREIGN KEY ("runId") REFERENCES "qa_automation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
