import { isSynthesizedSpernakitTemplate, type ResolvedWebConfig } from 'aidd-shared/config';
import { type degitClone, parseGithubTemplateSource } from 'aidd-shared/git/degit';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	ProjectCreateInputDto,
	ProjectCreateResultDto,
	ProjectCreateSpecInputDto,
	RunLaunchRequest,
} from '../../types.ts';

import { assertAllowedPath, encodeProjectId } from '../../paths.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { HttpError } from '../errors.ts';
import { directoryExists, fileExists, hasAiddMetadata } from './discovery.ts';
import { allocateSpernakitPorts } from './portAllocation.ts';
import { ensureSpernakitCheckout } from './spernakitCheckout.ts';
import { runSpernakitInit } from './spernakitScaffold.ts';
import {
	type LaunchIntakeForCreate,
	type RecordInitFailure,
	runGithubTemplateClone,
	runTemplateScaffold,
} from './templateScaffold.ts';

export type { LaunchIntakeForCreate, RecordInitFailure } from './templateScaffold.ts';

interface CreateContext {
	config: ResolvedWebConfig;
}

// The template-scaffold engine (runTemplateScaffold and its helpers) lives in
// ./templateScaffold.ts; createProject orchestrates it below.

const MAX_SPEC_TEXT_BYTES = 64 * 1024;

function validateProjectName(name: string): string {
	const trimmed = name.trim();
	if (
		trimmed.length === 0 ||
		trimmed === '.' ||
		trimmed === '..' ||
		trimmed.includes('/') ||
		trimmed.includes('\\') ||
		!/^[A-Za-z0-9._-]+$/.test(trimmed)
	) {
		throw new HttpError(
			'Project name must contain only letters, numbers, dashes, underscores, or periods',
			400,
		);
	}
	return trimmed;
}

async function assertEmptyOrMissing(targetPath: string): Promise<void> {
	if (await directoryExists(targetPath)) {
		const entries = await readdir(targetPath);
		if (entries.length > 0) {
			throw new HttpError(`Destination already exists and is not empty: ${targetPath}`, 409);
		}
	}
	if (await hasAiddMetadata(targetPath)) {
		throw new HttpError(`Destination already contains .aidd metadata: ${targetPath}`, 409);
	}
}

async function resolveSpecFile(
	ctx: CreateContext,
	spec: null | ProjectCreateSpecInputDto,
): Promise<string | undefined> {
	if (!spec) return undefined;
	if (spec.kind === 'path') {
		const trimmed = spec.value.trim();
		if (trimmed.length === 0) return undefined;
		const resolvedPath = assertAllowedPath(ctx.config.allowedRoots, trimmed);
		if (!(await fileExists(resolvedPath))) {
			throw new HttpError(`Spec file does not exist: ${trimmed}`, 400);
		}
		return resolvedPath;
	}
	const text = spec.value;
	if (text.trim().length === 0) return undefined;
	if (Buffer.byteLength(text, 'utf8') > MAX_SPEC_TEXT_BYTES) {
		throw new HttpError(`Spec text exceeds maximum size of ${MAX_SPEC_TEXT_BYTES} bytes`, 400);
	}
	const scratchDir = join(ctx.config.dataDir, 'scratch', 'project-specs');
	await mkdir(scratchDir, { recursive: true });
	const scratchPath = join(scratchDir, `${randomUUID()}.md`);
	await writeFile(scratchPath, text, 'utf8');
	recordDataMovement({
		category: 'metadata',
		operation: 'project.create.spec-write',
		status: 'success',
		summary: { bytes: Buffer.byteLength(text, 'utf8') },
		target: scratchPath,
	});
	return scratchPath;
}

export async function createProject(
	ctx: CreateContext,
	input: ProjectCreateInputDto,
	launchRun: (req: RunLaunchRequest) => Promise<{ id: string }>,
	purgeProjectRuns: (projectPath: string) => Promise<number>,
	launchIntake?: LaunchIntakeForCreate,
	recordInitFailure?: RecordInitFailure,
	cloneTemplate?: typeof degitClone,
): Promise<ProjectCreateResultDto> {
	const name = validateProjectName(input.name);
	const root = assertAllowedPath(ctx.config.allowedRoots, input.root);
	if (!(await directoryExists(root))) {
		throw new HttpError(`Root directory does not exist: ${input.root}`, 400);
	}
	const targetPath = assertAllowedPath([root], join(root, name));
	await assertEmptyOrMissing(targetPath);
	const specFile = await resolveSpecFile(ctx, input.spec);

	if (input.template && input.templateUrl) {
		throw new HttpError('Provide either a template name or a template URL, not both', 400);
	}
	const githubSource = input.templateUrl
		? parseGithubTemplateSource(input.templateUrl)
		: undefined;
	if (input.templateUrl && !githubSource) {
		throw new HttpError(
			'Template URL must be a GitHub repository: https://github.com/owner/repo, github.com/owner/repo, or owner/repo, with an optional #ref',
			400,
		);
	}

	// 'spernakit' mode is sugar for the synthesized 'spernakit' template; an explicit
	// template name takes precedence and enables any registered third-party scaffold.
	// A template URL bypasses the registry entirely, so mode sugar must not resolve one.
	const templateName = githubSource
		? undefined
		: (input.template ?? (input.mode === 'spernakit' ? 'spernakit' : undefined));
	// The synthesized spernakit template (and bare 'spernakit' mode) is created via the portable
	// generator (clone-on-demand when no local checkout is configured), not the generic initCommand
	// engine. An explicit web.templates[spernakit] override carries a custom initCommand and is run
	// through the generic engine like any other template.
	const spernakitEntry = ctx.config.templates.find((entry) => entry.name === 'spernakit');
	const explicitSpernakit =
		spernakitEntry !== undefined && !isSynthesizedSpernakitTemplate(spernakitEntry);
	const isSpernakit = templateName === 'spernakit' && !explicitSpernakit;
	const template =
		templateName && !isSpernakit
			? ctx.config.templates.find((entry) => entry.name === templateName)
			: undefined;
	if (templateName && !isSpernakit && !template) {
		throw new HttpError(`Unknown project template: ${templateName}`, 400);
	}

	if (githubSource) {
		await runGithubTemplateClone(
			ctx.config.dataDir,
			githubSource,
			{ description: (input.description ?? '').trim(), name, root, targetPath },
			recordInitFailure,
			cloneTemplate,
		);
	} else if (isSpernakit) {
		const checkoutDir = await ensureSpernakitCheckout(ctx.config);
		const { backendPort, frontendPort } = await allocateSpernakitPorts(ctx.config);
		await runSpernakitInit(
			ctx.config.dataDir,
			checkoutDir,
			{
				backendPort,
				description: (input.description ?? '').trim(),
				fleetManifest: ctx.config.spernakitFleetManifest,
				frontendPort,
				name,
				root,
				targetPath,
			},
			recordInitFailure,
		);
	} else if (template) {
		await runTemplateScaffold(
			ctx.config.dataDir,
			template,
			{ description: (input.description ?? '').trim(), name, root, targetPath },
			recordInitFailure,
		);
	} else {
		await mkdir(targetPath, { recursive: true });
		recordDataMovement({
			category: 'file',
			operation: 'project.create.fresh',
			status: 'success',
			summary: { name, root },
			target: targetPath,
		});
	}

	if (specFile) {
		const aiddDir = join(targetPath, '.aidd');
		await mkdir(aiddDir, { recursive: true });
		await copyFile(specFile, join(aiddDir, 'spec.md'));
		recordDataMovement({
			category: 'metadata',
			operation: 'project.create.spec-install',
			status: 'success',
			summary: { name, root },
			target: join(aiddDir, 'spec.md'),
		});
	}

	// A folder being empty/missing on disk says nothing about leftover SQLite rows: a prior project
	// deleted and recreated at this same path leaves path-keyed runs/pipeline/invocation rows that
	// the project Runs tab would still surface. Purge them BEFORE launching this project's first run
	// so the new project starts with an empty Runs tab — and so we never purge the run we launch next.
	await purgeProjectRuns(targetPath);

	const baseResult = {
		mode: input.mode,
		path: targetPath,
		projectId: encodeProjectId(targetPath),
		stopBeforeImplementation: input.stopBeforeImplementation ?? true,
	};

	// A third-party scaffold arrives without an .aidd contract or known gates, so it goes
	// through create-then-ingest: scaffold, then run the metadata-only project-intake
	// pipeline instead of a coding run. GitHub template clones always take this path —
	// they arrive with code, so detectInitialPhase classifies them as onboarding.
	if (template?.postCreate === 'ingest' || githubSource) {
		if (!launchIntake) {
			throw new HttpError('Template requires ingest but no intake launcher is wired', 500);
		}
		const session = await launchIntake(targetPath, input.launchTarget);
		return { ...baseResult, intakeSessionId: session.id, runId: null };
	}

	const runRequest: RunLaunchRequest = { mode: 'coding', projectDir: targetPath };
	runRequest.stopBeforeImplementation = input.stopBeforeImplementation ?? true;
	// Templates (and the Spernakit generator) init their own git; only the bare fresh scaffold
	// needs aidd to do it.
	if (!template && !isSpernakit) runRequest.initGitAfterScaffold = true;
	if (specFile) runRequest.specFile = specFile;
	if (input.launchTarget?.backend !== undefined) runRequest.backend = input.launchTarget.backend;
	if (input.launchTarget?.model !== undefined) runRequest.model = input.launchTarget.model;
	if (input.launchTarget?.reasoningEffort !== undefined) {
		runRequest.reasoningEffort = input.launchTarget.reasoningEffort;
	}
	const run = await launchRun(runRequest);

	return { ...baseResult, intakeSessionId: null, runId: run.id };
}
