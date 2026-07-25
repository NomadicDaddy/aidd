import type { ResolvedWebConfig } from 'aidd-shared/config';

import { detectInitialPhase } from 'aidd-shared/metadata/onboarding';
import { detectProjectStack, manifestEntryVersion } from 'aidd-shared/metadata/project-stack';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { ProjectIntakeGitSummaryDto, ProjectIntakePreviewDto } from '../../types.ts';

import { assertAllowedPath } from '../../paths.ts';
import { HttpError } from '../errors.ts';
import { directoryExists, fileExists, hasAiddMetadata } from './discovery.ts';
import { resolveContainingRoot } from './listings/shared.ts';

interface IntakePreviewContext {
	config: ResolvedWebConfig;
}

async function gitSummary(path: string): Promise<ProjectIntakePreviewDto['git']> {
	async function git(...args: string[]): Promise<null | string> {
		try {
			const proc = Bun.spawn(['git', ...args], {
				cwd: path,
				stderr: 'pipe',
				stdout: 'pipe',
				windowsHide: true,
			});
			const [stdout, code] = await Promise.all([
				new Response(proc.stdout).text(),
				proc.exited,
			]);
			return code === 0 ? stdout : null;
		} catch {
			return null;
		}
	}
	const status = await git('status', '--porcelain', '--branch');
	if (status === null) return null;
	const lines = status.split('\n').filter((line) => line.length > 0);
	const branchLine = lines[0]?.startsWith('## ') ? lines[0].slice(3) : null;
	const branch = branchLine ? (branchLine.split('...')[0] ?? null) : null;
	const dirtyCount = lines.filter((line) => !line.startsWith('## ')).length;
	const log = await git('log', '-1', '--format=%h%x09%ci%x09%s');
	let lastCommit: ProjectIntakeGitSummaryDto['lastCommit'] = null;
	const logLine = log?.trim();
	if (logLine) {
		const [hash, date, ...subject] = logLine.split('\t');
		if (hash && date) lastCommit = { date, hash, subject: subject.join('\t') };
	}
	return { branch, dirtyCount, lastCommit };
}

// Reuse the shared tolerant fleet-manifest parser for intake diagnostics.
// Read or parse failures degrade to "not in manifest"; local file signals remain the fallback.
async function spernakitDetection(
	ctx: IntakePreviewContext,
	path: string,
	slug: string,
): Promise<ProjectIntakePreviewDto['spernakit']> {
	let inManifest = false;
	let manifestVersion: null | string = null;
	const manifestPath = ctx.config.spernakitFleetManifest;
	if (manifestPath && (await fileExists(manifestPath))) {
		try {
			const version = manifestEntryVersion(await readFile(manifestPath, 'utf8'), slug);
			if (version !== null) {
				inManifest = true;
				manifestVersion = version.length > 0 ? version : null;
			}
		} catch {
			// Manifest unreadable — fall through to file signals.
		}
	}
	const fileSignals =
		(await fileExists(join(path, 'backend', 'package.json'))) &&
		(await fileExists(join(path, 'frontend', 'package.json'))) &&
		(await fileExists(join(path, 'package.json')));
	return { fileSignals, inManifest, manifestVersion };
}

async function workspaceRootDetection(
	path: string,
): Promise<ProjectIntakePreviewDto['workspaceRoot']> {
	let entries: { isDirectory(): boolean; isSymbolicLink(): boolean; name: string }[];
	try {
		entries = await readdir(path, { withFileTypes: true });
	} catch {
		return { detected: false, subprojectCount: 0 };
	}
	let subprojectCount = 0;
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
		const child = join(path, entry.name);
		const isProject =
			(await fileExists(join(child, 'package.json'))) ||
			(await directoryExists(join(child, '.git'))) ||
			(await directoryExists(join(child, '.aidd')));
		if (isProject) subprojectCount += 1;
	}
	return { detected: subprojectCount >= 2, subprojectCount };
}

export async function getIntakePreview(
	ctx: IntakePreviewContext,
	path: string,
): Promise<ProjectIntakePreviewDto> {
	const resolved = assertAllowedPath(ctx.config.allowedRoots, path);
	if (!(await directoryExists(resolved))) {
		throw new HttpError(`Directory does not exist: ${path}`, 404);
	}
	const slug = basename(resolved);
	const containingRoot = resolveContainingRoot(ctx.config.allowedRoots, resolved);
	const [hasAidd, stack, git, spernakit, workspaceRoot, likelyPhase] = await Promise.all([
		hasAiddMetadata(resolved),
		detectProjectStack(resolved, {
			containingRoot,
			spernakitFleetManifest: ctx.config.spernakitFleetManifest,
		}),
		gitSummary(resolved),
		spernakitDetection(ctx, resolved, slug),
		workspaceRootDetection(resolved),
		detectInitialPhase(resolved),
	]);
	return {
		git,
		hasAidd,
		likelyPhase,
		name: slug,
		path: resolved,
		spernakit,
		stack,
		workspaceRoot,
	};
}
