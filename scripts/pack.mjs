import { readdir, readFile, writeFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'plugin-packages/multi-platform-notify');
const output = join(root, 'dist');
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
const files = {};

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (!['checksums.json', 'signature.json', '.DS_Store'].includes(entry.name)) {
      files[relative(source, path).split('\\').join('/')] = createHash('sha256')
        .update(await readFile(path)).digest('hex');
    }
  }
}

await collect(source);
await writeFile(join(source, 'checksums.json'), JSON.stringify({ algorithm: 'SHA-256', files }, null, 2) + '\n');
await mkdir(output, { recursive: true });
const staging = await mkdtemp(join(output, '.pack-'));
const filename = `multi-platform-notify-v${manifest.version}.zip`;
const sourceName = `multi-platform-notify-source-v${manifest.version}.zip`;

// Build fresh archives so removed files cannot survive an incremental zip update.
function archive(name, cwd, entries) {
  const result = spawnSync('zip', ['-qrX', join(staging, name), ...entries, '-x',
    '*.DS_Store', '*__pycache__/*', '*.pyc'], { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Archive failed: ${name}`);
}

try {
  archive(filename, source, ['.']);
  archive(sourceName, root, ['README.md', 'README_en.md', 'LICENSE', 'package.json',
    'bridge/server.mjs', 'bridge/config.example.json', 'scripts', 'test', 'plugin-packages']);
  await rename(join(staging, filename), join(output, filename));
  await rename(join(staging, sourceName), join(output, sourceName));
  await writeFile(join(output, 'manifest.json'), JSON.stringify({ filename, version: 'v' + manifest.version }, null, 2) + '\n');
  process.stdout.write(`Packed dist/${filename} (${Object.keys(files).length} files)\n`);
  process.stdout.write(`Packed dist/${sourceName}\n`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
