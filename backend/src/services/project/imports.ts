import type { ResolvedWebConfig } from 'aidd-shared/config';

import { ensureHistoryGuard } from 'aidd-shared/metadata/history-guard';
import { metadataPath } from 'aidd-shared/metadata/paths';
import { mkdir } from 'node:fs/promises';

import type {
	ProjectImportActionDto,
	ProjectImportCandidateDto,
	ProjectImportCandidateResultDto,
	ProjectImportResultDto,
} from '../../types.ts';
import type { MaturityContext } from '../projectMetadata.ts';

import { assertAllowedPath, encodeProjectId } from '../../paths.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { HttpError } from '../errors.ts';
import { directoryExists, hasAiddMetadata } from './discovery.ts';
import { listImportCandidates } from './listings.ts';

interface ImportContext {
	catalogDir: null | string;
	config: ResolvedWebConfig;
	maturityContext: MaturityContext | null;
	resolveDiscoveredProject(projectId: string): Promise<string>;
}

export type LaunchIntake = (projectDir: string) => Promise<{ id: string }>;

function makeFailedImportResult(
	candidateId: string,
	path: string,
	error: string
): ProjectImportCandidateResultDto {
	return {
		candidateId,
		error,
		intakeSessionId: null,
		path,
		projectId: null,
		runId: null,
		status: 'failed',
	};
}

function validateImportCandidate(
	candidateId: string,
	byId: ReadonlyMap<string, ProjectImportCandidateDto>
): { candidate: ProjectImportCandidateDto } | { failure: ProjectImportCandidateResultDto } {
	const candidate = byId.get(candidateId);
	if (!candidate) {
		return {
			failure: makeFailedImportResult(
				candidateId,
				'',
				'Candidate is no longer available for import'
			),
		};
	}
	if (!candidate.canImport) {
		return {
			failure: makeFailedImportResult(
				candidateId,
				candidate.path,
				candidate.reason ?? 'Candidate cannot be imported'
			),
		};
	}
	return { candidate };
}

async function importValidatedCandidate(
	ctx: ImportContext,
	candidate: ProjectImportCandidateDto,
	action: ProjectImportActionDto,
	launchIntake: LaunchIntake
): Promise<ProjectImportCandidateResultDto> {
	const resolvedPath = assertAllowedPath(ctx.config.allowedRoots, candidate.path);
	if (!(await directoryExists(resolvedPath))) {
		throw new HttpError('Candidate directory no longer exists', 404);
	}
	if (await hasAiddMetadata(resolvedPath)) {
		throw new HttpError('Project already has .aidd metadata', 409);
	}
	await mkdir(metadataPath(resolvedPath, 'features'), { recursive: true });
	await mkdir(metadataPath(resolvedPath, 'iterations'), { recursive: true });
	// Ingest is the lane that most needs the guard and the only one that inits no git: it writes
	// .aidd/ into a repository that already exists and already has whatever remote it was cloned
	// from. Without this, importing a clone of your own GitHub project produces an unguarded
	// local-only repo — the exact shape that let .aidd/ history reach a public remote before.
	await ensureHistoryGuard(resolvedPath);
	recordDataMovement({
		category: 'metadata',
		operation: 'project.import',
		status: 'success',
		summary: { action, candidateId: candidate.id },
		target: metadataPath(resolvedPath),
	});
	// Registration alone is a valid end state: the project is discoverable once the
	// .aidd skeleton exists, so an intake-launch failure must not roll it back.
	let intakeSessionId: null | string = null;
	let error: null | string = null;
	if (action === 'ingest') {
		try {
			const session = await launchIntake(resolvedPath);
			intakeSessionId = session.id;
		} catch (err) {
			error = `Registered, but intake launch failed: ${
				err instanceof Error ? err.message : String(err)
			}`;
		}
	}
	return {
		candidateId: candidate.id,
		error,
		intakeSessionId,
		path: resolvedPath,
		projectId: encodeProjectId(resolvedPath),
		runId: null,
		status: 'imported',
	};
}

export async function importProjects(
	ctx: ImportContext,
	candidateIds: string[],
	action: ProjectImportActionDto,
	launchIntake: LaunchIntake
): Promise<ProjectImportResultDto> {
	const uniqueIds = [...new Set(candidateIds)];
	if (uniqueIds.length === 0) {
		throw new HttpError('Select at least one project to import', 400);
	}
	const candidates = await listImportCandidates(ctx);
	const byId = new Map(candidates.candidates.map((candidate) => [candidate.id, candidate]));
	const results: ProjectImportCandidateResultDto[] = [];
	for (const candidateId of uniqueIds) {
		const validated = validateImportCandidate(candidateId, byId);
		if ('failure' in validated) {
			results.push(validated.failure);
			continue;
		}
		const { candidate } = validated;
		try {
			results.push(await importValidatedCandidate(ctx, candidate, action, launchIntake));
		} catch (err) {
			results.push(
				makeFailedImportResult(
					candidateId,
					candidate.path,
					err instanceof Error ? err.message : 'Import failed'
				)
			);
		}
	}
	return { results };
}
