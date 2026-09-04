import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

type PackageManifest = {
  packageManager?: string;
  engines?: { node?: string };
  dependencies?: { next?: string };
};

function readManifest(relativePath: string): PackageManifest | null {
  try {
    return JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../..', relativePath), 'utf8'),
    ) as PackageManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

test('runtime baseline is pinned to the approved Node, npm, and Next versions', () => {
  const root = readManifest('package.json');
  const web = readManifest('apps/web/package.json');

  expect(root?.engines?.node).toBe('>=24 <25');
  expect(root?.packageManager).toBe('npm@11.4.2');
  expect(web?.dependencies?.next).toBe('16.3.3');
});
