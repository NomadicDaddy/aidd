import { EXT_LOG_PATH_ENV } from 'aidd-shared/metadata/active-runs';
import { buildBackendSubprocessEnv, buildToolSubprocessEnv } from 'aidd-shared/subprocess-env';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import type { BenchmarkArtifacts, BenchmarkStack, BenchmarkTask, CommandResult } from './types.ts';

import { buildAiddInvocation } from './cli.ts';
import { repoRoot } from './constants.ts';

export function runCommand(
	command: string,
	args: string[],
	cwd: string,
	options: { env?: NodeJS.ProcessEnv; timeoutSeconds?: number } = {},
): CommandResult {
	const started = Date.now();
	const result = spawnSync(command, args, {
		cwd,
		encoding: 'utf8',
		env: options.env ?? buildToolSubprocessEnv(),
		timeout:
			(options.timeoutSeconds ?? 0) > 0 ? (options.timeoutSeconds ?? 0) * 1000 : undefined,
		windowsHide: true,
	});
	const durationSeconds = (Date.now() - started) / 1000;
	const timedOut =
		result.signal === 'SIGTERM' ||
		(result.error instanceof Error && result.error.message.toLowerCase().includes('timeout'));
	const status = timedOut ? 124 : (result.status ?? 1);
	return {
		durationSeconds,
		status,
		stderr: result.stderr ?? '',
		stdout: result.stdout ?? '',
		timedOut,
	};
}

export function executeAidd(
	stack: BenchmarkStack,
	task: BenchmarkTask,
	workspaceDir: string,
	fixedEnv: Record<string, string>,
): { invocation: { args: string[]; command: string }; result: CommandResult } {
	const invocation = buildAiddInvocation(stack, task, workspaceDir);
	const overrideEnv: Record<string, string> = { ...fixedEnv };
	// The CLI resolves its data directory from the aidd INSTALL root, never from --project-dir, so
	// an unclaimed run writes its transcript to `<install>/data/run-logs`. For a benchmark that is
	// the live control panel's own data directory: disposable simulation runs land in real run
	// history, and under the test suite they litter the developer's working copy. Claim the log
	// path explicitly — the same contract the web backend uses to own a detached run's log — so the
	// benchmark keeps its transcripts with its own artifacts. Sibling of the workspace, not inside
	// it, so it is neither fixture-hashed nor mistaken for a run artifact.
	overrideEnv[EXT_LOG_PATH_ENV] = `${workspaceDir}.run.log`;
	if (stack.provider) overrideEnv.NATIVE_PROVIDER = stack.provider;
	if (stack.cli === 'ollama') overrideEnv.NATIVE_PROVIDER = 'ollama';
	if (stack.simulation) overrideEnv.AIDD_NATIVE_SIMULATION = '1';
	const result = runCommand(invocation.command, invocation.args, repoRoot, {
		env: buildBackendSubprocessEnv(overrideEnv),
		timeoutSeconds: task.timeoutSeconds + 30,
	});
	return { invocation, result };
}

function relativeSlash(root: string, filePath: string): string {
	return path.relative(root, filePath).replaceAll(path.sep, '/');
}

export function listFiles(root: string): string[] {
	if (!existsSync(root)) return [];
	const out: string[] = [];
	const visit = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				visit(full);
			} else if (entry.isFile()) {
				out.push(full);
			}
		}
	};
	visit(root);
	return out.sort((a, b) => relativeSlash(root, a).localeCompare(relativeSlash(root, b)));
}

function shouldHashFile(relativePath: string): boolean {
	const normalized = relativePath.replaceAll('\\', '/');
	const parts = normalized.split('/');
	if (parts.includes('.git') || parts.includes('node_modules')) return false;
	if (normalized.startsWith('.aidd/iterations/')) return false;
	if (normalized.startsWith('.aidd/audit-reports/')) return false;
	if (normalized.startsWith('.aidd/responses/')) return false;
	if (normalized === '.aidd/responses.md') return false;
	if (normalized === '.aidd/runs.jsonl') return false;
	if (normalized === '.aidd/.artifacts-check.json') return false;
	return true;
}

export function hashFixture(root: string): string {
	const hash = createHash('sha256');
	for (const filePath of listFiles(root)) {
		const relative = relativeSlash(root, filePath);
		if (!shouldHashFile(relative)) continue;
		hash.update(relative);
		hash.update('\0');
		hash.update(readFileSync(filePath));
		hash.update('\0');
	}
	return hash.digest('hex');
}

export function createWorkspace(sourceFixture: string, workspaceDir: string): void {
	if (existsSync(workspaceDir)) rmSync(workspaceDir, { force: true, recursive: true });
	mkdirSync(path.dirname(workspaceDir), { recursive: true });
	cpSync(sourceFixture, workspaceDir, { recursive: true });
	initWorkspaceGit(workspaceDir);
}

function initWorkspaceGit(workspaceDir: string): void {
	runCommand('git', ['init', '-q'], workspaceDir);
	runCommand('git', ['config', 'user.email', 'benchmark@example.invalid'], workspaceDir);
	runCommand('git', ['config', 'user.name', 'aidd Benchmark'], workspaceDir);
	runCommand('git', ['add', '--', '.'], workspaceDir);
	runCommand('git', ['commit', '-q', '-m', 'benchmark fixture'], workspaceDir);
}

export function fixtureRootForManifest(manifestPath: string): string {
	return path.join(path.dirname(path.resolve(manifestPath)), 'fixtures');
}

export function fixturePathForTask(manifestPath: string, task: BenchmarkTask): string {
	return path.resolve(fixtureRootForManifest(manifestPath), task.fixture);
}

export function workspaceName(
	stack: BenchmarkStack,
	task: BenchmarkTask,
	replicate: number,
	warmup: boolean,
): string {
	return `${stack.label}-${task.id}-${warmup ? 'warmup' : `rep-${replicate}`}`;
}

export function detectArtifacts(workspaceDir: string): BenchmarkArtifacts {
	const files = listFiles(workspaceDir);
	const relativeFiles = files.map((filePath) => relativeSlash(workspaceDir, filePath));
	const matching = (predicate: (relative: string) => boolean): string[] =>
		relativeFiles.filter(predicate).map((relative) => path.join(workspaceDir, relative));
	return {
		auditReports: matching(
			(relative) => relative.startsWith('.aidd/audit-reports/') && relative.endsWith('.md'),
		),
		rawLogs: matching(
			(relative) => relative.startsWith('.aidd/iterations/') && relative.endsWith('.log'),
		),
		responses: matching(
			(relative) =>
				relative === '.aidd/responses.md' ||
				(relative.startsWith('.aidd/responses/') && relative.endsWith('.md')),
		),
		runsLedger: matching((relative) => relative === '.aidd/runs.jsonl'),
		structuredLogs: matching(
			(relative) => relative.startsWith('.aidd/iterations/') && relative.endsWith('.json'),
		),
		workspace: workspaceDir,
	};
}
