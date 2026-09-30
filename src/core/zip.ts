import { BlobReader, TextWriter, ZipReader, configure, type Entry, type FileEntry } from '@zip.js/zip.js';
import { Ingestor, classifyPath, type FileKind } from './ingest';
import type { Dataset } from './types';

// The parser itself runs in a Web Worker, so zip.js doesn't need to spawn its own.
configure({ useWebWorkers: false });

export interface Progress {
  doneBytes: number;
  totalBytes: number;
  filesDone: number;
  filesTotal: number;
  current: string;
}

async function streamLines(entry: FileEntry, onLine: (line: string) => void, onBytes: (n: number) => void) {
  const decoder = new TextDecoderStream();
  const writing = entry.getData(decoder.writable);
  const reader = decoder.readable.getReader();
  let rest = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    onBytes(value.length);
    const parts = (rest + value).split('\n');
    rest = parts.pop() ?? '';
    for (const p of parts) onLine(p);
  }
  if (rest) onLine(rest);
  await writing;
}

export async function parseZip(file: Blob, name: string, onProgress: (p: Progress) => void): Promise<Dataset> {
  const zip = new ZipReader(new BlobReader(file));
  const entries: Entry[] = await zip.getEntries();
  const ing = new Ingestor(name);

  const wanted: { entry: FileEntry; kind: FileKind }[] = [];
  for (const e of entries) {
    if (e.directory) continue;
    const kind = classifyPath(e.filename);
    if (kind) wanted.push({ entry: e as FileEntry, kind });
    else ing.skip();
  }
  if (wanted.length === 0) {
    await zip.close();
    throw new Error('The zip has no Claude Code transcripts (<sessionId>.jsonl files in project directories).');
  }

  const totalBytes = wanted.reduce((s, w) => s + w.entry.uncompressedSize, 0);
  const progress: Progress = { doneBytes: 0, totalBytes, filesDone: 0, filesTotal: wanted.length, current: '' };
  let lastReport = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (force || now - lastReport > 150) {
      lastReport = now;
      onProgress({ ...progress });
    }
  };

  for (const { entry, kind } of wanted) {
    progress.current = entry.filename;
    const onBytes = (n: number) => {
      progress.doneBytes += n;
      report();
    };
    if (kind.kind === 'transcript' || kind.kind === 'subagent') {
      ing.beginFile(kind);
      await streamLines(entry, (l) => ing.line(l), onBytes);
      ing.endFile();
    } else if (kind.kind === 'history') {
      await streamLines(entry, (l) => ing.historyLine(l), onBytes);
    } else {
      const text = await entry.getData(new TextWriter());
      onBytes(text.length);
      ing.json(kind, text);
    }
    progress.filesDone++;
    report();
  }
  await zip.close();
  report(true);
  return ing.finalize();
}
