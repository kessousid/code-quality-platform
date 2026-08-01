import { describe, expect, it } from 'vitest';
import type {
  AnalysisCategory,
  Confidence,
  CronEnvironment,
  CronRunStatus,
  Finding,
  QaAutomationRunStatus,
  QaAutomationTrigger,
  ReportFormat,
  RepoProvider,
  ScanMode,
  ScanStatus,
  Severity,
  UnitTestReportFormat,
} from '@cqp/core';
import {
  categoryFromDb,
  categoryToDb,
  confidenceFromDb,
  confidenceToDb,
  cronEnvironmentFromDb,
  cronEnvironmentToDb,
  cronRunStatusFromDb,
  cronRunStatusToDb,
  findingStatusFromDb,
  findingStatusToDb,
  qaAutomationRunStatusFromDb,
  qaAutomationRunStatusToDb,
  qaAutomationTriggerFromDb,
  qaAutomationTriggerToDb,
  repoProviderFromDb,
  repoProviderToDb,
  reportFormatFromDb,
  reportFormatToDb,
  scanModeFromDb,
  scanModeToDb,
  scanStatusFromDb,
  scanStatusToDb,
  severityFromDb,
  severityToDb,
  unitTestReportFormatFromDb,
  unitTestReportFormatToDb,
} from './mappers.js';

const allSeverities: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const allConfidences: Confidence[] = ['high', 'medium', 'low'];
const allCategories: AnalysisCategory[] = [
  'code-quality',
  'security',
  'dependency-vulnerability',
  'secret-detection',
  'architecture',
  'performance',
  'database',
  'devops-iac',
  'test-coverage',
  'documentation',
  'best-practices',
  'technical-debt',
];
const allStatuses: Finding['status'][] = ['open', 'fixed', 'ignored', 'false-positive'];
const allScanModes: ScanMode[] = ['full', 'incremental'];
const allScanStatuses: ScanStatus[] = ['queued', 'running', 'completed', 'failed'];
const allUnitTestReportFormats: UnitTestReportFormat[] = ['json', 'html', 'pdf', 'xlsx'];
const allRepoProviders: RepoProvider[] = ['local', 'github', 'gitlab'];
const allReportFormats: ReportFormat[] = ['html', 'pdf', 'json', 'sarif'];
const allCronEnvironments: CronEnvironment[] = ['dev', 'staging'];
const allCronRunStatuses: CronRunStatus[] = ['running', 'succeeded', 'failed'];
const allQaAutomationRunStatuses: QaAutomationRunStatus[] = ['running', 'completed', 'failed'];
const allQaAutomationTriggers: QaAutomationTrigger[] = ['scheduled', 'manual'];

describe('enum mappers', () => {
  it('round-trips every Severity value', () => {
    for (const severity of allSeverities) {
      expect(severityFromDb(severityToDb(severity))).toBe(severity);
    }
  });

  it('round-trips every Confidence value', () => {
    for (const confidence of allConfidences) {
      expect(confidenceFromDb(confidenceToDb(confidence))).toBe(confidence);
    }
  });

  it('round-trips every AnalysisCategory value', () => {
    for (const category of allCategories) {
      expect(categoryFromDb(categoryToDb(category))).toBe(category);
    }
  });

  it('round-trips every Finding status value', () => {
    for (const status of allStatuses) {
      expect(findingStatusFromDb(findingStatusToDb(status))).toBe(status);
    }
  });

  it('round-trips every ScanMode value', () => {
    for (const mode of allScanModes) {
      expect(scanModeFromDb(scanModeToDb(mode))).toBe(mode);
    }
  });

  it('round-trips every ScanStatus value', () => {
    for (const status of allScanStatuses) {
      expect(scanStatusFromDb(scanStatusToDb(status))).toBe(status);
    }
  });

  it('round-trips every UnitTestReportFormat value', () => {
    for (const format of allUnitTestReportFormats) {
      expect(unitTestReportFormatFromDb(unitTestReportFormatToDb(format))).toBe(format);
    }
  });

  it('round-trips every CronEnvironment value', () => {
    for (const environment of allCronEnvironments) {
      expect(cronEnvironmentFromDb(cronEnvironmentToDb(environment))).toBe(environment);
    }
  });

  it('round-trips every CronRunStatus value', () => {
    for (const status of allCronRunStatuses) {
      expect(cronRunStatusFromDb(cronRunStatusToDb(status))).toBe(status);
    }
  });

  it('round-trips every QaAutomationRunStatus value', () => {
    for (const status of allQaAutomationRunStatuses) {
      expect(qaAutomationRunStatusFromDb(qaAutomationRunStatusToDb(status))).toBe(status);
    }
  });

  it('round-trips every QaAutomationTrigger value', () => {
    for (const trigger of allQaAutomationTriggers) {
      expect(qaAutomationTriggerFromDb(qaAutomationTriggerToDb(trigger))).toBe(trigger);
    }
  });

  it('round-trips every RepoProvider value', () => {
    for (const provider of allRepoProviders) {
      expect(repoProviderFromDb(repoProviderToDb(provider))).toBe(provider);
    }
  });

  it('round-trips every ReportFormat value', () => {
    for (const format of allReportFormats) {
      expect(reportFormatFromDb(reportFormatToDb(format))).toBe(format);
    }
  });
});
