import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { runFindingsCommand } from '../../cli/src/commands/findings.ts';
import { removeTempTree } from '../backend/_helpers/remove-temp-tree.ts';

import { testTempDir } from '../_helpers/temp.ts';

const FINGERPRINT = `f1-${'e'.repeat(64)}`;
const tempRoots: string[] = [];

interface SeedOptions {
	auditSource?: string;
	fingerprint?: string;
	status?: string;
}

async function seedProject(
	featureId: string,
	options: SeedOptions = {},
): Promise<{ featureDir: string; projectDir: string }> {
	const projectDir = await testTempDir('aidd-findings-cmd-');
	tempRoots.push(projectDir);
	const featureDir = join(projectDir, '.aidd', 'features', featureId);
	await mkdir(featureDir, { recursive: true });
	await writeFile(
		join(featureDir, 'feature.json'),
		`${JSON.stringify(
			{
				...('auditSource' in options ? { auditSource: options.auditSource } : {}),
				...('fingerprint' in options ? { fingerprint: options.fingerprint } : {}),
				id: featureId,
				passes: false,
				status: options.status ?? 'backlog',
				title: 'Finding',
			},
			null,
			'\t',
		)}\n`,
	);
	await writeFile(
		join(projectDir, '.aidd', 'roadmap.json'),
		`${JSON.stringify(
			{
				features: { [featureId]: { milestone: 'v1.0' } },
				milestones: { 'v1.0': { priority: 1 } },
			},
			null,
			'\t',
		)}\n`,
	);
	return { featureDir, projectDir };
}

async function pathExists(path: string): Promise<boolean> {
	return stat(path).then(
		() => true,
		() => false,
	);
}

async function ledgerLines(projectDir: string): Promise<string[]> {
	const raw = await readFile(join(projectDir, '.aidd', 'findings-ledger.jsonl'), 'utf8');
	return raw.trim().split(/\r?\n/u);
}

function capture(): { errors: string[]; logs: string[]; restore: () => void } {
	const logs: string[] = [];
	const errors: string[] = [];
	const originalLog = console.log;
	const originalError = console.error;
	console.log = (...args: unknown[]) => {
		logs.push(args.map(String).join(' '));
	};
	console.error = (...args: unknown[]) => {
		errors.push(args.map(String).join(' '));
	};
	return {
		errors,
		logs,
		restore: () => {
			console.log = originalLog;
			console.error = originalError;
		},
	};
}

async function dismiss(projectDir: string, featureId: string, ...extra: string[]) {
	const io = capture();
	try {
		const code = await runFindingsCommand([
			'dismiss',
			'--project-dir',
			projectDir,
			'--feature',
			featureId,
			...extra,
		]);
		return { code, errors: io.errors, logs: io.logs };
	} finally {
		io.restore();
	}
}

afterEach(async () => {
	while (tempRoots.length > 0) {
		const root = tempRoots.pop();
		if (root) await removeTempTree(root);
	}
});

describe('aidd findings dismiss', () => {
	test('records one dismissed event, then removes the directory and roadmap entry', async () => {
		const featureId = 'audit-security-guard';
		const { featureDir, projectDir } = await seedProject(featureId, {
			auditSource: 'SECURITY',
			fingerprint: FINGERPRINT,
		});

		const result = await dismiss(
			projectDir,
			featureId,
			'--reason',
			'false-positive',
			'--note',
			'The guard lives in the router wrapper.',
		);

		expect(result.code).toBe(0);
		expect(result.logs.join('\n')).toContain(`Dismissed ${featureId} (false-positive)`);
		expect(await pathExists(featureDir)).toBe(false);
		const lines = await ledgerLines(projectDir);
		expect(lines).toHaveLength(1);
		const event = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
		expect(event).toMatchObject({
			auditSource: 'SECURITY',
			event: 'dismissed',
			featureId,
			fingerprint: FINGERPRINT,
			note: 'The guard lives in the router wrapper.',
			reason: 'false-positive',
			source: 'cli',
		});
		expect('runId' in event).toBe(false);
		expect(Number.isNaN(Date.parse(String(event.at)))).toBe(false);
		const roadmap = JSON.parse(
			await readFile(join(projectDir, '.aidd', 'roadmap.json'), 'utf8'),
		) as { features: Record<string, unknown> };
		expect(roadmap.features[featureId]).toBeUndefined();
	});

	test('exits 2 on a reason outside the vocabulary and writes nothing', async () => {
		const featureId = 'audit-security-guard';
		const { featureDir, projectDir } = await seedProject(featureId, {
			auditSource: 'SECURITY',
			fingerprint: FINGERPRINT,
		});

		const result = await dismiss(projectDir, featureId, '--reason', 'because');

		expect(result.code).toBe(2);
		expect(result.errors.join('\n')).toContain("Unknown dismissal reason 'because'");
		expect(await pathExists(featureDir)).toBe(true);
		expect(await pathExists(join(projectDir, '.aidd', 'findings-ledger.jsonl'))).toBe(false);
	});

	test('exits 2 when a required option is missing or the subcommand is unknown', async () => {
		const io = capture();
		try {
			expect(await runFindingsCommand(['dismiss', '--project-dir', 'x'])).toBe(2);
			expect(await runFindingsCommand(['forget'])).toBe(2);
			expect(await runFindingsCommand([])).toBe(2);
			expect(await runFindingsCommand(['dismiss', '--reason'])).toBe(2);
		} finally {
			io.restore();
		}
		expect(io.errors.join('\n')).toContain('Missing required option(s): --feature, --reason');
		expect(io.errors.join('\n')).toContain('Unknown findings subcommand: forget');
	});

	test('exits 1 for a feature that is not a dismissable finding, naming the reason', async () => {
		const featureId = 'plain-feature';
		const { featureDir, projectDir } = await seedProject(featureId, {
			fingerprint: FINGERPRINT,
		});

		const result = await dismiss(projectDir, featureId, '--reason', 'other');

		expect(result.code).toBe(1);
		expect(result.errors.join('\n')).toContain(
			'Only fingerprinted audit findings with an auditSource can be dismissed',
		);
		expect(await pathExists(featureDir)).toBe(true);
		expect(await pathExists(join(projectDir, '.aidd', 'findings-ledger.jsonl'))).toBe(false);
	});

	test('exits 1 under the same status guard the web dismissal enforces', async () => {
		const featureId = 'audit-security-guard';
		const { featureDir, projectDir } = await seedProject(featureId, {
			auditSource: 'SECURITY',
			fingerprint: FINGERPRINT,
			status: 'in_progress',
		});

		const result = await dismiss(projectDir, featureId, '--reason', 'not-worth-it');

		expect(result.code).toBe(1);
		expect(result.errors.join('\n')).toContain(
			'Only backlog or waiting_approval features can be deleted',
		);
		expect(await pathExists(featureDir)).toBe(true);
	});

	test('exits 1 for a missing feature', async () => {
		const { projectDir } = await seedProject('audit-security-guard', {
			auditSource: 'SECURITY',
			fingerprint: FINGERPRINT,
		});

		const result = await dismiss(projectDir, 'audit-security-missing', '--reason', 'other');

		expect(result.code).toBe(1);
		expect(result.errors.join('\n')).toContain('Feature not found: audit-security-missing');
	});
});
