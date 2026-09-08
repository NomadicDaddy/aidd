import type { BlueprintSetupActivity } from 'aidd-shared/metadata/blueprint-setup';

import { describe, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { canonicalProjectPath, encodeProjectId } from '../../backend/src/paths.ts';
import { ProjectService } from '../../backend/src/services/projectService.ts';
import { testTempDir } from '../_helpers/temp.ts';

interface SummonLikeProject {
	projectDir: string;
	root: string;
}

function webProjectConfig(root: string) {
	return {
		allowedOrigins: [],
		allowedRoots: [root],
		allowRemote: false,
		autoChainLimit: 3,
		autoChainRuns: false,
		dataDir: resolve(process.cwd(), 'data'),
		hostname: '127.0.0.1',
		ignoredFolders: ['.git', 'node_modules'],
		maxConcurrentRuns: 2,
		maxConcurrentRunsPerProject: 2,
		port: 3210,
		showSpernakitProject: false,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: false,
		useWorktrees: false,
	};
}

async function writeFeature(dir: string, id: string, passes: boolean): Promise<void> {
	await mkdir(join(dir, '.aidd', 'features', id), { recursive: true });
	await Bun.write(
		join(dir, '.aidd', 'features', id, 'feature.json'),
		JSON.stringify({
			category: 'Core',
			dependencies: [],
			id,
			passes,
			priority: 1,
			status: passes ? 'completed' : 'backlog',
			title: id,
		}),
	);
}

async function writeRoadmap(dir: string, ids: string[]): Promise<void> {
	await Bun.write(
		join(dir, '.aidd', 'roadmap.json'),
		JSON.stringify({
			features: Object.fromEntries(ids.map((id) => [id, { milestone: 'MVP' }])),
			milestones: { MVP: { priority: 1 } },
		}),
	);
}

/**
 * The reported project: an existing CLI codebase carrying a completed feature and a roadmap, with
 * no spec.md and no local changelog, and — until the caller says otherwise — nothing running.
 */
async function summonLikeProject(prefix: string): Promise<SummonLikeProject> {
	const root = canonicalProjectPath(await testTempDir(prefix));
	const projectDir = join(root, 'summon');
	await mkdir(join(projectDir, 'src'), { recursive: true });
	await Bun.write(join(projectDir, 'src', 'index.ts'), 'export const app = 1;\n');
	await writeFeature(projectDir, 'shipped-feature', true);
	await writeRoadmap(projectDir, ['shipped-feature']);
	return { projectDir, root };
}

async function runGit(projectDir: string, args: string[]): Promise<void> {
	const child = Bun.spawn(['git', ...args], {
		cwd: projectDir,
		env: {
			...process.env,
			GIT_AUTHOR_EMAIL: 'aidd-test@example.invalid',
			GIT_AUTHOR_NAME: 'aidd Test',
			GIT_COMMITTER_EMAIL: 'aidd-test@example.invalid',
			GIT_COMMITTER_NAME: 'aidd Test',
		},
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await child.exited) !== 0) throw new Error(`git ${args.join(' ')} failed`);
}

/** Finish onboarding so the project reaches the coding phase, where readiness owns the verdict. */
async function completeOnboarding(projectDir: string): Promise<void> {
	await Bun.write(join(projectDir, '.aidd', 'spec.md'), '# Spec\n');
	await Bun.write(join(projectDir, '.aidd', 'CHANGELOG.md'), '# Changelog\n');
}

async function serveDetail(project: SummonLikeProject, activity?: BlueprintSetupActivity) {
	const asked: string[] = [];
	const service = new ProjectService(webProjectConfig(project.root));
	service.setSetupActivityProvider((projectPath) => {
		asked.push(projectPath);
		return Promise.resolve(activity ?? null);
	});
	const detail = await service.getProjectDetail(encodeProjectId(project.projectDir));
	return { asked, detail };
}

describe('served project detail reports blueprint setup honestly', () => {
	test('an idle project with no runs or pipelines shows incomplete setup, not progress', async () => {
		const project = await summonLikeProject('aidd-detail-blueprint-idle-');

		const { asked, detail } = await serveDetail(project);

		expect(detail.phase).toBe('onboarding');
		expect(asked).toHaveLength(1);
		expect(detail.implementation).toMatchObject({
			activity: null,
			blueprintReady: false,
			state: 'setup_incomplete',
		});
		expect(detail.implementation.reason).toBe(
			'Project setup is incomplete: .aidd/spec.md and .aidd/CHANGELOG.md are missing.',
		);
		expect(detail.implementation.reason).not.toContain('in progress');
	});

	test('a running setup run for this project earns the preparing state', async () => {
		const project = await summonLikeProject('aidd-detail-blueprint-running-');

		const { detail } = await serveDetail(project, {
			kind: 'run',
			label: 'The coding run',
			lifecycle: 'running',
			reference: 'run_42',
		});

		expect(detail.implementation.state).toBe('preparing');
		expect(detail.implementation.reason).toBe('The coding run is in progress.');
		expect(detail.implementation.activity).toMatchObject({ kind: 'run', reference: 'run_42' });
	});

	test('a queued pipeline is served as queued, with the missing artifacts still named', async () => {
		const project = await summonLikeProject('aidd-detail-blueprint-queued-');

		const { detail } = await serveDetail(project, {
			kind: 'pipeline',
			label: 'The Project intake pipeline',
			lifecycle: 'queued',
			reference: 'pipe_7',
		});

		expect(detail.implementation.state).toBe('queued');
		expect(detail.implementation.reason).toContain('is queued and has not started');
		expect(detail.implementation.reason).toContain('.aidd/spec.md');
	});

	test('a stopped run is served as blocked rather than as work in flight', async () => {
		const project = await summonLikeProject('aidd-detail-blueprint-stopped-');

		const { detail } = await serveDetail(project, {
			kind: 'run',
			label: 'The coding run',
			lifecycle: 'stopped',
			reference: 'run_9',
		});

		expect(detail.implementation.state).toBe('blocked');
		expect(detail.implementation.reason).toContain('The coding run was stopped.');
		expect(detail.implementation.reason).not.toContain('in progress');
	});

	// Readiness at coding is decided by features and the roadmap; consulting execution state there
	// would let a running run change a verdict that has nothing to do with it.
	test('a coding-phase project is not asked about activity and reports none', async () => {
		const project = await summonLikeProject('aidd-detail-blueprint-coding-');
		await completeOnboarding(project.projectDir);

		const { asked, detail } = await serveDetail(project, {
			kind: 'run',
			label: 'The coding run',
			lifecycle: 'running',
			reference: 'run_42',
		});

		expect(detail.phase).toBe('coding');
		expect(asked).toEqual([]);
		expect(detail.implementation).toMatchObject({ activity: null, state: 'complete' });
	});

	test('a part-built backlog keeps the existing building verdict', async () => {
		const project = await summonLikeProject('aidd-detail-blueprint-building-');
		await completeOnboarding(project.projectDir);
		await writeFeature(project.projectDir, 'next-feature', false);
		await writeRoadmap(project.projectDir, ['shipped-feature', 'next-feature']);

		const { detail } = await serveDetail(project);

		// One record passes and one does not: implementation is under way, and the card stays hidden.
		expect(detail.implementation).toMatchObject({ activity: null, state: 'building' });
	});

	test('an untouched blueprint still reports the existing ready verdict', async () => {
		const root = canonicalProjectPath(await testTempDir('aidd-detail-blueprint-ready-'));
		const projectDir = join(root, 'fresh');
		await mkdir(join(projectDir, 'src'), { recursive: true });
		await Bun.write(join(projectDir, 'src', 'index.ts'), 'export const app = 1;\n');
		await writeFeature(projectDir, 'first-feature', false);
		await writeRoadmap(projectDir, ['first-feature']);
		await completeOnboarding(projectDir);
		// The artifact health cache the overview writes is gitignored in a scaffolded project, and
		// has to be here too or serving the page would dirty the tree it is about to judge.
		await Bun.write(join(projectDir, '.gitignore'), '.aidd/.artifacts-check.json\n');
		// The persisted-blueprint gate is a readiness requirement in its own right: an uncommitted
		// blueprint is not ready, so the ready case has to earn its verdict the same way real ones do.
		await runGit(projectDir, ['init']);
		await runGit(projectDir, ['add', '.']);
		await runGit(projectDir, ['commit', '-m', 'chore: commit blueprint']);

		const { asked, detail } = await serveDetail({ projectDir, root });

		expect(asked).toEqual([]);
		expect(detail.implementation).toMatchObject({
			activity: null,
			blueprintReady: true,
			state: 'blueprint_ready',
		});
		expect(detail.implementation.firstFeature?.id).toBe('first-feature');
	});
});
