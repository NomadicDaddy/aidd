import { printJson } from 'aidd-shared/metadata/json-format';
import { MATURITY_SKIP_FILE } from 'aidd-shared/metadata/maturity';
import { metadataPath } from 'aidd-shared/metadata/paths';
import {
	projectProfilePath,
	readProjectAssuranceProfile,
	writeProjectAssuranceProfile,
} from 'aidd-shared/metadata/project-profile';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ProjectDetailDto, ProjectProfileUpdateDto } from '../../types.ts';

import { recordDataMovement } from '../dataMovementTrace.ts';
import { HttpError } from '../errors.ts';

interface ProjectResolverContext {
	resolveDiscoveredProject: (projectId: string) => Promise<string>;
}

interface ProfileContext extends ProjectResolverContext {
	invalidateProjectListing: (projectDir: string) => void;
}

export async function updateProjectProfile(
	ctx: ProfileContext,
	projectId: string,
	input: ProjectProfileUpdateDto,
): Promise<ProjectDetailDto['metadata']['profile']> {
	const projectDir = await ctx.resolveDiscoveredProject(projectId);
	try {
		const profile = await writeProjectAssuranceProfile(projectDir, input);
		recordDataMovement({
			category: 'metadata',
			operation: 'project.profile',
			status: 'success',
			summary: { projectId },
			target: projectProfilePath(projectDir),
		});
		ctx.invalidateProjectListing(projectDir);
		return profile;
	} catch (err) {
		if (err instanceof Error) throw new HttpError(err.message, 400);
		throw err;
	}
}

/**
 * Materialize `.aidd/project-profile.json` from the inferred profile (the maturity "create a
 * profile" action), through the same write and listing invalidation as an operator edit.
 * @param ctx Project resolution and listing invalidation.
 * @param projectId The discovered project to write the profile for.
 */
export async function ensureProjectProfile(ctx: ProfileContext, projectId: string): Promise<void> {
	const projectDir = await ctx.resolveDiscoveredProject(projectId);
	const inferred = await readProjectAssuranceProfile(projectDir);
	await updateProjectProfile(ctx, projectId, {
		authMode: inferred.authMode,
		bucket: inferred.bucket,
		criticality: inferred.criticality,
		dataSensitivity: inferred.dataSensitivity,
		deployment: inferred.deployment,
		derivesFromTemplate: inferred.derivesFromTemplate,
		externalIntegrations: inferred.externalIntegrations,
		hasCliBinary: inferred.hasCliBinary,
		publishesReleaseArchives: inferred.publishesReleaseArchives,
		shipsContainerImage: inferred.shipsContainerImage,
		...(inferred.notes ? { notes: inferred.notes } : {}),
	});
}

export async function updateMaturitySkip(
	ctx: ProjectResolverContext,
	projectId: string,
	skip: string[],
): Promise<{ skip: string[] }> {
	const projectDir = await ctx.resolveDiscoveredProject(projectId);
	const normalized = [...new Set(skip.filter((s) => typeof s === 'string' && s.length > 0))];
	const metadataDir = metadataPath(projectDir);
	await mkdir(metadataDir, { recursive: true });
	const payload = {
		skip: normalized,
		updatedAt: new Date().toISOString(),
	};
	const targetPath = join(metadataDir, MATURITY_SKIP_FILE);
	await writeFile(targetPath, printJson(payload));
	recordDataMovement({
		category: 'metadata',
		operation: 'maturity.skip',
		status: 'success',
		summary: { count: normalized.length, projectId },
		target: targetPath,
	});
	return { skip: normalized };
}
