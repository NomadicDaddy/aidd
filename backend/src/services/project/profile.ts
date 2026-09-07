import { printJson } from 'aidd-shared/metadata/json-format';
import { MATURITY_SKIP_FILE } from 'aidd-shared/metadata/maturity';
import { metadataPath } from 'aidd-shared/metadata/paths';
import {
	projectProfilePath,
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
