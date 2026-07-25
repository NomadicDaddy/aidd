import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'aidd-shared/args/index';
import type { ResolvedConfig } from 'aidd-shared/config';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { compilePrompt } from '../../cli/src/prompts/compile.ts';

import { testTempDir } from '../_helpers/temp.ts';
const rootDir = join(import.meta.dir, '..', '..');
const config: ResolvedConfig = {
	cli: 'native',
	reasoningEffort: 'low',
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 10,
	timeoutSeconds: 3600,
	preflightDoctor: false,
	idleTimeoutSeconds: 900,
	idleNudgeTimeoutSeconds: 600,
	dirtyTreeThreshold: 50,
	noWorkBackoffMs: 30_000,
	noClean: false,
	quitOnAbort: 0,
	rateLimitBufferSeconds: 60,
	rateLimitBackoffSeconds: 300,
};

async function file(path: string): Promise<string> {
	return await readFile(join(rootDir, path), 'utf8');
}

function plan(argv: string[]) {
	return resolveRunPlan(parseArgs(argv), config).prompt;
}

function onboardingPlan() {
	// Initial phase detection swaps coding to onboarding at runtime, so force that fragment here.
	const promptPlan = plan(['--project-dir', '.', '--cli', 'native']);
	promptPlan.phase = 'onboarding';
	promptPlan.fragments = promptPlan.fragments.map((fragment) =>
		fragment.kind === 'phase'
			? { ...fragment, id: 'onboarding', path: 'prompts/onboarding.md' }
			: fragment,
	);
	return promptPlan;
}

function expectOrdered(text: string, fragments: string[]): void {
	let cursor = -1;
	for (const fragment of fragments) {
		const index = text.indexOf(fragment);
		expect(index).toBeGreaterThan(cursor);
		cursor = index;
	}
}

describe('prompt compiler', () => {
	test('prepends CLI prompt before the mode prompt', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
		});
		expectOrdered(compiled.text, [
			'## HARD CONSTRAINTS',
			'## FORBIDDEN COMMANDS',
			await file('prompts/_cli/native.md'),
			await file('prompts/coding.md'),
		]);
	});

	test('injects the app URL so the agent reuses the running instance', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
			appUrl: 'http://127.0.0.1:3210',
		});
		expect(compiled.text).toContain('## Run launch context');
		expect(compiled.text).toContain('http://127.0.0.1:3210');
		expect(compiled.text).toContain('Do **not** probe other ports');
	});

	// The block is sent to any project whose address is known, not just the aidd panel, so it must
	// not instruct a foreign project to run aidd's own scripts.
	test('launch context names no aidd-specific commands', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
			appUrl: 'http://localhost:3330',
		});
		const launchContext = compiled.text.slice(compiled.text.indexOf('## Run launch context'));
		expect(launchContext).not.toContain('bun run start:web');
		expect(launchContext).not.toContain('bun run smoke:qc');
		expect(launchContext).not.toContain('--check-features');
	});

	// The browser-verification steps are written against an `<app-url>` placeholder that nothing
	// substituted, so agents read it literally and guessed framework defaults instead.
	test('substitutes the <app-url> placeholder when the address is known', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
			appUrl: 'http://localhost:3330',
		});
		expect(compiled.text).toContain('agent-browser open http://localhost:3330');
		expect(compiled.text).not.toContain('<app-url>');
	});

	test('leaves the <app-url> placeholder intact when the address is unknown', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
		});
		// Asserting a port we never established would be worse than admitting we do not know it.
		expect(compiled.text).toContain('<app-url>');
	});

	test('appends a carryover nudge note when one is supplied', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
			carryoverNote: 'PREVIOUS-ATTEMPT-NUDGE-MARKER',
		});
		expect(compiled.text).toContain('PREVIOUS-ATTEMPT-NUDGE-MARKER');
	});

	test('omits launch context when no app URL or carryover note is given', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
		});
		expect(compiled.text).not.toContain('## Run launch context');
	});

	test('onboarding prompt requires feature coverage audit for existing codebases', async () => {
		const compiled = await compilePrompt(onboardingPlan(), { rootDir });

		expect(compiled.text).toContain('MUST perform the feature coverage audit');
		expect(compiled.text).toContain('feature-coverage-audit <project-root> --apply');
		expect(compiled.text).toContain('coverage matrix as the source of truth');
		expect(compiled.text).toContain('Feature coverage audit performed');
		expect(compiled.text).toContain('feature-coverage-audit report');
		expect(compiled.text).toContain('report path or coverage summary');
	});

	test('applies feature filter before CLI prompt', async () => {
		const compiled = await compilePrompt(
			plan([
				'--project-dir',
				'.',
				'--cli',
				'native',
				'--filter-by',
				'category',
				'--filter',
				'Backend',
			]),
			{ rootDir },
		);
		expectOrdered(compiled.text, [
			'## HARD CONSTRAINTS',
			'## FORBIDDEN COMMANDS',
			await file('prompts/_cli/native.md'),
		]);
		expect(compiled.text).toContain(
			'## FEATURE FILTER (applied via --filter-by category --filter Backend)',
		);
		const codingIndex = compiled.text.indexOf(await file('prompts/coding.md'));
		const contractIndex = compiled.text.indexOf('## aidd V2 RESULT CONTRACT');
		expect(codingIndex).toBeGreaterThan(0);
		expect(contractIndex).toBeGreaterThan(codingIndex);
	});

	test('does not inject runtime context unless requested', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
		});
		expect(compiled.text).not.toContain('AIDD_V2_RUNTIME_CONTEXT');

		const withContext = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
			includeRuntimeContext: true,
		});
		expect(withContext.text).toContain('AIDD_V2_RUNTIME_CONTEXT');
	});

	test('adds coding result contract for feature completion marker', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
		});
		expect(compiled.text).toContain('## aidd V2 RESULT CONTRACT');
		expect(compiled.text).toContain(
			'AIDD_RESULT: {"featureId":"<selected-feature-id>","status":"completed","passes":true}',
		);
		expect(compiled.text).toContain(
			'feature.json must include a short non-empty notes resolution',
		);
		expect(compiled.text).toContain('commit every non-ignored code/configuration change');
		expect(compiled.text).toContain('Never force-add ignored `.aidd/` metadata');
		expect(compiled.text).toContain(
			'ignored metadata may remain local and does not block AIDD_RESULT',
		);
		expect(compiled.text).toContain('### aidd METADATA GIT POLICY');
		expect(compiled.text).toContain('Live-verification gate');
		expect(compiled.text).toContain('"could not verify" means NOT done');
		expect(compiled.text).toContain(
			'do not satisfy a criterion that requires driving the runtime surface',
		);
		expect(compiled.text).toContain('parks the feature as waiting_approval');
	});

	test('coding prompt requires verification to drive the shipped compile/render/serve layer', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
		});
		expect(compiled.text).toContain('Shallow verification ⇒ not verified');
		expect(compiled.text).toContain('Gap heuristic — apply before claiming `passes: true`');
		expect(compiled.text).toContain('Server-side templates');
		expect(compiled.text).toContain('SSR/JSX/components');
		expect(compiled.text).toContain('String-built HTML/markup');
		expect(compiled.text).toContain('SQL/query builders and serializers');
		expect(compiled.text).toContain('do not invent a runtime surface where none exists');
	});

	test('coding result contract ignores prioritized work and stays feature-backed', async () => {
		const promptPlan = plan(['--project-dir', '.', '--cli', 'native']);
		promptPlan.variables.prioritizedWork = [
			{
				featureId: 'audit-security-100-existing',
				id: 'audit-security-100-existing',
				priority: 2,
				rank: 1,
				reason: 'Audit backlog item.',
				taskType: 'audit_backlog',
				title: 'Security finding',
			},
		];
		const compiled = await compilePrompt(promptPlan, { rootDir });

		expect(compiled.text).not.toContain('This run has no pre-selected feature');
		expect(compiled.text).not.toContain('prioritizedWork');
		expect(compiled.text).not.toContain('workId');
		expect(compiled.text).toContain(
			'AIDD_RESULT: {"featureId":"<selected-feature-id>","status":"completed","passes":true}',
		);
	});

	test('adds todo result contract only for todo mode', async () => {
		const compiled = await compilePrompt(
			plan(['--project-dir', '.', '--cli', 'native', '--todo']),
			{
				rootDir,
			},
		);
		expect(compiled.text).toContain('AIDD_RESULT: {"todoCompleted":true}');
	});

	test('substitutes director paths using bash-style path normalization', async () => {
		const directorPlan = plan([
			'--director',
			'--fleet-summary',
			'D:\\applications\\fleet.json',
			'--director-output',
			'D:\\applications\\out.json',
			'--cli',
			'native',
		]);
		const compiled = await compilePrompt(directorPlan, { rootDir });
		const expectedPrefix = existsSync('/mnt/c') ? '/mnt/d' : '/d';
		expect(compiled.text).toContain(`${expectedPrefix}/applications/fleet.json`);
		expect(compiled.text).toContain(`${expectedPrefix}/applications/out.json`);
		expect(compiled.text).not.toContain('{{FLEET_SUMMARY_PATH}}');
		expect(compiled.text).not.toContain('{{DIRECTOR_OUTPUT_PATH}}');
		expect(compiled.text).toContain('aidd V2 RESULT CONTRACT');
		expect(compiled.text).toContain('"directorOutputWritten":true');
	});

	test('adds optional director context section when a context path is provided', async () => {
		const directorPlan = plan([
			'--director',
			'--fleet-summary',
			'D:\\applications\\fleet.json',
			'--director-output',
			'D:\\applications\\out.json',
			'--director-context',
			'D:\\applications\\context.json',
			'--cli',
			'native',
		]);
		const compiled = await compilePrompt(directorPlan, { rootDir });
		const expectedPrefix = existsSync('/mnt/c') ? '/mnt/d' : '/d';
		expect(compiled.text).toContain('## DIRECTOR CONVERSATION CONTEXT');
		expect(compiled.text).toContain(`${expectedPrefix}/applications/context.json`);
		expect(compiled.text).not.toContain('{{DIRECTOR_CONTEXT_SECTION}}');
	});

	test('generates interview prompt body with response path', async () => {
		const interviewPlan = plan(['--project-dir', '.', '--cli', 'native', '--interview']);
		interviewPlan.variables.interviewQuestionText = 'What does this repo do?';
		interviewPlan.variables.metadataDir = '.aidd';
		const compiled = await compilePrompt(interviewPlan, { rootDir });
		expect(compiled.text).toContain('## YOUR ROLE - INTERVIEW MODE (Codebase Q&A)');
		expect(compiled.text).toContain('What does this repo do?');
		expect(compiled.text).toContain('`.aidd/responses/response1.md`');
	});

	test('mutation directive prompt keeps changelog and commit instructions', async () => {
		const compiled = await compilePrompt(
			plan(['--project-dir', '.', '--cli', 'native', '--prompt', 'Add a logger helper.']),
			{ rootDir },
		);
		expect(compiled.text).toContain('## YOUR ROLE - CUSTOM DIRECTIVE MODE (MUTATION)');
		expect(compiled.text).toContain('Add a logger helper.');
		expect(compiled.text).toContain('Document your work in .aidd/CHANGELOG.md');
		expect(compiled.text).toContain('Commit non-ignored changes with descriptive messages');
		expect(compiled.text).not.toContain('Do NOT write to .aidd/CHANGELOG.md');
		expect(compiled.text).not.toContain('Do NOT create commits');
		// Directive mode carries a completion marker so a run that emits it is not classified as
		// missing_aidd_result; the mutation variant ties it to committing.
		expect(compiled.text).toContain('AIDD_RESULT: {"directiveCompleted":true}');
		expect(compiled.text).toContain('commit every non-ignored change');
	});

	test('read-only directive prompt strips changelog and commit instructions', async () => {
		const compiled = await compilePrompt(
			plan([
				'--project-dir',
				'.',
				'--cli',
				'native',
				'--prompt',
				'Review the auth service for issues.',
				'--directive-readonly',
			]),
			{ rootDir },
		);
		expect(compiled.text).toContain('## YOUR ROLE - CUSTOM DIRECTIVE MODE (READ-ONLY)');
		expect(compiled.text).toContain('Review the auth service for issues.');
		expect(compiled.text).toContain(
			'Do NOT modify any code, configuration, or assets in the repository',
		);
		expect(compiled.text).toContain('Do NOT write to .aidd/CHANGELOG.md');
		expect(compiled.text).toContain('Do NOT create commits, amend history');
		expect(compiled.text).not.toContain('Document your work in .aidd/CHANGELOG.md');
		expect(compiled.text).not.toContain('Commit your changes with descriptive messages');
		// A read-only directive can now signal completion without committing: emit the marker after
		// delivering the review. This is what lets a clean/no-op review avoid missing_aidd_result.
		expect(compiled.text).toContain('AIDD_RESULT: {"directiveCompleted":true}');
		expect(compiled.text).toContain('the marker alone signals completion');
	});

	test('generates audit prompt with audit id convention and audit body', async () => {
		const auditPlan = plan(['--project-dir', '.', '--cli', 'native', '--audit', 'SECURITY']);
		const compiled = await compilePrompt(auditPlan, { rootDir });
		expect(compiled.text).toContain('## YOUR ROLE - AUDIT AGENT');
		expect(compiled.text).toContain('audit-security-{unix_timestamp}-{descriptive-slug}');
		expect(compiled.text).toContain('"auditSource": "SECURITY"');
		expect(compiled.text).toContain('## AUDIT GUIDELINES');
		expect(compiled.text).toContain(
			'Do NOT create, edit, stage, or commit `feature.json` files directly',
		);
		expect(compiled.text).toContain(
			'aidd converts each accepted structured finding into a `feature.json` file',
		);
		expect(compiled.text).not.toContain('git commit -m "audit(');
	});

	test('generates batched audit prompt with all selected definitions and result contract', async () => {
		const auditPlan = plan([
			'--project-dir',
			'.',
			'--cli',
			'native',
			'--audit',
			'SECURITY,FEATURE_INTEGRATION',
		]);
		auditPlan.variables.auditName = 'SECURITY';
		auditPlan.variables.auditNames = ['SECURITY', 'FEATURE_INTEGRATION'];
		auditPlan.variables.auditBatchMode = true;

		const compiled = await compilePrompt(auditPlan, { rootDir });

		expect(compiled.text).toContain('### MULTI-AUDIT PARALLELIZATION');
		expect(compiled.text).toContain('Use parallel subagents or delegated workers');
		expect(compiled.text).toContain('## SELECTED AUDIT 1: SECURITY');
		expect(compiled.text).toContain('## SELECTED AUDIT 2: FEATURE_INTEGRATION');
		expect(compiled.text).toContain('"auditReports"');
		expect(compiled.text).toContain('Return exactly one `auditReports[]` entry');
	});
});

// The feature.json write matrix is split three ways — the selected feature, source features
// amended to close the audit feedback loop, and template-owned features that must be escalated
// upstream. Snapshot tests only prove the compiled prompt matches its source, so a rule that
// contradicts the result contract or the feature validator passes them unnoticed: the coding
// prompt once allowed only passes/status on the selected feature while the result contract and
// validateFeatureContract both demanded a notes resolution, leaving audit findings unable to
// complete without violating one of the two. These assert the matrix semantically.
describe('prompt compiler — feature.json write matrix', () => {
	// Prettier re-wraps prompts/*.md at 100 chars on every edit, so a phrase that fits on one line
	// today may straddle a newline tomorrow. Collapse whitespace so these assertions test wording
	// rather than line breaks.
	const compileCoding = async () => {
		const { text } = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
		});
		return text.replace(/\s+/g, ' ');
	};

	test('selected feature permits exactly passes, status, and notes', async () => {
		const text = await compileCoding();
		expect(text).toContain('you may change `passes`, `status`, and `notes`');
		expect(text).toContain('Never edit your own `spec`');
		expect(text).toContain("Edit your own feature's `spec` or acceptance criteria");
	});

	test('selected-feature writes satisfy the result contract resolution-note requirement', async () => {
		const text = await compileCoding();
		// The result contract and validateFeatureContract reject a completed audit/remediation
		// feature whose notes lack a resolution. If the contract demands it, the write matrix must
		// permit writing it on the selected feature — this is the pairing that previously broke.
		const contractRequiresNotes = text.includes(
			'feature.json must include a short non-empty notes resolution',
		);
		expect(contractRequiresNotes).toBe(true);
		expect(text).toContain('`notes` is required, not optional');
		expect(text).toMatch(/you may change `passes`, `status`, and `notes`/);
	});

	test('source features are writable for the audit feedback loop', async () => {
		const text = await compileCoding();
		expect(text).toContain('you MUST close the audit feedback loop');
		expect(text).toContain('IMPORTANT: After resolving this finding');
		expect(text).toContain('amendments are additive only');
		expect(text).toContain('**append only**');
	});

	test('template-owned source features route upstream instead of being written', async () => {
		const text = await compileCoding();
		expect(text).toContain('Template-owned source features are the one exception');
		expect(text).toContain('Upstream template alignment required');
		expect(text).toContain(
			'Write to any feature carrying `spernakit_version` — template-owned, escalate upstream instead',
		);
	});

	test('an unclosed feedback loop parks rather than completing silently', async () => {
		const text = await compileCoding();
		expect(text).toContain('an unclosed feedback loop is a blocker, and blockers park');
		expect(text).toContain('every source feature is template-owned');
		expect(text).toContain('do NOT bury the omission in a notes');
	});

	test('other features keep their id, passes, and status protected', async () => {
		const text = await compileCoding();
		expect(text).toContain(
			'Change `id`, `passes`, or `status` on any feature other than the one you are implementing',
		);
		expect(text).toContain('Remove or reorder existing `dependencies` entries');
	});
});

describe('prompt compiler — project context injection', () => {
	let projectDir: string;

	beforeAll(async () => {
		projectDir = await testTempDir('aidd-prompt-context-');
		await mkdir(join(projectDir, '.aidd', 'audit-reports'), { recursive: true });
		await mkdir(join(projectDir, '.aidd', 'reports'), { recursive: true });
		await writeFile(
			join(projectDir, '.aidd', 'CHANGELOG.md'),
			'## [2026-05-28] - Fixture changelog entry\n\n### Changed\n\n- Demo bullet point for fixture verification\n',
			'utf8',
		);
		await writeFile(
			join(projectDir, '.aidd', 'audit-reports', 'SECURITY-2026-05-28.md'),
			'# SECURITY Audit Report - 2026-05-28\n\n## Executive Summary\n\n**Overall Score:** 92/100\n**Critical Issues:** 0\nSecurity fixture summary text for prior-context verification.\n',
			'utf8',
		);
		await writeFile(
			join(projectDir, '.aidd', 'audit-reports', 'HYGIENE-2026-05-28.md'),
			'# HYGIENE Audit Report - 2026-05-28\n\n## Executive Summary\n\nHygiene fixture summary text for prior-context verification.\n',
			'utf8',
		);
		await writeFile(
			join(projectDir, '.aidd', 'reports', 'session-2026-05-28.md'),
			'# Session report fixture title\n\nSession body for fixture verification.\n',
			'utf8',
		);
	});

	afterAll(async () => {
		await rm(projectDir, { recursive: true, force: true });
	});

	test('coding mode injects CHANGELOG and session reports but not audit-report groups', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
			projectDir,
		});

		expect(compiled.text).toContain('## PRIOR CONTEXT (auto-loaded by aidd)');
		expect(compiled.text).toContain('#### Recent project changelog');
		expect(compiled.text).toContain('Fixture changelog entry');
		expect(compiled.text).toContain('#### Recent session reports');
		expect(compiled.text).toContain('session-2026-05-28.md');
		expect(compiled.text).toContain('Session report fixture title');
		expect(compiled.text).not.toContain('Prior `SECURITY` audit reports');
		expect(compiled.text).not.toContain('Prior `HYGIENE` audit reports');
	});

	test('coding mode places PRIOR CONTEXT above the coding-mode base prompt', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
			projectDir,
		});
		expectOrdered(compiled.text, [
			'## PRIOR CONTEXT (auto-loaded by aidd)',
			'Fixture changelog entry',
			'## YOUR ROLE - CODING AGENT',
		]);
	});

	test('audit mode emits one report group per selected audit', async () => {
		const auditPlan = plan([
			'--project-dir',
			'.',
			'--cli',
			'native',
			'--audit',
			'SECURITY,HYGIENE',
		]);
		const compiled = await compilePrompt(auditPlan, { rootDir, projectDir });

		expect(compiled.text).toContain('### PRIOR CONTEXT (auto-loaded by aidd)');
		expect(compiled.text).toContain('#### Prior `SECURITY` audit reports');
		expect(compiled.text).toContain('#### Prior `HYGIENE` audit reports');
		expect(compiled.text).toContain('.aidd/audit-reports/SECURITY-2026-05-28.md');
		expect(compiled.text).toContain('.aidd/audit-reports/HYGIENE-2026-05-28.md');
		expect(compiled.text).toContain('Security fixture summary text');
		expect(compiled.text).toContain('Hygiene fixture summary text');

		const securityIdx = compiled.text.indexOf('Prior `SECURITY` audit reports');
		const hygieneIdx = compiled.text.indexOf('Prior `HYGIENE` audit reports');
		const securityFileIdx = compiled.text.indexOf('SECURITY-2026-05-28.md');
		const hygieneFileIdx = compiled.text.indexOf('HYGIENE-2026-05-28.md');
		expect(securityIdx).toBeLessThan(securityFileIdx);
		expect(securityFileIdx).toBeLessThan(hygieneIdx);
		expect(hygieneIdx).toBeLessThan(hygieneFileIdx);
	});

	test('audit mode with a single audit excludes other audits from the report group list', async () => {
		const auditPlan = plan(['--project-dir', '.', '--cli', 'native', '--audit', 'SECURITY']);
		const compiled = await compilePrompt(auditPlan, { rootDir, projectDir });

		expect(compiled.text).toContain('#### Prior `SECURITY` audit reports');
		expect(compiled.text).not.toContain('#### Prior `HYGIENE` audit reports');
	});

	test('audit mode reports an empty-group fallback when no prior reports match', async () => {
		const empty = await testTempDir('aidd-prompt-context-empty-');
		try {
			const auditPlan = plan([
				'--project-dir',
				'.',
				'--cli',
				'native',
				'--audit',
				'SECURITY',
			]);
			const compiled = await compilePrompt(auditPlan, { rootDir, projectDir: empty });
			expect(compiled.text).toContain('### PRIOR CONTEXT (auto-loaded by aidd)');
			expect(compiled.text).toContain('No prior reports found for the selected audit(s).');
		} finally {
			await rm(empty, { recursive: true, force: true });
		}
	});

	test('CONTEXT.md presence at project root is surfaced in the prior-context block', async () => {
		const contextProject = await testTempDir('aidd-prompt-context-md-');
		try {
			await writeFile(
				join(contextProject, 'CONTEXT.md'),
				'# Domain context fixture\n\nGlossary body.\n',
				'utf8',
			);
			const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
				rootDir,
				projectDir: contextProject,
			});
			expect(compiled.text).toContain('#### Domain context file');
			expect(compiled.text).toContain('`CONTEXT.md` is present at the project root');
		} finally {
			await rm(contextProject, { recursive: true, force: true });
		}
	});

	test('CONTEXT.md absence is reported as missing in the prior-context block', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
			projectDir,
		});
		expect(compiled.text).toContain('#### Domain context file');
		expect(compiled.text).toContain('No `CONTEXT.md` at project root');
	});

	test('includeProjectContext: false suppresses the coding-mode PRIOR CONTEXT block', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
			projectDir,
			includeProjectContext: false,
		});
		expect(compiled.text).not.toContain('PRIOR CONTEXT (auto-loaded by aidd)');
		expect(compiled.text).not.toContain('Fixture changelog entry');
		expect(compiled.text).not.toContain('#### Domain context file');
	});

	test('includeProjectContext: false suppresses the audit-mode PRIOR CONTEXT block', async () => {
		const auditPlan = plan(['--project-dir', '.', '--cli', 'native', '--audit', 'SECURITY']);
		const compiled = await compilePrompt(auditPlan, {
			rootDir,
			projectDir,
			includeProjectContext: false,
		});
		expect(compiled.text).not.toContain('PRIOR CONTEXT (auto-loaded by aidd)');
		expect(compiled.text).not.toContain('Prior `SECURITY` audit reports');
		expect(compiled.text).not.toContain('Security fixture summary text');
	});

	test('omitting projectDir suppresses the PRIOR CONTEXT block even when default-enabled', async () => {
		const compiled = await compilePrompt(plan(['--project-dir', '.', '--cli', 'native']), {
			rootDir,
		});
		expect(compiled.text).not.toContain('PRIOR CONTEXT (auto-loaded by aidd)');
	});
});
