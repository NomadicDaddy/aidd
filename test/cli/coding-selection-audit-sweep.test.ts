import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'aidd-shared/args/index';
import { defaultWebConfig, type ResolvedConfig } from 'aidd-shared/config';
import { selectFeatureCandidates } from 'aidd-shared/metadata/features';
import { FileAiddStore } from 'aidd-shared/metadata/store';
import { featureQuery } from '../../cli/src/modes/coding/selection.ts';
import { resolveRunPlan } from '../../cli/src/plan/resolve.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';

// The project page offers "N approved audit findings ready to work" and launches
// --audit-findings. The sweep must work only those findings: an ordinary backlog record, even one
// of better priority, is not what the page offered (reported by auden, mail 1ecc545c).

const rootDir = join(import.meta.dir, '..', '..', '.tmp-coding-selection-audit-sweep');

const config: ResolvedConfig = {
	cli: 'native',
	dirtyTreeThreshold: 50,
	idleNudgeTimeoutSeconds: 600,
	idleTimeoutSeconds: 900,
	maxConsecutiveTimeoutRetries: 2,
	maxIterations: 10,
	noClean: false,
	noWorkBackoffMs: 0,
	preflightDoctor: false,
	quitOnAbort: 0,
	rateLimitBackoffSeconds: 300,
	rateLimitBufferSeconds: 60,
	reasoningEffort: 'low',
	timeoutSeconds: 3600,
	web: defaultWebConfig,
};

afterEach(async () => {
	await removeTempTree(rootDir);
});

async function writeRecord(projectDir: string, record: Record<string, unknown>): Promise<void> {
	const dir = join(projectDir, '.aidd', 'features', String(record.id));
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, 'feature.json'), JSON.stringify({ passes: false, ...record }));
}

async function candidates(projectDir: string, extraArgs: string[]): Promise<string[]> {
	const plan = resolveRunPlan(
		parseArgs(['--project-dir', projectDir, '--cli', 'native', ...extraArgs]),
		config,
	);
	const query = featureQuery(plan);
	const store = new FileAiddStore(projectDir);
	const features = await store.listFeatures(query);
	return selectFeatureCandidates(features, { includeAudit: query.includeAudit === true }).map(
		(feature) => feature.id,
	);
}

const finding = {
	auditSource: 'SECURITY',
	id: 'audit-security-1790000000-token-logged',
	priority: 3,
	status: 'backlog',
	title: 'Token is logged',
};
const ordinary = { id: 'export-to-csv', priority: 1, status: 'backlog', title: 'Export to CSV' };
const remediation = {
	auditSource: 'SECURITY',
	id: 'remediation-20261014-token-redaction',
	priority: 1,
	status: 'backlog',
	title: 'Token redaction',
};

describe('audit-findings sweep selection', () => {
	test('an unscoped sweep works only the audit finding, not a better-priority ordinary record', async () => {
		const projectDir = join(rootDir, 'unscoped');
		await writeRecord(projectDir, finding);
		await writeRecord(projectDir, ordinary);
		expect(await candidates(projectDir, ['--audit-findings'])).toEqual([finding.id]);
	});

	test('a sweep with only ordinary records eligible selects nothing', async () => {
		const projectDir = join(rootDir, 'ordinary-only');
		await writeRecord(projectDir, ordinary);
		expect(await candidates(projectDir, ['--audit-findings'])).toEqual([]);
	});

	test("a source-scoped sweep works only that audit's findings", async () => {
		const projectDir = join(rootDir, 'scoped');
		await writeRecord(projectDir, finding);
		await writeRecord(projectDir, {
			...finding,
			auditSource: 'HYGIENE',
			id: 'audit-hygiene-1790000001-stray-file',
		});
		await writeRecord(projectDir, ordinary);
		expect(await candidates(projectDir, ['--audit-findings', 'SECURITY'])).toEqual([
			finding.id,
		]);
	});

	test('the sweep leaves out a remediation record, as the page does', async () => {
		const projectDir = join(rootDir, 'remediation');
		await writeRecord(projectDir, finding);
		await writeRecord(projectDir, remediation);
		expect(await candidates(projectDir, ['--audit-findings'])).toEqual([finding.id]);
	});

	test('an ordinary coding run is unchanged: it works ordinary records and skips findings', async () => {
		const projectDir = join(rootDir, 'ordinary-run');
		await writeRecord(projectDir, finding);
		await writeRecord(projectDir, ordinary);
		expect(await candidates(projectDir, [])).toEqual([ordinary.id]);
	});

	test('a run targeting one audit finding still reaches it', async () => {
		const projectDir = join(rootDir, 'targeted');
		await writeRecord(projectDir, finding);
		await writeRecord(projectDir, ordinary);
		expect(await candidates(projectDir, ['--feature', finding.id])).toEqual([finding.id]);
	});
});
