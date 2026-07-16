import { promises as fs } from 'node:fs';
import path from 'node:path';

const roots = ['apps', 'packages'];
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json']);

// Runtime source may use IBM Bob only. Keep documentation of this prohibition outside
// the runtime tree so the boundary checker can remain intentionally blunt.
const prohibited = [
  { name: 'non-IBM provider A', pattern: /\bopenai\b/i },
  { name: 'non-IBM provider B', pattern: /\banthropic\b/i },
  { name: 'non-IBM provider C', pattern: /\bgemini\b/i },
  { name: 'non-IBM provider D', pattern: /\bcohere\b/i },
  { name: 'non-IBM provider E', pattern: /\bmistral\b/i },
  { name: 'non-IBM provider F', pattern: /\bgroq\b/i },
  { name: 'unapproved IBM model platform', pattern: /\bwatsonx\b/i },
  { name: 'unapproved IBM model family', pattern: /\bgranite\b/i },
  { name: 'generic AI SDK', pattern: /@ai-sdk\//i },
  { name: 'generic model orchestration SDK', pattern: /\blangchain\b/i },
];

const ignoredDirectories = new Set(['node_modules', '.next', 'dist', 'coverage', 'generated']);

async function listFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return ignoredDirectories.has(entry.name) ? [] : listFiles(target);
      }
      return sourceExtensions.has(path.extname(entry.name)) ? [target] : [];
    }),
  );
  return nested.flat();
}

async function main() {
  const files = (
    await Promise.all(
      roots.map(async (root) => {
        try {
          return await listFiles(root);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
          throw error;
        }
      }),
    )
  ).flat();

  const violations: string[] = [];
  for (const file of files) {
    const contents = (await fs.readFile(file, 'utf8')).toLowerCase();
    for (const provider of prohibited) {
      if (provider.pattern.test(contents)) {
        violations.push(`${file}: forbidden runtime integration (${provider.name})`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('Faro AI boundary check failed:\n' + violations.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Faro AI boundary check passed (${files.length} runtime files inspected).`);
  }
}

void main();
