// Bundles the CLI (src/cli/main.ts) with the report template and all
// dependencies into one Node script: cli/dist/claude-log.mjs. It also puts
// LICENSE, NOTICE and THIRD_PARTY_LICENSES.txt into the npm package.
// Run `vite build -c vite.report.config.ts` first; `npm run build:cli` does both.
import { copyFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { packageDirs, readPackageList, thirdPartyLicenses } from './scripts/licenses';

function licenseFiles(): Plugin {
  return {
    name: 'license-files',
    generateBundle(_, bundle) {
      const moduleIds = Object.values(bundle).flatMap((f) => (f.type === 'chunk' ? f.moduleIds : []));
      const dirs = [...new Set([...packageDirs(moduleIds), ...readPackageList('cli/.template/packages.json')])].sort();
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_LICENSES.txt', source: thirdPartyLicenses(dirs) });
    },
    closeBundle() {
      copyFileSync('LICENSE', 'cli/LICENSE');
      copyFileSync('NOTICE', 'cli/NOTICE');
    },
  };
}

export default defineConfig({
  publicDir: false,
  plugins: [licenseFiles()],
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: 'src/cli/main.ts',
    outDir: 'cli/dist',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    rolldownOptions: {
      output: {
        entryFileNames: 'claude-log.mjs',
        banner: '#!/usr/bin/env node',
        codeSplitting: false,
      },
    },
  },
});
