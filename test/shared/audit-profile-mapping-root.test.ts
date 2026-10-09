import { afterEach, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { loadAuditProfileMapping } from '../../shared/src/metadata/audit-profile-mapping.ts';

const repoRoot = join(import.meta.dir, '..', '..');
const tmpRoot = join(repoRoot, '.tmp-tests', 'audit-profile-mapping-root');

afterEach(async () => {
	await removeTempTree(tmpRoot);
});

// Passing the audits/ folder instead of the catalog root used to return zero rules, which reads
// exactly like a catalog with no mapping and made every audit applicable to every project.
test('a catalog root without an audits/ directory is an error, not an empty mapping', async () => {
	await expect(loadAuditProfileMapping(join(repoRoot, 'audits'))).rejects.toThrow(
		'expected an audits/ directory',
	);
	expect((await loadAuditProfileMapping(repoRoot)).rules.length).toBeGreaterThan(0);
});

test('a catalog with an audits/ directory but no mapping file has no rules', async () => {
	await mkdir(join(tmpRoot, 'audits'), { recursive: true });
	expect(await loadAuditProfileMapping(tmpRoot)).toEqual({ rules: [], version: 1 });
});
