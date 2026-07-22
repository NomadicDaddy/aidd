import { DETACHED_SPAWN_FLAG } from 'aidd-shared/lib/detachedSpawn';
import {
	EXT_APP_URL_ENV,
	EXT_LOG_PATH_ENV,
	EXT_RUN_ID_ENV,
	EXT_RUN_SOURCE_ENV,
	type CliActiveRunSource,
} from 'aidd-shared/metadata/active-runs';
import { buildBackendSubprocessEnv } from 'aidd-shared/subprocess-env';

export interface DetachedRunSpawnPlan {
	args: string[];
	options: {
		cwd: string;
		env: Record<string, string>;
		stderr: 'ignore';
		stdin: 'ignore';
		stdout: 'ignore';
		windowsHide?: boolean;
	};
	recordPid: null | number | undefined;
	/**
	 * When set, the caller must open this path in append mode and wire the fd to the
	 * child's stderr (overriding options.stderr) so an early crash — e.g. an arg-parse
	 * error before the first heartbeat — leaves evidence in the run log instead of a
	 * 0-byte file. Null on Windows, where the relauncher opens the run log itself.
	 */
	stderrLogPath: null | string;
}

function powerShellSingleQuoted(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function powerShellArrayLiteral(values: string[]): string {
	return `@(${values.map(powerShellSingleQuoted).join(', ')})`;
}

export function buildHiddenStartProcessCommand(input: {
	args: string[];
	cwd: string;
	logPath: string;
}): string {
	const [filePath, ...args] = input.args;
	if (!filePath) throw new Error('Windows detached spawn requires a file path');
	return [
		"$ErrorActionPreference = 'Stop'",
		'try {',
		`  Start-Process -FilePath ${powerShellSingleQuoted(filePath)} -ArgumentList ${powerShellArrayLiteral(
			args
		)} -WorkingDirectory ${powerShellSingleQuoted(input.cwd)} -WindowStyle Hidden`,
		'} catch {',
		`  Add-Content -LiteralPath ${powerShellSingleQuoted(
			input.logPath
		)} -Value ('Failed to start detached relauncher: ' + $_.Exception.Message)`,
		'  exit 1',
		'}',
	].join('\n');
}

export function buildDetachedRunSpawnPlan(input: {
	appUrl?: null | string;
	args: string[];
	launcherPrefix: string[];
	logPath: string;
	payloadPath: null | string;
	platform?: NodeJS.Platform;
	rootDir: string;
	runId: string;
	source: CliActiveRunSource;
}): DetachedRunSpawnPlan {
	const platform = input.platform ?? process.platform;
	const env = buildBackendSubprocessEnv({
		[EXT_LOG_PATH_ENV]: input.logPath,
		[EXT_RUN_ID_ENV]: input.runId,
		[EXT_RUN_SOURCE_ENV]: input.source,
		...(input.appUrl ? { [EXT_APP_URL_ENV]: input.appUrl } : {}),
	});
	if (platform === 'win32' && input.payloadPath) {
		const command = buildHiddenStartProcessCommand({
			args: [...input.launcherPrefix, DETACHED_SPAWN_FLAG, input.payloadPath],
			cwd: input.rootDir,
			logPath: input.logPath,
		});
		return {
			args: [
				'pwsh',
				'-NoProfile',
				'-NonInteractive',
				'-WindowStyle',
				'Hidden',
				'-EncodedCommand',
				Buffer.from(command, 'utf16le').toString('base64'),
			],
			options: {
				cwd: input.rootDir,
				env,
				stderr: 'ignore',
				stdin: 'ignore',
				stdout: 'ignore',
				windowsHide: true,
			},
			recordPid: null,
			stderrLogPath: null,
		};
	}
	return {
		args: input.args,
		options: {
			cwd: input.rootDir,
			env,
			stderr: 'ignore',
			stdin: 'ignore',
			stdout: 'ignore',
		},
		recordPid: undefined,
		stderrLogPath: input.logPath,
	};
}
