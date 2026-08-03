import {
  Severity as DbSeverity,
  Confidence as DbConfidence,
  AnalysisCategory as DbAnalysisCategory,
  FindingStatus as DbFindingStatus,
  ScanMode as DbScanMode,
  ScanStatus as DbScanStatus,
  RepoProvider as DbRepoProvider,
  ReportFormat as DbReportFormat,
  UserRole as DbUserRole,
  UnitTestRunStatus as DbUnitTestRunStatus,
  TestCaseStatus as DbTestCaseStatus,
  UnitTestReportFormat as DbUnitTestReportFormat,
  CoverageRunStatus as DbCoverageRunStatus,
  CoverageFileStatus as DbCoverageFileStatus,
  CoverageReportFormat as DbCoverageReportFormat,
  TestGeneratorType as DbTestGeneratorType,
  CronEnvironment as DbCronEnvironment,
  CronRunStatus as DbCronRunStatus,
  QaAutomationRunStatus as DbQaAutomationRunStatus,
  QaAutomationTrigger as DbQaAutomationTrigger,
  QaAutomationReportFormat as DbQaAutomationReportFormat,
  QaAutomationEnvironment as DbQaAutomationEnvironment,
} from '@prisma/client';
import type {
  Severity as CoreSeverity,
  Confidence as CoreConfidence,
  AnalysisCategory as CoreAnalysisCategory,
  Finding as CoreFinding,
  ScanMode as CoreScanMode,
  ScanStatus as CoreScanStatus,
  RepoProvider as CoreRepoProvider,
  ReportFormat as CoreReportFormat,
  UserRole as CoreUserRole,
  UnitTestRunStatus as CoreUnitTestRunStatus,
  TestCaseStatus as CoreTestCaseStatus,
  UnitTestReportFormat as CoreUnitTestReportFormat,
  CoverageRunStatus as CoreCoverageRunStatus,
  CoverageFileStatus as CoreCoverageFileStatus,
  CoverageReportFormat as CoreCoverageReportFormat,
  TestGeneratorType as CoreTestGeneratorType,
  CronEnvironment as CoreCronEnvironment,
  CronRunStatus as CoreCronRunStatus,
  QaAutomationRunStatus as CoreQaAutomationRunStatus,
  QaAutomationTrigger as CoreQaAutomationTrigger,
  QaAutomationReportFormat as CoreQaAutomationReportFormat,
  QaAutomationEnvironment as CoreQaAutomationEnvironment,
} from '@cqp/core';

/**
 * Boundary between Prisma's enums and packages/core's plain string-literal
 * unions (see docs/adr/0009-database-schema-design.md — the domain layer
 * stays framework-free, so this mapping lives here, not in core).
 */

export function severityToDb(severity: CoreSeverity): DbSeverity {
  return severity.toUpperCase() as DbSeverity;
}

export function severityFromDb(severity: DbSeverity): CoreSeverity {
  return severity.toLowerCase() as CoreSeverity;
}

export function confidenceToDb(confidence: CoreConfidence): DbConfidence {
  return confidence.toUpperCase() as DbConfidence;
}

export function confidenceFromDb(confidence: DbConfidence): CoreConfidence {
  return confidence.toLowerCase() as CoreConfidence;
}

const categoryToDbMap: Record<CoreAnalysisCategory, DbAnalysisCategory> = {
  'code-quality': DbAnalysisCategory.CODE_QUALITY,
  security: DbAnalysisCategory.SECURITY,
  'dependency-vulnerability': DbAnalysisCategory.DEPENDENCY_VULNERABILITY,
  'secret-detection': DbAnalysisCategory.SECRET_DETECTION,
  architecture: DbAnalysisCategory.ARCHITECTURE,
  performance: DbAnalysisCategory.PERFORMANCE,
  database: DbAnalysisCategory.DATABASE,
  'devops-iac': DbAnalysisCategory.DEVOPS_IAC,
  'test-coverage': DbAnalysisCategory.TEST_COVERAGE,
  documentation: DbAnalysisCategory.DOCUMENTATION,
  'best-practices': DbAnalysisCategory.BEST_PRACTICES,
  'technical-debt': DbAnalysisCategory.TECHNICAL_DEBT,
};

const categoryFromDbMap: Record<DbAnalysisCategory, CoreAnalysisCategory> = Object.fromEntries(
  Object.entries(categoryToDbMap).map(([core, db]) => [db, core]),
) as Record<DbAnalysisCategory, CoreAnalysisCategory>;

export function categoryToDb(category: CoreAnalysisCategory): DbAnalysisCategory {
  return categoryToDbMap[category];
}

export function categoryFromDb(category: DbAnalysisCategory): CoreAnalysisCategory {
  return categoryFromDbMap[category];
}

const statusToDbMap: Record<CoreFinding['status'], DbFindingStatus> = {
  open: DbFindingStatus.OPEN,
  fixed: DbFindingStatus.FIXED,
  ignored: DbFindingStatus.IGNORED,
  'false-positive': DbFindingStatus.FALSE_POSITIVE,
};

const statusFromDbMap: Record<DbFindingStatus, CoreFinding['status']> = Object.fromEntries(
  Object.entries(statusToDbMap).map(([core, db]) => [db, core]),
) as Record<DbFindingStatus, CoreFinding['status']>;

export function findingStatusToDb(status: CoreFinding['status']): DbFindingStatus {
  return statusToDbMap[status];
}

export function findingStatusFromDb(status: DbFindingStatus): CoreFinding['status'] {
  return statusFromDbMap[status];
}

export function scanModeToDb(mode: CoreScanMode): DbScanMode {
  return mode.toUpperCase() as DbScanMode;
}

export function scanModeFromDb(mode: DbScanMode): CoreScanMode {
  return mode.toLowerCase() as CoreScanMode;
}

export function scanStatusToDb(status: CoreScanStatus): DbScanStatus {
  return status.toUpperCase() as DbScanStatus;
}

export function scanStatusFromDb(status: DbScanStatus): CoreScanStatus {
  return status.toLowerCase() as CoreScanStatus;
}

export function repoProviderToDb(provider: CoreRepoProvider): DbRepoProvider {
  return provider.toUpperCase() as DbRepoProvider;
}

export function repoProviderFromDb(provider: DbRepoProvider): CoreRepoProvider {
  return provider.toLowerCase() as CoreRepoProvider;
}

export function reportFormatToDb(format: CoreReportFormat): DbReportFormat {
  return format.toUpperCase() as DbReportFormat;
}

export function reportFormatFromDb(format: DbReportFormat): CoreReportFormat {
  return format.toLowerCase() as CoreReportFormat;
}

export function userRoleToDb(role: CoreUserRole): DbUserRole {
  return role.toUpperCase() as DbUserRole;
}

export function userRoleFromDb(role: DbUserRole): CoreUserRole {
  return role.toLowerCase() as CoreUserRole;
}

export function unitTestRunStatusToDb(status: CoreUnitTestRunStatus): DbUnitTestRunStatus {
  return status.toUpperCase() as DbUnitTestRunStatus;
}

export function unitTestRunStatusFromDb(status: DbUnitTestRunStatus): CoreUnitTestRunStatus {
  return status.toLowerCase() as CoreUnitTestRunStatus;
}

export function testCaseStatusToDb(status: CoreTestCaseStatus): DbTestCaseStatus {
  return status.toUpperCase() as DbTestCaseStatus;
}

export function testCaseStatusFromDb(status: DbTestCaseStatus): CoreTestCaseStatus {
  return status.toLowerCase() as CoreTestCaseStatus;
}

export function unitTestReportFormatToDb(format: CoreUnitTestReportFormat): DbUnitTestReportFormat {
  return format.toUpperCase() as DbUnitTestReportFormat;
}

export function unitTestReportFormatFromDb(
  format: DbUnitTestReportFormat,
): CoreUnitTestReportFormat {
  return format.toLowerCase() as CoreUnitTestReportFormat;
}

export function coverageRunStatusToDb(status: CoreCoverageRunStatus): DbCoverageRunStatus {
  return status.toUpperCase() as DbCoverageRunStatus;
}

export function coverageRunStatusFromDb(status: DbCoverageRunStatus): CoreCoverageRunStatus {
  return status.toLowerCase() as CoreCoverageRunStatus;
}

export function coverageFileStatusToDb(status: CoreCoverageFileStatus): DbCoverageFileStatus {
  return status.toUpperCase() as DbCoverageFileStatus;
}

export function coverageFileStatusFromDb(status: DbCoverageFileStatus): CoreCoverageFileStatus {
  return status.toLowerCase() as CoreCoverageFileStatus;
}

export function coverageReportFormatToDb(format: CoreCoverageReportFormat): DbCoverageReportFormat {
  return format.toUpperCase() as DbCoverageReportFormat;
}

export function coverageReportFormatFromDb(
  format: DbCoverageReportFormat,
): CoreCoverageReportFormat {
  return format.toLowerCase() as CoreCoverageReportFormat;
}

export function testGeneratorTypeToDb(generator: CoreTestGeneratorType): DbTestGeneratorType {
  return generator.toUpperCase() as DbTestGeneratorType;
}

export function testGeneratorTypeFromDb(generator: DbTestGeneratorType): CoreTestGeneratorType {
  return generator.toLowerCase() as CoreTestGeneratorType;
}

export function cronEnvironmentToDb(environment: CoreCronEnvironment): DbCronEnvironment {
  return environment.toUpperCase() as DbCronEnvironment;
}

export function cronEnvironmentFromDb(environment: DbCronEnvironment): CoreCronEnvironment {
  return environment.toLowerCase() as CoreCronEnvironment;
}

export function cronRunStatusToDb(status: CoreCronRunStatus): DbCronRunStatus {
  return status.toUpperCase() as DbCronRunStatus;
}

export function cronRunStatusFromDb(status: DbCronRunStatus): CoreCronRunStatus {
  return status.toLowerCase() as CoreCronRunStatus;
}

export function qaAutomationRunStatusToDb(
  status: CoreQaAutomationRunStatus,
): DbQaAutomationRunStatus {
  return status.toUpperCase() as DbQaAutomationRunStatus;
}

export function qaAutomationRunStatusFromDb(
  status: DbQaAutomationRunStatus,
): CoreQaAutomationRunStatus {
  return status.toLowerCase() as CoreQaAutomationRunStatus;
}

export function qaAutomationTriggerToDb(trigger: CoreQaAutomationTrigger): DbQaAutomationTrigger {
  return trigger.toUpperCase() as DbQaAutomationTrigger;
}

export function qaAutomationTriggerFromDb(trigger: DbQaAutomationTrigger): CoreQaAutomationTrigger {
  return trigger.toLowerCase() as CoreQaAutomationTrigger;
}

export function qaAutomationReportFormatToDb(
  format: CoreQaAutomationReportFormat,
): DbQaAutomationReportFormat {
  return format.toUpperCase() as DbQaAutomationReportFormat;
}

export function qaAutomationReportFormatFromDb(
  format: DbQaAutomationReportFormat,
): CoreQaAutomationReportFormat {
  return format.toLowerCase() as CoreQaAutomationReportFormat;
}

export function qaAutomationEnvironmentToDb(
  environment: CoreQaAutomationEnvironment,
): DbQaAutomationEnvironment {
  return environment.toUpperCase() as DbQaAutomationEnvironment;
}

export function qaAutomationEnvironmentFromDb(
  environment: DbQaAutomationEnvironment,
): CoreQaAutomationEnvironment {
  return environment.toLowerCase() as CoreQaAutomationEnvironment;
}
