-- Production QA automation moves from a user-configurable interval to a
-- fixed twice-daily (00:00 and 12:00 IST) cron, matching the staging
-- schedule's shape (docs/adr/0042).
ALTER TABLE "qa_automation_schedules" DROP COLUMN "intervalHours";
ALTER TABLE "qa_automation_schedules" DROP COLUMN "lastDailyCheckAt";
