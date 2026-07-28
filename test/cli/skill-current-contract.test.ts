import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { describe, expect, test } from 'bun:test';

const ROOT = process.cwd();
const SKILLS_DIR = join(ROOT, 'skills');

const FORBIDDEN_MARKERS = [
	'.automaker/',
	'0b8c229',
	'702e873',
	'<aidd-legacy-root>',
	'acme-monitor',
	'aidd v2',
	'aidd-web',
	'as of july 2026',
	'baseline (july 2026)',
	'demo-app',
	'earlier versions of this skill',
	'pre-migration archived apps',
	'recovery incident',
	'taskboard',
	'verified july 2026',
	'why this phase exists',
] as const;

const FORBIDDEN_INTERACTION_MARKERS = [
	'approval cycle',
	'ask for approval',
	'ask for confirmation',
	'ask the user',
	'ask user',
	'do not proceed until the user',
	'human handoff',
	'let the user decide',
	'mandatory confirmation gate',
	'obtain approval',
	'only user-approved',
	'on approval:',
	'pause for user direction',
	'request explicit approval',
	'requires explicit user confirmation',
	'user must confirm',
	'wait for confirmation',
	'wait for explicit approval',
	'wait for explicit confirmation',
] as const;

const REQUIRED_COMPATIBILITY_MARKERS = {
	'skills/bug2feature/references/TRIAGE-WORKFLOW.md': ['2026-04-15', '`sb.ts`'],
	'skills/consolidate-features/SKILL.md': ['feature-{8 digits}-{rest}'],
	'skills/execute-audit/SKILL.md': ['docs/audits/<AUDIT_NAME>_AUDIT_REPORT_*.md'],
	'skills/feature-review-all/SKILL.md': ['`acceptance_criteria`', '`file_locations`'],
	'skills/spernakit-bump/SKILL.md': [
		'`bun run fleet-manifest:sync`',
		'before the release commit',
	],
	'skills/template-upgrade/references/UPGRADE-WORKFLOW.md': [
		'If `scaffolding/` does not exist at the target tag',
		'`bun run fleet-manifest:sync` from `<spernakit-root>`',
		'before the upgrade commit',
	],
} as const;

const REQUIRED_UNATTENDED_MARKERS = {
	'skills/audit-finding-review/SKILL.md': [
		'return a usage error',
		'apply every disposition directly',
	],
	'skills/bug2feature/SKILL.md': ['create every actionable feature file directly'],
	'skills/dance/SKILL.md': ['**Features present → implement them directly**'],
	'skills/deepreview/SKILL.md': ['apply confirmed in-scope fixes directly'],
	'skills/repo-governance-audit/SKILL.md': ['invocation includes `--apply`'],
	'skills/review/SKILL.md': ['apply confirmed', 'in-scope fixes directly'],
	'skills/ship-pr/SKILL.md': ['skill invocation explicitly authorizes'],
	'skills/spernakit-bump/SKILL.md': ['invoking this release skill authorizes publication'],
	'skills/template-upgrade/references/UPGRADE-WORKFLOW.md': ['proceed directly to execution'],
	'skills/testing-scenarios/SKILL.md': ['Selecting this mode authorizes the'],
	'skills/ui-organize/SKILL.md': ['Continue directly to Phase 5'],
	'skills/ui-parity/SKILL.md': ['all High and Medium priority gaps by default'],
	'skills/ui-playground-apply/SKILL.md': ['An invocation containing `--apply` authorizes'],
	'skills/validate-tests/SKILL.md': ['return non-success'],
} as const;

async function collectFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await collectFiles(path)));
		else if (entry.isFile()) files.push(path);
	}
	return files;
}

describe('bundled skill current-contract guidance', () => {
	test('omits retired runtime, provenance, and workspace-example markers', async () => {
		const offenders: string[] = [];
		for (const path of await collectFiles(SKILLS_DIR)) {
			const body = (await readFile(path, 'utf8')).toLowerCase();
			for (const marker of FORBIDDEN_MARKERS) {
				if (body.includes(marker)) {
					offenders.push(`${relative(ROOT, path).replaceAll('\\', '/')} -> ${marker}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	test('retains evidence-based compatibility rules', async () => {
		for (const [path, markers] of Object.entries(REQUIRED_COMPATIBILITY_MARKERS)) {
			const body = await readFile(join(ROOT, path), 'utf8');
			for (const marker of markers) expect(body).toContain(marker);
		}
	});

	test('contains no interactive execution gates', async () => {
		const offenders: string[] = [];
		for (const path of await collectFiles(SKILLS_DIR)) {
			const body = (await readFile(path, 'utf8')).toLowerCase();
			for (const marker of FORBIDDEN_INTERACTION_MARKERS) {
				if (body.includes(marker)) {
					offenders.push(`${relative(ROOT, path).replaceAll('\\', '/')} -> ${marker}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	test('retains unattended defaults for action skills', async () => {
		for (const [path, markers] of Object.entries(REQUIRED_UNATTENDED_MARKERS)) {
			const body = await readFile(join(ROOT, path), 'utf8');
			for (const marker of markers) expect(body).toContain(marker);
		}
	});
});
