import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { recordDataMovement } from '../dataMovementTrace.ts';
import { scrubSecrets } from '../secretScrubber.ts';
import { directoryExists } from './discovery.ts';

const SPERNAKIT_TAIL_BYTES = 2048;

export interface SpawnOutcome {
	code: number;
	stderr: string;
	stdout: string;
}

// Substitute the template token placeholders in an init-command argv. Tokens are matched
// literally (not regex) so user values containing regex metacharacters are safe.
export function substituteTemplateCommand(
	command: string[],
	values: { description: string; name: string; root: string; targetPath: string }
): string[] {
	const replacements: [string, string][] = [
		['{name}', values.name],
		['{description}', values.description],
		['{targetPath}', values.targetPath],
		['{root}', values.root],
	];
	return command.map((token) =>
		replacements.reduce((acc, [needle, value]) => acc.split(needle).join(value), token)
	);
}

// Run a resolved (already token-substituted) template init command in cwd, capturing combined
// output. Any operator-trusted init command (create-t3-app, degit, a pwsh script, …) uses this path.
export async function runTemplateInit(command: string[], cwd: string): Promise<SpawnOutcome> {
	const proc = Bun.spawn({
		cmd: command,
		cwd,
		stderr: 'pipe',
		stdin: 'ignore',
		stdout: 'pipe',
	});
	const [stdoutText, stderrText, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code: exitCode, stderr: stderrText, stdout: stdoutText };
}

function tail(value: string, bytes: number): string {
	if (value.length <= bytes) return value;
	return `…${value.slice(-bytes)}`;
}

// Persist the full combined stdout+stderr of the init script to a run-log file, regardless of exit
// code, so a failed init leaves something on disk to inspect. Mirrors launch.ts run-log behavior
// (under ${web.dataDir}/run-logs, scrubbed via scrubSecrets); the on-disk copy is untruncated.
export async function persistSpernakitInitLog(
	dataDir: string,
	outcome: SpawnOutcome,
	timestamp: number
): Promise<string> {
	const logDir = join(dataDir, 'run-logs');
	await mkdir(logDir, { recursive: true });
	const logPath = join(logDir, `spernakit-init-${timestamp}.log`);
	const combined = [
		`# spernakit_init.ps1 exit code: ${outcome.code}`,
		'',
		'## stdout',
		outcome.stdout,
		'',
		'## stderr',
		outcome.stderr,
		'',
	].join('\n');
	await writeFile(logPath, scrubSecrets(combined), 'utf8');
	recordDataMovement({
		category: 'file',
		operation: 'project.create.spernakit-init-log',
		status: 'success',
		summary: { code: outcome.code },
		target: logPath,
	});
	return logPath;
}

// Quarantine the script-created partial folder out of the way after a failed init. createProject
// verified targetPath was empty/missing before spawning, so anything present is script-created and
// safe to move. Renaming to a sibling (atomic, same volume) avoids leaving an unmanaged .aidd-less
// tree at the original path while preserving the partial output for inspection. Best-effort: a
// rename failure must not mask the underlying init failure surfaced to the caller.
export async function quarantineFailedInit(
	targetPath: string,
	timestamp: number
): Promise<null | string> {
	if (!(await directoryExists(targetPath))) return null;
	const quarantinePath = `${targetPath}.failed-${timestamp}`;
	try {
		await rename(targetPath, quarantinePath);
		recordDataMovement({
			category: 'file',
			operation: 'project.create.spernakit-quarantine',
			status: 'success',
			summary: {},
			target: quarantinePath,
		});
		return quarantinePath;
	} catch (err) {
		recordDataMovement({
			category: 'file',
			operation: 'project.create.spernakit-quarantine',
			status: 'failure',
			summary: { err: err instanceof Error ? err.message : String(err) },
			target: quarantinePath,
		});
		return null;
	}
}

// Surface both stdout and stderr context (not stderr-only) in the failure message, each scrubbed
// then tail-capped so the toast stays a reasonable size.
export function formatInitFailureDetail(outcome: SpawnOutcome): string {
	const parts: string[] = [];
	const stdout = scrubSecrets(outcome.stdout).trim();
	const stderr = scrubSecrets(outcome.stderr).trim();
	if (stdout) parts.push(`stdout: ${tail(stdout, SPERNAKIT_TAIL_BYTES)}`);
	if (stderr) parts.push(`stderr: ${tail(stderr, SPERNAKIT_TAIL_BYTES)}`);
	return parts.length > 0 ? parts.join('\n') : '(no output captured)';
}
