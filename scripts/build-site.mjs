// Builds the GitHub Pages site in site/:
//   latest/      the working tree (main), for testing
//   vX.Y.Z/      each release tag, rebuilt from that tag's own source, so pinned URLs never change
//   index.html   the demo, running latest/
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SITE = join(ROOT, 'site');
const FILES = ['one-three-five.min.js', 'one-three-five.esm.js'];

const run = (cmd, args, cwd = ROOT, input) => execFileSync(cmd, args, { cwd, input, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit' });

function publish(fromDir, name) {
  mkdirSync(join(SITE, name), { recursive: true });
  for (const file of FILES) cpSync(join(fromDir, 'dist', file), join(SITE, name, file));
  console.log(`site/${name}/`);
}

rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE);

run('node', ['scripts/build.mjs']);
publish(ROOT, 'latest');

const tags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
for (const tag of tags) {
  const dir = mkdtempSync(join(tmpdir(), `otf-${tag}-`));
  run('tar', ['-x', '-C', dir], ROOT, execFileSync('git', ['archive', '--format=tar', tag], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }));
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir'); // the tag's build script needs esbuild
  run('node', ['scripts/build.mjs'], dir);
  publish(dir, tag);
  rmSync(dir, { recursive: true, force: true });
}

const demo = readFileSync(join(ROOT, 'demo/index.html'), 'utf8').replace('../dist/one-three-five.min.js', 'latest/one-three-five.min.js');
writeFileSync(join(SITE, 'index.html'), demo);
writeFileSync(join(SITE, '.nojekyll'), '');
console.log(`site ready: latest${tags.length ? ', ' + tags.join(', ') : ''}`);
