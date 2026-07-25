import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { ResolvedWebConfig } from 'aidd-shared/config';
import { encodeProjectId } from '../../backend/src/paths.ts';
import { ProjectService } from '../../backend/src/services/projectService.ts';
import {
	listProjectReports,
	submitProjectReport,
} from '../../backend/src/services/projectReports.ts';

import { testTempDir } from '../_helpers/temp.ts';
function webConfig(root: string): ResolvedWebConfig {
	return {
		allowRemote: false,
		allowedOrigins: [],
		allowedRoots: [root],
		dataDir: join(root, 'data'),
		hostname: '127.0.0.1',
		ignoredFolders: [],
		maxConcurrentRuns: 1,
		maxConcurrentRunsPerProject: 1,
		autoChainLimit: 3,
		autoChainRuns: false,
		useWorktrees: false,
		port: 3210,
		spernakitFleetManifest: null,
		spernakitInitScript: null,
		spernakitTemplateRef: null,
		showSpernakitProject: false,
		spernakitTemplateRepo: 'NomadicDaddy/spernakit',
		templates: [],
		traceDataMovement: true,
	};
}

async function createProject(): Promise<{ projectDir: string; root: string }> {
	const root = await testTempDir('aidd-project-reports-');
	const projectDir = join(root, 'demo');
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	return { projectDir, root };
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
		throw error;
	}
}

async function readFeature(
	projectDir: string,
	featureId: string,
): Promise<Record<string, unknown>> {
	const raw = await readFile(
		join(projectDir, '.aidd', 'features', featureId, 'feature.json'),
		'utf8',
	);
	return JSON.parse(raw) as Record<string, unknown>;
}

async function writeFeature(projectDir: string, featureId: string, passes: boolean): Promise<void> {
	await mkdir(join(projectDir, '.aidd', 'features', featureId), { recursive: true });
	await Bun.write(
		join(projectDir, '.aidd', 'features', featureId, 'feature.json'),
		JSON.stringify({
			dependencies: [],
			id: featureId,
			passes,
			status: passes ? 'completed' : 'backlog',
		}),
	);
}

async function writeRoadmap(
	projectDir: string,
	roadmap: {
		features: Record<string, { milestone?: string }>;
		milestones: Record<string, Record<string, unknown>>;
	},
): Promise<void> {
	await Bun.write(join(projectDir, '.aidd', 'roadmap.json'), JSON.stringify(roadmap));
}

async function readRoadmap(
	projectDir: string,
): Promise<{ features: Record<string, { milestone?: string }> }> {
	const raw = await readFile(join(projectDir, '.aidd', 'roadmap.json'), 'utf8');
	return JSON.parse(raw) as { features: Record<string, { milestone?: string }> };
}

async function runGit(cwd: string, args: string[]): Promise<{ exitCode: number; stdout: string }> {
	const proc = Bun.spawn(['git', '-C', cwd, ...args], {
		stderr: 'pipe',
		stdin: 'ignore',
		stdout: 'pipe',
		windowsHide: true,
	});
	const stdout = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;
	return { exitCode, stdout };
}

async function createGitProject(): Promise<{ projectDir: string; root: string }> {
	const { projectDir, root } = await createProject();
	await runGit(projectDir, ['init']);
	await runGit(projectDir, ['config', 'user.email', 'test@example.invalid']);
	await runGit(projectDir, ['config', 'user.name', 'aidd test']);
	await runGit(projectDir, ['config', 'commit.gpgsign', 'false']);
	await writeFeature(projectDir, 'feature-mvp-open', false);
	await writeRoadmap(projectDir, {
		milestones: { MVP: {} },
		features: { 'feature-mvp-open': { milestone: 'MVP' } },
	});
	await runGit(projectDir, ['add', '-A']);
	await runGit(projectDir, ['commit', '-m', 'init']);
	return { projectDir, root };
}

function committedFiles(log: string): string[] {
	return log
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => line.replaceAll('\\', '/'))
		.sort();
}

describe('project reports', () => {
	test('creates a remediation feature for broken-behavior bug reports', async () => {
		const { projectDir } = await createProject();

		const report = await submitProjectReport(projectDir, {
			description: 'The dashboard button does not respond.',
			kind: 'bug',
			metadata: {
				pathname: '/projects/demo',
				url: 'http://127.0.0.1:3210/projects/demo',
				userAgent: 'bun-test',
				viewport: { height: 900, width: 1440 },
			},
		});
		const feature = await readFeature(projectDir, report.featureDirectory ?? '');
		const reports = await listProjectReports(projectDir);

		expect(report.kind).toBe('bug');
		expect(report.featureId).toMatch(/^remediation-\d{8}-dashboard-button-does-not-respond/);
		expect(report.classificationReason).toContain('broken-behavior');
		expect(report.reportedBy.username).toBe('aidd-web');
		expect(feature.id).toBe(report.featureId);
		expect(feature.status).toBe('backlog');
		expect(feature.passes).toBe(false);
		expect(feature.category).toBe('UI');
		expect(feature.priority).toBe(3);
		expect(reports.bugs).toHaveLength(1);
		expect(reports.bugs[0]?.featureId).toBe(report.featureId);
		expect(reports.lastUpdated).toBe(report.createdAt);
		expect(await fileExists(join(projectDir, 'data', 'bugs.json'))).toBe(false);
	});

	test('reclassifies capability-request bug reports as feature entries', async () => {
		const { projectDir } = await createProject();

		const report = await submitProjectReport(projectDir, {
			description: 'No way to view feature details from the project page.',
			kind: 'bug',
		});
		const feature = await readFeature(projectDir, report.featureDirectory ?? '');

		expect(report.kind).toBe('feature');
		expect(report.featureId).toBe('view-feature-details-project-page');
		expect(report.classificationReason).toContain('capability-request');
		expect(feature.id).toBe('view-feature-details-project-page');
		expect(feature.spec).toContain('without requiring a separate bugs.json ingestion step');
	});

	test('creates normal feature entries for feature submissions', async () => {
		const { projectDir } = await createProject();

		const report = await submitProjectReport(projectDir, {
			description: 'Add saved dashboard filters.',
			kind: 'feature',
		});
		const reports = await listProjectReports(projectDir);

		expect(report.kind).toBe('feature');
		expect(report.featureId).toBe('saved-dashboard-filters');
		expect(report.classificationReason).toBe('Submitted as a feature request.');
		expect(reports.bugs[0]?.featureDirectory).toBe('saved-dashboard-filters');
	});

	test('adds a suffix when a generated feature slug already exists', async () => {
		const { projectDir } = await createProject();

		const first = await submitProjectReport(projectDir, {
			description: 'Add saved dashboard filters.',
			kind: 'feature',
		});
		const second = await submitProjectReport(projectDir, {
			description: 'Add saved dashboard filters.',
			kind: 'feature',
		});

		expect(first.featureId).toBe('saved-dashboard-filters');
		expect(second.featureId).toMatch(/^saved-dashboard-filters-[a-f0-9-]{8}$/);
		expect(second.featureId).not.toBe(first.featureId);
		expect(
			await fileExists(join(projectDir, '.aidd', 'features', second.featureId ?? '')),
		).toBe(true);
	});

	test('assigns bug reports to the active roadmap milestone', async () => {
		const { projectDir } = await createProject();
		await writeFeature(projectDir, 'feature-mvp-open', false);
		await writeRoadmap(projectDir, {
			milestones: { MVP: {}, 'v1.0': {} },
			features: { 'feature-mvp-open': { milestone: 'MVP' } },
		});

		const report = await submitProjectReport(projectDir, {
			description: 'The dashboard button does not respond.',
			kind: 'bug',
		});
		const roadmap = await readRoadmap(projectDir);

		expect(report.kind).toBe('bug');
		expect(roadmap.features[report.featureDirectory ?? '']?.milestone).toBe('MVP');
	});

	test('assigns feature requests to the next existing roadmap milestone', async () => {
		const { projectDir } = await createProject();
		await writeFeature(projectDir, 'feature-mvp-open', false);
		await writeRoadmap(projectDir, {
			milestones: { MVP: {}, 'v1.0': {} },
			features: { 'feature-mvp-open': { milestone: 'MVP' } },
		});

		const report = await submitProjectReport(projectDir, {
			description: 'Add saved dashboard filters.',
			kind: 'feature',
		});
		const roadmap = await readRoadmap(projectDir);

		expect(report.kind).toBe('feature');
		expect(roadmap.features[report.featureDirectory ?? '']?.milestone).toBe('v1.0');
	});

	test('assigns feature requests to the active milestone when no next milestone exists', async () => {
		const { projectDir } = await createProject();
		await writeFeature(projectDir, 'feature-mvp-open', false);
		await writeRoadmap(projectDir, {
			milestones: { MVP: {} },
			features: { 'feature-mvp-open': { milestone: 'MVP' } },
		});

		const report = await submitProjectReport(projectDir, {
			description: 'Add saved dashboard filters.',
			kind: 'feature',
		});
		const roadmap = await readRoadmap(projectDir);

		expect(roadmap.features[report.featureDirectory ?? '']?.milestone).toBe('MVP');
	});

	test('commits the generated feature and roadmap as one bundle', async () => {
		const { projectDir } = await createGitProject();

		const report = await submitProjectReport(projectDir, {
			description: 'The dashboard button does not respond.',
			kind: 'bug',
		});
		const subject = (
			await runGit(projectDir, ['log', '-1', '--pretty=format:%s'])
		).stdout.trim();
		const files = committedFiles(
			(await runGit(projectDir, ['log', '-1', '--name-only', '--pretty=format:'])).stdout,
		);

		expect(subject).toBe(`chore(aidd): add remediation ${report.featureId} from web report`);
		expect(files).toEqual(
			['.aidd/roadmap.json', `.aidd/features/${report.featureId}/feature.json`].sort(),
		);
		// Nothing left dirty: the files were committed in their formatted form.
		expect((await runGit(projectDir, ['status', '--porcelain'])).stdout.trim()).toBe('');
	});

	test('uses the feature noun in the commit message for feature submissions', async () => {
		const { projectDir } = await createGitProject();

		const report = await submitProjectReport(projectDir, {
			description: 'Add saved dashboard filters.',
			kind: 'feature',
		});
		const subject = (
			await runGit(projectDir, ['log', '-1', '--pretty=format:%s'])
		).stdout.trim();

		expect(subject).toBe(`chore(aidd): add feature ${report.featureId} from web report`);
	});

	test('does not sweep unrelated working-tree changes into the bundle', async () => {
		const { projectDir } = await createGitProject();
		// Dirty an unrelated tracked file before submitting.
		await Bun.write(
			join(projectDir, '.aidd', 'features', 'feature-mvp-open', 'feature.json'),
			JSON.stringify({
				dependencies: [],
				id: 'feature-mvp-open',
				passes: false,
				status: 'in_progress',
			}),
		);

		const report = await submitProjectReport(projectDir, {
			description: 'The dashboard button does not respond.',
			kind: 'bug',
		});
		const files = committedFiles(
			(await runGit(projectDir, ['log', '-1', '--name-only', '--pretty=format:'])).stdout,
		);

		expect(files).toEqual(
			['.aidd/roadmap.json', `.aidd/features/${report.featureId}/feature.json`].sort(),
		);
		// The unrelated edit is left uncommitted, not folded into the report bundle.
		const status = (
			await runGit(projectDir, [
				'status',
				'--porcelain',
				'--',
				'.aidd/features/feature-mvp-open/feature.json',
			])
		).stdout.trim();
		expect(status).not.toBe('');
	});

	test('returns the report entry without committing when the project is not a git repo', async () => {
		const { projectDir } = await createProject();

		const report = await submitProjectReport(projectDir, {
			description: 'The dashboard button does not respond.',
			kind: 'bug',
		});

		expect(report.featureId).toMatch(/^remediation-\d{8}-/);
		expect(
			await fileExists(join(projectDir, '.aidd', 'features', report.featureDirectory ?? '')),
		).toBe(true);
	});

	test('rejects invalid and escaped project identifiers before report access', async () => {
		const { root } = await createProject();
		const outsideRoot = await testTempDir('aidd-project-outside-');
		const outsideProject = join(outsideRoot, 'outside');
		await mkdir(join(outsideProject, '.aidd'), { recursive: true });
		const service = new ProjectService(webConfig(root));

		await expect(service.resolveDiscoveredProject('not-valid-base64')).rejects.toThrow(
			'Project not found',
		);
		await expect(
			service.resolveDiscoveredProject(encodeProjectId(outsideProject)),
		).rejects.toThrow('Project not found');
	});
});
