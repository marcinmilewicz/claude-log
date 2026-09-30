// Collects the licenses of the npm packages bundled into the CLI and the report,
// because minification drops their license comments. Used by vite.report.config.ts
// and vite.cli.config.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const NM = '/node_modules/';

// Package root directories of the bundled modules, e.g. ".../node_modules/@zip.js/zip.js".
export function packageDirs(moduleIds: Iterable<string>): string[] {
  const dirs = new Set<string>();
  for (const raw of moduleIds) {
    const id = raw.replace(/\\/g, '/');
    const i = id.lastIndexOf(NM);
    if (i < 0) continue;
    const parts = id.slice(i + NM.length).split('/');
    const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
    dirs.add(id.slice(0, i + NM.length) + name);
  }
  return [...dirs].sort();
}

export function thirdPartyLicenses(dirs: string[]): string {
  const sections = dirs.map((dir) => {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
    if (!file) throw new Error(`No license file in ${dir}.`);
    return `${pkg.name}@${pkg.version} (${pkg.license})\n${'-'.repeat(60)}\n${readFileSync(join(dir, file), 'utf8').trim()}`;
  });
  return `The claude-log CLI bundles the following third-party packages.\n\n${sections.join('\n\n\n')}\n`;
}

export function readPackageList(path: string): string[] {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as string[]) : [];
}
