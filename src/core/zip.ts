import { BlobReader, TextWriter, ZipReader, configure, type Entry, type FileEntry } from '@zip.js/zip.js';
import { classifyPath } from './ingest';
import { parseFiles, type Progress, type SourceFile } from './parse';
import type { Dataset } from './types';

export type { Progress } from './parse';

// The parser itself runs in a Web Worker, so zip.js doesn't need to spawn its own.
configure({ useWebWorkers: false });

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

  const wanted: SourceFile[] = [];
  let skipped = 0;
  for (const e of entries) {
    if (e.directory) continue;
    const kind = classifyPath(e.filename);
    if (!kind) {
      skipped++;
      continue;
    }
    const entry = e as FileEntry;
    wanted.push({
      path: entry.filename,
      size: entry.uncompressedSize,
      kind,
      lines: (onLine, onBytes) => streamLines(entry, onLine, onBytes),
      text: () => entry.getData(new TextWriter()),
    });
  }
  if (wanted.length === 0) {
    await zip.close();
    throw new Error('The zip has no Claude Code transcripts (<sessionId>.jsonl files in project directories).');
  }

  try {
    return await parseFiles(name, wanted, skipped, onProgress);
  } finally {
    await zip.close();
  }
}
