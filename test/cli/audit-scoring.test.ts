import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import {
	buildScoreInput,
	collectProjectEvidence,
	enumerateProjectsUnderRoots,
	extractPriorityFromFrontmatter,
	loadAuditPriorities,
	scoreAudit,
} from 'aidd-shared/metadata/audit-scoring';

const rootDir = join(import.meta.dir, '..', '..', '.tmp-audit-scoring');

afterEach(async () => {
	await removeTempTree(rootDir);
});

async function makeProject(name: string): Promise<string> {
	const projectDir = join(rootDir, name);
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	return projectDir;
}

async function writeFeature(
	projectDir: string,
	directory: string,
	feature: Record<string, unknown>,
): Promise<void> {
	const dir = join(projectDir, '.aidd', 'features', directory);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'feature.json'), `${JSON.stringify(feature, null, 2)}\n`);
}

async function writeAuditReport(projectDir: string, name: string, date: string): Promise<void> {
	const dir = join(projectDir, '.aidd', 'audit-reports');
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, `${name}-${date}.md`), '# report\n');
}

async function appendLedger(projectDir: string, line: Record<string, unknown>): Promise<void> {
	const path = join(projectDir, '.aidd', 'runs.jsonl');
	await mkdir(join(projectDir, '.aidd'), { recursive: true });
	await Bun.write(path, `${JSON.stringify(line)}\n`);
}

describe('audit scorer math', () => {
	test('high-priority actionable audit with strong evidence saturates band High', () => {
		const result = scoreAudit({
			auditName: 'SECURITY',
			priority: 'Critical',
			completedRunsWithFindings: 5,
			incompleteAuditRuns: 0,
			activeAuditFeatures: 4,
			appsWithCompletedFeatureEvidence: 4,
			appsWithAuditReports: 6,
		});
		expect(result.band).toBe('High');
		expect(result.score).toBeGreaterThanOrEqual(60);
		expect(result.confidence).toBe('High');
		expect(result.evidence.actionable).toBe(true);
	});

	test('cold-start audit with no evidence lands in Low and is alphabetized', () => {
		const result = scoreAudit({
			auditName: 'BRAND_NEW',
			priority: 'High',
			completedRunsWithFindings: 0,
			incompleteAuditRuns: 0,
			activeAuditFeatures: 0,
			appsWithCompletedFeatureEvidence: 0,
			appsWithAuditReports: 0,
		});
		expect(result.band).toBe('Low');
		expect(result.score).toBe(8);
		expect(result.confidence).toBe('Low');
	});

	test('completed runs cap at sixty so a busy audit cannot dominate the score', () => {
		const result = scoreAudit({
			auditName: 'LOGIC',
			priority: 'High',
			completedRunsWithFindings: 100,
			incompleteAuditRuns: 0,
			activeAuditFeatures: 0,
			appsWithCompletedFeatureEvidence: 0,
			appsWithAuditReports: 0,
		});
		expect(result.evidence.completedRunsWithFindings).toBe(100);
		expect(result.score).toBe(8 + 5 + 60);
	});

	test('active feature findings cap at thirty-two', () => {
		const result = scoreAudit({
			auditName: 'LOGIC',
			priority: 'High',
			completedRunsWithFindings: 0,
			incompleteAuditRuns: 0,
			activeAuditFeatures: 50,
			appsWithCompletedFeatureEvidence: 0,
			appsWithAuditReports: 0,
		});
		expect(result.score).toBe(8 + 5 + 32);
	});

	test('unknown priority falls back to baseline two', () => {
		const result = scoreAudit({
			auditName: 'UNKNOWN_AUDIT',
			priority: null,
			completedRunsWithFindings: 0,
			incompleteAuditRuns: 0,
			activeAuditFeatures: 0,
			appsWithCompletedFeatureEvidence: 0,
			appsWithAuditReports: 0,
		});
		expect(result.score).toBe(2);
	});

	test('confidence promotes to Medium with any completed evidence', () => {
		const result = scoreAudit({
			auditName: 'LOGIC',
			priority: 'High',
			completedRunsWithFindings: 1,
			incompleteAuditRuns: 0,
			activeAuditFeatures: 0,
			appsWithCompletedFeatureEvidence: 0,
			appsWithAuditReports: 0,
		});
		expect(result.confidence).toBe('Medium');
	});

	test('confidence stays Low without any completed-or-report evidence', () => {
		const result = scoreAudit({
			auditName: 'LOGIC',
			priority: 'High',
			completedRunsWithFindings: 0,
			incompleteAuditRuns: 5,
			activeAuditFeatures: 2,
			appsWithCompletedFeatureEvidence: 0,
			appsWithAuditReports: 1,
		});
		expect(result.confidence).toBe('Low');
	});
});

describe('frontmatter priority extraction', () => {
	test('parses quoted Critical/High/Medium', () => {
		expect(extractPriorityFromFrontmatter("priority: 'Critical'\nname: foo")).toBe('Critical');
		expect(extractPriorityFromFrontmatter('priority: "High"')).toBe('High');
		expect(extractPriorityFromFrontmatter('priority: Medium')).toBe('Medium');
	});

	test('returns null on missing or unrecognized value', () => {
		expect(extractPriorityFromFrontmatter('name: foo\n')).toBeNull();
		expect(extractPriorityFromFrontmatter("priority: 'Trivial'")).toBeNull();
	});
});

function auditRun(
	driverId: null | string,
	auditFindings: Record<string, number> | undefined,
	stopReason: string,
): Record<string, unknown> {
	return {
		...(auditFindings ? { auditFindings } : {}),
		driverId,
		driverKind: 'audit',
		stopReason,
		summary: 'audit batch finished',
	};
}

describe('project evidence collection', () => {
	test('aggregates runs, features, and reports for a single project', async () => {
		const projectDir = await makeProject('evidence-basic');
		await Bun.write(
			join(projectDir, '.aidd', 'runs.jsonl'),
			[
				JSON.stringify(auditRun('SECURITY', { SECURITY: 2 }, 'completed')),
				JSON.stringify(auditRun('SECURITY', { SECURITY: 0 }, 'completed')),
				JSON.stringify(auditRun('LOGIC', { LOGIC: 1 }, 'aborted')),
				// Written before the per-audit breakdown existed: the summary is not parsed.
				JSON.stringify({
					driverId: 'SECURITY',
					driverKind: 'audit',
					stopReason: 'completed',
					summary: 'audit SECURITY finished with 3 finding(s) created',
				}),
				JSON.stringify({ summary: 'unrelated entry' }),
			].join('\n'),
		);
		await writeFeature(projectDir, 'audit-security-1700000000-broken-auth', {
			id: 'audit-security-1700000000-broken-auth',
			auditSource: 'SECURITY',
			status: 'backlog',
			passes: false,
		});
		await writeFeature(projectDir, 'audit-security-1700000001-fixed-auth', {
			id: 'audit-security-1700000001-fixed-auth',
			auditSource: 'SECURITY',
			status: 'completed',
			passes: true,
		});
		await writeAuditReport(projectDir, 'SECURITY', '2026-05-10');
		await writeAuditReport(projectDir, 'LOGIC', '2026-05-12');

		const evidence = await collectProjectEvidence(projectDir);
		expect(evidence.completedRunsWithFindings.get('SECURITY')).toBe(1);
		expect(evidence.incompleteAuditRuns.get('SECURITY')).toBe(1);
		expect(evidence.incompleteAuditRuns.get('LOGIC')).toBe(1);
		expect(evidence.unattributedAuditRuns).toBe(1);
		expect(evidence.activeAuditFeatures.get('SECURITY')).toBe(1);
		expect(evidence.hasCompletedAuditFeature.has('SECURITY')).toBe(true);
		expect(evidence.hasAuditReport.has('SECURITY')).toBe(true);
		expect(evidence.hasAuditReport.has('LOGIC')).toBe(true);
	});

	test('credits each audit in a batch with its own count and counts nameless runs apart', async () => {
		const projectDir = await makeProject('evidence-batch');
		await Bun.write(
			join(projectDir, '.aidd', 'runs.jsonl'),
			[
				JSON.stringify(
					auditRun('HYGIENE+SECURITY', { HYGIENE: 0, SECURITY: 3 }, 'completed'),
				),
				JSON.stringify(auditRun(null, { SECURITY: 2 }, 'completed')),
				JSON.stringify(auditRun('', { SECURITY: 2 }, 'completed')),
			].join('\n'),
		);

		const evidence = await collectProjectEvidence(projectDir);
		expect(evidence.completedRunsWithFindings.get('SECURITY')).toBe(1);
		expect(evidence.completedRunsWithFindings.has('HYGIENE')).toBe(false);
		expect(evidence.incompleteAuditRuns.get('HYGIENE')).toBe(1);
		expect(evidence.unattributedAuditRuns).toBe(2);
	});

	test('a ledger holding only suppressions still reads the audit feature directories', async () => {
		const projectDir = await makeProject('suppression-only-ledger');
		await writeFeature(projectDir, 'audit-security-open', {
			auditSource: 'SECURITY',
			id: 'audit-security-open',
			passes: false,
			status: 'backlog',
		});
		await writeFile(
			join(projectDir, '.aidd', 'findings-ledger.jsonl'),
			`${JSON.stringify({
				at: '2026-08-25T12:00:00.000Z',
				auditSource: 'SECURITY',
				event: 'suppressed-duplicate',
				featureId: 'audit-security-open',
				fingerprint: `f1-${'b'.repeat(64)}`,
				runId: 'run-security',
			})}\n`,
		);

		const evidence = await collectProjectEvidence(projectDir);
		expect(evidence.activeAuditFeatures.get('SECURITY')).toBe(1);
	});

	test('uses finding-ledger lifecycle facts instead of mutable feature-directory state', async () => {
		const projectDir = await makeProject('finding-ledger-precedence');
		await writeFeature(projectDir, 'audit-security-stale-copy', {
			auditSource: 'SECURITY',
			id: 'audit-security-stale-copy',
			passes: false,
			status: 'backlog',
		});
		await writeFile(
			join(projectDir, '.aidd', 'findings-ledger.jsonl'),
			`${JSON.stringify({
				at: '2026-08-25T12:00:00.000Z',
				auditSource: 'SECURITY',
				event: 'remediated',
				featureId: 'audit-security-stale-copy',
				fingerprint: `f1-${'a'.repeat(64)}`,
				runId: 'run-security',
			})}\n`,
		);

		const evidence = await collectProjectEvidence(projectDir);
		expect(evidence.activeAuditFeatures.has('SECURITY')).toBe(false);
		expect(evidence.hasCompletedAuditFeature.has('SECURITY')).toBe(true);
	});

	test('handles missing .aidd directory without throwing', async () => {
		const projectDir = join(rootDir, 'no-aidd');
		await mkdir(projectDir, { recursive: true });
		const evidence = await collectProjectEvidence(projectDir);
		expect(evidence.completedRunsWithFindings.size).toBe(0);
	});

	test('infers audit name from directory convention when auditSource is missing', async () => {
		const projectDir = await makeProject('feature-directory-inference');
		await writeFeature(projectDir, 'audit-logic-1700000000-bad-branch', {
			id: 'audit-logic-1700000000-bad-branch',
			status: 'backlog',
			passes: false,
		});
		const evidence = await collectProjectEvidence(projectDir);
		expect(evidence.activeAuditFeatures.get('LOGIC')).toBe(1);
	});
});

describe('buildScoreInput aggregation', () => {
	test('sums counts across projects and counts apps for confidence', async () => {
		const projectA = await makeProject('agg-a');
		await appendLedger(projectA, auditRun('SECURITY', { SECURITY: 1 }, 'completed'));
		await writeFeature(projectA, 'audit-security-1700000001-broken-auth', {
			id: 'audit-security-1700000001-broken-auth',
			auditSource: 'SECURITY',
			status: 'completed',
			passes: true,
		});
		await writeAuditReport(projectA, 'SECURITY', '2026-05-10');

		const projectB = await makeProject('agg-b');
		await appendLedger(projectB, auditRun('SECURITY', { SECURITY: 2 }, 'completed'));
		await writeFeature(projectB, 'audit-security-1700000002-csrf', {
			id: 'audit-security-1700000002-csrf',
			auditSource: 'SECURITY',
			status: 'completed',
			passes: true,
		});
		await writeAuditReport(projectB, 'SECURITY', '2026-05-12');

		const [evidenceA, evidenceB] = await Promise.all([
			collectProjectEvidence(projectA),
			collectProjectEvidence(projectB),
		]);
		const input = buildScoreInput('SECURITY', {
			priorities: new Map([['SECURITY', 'Critical' as const]]),
			projects: [evidenceA, evidenceB],
		});
		expect(input.completedRunsWithFindings).toBe(2);
		expect(input.appsWithCompletedFeatureEvidence).toBe(2);
		expect(input.appsWithAuditReports).toBe(2);

		const scored = scoreAudit(input);
		// Critical(12) + actionable(5) + 2 completed runs * 6 = 29 → Low band.
		// Confidence is Medium because completedRunsWithFindings > 0.
		expect(scored.score).toBe(29);
		expect(scored.band).toBe('Low');
		expect(scored.confidence).toBe('Medium');
	});
});

describe('loadAuditPriorities', () => {
	test('reads priority from each audit definition frontmatter', async () => {
		const catalogDir = await makeProject('catalog');
		const auditsDir = join(catalogDir, 'audits');
		await mkdir(auditsDir, { recursive: true });
		await writeFile(join(auditsDir, 'SECURITY.md'), "---\npriority: 'Critical'\n---\n# body\n");
		await writeFile(join(auditsDir, 'NOPRI.md'), '---\nname: foo\n---\n# body\n');
		const priorities = await loadAuditPriorities(catalogDir, ['SECURITY', 'NOPRI', 'MISSING']);
		expect(priorities.get('SECURITY')).toBe('Critical');
		expect(priorities.get('NOPRI')).toBeNull();
		expect(priorities.get('MISSING')).toBeNull();
	});
});

describe('enumerateProjectsUnderRoots', () => {
	test('returns direct child directories and skips dotted, underscored, and ignored entries', async () => {
		const root = join(rootDir, 'root');
		await mkdir(join(root, 'app-one'), { recursive: true });
		await mkdir(join(root, 'app-two'), { recursive: true });
		await mkdir(join(root, '.hidden'), { recursive: true });
		await mkdir(join(root, '_queue'), { recursive: true });
		await mkdir(join(root, 'node_modules'), { recursive: true });
		await writeFile(join(root, 'README.md'), 'not a dir');

		const projects = await enumerateProjectsUnderRoots([root]);
		const names = projects.map((path) => path.split(/[\\/]/).pop()).sort();
		expect(names).toEqual(['app-one', 'app-two']);
	});

	test('deduplicates when the same root is listed twice', async () => {
		const root = join(rootDir, 'dedup');
		await mkdir(join(root, 'app'), { recursive: true });
		const projects = await enumerateProjectsUnderRoots([root, root]);
		expect(projects.length).toBe(1);
	});
});
