-- CreateEnum
CREATE TYPE "QaAutomationEnvironment" AS ENUM ('PRODUCTION', 'STAGING');

-- AlterTable
ALTER TABLE "qa_automation_runs" ADD COLUMN "environment" "QaAutomationEnvironment" NOT NULL DEFAULT 'PRODUCTION';

-- CreateTable
CREATE TABLE "qa_automation_staging_schedules" (
    "orgId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qa_automation_staging_schedules_pkey" PRIMARY KEY ("orgId")
);

-- AddForeignKey
ALTER TABLE "qa_automation_staging_schedules" ADD CONSTRAINT "qa_automation_staging_schedules_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
