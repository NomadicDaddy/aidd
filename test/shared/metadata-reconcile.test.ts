import { describe, expect, test } from 'bun:test';
import { reconcileProjectMetadata } from 'aidd-shared/metadata/reconcile';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { testTempDir } from '../_helpers/temp.ts';

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, '\t')}\n`);
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

async function project(): Promise<string> {
	const projectDir = await testTempDir('aidd-reconcile-');
	await writeJson(join(projectDir, '.aidd', 'features', 'feature-base', 'feature.json'), {
		description: 'base work',
		id: 'feature-base',
		priority: 9,
		status: 'completed',
		title: 'Base',
	});
	await writeJson(join(projectDir, '.aidd', 'features', 'feature-child', 'feature.json'), {
		description: 'child work',
		id: 'child-feature-id',
		priority: 9,
		status: 'completed',
		title: 'Child',
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
	return projectDir;
}

describe('reconcileProjectMetadata', () => {
	test('propagates milestone priority and resolves dependencies by directory', async () => {
		const projectDir = await project();
		const result = await reconcileProjectMetadata(new FileAiddStore(projectDir));

		expect(result).toMatchObject({ dependenciesWritten: 2, errors: [], total: 2, updated: 2 });
		expect(await readFeature(projectDir, 'feature-base')).toMatchObject({
			dependencies: [],
			priority: 1,
		});
		// The roadmap names the *directory* `feature-base`; the record must reference its *id*.
		expect(await readFeature(projectDir, 'feature-child')).toMatchObject({
			dependencies: ['feature-base'],
			priority: 2,
		});
	});

	test('is idempotent — a second pass rewrites nothing', async () => {
		const projectDir = await project();
		await reconcileProjectMetadata(new FileAiddStore(projectDir));
		const second = await reconcileProjectMetadata(new FileAiddStore(projectDir));

		expect(second).toMatchObject({ dependenciesWritten: 0, errors: [], updated: 0 });
	});

	test('warns about a dependency with no matching feature directory', async () => {
		const projectDir = await project();
		await writeJson(join(projectDir, '.aidd', 'roadmap.json'), {
			features: { 'feature-base': { dependencies: ['ghost'], milestone: 'MVP' } },
			milestones: { MVP: { priority: 1 } },
		});
		const result = await reconcileProjectMetadata(new FileAiddStore(projectDir));

		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([
			"Dependency 'ghost' has no matching feature directory; skipping",
		]);
		expect(await readFeature(projectDir, 'feature-base')).toMatchObject({ dependencies: [] });
	});

	// All-or-nothing: half-applying a drifted roadmap leaves the records harder to read than the
	// state that was reported.
	test('writes nothing when the roadmap names a missing directory', async () => {
		const projectDir = await project();
		await writeJson(join(projectDir, '.aidd', 'roadmap.json'), {
			features: {
				'feature-base': { milestone: 'MVP' },
				ghost: { milestone: 'MVP' },
			},
			milestones: { MVP: { priority: 1 } },
		});
		const result = await reconcileProjectMetadata(new FileAiddStore(projectDir));

		expect(result.errors).toEqual(["Feature 'ghost': directory not found"]);
		expect(result.updated).toBe(0);
		expect(await readFeature(projectDir, 'feature-base')).toMatchObject({ priority: 9 });
	});

	test('reports an unknown milestone instead of guessing a priority', async () => {
		const projectDir = await project();
		await writeJson(join(projectDir, '.aidd', 'roadmap.json'), {
			features: { 'feature-base': { milestone: 'nope' } },
			milestones: { MVP: { priority: 1 } },
		});
		const result = await reconcileProjectMetadata(new FileAiddStore(projectDir));

		expect(result.errors).toEqual([
			"Feature 'feature-base': unknown or unprioritized milestone 'nope'",
		]);
	});

	// A project with no roadmap still gets the --check-features half.
	test('validates feature contracts even without a roadmap', async () => {
		const projectDir = await testTempDir('aidd-reconcile-noroadmap-');
		await writeJson(join(projectDir, '.aidd', 'features', 'feature-base', 'feature.json'), {
			description: 'base work',
			id: 'feature-base',
			status: 'completed',
			title: 'Base',
		});
		const result = await reconcileProjectMetadata(new FileAiddStore(projectDir));

		expect(result).toMatchObject({ errors: [], total: 0, updated: 0 });
		expect(result.validation.total).toBe(1);
	});

	// Absent and unreadable are different problems. Nothing else checks the roadmap now that the
	// skills no longer shell out to `--check-features`, so a corrupt one has to surface here.
	test('reports a roadmap that exists and will not parse', async () => {
		const projectDir = await project();
		await writeFile(join(projectDir, '.aidd', 'roadmap.json'), '{ "features": ');
		const result = await reconcileProjectMetadata(new FileAiddStore(projectDir));

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toStartWith('roadmap.json could not be read:');
		expect(await readFeature(projectDir, 'feature-base')).toMatchObject({ priority: 9 });
	});

	test('reports a roadmap that parses but does not match the schema', async () => {
		const projectDir = await project();
		await writeJson(join(projectDir, '.aidd', 'roadmap.json'), { features: 'not-an-object' });
		const result = await reconcileProjectMetadata(new FileAiddStore(projectDir));

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toStartWith('roadmap.json could not be read:');
	});

	// The message lands in a run summary line; a zod blob or a JSON snippet would swamp it.
	test('flattens a roadmap failure to one bounded line', async () => {
		const projectDir = await project();
		await writeJson(join(projectDir, '.aidd', 'roadmap.json'), { features: 'not-an-object' });
		const [error] = (await reconcileProjectMetadata(new FileAiddStore(projectDir))).errors;

		expect(error).not.toContain('\n');
		expect(error!.length).toBeLessThanOrEqual(240);
	});

	test('treats a project with no roadmap as having nothing to propagate', async () => {
		const projectDir = await testTempDir('aidd-reconcile-absent-');
		await writeJson(join(projectDir, '.aidd', 'features', 'feature-base', 'feature.json'), {
			description: 'base work',
			id: 'feature-base',
			status: 'backlog',
			title: 'Base',
		});
		const result = await reconcileProjectMetadata(new FileAiddStore(projectDir));

		expect(result.errors).toEqual([]);
	});

	// A read-only run promises the operator it leaves the project alone, and a `.aidd` record is
	// part of the project — bookkeeping is not an exemption from that promise.
	test('reports drift without writing when the pass is read-only', async () => {
		const projectDir = await project();
		const result = await reconcileProjectMetadata(new FileAiddStore(projectDir), {
			write: false,
		});

		expect(result).toMatchObject({ errors: [], skippedWrites: 2, updated: 0 });
		expect(await readFeature(projectDir, 'feature-base')).toMatchObject({ priority: 9 });
		expect(await readFeature(projectDir, 'feature-child')).not.toHaveProperty('dependencies');
	});

	test('reports no drift on a read-only pass over an already-reconciled project', async () => {
		const projectDir = await project();
		await reconcileProjectMetadata(new FileAiddStore(projectDir));
		const result = await reconcileProjectMetadata(new FileAiddStore(projectDir), {
			write: false,
		});

		expect(result).toMatchObject({ skippedWrites: 0, updated: 0 });
	});
});
