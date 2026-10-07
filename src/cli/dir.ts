import { createReadStream, existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { prettyCwd } from '../core/ingest';
import { NO_TRANSCRIPTS, classifyAll, parseFiles, type Progress, type SourceFile } from '../core/parse';
import type { Dataset } from '../core/types';

// The same entries the zip command on the landing page picks from ~/.claude.
const CLAUDE_DIR_ENTRIES = ['projects', 'history.jsonl', 'stats-cache.json', 'sessions'];
// The parts of ~/.codex with session rollouts and prompt history.
const CODEX_DIR_ENTRIES = ['sessions', 'archived_sessions', 'history.jsonl'];
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

function startPaths(root: string): string[] {
  if (existsSync(join(root, 'projects'))) return CLAUDE_DIR_ENTRIES.map((e) => join(root, e));
  // ~/.codex (has config.toml or auth.json next to sessions/)
  if (existsSync(join(root, 'sessions')) && (existsSync(join(root, 'config.toml')) || existsSync(join(root, 'auth.json')))) {
    return CODEX_DIR_ENTRIES.map((e) => join(root, e));
  }
  return [root];
}

// Parses a data directory in place: ~/.claude, its projects/ directory or a
// single project directory, or ~/.codex or its sessions/ directory.
export async function parseDir(root: string, onProgress: (p: Progress) => void): Promise<Dataset> {
  const paths: string[] = [];
  for (const s of startPaths(root)) await walk(s, paths);

  const rels = paths.map((path) => relative(root, path).split(sep).join('/'));
  const { kinds } = classifyAll(rels);
  const files: SourceFile[] = [];
  let skipped = 0;
  for (const [i, path] of paths.entries()) {
    const rel = rels[i];
    const kind = kinds[i];
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
  if (files.length === 0) throw new Error(`${NO_TRANSCRIPTS} in ${root}.`);
  return parseFiles(prettyCwd(root), files, skipped, onProgress);
}
