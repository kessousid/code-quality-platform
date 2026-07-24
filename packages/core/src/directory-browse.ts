/**
 * A request/response port, unlike the fire-and-forget ScanQueue/UnitTestQueue/
 * CoverageQueue (see docs/adr/0031, docs/adr/0032) — the caller needs the
 * actual directory listing back, not just confirmation the job was queued.
 * Framework-free here (ADR-0010); the real adapter is a BullMQ job whose
 * result the caller waits on, but nothing about that leaks into this type.
 */
export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

export interface BrowseDirectoryResult {
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
}

export interface BrowseDirectoryRequest {
  path?: string;
  includeFiles?: boolean;
}

export interface DirectoryBrowseQueue {
  browse(request: BrowseDirectoryRequest): Promise<BrowseDirectoryResult>;
}

/** One real queue per workerId (see docs/adr/0031) — a repo's folder picker must ask the one worker instance that actually has its files on disk. */
export interface DirectoryBrowseQueueRegistry {
  forWorker(workerId: string): DirectoryBrowseQueue;
}
