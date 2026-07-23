-- CreateEnum
CREATE TYPE "UnitTestReportFormat" AS ENUM ('JSON', 'HTML', 'PDF');

-- CreateTable
CREATE TABLE "unit_test_reports" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "unitTestRunId" TEXT NOT NULL,
    "format" "UnitTestReportFormat" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_test_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_test_reports_unitTestRunId_format_key" ON "unit_test_reports"("unitTestRunId", "format");

-- CreateIndex
CREATE INDEX "unit_test_reports_orgId_unitTestRunId_idx" ON "unit_test_reports"("orgId", "unitTestRunId");

-- AddForeignKey
ALTER TABLE "unit_test_reports" ADD CONSTRAINT "unit_test_reports_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_test_reports" ADD CONSTRAINT "unit_test_reports_unitTestRunId_fkey" FOREIGN KEY ("unitTestRunId") REFERENCES "unit_test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
