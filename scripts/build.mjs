import { build } from 'esbuild';

const shared = {
  entryPoints: ['src/index.js'],
  bundle: true,
  target: 'es2018',
  legalComments: 'none',
  logLevel: 'info',
};

await Promise.all([
  // For @require and <script>: exposes window.OneThreeFive.
  build({ ...shared, format: 'iife', globalName: 'OneThreeFive', minify: true, outfile: 'dist/one-three-five.min.js' }),
  build({ ...shared, format: 'esm', outfile: 'dist/one-three-five.esm.js' }),
]);
