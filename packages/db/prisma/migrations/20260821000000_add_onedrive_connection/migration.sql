-- One personal OneDrive connection per org -- a delegated OAuth refresh
-- token (encrypted, same cipher as repos.encryptedAccessToken), used to
-- upload QA automation reports and share them with the report's email
-- recipients.
CREATE TABLE "onedrive_connections" (
    "orgId" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "accountEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onedrive_connections_pkey" PRIMARY KEY ("orgId")
);

-- AddForeignKey
ALTER TABLE "onedrive_connections" ADD CONSTRAINT "onedrive_connections_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
