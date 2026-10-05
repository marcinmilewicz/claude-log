// claude-log: parses Claude Code data on this machine and writes the dashboard
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
import type { Dataset } from '../core/types';
import { parseZip } from '../core/zip';
import { parseDir } from './dir';

const PLACEHOLDER = '__CLAUDE_LOG_DATASET__';
const DEFAULT_OUT = 'claude-log-report.html';

const HELP = `claude-log ${pkg.version}
Builds a Claude Code usage dashboard as a single HTML file. Everything runs locally.

Usage:
  claude-log [source] [options]

Source (default: $CLAUDE_CONFIG_DIR or ~/.claude):
  a Claude Code data directory (~/.claude, its projects/ directory or one project)
  or a .zip made with the command from the web app

Options:
  -o, --out <file>  where to write the report (default: ./${DEFAULT_OUT})
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

async function main() {
  let args;
  try {
    args = parseArgs({
      allowPositionals: true,
      options: {
        out: { type: 'string', short: 'o' },
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
  if (positionals.length > 1) fail('Pass at most one source.');

  const source = resolve(positionals[0] ?? process.env.CLAUDE_CONFIG_DIR ?? resolve(homedir(), '.claude'));
  if (!existsSync(source)) fail(`${source} doesn't exist.`);
  const out = resolve(values.out ?? DEFAULT_OUT);

  const tty = process.stderr.isTTY;
  const onProgress = (p: Progress) => {
    if (tty) process.stderr.write(`\r\x1b[2K${progressLine(p)}`);
  };

  const t0 = Date.now();
  let ds: Dataset;
  try {
    ds = statSync(source).isDirectory() ? await parseDir(source, onProgress) : await parseZip(await openAsBlob(source), basename(source), onProgress);
  } catch (err) {
    if (tty) process.stderr.write('\r\x1b[2K');
    fail(err instanceof Error ? err.message : String(err));
  }
  if (tty) process.stderr.write('\r\x1b[2K');

  const html = renderReport(template, ds);
  await writeFile(out, html);

  const cost = ds.calls.reduce((s, c) => s + c.cost, 0);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Parsed ${ds.files.transcripts} sessions and ${ds.files.subagents} subagents from ${ds.sourceName} in ${secs} s (${usd(cost)} at API prices).`);
  console.log(`Report: ${out} (${bytes(html.length)})`);

  if (!values['no-open'] && process.stdout.isTTY) openInBrowser(out);
}

await main();
