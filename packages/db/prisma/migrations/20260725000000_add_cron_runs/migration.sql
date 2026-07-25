-- CreateEnum
CREATE TYPE "CronEnvironment" AS ENUM ('DEV', 'STAGING');

-- CreateEnum
CREATE TYPE "CronRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "cron_runs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "cronId" TEXT NOT NULL,
    "cronName" TEXT NOT NULL,
    "environment" "CronEnvironment" NOT NULL,
    "status" "CronRunStatus" NOT NULL DEFAULT 'RUNNING',
    "statusCode" INTEGER,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "triggeredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cron_runs_orgId_createdAt_idx" ON "cron_runs"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "cron_runs" ADD CONSTRAINT "cron_runs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
