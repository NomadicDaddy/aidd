import type { ResolvedTriumvirateConfig } from 'aidd-shared/config';

import { requireBackendName, type BackendName } from 'aidd-shared/plan/types';
import { isCompiledBinary } from 'aidd-shared/runtime';
import { access } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import type { RunLaunchRequest, WebRunMode } from '../types.ts';

import { HttpError } from './errors.ts';

// Flags that define a run's scope, mode, or entrypoint and therefore must NOT be settable via the
// free-form extraArgs string. extraArgs is appended after the launch defaults and the CLI parser is
// last-wins, so without this guard a UI launch could (a) redirect the child to a project the web
// service never authorized against allowedRoots — the DB would record one project while the CLI
// operates on another — (b) read an arbitrary host file into the prompt, or (c) reach a run mode the
// launch route intentionally does not expose (director/role/directive) or an alternate entrypoint
// (web/mcp). Mode is chosen via the request `mode` field, never here.
const PROTECTED_EXTRA_ARG_FLAGS: ReadonlySet<string> = new Set([
	// Scope / arbitrary-file-read flags.
	'--project-dir',
	'--spec',
	'--stop-before-implementation',
	'--fleet-summary',
	'--director-output',
	'--director-context',
	'--suggestion-schema',
	// Mode-defining flags (the request `mode` field is authoritative).
	'--audit',
	'--audit-all',
	'--todo',
	'--validate',
	'--triumvirate',
	'--interview',
	'--director',
	'--directive',
	'--in-progress',
	// Alternate entrypoints / server modes.
	'--web',
	'--port',
	'--mcp',
	'--config-matrix',
	// Directive injection handled by the skill pipeline path, not raw run args.
	'--skill',
	'--skill-args',
	'--directive-readonly',
	// Write-boundary enforcement is owned by the launch request, never extra args.
	'--write-allowlist',
	// Worktree isolation is gated by web.useWorktrees and the launcher records the run's
	// worktree path/branch on the row up front; letting extra args flip it on would create a
	// worktree the row knows nothing about, breaking orphan cleanup and parked-run tracking.
	'--worktree',
]);

export interface LaunchCommand {
	args: string[];
	entrypoint: string;
	/**
	 * Program tokens that precede the run flags in `args` (`['bun', entrypoint]` in dev,
	 * `[entrypoint]` for a compiled binary). The Windows detached launcher reuses this to
	 * invoke the same program as the relauncher: `[...launcherPrefix, '--detached-spawn', payload]`.
	 */
	launcherPrefix: string[];
	projectName: string;
}

export interface LaunchDefaults {
	backend: BackendName;
	model?: string | undefined;
	reasoningEffort?: string | undefined;
	triumvirate?: ResolvedTriumvirateConfig | undefined;
}

function addOptionalFlag(args: string[], flag: string, value: number | string | undefined): void {
	if (value === undefined) return;
	args.push(flag, String(value));
}

// Split a free-form additional-args string into argv tokens, honoring single/double quotes
// so a value containing spaces (e.g. `--prompt "do the thing"`) survives as a single token,
// then reject any token that targets a protected flag. The result is appended to the launch argv
// and handed to Bun.spawn as an array — there is no shell, so quoting only delimits tokens and
// carries no injection risk. Malformed input throws HttpError(400) so the route returns a client
// error rather than surfacing as an unhandled 500.
export function tokenizeExtraArgs(input: string): string[] {
	const tokens: string[] = [];
	let current = '';
	let quote: '"' | "'" | null = null;
	let hasToken = false;
	for (const ch of input) {
		if (quote) {
			if (ch === quote) quote = null;
			else current += ch;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			hasToken = true;
			continue;
		}
		if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
			if (hasToken) {
				tokens.push(current);
				current = '';
				hasToken = false;
			}
			continue;
		}
		current += ch;
		hasToken = true;
	}
	if (quote) throw new HttpError('Additional args contain an unterminated quote', 400);
	if (hasToken) tokens.push(current);
	assertNoProtectedFlags(tokens);
	return tokens;
}

// Reject extraArgs tokens that resolve to a protected flag, in either `--flag value` or
// `--flag=value` form. A protected name is rejected wherever it appears (even nominally as a value)
// because last-wins parsing makes position unreliable as a guard and such values are never
// legitimate.
function assertNoProtectedFlags(tokens: string[]): void {
	for (const token of tokens) {
		if (!token.startsWith('--')) continue;
		const equals = token.indexOf('=');
		const flag = equals === -1 ? token : token.slice(0, equals);
		if (PROTECTED_EXTRA_ARG_FLAGS.has(flag)) {
			throw new HttpError(`Additional args may not include the protected flag ${flag}`, 400);
		}
	}
}

function backendFlag(value: string | undefined): BackendName | undefined {
	if (value === undefined) return undefined;
	return requireBackendName(value);
}

function addModeArgs(args: string[], input: RunLaunchRequest, mode: WebRunMode): void {
	if (mode === 'triumvirate') {
		args.push('--triumvirate');
		return;
	}
	if (mode === 'director') {
		if (!input.directorFleetSummaryPath || !input.directorOutputPath) {
			throw new Error(
				'director mode requires directorFleetSummaryPath and directorOutputPath'
			);
		}
		args.push(
			'--director',
			'--fleet-summary',
			input.directorFleetSummaryPath,
			'--director-output',
			input.directorOutputPath
		);
		if (input.directorContextPath) {
			args.push('--director-context', input.directorContextPath);
		}
		return;
	}
	if (mode === 'audit') {
		if (input.auditAll) {
			args.push('--audit-all');
			return;
		}
		args.push(
			'--audit',
			(input.auditNames?.length ? input.auditNames : ['CODE_QUALITY']).join(',')
		);
		return;
	}
	if (mode === 'todo') {
		args.push('--todo');
		return;
	}
	if (mode === 'directive') {
		args.push('--directive');
		return;
	}
	if (mode === 'validate' || input.validate) {
		args.push('--validate');
		return;
	}
	if (mode === 'interview' || input.interview) {
		args.push('--interview');
	}
}

export async function buildLaunchCommand(
	rootDir: string,
	input: RunLaunchRequest,
	defaults: BackendName | LaunchDefaults
): Promise<LaunchCommand> {
	let entrypoint: string;
	let args: string[];
	let launcherPrefix: string[];
	if (isCompiledBinary()) {
		const binaryName = process.platform === 'win32' ? 'aidd.exe' : 'aidd';
		entrypoint = join(dirname(process.execPath), binaryName);
		await access(entrypoint);
		launcherPrefix = [entrypoint];
		args = [entrypoint, '--project-dir', input.projectDir];
	} else {
		entrypoint = join(rootDir, 'cli', 'src', 'index.ts');
		await access(entrypoint);
		launcherPrefix = ['bun', entrypoint];
		args = ['bun', entrypoint, '--project-dir', input.projectDir];
	}
	const mode = input.mode ?? 'coding';
	const launchDefaults =
		typeof defaults === 'string' ? ({ backend: defaults } satisfies LaunchDefaults) : defaults;
	addModeArgs(args, input, mode);
	addOptionalFlag(args, '--cli', backendFlag(input.backend) ?? launchDefaults.backend);
	addOptionalFlag(args, '--model', input.model ?? launchDefaults.model);
	// Triumvirate role flags only belong on triumvirate launches. The settings-level
	// triumvirate config is a fallback for unfilled role fields, not a standing default —
	// without this gate every coding/audit/etc launch inherits --secondary-cli/--overseer-cli
	// flags from settings and the recorded command misrepresents the run.
	if (mode === 'triumvirate') {
		addOptionalFlag(
			args,
			'--secondary-cli',
			backendFlag(input.secondaryBackend) ?? launchDefaults.triumvirate?.secondaryCli
		);
		addOptionalFlag(
			args,
			'--secondary-model',
			input.secondaryModel ?? launchDefaults.triumvirate?.secondaryModel
		);
		addOptionalFlag(
			args,
			'--overseer-cli',
			backendFlag(input.overseerBackend) ?? launchDefaults.triumvirate?.overseerCli
		);
		addOptionalFlag(
			args,
			'--overseer-model',
			input.overseerModel ?? launchDefaults.triumvirate?.overseerModel
		);
		addOptionalFlag(
			args,
			'--exec-cli',
			backendFlag(input.execBackend) ?? launchDefaults.triumvirate?.execCli
		);
		addOptionalFlag(
			args,
			'--exec-model',
			input.execModel ?? launchDefaults.triumvirate?.execModel
		);
	}
	// Pinned explicitly (like --cli/--model) so the recorded command and the child agree
	// on effort by construction rather than by re-derivation.
	addOptionalFlag(
		args,
		'--reasoning-effort',
		input.reasoningEffort ?? launchDefaults.reasoningEffort
	);
	addOptionalFlag(args, '--max-iterations', input.maxIterations);
	addOptionalFlag(args, '--feature', input.feature);
	addOptionalFlag(args, '--filter-by', input.filterBy);
	addOptionalFlag(args, '--filter', input.filterValue);
	// Audit-findings sweep opt-in. The optional SOURCE is emitted as a positional after the
	// flag; when absent, the flag is followed by another `--`-prefixed launch flag (or nothing),
	// so the CLI's optional-operand parse never mis-consumes a later token.
	if (input.auditFindings) {
		args.push('--audit-findings');
		if (input.auditFindingsSource) args.push(input.auditFindingsSource);
	}
	addOptionalFlag(args, '--spec', input.specFile);
	if (input.prompt) args.push('--prompt', input.prompt);
	// A skill launch forwards its identity (not a pre-compiled prompt): the CLI compiles the
	// directive AND stages the skill's contract dependencies into the project's `.aidd/`.
	// --skill is mutually exclusive with --prompt (enforced by the CLI arg validator).
	if (input.skillId) {
		args.push('--skill', input.skillId);
		if (input.skillArgs) args.push('--skill-args', input.skillArgs);
	}
	if (input.directiveReadonly) args.push('--directive-readonly');
	if (input.checkArtifacts) args.push('--check-artifacts');
	if (input.writeAllowlist && input.writeAllowlist.length > 0) {
		args.push('--write-allowlist', input.writeAllowlist.join(','));
	}
	if (input.initGitAfterScaffold) args.push('--init-git-after-scaffold');
	if (input.stopBeforeImplementation) args.push('--stop-before-implementation');
	if (input.simulation) args.push('--simulation');
	if (input.worktree) args.push('--worktree');
	// Appended last so user-supplied flags override the defaults assembled above
	// (the CLI arg parser is last-wins for repeated flags).
	if (input.extraArgs) {
		for (const token of tokenizeExtraArgs(input.extraArgs)) args.push(token);
	}
	return {
		args,
		entrypoint,
		launcherPrefix,
		projectName: basename(input.projectDir),
	};
}
