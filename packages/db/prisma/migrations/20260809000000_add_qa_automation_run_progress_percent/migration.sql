-- Live progress (0-100), parsed from pytest's own -v output, so a
-- long-running staging suite is never indistinguishable from a hung
-- process (docs/adr/0044).
ALTER TABLE "qa_automation_runs" ADD COLUMN "progressPercent" INTEGER;
