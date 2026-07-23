-- CreateEnum
CREATE TYPE "TestGeneratorType" AS ENUM ('GEMINI', 'SCRIPT');

-- AlterTable
ALTER TABLE "unit_test_runs" ADD COLUMN "generator" "TestGeneratorType" NOT NULL DEFAULT 'GEMINI';
