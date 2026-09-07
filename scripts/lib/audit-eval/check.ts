import { discoverAuditNames } from 'aidd-shared/modes/audit-shared';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { AuditEvalSite, BenchmarkManifest } from '../benchmark/types.ts';
import type { AuditEvalFinding } from './check-scores.ts';

import { fixturePathForTask, listFiles } from '../benchmark/execution.ts';
import { loadManifest } from '../benchmark/manifest.ts';
import { readAttestation } from './attestation-read.ts';
import { sha256File } from './attestation.ts';
import { auditEvalFinding, checkAttestedScores, checkAuditFileHashes } from './check-scores.ts';
import { loadAuditEvalFloors } from './floors.ts';

export interface AuditEvalCheckResult {
	examined: number;
	findings: AuditEvalFinding[];
	gate: 'check:audit-evals';
	/** Files under audits/ whose hashes were compared with the attestation. */
	hashedFiles: number;
	/** Runnable audits with a planted-defect catalog and an attested score. */
	measuredAudits: number;
	status: 'fail' | 'pass';
	/** Runnable audits that are only hash-gated, with no catalog of their own yet. */
	unmeasuredAudits: number;
}

/** Words that would tell the audited model which sites are the answer key. */
const DISCLOSURE_TOKENS = /decoy|eval/i;

function resolveFixtureFile(
	fixtureRoot: string,
	site: AuditEvalSite,
	label: string,
	findings: AuditEvalFinding[],
): void {
	const target = path.resolve(fixtureRoot, site.file);
	const relative = path.relative(fixtureRoot, target);
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
		findings.push(
			auditEvalFinding('evals/audits/manifest.json', `${label} escapes its fixture root`),
		);
		return;
	}
	if (!existsSync(target)) {
		findings.push(auditEvalFinding(site.file, `${label} fixture file does not exist`));
		return;
	}
	const body = readFileSync(target, 'utf8');
	if (site.line !== undefined) {
		const lines = body.split(/\r?\n/);
		if (site.line > lines.length || !(lines[site.line - 1] ?? '').trim()) {
			findings.push(
				auditEvalFinding(
					site.file,
					`${label} line ${site.line} is absent or blank`,
					site.line,
				),
			);
		}
	}
	if (site.symbol !== undefined && !body.includes(site.symbol)) {
		findings.push(auditEvalFinding(site.file, `${label} symbol ${site.symbol} was not found`));
	}
}

/**
 * The fixture's .aidd/ directory is what the audited model reads as the project's source of truth,
 * so nothing in it may name a decoy or mention the evaluation. Returns the files inspected.
 */
function checkFixtureDisclosure(
	root: string,
	fixtureRoot: string,
	findings: AuditEvalFinding[],
): number {
	const metadataDir = path.join(fixtureRoot, '.aidd');
	let inspected = 0;
	for (const filePath of listFiles(metadataDir)) {
		inspected += 1;
		const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
		const index = lines.findIndex((line) => DISCLOSURE_TOKENS.test(line));
		if (index === -1) continue;
		const token = DISCLOSURE_TOKENS.exec(lines[index] ?? '')?.[0].toLowerCase() ?? 'decoy';
		findings.push(
			auditEvalFinding(
				path.relative(root, filePath),
				`fixture metadata discloses the answer key (token: ${token})`,
				index + 1,
			),
		);
	}
	return inspected;
}

function checkCatalog(
	root: string,
	manifestPath: string,
	manifest: BenchmarkManifest,
	runnable: Set<string>,
	findings: AuditEvalFinding[],
): number {
	let examined = 0;
	for (const task of manifest.tasks) {
		const catalog = task.auditEval;
		if (!catalog) continue;
		if (!runnable.has(catalog.auditId)) {
			findings.push(
				auditEvalFinding(
					'evals/audits/manifest.json',
					`${catalog.auditId} is not a runnable audit`,
				),
			);
		}
		const fixtureRoot = fixturePathForTask(manifestPath, task);
		for (const site of [...catalog.defects, ...catalog.decoys]) {
			examined += 1;
			resolveFixtureFile(fixtureRoot, site, `${catalog.auditId}/${site.id}`, findings);
		}
		examined += checkFixtureDisclosure(root, fixtureRoot, findings);
	}
	return examined;
}

export async function inspectAuditEvals(root: string): Promise<AuditEvalCheckResult> {
	const manifestPath = path.join(root, 'evals', 'audits', 'manifest.json');
	const attestationPath = path.join(root, 'evals', 'audits', 'attestation.json');
	const floorsPath = path.join(root, 'evals', 'audits', 'floors.json');
	const manifest = loadManifest(manifestPath);
	const attestation = readAttestation(attestationPath);
	const floors = loadAuditEvalFloors(floorsPath);
	const runnableNames = await discoverAuditNames(root);
	if (runnableNames.length === 0) throw new Error('runnable audit catalog is empty');
	const runnable = new Set(runnableNames);
	const findings: AuditEvalFinding[] = [];
	let examined = checkCatalog(root, manifestPath, manifest, runnable, findings);
	const measuredAudits = checkAttestedScores(manifest, attestation, floors, findings);
	examined += measuredAudits;
	if (attestation.manifestHash !== sha256File(manifestPath)) {
		findings.push(auditEvalFinding('evals/audits/attestation.json', 'manifest hash is stale'));
	}
	const hashedFiles = checkAuditFileHashes(root, runnableNames, attestation, findings);
	examined += hashedFiles;
	if (examined === 0) {
		findings.push(auditEvalFinding('evals/audits/manifest.json', 'nothing was examined'));
	}
	return {
		examined,
		findings,
		gate: 'check:audit-evals',
		hashedFiles,
		measuredAudits,
		status: findings.length === 0 ? 'pass' : 'fail',
		unmeasuredAudits: runnableNames.filter((auditId) => !isMeasured(manifest, auditId)).length,
	};
}

function isMeasured(manifest: BenchmarkManifest, auditId: string): boolean {
	return manifest.tasks.some((task) => task.auditEval?.auditId === auditId);
}
