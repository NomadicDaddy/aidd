import { discoverAuditNames } from 'aidd-shared/modes/audit-shared';
import { auditDefinitionSha256 } from 'aidd-shared/run-provenance';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { AuditEvalRunScore, BenchmarkManifest } from '../benchmark/types.ts';
import type { AuditEvalFloors } from './floors.ts';

import { hashTaskFixture, listFiles } from '../benchmark/execution.ts';
import { loadManifest } from '../benchmark/manifest.ts';
import { loadRuns } from '../benchmark/results.ts';
import { loadAuditEvalFloors } from './floors.ts';

export interface AuditEvalAttestationRow {
	auditId: string;
	minPrecision: number;
	minRecall: number;
	minRuns: number;
	precision: number;
	recall: number;
	runs: number;
	/** Findings across the measured runs that matched neither a defect nor a decoy. */
	uncatalogedFindings: number;
}

export interface AuditEvalAttestation {
	/** Audit id to the normalized definition hash a run's driverSha256 carries. */
	auditDefinitions: Record<string, string>;
	/** Every file under audits/, by slash-separated relative path, to its raw content hash. */
	auditFiles: Record<string, string>;
	audits: AuditEvalAttestationRow[];
	generatedAt: string;
	manifestHash: string;
	/** SHA-256 over the benchmark run records the rows were averaged from, in ledger order. */
	resultsDigest: string;
	version: 1;
}

/** The slice of a benchmark run the attestation reads; a BenchmarkRun satisfies it. */
export interface AuditEvalRunRecord {
	auditEval?: AuditEvalRunScore;
	fixtureHash?: string;
	stack: { label: string };
	taskId: string;
}

export interface AuditEvalAttestationInput {
	floorsPath: string;
	manifestPath: string;
	runs: AuditEvalRunRecord[];
}

export function sha256File(filePath: string): string {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * The per-audit hash the attestation records, computed by the same helper the CLI uses for a
 * single-audit run's driverSha256, so a run can be matched to the attested definition.
 */
export function sha256AuditDefinitionFile(filePath: string): string {
	return auditDefinitionSha256(readFileSync(filePath, 'utf8'));
}

/** Raw content hashes for everything under audits/, methodology and mapping files included. */
export function hashAuditFiles(root: string): Record<string, string> {
	const auditsDir = path.join(root, 'audits');
	const hashes: Record<string, string> = {};
	for (const filePath of listFiles(auditsDir).sort()) {
		hashes[path.relative(auditsDir, filePath).replaceAll('\\', '/')] = sha256File(filePath);
	}
	return hashes;
}

function auditIds(manifest: BenchmarkManifest): string[] {
	return [
		...new Set(
			manifest.tasks
				.map((task) => task.auditEval?.auditId)
				.filter((auditId): auditId is string => auditId !== undefined),
		),
	].sort();
}

/**
 * Only runs of the current fixture count. The results ledger keeps every run ever made, so a
 * fixture that grew a defect must not be attested from runs that never saw it.
 */
export function selectAttestedRuns(
	manifestPath: string,
	manifest: BenchmarkManifest,
	runs: AuditEvalRunRecord[],
): { selected: AuditEvalRunRecord[]; skippedStale: number } {
	const fixtureHashes = new Map<string, string>();
	for (const task of manifest.tasks) {
		if (task.auditEval) {
			fixtureHashes.set(task.id, hashTaskFixture(manifestPath, task));
		}
	}
	const stackLabels = new Set(manifest.stacks.map((stack) => stack.label));
	let skippedStale = 0;
	const selected = runs.filter((run) => {
		const expected = fixtureHashes.get(run.taskId);
		if (expected === undefined || !stackLabels.has(run.stack.label) || !run.auditEval) {
			return false;
		}
		if (run.fixtureHash !== undefined && run.fixtureHash !== expected) {
			skippedStale += 1;
			return false;
		}
		return true;
	});
	return { selected, skippedStale };
}

function digestRuns(runs: AuditEvalRunRecord[]): string {
	const hash = createHash('sha256');
	for (const run of runs) {
		hash.update(JSON.stringify(run));
		hash.update('\n');
	}
	return hash.digest('hex');
}

export async function buildAuditEvalAttestation(
	root: string,
	input: AuditEvalAttestationInput,
): Promise<AuditEvalAttestation> {
	const manifest = loadManifest(input.manifestPath);
	if (!manifest.scoring.auditEval) {
		throw new Error('Audit eval manifest has no scoring.auditEval block');
	}
	const floors = loadAuditEvalFloors(input.floorsPath);
	const scores = input.runs
		.map((run) => run.auditEval)
		.filter((score): score is AuditEvalRunScore => score !== undefined);
	const average = (values: number[]): number =>
		values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
	const audits = auditIds(manifest).map((auditId): AuditEvalAttestationRow => {
		const matching = scores.filter((score) => score.auditId === auditId);
		return {
			auditId,
			minPrecision: floors.minPrecision,
			minRecall: floors.minRecall,
			minRuns: floors.minRuns,
			precision: average(matching.map((score) => score.precision)),
			recall: average(matching.map((score) => score.recall)),
			runs: matching.length,
			uncatalogedFindings: matching.reduce(
				(total, score) => total + score.uncatalogedFindingIds.length,
				0,
			),
		};
	});
	const auditDefinitions: Record<string, string> = {};
	for (const auditId of await discoverAuditNames(root)) {
		auditDefinitions[auditId] = sha256AuditDefinitionFile(
			path.join(root, 'audits', `${auditId}.md`),
		);
	}
	return {
		auditDefinitions,
		auditFiles: hashAuditFiles(root),
		audits,
		generatedAt: new Date().toISOString(),
		manifestHash: sha256File(input.manifestPath),
		resultsDigest: digestRuns(input.runs),
		version: 1,
	};
}

export function attestationPasses(
	attestation: AuditEvalAttestation,
	floors: AuditEvalFloors,
): boolean {
	return (
		attestation.audits.length > 0 &&
		attestation.audits.every(
			(row) =>
				row.runs >= floors.minRuns &&
				row.precision >= floors.minPrecision &&
				row.recall >= floors.minRecall,
		)
	);
}

export interface WriteAttestationOptions {
	attestationPath: string;
	floorsPath: string;
	manifestPath: string;
	resultsDir: string;
	/** Record a below-floor result anyway; without it a failing attestation is never written. */
	writeFailing: boolean;
}

export interface WriteAttestationResult {
	attestation: AuditEvalAttestation;
	passes: boolean;
	skippedStale: number;
	written: boolean;
}

export async function writeAuditEvalAttestation(
	root: string,
	options: WriteAttestationOptions,
): Promise<WriteAttestationResult> {
	const manifest = loadManifest(options.manifestPath);
	const { selected, skippedStale } = selectAttestedRuns(
		options.manifestPath,
		manifest,
		loadRuns(path.join(options.resultsDir, 'runs.jsonl')),
	);
	const attestation = await buildAuditEvalAttestation(root, {
		floorsPath: options.floorsPath,
		manifestPath: options.manifestPath,
		runs: selected,
	});
	const passes = attestationPasses(attestation, loadAuditEvalFloors(options.floorsPath));
	const written = passes || options.writeFailing;
	if (written) {
		mkdirSync(path.dirname(options.attestationPath), { recursive: true });
		writeFileSync(options.attestationPath, `${JSON.stringify(attestation, null, '\t')}\n`);
	}
	return { attestation, passes, skippedStale, written };
}
