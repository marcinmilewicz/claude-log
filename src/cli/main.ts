// claude-log: parses Claude Code and Codex data on this machine and writes the dashboard
// as a single HTML file that opens straight from disk. Nothing is uploaded.
import { spawn } from 'node:child_process';
import { existsSync, openAsBlob, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pkg from '../../cli/package.json';
import template from '../../cli/.template/report.html?raw';
import { bytes, usd } from '../core/format';
import type { Progress } from '../core/parse';
import { mergeDatasets } from '../core/merge';
import type { Dataset } from '../core/types';
import { parseZip } from '../core/zip';
import { parseDir } from './dir';

const PLACEHOLDER = '__CLAUDE_LOG_DATASET__';
const DEFAULT_OUT = 'claude-log-report.html';

const HELP = `claude-log ${pkg.version}
Builds a Claude Code and Codex usage dashboard as a single HTML file. Everything runs locally.

Usage:
  claude-log [source...] [options]

Sources (default: both $CLAUDE_CONFIG_DIR or ~/.claude and $CODEX_HOME or ~/.codex,
whichever exist; several sources are combined into one report):
  a Claude Code data directory (~/.claude, its projects/ directory or one project),
  a Codex data directory (~/.codex or its sessions/ directory)
  or a .zip made with the command from the web app

Options:
  -o, --out <file>  where to write the report (default: ./${DEFAULT_OUT})
      --claude      only read the default Claude Code directory
      --codex       only read the default Codex directory
      --no-open     don't open the report in the browser
  -h, --help        show this help
  -v, --version     show the version

The report contains your prompts and file paths. Treat it like the transcripts themselves.

Made by Marcin Milewicz · Apache-2.0 · ${pkg.homepage}`;

function fail(message: string): never {
  console.error(`claude-log: ${message}`);
  process.exit(1);
}

function progressLine(p: Progress): string {
  const ratio = p.totalBytes ? Math.round((p.doneBytes / p.totalBytes) * 100) : 0;
  return `Parsing ${ratio}% · ${bytes(p.doneBytes)} of ${bytes(p.totalBytes)} · file ${p.filesDone} of ${p.filesTotal}`;
}

export function renderReport(html: string, ds: Dataset): string {
  const parts = html.split(PLACEHOLDER);
  if (parts.length !== 2) throw new Error('The report template is broken: the data placeholder is missing.');
  // "<" only occurs inside JSON strings, where < is equivalent, so the data can't close the <script> tag.
  const json = JSON.stringify(ds).replace(/</g, '\\u003c');
  return parts[0] + json + parts[1];
}

function openInBrowser(file: string) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [file]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', file]] : ['xdg-open', [file]];
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.on('error', () => console.error(`Couldn't open a browser. Open ${file} manually.`));
  child.unref();
}

async function parseSource(source: string, onProgress: (p: Progress) => void): Promise<Dataset> {
  return statSync(source).isDirectory() ? parseDir(source, onProgress) : parseZip(await openAsBlob(source), basename(source), onProgress);
}

function describe(ds: Dataset): string {
  return ds.sources[0] === 'codex'
    ? `${ds.files.transcripts} Codex sessions from ${ds.sourceName}`
    : `${ds.files.transcripts} Claude Code sessions and ${ds.files.subagents} subagents from ${ds.sourceName}`;
}

async function main() {
  let args;
  try {
    args = parseArgs({
      allowPositionals: true,
      options: {
        out: { type: 'string', short: 'o' },
        claude: { type: 'boolean' },
        codex: { type: 'boolean' },
        'no-open': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (err) {
    fail(`${err instanceof Error ? err.message : String(err)}\nRun claude-log --help for usage.`);
  }
  const { values, positionals } = args;
  if (values.help) return console.log(HELP);
  if (values.version) return console.log(pkg.version);
  if (positionals.length > 0 && (values.claude || values.codex)) fail('--claude and --codex pick the default directories. Pass either sources or these options.');

  const claudeDir = resolve(process.env.CLAUDE_CONFIG_DIR ?? resolve(homedir(), '.claude'));
  const codexDir = resolve(process.env.CODEX_HOME ?? resolve(homedir(), '.codex'));
  // Explicit sources must all work. Default directories are skipped when they're missing or hold no sessions.
  const explicit = positionals.length > 0;
  const sources = explicit
    ? positionals.map((p) => resolve(p))
    : [...(values.claude || !values.codex ? [claudeDir] : []), ...(values.codex || !values.claude ? [codexDir] : [])].filter((d) => existsSync(d));
  for (const s of sources) if (!existsSync(s)) fail(`${s} doesn't exist.`);
  if (sources.length === 0) fail(`Found neither ${claudeDir} nor ${codexDir}. Pass a data directory or zip.`);

  const tty = process.stderr.isTTY;
  const onProgress = (p: Progress) => {
    if (tty) process.stderr.write(`\r\x1b[2K${progressLine(p)}`);
  };
  const clearProgress = () => {
    if (tty) process.stderr.write('\r\x1b[2K');
  };

  const t0 = Date.now();
  const parsed: Dataset[] = [];
  for (const source of sources) {
    try {
      parsed.push(await parseSource(source, onProgress));
    } catch (err) {
      clearProgress();
      const message = err instanceof Error ? err.message : String(err);
      if (explicit) fail(message);
      console.error(`Skipping ${source}: ${message}`);
    }
  }
  clearProgress();
  if (parsed.length === 0) fail('No sessions to report.');
  const ds = mergeDatasets(parsed);

  const out = resolve(values.out ?? DEFAULT_OUT);
  const html = renderReport(template, ds);
  await writeFile(out, html);

  const cost = ds.calls.reduce((s, c) => s + c.cost, 0);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Parsed ${parsed.map(describe).join(', and ')} in ${secs} s (${usd(cost)} at API prices).`);
  console.log(`Report: ${out} (${bytes(html.length)})`);

  if (!values['no-open'] && process.stdout.isTTY) openInBrowser(out);
}

await main();
