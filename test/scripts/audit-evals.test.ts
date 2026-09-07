import { describe, expect, test } from 'bun:test';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { AuditEvalRunScore } from '../../scripts/lib/benchmark/types.ts';

import { inspectAuditEvals } from '../../scripts/lib/audit-eval/check.ts';
import { loadAuditEvalFloors } from '../../scripts/lib/audit-eval/floors.ts';
import {
	type AuditEvalScratch,
	stageAuditEvalScratch,
} from '../../scripts/lib/audit-eval/self-test.ts';

import { testTempDir } from '../_helpers/temp.ts';

// scripts/test-audit-evals.ts drives the real command through every scoring scenario. This file
// covers the gate's own findings against a scratch root: the repository attestation is never
// inspected here, so a stale committed attestation fails check:audit-evals, not the unit suite.

const repoRoot = path.resolve(import.meta.dir, '..', '..');
const hygieneAudit = readFileSync(path.join(repoRoot, 'audits', 'HYGIENE.md'), 'utf8');

async function stage(): Promise<{ scratch: AuditEvalScratch; scratchDir: string }> {
	const scratchDir = await testTempDir('audit-evals-');
	return { scratch: stageAuditEvalScratch(repoRoot, scratchDir), scratchDir };
}

function plantAll(scratch: AuditEvalScratch): AuditEvalRunScore {
	scratch.writeFinding(
		'audit-security-unescaped-html',
		'renderDebugHtml creates unescaped HTML and permits cross-site scripting (XSS).',
	);
	scratch.writeFinding(
		'audit-security-admin-header',
		'isAdmin trusts the x-admin header, allowing an authorization bypass.',
	);
	scratch.writeFinding(
		'audit-security-upload-traversal',
		'readUpload joins a caller-supplied name into the upload path (path traversal).',
		['backend/src/storage.ts'],
	);
	return scratch.score();
}

async function passingScratch(): Promise<{ scratch: AuditEvalScratch; scratchDir: string }> {
	const staged = await stage();
	const score = plantAll(staged.scratch);
	const floors = loadAuditEvalFloors(staged.scratch.floorsPath);
	await staged.scratch.writeAttestation(Array.from({ length: floors.minRuns }, () => score));
	return staged;
}

describe('audit eval gate', () => {
	test('HYGIENE drives Madge through TypeScript and current QC surfaces', () => {
		const madgeAnalysisCommands = hygieneAudit
			.split(/\r?\n/)
			.filter(
				(line) =>
					line.includes('bunx madge') && /--(?:circular|orphans|leaves)/u.test(line),
			);
		expect(madgeAnalysisCommands.length).toBeGreaterThan(0);
		for (const command of madgeAnalysisCommands) {
			expect(command).toContain('bunx madge --extensions ts,tsx --ts-config tsconfig.json');
		}

		expect(hygieneAudit).toContain('Processed 0 files');
		expect(hygieneAudit).toContain('invalidates the instrument');
		expect(hygieneAudit).toContain('processed-file count');
		expect(hygieneAudit).toContain('scripts/lib/smoke-qc/steps.ts');
		expect(hygieneAudit).toContain('check:env-spread');
		expect(hygieneAudit).not.toContain('scripts/smoke.json');
		expect(hygieneAudit).not.toContain('check:process-env');
	});

	test('a scratch root with a perfect attestation passes and reports measured audits apart', async () => {
		const { scratchDir } = await passingScratch();
		const result = await inspectAuditEvals(scratchDir);
		expect(result.findings).toEqual([]);
		expect(result.status).toBe('pass');
		expect(result.measuredAudits).toBe(1);
		expect(result.unmeasuredAudits).toBe(1);
		expect(result.hashedFiles).toBe(2);
		expect(result.examined).toBeGreaterThan(result.hashedFiles);
	});

	test('fixture metadata that discloses the answer key is a finding', async () => {
		const { scratch, scratchDir } = await passingScratch();
		scratch.writeScratchFile(
			'evals/audits/fixtures/security/.aidd/notes.md',
			'# Notes\n\nThe health route is a benign decoy for the security audit.\n',
		);
		const result = await inspectAuditEvals(scratchDir);
		expect(result.status).toBe('fail');
		expect(result.findings).toContainEqual({
			line: 3,
			message: 'fixture metadata discloses the answer key (token: decoy)',
			path: 'evals/audits/fixtures/security/.aidd/notes.md',
			rule: 'AUDIT_EVAL',
		});
	});

	test('floors that moved since the attestation was generated are reported stale', async () => {
		const { scratch, scratchDir } = await passingScratch();
		const floors = JSON.parse(readFileSync(scratch.floorsPath, 'utf8')) as Record<
			string,
			number
		>;
		writeFileSync(
			scratch.floorsPath,
			`${JSON.stringify({ ...floors, minPrecision: 0.9 }, null, '\t')}\n`,
		);
		const result = await inspectAuditEvals(scratchDir);
		expect(result.status).toBe('fail');
		expect(result.findings.map((item) => item.message)).toContain('SECURITY floors are stale');
	});

	test('an attestation without auditFiles hashes fails every audit file, not just the definitions', async () => {
		const { scratchDir } = await passingScratch();
		const attestationPath = path.join(scratchDir, 'evals', 'audits', 'attestation.json');
		const attestation = JSON.parse(readFileSync(attestationPath, 'utf8')) as Record<
			string,
			unknown
		>;
		delete attestation.auditFiles;
		writeFileSync(attestationPath, `${JSON.stringify(attestation, null, '\t')}\n`);
		const result = await inspectAuditEvals(scratchDir);
		expect(result.status).toBe('fail');
		expect(result.findings.map((item) => item.message)).toContain(
			'attestation carries no auditFiles hashes',
		);
	});

	test('editing any file under audits/ makes the hash gate red', async () => {
		const { scratchDir } = await passingScratch();
		appendFileSync(path.join(scratchDir, 'audits', 'HYGIENE.md'), '\nprobe\n');
		const result = await inspectAuditEvals(scratchDir);
		expect(result.status).toBe('fail');
		expect(result.findings).toContainEqual({
			line: 1,
			message: 'audit definition hash is stale',
			path: 'audits/HYGIENE.md',
			rule: 'AUDIT_EVAL',
		});
	});
});
