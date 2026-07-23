/** The subset of `osv-scanner scan source --format json` output this adapter consumes. */

export interface OsvAffectedRange {
  type: string;
  events: Array<{ introduced?: string; fixed?: string }>;
}

export interface OsvVulnerability {
  id: string;
  summary?: string;
  details?: string;
  references?: Array<{ type: string; url: string }>;
  database_specific?: {
    severity?: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
    cwe_ids?: string[];
  };
  affected?: Array<{
    package: { name: string; ecosystem: string };
    ranges?: OsvAffectedRange[];
  }>;
}

export interface OsvPackageGroup {
  ids: string[];
  max_severity?: string;
}

export interface OsvScannedPackage {
  package: { name: string; version: string; ecosystem: string };
  groups: OsvPackageGroup[];
  vulnerabilities: OsvVulnerability[];
}

export interface OsvResult {
  source: { path: string; type: string };
  packages: OsvScannedPackage[];
}

export interface OsvOutput {
  results: OsvResult[];
}
