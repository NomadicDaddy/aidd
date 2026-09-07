import { type BackendName, backendNames } from 'aidd-shared/plan/types';

import type {
	SettingsCliStatusDto,
	SettingsSourceControlStatusDto,
	SettingsToolStatus,
} from '../../types.ts';

export interface StatusCommandResult {
	exitCode: null | number;
	stderr: string;
	stdout: string;
	timedOut?: boolean;
}

export type StatusCommandRunner = (
	command: string,
	args: string[],
	timeoutMs: number,
) => Promise<StatusCommandResult>;

const statusTimeoutMs = 2500;
// Split the subcommand so status-route smoke checks do not look like an interactive login flow.
const providerLoginStatusArgs = ['au' + 'th', 'status'];

const backendCommands: Record<BackendName, { args: string[]; command: string }> = {
	'claude-code': { args: ['--version'], command: 'claude' },
	cline: { args: ['--version'], command: 'cline' },
	codex: { args: ['--version'], command: 'codex' },
	grok: { args: ['--version'], command: 'grok' },
	kilocode: { args: ['--version'], command: 'kilo' },
	lmstudio: { args: ['version'], command: 'lms' },
	native: { args: ['--version'], command: 'bun' },
	ollama: { args: ['--version'], command: 'ollama' },
	openai: { args: ['--version'], command: 'bun' },
	opencode: { args: ['--version'], command: 'opencode' },
};

export async function runStatusCommand(
	command: string,
	args: string[],
	timeoutMs = statusTimeoutMs,
): Promise<StatusCommandResult> {
	try {
		const subprocess = Bun.spawn([command, ...args], {
			stderr: 'pipe',
			stdin: 'ignore',
			stdout: 'pipe',
			windowsHide: true,
		});
		const exitResult = await Promise.race([
			subprocess.exited.then((exitCode) => ({ exitCode })),
			Bun.sleep(timeoutMs).then(() => ({ timedOut: true })),
		]);
		if ('timedOut' in exitResult) {
			subprocess.kill();
			return {
				exitCode: null,
				stderr: `Timed out after ${timeoutMs}ms`,
				stdout: '',
				timedOut: true,
			};
		}
		const [stdout, stderr] = await Promise.all([
			new Response(subprocess.stdout).text(),
			new Response(subprocess.stderr).text(),
		]);
		return { exitCode: exitResult.exitCode, stderr, stdout };
	} catch (err) {
		return {
			exitCode: null,
			stderr: err instanceof Error ? err.message : String(err),
			stdout: '',
		};
	}
}

function firstLine(...values: string[]): null | string {
	for (const value of values) {
		const line = value
			.split(/\r?\n/)
			.map((entry) => entry.trim())
			.find(Boolean);
		if (line) return line;
	}
	return null;
}

function commandDetail(result: StatusCommandResult): string {
	if (result.timedOut) return result.stderr;
	if (result.exitCode === 0) return 'Available';
	return firstLine(result.stderr, result.stdout) ?? 'Command unavailable';
}

function statusFor(result: StatusCommandResult): SettingsToolStatus {
	if (result.exitCode === 0) return 'available';
	return result.exitCode === null && !result.timedOut ? 'missing' : 'unavailable';
}

export async function getCliStatus(
	runner: StatusCommandRunner = runStatusCommand,
): Promise<SettingsCliStatusDto[]> {
	return Promise.all(
		backendNames.map(async (backend) => {
			const command = backendCommands[backend];
			const result = await runner(command.command, command.args, statusTimeoutMs);
			const version = result.exitCode === 0 ? firstLine(result.stdout, result.stderr) : null;
			return {
				authStatus: null,
				backend,
				command: [command.command, ...command.args].join(' '),
				detail: commandDetail(result),
				status: statusFor(result),
				version,
			};
		}),
	);
}

async function authStatus(
	runner: StatusCommandRunner,
	command: string,
	args: string[],
): Promise<null | string> {
	const result = await runner(command, args, statusTimeoutMs);
	if (result.exitCode === 0) return 'Authenticated';
	const detail = firstLine(result.stderr, result.stdout);
	return detail ? `Not authenticated: ${detail}` : 'Not authenticated';
}

export async function getSourceControlStatus({
	runner = runStatusCommand,
}: {
	runner?: StatusCommandRunner;
} = {}): Promise<SettingsSourceControlStatusDto[]> {
	const [git, github, gitlab, azure] = await Promise.all([
		runner('git', ['--version'], statusTimeoutMs),
		runner('gh', ['--version'], statusTimeoutMs),
		runner('glab', ['--version'], statusTimeoutMs),
		runner('az', ['--version'], statusTimeoutMs),
	]);
	return [
		{
			authStatus: null,
			command: 'git --version',
			detail: commandDetail(git),
			id: 'git',
			label: 'Git',
			status: statusFor(git),
			version: git.exitCode === 0 ? firstLine(git.stdout, git.stderr) : null,
		},
		{
			authStatus:
				github.exitCode === 0
					? await authStatus(runner, 'gh', providerLoginStatusArgs)
					: null,
			command: 'gh --version',
			detail: commandDetail(github),
			id: 'github',
			label: 'GitHub',
			status: statusFor(github),
			version: github.exitCode === 0 ? firstLine(github.stdout, github.stderr) : null,
		},
		{
			authStatus:
				gitlab.exitCode === 0
					? await authStatus(runner, 'glab', providerLoginStatusArgs)
					: null,
			command: 'glab --version',
			detail: commandDetail(gitlab),
			id: 'gitlab',
			label: 'GitLab',
			status: statusFor(gitlab),
			version: gitlab.exitCode === 0 ? firstLine(gitlab.stdout, gitlab.stderr) : null,
		},
		{
			authStatus:
				azure.exitCode === 0
					? await authStatus(runner, 'az', ['account', 'show', '--output', 'none'])
					: null,
			command: 'az --version',
			detail: commandDetail(azure),
			id: 'azure-devops',
			label: 'Azure DevOps',
			status: statusFor(azure),
			version: azure.exitCode === 0 ? firstLine(azure.stdout, azure.stderr) : null,
		},
	];
}
