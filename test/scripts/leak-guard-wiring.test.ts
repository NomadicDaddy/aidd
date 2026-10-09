import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { WIRING } from '../../scripts/lib/leak-guard/contract.ts';

// install-leak-guard prints WIRING as the package.json lines a carrier should paste. Its prepare
// line named aidd's own scripts/prepare.ts wrapper, which 46 of the 48 wired repositories do not
// have, so following it would have failed the target's next `bun install` (sigilsunseen,
// 2026-10-09). The shared-core manifest holds the wiring the sync checks for; the printed hint
// must be that wiring and nothing repository-specific.

interface ManifestGroup {
	name: string;
	wiring?: Record<string, string>;
}

describe('leak-guard wiring hint', () => {
	test('equals the shared-core manifest wiring for the leak-guard scripts group', () => {
		const manifest = JSON.parse(
			readFileSync(
				resolve(import.meta.dir, '../../scripts/shared-core-manifest.json'),
				'utf8',
			),
		) as { groups: ManifestGroup[] };
		const group = manifest.groups.find((g) => g.name === 'leak-guard-scripts');
		expect(group?.wiring).toBeDefined();
		expect(WIRING).toEqual(group?.wiring ?? {});
	});

	test('names no script a carrier is not given', () => {
		for (const value of Object.values(WIRING)) {
			expect(value).not.toContain('scripts/prepare.ts');
		}
	});
});
