import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// Mirrors cli/src/index.ts's `--detached-spawn` relauncher branch (self-contained so the
// stub needs no module resolution). On Windows launchRun starts this relauncher directly;
// without this branch the fake CLI would run as the relauncher and never spawn the real run.
// Inert on POSIX, where launchRun spawns the run directly.
const RELAUNCHER_SHIM = `
if (process.argv[2] === '--detached-spawn') {
	const { readFileSync, openSync, closeSync, unlinkSync } = await import('node:fs');
	const __payload = JSON.parse(readFileSync(process.argv[3], 'utf8'));
	try { unlinkSync(process.argv[3]); } catch {}
	const __fd = openSync(__payload.logPath, 'a');
	let __child;
	try {
		__child = Bun.spawn(__payload.args, { cwd: __payload.cwd, stderr: __fd, stdin: 'ignore', stdout: 'ignore', windowsHide: true });
	} finally { closeSync(__fd); }
	process.exit((await __child.exited) ?? 0);
}
`;

// Writes a fake CLI entrypoint at <rootDir>/cli/src/index.ts, prepended with the
// detached-spawn relauncher shim so the stub behaves like the real CLI on Windows. Every
// test that launches a run through RunService must use this (not a bare Bun.write) so the
// Windows relauncher path resolves to a real run instead of a dead-end stub.
export async function writeFakeCliEntrypoint(rootDir: string, script: string): Promise<void> {
	const { writeFile } = await import('node:fs/promises');
	await mkdir(join(rootDir, 'cli', 'src'), { recursive: true });
	await writeFile(join(rootDir, 'cli', 'src', 'index.ts'), `${RELAUNCHER_SHIM}\n${script}`);
}

// Test-only helper: produces a string of TypeScript that, when appended to a fake CLI
// script, writes a CLI active-run heartbeat record under `.aidd/active-runs/<runId>.json`
// for the current `AIDD_EXT_RUN_ID` env var. The web heartbeat watcher then terminalizes
// the corresponding DB row so the test can assert against a settled state. Without this,
// a detached fake CLI exits and the `runs` row stays `running` until test timeout.

export interface HeartbeatTerminatorOptions {
	exitCode?: number;
	/** Resolved CLI mode the heartbeat reports — mirror of what a real run's plan would
	 *  write. Defaults to 'coding'; a director-mode run must pass 'director'. */
	mode?: string;
	state?: 'completed' | 'failed' | 'stopped';
	summary?: string;
}

export function heartbeatTerminator(options: HeartbeatTerminatorOptions = {}): string {
	const state = options.state ?? 'completed';
	const exitCode = options.exitCode ?? 0;
	const mode = options.mode ?? 'coding';
	const summary = options.summary === undefined ? 'null' : JSON.stringify(options.summary);
	return `
const __runId = process.env.AIDD_EXT_RUN_ID;
const __projectDir = process.argv[process.argv.indexOf('--project-dir') + 1];
const __source = process.env.AIDD_EXT_RUN_SOURCE || 'cli';
const __logPath = process.env.AIDD_EXT_LOG_PATH || null;
if (__runId && __projectDir) {
	const { mkdir, writeFile } = await import('node:fs/promises');
	const { join, basename } = await import('node:path');
	const __dir = join(__projectDir, '.aidd', 'active-runs');
	await mkdir(__dir, { recursive: true });
	const __now = Date.now();
	const __record = {
		backend: 'native',
		completedAt: __now,
		durationMs: 10,
		exitCode: ${exitCode},
		heartbeatAt: __now,
		id: __runId,
		logPath: __logPath,
		mode: '${mode}',
		model: null,
		pid: process.pid,
		projectName: basename(__projectDir),
		projectPath: __projectDir,
		provider: null,
		reasoningEffort: null,
		source: __source,
		startedAt: __now - 10,
		state: '${state}',
		stopFile: join(__projectDir, '.aidd', '.stop'),
		stopReason: null,
		summary: ${summary},
	};
	await writeFile(join(__dir, __runId + '.json'), JSON.stringify(__record, null, 2) + '\\n');
}
`;
}

// Writes the log file directly so the web's tail watcher can broadcast `run_output`.
// The detached spawn discards stdout/stderr, so any output the test asserts on must be
// written through the `AIDD_EXT_LOG_PATH` env handoff rather than through console.
export function logWriter(content: string): string {
	const escaped = JSON.stringify(content);
	return `
{
	const __logPath = process.env.AIDD_EXT_LOG_PATH;
	if (__logPath) {
		const { writeFile } = await import('node:fs/promises');
		await writeFile(__logPath, ${escaped});
	}
}
`;
}

// Writes a minimal valid `DirectorOutput` JSON file to whatever path the host wires
// in via the `--director-output <path>` flag (set by web's runLauncher when launching
// a director-mode run). Pair with `heartbeatTerminator()` so the cycle's await loop
// observes the run terminalize and then reads back a parseable output document.
export function directorOutputWriter(): string {
	return `
{
	const __outIdx = process.argv.indexOf('--director-output');
	if (__outIdx >= 0) {
		const __outPath = process.argv[__outIdx + 1];
		const { writeFile } = await import('node:fs/promises');
		const __doc = {
			fleetSummary: {
				byRisk: { HIGH: 0, LOW: 0, MEDIUM: 0 },
				byType: {},
				crossProjectPatterns: [],
				totalSuggestions: 0,
			},
			suggestions: [],
		};
		await writeFile(__outPath, JSON.stringify(__doc, null, 2) + '\\n');
	}
}
`;
}
