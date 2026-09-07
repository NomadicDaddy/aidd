import { defaultIgnoredFolders, type ResolvedWebConfig } from 'aidd-shared/config';
import { metadataPath } from 'aidd-shared/metadata/paths';
import { cp, rename, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import {
	assertAllowedPath,
	buildProjectRouteIds,
	canonicalProjectPath,
	decodeProjectId,
	encodeProjectId,
	matchesProjectRouteDisambiguator,
	pathIsInside,
} from '../../paths.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { HttpError } from '../errors.ts';
import {
	createIgnoredDirectoryMatcher,
	directoryExists,
	hasAiddMetadata,
	scanRoot,
} from './discovery.ts';
import {
	type ProjectDeleteInput,
	type ProjectMoveInput,
	type ProjectMoveResult,
	ProjectNotFoundError,
} from './types.ts';

interface LifecycleContext {
	config: ResolvedWebConfig;
}

const RENAME_RETRY_DELAYS_MS = [50, 150, 350] as const;

function assertProjectDirectoryName(name: string): string {
	const trimmed = name.trim();
	if (
		trimmed.length === 0 ||
		trimmed === '.' ||
		trimmed === '..' ||
		trimmed.includes('/') ||
		trimmed.includes('\\')
	) {
		throw new HttpError('Invalid destination project name', 400);
	}
	return trimmed;
}

function getErrorCode(error: unknown): null | string {
	if (typeof error !== 'object' || error === null || !('code' in error)) {
		return null;
	}
	const code = (error as { code?: unknown }).code;
	return typeof code === 'string' ? code : null;
}

function isCrossDeviceError(error: unknown): boolean {
	return getErrorCode(error) === 'EXDEV';
}

function isRenameRetryableError(error: unknown): boolean {
	const code = getErrorCode(error);
	return code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'EPERM';
}

function isProjectMoveBlockedError(error: unknown): boolean {
	const code = getErrorCode(error);
	return code === 'EACCES' || code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'EPERM';
}

async function renameWithRetry(sourcePath: string, destinationPath: string): Promise<void> {
	let attempt = 0;
	for (;;) {
		try {
			await rename(sourcePath, destinationPath);
			return;
		} catch (err) {
			if (!isRenameRetryableError(err) || attempt >= RENAME_RETRY_DELAYS_MS.length) {
				throw err;
			}
			await sleep(RENAME_RETRY_DELAYS_MS[attempt]);
			attempt += 1;
		}
	}
}

function projectMoveBlockedError(sourcePath: string, destinationPath: string): HttpError {
	return new HttpError(
		`Project directory could not be moved from ${sourcePath} to ${destinationPath} because the folder is in use or access was denied. Close terminals, editors, Explorer windows, dev servers, and other processes using the project folder, then try again.`,
		409,
	);
}

async function rollbackMove(sourcePath: string, destinationPath: string): Promise<void> {
	if (!(await directoryExists(destinationPath))) return;
	try {
		await rename(destinationPath, sourcePath);
	} catch (err) {
		if (!isCrossDeviceError(err)) throw err;
		await cp(destinationPath, sourcePath, { recursive: true });
		await rm(destinationPath, { recursive: true });
	}
}

export async function resolveProjectPath(ctx: LifecycleContext, path: string): Promise<string> {
	const resolved = assertAllowedPath(ctx.config.allowedRoots, path);
	if (!(await directoryExists(resolved))) {
		throw new ProjectNotFoundError(`Project directory does not exist: ${path}`);
	}
	return canonicalProjectPath(resolved);
}

export async function resolveDiscoveredProject(
	ctx: LifecycleContext,
	projectId: string,
): Promise<string> {
	// Primary path: try base64url-encoded absolute path first
	let decoded: string;
	try {
		decoded = decodeProjectId(projectId);
	} catch {
		return resolveByNameFallback(ctx, projectId);
	}
	let resolved: string;
	try {
		resolved = assertAllowedPath(ctx.config.allowedRoots, decoded);
	} catch {
		return resolveByNameFallback(ctx, projectId);
	}
	if (!(await directoryExists(resolved)) || !(await hasAiddMetadata(resolved))) {
		return resolveByNameFallback(ctx, projectId);
	}
	return canonicalProjectPath(resolved);
}

async function resolveByNameFallback(ctx: LifecycleContext, projectId: string): Promise<string> {
	const isCaseInsensitive = process.platform === 'win32';
	const isIgnoredDirectory = createIgnoredDirectoryMatcher(
		ctx.config.ignoredFolders.length > 0 ? ctx.config.ignoredFolders : defaultIgnoredFolders,
	);
	const scans = await Promise.all(
		ctx.config.allowedRoots.map((root) => scanRoot(root, 2, isIgnoredDirectory)),
	);
	const seenPaths = new Set<string>();
	const candidates: string[] = [];
	for (const scan of scans) {
		for (const project of scan.projects) {
			const canonicalPath = resolve(project.path);
			if (seenPaths.has(canonicalPath)) continue;
			seenPaths.add(canonicalPath);
			candidates.push(canonicalPath);
		}
	}
	const nameMatches = (name: string, expected: string): boolean =>
		isCaseInsensitive ? name.toLowerCase() === expected.toLowerCase() : name === expected;
	let matches = candidates.filter((path) => nameMatches(basename(path), projectId));
	if (matches.length === 0) {
		const disambiguated = /^(.*)~([a-f0-9]{8,64})$/i.exec(projectId);
		if (disambiguated) {
			const [, slug = '', disambiguator = ''] = disambiguated;
			matches = candidates.filter(
				(path) =>
					nameMatches(basename(path), slug) &&
					matchesProjectRouteDisambiguator(path, disambiguator.toLowerCase()),
			);
		}
	}
	if (matches.length === 1) {
		return matches[0]!;
	}
	if (matches.length > 1) {
		const routeIds = buildProjectRouteIds(matches);
		const choices = matches
			.map((path) => routeIds.get(path) ?? encodeProjectId(path))
			.join(', ');
		throw new ProjectNotFoundError(
			`Ambiguous project name "${projectId}" matches ${matches.length} projects. Use one of: ${choices}.`,
		);
	}
	throw new ProjectNotFoundError(`Project not found: ${projectId}`);
}

export async function deleteProject(
	ctx: LifecycleContext,
	projectId: string,
	input: ProjectDeleteInput,
	hasActiveRuns: (projectPath: string) => Promise<boolean>,
	purgeProjectRuns: (projectPath: string) => Promise<number>,
	hasScheduledTasks?: (projectPath: string) => Promise<boolean>,
): Promise<{ id: string; mode: ProjectDeleteInput['mode']; path: string }> {
	const projectDir = await resolveDiscoveredProject(ctx, projectId);
	if (canonicalProjectPath(input.confirmation) !== projectDir) {
		throw new HttpError('Project path confirmation does not match', 400);
	}
	if (await hasActiveRuns(projectDir)) {
		throw new HttpError('Project has active runs and cannot be deleted', 409);
	}
	if (hasScheduledTasks && (await hasScheduledTasks(projectDir))) {
		throw new HttpError('Project is referenced by a scheduled task and cannot be deleted', 409);
	}
	const target = input.mode === 'metadata' ? metadataPath(projectDir) : projectDir;
	await rm(target, { recursive: true });
	// Symmetric with createProject: drop the project's path-keyed run/pipeline/invocation rows so
	// deletion leaves no orphaned history for the 24h Active-runs window to surface (the project is
	// no longer discoverable after this, so those rows can never be reconciled otherwise). The
	// active-runs guard above guarantees we never purge a live run out from under its process.
	await purgeProjectRuns(projectDir);
	recordDataMovement({
		category: 'file',
		operation: input.mode === 'metadata' ? 'project.metadata.delete' : 'project.delete',
		status: 'success',
		summary: { mode: input.mode, projectId },
		target,
	});
	return { id: projectId, mode: input.mode, path: projectDir };
}

export async function moveProject(
	ctx: LifecycleContext,
	projectId: string,
	input: ProjectMoveInput,
	hasActiveRuns: (projectPath: string) => Promise<boolean>,
	updateProjectPathReferences: (sourcePath: string, destinationPath: string) => Promise<void>,
): Promise<ProjectMoveResult> {
	const sourcePath = await resolveDiscoveredProject(ctx, projectId);
	if (canonicalProjectPath(input.confirmation) !== sourcePath) {
		throw new HttpError('Project path confirmation does not match', 400);
	}
	if (await hasActiveRuns(sourcePath)) {
		throw new HttpError('Project has active runs and cannot be moved', 409);
	}
	const destinationRoot = assertAllowedPath(ctx.config.allowedRoots, input.destinationRoot);
	if (!(await directoryExists(destinationRoot))) {
		throw new HttpError('Destination root does not exist', 400);
	}
	const destinationName = assertProjectDirectoryName(
		input.destinationName?.trim() || basename(sourcePath),
	);
	const destinationPath = assertAllowedPath(
		[destinationRoot],
		join(destinationRoot, destinationName),
	);
	if (canonicalProjectPath(destinationPath) === sourcePath) {
		throw new HttpError('Project is already at that destination', 409);
	}
	if (pathIsInside(sourcePath, destinationPath)) {
		throw new HttpError('Project cannot be moved inside itself', 400);
	}
	if (await directoryExists(destinationPath)) {
		throw new HttpError('Destination path already exists', 409);
	}
	try {
		await renameWithRetry(sourcePath, destinationPath);
	} catch (err) {
		if (!isCrossDeviceError(err)) {
			if (isProjectMoveBlockedError(err)) {
				throw projectMoveBlockedError(sourcePath, destinationPath);
			}
			throw err;
		}
		try {
			await cp(sourcePath, destinationPath, { recursive: true });
			await rm(sourcePath, { recursive: true });
		} catch (err) {
			await rm(destinationPath, { force: true, recursive: true }).catch(() => {});
			if (isProjectMoveBlockedError(err)) {
				throw projectMoveBlockedError(sourcePath, destinationPath);
			}
			throw err;
		}
	}
	try {
		await updateProjectPathReferences(sourcePath, destinationPath);
	} catch (err) {
		await rollbackMove(sourcePath, destinationPath);
		throw err;
	}
	recordDataMovement({
		category: 'file',
		operation: 'project.move',
		status: 'success',
		summary: { destinationPath, sourcePath },
		target: destinationPath,
	});
	return {
		id: encodeProjectId(destinationPath),
		name: basename(destinationPath),
		path: destinationPath,
		previousId: projectId,
		previousPath: sourcePath,
	};
}
