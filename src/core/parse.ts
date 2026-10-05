import { Ingestor, type FileKind } from './ingest';
import type { Dataset } from './types';

export interface Progress {
  doneBytes: number;
  totalBytes: number;
  filesDone: number;
  filesTotal: number;
  current: string;
}

// One file to ingest, wherever it lives (a zip entry or a file on disk).
export interface SourceFile {
  path: string;
  size: number;
  kind: FileKind;
  lines(onLine: (line: string) => void, onBytes: (n: number) => void): Promise<void>;
  text(): Promise<string>;
}

// Feeds the files to an Ingestor in order and reports progress.
// `skipped` is the number of files that weren't recognized.
export async function parseFiles(name: string, files: SourceFile[], skipped: number, onProgress: (p: Progress) => void): Promise<Dataset> {
  const ing = new Ingestor(name);
  for (let i = 0; i < skipped; i++) ing.skip();

  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const progress: Progress = { doneBytes: 0, totalBytes, filesDone: 0, filesTotal: files.length, current: '' };
  let lastReport = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (force || now - lastReport > 150) {
      lastReport = now;
      onProgress({ ...progress });
    }
  };

  for (const f of files) {
    progress.current = f.path;
    const onBytes = (n: number) => {
      progress.doneBytes += n;
      report();
    };
    const { kind } = f;
    if (kind.kind === 'transcript' || kind.kind === 'subagent') {
      ing.beginFile(kind);
      await f.lines((l) => ing.line(l), onBytes);
      ing.endFile();
    } else if (kind.kind === 'history') {
      await f.lines((l) => ing.historyLine(l), onBytes);
    } else {
      const text = await f.text();
      onBytes(text.length);
      ing.json(kind, text);
    }
    progress.filesDone++;
    report();
  }
  report(true);
  return ing.finalize();
}
