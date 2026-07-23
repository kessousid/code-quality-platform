/** The subset of jscpd's JSON report this adapter consumes. */

export interface JscpdFileRef {
  name: string;
  start: number;
  end: number;
}

export interface JscpdDuplicate {
  firstFile: JscpdFileRef;
  secondFile: JscpdFileRef;
  format: string;
  lines: number;
  tokens: number;
}

export interface JscpdReport {
  duplicates: JscpdDuplicate[];
}
