import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { parseSkillDefinition, type SkillDefinition } from '../../shared/src/skills/definition.ts';

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

// A skill body must not declare its own read-only boundary. `executionIntent: apply-changes` only
// *omits* aidd's read-only prohibition — it never adds an instruction — so a sentence like "keep
// the review read-only unless the user requests an update" is the sole instruction in the prompt
// on the subject and applies under both intents. The skill then silently does nothing when an
// operator asks it to apply changes. Definitions state the fix and apply it; `review-only` is the
// only thing that forbids writing. Scoping writes to a skill's own deliverable (an audit report,
// `.aidd/testing-scenarios.md`) is a deliverable boundary, not an intent one, and stays allowed.
const FORBIDDEN_INTENT_BOUNDARY_MARKERS = [
	'do not mutate the project unless',
	'read-only unless',
	'readonly unless',
	'remain read-only unless',
	'unless the user explicitly requests an update',
	'unless the user explicitly requests fixes',
	'unless the user explicitly requests remediation',
	'unless the user requests reconciliation',
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
	'skills/spernakit-template-upgrade/references/UPGRADE-WORKFLOW.md': [
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
	'skills/deepreview/SKILL.md': ['apply confirmed in-scope fixes directly'],
	'skills/repo-governance-audit/SKILL.md': ['invocation includes `--apply`'],
	'skills/ship-pr/SKILL.md': ['skill invocation explicitly authorizes'],
	'skills/spernakit-bump/SKILL.md': ['invoking this release skill authorizes publication'],
	'skills/spernakit-dance/SKILL.md': ['**Features present → implement them directly**'],
	'skills/spernakit-organize-ui/SKILL.md': ['Continue directly to Phase 5'],
	'skills/spernakit-template-upgrade/references/UPGRADE-WORKFLOW.md': [
		'proceed directly to execution',
	],
	'skills/testing-scenarios/SKILL.md': ['Selecting this mode authorizes the'],
	'skills/ui-parity/SKILL.md': ['all High and Medium priority gaps by default'],
	'skills/ui-playground-apply/SKILL.md': ['An invocation containing `--apply` authorizes'],
	'skills/validate-tests/SKILL.md': ['return non-success'],
} as const;

// `notes` persists as a bare string in existing and synced corpora, so a skill that shows the field
// as one JSON string teaches the shape that clobbers those records on the next append. Scanned
// across the whole corpus rather than a fixed list: the failure mode is a *new* skill picking up
// the wrong shape, which an allowlist of today's writers cannot see.
const FORBIDDEN_FEATURE_NOTE_SHAPE = /"notes"\s*:\s*"/;
const FENCED_JSON_BLOCK = /```json\r?\n(?<body>[\s\S]*?)```/g;

// The writers that actually append to an existing record must also carry the normalization rule.
// `doc2feature/SKILL.md` only creates records; its append rule lives in FEATURE-AUTHORING.md.
const FEATURE_NOTE_APPEND_FILES = [
	'skills/bug2feature/references/TRIAGE-WORKFLOW.md',
	'skills/consolidate-features/SKILL.md',
	'skills/doc2feature/references/FEATURE-AUTHORING.md',
	'skills/document-changes/SKILL.md',
	'skills/feature-coverage-audit/SKILL.md',
	'skills/feature-review/SKILL.md',
	'skills/promote-remediation/SKILL.md',
	'skills/spec/SKILL.md',
] as const;

const NUMBERED_SPEC_APPEND_FILES = [
	'skills/consolidate-features/SKILL.md',
	'skills/document-changes/SKILL.md',
	'skills/feature-coverage-audit/SKILL.md',
	'skills/feature-review/SKILL.md',
	'skills/spec/SKILL.md',
] as const;

const REQUIRED_HANDOFF_MARKERS = {
	'skills/audit-finding-review/SKILL.md': [
		'`remediation-{YYYYMMDD}-{slug}`, the Spernakit process-record shape consumed by',
	],
	'skills/bug2feature/references/TRIAGE-WORKFLOW.md': [
		'`remediation-{YYYYMMDD}-{slug}` process shape in any repository',
		'clean slug',
	],
	'skills/consolidate-features/SKILL.md': [
		'`"status": "completed"` and `"passes": true`',
		'invalid values, not compatibility aliases',
	],
	'skills/doc2feature/references/FEATURE-AUTHORING.md': [
		'`remediation-{YYYYMMDD}-{slug}` for issue-finding IDs and directories in any repository',
	],
	'skills/frontend-design-sweep/SKILL.md': ['ui-redesign-planner {app} --source'],
	'skills/page-by-page/SKILL.md': ['ui-redesign-planner {app} --source'],
	'skills/refresh-project-artifacts/SKILL.md': ['testing-scenarios {app} --mode refresh'],
	'skills/review-or-create-doc/SKILL.md': ['Correct confirmed'],
	'skills/spernakit-dance/SKILL.md': [
		'spernakit-template-upgrade {app} --to v{templateVersion.to}',
		'accepts no app-list argument',
	],
	'skills/spernakit-template-refactor/SKILL.md': ['process-record guard', '`"passes": true`'],
	'skills/spernakit-tester/SKILL.md': ['## Dance handoff', '`baselineReportIds`'],
	'skills/testing-scenarios/SKILL.md': [
		'reviewed issue features',
		'newly created issue features',
	],
	'skills/ui-redesign-planner/SKILL.md': [
		'[--source <report-path>[,<report-path>...]]',
		'numeric `priority`',
	],
} as const;

const REQUIRED_SCREENSHOT_PATH_MARKERS = {
	'skills/frontend-design-sweep/SKILL.md': [
		'`{app}/.aidd/screenshots/{YYYYMMDD}{ID}/` (absolute)',
		'`-HHmmss-frontend-design-sweep-{MODE}`',
	],
	'skills/page-by-page/SKILL.md': [
		'`{app}/.aidd/screenshots/{YYYYMMDD}{ID}/` (absolute)',
		'`-HHmmss-page-by-page-{SLUG}`',
	],
	'skills/tester/SKILL.md': [
		'`{APP_DIR}/.aidd/screenshots/{YYYYMMDD}{ID}/` (absolute)',
		'`{SESSION}` = `HHmmss-tester`',
	],
} as const;

const FORBIDDEN_INTERACTIVE_SCREENSHOT_PATHS = [
	'{app}/screenshots/design-sweep/',
	'{app}/screenshots/page-by-page/',
	'{APP_DIR}/screenshots/tester/',
] as const;

const DECLARED_SKILL_CONTRACTS = {
	'changelog-rewrite': ['humanize-docs'],
	'codebase-analysis': ['humanize-docs'],
	'commit-archaeology': ['humanize-docs'],
	dependencies: ['humanize-docs'],
	'deployment-readiness': ['humanize-docs'],
	'devdiary-update': ['humanize-docs'],
	'diary-entry': ['humanize-docs'],
	'document-changes': ['humanize-docs'],
	'feature-coverage-audit': ['humanize-docs'],
	'feature-review': ['prompt-guidelines'],
	'feature-review-all': ['feature-review', 'prompt-guidelines'],
	'frontend-design-sweep': ['ui-redesign-planner'],
	hygiene: ['execute-audit'],
	'page-by-page': ['ui-redesign-planner'],
	rbac: ['humanize-docs'],
	'refresh-project-artifacts': [
		'review-or-create-doc',
		'update-roadmap',
		'update-screen-map',
		'testing-scenarios',
		'onboarding-interview',
		'feature-review',
		'bug2feature',
		'doc2feature',
		'deployment-readiness',
		'document-changes',
		'diary-entry',
		'execute-audit',
		'humanize-docs',
		'prompt-guidelines',
	],
	spec: ['humanize-docs', 'prompt-guidelines'],
	'spernakit-apply-ui': ['ui-parity'],
	'spernakit-bump': ['document-changes', 'humanize-docs'],
	'spernakit-dance': [
		'humanize-docs',
		'spernakit-bump',
		'spernakit-template-upgrade',
		'spernakit-template-refactor',
		'spernakit-diff-sync',
		'spernakit-tester',
		'bug2feature',
		'feature-review',
		'devdiary-update',
		'document-changes',
		'tester',
		'testing-scenarios',
		'prompt-guidelines',
	],
	'spernakit-tester': ['tester', 'testing-scenarios', 'bug2feature'],
	'spernakit-update-docs': ['humanize-docs'],
	tester: ['bug2feature', 'testing-scenarios'],
	'ui-playground-apply': ['ui-playground-sync'],
	'update-screen-map': ['humanize-docs'],
	'watermark-audit': ['execute-audit'],
};

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

async function bundledSkillDefinitions(): Promise<Map<string, SkillDefinition>> {
	const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
	const definitions = new Map<string, SkillDefinition>();
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const sourcePath = join(SKILLS_DIR, entry.name, 'SKILL.md');
		const body = await readFile(sourcePath, 'utf8');
		definitions.set(
			entry.name,
			parseSkillDefinition({
				body,
				id: entry.name,
				origin: 'bundled',
				sourcePath,
			}),
		);
	}
	return definitions;
}

describe('bundled skill current-contract guidance', () => {
	test('omits stale runtime, provenance, and workspace-example markers', async () => {
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

	test('declares no read-only boundary of its own, leaving that to execution intent', async () => {
		const offenders: string[] = [];
		for (const path of await collectFiles(SKILLS_DIR)) {
			const body = (await readFile(path, 'utf8')).toLowerCase();
			for (const marker of FORBIDDEN_INTENT_BOUNDARY_MARKERS) {
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

	test('retains aligned producer-to-consumer handoff contracts', async () => {
		for (const [path, markers] of Object.entries(REQUIRED_HANDOFF_MARKERS)) {
			const body = await readFile(join(ROOT, path), 'utf8');
			for (const marker of markers) expect(body).toContain(marker);
		}
	});

	test('keeps skill-controlled screenshot evidence under the generated aidd artifact', async () => {
		for (const [path, markers] of Object.entries(REQUIRED_SCREENSHOT_PATH_MARKERS)) {
			const body = await readFile(join(ROOT, path), 'utf8');
			for (const marker of markers) expect(body).toContain(marker);
		}

		const wrapper = await readFile(join(ROOT, 'skills/spernakit-tester/SKILL.md'), 'utf8');
		expect(wrapper).toMatch(/Everything\s+else in `tester` applies unchanged\./);
		expect(wrapper).not.toContain('### Evidence directory');

		const offenders: string[] = [];
		for (const path of await collectFiles(SKILLS_DIR)) {
			const body = await readFile(path, 'utf8');
			for (const marker of FORBIDDEN_INTERACTIVE_SCREENSHOT_PATHS) {
				if (body.includes(marker)) {
					offenders.push(`${relative(ROOT, path).replaceAll('\\', '/')} -> ${marker}`);
				}
			}
		}
		expect(offenders).toEqual([]);

		const releaseSkill = await readFile(join(ROOT, 'skills/spernakit-bump/SKILL.md'), 'utf8');
		expect(releaseSkill).toContain('`screenshots/v<new>/`');
	});

	test('declared skill contracts exist and flatten transitive staging dependencies', async () => {
		const definitions = await bundledSkillDefinitions();
		const declared = Object.fromEntries(
			[...definitions.values()]
				.filter((definition) => definition.contracts !== undefined)
				.map((definition) => [definition.id, definition.contracts]),
		);
		expect(declared).toEqual(DECLARED_SKILL_CONTRACTS);

		for (const definition of definitions.values()) {
			for (const contractId of definition.contracts ?? []) {
				const contract = definitions.get(contractId);
				expect(
					contract,
					`${definition.id} references missing contract ${contractId}`,
				).toBeDefined();
				if (!contract) continue;

				for (const transitiveId of contract.contracts ?? []) {
					expect(
						definition.contracts ?? [],
						`${definition.id} must stage ${contractId}'s contract ${transitiveId}`,
					).toContain(transitiveId);
				}
				for (const reference of contract.references ?? []) {
					expect(
						definition.references ?? [],
						`${definition.id} must stage ${contractId}'s aidd reference ${reference}`,
					).toContain(reference);
				}
				for (const reference of contract.spernakitReferences ?? []) {
					expect(
						definition.spernakitReferences ?? [],
						`${definition.id} must stage ${contractId}'s Spernakit reference ${reference}`,
					).toContain(reference);
				}
			}
		}
	});

	test('never shows feature notes as a bare JSON string', async () => {
		const offenders: string[] = [];
		for (const path of await collectFiles(SKILLS_DIR)) {
			const body = await readFile(path, 'utf8');
			if (FORBIDDEN_FEATURE_NOTE_SHAPE.test(body)) {
				offenders.push(relative(ROOT, path).replaceAll('\\', '/'));
			}
		}
		expect(offenders).toEqual([]);
	});

	test('feature JSON examples keep status, passes, and completion evidence aligned', async () => {
		const offenders: string[] = [];
		for (const path of await collectFiles(SKILLS_DIR)) {
			const body = await readFile(path, 'utf8');
			for (const match of body.matchAll(FENCED_JSON_BLOCK)) {
				const block = match.groups?.body ?? '';
				if (block.includes('"status"') && !block.includes('"passes"')) {
					offenders.push(
						`${relative(ROOT, path).replaceAll('\\', '/')} -> missing passes`,
					);
				}
				if (block.includes('"status": "completed"') && block.includes('"passes": true')) {
					if (!block.includes('"affectedFiles"')) {
						offenders.push(
							`${relative(ROOT, path).replaceAll('\\', '/')} -> missing affectedFiles`,
						);
					}
					if (!block.includes('"notes"')) {
						offenders.push(
							`${relative(ROOT, path).replaceAll('\\', '/')} -> missing notes`,
						);
					}
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	test('feature metadata writers preserve string notes and emit arrays', async () => {
		for (const path of FEATURE_NOTE_APPEND_FILES) {
			const body = await readFile(join(ROOT, path), 'utf8');
			expect(body).toContain('[existingString]');
		}
	});

	test('numbered spec writers continue the final block instead of the global maximum', async () => {
		for (const path of NUMBERED_SPEC_APPEND_FILES) {
			const body = (await readFile(join(ROOT, path), 'utf8')).toLowerCase();
			expect(body).toContain('global maximum');
		}
	});
});
