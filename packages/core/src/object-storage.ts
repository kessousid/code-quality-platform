/**
 * Port for the "blob" half of the storage split described in
 * docs/adr/0009 and docs/adr/0019 — Postgres holds findings/scans/reports
 * metadata, this holds the actual report/artifact bytes. One adapter
 * exists today (`LocalFilesystemObjectStorage` in packages/storage);
 * nothing above this interface knows or cares which adapter is behind it.
 */
export interface ObjectStorage {
  put(key: string, content: Buffer | string): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
}
