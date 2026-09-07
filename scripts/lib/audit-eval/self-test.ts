import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { AuditEvalCatalog, AuditEvalRunScore } from '../benchmark/types.ts';
import type { AuditEvalRunRecord } from './attestation.ts';

import { hashFixture } from '../benchmark/execution.ts';
import { loadManifest } from '../benchmark/manifest.ts';
import { buildAuditEvalAttestation } from './attestation.ts';
import { loadAuditEvalFloors } from './floors.ts';
import { evaluateAuditEval } from './scorer.ts';

/** The two definitions staged so the multi-audit hash loop has more than one file to walk. */
const STAGED_AUDITS = ['SECURITY', 'HYGIENE'];

export interface AuditEvalScratch {
	catalog: AuditEvalCatalog;
	fixtureRoot: string;
	floorsPath: string;
	manifestPath: string;
	/** Removes every planted finding so the next scenario starts clean. */
	resetFindings(): void;
	/** Scores the findings currently planted in the fixture. */
	score(): AuditEvalRunScore;
	/** Writes an attestation averaged from the given scores, one run record each. */
	writeAttestation(scores: AuditEvalRunScore[]): Promise<void>;
	/** Plants one SECURITY finding in the fixture's feature directory. */
	writeFinding(id: string, description: string, files?: string[]): void;
	/** Writes a JSON or text file relative to the scratch root. */
	writeScratchFile(relativePath: string, value: unknown): void;
}

/**
 * Copies the committed manifest, floors, fixture, and two audit definitions into a scratch root
 * shaped like the repository, so the real gate can be pointed at it with --root.
 */
export function stageAuditEvalScratch(root: string, scratch: string): AuditEvalScratch {
	const manifestPath = path.join(scratch, 'evals', 'audits', 'manifest.json');
	const floorsPath = path.join(scratch, 'evals', 'audits', 'floors.json');
	const fixtureRoot = path.join(scratch, 'evals', 'audits', 'fixtures', 'security');
	mkdirSync(path.dirname(manifestPath), { recursive: true });
	mkdirSync(path.dirname(fixtureRoot), { recursive: true });
	mkdirSync(path.join(scratch, 'audits'), { recursive: true });
	cpSync(path.join(root, 'evals', 'audits', 'manifest.json'), manifestPath);
	cpSync(path.join(root, 'evals', 'audits', 'floors.json'), floorsPath);
	cpSync(path.join(root, 'evals', 'audits', 'fixtures', 'security'), fixtureRoot, {
		recursive: true,
	});
	for (const auditId of STAGED_AUDITS) {
		cpSync(
			path.join(root, 'audits', `${auditId}.md`),
			path.join(scratch, 'audits', `${auditId}.md`),
		);
	}
	const manifest = loadManifest(manifestPath);
	const task = manifest.tasks.find((entry) => entry.auditEval !== undefined);
	const catalog = task?.auditEval;
	if (!task || !catalog) throw new Error('Fixture manifest did not load an audit-eval catalog');
	// Hashed before any finding is planted: a benchmark run hashes the pristine source fixture.
	const fixtureHash = hashFixture(fixtureRoot);
	const stackLabel = manifest.stacks[0]?.label ?? 'audit-evals';

	const writeScratchFile = (relativePath: string, value: unknown): void => {
		const target = path.join(scratch, relativePath);
		mkdirSync(path.dirname(target), { recursive: true });
		writeFileSync(
			target,
			typeof value === 'string' ? value : `${JSON.stringify(value, null, '\t')}\n`,
		);
	};
	return {
		catalog,
		fixtureRoot,
		floorsPath,
		manifestPath,
		resetFindings: () => {
			rmSync(path.join(fixtureRoot, '.aidd', 'features'), { force: true, recursive: true });
		},
		score: () => {
			const result = evaluateAuditEval(fixtureRoot, catalog);
			if (!result.auditEval) throw new Error('Audit eval scorer did not emit score detail');
			return result.auditEval;
		},
		writeAttestation: async (scores) => {
			const runs: AuditEvalRunRecord[] = scores.map((auditEval) => ({
				auditEval,
				fixtureHash,
				stack: { label: stackLabel },
				taskId: task.id,
			}));
			const attestation = await buildAuditEvalAttestation(scratch, {
				floorsPath,
				manifestPath,
				runs,
			});
			writeScratchFile('evals/audits/attestation.json', attestation);
		},
		writeFinding: (id, description, files = ['backend/src/server.ts']) => {
			writeScratchFile(`evals/audits/fixtures/security/.aidd/features/${id}/feature.json`, {
				affectedFiles: files,
				auditSeverity: 'High',
				auditSource: catalog.auditId,
				description,
				id,
				passes: false,
				status: 'backlog',
				title: description,
			});
		},
		writeScratchFile,
	};
}

interface CommandResult {
	exitCode: number;
	output: string;
}

function runGate(root: string, scratch: string, json = false): CommandResult {
	const args = ['bun', 'run', 'check:audit-evals', '--', '--root', scratch];
	if (json) args.push('--json');
	const result = Bun.spawnSync(args, { cwd: root, stderr: 'pipe', stdout: 'pipe' });
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

const XSS = 'renderDebugHtml creates unescaped HTML and permits cross-site scripting (XSS).';
const ADMIN = 'isAdmin trusts the x-admin header, allowing an authorization bypass.';
const TRAVERSAL = 'readUpload joins a caller-supplied name into the upload path (path traversal).';

function plantAllDefects(scratch: AuditEvalScratch): void {
	scratch.writeFinding('audit-security-unescaped-html', XSS);
	scratch.writeFinding('audit-security-admin-header', ADMIN);
	scratch.writeFinding('audit-security-upload-traversal', TRAVERSAL, ['backend/src/storage.ts']);
}

/**
 * Drives the real check:audit-evals command against a scratch copy of the repository inputs:
 * a passing attestation is green, then a stale definition, a missed defect, a decoy report that
 * borrows a defect's vocabulary, and a finding on the wrong symbol each turn it red or leave recall
 * where it was. Returns the process exit code.
 */
export async function runAuditEvalSelfTest(root: string): Promise<number> {
	const scratchParent = path.join(root, 'tmp');
	mkdirSync(scratchParent, { recursive: true });
	const scratchDir = mkdtempSync(path.join(scratchParent, 'audit-evals-'));
	let assertions = 0;
	const assert = (condition: boolean, message: string): void => {
		if (!condition) throw new Error(message);
		assertions += 1;
	};
	try {
		const scratch = stageAuditEvalScratch(root, scratchDir);
		const floors = loadAuditEvalFloors(scratch.floorsPath);
		const perfectRuns = (score: AuditEvalRunScore): AuditEvalRunScore[] =>
			Array.from({ length: floors.minRuns }, () => score);
		assert(
			scratch.catalog.defects.length >= 3,
			'The fixture must plant at least three defects',
		);
		assert(scratch.catalog.decoys.length >= 2, 'The fixture must plant at least two decoys');

		plantAllDefects(scratch);
		let score = scratch.score();
		assert(score.precision === 1 && score.recall === 1, 'Exact defects must score perfectly');
		await scratch.writeAttestation(perfectRuns(score));
		let gate = runGate(root, scratchDir, true);
		assert(gate.exitCode === 0, `Perfect attestation must pass:\n${gate.output}`);
		const jsonLine = gate.output.split(/\r?\n/).find((line) => line.trim().startsWith('{'));
		if (!jsonLine) throw new Error(`Gate did not emit a JSON envelope:\n${gate.output}`);
		const envelope = JSON.parse(jsonLine) as {
			examined?: number;
			findings?: unknown[];
			gate?: string;
			status?: string;
		};
		assert(
			envelope.gate === 'check:audit-evals' &&
				envelope.status === 'pass' &&
				(envelope.examined ?? 0) > 0 &&
				Array.isArray(envelope.findings),
			gate.output,
		);
		gate = runGate(root, scratchDir);
		assert(
			gate.output.includes(`1 of ${STAGED_AUDITS.length} audits measured`),
			`Gate must report measured and unmeasured audits apart:\n${gate.output}`,
		);
		const badArgs = Bun.spawnSync(
			['bun', 'run', 'check:audit-evals', '--', '--not-a-real-option'],
			{ cwd: root, stderr: 'pipe', stdout: 'pipe' },
		);
		assert(badArgs.exitCode === 2, 'Bad gate arguments must use exit code 2');
		assert(
			badArgs.stderr.toString().includes('Usage: check:audit-evals'),
			'Bad gate arguments must print usage to stderr',
		);

		await scratch.writeAttestation(perfectRuns(score).slice(1));
		gate = runGate(root, scratchDir);
		assert(
			gate.exitCode === 1 && gate.output.includes(`floors require ${floors.minRuns}`),
			`Too few runs must make the real gate red:\n${gate.output}`,
		);
		await scratch.writeAttestation(perfectRuns(score));

		const hygiene = path.join(scratchDir, 'audits', 'HYGIENE.md');
		appendFileSync(hygiene, '\nattestation-staleness-probe\n');
		gate = runGate(root, scratchDir);
		assert(
			gate.exitCode === 1 &&
				gate.output.includes('audits/HYGIENE.md:1 audit definition hash is stale'),
			`An audit definition edit must make the real gate red:\n${gate.output}`,
		);
		cpSync(path.join(root, 'audits', 'HYGIENE.md'), hygiene);

		scratch.resetFindings();
		scratch.writeFinding('audit-security-unescaped-html', XSS);
		scratch.writeFinding('audit-security-admin-header', ADMIN);
		score = scratch.score();
		assert(score.recall === 2 / 3, 'A deliberately missed defect must lower recall to 2/3');
		await scratch.writeAttestation(perfectRuns(score));
		gate = runGate(root, scratchDir);
		assert(
			gate.exitCode === 1 && gate.output.includes('recall 0.6667 is below'),
			`Missed defect must make the real gate red:\n${gate.output}`,
		);

		// A wrong-symbol finding borrows the traversal vocabulary but points at publicAssetUrl.
		scratch.writeFinding(
			'audit-security-wrong-symbol',
			'publicAssetUrl allows path traversal outside the upload directory.',
			['backend/src/storage.ts'],
		);
		score = scratch.score();
		assert(score.recall === 2 / 3, 'A finding on the wrong symbol must not raise recall');
		assert(
			score.decoyFindingIds.includes('audit-security-wrong-symbol') &&
				score.precision === 2 / 3,
			'A decoy report borrowing a defect alias must count as a decoy hit',
		);

		scratch.resetFindings();
		plantAllDefects(scratch);
		scratch.writeFinding(
			'audit-security-public-health',
			'The public health endpoint has no authentication and should be restricted.',
		);
		scratch.writeFinding(
			'audit-security-asset-url',
			'publicAssetUrl builds a URL from user input and allows path traversal.',
			['backend/src/storage.ts'],
		);
		score = scratch.score();
		assert(
			score.precision === 0.6 && score.recall === 1,
			'Two flagged decoys must lower precision without touching recall',
		);
		await scratch.writeAttestation(perfectRuns(score));
		gate = runGate(root, scratchDir);
		assert(
			gate.exitCode === 1 && gate.output.includes('precision 0.6000 is below'),
			`Flagged decoys must make the real gate red:\n${gate.output}`,
		);

		console.log(`[OK] Audit eval executable regression passed (${assertions} assertions).`);
		return 0;
	} catch (err) {
		console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	} finally {
		rmSync(scratchDir, { force: true, recursive: true });
	}
}
