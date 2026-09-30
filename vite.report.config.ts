// Builds report.html as a single self-contained file (JS, CSS and favicon inlined)
// that the CLI embeds and fills with data. Output: cli/.template/report.html, plus
// packages.json listing the bundled npm packages for the CLI's license file.
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { packageDirs } from './scripts/licenses';

function inlineEverything(): Plugin {
  return {
    name: 'inline-everything',
    enforce: 'post',
    generateBundle(_, bundle) {
      const page = Object.values(bundle).find((f) => f.fileName === 'report.html');
      if (!page || page.type !== 'asset') throw new Error('report.html is missing from the bundle.');
      let html = String(page.source);
      const moduleIds: string[] = [];
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk') {
          moduleIds.push(...file.moduleIds);
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          html = html.replace(new RegExp(`<script type="module" crossorigin src="[^"]*${escape(name)}"></script>`), () => `<script type="module">${code}</script>`);
          delete bundle[name];
        } else if (name.endsWith('.css')) {
          const css = String(file.source).replace(/<\/style/gi, '<\\/style');
          html = html.replace(new RegExp(`<link rel="stylesheet" crossorigin href="[^"]*${escape(name)}">`), () => `<style>${css}</style>`);
          delete bundle[name];
        }
      }
      const favicon = readFileSync('public/favicon.svg').toString('base64');
      html = html.replace('href="/favicon.svg"', `href="data:image/svg+xml;base64,${favicon}"`);
      if (/<script[^>]+src=|<link rel="stylesheet"/.test(html)) throw new Error('report.html still references external files.');
      page.source = html;
      this.emitFile({ type: 'asset', fileName: 'packages.json', source: JSON.stringify(packageDirs(moduleIds), null, 2) });
    },
  };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default defineConfig({
  plugins: [react(), inlineEverything()],
  build: {
    outDir: 'cli/.template',
    emptyOutDir: true,
    copyPublicDir: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    rolldownOptions: {
      input: 'report.html',
      output: { codeSplitting: false },
    },
  },
});
