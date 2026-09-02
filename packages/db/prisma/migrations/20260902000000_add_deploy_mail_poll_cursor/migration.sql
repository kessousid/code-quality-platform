-- AlterEnum
ALTER TYPE "QaAutomationTrigger" ADD VALUE 'MAIL_TRIGGERED';

-- CreateTable
CREATE TABLE "deploy_mail_poll_cursors" (
    "orgId" TEXT NOT NULL,
    "lastPolledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deploy_mail_poll_cursors_pkey" PRIMARY KEY ("orgId")
);

-- AddForeignKey
ALTER TABLE "deploy_mail_poll_cursors" ADD CONSTRAINT "deploy_mail_poll_cursors_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
