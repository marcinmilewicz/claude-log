import { Ingestor, classifyPath, type FileKind } from './ingest';
import { CodexIngestor, classifyCodexPath } from './ingest-codex';
import type { Dataset, Source } from './types';

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

// Decides whether a set of paths holds Claude Code or Codex data and
// classifies each path accordingly (null = not used). Both have a
// history.jsonl, so one source is picked for the whole set: Claude Code
// when it has transcripts, otherwise Codex when it has rollouts.
export function classifyAll(paths: string[]): { source: Source; kinds: (FileKind | null)[] } {
  const claude = paths.map(classifyPath);
  if (claude.some((k) => k?.kind === 'transcript')) return { source: 'claude', kinds: claude };
  const codex = paths.map(classifyCodexPath);
  if (codex.some((k) => k?.kind === 'rollout')) return { source: 'codex', kinds: codex };
  return { source: 'claude', kinds: claude };
}

export const NO_TRANSCRIPTS = 'No Claude Code transcripts (<sessionId>.jsonl files in project directories) or Codex sessions (rollout-*.jsonl files)';

// Feeds the files to an Ingestor in order and reports progress.
// `skipped` is the number of files that weren't recognized.
export async function parseFiles(name: string, files: SourceFile[], skipped: number, onProgress: (p: Progress) => void): Promise<Dataset> {
  const ing = files.some((f) => f.kind.kind === 'rollout') ? new CodexIngestor(name) : new Ingestor(name);
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
    if (kind.kind === 'transcript' || kind.kind === 'subagent' || kind.kind === 'rollout') {
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
