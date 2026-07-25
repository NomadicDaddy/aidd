import type { ResolvedProjectTemplateConfig } from 'aidd-shared/config';
import type { LaunchTargetOverrides } from 'aidd-shared/plan/launch-target';

import { degitClone, type GithubTemplateSource } from 'aidd-shared/git/degit';
import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import { recordDataMovement } from '../dataMovementTrace.ts';
import { HttpError } from '../errors.ts';
import { directoryExists } from './discovery.ts';
import {
	formatInitFailureDetail,
	persistSpernakitInitLog,
	quarantineFailedInit,
	runTemplateInit,
	type SpawnOutcome,
	substituteTemplateCommand,
} from './spernakitInit.ts';

// Launches the metadata-only project-intake pipeline for templates whose postCreate is
// 'ingest' (third-party scaffolds that arrive without an .aidd contract).
export type LaunchIntakeForCreate = (
	projectDir: string,
	launchTarget?: LaunchTargetOverrides,
) => Promise<{ id: string }>;

// Records a failed scaffold so it stays visible in the fleet. Best-effort; never throws
// into the create flow.
export interface InitFailureRecord {
	description: null | string;
	errorSummary: string;
	logPath: null | string;
	name: string;
	quarantinePath: null | string;
	root: string;
	targetPath: string;
	template: string;
	// The retryable GitHub source (owner/repo[#ref]) for github: failures; null for
	// registered templates, which retry by name.
	templateUrl: null | string;
}
export type RecordInitFailure = (record: InitFailureRecord) => Promise<void>;

// The directory an absolute-path token in the init command lives in — used to enforce
// rootMustBeInitDir (the spernakit constraint that init runs from its own folder).
function templateScriptDir(command: string[]): null | string {
	for (const token of command) {
		if (isAbsolute(token)) return resolve(dirname(token));
	}
	return null;
}

// Run a registered template's init command, quarantining partial output and surfacing a 500 on
// failure.
export async function runTemplateScaffold(
	dataDir: string,
	template: ResolvedProjectTemplateConfig,
	args: { description: string; name: string; root: string; targetPath: string },
	recordInitFailure?: RecordInitFailure,
): Promise<void> {
	const { name, root, targetPath } = args;
	const recordFailure = async (
		errorSummary: string,
		logPath: null | string,
		quarantinePath: null | string,
	): Promise<void> => {
		if (recordInitFailure) {
			await recordInitFailure({
				description: args.description || null,
				errorSummary,
				logPath,
				name,
				quarantinePath,
				root,
				targetPath,
				template: template.name,
				templateUrl: null,
			});
		}
	};
	// Validate target existence, then the init-dir constraint, then description so each rejection
	// surfaces its own message.
	// cwd='root' templates create targetPath themselves (spernakit); cwd='targetPath'
	// templates run inside a pre-created empty dir (degit-style clones).
	if (template.cwd === 'root' && (await directoryExists(targetPath))) {
		throw new HttpError(
			`Destination must not exist for template "${template.name}" (target: ${targetPath})`,
			409,
		);
	}
	if (template.rootMustBeInitDir) {
		const scriptDir = templateScriptDir(template.initCommand);
		// The spernakit init script resolves its creation root as the PARENT of its own
		// folder ($PSScriptRoot\..) and creates the app there, so targetPath (root\name)
		// only matches the script's output when root is that parent — not the script folder.
		const workspaceDir = scriptDir === null ? null : resolve(scriptDir, '..');
		// Windows paths are case-insensitive; a lowercase drive letter from the caller
		// must not fail the match against the config's uppercase one.
		const samePath = (left: string, right: string): boolean =>
			process.platform === 'win32'
				? left.toLowerCase() === right.toLowerCase()
				: left === right;
		if (workspaceDir && !samePath(resolve(root), workspaceDir)) {
			throw new HttpError(
				`Template "${template.name}" must run under ${workspaceDir} (the init script folder's parent; selected root is ${root})`,
				400,
			);
		}
	}
	if (template.requiresDescription && args.description.length === 0) {
		throw new HttpError(`Template "${template.name}" requires a description`, 400);
	}
	const cwd = template.cwd === 'targetPath' ? targetPath : root;
	if (template.cwd === 'targetPath') await mkdir(targetPath, { recursive: true });
	const command = substituteTemplateCommand(template.initCommand, args);
	const timestamp = Date.now();
	let outcome: SpawnOutcome;
	try {
		outcome = await runTemplateInit(command, cwd);
	} catch (err) {
		const quarantinePath = await quarantineFailedInit(targetPath, timestamp);
		const summary = `Template "${template.name}" init could not be executed: ${
			err instanceof Error ? err.message : String(err)
		}`;
		await recordFailure(summary, null, quarantinePath);
		throw new HttpError(
			`${summary}${quarantinePath ? ` (partial output quarantined at ${quarantinePath})` : ''}`,
			500,
		);
	}
	const logPath = await persistSpernakitInitLog(dataDir, outcome, timestamp);
	if (outcome.code !== 0) {
		const quarantinePath = await quarantineFailedInit(targetPath, timestamp);
		await recordFailure(
			`Template "${template.name}" init failed with exit code ${outcome.code}.\n${formatInitFailureDetail(outcome)}`,
			logPath,
			quarantinePath,
		);
		throw new HttpError(
			`Template "${template.name}" init failed with exit code ${outcome.code}. Full output: ${logPath}${
				quarantinePath ? ` (partial output quarantined at ${quarantinePath})` : ''
			}\n${formatInitFailureDetail(outcome)}`,
			500,
		);
	}
	recordDataMovement({
		category: 'file',
		operation: 'project.create.template',
		status: 'success',
		summary: { name, root, template: template.name },
		target: targetPath,
	});
}

// Clone a user-supplied GitHub template repo (degit semantics: shallow clone, strip .git,
// fresh git init rooted at a baseline commit of the imported tree — so the intake pipeline's
// .aidd commits land on top of a real root instead of an untracked source tree).
// Deliberately NOT routed through the initCommand/token-substitution engine:
// web.templates entries are operator-trusted config, while this source is untrusted request
// input — the clone argv is built solely from the parsed owner/repo. Failure handling mirrors
// runTemplateScaffold: persist a log, quarantine partial output, record the init failure.
export async function runGithubTemplateClone(
	dataDir: string,
	source: GithubTemplateSource,
	args: { description: string; name: string; root: string; targetPath: string },
	recordInitFailure?: RecordInitFailure,
	clone: typeof degitClone = degitClone,
): Promise<void> {
	const { name, root, targetPath } = args;
	const templateLabel = `github:${source.owner}/${source.repo}`;
	// Persisted in the canonical parseable form (not the raw user input) so the retry
	// route can forward it as templateUrl without losing the #ref.
	const retrySource = `${source.owner}/${source.repo}${source.ref ? `#${source.ref}` : ''}`;
	const recordFailure = async (
		errorSummary: string,
		logPath: null | string,
		quarantinePath: null | string,
	): Promise<void> => {
		if (recordInitFailure) {
			await recordInitFailure({
				description: args.description || null,
				errorSummary,
				logPath,
				name,
				quarantinePath,
				root,
				targetPath,
				template: templateLabel,
				templateUrl: retrySource,
			});
		}
	};
	const timestamp = Date.now();
	let outcome: SpawnOutcome;
	try {
		outcome = await clone({
			baselineLabel: source.repo,
			cloneUrl: source.cloneUrl,
			ref: source.ref,
			targetPath,
		});
	} catch (err) {
		const quarantinePath = await quarantineFailedInit(targetPath, timestamp);
		const summary = `Template clone ${templateLabel} could not be executed: ${
			err instanceof Error ? err.message : String(err)
		}`;
		await recordFailure(summary, null, quarantinePath);
		throw new HttpError(
			`${summary}${quarantinePath ? ` (partial output quarantined at ${quarantinePath})` : ''}`,
			500,
		);
	}
	const logPath = await persistSpernakitInitLog(dataDir, outcome, timestamp);
	if (outcome.code !== 0) {
		const quarantinePath = await quarantineFailedInit(targetPath, timestamp);
		await recordFailure(
			`Template clone ${templateLabel} failed with exit code ${outcome.code}.\n${formatInitFailureDetail(outcome)}`,
			logPath,
			quarantinePath,
		);
		throw new HttpError(
			`Template clone ${templateLabel} failed with exit code ${outcome.code}. Full output: ${logPath}${
				quarantinePath ? ` (partial output quarantined at ${quarantinePath})` : ''
			}\n${formatInitFailureDetail(outcome)}`,
			500,
		);
	}
	recordDataMovement({
		category: 'file',
		operation: 'project.create.github-template',
		status: 'success',
		summary: { name, root, template: templateLabel },
		target: targetPath,
	});
}
