import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const SIZE_BUDGET = 12 * 1024; // PRD: under 12 KB minified + gzipped, CSS included

const shared = {
  entryPoints: ['src/index.js'],
  bundle: true,
  target: 'es2018',
  legalComments: 'none',
  logLevel: 'info',
  define: { __VERSION__: JSON.stringify(version) },
  banner: { js: `/*! @lionheart06/one-three-five v${version} | MIT */` },
};

await Promise.all([
  // For @require and <script>: exposes window.OneThreeFive.
  build({ ...shared, format: 'iife', globalName: 'OneThreeFive', minify: true, outfile: 'dist/one-three-five.min.js' }),
  build({ ...shared, format: 'esm', outfile: 'dist/one-three-five.esm.js' }),
]);

const gzipped = gzipSync(readFileSync('dist/one-three-five.min.js')).length;
console.log(`  gzipped: ${(gzipped / 1024).toFixed(1)} KB of ${SIZE_BUDGET / 1024} KB budget`);
if (gzipped > SIZE_BUDGET) {
  console.error('  over the size budget');
  process.exit(1);
}
