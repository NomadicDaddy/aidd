import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { selectNextFeature } from 'aidd-shared/metadata/features';

const tmpRoot = join(import.meta.dir, '..', '..', '.tmp-tests');

async function makeStore(name: string): Promise<FileAiddStore> {
	const projectDir = join(tmpRoot, name);
	await mkdir(join(projectDir, '.aidd', 'features'), { recursive: true });
	return new FileAiddStore(projectDir);
}

afterEach(async () => {
	await rm(tmpRoot, { recursive: true, force: true });
});

describe('FileAiddStore feature compatibility', () => {
	test('lists features with directory metadata and field filters', async () => {
		const store = await makeStore('filters');
		await store.writeFeature({
			id: 'feature-api',
			title: 'API',
			category: 'Backend',
			priority: 1,
			status: 'backlog',
			passes: false,
		});
		await store.writeFeature({
			id: 'feature-ui',
			title: 'UI',
			category: 'Frontend',
			priority: 2,
			status: 'completed',
			passes: true,
		});

		const backend = await store.listFeatures({
			filters: [{ field: 'category', value: 'Backend' }],
		});
		expect(backend.map((feature) => feature.directory)).toEqual(['feature-api']);
	});

	test('excludes audit findings by default for coding feature lists', async () => {
		const store = await makeStore('audit-exclusion');
		await store.writeFeature({ id: 'feature-core', status: 'backlog', passes: false });
		await store.writeFeature({ id: 'audit-mode-processing', status: 'backlog', passes: false });
		await store.writeFeature({
			id: 'audit-security-100-existing',
			status: 'backlog',
			passes: false,
			auditSource: 'SECURITY',
		});

		expect((await store.listFeatures()).map((feature) => feature.id)).toEqual([
			'audit-mode-processing',
			'feature-core',
		]);
		expect(
			(await store.listFeatures({ includeAudit: true })).map((feature) => feature.id)
		).toEqual(['audit-mode-processing', 'audit-security-100-existing', 'feature-core']);
	});

	test('matches wildcard filters when audit findings are explicitly included', async () => {
		const store = await makeStore('audit-wildcard');
		await store.writeFeature({ id: 'feature-core', status: 'backlog', passes: false });
		await store.writeFeature({
			id: 'audit-security-100-existing',
			status: 'backlog',
			passes: false,
			auditSource: 'SECURITY',
		});

		const matches = await store.listFeatures({
			includeAudit: true,
			filters: [{ field: 'id', value: 'audit-*' }],
		});
		expect(matches.map((feature) => feature.id)).toEqual(['audit-security-100-existing']);
	});

	test('summarizes status counts and category priority buckets', async () => {
		const store = await makeStore('stats');
		await store.writeFeature({
			id: 'feature-core',
			category: 'Core',
			priority: 1,
			status: 'backlog',
			passes: false,
		});
		await store.writeFeature({
			id: 'feature-ui',
			category: 'UI',
			priority: 3,
			status: 'completed',
			passes: true,
		});
		await store.writeFeature({
			id: 'feature-blocked',
			category: 'Core',
			priority: 2,
			status: 'waiting_approval',
			passes: false,
		});

		const stats = await store.getFeatureStats();
		expect(stats.total).toBe(3);
		expect(stats.passing).toBe(1);
		expect(stats.failing).toBe(1);
		expect(stats.waitingApproval).toBe(1);
		expect(stats.byCategoryPriority.find((bucket) => bucket.category === 'Core')?.p1).toBe(1);
	});

	test('selects in-progress before backlog and skips waiting approval', async () => {
		const store = await makeStore('selection');
		await store.writeFeature({
			id: 'feature-waiting',
			priority: 1,
			status: 'waiting_approval',
			passes: false,
		});
		await store.writeFeature({
			id: 'feature-backlog',
			priority: 1,
			status: 'backlog',
			passes: false,
		});
		await store.writeFeature({
			id: 'feature-progress',
			priority: 4,
			status: 'in_progress',
			passes: false,
		});

		const selected = selectNextFeature(await store.listFeatures());
		expect(selected?.id).toBe('feature-progress');
	});

	test('skips features with unmet dependencies', async () => {
		const store = await makeStore('dependency-selection');
		await store.writeFeature({
			id: 'feature-dependency',
			priority: 1,
			status: 'backlog',
			passes: false,
		});
		await store.writeFeature({
			id: 'feature-blocked',
			priority: 1,
			status: 'backlog',
			passes: false,
			dependencies: ['feature-dependency'],
		});
		await store.writeFeature({
			id: 'feature-ready',
			priority: 9,
			status: 'backlog',
			passes: false,
		});

		const features = await store.listFeatures();
		const selected = selectNextFeature(features);
		expect(selected?.id).toBe('feature-dependency');

		await store.writeFeature({
			id: 'feature-dependency',
			priority: 1,
			status: 'completed',
			passes: true,
		});

		const afterDependency = await store.listFeatures();
		const unblocked = selectNextFeature(afterDependency);
		expect(unblocked?.id).toBe('feature-blocked');
	});

	test('writes numbered iteration log and structured JSON artifacts', async () => {
		const store = await makeStore('iterations');
		await store.writeIteration({ log: 'first', structured: { ok: true } });
		await store.writeIteration({ log: 'second' });

		const first = await readFile(join(store.metadataDir, 'iterations', '001.log'), 'utf8');
		const second = await readFile(join(store.metadataDir, 'iterations', '002.log'), 'utf8');
		const structured = JSON.parse(
			await readFile(join(store.metadataDir, 'iterations', '001.json'), 'utf8')
		) as { ok: boolean };
		expect(first).toBe('first');
		expect(second).toBe('second');
		expect(structured.ok).toBe(true);
	});

	test('validates feature contracts and writes artifact check file', async () => {
		const store = await makeStore('validation');
		await store.writeFeature({ id: 'feature-good', status: 'completed', passes: true });
		await mkdir(store.metadataDir, { recursive: true });
		await writeFile(join(store.projectDir, 'CONTEXT.md'), '# Context\n');
		await writeFile(join(store.metadataDir, 'spec.md'), '# Spec\n');
		await writeFile(join(store.metadataDir, 'project.md'), '# Project\n');
		await writeFile(join(store.metadataDir, 'CHANGELOG.md'), '# Changelog\n');

		const validation = await store.validateFeatures();
		const artifacts = await store.checkArtifacts();

		expect(validation.valid).toBe(true);
		expect(artifacts.valid).toBe(true);
		const artifactCheck = JSON.parse(
			await readFile(join(store.metadataDir, '.artifacts-check.json'), 'utf8')
		) as {
			summary?: { requiredMissing?: number };
			artifacts?: {
				'CONTEXT.md'?: { exists?: boolean; path?: string };
				'project.md'?: { exists?: boolean };
				'spec.md'?: { exists?: boolean };
			};
		};
		expect(artifactCheck.summary?.requiredMissing).toBe(0);
		expect(artifactCheck.artifacts?.['CONTEXT.md']?.exists).toBe(true);
		expect(artifactCheck.artifacts?.['CONTEXT.md']?.path).toBe('CONTEXT.md');
		expect(artifactCheck.artifacts?.['project.md']?.exists).toBe(true);
		expect(artifactCheck.artifacts?.['spec.md']?.exists).toBe(true);
	});

	test('tolerates missing required artifacts on a pre-onboarding legacy ingest', async () => {
		const store = await makeStore('legacy-ingest');
		// A freshly ingested existing codebase: source files present, but no .aidd/spec.md yet
		// (onboarding creates it later). This is the exact shape intake exists for.
		await writeFile(join(store.projectDir, 'app.py'), 'print("hi")\n');

		const artifacts = await store.checkArtifacts();

		expect(artifacts.phase).toBe('onboarding');
		expect(artifacts.preOnboarding).toBe(true);
		expect(artifacts.missing).toContain('spec.md');
		expect(artifacts.missing).toContain('CONTEXT.md');
		// Required artifacts are missing, but the check stays green so intake never reports a failed
		// step on the projects it is designed for.
		expect(artifacts.summary.requiredMissing).toBeGreaterThan(0);
		expect(artifacts.valid).toBe(true);
		const artifactCheck = JSON.parse(
			await readFile(join(store.metadataDir, '.artifacts-check.json'), 'utf8')
		) as { phase?: string; preOnboarding?: boolean };
		expect(artifactCheck.phase).toBe('onboarding');
		expect(artifactCheck.preOnboarding).toBe(true);
	});

	test('fails loudly when a coding-phase aidd project is missing a required artifact', async () => {
		const store = await makeStore('coding-broken');
		await store.writeFeature({ id: 'feature-core', status: 'completed', passes: true });
		await writeFile(join(store.metadataDir, 'spec.md'), '# Spec\n');
		await writeFile(join(store.metadataDir, 'CHANGELOG.md'), '# Changelog\n');
		// CONTEXT.md (required) is deliberately absent while the project is fully onboarded.

		const artifacts = await store.checkArtifacts();

		expect(artifacts.phase).toBe('coding');
		expect(artifacts.preOnboarding).toBe(false);
		expect(artifacts.missing).toContain('CONTEXT.md');
		expect(artifacts.valid).toBe(false);
	});

	test('writeFeature rejects statuses outside the canonical vocabulary', async () => {
		const store = await makeStore('invalid-status-write');
		await expect(
			store.writeFeature({ id: 'feature-stray', status: 'done', passes: true })
		).rejects.toThrow(/Invalid feature status 'done'.*backlog, in_progress, completed/);
		const features = await store.listFeatures();
		expect(features).toHaveLength(0);
	});

	test('validation flags on-disk features with non-canonical statuses', async () => {
		const store = await makeStore('invalid-status-validate');
		// Bypass writeFeature (which now refuses these) to simulate data written by an
		// external agent, the way 'done'/'verified' strays entered real projects.
		for (const [id, status] of [
			['feature-done', 'done'],
			['feature-verified', 'verified'],
		] as const) {
			await mkdir(join(store.metadataDir, 'features', id), { recursive: true });
			await writeFile(
				join(store.metadataDir, 'features', id, 'feature.json'),
				`${JSON.stringify({ id, passes: true, status }, null, 2)}\n`
			);
		}

		const validation = await store.validateFeatures();
		expect(validation.valid).toBe(false);
		const messages = validation.issues.map((issue) => issue.message);
		expect(messages).toContain('Invalid status: done');
		expect(messages).toContain('Invalid status: verified');
	});

	test('feature stats never count a non-canonical status as closed', async () => {
		const store = await makeStore('invalid-status-stats');
		await store.writeFeature({ id: 'feature-real', status: 'completed', passes: true });
		const id = 'feature-stray-done';
		await mkdir(join(store.metadataDir, 'features', id), { recursive: true });
		await writeFile(
			join(store.metadataDir, 'features', id, 'feature.json'),
			`${JSON.stringify({ id, passes: true, status: 'done' }, null, 2)}\n`
		);

		const stats = await store.getFeatureStats();
		expect(stats.total).toBe(2);
		expect(stats.closed).toBe(1);
	});

	test('flags duplicate feature ids across directories', async () => {
		const store = await makeStore('duplicate-ids');
		await store.writeFeature({ id: 'feature-shared', status: 'backlog', passes: false });
		// Bypass writeFeature to plant a second directory carrying the same id, simulating a
		// hand-edited duplicate that --check-features must catch.
		const duplicateDir = join(store.metadataDir, 'features', 'feature-shared-copy');
		await mkdir(duplicateDir, { recursive: true });
		await writeFile(
			join(duplicateDir, 'feature.json'),
			`${JSON.stringify({ id: 'feature-shared', status: 'backlog', passes: false })}\n`
		);

		const validation = await store.validateFeatures();

		expect(validation.valid).toBe(false);
		const messages = validation.issues.map((issue) => issue.message);
		expect(
			messages.some((message) => message.includes("Duplicate feature id 'feature-shared'"))
		).toBe(true);
		const flaggedDirectories = new Set(
			validation.issues
				.filter((issue) =>
					issue.message.startsWith("Duplicate feature id 'feature-shared'")
				)
				.map((issue) => issue.id)
		);
		expect(flaggedDirectories).toEqual(new Set(['feature-shared', 'feature-shared-copy']));
	});

	test('flags feature id that does not match its directory name', async () => {
		const store = await makeStore('id-directory-mismatch');
		await store.writeFeature({ id: 'feature-real', status: 'backlog', passes: false });
		// Plant a feature.json whose id disagrees with its containing directory name.
		const mismatchDir = join(store.metadataDir, 'features', 'feature-directory');
		await mkdir(mismatchDir, { recursive: true });
		await writeFile(
			join(mismatchDir, 'feature.json'),
			`${JSON.stringify({ id: 'feature-id', status: 'backlog', passes: false })}\n`
		);

		const validation = await store.validateFeatures();

		expect(validation.valid).toBe(false);
		const mismatchIssue = validation.issues.find(
			(issue) => issue.id === 'feature-directory' && issue.message.includes('does not match')
		);
		expect(mismatchIssue?.message).toContain("Feature id 'feature-id'");
		expect(mismatchIssue?.message).toContain("'feature-directory'");
	});

	test('warns about open features with duplicate normalized titles', async () => {
		const store = await makeStore('duplicate-open-titles');
		await store.writeFeature({
			id: 'feature-alpha',
			title: 'Fix Slow Search Endpoint',
			status: 'backlog',
			passes: false,
		});
		await store.writeFeature({
			id: 'feature-beta',
			title: 'fix slow search endpoint',
			status: 'in_progress',
			passes: false,
		});
		await store.writeFeature({
			id: 'feature-completed',
			title: 'Fix Slow Search Endpoint',
			status: 'completed',
			passes: true,
			affectedFiles: ['backend/src/search.ts'],
		});
		await store.writeFeature({
			id: 'feature-unique',
			title: 'Add export button',
			status: 'backlog',
			passes: false,
		});

		const validation = await store.validateFeatures();

		expect(validation.valid).toBe(true);
		const warningIds = new Set((validation.warnings ?? []).map((warning) => warning.id));
		expect(warningIds).toEqual(new Set(['feature-alpha', 'feature-beta']));
		expect(
			(validation.warnings ?? []).every((warning) =>
				warning.message.includes('Open feature title likely duplicates other open features')
			)
		).toBe(true);
	});

	test('accepts unique feature collection without duplicate warnings', async () => {
		const store = await makeStore('unique-feature-collection');
		await store.writeFeature({
			id: 'feature-one',
			title: 'Add bulk import',
			status: 'backlog',
			passes: false,
		});
		await store.writeFeature({
			id: 'feature-two',
			title: 'Add export button',
			status: 'backlog',
			passes: false,
		});

		const validation = await store.validateFeatures();

		expect(validation.valid).toBe(true);
		expect(validation.warnings).toBeUndefined();
	});

	test('flags passes true backlog mismatch', async () => {
		const store = await makeStore('invalid-feature');
		await store.writeFeature({ id: 'feature-bad', status: 'backlog', passes: true });

		const validation = await store.validateFeatures();
		expect(validation.valid).toBe(false);
		expect(validation.issues[0]?.message).toContain('passes=true');
	});

	test('requires resolution notes for completed remediation features', async () => {
		const store = await makeStore('completed-remediation-notes');
		await store.writeFeature({
			id: 'remediation-20260518-resolution-note',
			status: 'completed',
			passes: true,
		});

		const validation = await store.validateFeatures();

		expect(validation.valid).toBe(false);
		expect(validation.issues[0]).toMatchObject({
			id: 'remediation-20260518-resolution-note',
			message:
				'Completed audit/remediation features with passes=true must include a non-empty notes resolution',
		});
	});

	test('requires non-empty resolution notes for completed audit findings', async () => {
		const store = await makeStore('completed-audit-empty-notes');
		await store.writeFeature({
			id: 'audit-security-20260518-resolution-note',
			status: 'completed',
			passes: true,
			auditSource: 'SECURITY',
			notes: [''],
		});

		const validation = await store.validateFeatures();

		expect(validation.valid).toBe(false);
		expect(validation.issues[0]?.message).toContain('non-empty notes resolution');
	});

	test('accepts completed audit and remediation features with resolution notes', async () => {
		const store = await makeStore('completed-audit-remediation-notes');
		await store.writeFeature({
			id: 'audit-security-20260518-resolution-note',
			status: 'completed',
			passes: true,
			auditSource: 'SECURITY',
			notes: ['Resolved by enforcing the bounded command path.'],
		});
		await store.writeFeature({
			id: 'remediation-20260518-resolution-note',
			status: 'completed',
			passes: true,
			notes: 'Resolved by restoring the missing route guard.',
		});

		const validation = await store.validateFeatures();

		expect(validation.valid).toBe(true);
	});

	test('does not require resolution notes for normal completed features', async () => {
		const store = await makeStore('completed-feature-no-notes');
		await store.writeFeature({
			id: 'feature-resolution-note',
			status: 'completed',
			passes: true,
		});

		const validation = await store.validateFeatures();

		expect(validation.valid).toBe(true);
	});

	test('warns when a completed feature is missing affectedFiles', async () => {
		const store = await makeStore('completed-missing-affected-files');
		await store.writeFeature({
			id: 'feature-no-affected',
			status: 'completed',
			passes: true,
		});

		const validation = await store.validateFeatures();

		expect(validation.valid).toBe(true);
		const warning = (validation.warnings ?? []).find(
			(entry) => entry.id === 'feature-no-affected'
		);
		expect(warning?.message).toContain('missing affectedFiles');
	});

	test('does not warn when a completed feature carries affectedFiles', async () => {
		const store = await makeStore('completed-with-affected-files');
		await store.writeFeature({
			id: 'feature-with-affected',
			status: 'completed',
			passes: true,
			affectedFiles: ['backend/src/app.ts'],
		});
		// Backlog and in-progress work is exempt: affected files are an output, not a precondition.
		await store.writeFeature({
			id: 'feature-open',
			status: 'backlog',
			passes: false,
		});

		const validation = await store.validateFeatures();

		expect(validation.valid).toBe(true);
		expect(validation.warnings).toBeUndefined();
	});

	test('validates roadmap milestone assignments when roadmap exists', async () => {
		const store = await makeStore('roadmap-validation');
		await store.writeRoadmap({
			milestones: { MVP: {} },
			features: { 'feature-valid': { milestone: 'MVP' } },
		});
		await store.writeFeature({ id: 'feature-valid', status: 'backlog', passes: false });
		await store.writeFeature({ id: 'feature-unmapped', status: 'backlog', passes: false });
		await store.writeFeature({ id: 'feature-invalid', status: 'backlog', passes: false });
		// Overwrite roadmap.json with a controlled drift state after the features exist
		// on disk: feature-unmapped intentionally absent, feature-invalid -> unknown v9,
		// feature-deleted -> MVP with no matching directory (stale). This bypasses the
		// writeFeature auto-assignment invariant so validateFeatures detection is
		// exercised directly.
		await writeFile(
			join(store.metadataDir, 'roadmap.json'),
			`${JSON.stringify({
				milestones: { MVP: {} },
				features: {
					'feature-valid': { milestone: 'MVP' },
					'feature-deleted': { milestone: 'MVP' },
					'feature-invalid': { milestone: 'v9' },
				},
			})}\n`
		);

		const validation = await store.validateFeatures();

		expect(validation.valid).toBe(false);
		expect(validation.issues.map((issue) => issue.id).sort()).toEqual([
			'feature-invalid',
			'feature-unmapped',
		]);
		expect(validation.warnings?.map((warning) => warning.id)).toEqual(['feature-deleted']);
	});

	test('writeFeature auto-creates the next milestone for an unmapped feature', async () => {
		const store = await makeStore('roadmap-autoassign');
		await store.writeRoadmap({
			milestones: { 'v1.0': { priority: 1 }, 'v2.0': { priority: 2 } },
			features: {
				'feature-a': { milestone: 'v1.0' },
				'feature-b': { milestone: 'v2.0' },
			},
		});
		await store.writeFeature({ id: 'feature-a', status: 'completed', passes: true });
		await store.writeFeature({ id: 'feature-b', status: 'completed', passes: true });
		await store.writeFeature({ id: 'feature-new', status: 'backlog', passes: false });

		const roadmap = JSON.parse(
			await readFile(join(store.metadataDir, 'roadmap.json'), 'utf8')
		) as {
			milestones: Record<string, { priority?: number; description?: string }>;
			features: Record<string, { milestone?: string }>;
		};
		expect(roadmap.features['feature-new']?.milestone).toBe('v3.0');
		expect(roadmap.milestones['v3.0']?.priority).toBe(3);
	});

	test('writeFeature keeps audit findings in the current milestone', async () => {
		const store = await makeStore('roadmap-audit-current');
		await store.writeRoadmap({
			milestones: { 'v1.0': { priority: 1 }, 'v2.0': { priority: 2 } },
			features: {
				'feature-a': { milestone: 'v1.0' },
				'feature-b': { milestone: 'v2.0' },
			},
		});
		await store.writeFeature({ id: 'feature-a', status: 'completed', passes: true });
		await store.writeFeature({ id: 'feature-b', status: 'completed', passes: true });
		await store.writeFeature({
			id: 'audit-security-1779339974-current-milestone',
			auditSource: 'SECURITY',
			status: 'backlog',
			passes: false,
		});

		const roadmap = JSON.parse(
			await readFile(join(store.metadataDir, 'roadmap.json'), 'utf8')
		) as {
			milestones: Record<string, unknown>;
			features: Record<string, { milestone?: string }>;
		};
		expect(roadmap.features['audit-security-1779339974-current-milestone']?.milestone).toBe(
			'v2.0'
		);
		expect(roadmap.milestones['v3.0']).toBeUndefined();
	});

	test('writeFeature does not rewrite roadmap.json for an already-mapped feature', async () => {
		const store = await makeStore('roadmap-idempotent');
		await store.writeRoadmap({
			milestones: { MVP: { priority: 1 } },
			features: { 'feature-mapped': { milestone: 'MVP' } },
		});
		await store.writeFeature({ id: 'feature-mapped', status: 'backlog', passes: false });
		const roadmapPath = join(store.metadataDir, 'roadmap.json');
		const before = await readFile(roadmapPath, 'utf8');

		await store.writeFeature({ id: 'feature-mapped', status: 'in_progress', passes: false });

		expect(await readFile(roadmapPath, 'utf8')).toBe(before);
	});

	test('writeFeature does not create a milestone when roadmap lifecycle is lts', async () => {
		const store = await makeStore('roadmap-lts');
		await store.writeRoadmap({
			lifecycle: 'lts',
			milestones: { 'v1.0': { priority: 1 } },
			features: { 'feature-shipped': { milestone: 'v1.0' } },
		});
		await store.writeFeature({ id: 'feature-shipped', status: 'completed', passes: true });
		await store.writeFeature({ id: 'feature-late', status: 'backlog', passes: false });

		const roadmap = JSON.parse(
			await readFile(join(store.metadataDir, 'roadmap.json'), 'utf8')
		) as {
			milestones: Record<string, unknown>;
			features: Record<string, { milestone?: string }>;
		};
		expect(Object.keys(roadmap.milestones)).toEqual(['v1.0']);
		expect(roadmap.features['feature-late']?.milestone).toBe('v1.0');
	});

	test('writeFeature is a no-op for assignment when roadmap.json is absent', async () => {
		const store = await makeStore('roadmap-absent');
		await store.writeFeature({ id: 'feature-solo', status: 'backlog', passes: false });

		const featureRaw = await readFile(
			join(store.metadataDir, 'features', 'feature-solo', 'feature.json'),
			'utf8'
		);
		expect(JSON.parse(featureRaw)).toMatchObject({ id: 'feature-solo' });
		let roadmapMissing = false;
		try {
			await readFile(join(store.metadataDir, 'roadmap.json'), 'utf8');
		} catch {
			roadmapMissing = true;
		}
		expect(roadmapMissing).toBe(true);
	});

	test('writeFeature keeps a brand-new MVP-mapped feature in backlog', async () => {
		const store = await makeStore('approval-mvp-stays-backlog');
		await store.writeRoadmap({
			milestones: { MVP: { priority: 1 }, 'v1.0': { priority: 2 } },
			features: { 'feature-login': { milestone: 'MVP' } },
		});
		await store.writeFeature({ id: 'feature-login', status: 'backlog', passes: false });

		expect((await store.readFeature('feature-login')).status).toBe('backlog');
	});

	test('writeFeature parks a brand-new post-MVP feature as waiting_approval', async () => {
		const store = await makeStore('approval-post-mvp-parks');
		await store.writeRoadmap({
			milestones: { MVP: { priority: 1 }, 'v1.0': { priority: 2 } },
			features: { 'feature-later': { milestone: 'v1.0' } },
		});
		await store.writeFeature({ id: 'feature-later', status: 'backlog', passes: false });

		const feature = await store.readFeature('feature-later');
		expect(feature.status).toBe('waiting_approval');
		expect(feature.passes).toBe(false);
	});

	test('writeFeature parks unmapped work once the roadmap is past a completed MVP', async () => {
		const store = await makeStore('approval-unmapped-beyond-mvp');
		await store.writeRoadmap({
			milestones: { MVP: { priority: 1 } },
			features: { 'feature-shipped': { milestone: 'MVP' } },
		});
		await store.writeFeature({ id: 'feature-shipped', status: 'completed', passes: true });
		await store.writeFeature({ id: 'feature-idea', status: 'backlog', passes: false });

		// feature-idea auto-assigns to the created v1.0 future bucket, which is beyond MVP.
		expect((await store.readFeature('feature-idea')).status).toBe('waiting_approval');
	});

	test('writeFeature never parks audit findings or remediation features', async () => {
		const store = await makeStore('approval-audit-remediation-exempt');
		await store.writeRoadmap({
			milestones: { MVP: { priority: 1 }, 'v1.0': { priority: 2 } },
			features: { 'feature-shipped': { milestone: 'MVP' } },
		});
		await store.writeFeature({ id: 'feature-shipped', status: 'completed', passes: true });
		await store.writeFeature({
			id: 'audit-security-1779339974-park-exempt',
			auditSource: 'SECURITY',
			status: 'backlog',
			passes: false,
		});
		await store.writeFeature({
			id: 'remediation-20260704-park-exempt',
			status: 'backlog',
			passes: false,
		});

		// Both land in a post-MVP milestone but stay actionable: parking them would leave
		// audit-and-remediate / bug2feature coding steps with nothing to pick up.
		expect((await store.readFeature('audit-security-1779339974-park-exempt')).status).toBe(
			'backlog'
		);
		expect((await store.readFeature('remediation-20260704-park-exempt')).status).toBe(
			'backlog'
		);
	});

	test('writeFeature keeps new work in backlog when no milestone is named MVP', async () => {
		const store = await makeStore('approval-no-mvp-noop');
		await store.writeRoadmap({
			milestones: { 'v1.0': { priority: 1 }, 'v2.0': { priority: 2 } },
			features: { 'feature-a': { milestone: 'v1.0' } },
		});
		await store.writeFeature({ id: 'feature-a', status: 'completed', passes: true });
		await store.writeFeature({ id: 'feature-new', status: 'backlog', passes: false });

		expect((await store.readFeature('feature-new')).status).toBe('backlog');
	});

	test('writeFeature matches the MVP milestone case-insensitively', async () => {
		const store = await makeStore('approval-mvp-case');
		await store.writeRoadmap({
			milestones: { mvp: { priority: 1 }, 'v1.0': { priority: 2 } },
			features: {
				'feature-core': { milestone: 'mvp' },
				'feature-later': { milestone: 'v1.0' },
			},
		});
		await store.writeFeature({ id: 'feature-core', status: 'backlog', passes: false });
		await store.writeFeature({ id: 'feature-later', status: 'backlog', passes: false });

		expect((await store.readFeature('feature-core')).status).toBe('backlog');
		expect((await store.readFeature('feature-later')).status).toBe('waiting_approval');
	});

	test('writeFeature never restatuses an existing feature on update', async () => {
		const store = await makeStore('approval-update-untouched');
		await store.writeRoadmap({
			milestones: { MVP: { priority: 1 }, 'v1.0': { priority: 2 } },
			features: { 'feature-later': { milestone: 'v1.0' } },
		});
		await store.writeFeature({ id: 'feature-later', status: 'backlog', passes: false });
		expect((await store.readFeature('feature-later')).status).toBe('waiting_approval');

		// Approval returns the feature to backlog; a later write must not re-park it.
		await store.writeFeature({ id: 'feature-later', status: 'backlog', passes: false });

		expect((await store.readFeature('feature-later')).status).toBe('backlog');
	});
});
