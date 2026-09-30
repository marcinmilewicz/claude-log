import { createReadStream, existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { classifyPath, prettyCwd } from '../core/ingest';
import { parseFiles, type Progress, type SourceFile } from '../core/parse';
import type { Dataset } from '../core/types';

// The same entries the zip command on the landing page picks from ~/.claude.
const CLAUDE_DIR_ENTRIES = ['projects', 'history.jsonl', 'stats-cache.json', 'sessions'];
const SKIP_DIRS = new Set(['tool-results', 'file-history', 'node_modules', '.git']);

async function walk(path: string, out: string[]) {
  const info = await stat(path).catch(() => null);
  if (!info) return;
  if (info.isFile()) {
    out.push(path);
    return;
  }
  if (!info.isDirectory()) return;
  for (const d of await readdir(path, { withFileTypes: true })) {
    if (d.isDirectory() && SKIP_DIRS.has(d.name)) continue;
    await walk(join(path, d.name), out);
  }
}

async function streamLines(path: string, onLine: (line: string) => void, onBytes: (n: number) => void) {
  let rest = '';
  for await (const chunk of createReadStream(path, { encoding: 'utf8' })) {
    const value = chunk as string;
    onBytes(value.length);
    const parts = (rest + value).split('\n');
    rest = parts.pop() ?? '';
    for (const p of parts) onLine(p);
  }
  if (rest) onLine(rest);
}

// Parses a Claude Code data directory in place: ~/.claude, its projects/
// directory, or a single project directory.
export async function parseDir(root: string, onProgress: (p: Progress) => void): Promise<Dataset> {
  const paths: string[] = [];
  const starts = existsSync(join(root, 'projects')) ? CLAUDE_DIR_ENTRIES.map((e) => join(root, e)) : [root];
  for (const s of starts) await walk(s, paths);

  const files: SourceFile[] = [];
  let skipped = 0;
  for (const path of paths) {
    const rel = relative(root, path).split(sep).join('/');
    const kind = classifyPath(rel);
    if (!kind) {
      skipped++;
      continue;
    }
    files.push({
      path: rel,
      size: (await stat(path)).size,
      kind,
      lines: (onLine, onBytes) => streamLines(path, onLine, onBytes),
      text: () => readFile(path, 'utf8'),
    });
  }
  if (files.length === 0) throw new Error(`No Claude Code transcripts (<sessionId>.jsonl files in project directories) in ${root}.`);
  return parseFiles(prettyCwd(root), files, skipped, onProgress);
}
