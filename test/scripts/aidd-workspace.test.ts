import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
	applyRoadmap,
	collectFeatureStatus,
	discoverAiddProjects,
	summarizeFeatureStatus,
} from '../../scripts/lib/aidd-workspace.ts';

import { testTempDir } from '../_helpers/temp.ts';
const tempRoots: string[] = [];
const repositoryRoot = join(import.meta.dir, '..', '..');

async function tempRoot(name: string): Promise<string> {
	const root = await testTempDir(`aidd-${name}-`);
	tempRoots.push(root);
	return root;
}

afterEach(async () => {
	await Promise.all(
		tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, '\t')}\n`);
}

async function writeRaw(path: string, value: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, value);
}

async function writeFeature(
	projectDir: string,
	directory: string,
	feature: Record<string, unknown> = {},
): Promise<void> {
	await writeJson(join(projectDir, '.aidd', 'features', directory, 'feature.json'), {
		id: directory,
		passes: false,
		status: 'backlog',
		...feature,
	});
}

async function readFeature(
	projectDir: string,
	directory: string,
): Promise<Record<string, unknown>> {
	const raw = await readFile(
		join(projectDir, '.aidd', 'features', directory, 'feature.json'),
		'utf8',
	);
	return JSON.parse(raw) as Record<string, unknown>;
}

async function runAiddTools(
	args: string[],
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
	const proc = Bun.spawn(['bun', join(repositoryRoot, 'scripts', 'aidd-tools.ts'), ...args], {
		cwd: repositoryRoot,
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { exitCode, stderr, stdout };
}

describe('aidd workspace discovery', () => {
	test('discovers direct child projects and supports application filters', async () => {
		const root = await tempRoot('discovery');
		await mkdir(join(root, 'app-one', '.aidd', 'features'), { recursive: true });
		await mkdir(join(root, 'app-two', '.aidd'), { recursive: true });
		await mkdir(join(root, 'logs', '.aidd'), { recursive: true });
		await mkdir(join(root, 'archived.old', '.aidd'), { recursive: true });
		await mkdir(join(root, 'aidd', 'scaffolding', 'template', '.aidd', 'features'), {
			recursive: true,
		});

		const projects = await discoverAiddProjects({ applicationsRoot: root });
		const featureProjects = await discoverAiddProjects({
			applicationsRoot: root,
			requireFeaturesDir: true,
		});
		const filtered = await discoverAiddProjects({
			applications: ['missing', 'app-two'],
			applicationsRoot: root,
		});

		expect(projects.map((project) => project.name)).toEqual(['app-one', 'app-two']);
		expect(featureProjects.map((project) => project.name)).toEqual(['app-one']);
		expect(filtered.map((project) => project.name)).toEqual(['app-two']);
	});
});

describe('feature status collection', () => {
	test('classifies feature types and summarizes pending/completed counts', async () => {
		const root = await tempRoot('status');
		const projectDir = join(root, 'demo');
		await writeFeature(projectDir, 'audit-security-1779339974-cross-drive', {
			auditSource: 'SECURITY',
			passes: false,
			status: 'completed',
		});
		await writeFeature(projectDir, 'remediation-20260522-fix-runtime', {
			status: 'completed',
		});
		await writeFeature(projectDir, 'feature-20260522-add-export');
		await writeFeature(projectDir, 'custom-feature', {
			passes: true,
			status: 'completed',
		});

		const entries = await collectFeatureStatus({ applicationsRoot: root });
		const pending = await collectFeatureStatus({
			applicationsRoot: root,
			state: 'pending',
			types: ['audit', 'feature'],
		});
		const [summary] = summarizeFeatureStatus(entries);

		expect(entries).toHaveLength(4);
		expect(pending.map((entry) => entry.type).sort()).toEqual(['audit', 'feature']);
		expect(summary).toMatchObject({
			application: 'demo',
			audit: 1,
			completed: 2,
			feature: 2,
			pending: 2,
			remediation: 1,
			total: 4,
		});
	});

	test('prints summary output as an aligned table', async () => {
		const root = await tempRoot('status-output');
		const demoDir = join(root, 'demo');
		const licenseDir = join(root, 'sample-license-cli');
		await writeFeature(demoDir, 'audit-security-1779339974-cross-drive', {
			auditSource: 'SECURITY',
			passes: true,
			status: 'completed',
		});
		await writeFeature(demoDir, 'feature-20260522-add-export');
		await writeFeature(licenseDir, 'remediation-20260522-fix-runtime');

		const { exitCode, stderr, stdout } = await runAiddTools([
			'features:status',
			'--applications-root',
			root,
			'--summary',
		]);

		expect(exitCode).toBe(0);
		expect(stderr).toBe('');
		expect(stdout).not.toContain('\t');
		expect(stdout.trimEnd().split('\n')).toEqual([
			'Application         Audit  Remediation  Feature  Pending  Completed  Total',
			'demo                    1            0        1        1          1      2',
			'sample-license-cli      0            1        0        1          0      1',
		]);
	});

	test('prints feature status rows as application plus feature directory', async () => {
		const root = await tempRoot('status-rows');
		const aiddDir = join(root, 'aidd');
		const licenseDir = join(root, 'sample-license-cli');
		await writeFeature(aiddDir, 'audit-security-1779339974-cross-drive', {
			auditSource: 'SECURITY',
			passes: false,
			status: 'completed',
		});
		await writeFeature(licenseDir, 'remediation-20260522-fix-runtime');

		const { exitCode, stderr, stdout } = await runAiddTools([
			'features:status',
			'--applications-root',
			root,
			'--pending',
			'--type',
			'audit,remediation',
		]);

		expect(exitCode).toBe(0);
		expect(stderr).toBe('');
		expect(stdout).not.toContain('\t');
		expect(stdout.trimEnd().split('\n')).toEqual([
			'aidd               audit-security-1779339974-cross-drive',
			'sample-license-cli remediation-20260522-fix-runtime',
		]);
	});
});

describe('roadmap apply', () => {
	test('supports dry-run and applies priority plus dependency ids', async () => {
		const root = await tempRoot('roadmap');
		const projectDir = join(root, 'demo');
		await writeFeature(projectDir, 'feature-base', {
			dependencies: [],
			priority: 9,
		});
		await writeFeature(projectDir, 'feature-child', {
			id: 'child-feature-id',
		});
		await writeJson(join(projectDir, '.aidd', 'roadmap.json'), {
			features: {
				'feature-base': { dependencies: [], milestone: 'MVP' },
				'feature-child': { dependencies: ['feature-base'], milestone: 'v1.0' },
			},
			milestones: {
				MVP: { description: 'minimum', priority: 1 },
				'v1.0': { description: 'release', priority: 2 },
			},
		});

		const dryRun = await applyRoadmap(projectDir, { dryRun: true });
		const beforeApply = await readFeature(projectDir, 'feature-base');
		const applied = await applyRoadmap(projectDir, {
			now: new Date('2026-05-22T12:34:56.789Z'),
		});
		const base = await readFeature(projectDir, 'feature-base');
		const child = await readFeature(projectDir, 'feature-child');

		expect(dryRun.updated).toBe(2);
		expect(beforeApply.priority).toBe(9);
		expect(applied).toMatchObject({ errors: [], skipped: 0, updated: 2 });
		expect(base).toMatchObject({
			dependencies: [],
			priority: 1,
			updatedAt: '2026-05-22T12:34:56.000Z',
		});
		expect(child).toMatchObject({
			dependencies: ['feature-base'],
			priority: 2,
			updatedAt: '2026-05-22T12:34:56.000Z',
		});
	});

	test('preserves omitted dependencies while applying explicit dependency lists', async () => {
		const root = await tempRoot('roadmap-dependency-intent');
		const projectDir = join(root, 'demo');
		await writeFeature(projectDir, 'feature-base');
		await writeFeature(projectDir, 'feature-preserved', {
			dependencies: ['feature-base'],
			priority: 1,
			updatedAt: '2026-05-01T00:00:00.000Z',
		});
		await writeFeature(projectDir, 'feature-cleared', {
			dependencies: ['feature-base'],
			priority: 1,
		});
		await writeFeature(projectDir, 'feature-replaced', {
			dependencies: [],
			priority: 1,
		});
		await writeJson(join(projectDir, '.aidd', 'roadmap.json'), {
			features: {
				'feature-cleared': { dependencies: [], milestone: 'MVP' },
				'feature-preserved': { milestone: 'MVP' },
				'feature-replaced': {
					dependencies: ['feature-base', 'missing-feature'],
					milestone: 'MVP',
				},
			},
			milestones: { MVP: { priority: 1 } },
		});

		const dryRun = await applyRoadmap(projectDir, { dryRun: true });
		const applied = await applyRoadmap(projectDir, {
			now: new Date('2026-05-22T12:34:56.789Z'),
		});
		const preserved = await readFeature(projectDir, 'feature-preserved');
		const cleared = await readFeature(projectDir, 'feature-cleared');
		const replaced = await readFeature(projectDir, 'feature-replaced');
		const cliResult = await runAiddTools([
			'roadmap:apply',
			'--project-dir',
			projectDir,
			'--dry-run',
		]);

		expect(dryRun).toMatchObject({
			dependenciesPreserved: 1,
			dependenciesWritten: 2,
			skipped: 1,
			updated: 2,
		});
		expect(applied).toMatchObject({
			dependenciesPreserved: 1,
			dependenciesWritten: 2,
			skipped: 1,
			updated: 2,
		});
		expect(applied.warnings).toEqual([
			"Dependency 'missing-feature' has no matching feature directory; skipping",
		]);
		expect(preserved).toMatchObject({
			dependencies: ['feature-base'],
			priority: 1,
			updatedAt: '2026-05-01T00:00:00.000Z',
		});
		expect(cleared).toMatchObject({
			dependencies: [],
			priority: 1,
			updatedAt: '2026-05-22T12:34:56.000Z',
		});
		expect(replaced).toMatchObject({
			dependencies: ['feature-base'],
			priority: 1,
			updatedAt: '2026-05-22T12:34:56.000Z',
		});
		expect(cliResult.exitCode).toBe(0);
		expect(cliResult.stdout).toContain('Dependencies written:   2');
		expect(cliResult.stdout).toContain('Dependencies preserved: 1');
	});

	test('warns and skips missing dependency targets', async () => {
		const root = await tempRoot('roadmap-deps');
		const projectDir = join(root, 'demo');
		await writeFeature(projectDir, 'feature-child', {
			dependencies: [],
			priority: 1,
		});
		await writeJson(join(projectDir, '.aidd', 'roadmap.json'), {
			features: {
				'feature-child': { dependencies: ['missing-feature'], milestone: 'MVP' },
			},
			milestones: { MVP: { priority: 1 } },
		});

		const summary = await applyRoadmap(projectDir, { dryRun: true });

		expect(summary.errors).toEqual([]);
		expect(summary.warnings).toEqual([
			"Dependency 'missing-feature' has no matching feature directory; skipping",
		]);
		expect(summary.skipped).toBe(1);
	});

	test('reports unknown roadmap mappings and missing feature directories as hard errors', async () => {
		const root = await tempRoot('roadmap-errors');
		const projectDir = join(root, 'demo');
		await writeFeature(projectDir, 'feature-valid');
		await writeJson(join(projectDir, '.aidd', 'roadmap.json'), {
			features: {
				'feature-missing': { dependencies: [], milestone: 'MVP' },
				'feature-valid': { dependencies: [], milestone: 'v9' },
			},
			milestones: { MVP: { priority: 1 } },
		});

		const summary = await applyRoadmap(projectDir);

		expect(summary.updated).toBe(0);
		expect(summary.missing).toBe(1);
		expect(summary.errors).toEqual([
			"Feature 'feature-missing': directory not found",
			"Feature 'feature-valid': unknown milestone 'v9'",
		]);
	});

	test('throws on invalid roadmap json and missing milestone priorities', async () => {
		const invalidRoot = await tempRoot('roadmap-invalid');
		const invalidProject = join(invalidRoot, 'invalid');
		await mkdir(join(invalidProject, '.aidd', 'features'), { recursive: true });
		await writeRaw(join(invalidProject, '.aidd', 'roadmap.json'), '{');

		await expect(applyRoadmap(invalidProject)).rejects.toThrow('Invalid JSON');

		const missingPriorityRoot = await tempRoot('roadmap-priority');
		const missingPriorityProject = join(missingPriorityRoot, 'missing-priority');
		await mkdir(join(missingPriorityProject, '.aidd', 'features'), { recursive: true });
		await writeJson(join(missingPriorityProject, '.aidd', 'roadmap.json'), {
			features: {},
			milestones: { MVP: {} },
		});

		await expect(applyRoadmap(missingPriorityProject)).rejects.toThrow(
			"Milestone 'MVP' is missing a priority value",
		);
	});
});
