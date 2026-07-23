-- AlterEnum
ALTER TYPE "ScanStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "scans" ADD COLUMN "categories" "AnalysisCategory"[] NOT NULL DEFAULT ARRAY[]::"AnalysisCategory"[];
ALTER TABLE "scans" ADD COLUMN "pluginsTotal" INTEGER;
ALTER TABLE "scans" ADD COLUMN "pluginsCompleted" INTEGER;
ALTER TABLE "scans" ADD COLUMN "currentPluginId" TEXT;
