import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const documentationRoot = join(repositoryRoot, 'docs');
const failures = [];

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && extname(entry.name) === '.md' ? [path] : [];
  });
}

function localTarget(rawTarget) {
  const target = rawTarget
    .trim()
    .replace(/^<|>$/g, '')
    .split(/\s+["']/)[0];
  if (!target || target.startsWith('#') || /^(?:https?:|mailto:|tel:|data:)/i.test(target)) {
    return null;
  }
  return decodeURIComponent(target.split('#')[0]);
}

const markdown = [join(repositoryRoot, 'README.md'), ...markdownFiles(documentationRoot)];
const referencedAssets = new Set();

for (const file of markdown) {
  const source = readFileSync(file, 'utf8');
  const targets = [
    ...source.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g),
    ...source.matchAll(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi),
  ].map((match) => match[1]);

  for (const rawTarget of targets) {
    const target = localTarget(rawTarget);
    if (!target) continue;
    const absolute = resolve(file.slice(0, file.lastIndexOf('/')), target);
    if (!existsSync(absolute)) {
      failures.push(`${relative(repositoryRoot, file)} references missing ${target}`);
      continue;
    }
    if (absolute.startsWith(`${join(documentationRoot, 'assets')}/`)) {
      referencedAssets.add(absolute);
    }
    if (absolute.startsWith(`${join(documentationRoot, 'screenshots')}/`)) {
      referencedAssets.add(absolute);
    }
  }
}

for (const directory of ['assets', 'screenshots']) {
  for (const entry of readdirSync(join(documentationRoot, directory), { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = join(documentationRoot, directory, entry.name);
    if (!referencedAssets.has(absolute)) {
      failures.push(`${relative(repositoryRoot, absolute)} is not referenced by current docs`);
    }
  }
}

function pngDimensions(path) {
  const header = readFileSync(path).subarray(0, 24);
  if (header.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
    throw new Error(`${relative(repositoryRoot, path)} is not a PNG`);
  }
  return { height: header.readUInt32BE(20), width: header.readUInt32BE(16) };
}

const uploadAssets = [
  {
    maxBytes: 5 * 1024 * 1024,
    path: join(documentationRoot, 'assets', 'faro-project-logo.png'),
    requiredDimensions: { height: 100, width: 100 },
  },
  {
    maxBytes: 5 * 1024 * 1024,
    path: join(documentationRoot, 'assets', 'faro-dashboard-background.png'),
    requiredDimensions: { height: 941, width: 1672 },
  },
];

for (const asset of uploadAssets) {
  const dimensions = pngDimensions(asset.path);
  const bytes = statSync(asset.path).size;
  if (
    dimensions.width !== asset.requiredDimensions.width ||
    dimensions.height !== asset.requiredDimensions.height
  ) {
    failures.push(
      `${relative(repositoryRoot, asset.path)} is ${dimensions.width}×${dimensions.height}; expected ${asset.requiredDimensions.width}×${asset.requiredDimensions.height}`,
    );
  }
  if (bytes > asset.maxBytes) {
    failures.push(`${relative(repositoryRoot, asset.path)} exceeds the 5 MB upload limit`);
  }
}

if (failures.length > 0) {
  console.error(
    `Documentation check failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Documentation check passed (${markdown.length} Markdown files, ${referencedAssets.size} referenced visual assets).`,
  );
}
