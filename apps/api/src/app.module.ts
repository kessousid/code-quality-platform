import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RepoModule } from './repos/repo.module.js';
import { ScanModule } from './scans/scan.module.js';
import { FindingModule } from './findings/finding.module.js';
import { ReportModule } from './reports/report.module.js';
import { FsModule } from './fs/fs.module.js';
import { UnitTestModule } from './unit-tests/unit-test.module.js';
import { CoverageModule } from './coverage/coverage.module.js';
import { CronModule } from './crons/cron.module.js';
import { QaAutomationModule } from './qa-automation/qa-automation.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    HealthModule,
    RepoModule,
    ScanModule,
    FindingModule,
    ReportModule,
    FsModule,
    UnitTestModule,
    CoverageModule,
    CronModule,
    QaAutomationModule,
  ],
})
export class AppModule {}
