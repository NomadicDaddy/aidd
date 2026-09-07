import { describe, expect, test } from 'bun:test';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

// aidd's distributed catalog contains aidd-owned skills only. Optional upstream skills are resolved
// by the agent at runtime, so vendored skill bodies and source snapshots violate that boundary.
const ROOT = process.cwd();
const SKILLS_DIR = join(ROOT, 'skills');
const EXTERNAL_SKILL_PACKAGES = ['dogfood', 'frontend-design', 'grill-with-docs', 'knip'];
const EXTERNAL_SOURCE_SNAPSHOTS = [
	'references/source-vercel-composition-patterns',
	'references/source-vercel-react-best-practices',
	'references/source-web-design-guidelines',
];

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

describe('catalog ownership guard', () => {
	test.each(EXTERNAL_SKILL_PACKAGES)('skills/%s is not distributed', async (id) => {
		expect(await exists(join(SKILLS_DIR, id))).toBe(false);
	});

	test.each(EXTERNAL_SOURCE_SNAPSHOTS)(
		'skills/audit-review/%s is not distributed',
		async (relative) => {
			expect(await exists(join(SKILLS_DIR, 'audit-review', relative))).toBe(false);
		},
	);

	test('audit-review ships no vendored source references', async () => {
		expect(await exists(join(SKILLS_DIR, 'audit-review', 'references'))).toBe(false);
	});

	test('ui-redesign-planner keeps review findings as remediations', async () => {
		const body = await readFile(join(SKILLS_DIR, 'ui-redesign-planner', 'SKILL.md'), 'utf8');
		expect(body).toContain('name: ui-redesign-planner');
		expect(body).toContain('frontend-design');
		expect(body).toContain(
			'{app}/.aidd/features/remediation-{YYYYMMDD}-{short-slug}/feature.json',
		);
		expect(body).toContain('non-standalone remediation finding');
		expect(body).not.toContain('{app}/.aidd/features/{short-descriptive-slug}/feature.json');
	});

	test('bundled skills declare no contract on an external package', async () => {
		const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
		const offenders: string[] = [];
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const path = join(SKILLS_DIR, entry.name, 'SKILL.md');
			if (!(await exists(path))) continue;
			const body = await readFile(path, 'utf8');
			for (const external of EXTERNAL_SKILL_PACKAGES) {
				if (
					body.includes(`aidd-contracts: ${external}`) ||
					body.includes(`skills/${external}/`)
				) {
					offenders.push(`${entry.name} -> ${external}`);
				}
			}
			if (body.includes('skills/audit-review/references/')) {
				offenders.push(`${entry.name} -> audit-review/references`);
			}
		}
		expect(offenders).toEqual([]);
	});
});
