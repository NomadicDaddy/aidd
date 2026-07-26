import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'aidd-shared/args/index';
import type { ResolvedConfig } from 'aidd-shared/config';
import {
	featureDependencyTopologySchema,
	featureNeighborhoodSchema,
} from 'aidd-shared/metadata/features';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { createModeHandler } from '../../cli/src/modes/factory.ts';
import { detectBlockedVerificationAdmission } from '../../cli/src/modes/coding/verification.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { initializeGitProject } from './_helpers/orchestrator-fixture.ts';

const rootDir = join(import.meta.dir, '..', '..', '.tmp-mode-tests');
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
	noWorkBackoffMs: 0,
	noClean: false,
	quitOnAbort: 0,
	rateLimitBufferSeconds: 60,
	rateLimitBackoffSeconds: 300,
};

async function makeProject(name: string): Promise<{ projectDir: string; store: FileAiddStore }> {
	const projectDir = join(rootDir, name);
	await mkdir(join(projectDir, '.aidd', 'features'), { recursive: true });
	return { projectDir, store: new FileAiddStore(projectDir) };
}

async function writeFullHardeningProfile(projectDir: string): Promise<void> {
	await writeFile(
		join(projectDir, '.aidd', 'project-profile.json'),
		`${JSON.stringify(
			{
				authMode: 'tenant_rbac',
				bucket: 'public_multi_tenant',
				criticality: 'business_critical',
				dataSensitivity: 'confidential',
				deployment: 'public_server',
				externalIntegrations: 'write_capable',
				source: 'explicit',
				updatedAt: '2026-05-16T00:00:00.000Z',
			},
			null,
			2,
		)}\n`,
	);
}

function plan(projectDir: string, args: string[] = []) {
	return resolveRunPlan(
		parseArgs(['--project-dir', projectDir, '--cli', 'native', ...args]),
		config,
	);
}

afterEach(async () => {
	await rm(rootDir, { recursive: true, force: true });
});

describe('mode handlers', () => {
	test('initializer stops at the blueprint boundary unless implementation was requested', async () => {
		for (const stopBeforeImplementation of [true, false]) {
			const { projectDir, store } = await makeProject(
				`initializer-boundary-${String(stopBeforeImplementation)}`,
			);
			await writeFile(join(projectDir, '.aidd', 'spec.md'), '# Spec\n');
			await writeFile(join(projectDir, '.aidd', 'CHANGELOG.md'), '# Changelog\n');
			await store.writeFeature({
				id: 'first-feature',
				passes: false,
				priority: 1,
				status: 'backlog',
			});
			await store.writeRoadmap({
				features: { 'first-feature': { milestone: 'MVP' } },
				milestones: { MVP: { priority: 1 } },
			});
			await initializeGitProject(projectDir);
			const runPlan = plan(
				projectDir,
				stopBeforeImplementation ? ['--stop-before-implementation'] : [],
			);
			runPlan.prompt.phase = 'initializer';
			runPlan.prompt.fragments = runPlan.prompt.fragments.map((fragment) =>
				fragment.kind === 'phase'
					? { id: 'initializer', kind: 'phase', path: 'prompts/initializer.md' }
					: fragment,
			);
			const mode = createModeHandler(runPlan);
			const result = await mode.processResult(
				{ projectDir, store },
				{
					events: [],
					exitCode: 0,
					filesModified: [],
					transcript: '',
				},
			);

			expect(result.complete).toBe(stopBeforeImplementation);
			expect(runPlan.prompt.phase).toBe(stopBeforeImplementation ? 'initializer' : 'coding');
		}
	});

	test('initializer does not cross the boundary for a partial blueprint', async () => {
		const { projectDir, store } = await makeProject('initializer-partial-blueprint');
		await writeFile(join(projectDir, '.aidd', 'spec.md'), '# Spec\n');
		await writeFile(join(projectDir, '.aidd', 'CHANGELOG.md'), '# Changelog\n');
		await store.writeFeature({
			id: 'first-feature',
			passes: false,
			priority: 1,
			status: 'backlog',
		});
		await initializeGitProject(projectDir);
		const runPlan = plan(projectDir, ['--stop-before-implementation']);
		runPlan.prompt.phase = 'initializer';
		const result = await createModeHandler(runPlan).processResult(
			{ projectDir, store },
			{ events: [], exitCode: 0, filesModified: [], transcript: '' },
		);

		expect(result.complete).toBe(false);
		expect(result.summary).toContain('roadmap.json must define an MVP milestone');
		expect(runPlan.prompt.phase).toBe('initializer');
	});

	test('onboarding completes at coding-ready without the blueprint gate', async () => {
		const { projectDir, store } = await makeProject('onboarding-completion');
		await writeFile(join(projectDir, '.aidd', 'spec.md'), '# Spec\n');
		await writeFile(join(projectDir, '.aidd', 'CHANGELOG.md'), '# Changelog\n');
		// Onboarding files features as waiting_approval with no MVP-backlog roadmap, a shape that
		// by design cannot satisfy the from-idea persisted-blueprint gate. It must still complete
		// once the project detects as coding — not wedge, loop, or emit a blueprint-readiness reason.
		await store.writeFeature({
			id: 'existing-feature',
			passes: false,
			priority: 1,
			status: 'waiting_approval',
		});
		const runPlan = plan(projectDir, []);
		runPlan.prompt.phase = 'onboarding';
		const result = await createModeHandler(runPlan).processResult(
			{ projectDir, store },
			{ events: [], exitCode: 0, filesModified: [], transcript: '' },
		);

		expect(result.complete).toBe(true);
		expect(result.summary).toContain('project is ready for coding');
		expect(runPlan.prompt.phase).toBe('onboarding');
	});

	test('coding mode preselects the highest-priority claimable feature', async () => {
		const { projectDir, store } = await makeProject('coding-selection');
		await store.writeFeature({
			id: 'feature-later',
			status: 'backlog',
			passes: false,
			priority: 4,
		});
		await store.writeFeature({
			id: 'feature-current',
			title: 'Current',
			status: 'in_progress',
			passes: false,
			priority: 9,
		});

		const work = await createModeHandler(plan(projectDir)).selectWork({ projectDir, store });
		expect(work.kind).toBe('feature');
		expect(work.id).toBe('feature-current');
		expect(work.description).toBe('Current');
	});

	test('coding mode auto-creates a single-milestone roadmap when none exists', async () => {
		const { projectDir, store } = await makeProject('coding-roadmap-autocreate');
		await store.writeFeature({
			id: 'feature-base',
			status: 'backlog',
			passes: false,
			priority: 2,
		});
		await store.writeFeature({
			id: 'feature-dependent',
			status: 'backlog',
			passes: false,
			priority: 1,
			dependencies: ['feature-base'],
		});

		const work = await createModeHandler(plan(projectDir)).selectWork({ projectDir, store });
		// A previously roadmap-less project is now gated rather than skipped: only the
		// dependency-satisfied feature is eligible...
		expect(work.kind).toBe('feature');
		expect(work.id).toBe('feature-base');
		// ...and a roadmap.json was synthesized so every later run reads a real gate.
		const roadmap = await store.readRoadmap();
		expect(Object.keys(roadmap.milestones)).toEqual(['v1.0']);
		expect(roadmap.features['feature-base']?.milestone).toBe('v1.0');
		expect(roadmap.features['feature-dependent']).toEqual({
			milestone: 'v1.0',
			dependencies: ['feature-base'],
		});
	});

	test('directive mode runs its prompt without claiming a backlog feature', async () => {
		const { projectDir, store } = await makeProject('directive-no-claim');
		await store.writeFeature({
			id: 'feature-claimable',
			title: 'Claimable',
			status: 'backlog',
			passes: false,
			priority: 9,
		});

		const directivePlan = plan(projectDir, [
			'--directive',
			'--prompt',
			'review audit findings',
		]);
		expect(directivePlan.mode).toBe('directive');
		const work = await createModeHandler(directivePlan).selectWork({ projectDir, store });
		// `generic` keeps the backend running (unlike `none`, which is skipped) while
		// leaving every feature untouched — the feature must stay in backlog.
		expect(work.kind).toBe('generic');
		expect(work.id).toBe('directive');
		const feature = await store.readFeature('feature-claimable');
		expect(feature.status).toBe('backlog');
	});

	test('a bare custom prompt resolves to directive mode (covers direct --skill)', async () => {
		const { projectDir, store } = await makeProject('directive-bare-prompt');
		await store.writeFeature({
			id: 'feature-claimable',
			title: 'Claimable',
			status: 'backlog',
			passes: false,
			priority: 9,
		});

		// app.ts compiles --skill into customPrompt without setting
		// --directive, so a bare --prompt must still resolve to directive mode.
		const promptPlan = plan(projectDir, ['--prompt', 'Create a session report.']);
		expect(promptPlan.mode).toBe('directive');
		const work = await createModeHandler(promptPlan).selectWork({ projectDir, store });
		expect(work.kind).toBe('generic');
		const feature = await store.readFeature('feature-claimable');
		expect(feature.status).toBe('backlog');
	});

	test('coding mode keeps explicit feature focus strict', async () => {
		const { projectDir, store } = await makeProject('coding-explicit-feature');
		await store.writeFeature({
			id: 'feature-later',
			status: 'backlog',
			passes: false,
			priority: 1,
		});
		await store.writeFeature({
			id: 'feature-current',
			title: 'Current',
			status: 'backlog',
			passes: false,
			priority: 9,
		});

		const work = await createModeHandler(
			plan(projectDir, ['--feature', 'feature-current']),
		).selectWork({ projectDir, store });
		expect(work.kind).toBe('feature');
		expect(work.id).toBe('feature-current');
		expect(work.description).toBe('Current');
	});

	test('coding mode limits automatic selection to the active roadmap milestone', async () => {
		const { projectDir, store } = await makeProject('coding-roadmap-active-milestone');
		await store.writeRoadmap({
			milestones: { MVP: {}, v1: {} },
			features: {
				'feature-mvp': { milestone: 'MVP' },
				'feature-v1': { milestone: 'v1' },
			},
		});
		await store.writeFeature({
			id: 'feature-v1',
			status: 'backlog',
			passes: false,
			priority: 1,
		});
		await store.writeFeature({
			id: 'feature-mvp',
			status: 'backlog',
			passes: false,
			priority: 9,
		});

		const work = await createModeHandler(plan(projectDir)).selectWork({ projectDir, store });

		expect(work.kind).toBe('feature');
		expect(work.id).toBe('feature-mvp');
	});

	test('coding mode excludes audit findings unless --audit-findings is set', async () => {
		const { projectDir, store } = await makeProject('coding-audit-findings-optin');
		await store.writeFeature({
			id: 'audit-security-1-missing-validation',
			title: 'Missing validation',
			status: 'backlog',
			passes: false,
			priority: 2,
			auditSource: 'SECURITY',
		});

		const defaultWork = await createModeHandler(plan(projectDir)).selectWork({
			projectDir,
			store,
		});
		expect(defaultWork.kind).toBe('none');

		const sweepWork = await createModeHandler(
			plan(projectDir, ['--audit-findings']),
		).selectWork({ projectDir, store });
		expect(sweepWork.kind).toBe('feature');
		expect(sweepWork.id).toBe('audit-security-1-missing-validation');
	});

	test('audit-findings sweep narrows to the requested source', async () => {
		const { projectDir, store } = await makeProject('coding-audit-findings-source');
		// LOGIC carries the higher severity (priority 1) so it would win an unnarrowed sweep;
		// scoping to SECURITY must pick the SECURITY finding instead, proving the source filter.
		await store.writeFeature({
			id: 'audit-logic-1-broken-branch',
			status: 'backlog',
			passes: false,
			priority: 1,
			auditSource: 'LOGIC',
		});
		await store.writeFeature({
			id: 'audit-security-1-open-redirect',
			status: 'backlog',
			passes: false,
			priority: 2,
			auditSource: 'SECURITY',
		});

		const work = await createModeHandler(
			plan(projectDir, ['--audit-findings', 'SECURITY']),
		).selectWork({ projectDir, store });
		expect(work.kind).toBe('feature');
		expect(work.id).toBe('audit-security-1-open-redirect');
	});

	test('coding mode advances roadmap milestones after earlier work passes', async () => {
		const { projectDir, store } = await makeProject('coding-roadmap-advance');
		await store.writeRoadmap({
			milestones: { MVP: {}, v1: {} },
			features: {
				'feature-mvp': { milestone: 'MVP' },
				'feature-v1': { milestone: 'v1' },
			},
		});
		await store.writeFeature({
			id: 'feature-mvp',
			status: 'completed',
			passes: true,
			priority: 1,
		});
		await store.writeFeature({
			id: 'feature-v1',
			status: 'backlog',
			passes: false,
			priority: 9,
		});
		// Post-MVP work is born waiting_approval (creation parking policy); a human approval
		// returns it to backlog, which is the state milestone advancement selects from.
		expect((await store.readFeature('feature-v1')).status).toBe('waiting_approval');
		await store.writeFeature({
			id: 'feature-v1',
			status: 'backlog',
			passes: false,
			priority: 9,
		});

		const work = await createModeHandler(plan(projectDir)).selectWork({ projectDir, store });

		expect(work.kind).toBe('feature');
		expect(work.id).toBe('feature-v1');
	});

	test('coding mode blocks when roadmap features are unmapped', async () => {
		const { projectDir, store } = await makeProject('coding-roadmap-unmapped');
		await store.writeRoadmap({
			milestones: { MVP: {} },
			features: {},
		});
		await store.writeFeature({
			id: 'feature-new',
			status: 'backlog',
			passes: false,
			priority: 1,
		});
		// writeFeature auto-assigns unmapped features; rewrite roadmap.json back to the
		// unmapped drift state so the coding-gate detection path is exercised.
		await writeFile(
			join(store.metadataDir, 'roadmap.json'),
			`${JSON.stringify({ milestones: { MVP: {} }, features: {} })}\n`,
		);

		const work = await createModeHandler(plan(projectDir)).selectWork({ projectDir, store });
		const data = work.data as { roadmapGate?: { unmappedFeatureDirectories?: string[] } };

		expect(work.kind).toBe('none');
		expect(work.description).toContain('Roadmap gate blocked coding');
		// The directory names must be in the description — a bare count gives the operator
		// nothing to fix.
		expect(work.description).toContain('feature-new');
		expect(data.roadmapGate?.unmappedFeatureDirectories).toEqual(['feature-new']);
	});

	test('coding mode blocks explicit features outside the active roadmap milestone', async () => {
		const { projectDir, store } = await makeProject('coding-roadmap-explicit-later');
		await store.writeRoadmap({
			milestones: { MVP: {}, v1: {} },
			features: {
				'feature-mvp': { milestone: 'MVP' },
				'feature-v1': { milestone: 'v1' },
			},
		});
		await store.writeFeature({
			id: 'feature-mvp',
			status: 'backlog',
			passes: false,
			priority: 9,
		});
		await store.writeFeature({
			id: 'feature-v1',
			status: 'backlog',
			passes: false,
			priority: 1,
		});

		const work = await createModeHandler(
			plan(projectDir, ['--feature', 'feature-v1']),
		).selectWork({ projectDir, store });

		expect(work.kind).toBe('none');
		expect(work.description).toContain('outside active milestone');
	});

	test('coding mode blocks explicit unmapped features', async () => {
		const { projectDir, store } = await makeProject('coding-roadmap-explicit-unmapped');
		await store.writeRoadmap({
			milestones: { MVP: {} },
			features: {},
		});
		await store.writeFeature({
			id: 'feature-new',
			status: 'backlog',
			passes: false,
			priority: 1,
		});
		// writeFeature auto-assigns unmapped features; rewrite roadmap.json back to the
		// unmapped drift state so the explicit-feature gate rejection is exercised.
		await writeFile(
			join(store.metadataDir, 'roadmap.json'),
			`${JSON.stringify({ milestones: { MVP: {} }, features: {} })}\n`,
		);

		const work = await createModeHandler(
			plan(projectDir, ['--feature', 'feature-new']),
		).selectWork({ projectDir, store });

		expect(work.kind).toBe('none');
		expect(work.description).toContain('missing roadmap milestone assignments');
	});

	test('coding mode ignores audit findings unless explicitly filtered', async () => {
		const { projectDir, store } = await makeProject('coding-audit-filter');
		await store.writeFeature({
			id: 'feature-core',
			title: 'Core',
			status: 'backlog',
			passes: false,
			priority: 1,
		});
		await store.writeFeature({
			id: 'audit-security-100-existing',
			title: 'Security finding',
			status: 'backlog',
			passes: false,
			priority: 2,
			auditSource: 'SECURITY',
		});

		const defaultWork = await createModeHandler(plan(projectDir)).selectWork({
			projectDir,
			store,
		});
		expect(defaultWork.kind).toBe('feature');
		expect(defaultWork.id).toBe('feature-core');

		const work = await createModeHandler(
			plan(projectDir, ['--filter-by', 'id', '--filter', 'audit-*']),
		).selectWork({ projectDir, store });

		expect(work.kind).toBe('feature');
		expect(work.id).toBe('audit-security-100-existing');
	});

	test('coding mode skips filtered audit features with unmet dependencies', async () => {
		const { projectDir, store } = await makeProject('coding-audit-filter-dependencies');
		await store.writeFeature({
			id: 'prompt-compilation',
			status: 'backlog',
			passes: false,
			priority: 1,
		});
		await store.writeFeature({
			id: 'audit-mode-processing',
			title: 'Audit Mode Processing',
			status: 'backlog',
			passes: false,
			priority: 1,
			dependencies: ['prompt-compilation'],
		});
		await store.writeFeature({
			id: 'audit-hygiene-100-ready',
			title: 'Ready audit finding',
			status: 'backlog',
			passes: false,
			priority: 2,
			auditSource: 'HYGIENE',
		});

		const work = await createModeHandler(
			plan(projectDir, ['--filter-by', 'id', '--filter', 'audit-*']),
		).selectWork({ projectDir, store });

		expect(work.kind).toBe('feature');
		expect(work.id).toBe('audit-hygiene-100-ready');
	});

	test('coding mode does not select synthetic artifact or audit maintenance', async () => {
		const { projectDir, store } = await makeProject('coding-ignores-maintenance');
		const specPath = join(projectDir, '.aidd', 'spec.md');
		await writeFile(specPath, '# Spec\n');
		const stale = new Date('2026-01-01T00:00:00.000Z');
		await utimes(specPath, stale, stale);
		await mkdir(join(projectDir, '.aidd', 'audits'), { recursive: true });
		await writeFile(join(projectDir, '.aidd', 'audits', 'SECURITY.md'), '# Security\n');
		await store.writeFeature({
			id: 'feature-core',
			title: 'Core feature',
			status: 'backlog',
			passes: false,
			priority: 1,
		});

		const work = await createModeHandler(plan(projectDir)).selectWork({ projectDir, store });

		expect(work.kind).toBe('feature');
		expect(work.id).toBe('feature-core');
	});

	test('coding mode reports no work when all features pass', async () => {
		const { projectDir, store } = await makeProject('coding-empty');
		await store.writeFeature({ id: 'feature-done', status: 'completed', passes: true });

		const work = await createModeHandler(plan(projectDir)).selectWork({ projectDir, store });
		expect(work.kind).toBe('none');
		expect(work.id).toBe('no-work');
	});

	test('coding mode ignores completion marker when feature metadata was not updated', async () => {
		const { projectDir, store } = await makeProject('coding-marker-ignored');
		await store.writeFeature({
			id: 'feature-core',
			status: 'backlog',
			passes: false,
			priority: 1,
		});
		const mode = createModeHandler(plan(projectDir));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: {
					id: 'feature-core',
					kind: 'feature',
					description: 'Feature Core',
				},
				structuredResult: {
					featureId: 'feature-core',
					status: 'completed',
					passes: true,
				},
			},
		);

		const feature = await store.readFeature('feature-core');
		expect(result.complete).toBe(false);
		expect(result.summary).toContain('completion marker ignored');
		expect(result.artifacts?.completedFeature).toBeNull();
		expect(result.artifacts?.completionMarkerIgnored).toContain('metadata');
		expect(feature.status).toBe('backlog');
		expect(feature.passes).toBe(false);
	});

	test('coding mode accepts completion marker when feature metadata is already complete', async () => {
		const { projectDir, store } = await makeProject('coding-marker-accepted');
		await store.writeFeature({
			id: 'feature-core',
			status: 'completed',
			passes: true,
			updatedAt: '2026-05-08T00:00:00.000Z',
		});
		const mode = createModeHandler(plan(projectDir));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: {
					id: 'feature-core',
					kind: 'feature',
					description: 'Feature Core',
				},
				structuredResult: {
					featureId: 'feature-core',
					status: 'completed',
					passes: true,
				},
			},
		);

		const feature = await store.readFeature('feature-core');
		expect(result.complete).toBe(true);
		expect(result.artifacts?.completedFeature).toBe('feature-core');
		expect(result.artifacts?.completionMarkerIgnored).toBeUndefined();
		expect(feature.updatedAt).toBe('2026-05-08T00:00:00.000Z');
	});

	test('coding mode accepts selected feature completion', async () => {
		const { projectDir, store } = await makeProject('coding-marker-selected-accepted');
		await store.writeFeature({
			id: 'feature-core',
			status: 'backlog',
			passes: false,
			priority: 1,
		});
		const mode = createModeHandler(plan(projectDir));
		const work = await mode.selectWork({ projectDir, store });
		await store.writeFeature({
			id: 'feature-core',
			status: 'completed',
			passes: true,
			updatedAt: '2026-05-08T00:00:00.000Z',
		});

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: work,
				structuredResult: {
					featureId: 'feature-core',
					status: 'completed',
					passes: true,
				},
			},
		);

		expect(work.kind).toBe('feature');
		expect(result.artifacts?.completedFeature).toBe('feature-core');
		expect(result.artifacts?.completionMarkerIgnored).toBeUndefined();
	});

	test('coding mode rejects completion outside selected feature', async () => {
		const { projectDir, store } = await makeProject('coding-marker-rejected');
		await store.writeFeature({
			id: 'feature-core',
			status: 'backlog',
			passes: false,
			priority: 1,
		});
		await store.writeFeature({
			id: 'feature-outside',
			status: 'completed',
			passes: true,
			priority: 2,
		});
		const mode = createModeHandler(
			plan(projectDir, ['--filter-by', 'id', '--filter', 'feature-core']),
		);
		const work = await mode.selectWork({ projectDir, store });

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: work,
				structuredResult: {
					featureId: 'feature-outside',
					status: 'completed',
					passes: true,
				},
			},
		);

		expect(result.artifacts?.completedFeature).toBeNull();
		expect(result.artifacts?.completionMarkerIgnored).toContain('selected feature');
	});

	test('coding mode parks completion claim that admits blocked live verification', async () => {
		const { projectDir, store } = await makeProject('coding-verification-blocked-park');
		await store.writeFeature({
			id: 'feature-live',
			status: 'completed',
			passes: true,
			priority: 1,
		});
		await store.writeFeature({
			id: 'feature-next',
			status: 'backlog',
			passes: false,
			priority: 2,
		});
		const mode = createModeHandler(plan(projectDir));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [
					{
						chunk: 'Implemented the accessibility pass and unit tests are green, but the panel was unreachable so browser verification could not be performed — manual browser verification is required.\nAIDD_RESULT: {"featureId":"feature-live","status":"completed","passes":true}',
						type: 'assistant_text',
					},
				],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: {
					id: 'feature-live',
					kind: 'feature',
					description: 'Live feature',
				},
				structuredResult: {
					featureId: 'feature-live',
					status: 'completed',
					passes: true,
				},
			},
		);

		const feature = await store.readFeature('feature-live');
		expect(result.complete).toBe(false);
		expect(result.artifacts?.completedFeature).toBeNull();
		expect(result.artifacts?.verificationBlockedParked).toBe('feature-live');
		expect(result.artifacts?.completionMarkerIgnored).toContain('blocked or skipped');
		expect(result.summary).toContain('completion marker ignored');
		expect(feature.status).toBe('waiting_approval');
		expect(feature.passes).toBe(false);
		expect(feature.blockingContext?.reason).toBe('verification_blocked_claimed_complete');
		expect(feature.blockingContext?.outputExcerpt).toContain('manual browser verification');
	});

	test('coding mode records an honest self-park when the agent emits no marker', async () => {
		const { projectDir, store } = await makeProject('coding-verification-self-park');
		// The agent invoked the STOP-AND-PARK hatch: it parked the feature itself and, per the
		// result contract, emitted no AIDD_RESULT. That must not read as a no-op iteration.
		await store.writeFeature({
			id: 'feature-live',
			status: 'waiting_approval',
			passes: false,
			priority: 1,
		});
		await store.writeFeature({
			id: 'feature-next',
			status: 'backlog',
			passes: false,
			priority: 2,
		});
		const mode = createModeHandler(plan(projectDir));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [
					{
						// Deliberately phrased the way a real park reads, matching none of the
						// dishonest-claim admission patterns — the status transition is the signal.
						chunk: 'Feature parked correctly: live CLS verification remains unavailable, so no speculative UI changes were made. bun run smoke:qc passed.',
						type: 'assistant_text',
					},
				],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: {
					data: { id: 'feature-live', status: 'in_progress' },
					id: 'feature-live',
					kind: 'feature',
					description: 'Live feature',
				},
			},
		);

		const feature = await store.readFeature('feature-live');
		expect(result.artifacts?.verificationBlockedParked).toBe('feature-live');
		expect(result.artifacts?.completedFeature).toBeNull();
		expect(result.summary).toContain('parked feature-live as waiting_approval');
		expect(feature.blockingContext?.reason).toBe('verification_blocked_self_parked');
		expect(feature.blockingContext?.outputExcerpt).toContain('remains unavailable');
	});

	// A re-park must describe itself, not the park before it. A real feature carried
	// "localhost:3000 refused the DevTools connection" into a later run that had actually reached
	// the app and parked for a completely different reason, leaving the decision queue showing a
	// wrong-port problem that no longer existed.
	test('coding mode refreshes a stale blockingContext on a fresh park', async () => {
		const { projectDir, store } = await makeProject('coding-repark');
		await store.writeFeature({
			id: 'feature-live',
			status: 'waiting_approval',
			passes: false,
			priority: 1,
			blockingContext: {
				commands: [],
				outcomeStatus: 'verification_blocked_self_parked',
				outputExcerpt: 'STALE: localhost:3000 refused the DevTools connection.',
				parkedAt: '2026-07-20T15:44:16.150Z',
				reason: 'verification_blocked_self_parked',
			},
		});
		const mode = createModeHandler(plan(projectDir));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [
					{
						chunk: 'CLS reproduced at 0.112 but the trace captured no LayoutShift event, so no component can be safely changed.',
						type: 'assistant_text',
					},
				],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: {
					data: { id: 'feature-live', status: 'backlog' },
					id: 'feature-live',
					kind: 'feature',
					description: 'Live feature',
				},
			},
		);

		const feature = await store.readFeature('feature-live');
		expect(result.artifacts?.verificationBlockedParked).toBe('feature-live');
		expect(feature.blockingContext?.outputExcerpt).toContain('no LayoutShift event');
		expect(feature.blockingContext?.outputExcerpt).not.toContain('STALE');
		expect(feature.blockingContext?.parkedAt).not.toBe('2026-07-20T15:44:16.150Z');
		// Parking the only eligible feature routes through the no-work branch, whose bare text
		// ("no approved incomplete feature work") reads as if the run found nothing to do.
		expect(result.summary).toContain('parked feature-live as waiting_approval');
	});

	// run_1784560908095_4a64746b: `--feature <id>` re-dispatched a feature the previous run had
	// already parked. Reading the end state alone called that a fresh park; only the transition
	// distinguishes "this iteration parked it" from "it arrived parked".
	test('coding mode does not call an already-parked feature a fresh park', async () => {
		const { projectDir, store } = await makeProject('coding-already-parked');
		await store.writeFeature({
			id: 'feature-live',
			status: 'waiting_approval',
			passes: false,
			priority: 1,
		});
		const mode = createModeHandler(plan(projectDir));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [
					{
						chunk: 'Feature parked correctly: live CLS verification remains unavailable.',
						type: 'assistant_text',
					},
				],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: {
					data: { id: 'feature-live', status: 'waiting_approval' },
					id: 'feature-live',
					kind: 'feature',
					description: 'Live feature',
				},
			},
		);

		const feature = await store.readFeature('feature-live');
		expect(result.artifacts?.verificationBlockedParked).toBeUndefined();
		expect(feature.blockingContext).toBeUndefined();
	});

	test('coding mode does not treat a no-op iteration as a self-park', async () => {
		const { projectDir, store } = await makeProject('coding-verification-no-op');
		// Same admission prose, but the agent never parked anything: the feature is untouched.
		// One signal alone must never qualify, or every stalled run would launder into a park.
		await store.writeFeature({
			id: 'feature-live',
			status: 'in_progress',
			passes: false,
			priority: 1,
		});
		const mode = createModeHandler(plan(projectDir));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [
					{
						chunk: 'The server was unreachable so the feature could not be verified.',
						type: 'assistant_text',
					},
				],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: {
					data: { id: 'feature-live', status: 'in_progress' },
					id: 'feature-live',
					kind: 'feature',
					description: 'Live feature',
				},
			},
		);

		const feature = await store.readFeature('feature-live');
		expect(result.artifacts?.verificationBlockedParked).toBeUndefined();
		expect(feature.status).toBe('in_progress');
		expect(feature.blockingContext).toBeUndefined();
	});

	test('coding mode accepts completion whose prose reports genuine live verification', async () => {
		const { projectDir, store } = await makeProject('coding-verification-genuine');
		await store.writeFeature({
			id: 'feature-live',
			status: 'completed',
			passes: true,
			priority: 1,
		});
		const mode = createModeHandler(plan(projectDir));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [
					{
						chunk: 'Verified in the browser with agent-browser: drove the full flow, console errors empty, screenshots captured. bun run smoke:qc passed.\nAIDD_RESULT: {"featureId":"feature-live","status":"completed","passes":true}',
						type: 'assistant_text',
					},
				],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: {
					id: 'feature-live',
					kind: 'feature',
					description: 'Live feature',
				},
				structuredResult: {
					featureId: 'feature-live',
					status: 'completed',
					passes: true,
				},
			},
		);

		const feature = await store.readFeature('feature-live');
		expect(result.artifacts?.completedFeature).toBe('feature-live');
		expect(result.artifacts?.verificationBlockedParked).toBeUndefined();
		expect(result.artifacts?.completionMarkerIgnored).toBeUndefined();
		expect(feature.status).toBe('completed');
		expect(feature.passes).toBe(true);
	});

	test('blocked-verification detector matches admissions and ignores genuine verification', () => {
		const admissions = [
			'The designated browser check was blocked by a startup wedge, so verification was blocked.',
			'bun run smoke:qc could not be run in-session; typecheck and lint pass individually.',
			'I was unable to verify the rendered page because the server would not boot.',
			'Skipping browser verification since agent-browser is unavailable in this environment.',
			'Manual browser verification is required: navigate to /projects and confirm the column.',
			'The endpoint cannot be verified against the running panel; it predates this route.',
		];
		for (const admission of admissions) {
			const detected = detectBlockedVerificationAdmission([
				{ chunk: admission, type: 'assistant_text' },
			]);
			expect(detected?.excerpt).toBe(admission);
		}

		const genuine = [
			'Verified in the browser: drove the flow end-to-end and the console is clean.',
			'Verification passed: agent-browser errors returned empty and smoke:qc is green.',
			'The Continue click and auto-chain paths are proven by backend tests; the frontend was verified live.',
			'Let me verify the build completes before committing.',
		];
		for (const prose of genuine) {
			expect(
				detectBlockedVerificationAdmission([{ chunk: prose, type: 'assistant_text' }]),
			).toBeUndefined();
		}

		expect(
			detectBlockedVerificationAdmission([
				{
					chunk: 'raw tool output: manual browser verification is required',
					stream: 'stdout',
					type: 'raw_log',
				},
			]),
		).toBeUndefined();
	});

	test('blocked-verification admission is superseded by tool work that follows it', () => {
		// A mid-run blocker the agent then worked through must not park the feature: only prose
		// after the final tool event is the agent's standing claim about verification.
		const workedThrough = [
			{
				chunk: 'The dev server is down, so verification was blocked.',
				type: 'assistant_text',
			},
			{ args: { command: 'bun run start' }, tool: 'bash', type: 'tool_call' },
			{ result: 'server listening on :3000', tool: 'bash', type: 'tool_result' },
			{
				chunk: 'Verified in the browser: the flow works end-to-end.',
				type: 'assistant_text',
			},
		] as const;
		expect(detectBlockedVerificationAdmission([...workedThrough])).toBeUndefined();

		// The same admission with no tool work after it is final and still parks.
		const finalAdmission = [
			{ args: { command: 'bun run start' }, tool: 'bash', type: 'tool_call' },
			{ result: 'EADDRINUSE', tool: 'bash', type: 'tool_result' },
			{
				chunk: 'The dev server is down, so verification was blocked.',
				type: 'assistant_text',
			},
		] as const;
		expect(detectBlockedVerificationAdmission([...finalAdmission])?.phrase).toBe(
			'verification was blocked',
		);
	});

	test('validate mode selects feature contract issues', async () => {
		const { projectDir, store } = await makeProject('validate');
		await store.writeFeature({ id: 'feature-bad', status: 'backlog', passes: true });

		const work = await createModeHandler(plan(projectDir, ['--validate'])).selectWork({
			projectDir,
			store,
		});
		expect(work.kind).toBe('validation');
		expect(work.description).toContain('1 feature contract issue');
	});

	test('todo mode selects first incomplete todo from .aidd/todo.md', async () => {
		const { projectDir, store } = await makeProject('todo');
		await writeFile(
			join(projectDir, '.aidd', 'todo.md'),
			'- [x] done\n- [ ] first\n- [ ] second\n',
		);

		const work = await createModeHandler(plan(projectDir, ['--todo'])).selectWork({
			projectDir,
			store,
		});
		expect(work.kind).toBe('todo');
		expect(work.description).toBe('first');
	});

	test('interview mode selects next unanswered heading question', async () => {
		const { projectDir, store } = await makeProject('interview-select');
		await writeFile(
			join(projectDir, '.aidd', 'questions.md'),
			'## First question?\nDetails one.\n\n## Second question?\nDetails two.\n',
		);
		await mkdir(join(projectDir, '.aidd', 'responses'), { recursive: true });
		await writeFile(join(projectDir, '.aidd', 'responses', 'response1.md'), 'done\n');

		const work = await createModeHandler(plan(projectDir, ['--interview'])).selectWork({
			projectDir,
			store,
		});

		expect(work.id).toBe('question-2');
		expect(work.description).toContain('Second question?');
	});

	test('interview mode skips non-question scaffolding headings', async () => {
		const { projectDir, store } = await makeProject('interview-questionnaire');
		await writeFile(
			join(projectDir, '.aidd', 'questions.md'),
			[
				'# Onboarding Interview - aidd',
				'',
				'## Legend',
				'',
				'- **[CRITICAL]** Must answer before assuming ownership',
				'',
				'## 1. Product Intent & Vision',
				'',
				'- **[CRITICAL]** What must be true before v1?',
				'- **[HIGH]** Which users matter most?',
				'',
				'## Summary',
				'',
				'1. What must be true before v1?',
				'',
			].join('\n'),
		);

		const mode = createModeHandler(plan(projectDir, ['--interview']));
		const work = await mode.selectWork({ projectDir, store });
		const promptPlan = await mode.buildPromptPlan({ projectDir, store }, work);

		expect(work.id).toBe('question-1');
		expect(work.description).toContain('Product Intent');
		expect(work.description).not.toContain('Legend');
		expect(promptPlan.variables.interviewTotalQuestions).toBe(1);
	});

	test('interview mode selects first missing response by question number', async () => {
		const { projectDir, store } = await makeProject('interview-gap');
		await writeFile(join(projectDir, '.aidd', 'questions.md'), 'First?\nSecond?\nThird?\n');
		await mkdir(join(projectDir, '.aidd', 'responses'), { recursive: true });
		await writeFile(join(projectDir, '.aidd', 'responses', 'response2.md'), 'done\n');

		const work = await createModeHandler(plan(projectDir, ['--interview'])).selectWork({
			projectDir,
			store,
		});

		expect(work.id).toBe('question-1');
		expect(work.description).toBe('First?');
	});

	test('interview mode rejects files with no parsed questions', async () => {
		const { projectDir, store } = await makeProject('interview-empty');
		await writeFile(
			join(projectDir, '.aidd', 'questions.md'),
			'This is a note, not a question.\n',
		);

		await expect(
			createModeHandler(plan(projectDir, ['--interview'])).selectWork({ projectDir, store }),
		).rejects.toThrow('Interview questions file has no parsed questions');
	});

	test('interview mode writes structured response and index', async () => {
		const { projectDir, store } = await makeProject('interview-write');
		await writeFile(join(projectDir, '.aidd', 'questions.md'), 'What is here?\nWhat next?\n');
		const interviewPlan = plan(projectDir, ['--interview']);
		const mode = createModeHandler(interviewPlan);
		const work = await mode.selectWork({ projectDir, store });
		const promptPlan = await mode.buildPromptPlan({ projectDir, store }, work);

		expect(promptPlan.variables.interviewQuestionNumber).toBe(1);
		expect(promptPlan.variables.interviewTotalQuestions).toBe(2);
		expect(promptPlan.variables.interviewQuestionText).toBe('What is here?');

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: work,
				structuredResult: {
					responseMarkdown: '# Question 1: What is here?\n\n## Response\n\nIt is a test.',
				},
			},
		);

		const responsePath = (result.artifacts?.responsePath as string | undefined) ?? '';
		await expect(readFile(responsePath, 'utf8')).resolves.toContain('It is a test.');
		const index = await readFile(join(projectDir, '.aidd', 'responses.md'), 'utf8');
		expect(index).toContain(
			'| 1 | What is here? | Done | [response1.md](responses/response1.md) |',
		);
		expect(index).toContain('| 2 | What next? | Pending | - |');
		expect(index).toContain('**Progress:** 1 / 2 questions answered');
		expect(result.complete).toBe(false);
	});

	test('interview mode preserves response file written by the agent', async () => {
		const { projectDir, store } = await makeProject('interview-preserve-response');
		await writeFile(join(projectDir, '.aidd', 'questions.md'), 'What is here?\n');
		const interviewPlan = plan(projectDir, ['--interview']);
		const mode = createModeHandler(interviewPlan);
		const work = await mode.selectWork({ projectDir, store });
		const responsePath = join(projectDir, '.aidd', 'responses', 'response1.md');
		await mkdir(join(projectDir, '.aidd', 'responses'), { recursive: true });
		await writeFile(responsePath, '# Written by backend\n\nKeep this content.\n');

		await mode.processResult(
			{ projectDir, store },
			{
				events: [{ type: 'assistant_text', chunk: 'fallback content' }],
				exitCode: 0,
				filesModified: [responsePath],
				transcript: '',
				selectedWork: work,
			},
		);

		await expect(readFile(responsePath, 'utf8')).resolves.toContain('Keep this content.');
		await expect(readFile(responsePath, 'utf8')).resolves.not.toContain('fallback content');
	});

	test('interview mode completes after final response', async () => {
		const { projectDir, store } = await makeProject('interview-complete');
		await writeFile(join(projectDir, '.aidd', 'questions.md'), 'What is here?\n');
		const mode = createModeHandler(plan(projectDir, ['--interview']));
		const work = await mode.selectWork({ projectDir, store });

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: work,
				structuredResult: {
					responseMarkdown:
						'# Question 1: What is here?\n\n## Response\n\nIt is complete.',
				},
			},
		);

		expect(result.complete).toBe(true);
	});

	test('interview question generation escalates on retry and goes fatal after repeated misses', async () => {
		const { projectDir, store } = await makeProject('interview-generate-retries');
		const mode = createModeHandler(plan(projectDir, ['--interview']));
		const context = { projectDir, store };
		const work = await mode.selectWork(context);
		expect(work.id).toBe('generate-questions');

		const missedRun = {
			events: [],
			exitCode: 0,
			filesModified: [],
			transcript: '',
			selectedWork: work,
		};

		const firstPrompt = await mode.buildPromptPlan(context, work);
		expect(firstPrompt.customDirective).not.toContain('RETRY');

		const first = await mode.processResult(context, missedRun);
		expect(first.complete).toBe(false);
		expect(first.fatal).toBeUndefined();

		const retryPrompt = await mode.buildPromptPlan(context, work);
		expect(retryPrompt.customDirective).toContain('RETRY 2');
		expect(retryPrompt.customDirective).toContain('.aidd/questions.md');

		const second = await mode.processResult(context, missedRun);
		expect(second.fatal).toBeUndefined();

		const third = await mode.processResult(context, missedRun);
		expect(third.complete).toBe(false);
		expect(third.fatal).toEqual({ exitCode: 75, stopReason: 'flailing' });
		expect(third.summary).toContain('not created after 3 attempt(s)');
	});

	test('interview question generation succeeds after a retry when the file appears', async () => {
		const { projectDir, store } = await makeProject('interview-generate-recovers');
		const mode = createModeHandler(plan(projectDir, ['--interview']));
		const context = { projectDir, store };
		const work = await mode.selectWork(context);

		const missedRun = {
			events: [],
			exitCode: 0,
			filesModified: [],
			transcript: '',
			selectedWork: work,
		};
		const first = await mode.processResult(context, missedRun);
		expect(first.complete).toBe(false);

		await writeFile(join(projectDir, '.aidd', 'questions.md'), '## What is here?\n');
		const second = await mode.processResult(context, missedRun);
		expect(second.complete).toBe(true);
		expect(second.fatal).toBeUndefined();
		expect(second.summary).toBe('interview questions generated');
	});

	test('interview question generation treats an empty or question-less file as a miss', async () => {
		const { projectDir, store } = await makeProject('interview-generate-empty-file');
		const mode = createModeHandler(plan(projectDir, ['--interview']));
		const context = { projectDir, store };
		const work = await mode.selectWork(context);
		// The agent created the file but put no questions in it — success now would only
		// make the next run's selectWork throw on the unparseable file.
		await writeFile(join(projectDir, '.aidd', 'questions.md'), 'notes without questions\n');

		const result = await mode.processResult(context, {
			events: [],
			exitCode: 0,
			filesModified: [],
			transcript: '',
			selectedWork: work,
		});

		expect(result.complete).toBe(false);
		expect(result.summary).toContain('no parseable questions file');
	});

	test('interview generation directives name the configured questions file for --interview FILE', async () => {
		const { projectDir, store } = await makeProject('interview-custom-file-directive');
		const mode = createModeHandler(
			plan(projectDir, ['--interview', 'docs/interview-questions.md']),
		);
		const context = { projectDir, store };
		const work = await mode.selectWork(context);

		const firstPrompt = await mode.buildPromptPlan(context, work);
		expect(firstPrompt.customDirective).toContain('docs/interview-questions.md');
		expect(firstPrompt.customDirective).not.toContain('.aidd/questions.md');

		await mode.processResult(context, {
			events: [],
			exitCode: 0,
			filesModified: [],
			transcript: '',
			selectedWork: work,
		});
		const retryPrompt = await mode.buildPromptPlan(context, work);
		expect(retryPrompt.customDirective).toContain('RETRY 2');
		expect(retryPrompt.customDirective).toContain('docs/interview-questions.md');
		expect(retryPrompt.customDirective).not.toContain('.aidd/questions.md');
	});

	test('audit mode creates audit finding features and report from structured result', async () => {
		const { projectDir, store } = await makeProject('audit-result');
		const auditPlan = plan(projectDir, ['--audit', 'SECURITY']);
		const mode = createModeHandler(auditPlan);
		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: { id: 'SECURITY', description: 'Run SECURITY audit' },
				structuredResult: {
					auditFindings: [
						{
							title: 'Missing route validation',
							description: 'Verified: src/routes.ts:12 - body is unchecked',
							spec: 'Add TypeBox body schema to POST /items.',
							severity: 'High',
							affectedFiles: ['src/routes.ts'],
						},
					],
					reportMarkdown: '# SECURITY Audit Report\n\nOne finding.',
				},
			},
		);

		const features = await store.listFeatures({ includeAudit: true });
		const finding = features.find((feature) => feature.id.startsWith('audit-security-'));
		const reportPath = (result.artifacts?.reportPath as string | undefined) ?? '';
		const modeFilesCreated = result.artifacts?.modeFilesCreated as string[] | undefined;

		expect(result.summary).toContain('1 finding(s)');
		expect(finding).toMatchObject({
			title: 'Missing route validation',
			status: 'backlog',
			passes: false,
			priority: 2,
			auditSource: 'SECURITY',
			auditSeverity: 'High',
			affectedFiles: ['src/routes.ts'],
		});
		expect(String(finding?.spec)).toContain('Update those feature.json spec(s)');
		expect(modeFilesCreated).toContain(
			join(projectDir, '.aidd', 'features', finding?.id ?? '', 'feature.json'),
		);
		expect(modeFilesCreated).toContain(reportPath);
		await expect(readFile(reportPath, 'utf8')).resolves.toContain('One finding.');
	});

	test('audit mode withholds a measurement score that no instrument backs', async () => {
		const { projectDir, store } = await makeProject('audit-unmeasured-score');
		const mode = createModeHandler(plan(projectDir, ['--audit', 'PERFORMANCE']));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: { id: 'PERFORMANCE', description: 'Run PERFORMANCE audit' },
				structuredResult: {
					auditFindings: [],
					noFindingsJustification:
						'Inspected frontend/vite.config.ts and frontend/src/routes.tsx; lazy routes and compiler are on.',
					reportMarkdown:
						'# PERFORMANCE Audit Report\n\n**Overall Performance Score:** 84/100\n\nNo logs/crawltest.json present; scored code-level only.\n',
					instruments: [
						{
							name: 'crawltest',
							kind: 'banana',
							target: 'routes',
							evidence: 'logs/crawltest.json',
							measured: 'claimed p75 web vitals',
							verified: true,
						},
					],
				},
			},
		);

		const reportPath = (result.artifacts?.reportPath as string | undefined) ?? '';
		const persisted = await readFile(reportPath, 'utf8');
		expect(persisted).toContain('**Overall Performance Score:** SKIPPED / data-unavailable');
		expect(persisted).not.toContain('84/100');
		expect(persisted).toContain('## Score Withheld - No Validated Instrument');
		expect(persisted).toContain(
			'- `crawltest`: invalid kind (expected artifact, probe, or script)',
		);
		expect(persisted).toContain('No logs/crawltest.json present');
		expect(result.summary).toContain(
			'WARNING: 1 measurement audit report(s) declared a numeric score',
		);
		expect(result.artifacts?.instrumentContractWarning).toBeString();
	});

	test('audit mode withholds Lighthouse table scores at report persistence', async () => {
		const { projectDir, store } = await makeProject('audit-lighthouse-table-score');
		const mode = createModeHandler(plan(projectDir, ['--audit', 'LIGHTHOUSE']));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: { id: 'LIGHTHOUSE', description: 'Run LIGHTHOUSE audit' },
				structuredResult: {
					auditFindings: [],
					noFindingsJustification:
						'Attempted Lighthouse capture for frontend/src/App.tsx, but no JSON artifact was produced.',
					reportMarkdown: [
						'# Lighthouse Audit Report',
						'',
						'## Overall Score Comparison',
						'',
						'| Category | Mobile | Desktop |',
						'| --- | ---: | ---: |',
						'| Performance | 65 | 92 |',
					].join('\n'),
				},
			},
		);

		const reportPath = (result.artifacts?.reportPath as string | undefined) ?? '';
		const persisted = await readFile(reportPath, 'utf8');
		expect(persisted).toContain(
			'| Performance | SKIPPED / data-unavailable | SKIPPED / data-unavailable |',
		);
		expect(persisted).toContain('## Score Withheld - No Validated Instrument');
		expect(result.summary).toContain(
			'WARNING: 1 measurement audit report(s) declared a numeric score',
		);
	});

	test('audit mode persists a measurement score backed by a validated instrument', async () => {
		const { projectDir, store } = await makeProject('audit-measured-score');
		const mode = createModeHandler(plan(projectDir, ['--audit', 'PERFORMANCE']));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: { id: 'PERFORMANCE', description: 'Run PERFORMANCE audit' },
				structuredResult: {
					auditFindings: [],
					noFindingsJustification:
						'Parsed logs/critical-path.json from the preview build; entry payload is within budget.',
					reportMarkdown:
						'# PERFORMANCE Audit Report\n\n**Overall Performance Score:** 84/100\n',
					instruments: [
						{
							name: 'check:critical-path',
							kind: 'script',
							target: 'frontend/dist',
							evidence: 'logs/critical-path.json (mtime 2026-07-20T03:11:02Z)',
							measured: 'entry + modulepreload brotli bytes; build=preview',
							verified: true,
						},
					],
				},
			},
		);

		const reportPath = (result.artifacts?.reportPath as string | undefined) ?? '';
		await expect(readFile(reportPath, 'utf8')).resolves.toContain(
			'**Overall Performance Score:** 84/100',
		);
		expect(result.summary).not.toContain('WARNING: 1 measurement audit report(s)');
		expect(result.artifacts?.instrumentContractWarning).toBeUndefined();
	});

	test('audit mode records a same-day report rewrite as edited, not created', async () => {
		const { projectDir, store } = await makeProject('audit-report-rewrite');
		await store.writeAuditReport('SECURITY', '# Earlier run today');
		const mode = createModeHandler(plan(projectDir, ['--audit', 'SECURITY']));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: { id: 'SECURITY', description: 'Run SECURITY audit' },
				structuredResult: {
					auditFindings: [],
					noFindingsJustification:
						'Verified all routes in src/routes.ts declare TypeBox schemas; no unvalidated input paths remain.',
					reportMarkdown: '# SECURITY Audit Report\n\nClean re-run.',
				},
			},
		);

		const reportPath = (result.artifacts?.reportPath as string | undefined) ?? '';
		expect(result.artifacts?.modeFilesEdited).toContain(reportPath);
		expect(result.artifacts?.modeFilesCreated).not.toContain(reportPath);
		await expect(readFile(reportPath, 'utf8')).resolves.toContain('Clean re-run.');
	});

	test('audit mode records the roadmap assignment write as an edit', async () => {
		const { projectDir, store } = await makeProject('audit-roadmap-assignment');
		await store.writeRoadmap({ milestones: { MVP: {} }, features: {} });
		const mode = createModeHandler(plan(projectDir, ['--audit', 'SECURITY']));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: { id: 'SECURITY', description: 'Run SECURITY audit' },
				structuredResult: {
					auditFindings: [
						{
							title: 'Missing route validation',
							description: 'Verified: src/routes.ts:12 - body is unchecked',
							spec: 'Add TypeBox body schema to POST /items.',
							severity: 'High',
							affectedFiles: ['src/routes.ts'],
						},
					],
					reportMarkdown: '# SECURITY Audit Report\n\nOne finding.',
				},
			},
		);

		const roadmapPath = join(projectDir, '.aidd', 'roadmap.json');
		expect(result.artifacts?.modeFilesEdited).toContain(roadmapPath);
		expect(result.artifacts?.modeFilesCreated).not.toContain(roadmapPath);
	});

	test('audit mode does not record an unreadable roadmap as edited', async () => {
		const { projectDir, store } = await makeProject('audit-roadmap-unreadable');
		const roadmapPath = join(projectDir, '.aidd', 'roadmap.json');
		await writeFile(roadmapPath, '{not valid json');
		const mode = createModeHandler(plan(projectDir, ['--audit', 'SECURITY']));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: { id: 'SECURITY', description: 'Run SECURITY audit' },
				structuredResult: {
					auditFindings: [
						{
							title: 'Missing route validation',
							description: 'Verified: src/routes.ts:12 - body is unchecked',
							spec: 'Add TypeBox body schema to POST /items.',
							severity: 'High',
							affectedFiles: ['src/routes.ts'],
						},
					],
					reportMarkdown: '# SECURITY Audit Report\n\nOne finding.',
				},
			},
		);

		const modeFilesCreated = result.artifacts?.modeFilesCreated as string[];
		expect(result.artifacts?.modeFilesEdited).not.toContain(roadmapPath);
		expect(modeFilesCreated.some((path) => path.endsWith('feature.json'))).toBe(true);
		await expect(readFile(roadmapPath, 'utf8')).resolves.toBe('{not valid json');
	});

	test('audit mode skips duplicate open findings by source and title', async () => {
		const { projectDir, store } = await makeProject('audit-duplicate');
		await store.writeFeature({
			id: 'audit-security-100-existing',
			title: 'Existing issue',
			status: 'backlog',
			passes: false,
			auditSource: 'SECURITY',
			affectedFiles: ['src/existing.ts'],
		});
		const mode = createModeHandler(plan(projectDir, ['--audit', 'SECURITY']));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: { id: 'SECURITY', description: 'Run SECURITY audit' },
				structuredResult: {
					auditFindings: [
						{
							title: 'Existing issue',
							severity: 'Low',
							affectedFiles: ['src/other.ts'],
						},
					],
				},
			},
		);

		const auditFeatures = (await store.listFeatures({ includeAudit: true })).filter((feature) =>
			feature.id.startsWith('audit-security-'),
		);
		expect(result.artifacts?.findingsCreated).toBe(0);
		expect(auditFeatures).toHaveLength(1);
	});

	test('audit mode persists both findings when ids collide in one run', async () => {
		const { projectDir, store } = await makeProject('audit-id-collision');
		const mode = createModeHandler(plan(projectDir, ['--audit', 'SECURITY']));

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: { id: 'SECURITY', description: 'Run SECURITY audit' },
				structuredResult: {
					auditFindings: [
						{
							id: 'audit-security-100-collide',
							title: 'First distinct finding',
							severity: 'High',
							affectedFiles: ['src/first.ts'],
						},
						{
							id: 'audit-security-100-collide',
							title: 'Second distinct finding',
							severity: 'Medium',
							affectedFiles: ['src/second.ts'],
						},
					],
				},
			},
		);

		const auditFeatures = (await store.listFeatures({ includeAudit: true }))
			.filter((feature) => feature.id.startsWith('audit-security-100-collide'))
			.sort((a, b) => a.id.localeCompare(b.id));

		expect(result.artifacts?.findingsCreated).toBe(2);
		expect(auditFeatures).toHaveLength(2);
		expect(auditFeatures.map((feature) => feature.id)).toEqual([
			'audit-security-100-collide',
			'audit-security-100-collide-2',
		]);
		expect(auditFeatures.map((feature) => feature.title)).toEqual([
			'First distinct finding',
			'Second distinct finding',
		]);
	});

	test('audit mode batches multiple remaining audit names', async () => {
		const { projectDir, store } = await makeProject('audit-batch-selection');
		const auditPlan = plan(projectDir, ['--audit', 'SECURITY,DEAD_CODE']);
		const mode = createModeHandler(auditPlan);
		const work = await mode.selectWork({ projectDir, store });
		const promptPlan = await mode.buildPromptPlan({ projectDir, store }, work);

		expect(work.id).toBe('audit-batch');
		expect(work.description).toBe('Run 2 audits: SECURITY, DEAD_CODE');
		expect(work.data).toMatchObject({
			current: 'SECURITY',
			currentBatch: ['SECURITY', 'DEAD_CODE'],
		});
		expect(promptPlan.variables.auditName).toBe('SECURITY');
		expect(promptPlan.variables.auditNames).toEqual(['SECURITY', 'DEAD_CODE']);
		expect(promptPlan.variables.auditBatchMode).toBe(true);
	});

	test('audit mode creates reports and findings from batched structured result', async () => {
		const { projectDir, store } = await makeProject('audit-batch-result');
		const auditPlan = plan(projectDir, ['--audit', 'SECURITY,DEAD_CODE']);
		const mode = createModeHandler(auditPlan);
		const work = await mode.selectWork({ projectDir, store });

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: work,
				structuredResult: {
					auditReports: [
						{
							auditName: 'SECURITY',
							auditFindings: [
								{
									title: 'Missing auth guard',
									description: 'Verified: src/routes.ts:12 - guard missing',
									spec: 'Add requireAuth to POST /items.',
									severity: 'High',
									affectedFiles: ['src/routes.ts'],
								},
							],
							reportMarkdown: '# SECURITY Audit Report\n\nOne finding.',
						},
						{
							auditName: 'DEAD_CODE',
							auditFindings: [],
							reportMarkdown: '# DEAD_CODE Audit Report\n\nNo findings.',
						},
					],
				},
			},
		);

		const features = await store.listFeatures({ includeAudit: true });
		const securityFinding = features.find((feature) =>
			feature.id.startsWith('audit-security-'),
		);
		const reports = await store.listAuditReports();

		expect(result.complete).toBe(true);
		expect(result.summary).toContain('audit batch finished 2/2 audit(s)');
		expect(result.artifacts).toMatchObject({
			auditBatchMode: true,
			auditBatchParallelInstruction: true,
			completedAudits: ['SECURITY', 'DEAD_CODE'],
			findingsCreated: 1,
			findingsTotal: 1,
			missingAudits: [],
			perAuditFindingTotals: { DEAD_CODE: 0, SECURITY: 1 },
			perAuditFindingsCreated: { DEAD_CODE: 0, SECURITY: 1 },
			selectedAuditBatch: ['SECURITY', 'DEAD_CODE'],
		});
		expect(result.artifacts?.modeFilesCreated).toEqual(
			expect.arrayContaining([
				join(projectDir, '.aidd', 'features', securityFinding?.id ?? '', 'feature.json'),
			]),
		);
		expect(securityFinding).toMatchObject({
			auditSource: 'SECURITY',
			auditSeverity: 'High',
			title: 'Missing auth guard',
		});
		expect(reports.some((report) => report.startsWith('SECURITY-'))).toBe(true);
		expect(reports.some((report) => report.startsWith('DEAD_CODE-'))).toBe(true);
	});

	test('audit mode warns when a batch writes reports but emits zero structured findings', async () => {
		const { projectDir, store } = await makeProject('audit-batch-no-findings');
		const auditPlan = plan(projectDir, ['--audit', 'SECURITY,DEAD_CODE']);
		const mode = createModeHandler(auditPlan);
		const work = await mode.selectWork({ projectDir, store });

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: work,
				structuredResult: {
					auditReports: [
						{
							auditName: 'SECURITY',
							auditFindings: [],
							reportMarkdown:
								'# SECURITY Audit Report\n\nM1: prose finding never structured.',
						},
						{
							auditName: 'DEAD_CODE',
							auditFindings: [],
							reportMarkdown:
								'# DEAD_CODE Audit Report\n\nL1: prose finding never structured.',
						},
					],
				},
			},
		);

		const features = await store.listFeatures({ includeAudit: true });
		const reports = await store.listAuditReports();

		// Both reports land, but nothing is promoted — the suspicious signature.
		expect(reports.some((report) => report.startsWith('SECURITY-'))).toBe(true);
		expect(reports.some((report) => report.startsWith('DEAD_CODE-'))).toBe(true);
		expect(features.filter((feature) => feature.auditSource !== undefined)).toHaveLength(0);
		expect(result.artifacts?.findingsCreated).toBe(0);
		expect(result.artifacts?.findingsTotal).toBe(0);
		expect(result.summary).toContain('0 structured findings emitted across the batch');
		expect(String(result.artifacts?.findingsContractWarning)).toContain(
			'2 audit report(s) written but 0 structured findings',
		);
	});

	test('audit mode marks batched result incomplete when a selected audit is omitted', async () => {
		const { projectDir, store } = await makeProject('audit-batch-missing');
		const auditPlan = plan(projectDir, ['--audit', 'SECURITY,DEAD_CODE']);
		const mode = createModeHandler(auditPlan);
		const work = await mode.selectWork({ projectDir, store });

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: work,
				structuredResult: {
					auditReports: [
						{
							auditName: 'SECURITY',
							auditFindings: [],
							reportMarkdown: '# SECURITY Audit Report',
						},
					],
				},
			},
		);

		expect(result.complete).toBe(false);
		expect(result.summary).toContain('missing: DEAD_CODE');
		expect(result.artifacts).toMatchObject({
			completedAudits: ['SECURITY'],
			missingAudits: ['DEAD_CODE'],
			selectedAuditBatch: ['SECURITY', 'DEAD_CODE'],
		});

		const retryWork = await mode.selectWork({ projectDir, store });
		expect(retryWork.id).toBe('DEAD_CODE');
		expect(retryWork.data).toMatchObject({
			current: 'DEAD_CODE',
			currentBatch: ['DEAD_CODE'],
		});
	});

	test('audit mode records invalid batched report entries', async () => {
		const { projectDir, store } = await makeProject('audit-batch-invalid');
		const auditPlan = plan(projectDir, ['--audit', 'SECURITY,DEAD_CODE']);
		const mode = createModeHandler(auditPlan);
		const work = await mode.selectWork({ projectDir, store });

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: work,
				structuredResult: {
					auditReports: [
						{
							auditName: 'SECURITY',
							auditFindings: [],
							reportMarkdown: '# SECURITY Audit Report',
						},
						{
							auditName: 'UNKNOWN',
							auditFindings: [],
							reportMarkdown: '# UNKNOWN Audit Report',
						},
					],
				},
			},
		);

		expect(result.complete).toBe(false);
		expect(result.summary).toContain('1 invalid report entry');
		expect(result.artifacts?.invalidAuditReports).toEqual([
			{ auditName: 'UNKNOWN', index: 1, reason: 'auditName was not selected' },
		]);
	});

	test('audit mode reruns explicit audit names even when reports exist', async () => {
		const { projectDir, store } = await makeProject('audit-explicit-rerun');
		await store.writeAuditReport(
			'SECURITY',
			'# SECURITY done',
			new Date('2026-05-04T00:00:00Z'),
		);
		const auditPlan = plan(projectDir, ['--audit', 'SECURITY,DEAD_CODE']);
		const mode = createModeHandler(auditPlan);
		const work = await mode.selectWork({ projectDir, store });
		const promptPlan = await mode.buildPromptPlan({ projectDir, store }, work);

		expect(work.id).toBe('audit-batch');
		expect(work.description).toBe('Run 2 audits: SECURITY, DEAD_CODE');
		expect(work.data).toMatchObject({
			current: 'SECURITY',
			currentBatch: ['SECURITY', 'DEAD_CODE'],
		});
		expect(promptPlan.variables.auditName).toBe('SECURITY');
		expect(promptPlan.variables.auditNames).toEqual(['SECURITY', 'DEAD_CODE']);

		await store.writeAuditReport(
			'DEAD_CODE',
			'# DEAD_CODE done',
			new Date('2026-05-04T00:00:00Z'),
		);
		const rerun = await mode.selectWork({ projectDir, store });
		expect(rerun.id).toBe('audit-batch');
		expect(rerun.data).toMatchObject({
			currentBatch: ['SECURITY', 'DEAD_CODE'],
		});
	});

	test('audit mode discovers audit-all queue from non-reference audit files', async () => {
		const { projectDir, store } = await makeProject('audit-all');
		await writeFullHardeningProfile(projectDir);
		const repoRoot = join(projectDir, 'repo-root');
		await mkdir(join(repoRoot, 'audits'), { recursive: true });
		await writeFile(join(repoRoot, 'audits', 'DEAD_CODE.md'), "---\ntype: 'reference'\n---\n");
		await writeFile(join(repoRoot, 'audits', 'PERFORMANCE.md'), '# Performance\n');
		await writeFile(join(repoRoot, 'audits', 'SECURITY.md'), '# Security\n');

		const mode = createModeHandler(plan(projectDir, ['--audit-all']));
		const context = { projectDir, rootDir: repoRoot, store };
		const first = await mode.selectWork(context);

		expect(first.id).toBe('audit-batch');
		expect(first.data).toMatchObject({
			currentBatch: ['PERFORMANCE', 'SECURITY'],
		});

		await store.writeAuditReport('PERFORMANCE', '# PERFORMANCE done', new Date());
		const second = await mode.selectWork(context);
		expect(second.id).toBe('SECURITY');
	});

	test('audit mode filters audit-all defaults through the inferred local profile', async () => {
		const { projectDir, store } = await makeProject('audit-all-local-profile');
		const repoRoot = join(projectDir, 'repo-root');
		await mkdir(join(repoRoot, 'audits'), { recursive: true });
		await writeFile(join(repoRoot, 'audits', 'PERFORMANCE.md'), '# Performance\n');
		await writeFile(join(repoRoot, 'audits', 'SECURITY.md'), '# Security\n');
		await writeFile(
			join(repoRoot, 'audits', 'audit-profile-mapping.json'),
			`${JSON.stringify({
				rules: [
					{
						audits: ['PERFORMANCE'],
						effect: 'disabled',
						id: 'local-skip-performance',
						match: {
							bucket: ['single_user_local'],
							criticality: ['toy', 'utility'],
							dataSensitivity: ['none', 'low'],
							deployment: ['local'],
							externalIntegrations: ['none', 'read_only'],
						},
					},
				],
				version: 1,
			})}\n`,
		);

		const mode = createModeHandler(plan(projectDir, ['--audit-all']));
		const first = await mode.selectWork({ projectDir, rootDir: repoRoot, store });

		expect(first.id).toBe('SECURITY');
	});

	test('director mode writes normalized structured output', async () => {
		const { projectDir, store } = await makeProject('director-structured');
		const fleetSummary = join(projectDir, '.aidd', 'fleet-summary.json');
		const outputPath = join(projectDir, '.aidd', 'director-output.json');
		await writeFile(fleetSummary, JSON.stringify({ projects: [] }));
		const mode = createModeHandler(
			plan(projectDir, [
				'--director',
				'--fleet-summary',
				fleetSummary,
				'--director-output',
				outputPath,
			]),
		);

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: { id: 'director', description: 'coordinate' },
				structuredResult: {
					directorOutput: {
						fleetSummary: {
							totalSuggestions: 99,
							byRisk: { HIGH: 0, LOW: 0, MEDIUM: 0 },
							byType: {},
							crossProjectPatterns: ['old-counts'],
							fleetHealthScore: 87,
						},
						suggestions: [
							{
								confidence: null,
								description: 'Fix one high audit finding.',
								evidence: { high: 1 },
								projectId: 'demo',
								reasoning: 'auditFindings.bySeverity.high=1',
								riskLevel: 'HIGH',
								suggestedArgs: { severity: 'high' },
								suggestedRecipe: 'remediate-audit-findings',
								taskType: 'audit_remediation',
								title: 'High audit finding in demo',
							},
							{
								confidence: null,
								description: 'Refresh required aidd artifacts.',
								evidence: { requiredMissing: 1 },
								projectId: 'demo',
								reasoning: 'priorityHealth.primaryTaskType=artifact_maintenance',
								riskLevel: 'HIGH',
								suggestedArgs: { checkArtifacts: 'true' },
								suggestedRecipe: null,
								taskType: 'artifact_maintenance',
								title: 'Missing required artifact in demo',
							},
						],
					},
				},
			},
		);

		const output = JSON.parse(await readFile(outputPath, 'utf8')) as {
			fleetSummary: {
				totalSuggestions: number;
				byRisk: Record<string, number>;
				byType: Record<string, number>;
			};
			suggestions: { projectId: string; taskType: string; riskLevel: string }[];
		};

		expect(result.complete).toBe(true);
		expect(result.summary).toContain('2 suggestion(s)');
		expect(result.artifacts?.outputStatus).toBe('ok');
		expect(output.fleetSummary.totalSuggestions).toBe(2);
		expect(output.fleetSummary.byRisk.HIGH).toBe(2);
		expect(output.fleetSummary.byType.artifact_maintenance).toBe(1);
		expect(output.fleetSummary.byType.audit_remediation).toBe(1);
		expect(output.suggestions[0]).toMatchObject({
			projectId: 'demo',
			taskType: 'audit_remediation',
			riskLevel: 'HIGH',
		});
	});

	test('director mode validates backend-written output file', async () => {
		const { projectDir, store } = await makeProject('director-file');
		const fleetSummary = join(projectDir, '.aidd', 'fleet-summary.json');
		const outputPath = join(projectDir, '.aidd', 'director-output.json');
		await writeFile(fleetSummary, JSON.stringify({ projects: [] }));
		await writeFile(
			outputPath,
			JSON.stringify({
				fleetSummary: {
					totalSuggestions: 0,
					byRisk: {},
					byType: {},
					crossProjectPatterns: [],
				},
				suggestions: [],
			}),
		);
		const mode = createModeHandler(
			plan(projectDir, [
				'--director',
				'--fleet-summary',
				fleetSummary,
				'--director-output',
				outputPath,
			]),
		);

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [outputPath],
				transcript: '',
				selectedWork: { id: 'director', description: 'coordinate' },
			},
		);

		const output = JSON.parse(await readFile(outputPath, 'utf8')) as {
			fleetSummary: { totalSuggestions: number };
		};
		expect(result.complete).toBe(true);
		expect(result.summary).toContain('0 suggestion(s)');
		expect(result.artifacts?.outputStatus).toBe('ok');
		expect(result.artifacts?.totalSuggestions).toBe(0);
		expect(output.fleetSummary.totalSuggestions).toBe(0);
	});

	test('director mode prefers the written file over an empty AIDD_RESULT marker', async () => {
		const { projectDir, store } = await makeProject('director-file-wins');
		const fleetSummary = join(projectDir, '.aidd', 'fleet-summary.json');
		const outputPath = join(projectDir, '.aidd', 'director-output.json');
		await writeFile(fleetSummary, JSON.stringify({ projects: [] }));
		// The model wrote real suggestions to the file (the primary contract)...
		await writeFile(
			outputPath,
			JSON.stringify({
				fleetSummary: {
					totalSuggestions: 2,
					byRisk: { HIGH: 1, LOW: 0, MEDIUM: 1 },
					byType: {},
					crossProjectPatterns: ['fleet-wide-artifact-staleness'],
					fleetHealthScore: 30,
				},
				suggestions: [
					{
						confidence: null,
						description: 'Refresh required aidd artifacts.',
						evidence: { requiredMissing: 1 },
						projectId: 'demo-app',
						reasoning: 'artifact_maintenance rank 1',
						riskLevel: 'HIGH',
						suggestedArgs: null,
						suggestedRecipe: 'reconcile-project-artifacts',
						taskType: 'artifact_maintenance',
						title: 'demo-app: reconcile aidd artifacts',
					},
					{
						confidence: null,
						description: 'Resolve the top remediation item.',
						evidence: {},
						projectId: 'demo-app',
						reasoning: 'remediation_backlog rank 19',
						riskLevel: 'MEDIUM',
						suggestedArgs: { filterBy: 'id', filterValue: 'rem-1' },
						suggestedRecipe: 'audit-all',
						taskType: 'remediation_backlog',
						title: 'demo-app: resolve "rem-1"',
					},
				],
			}),
		);
		const mode = createModeHandler(
			plan(projectDir, [
				'--director',
				'--fleet-summary',
				fleetSummary,
				'--director-output',
				outputPath,
			]),
		);

		// ...but the AIDD_RESULT marker echoed an empty directorOutput (the regression that
		// silently dropped every suggestion). The written file must win.
		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [outputPath],
				transcript: '',
				selectedWork: { id: 'director', description: 'coordinate' },
				structuredResult: {
					directorOutput: {
						fleetSummary: {
							totalSuggestions: 0,
							byRisk: { HIGH: 0, LOW: 0, MEDIUM: 0 },
							byType: {},
							crossProjectPatterns: ['fleet-wide-artifact-staleness'],
							fleetHealthScore: 30,
						},
						suggestions: [],
					},
				},
			},
		);

		const output = JSON.parse(await readFile(outputPath, 'utf8')) as {
			fleetSummary: { totalSuggestions: number };
			suggestions: { taskType: string }[];
		};
		expect(result.complete).toBe(true);
		expect(result.artifacts?.outputStatus).toBe('ok');
		expect(output.suggestions).toHaveLength(2);
		expect(output.fleetSummary.totalSuggestions).toBe(2);
		expect(output.suggestions.map((s) => s.taskType).sort()).toEqual([
			'artifact_maintenance',
			'remediation_backlog',
		]);
	});

	test('director mode reads the file when the marker is a bare completion signal', async () => {
		const { projectDir, store } = await makeProject('director-completion-marker');
		const fleetSummary = join(projectDir, '.aidd', 'fleet-summary.json');
		const outputPath = join(projectDir, '.aidd', 'director-output.json');
		await writeFile(fleetSummary, JSON.stringify({ projects: [] }));
		await writeFile(
			outputPath,
			JSON.stringify({
				fleetSummary: {
					totalSuggestions: 1,
					byRisk: { HIGH: 1, LOW: 0, MEDIUM: 0 },
					byType: {},
					crossProjectPatterns: [],
					fleetHealthScore: 42,
				},
				suggestions: [
					{
						confidence: null,
						description: 'Refresh required aidd artifacts.',
						evidence: { requiredMissing: 1 },
						projectId: 'demo-app',
						reasoning: 'artifact_maintenance rank 1',
						riskLevel: 'HIGH',
						suggestedArgs: null,
						suggestedRecipe: 'reconcile-project-artifacts',
						taskType: 'artifact_maintenance',
						title: 'demo-app: reconcile aidd artifacts',
					},
				],
			}),
		);
		const mode = createModeHandler(
			plan(projectDir, [
				'--director',
				'--fleet-summary',
				fleetSummary,
				'--director-output',
				outputPath,
			]),
		);

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [outputPath],
				transcript: '',
				selectedWork: { id: 'director', description: 'coordinate' },
				structuredResult: { directorOutputWritten: true },
			},
		);

		const output = JSON.parse(await readFile(outputPath, 'utf8')) as {
			fleetSummary: { totalSuggestions: number };
		};
		expect(result.complete).toBe(true);
		expect(result.artifacts?.outputStatus).toBe('ok');
		expect(output.fleetSummary.totalSuggestions).toBe(1);
	});

	test('director mode reports failure when output file is missing', async () => {
		const { projectDir, store } = await makeProject('director-missing');
		const fleetSummary = join(projectDir, '.aidd', 'fleet-summary.json');
		const outputPath = join(projectDir, '.aidd', 'missing-output.json');
		await writeFile(fleetSummary, JSON.stringify({ projects: [] }));
		const mode = createModeHandler(
			plan(projectDir, [
				'--director',
				'--fleet-summary',
				fleetSummary,
				'--director-output',
				outputPath,
			]),
		);

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: { id: 'director', description: 'coordinate' },
			},
		);

		const output = JSON.parse(await readFile(outputPath, 'utf8')) as {
			fleetSummary: { crossProjectPatterns: string[]; totalSuggestions: number };
		};
		expect(result.complete).toBe(false);
		expect(result.summary).toContain('missing');
		expect(result.artifacts?.outputStatus).toBe('missing');
		expect(output.fleetSummary.totalSuggestions).toBe(0);
		expect(output.fleetSummary.crossProjectPatterns).toEqual(['director_output_missing']);
	});

	test('director mode reports failure when output file is invalid JSON', async () => {
		const { projectDir, store } = await makeProject('director-invalid');
		const fleetSummary = join(projectDir, '.aidd', 'fleet-summary.json');
		const outputPath = join(projectDir, '.aidd', 'invalid-output.json');
		await writeFile(fleetSummary, JSON.stringify({ projects: [] }));
		await writeFile(outputPath, '{ not valid json');
		const mode = createModeHandler(
			plan(projectDir, [
				'--director',
				'--fleet-summary',
				fleetSummary,
				'--director-output',
				outputPath,
			]),
		);

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: { id: 'director', description: 'coordinate' },
			},
		);

		const output = JSON.parse(await readFile(outputPath, 'utf8')) as {
			fleetSummary: { crossProjectPatterns: string[]; totalSuggestions: number };
		};
		expect(result.complete).toBe(false);
		expect(result.summary).toContain('invalid');
		expect(result.artifacts?.outputStatus).toBe('invalid');
		expect(output.fleetSummary.totalSuggestions).toBe(0);
		expect(output.fleetSummary.crossProjectPatterns).toEqual(['director_output_invalid']);
	});

	test('director mode deduplicates suggestions by projectId + taskType', async () => {
		const { projectDir, store } = await makeProject('director-dedup');
		const fleetSummary = join(projectDir, '.aidd', 'fleet-summary.json');
		const outputPath = join(projectDir, '.aidd', 'director-output.json');
		await writeFile(fleetSummary, JSON.stringify({ projects: [] }));
		const mode = createModeHandler(
			plan(projectDir, [
				'--director',
				'--fleet-summary',
				fleetSummary,
				'--director-output',
				outputPath,
			]),
		);

		const result = await mode.processResult(
			{ projectDir, store },
			{
				events: [],
				exitCode: 0,
				filesModified: [],
				transcript: '',
				selectedWork: { id: 'director', description: 'coordinate' },
				structuredResult: {
					directorOutput: {
						fleetSummary: {
							totalSuggestions: 6,
							byRisk: { HIGH: 0, LOW: 0, MEDIUM: 6 },
							byType: {},
							crossProjectPatterns: [],
						},
						suggestions: [
							{
								description: 'd',
								evidence: {},
								projectId: 'proj-a',
								reasoning: 'r',
								riskLevel: 'MEDIUM',
								taskType: 'audit_remediation',
								title: 'First',
							},
							{
								description: 'd',
								evidence: {},
								projectId: 'proj-a',
								reasoning: 'r',
								riskLevel: 'HIGH',
								taskType: 'audit_remediation',
								title: 'Duplicate',
							},
							{
								description: 'd',
								evidence: {},
								projectId: 'proj-a',
								reasoning: 'r',
								riskLevel: 'LOW',
								taskType: 'dependency_hygiene',
								title: 'Different type',
							},
							{
								description: 'd',
								evidence: {},
								projectId: 'proj-b',
								reasoning: 'r',
								riskLevel: 'MEDIUM',
								taskType: 'audit_remediation',
								title: 'Different project',
							},
							{
								description: 'd',
								evidence: {},
								projectId: null,
								reasoning: 'r',
								riskLevel: 'LOW',
								taskType: 'stale_project',
								title: 'Fleet-wide first',
							},
							{
								description: 'd',
								evidence: {},
								projectId: null,
								reasoning: 'r',
								riskLevel: 'LOW',
								taskType: 'stale_project',
								title: 'Fleet-wide dup',
							},
						],
					},
				},
			},
		);

		const output = JSON.parse(await readFile(outputPath, 'utf8')) as {
			fleetSummary: { totalSuggestions: number };
			suggestions: { projectId: null | string; taskType: string; title: string }[];
		};

		expect(result.complete).toBe(true);
		expect(output.suggestions).toHaveLength(4);
		expect(output.suggestions.map((s) => s.title).sort()).toEqual(
			['Different project', 'Different type', 'Fleet-wide first', 'First'].sort(),
		);
		expect(output.fleetSummary.totalSuggestions).toBe(4);
	});

	// The compiler renders whatever graph the mode attaches, so the mode is the layer that decides
	// whether the agent gets a real neighborhood or nothing. Assert the attachment, not just the
	// rendering — including the reverse edges, which the on-disk metadata never stores.
	test('coding mode attaches the selected feature dependency graph to the prompt plan', async () => {
		const { projectDir, store } = await makeProject('coding-dependency-graph');
		await store.writeFeature({ id: 'db-schema', passes: true, status: 'completed' });
		await store.writeFeature({
			dependencies: ['db-schema'],
			id: 'api-routes',
			passes: false,
			status: 'in_progress',
		});
		await store.writeFeature({
			dependencies: ['api-routes'],
			id: 'admin-ui',
			passes: false,
			status: 'backlog',
		});

		const promptPlan = await createModeHandler(plan(projectDir)).buildPromptPlan(
			{ projectDir, store },
			{ description: 'API routes', id: 'api-routes', kind: 'feature' },
		);
		const graph = featureNeighborhoodSchema.parse(promptPlan.variables.featureGraph);

		expect(promptPlan.variables.selectedFeatureId).toBe('api-routes');
		expect(graph.requires.map((node) => [node.id, node.passes])).toEqual([['db-schema', true]]);
		expect(graph.requiredBy.map((node) => node.id)).toEqual(['admin-ui']);
		expect(graph.blockedBy).toEqual([]);
	});

	test('coding mode attaches no graph for non-feature work', async () => {
		const { projectDir, store } = await makeProject('coding-graph-non-feature');
		const promptPlan = await createModeHandler(plan(projectDir)).buildPromptPlan(
			{ projectDir, store },
			{ description: 'nothing to do', id: 'no-work', kind: 'none' },
		);

		expect(promptPlan.variables.featureGraph).toBeUndefined();
	});

	// An audit has no selected feature, so it gets whole-project fan-in instead — the blast-radius
	// evidence it needs to justify a severity. Audit findings are features too and must be counted.
	test('audit mode attaches whole-project dependency topology to the prompt plan', async () => {
		const { projectDir, store } = await makeProject('audit-dependency-topology');
		await store.writeFeature({
			affectedFiles: ['src/db/schema.ts'],
			id: 'db-schema',
			passes: true,
			status: 'completed',
		});
		await store.writeFeature({ dependencies: ['db-schema'], id: 'api-routes' });
		await store.writeFeature({
			auditSource: 'SECURITY',
			dependencies: ['db-schema'],
			id: 'audit-security-1700000000-injection',
		});

		const promptPlan = await createModeHandler(
			plan(projectDir, ['--audit', 'SECURITY']),
		).buildPromptPlan(
			{ projectDir, store },
			{ description: 'Run SECURITY audit', id: 'SECURITY', kind: 'generic' },
		);
		const topology = featureDependencyTopologySchema.parse(
			promptPlan.variables.featureTopology,
		);

		expect(topology.featureCount).toBe(3);
		expect(topology.hubs).toHaveLength(1);
		expect(topology.hubs[0]?.id).toBe('db-schema');
		expect(topology.hubs[0]?.dependents).toEqual([
			'api-routes',
			'audit-security-1700000000-injection',
		]);
		expect(topology.hubs[0]?.affectedFiles).toEqual(['src/db/schema.ts']);
		expect(topology.cycles).toEqual([]);
		expect(topology.dangling).toEqual([]);
	});
});
