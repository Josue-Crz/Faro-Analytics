import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function rewrite(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewrite(path);
    } else if (entry.isFile() && extname(path) === '.js') {
      const source = await readFile(path, 'utf8');
      const rewritten = source.replace(
        /((?:from\s*|import\s*)['"])(\.\.?\/[^'"]+)(['"])/g,
        (_match, before, specifier, after) =>
          /\.(?:js|json|node)$/.test(specifier)
            ? `${before}${specifier}${after}`
            : `${before}${specifier}.js${after}`,
      );
      if (rewritten !== source) await writeFile(path, rewritten);
    }
  }
}

await rewrite(fileURLToPath(new URL('../dist', import.meta.url)));
