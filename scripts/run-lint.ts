#!/usr/bin/env bun
import { exit } from 'node:process';

interface LintTask {
	command: string[];
	name: string;
}

export function lintTasks(fast: boolean): LintTask[] {
	const suffix = fast ? ':fast' : '';
	return [
		...['shared', 'backend', 'frontend'].map((workspace) => ({
			command: ['bun', 'run', '--cwd', workspace, `lint${suffix}`],
			name: workspace,
		})),
		...['scripts', 'cli', 'test', 'config'].map((scope) => ({
			command: ['bun', 'run', `lint:${scope}${suffix}`],
			name: scope,
		})),
	];
}

export async function runLint(fast: boolean, concurrency = 3): Promise<number> {
	const tasks = lintTasks(fast);
	const failures: string[] = [];
	let next = 0;
	const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
		for (;;) {
			const task = tasks[next++];
			if (!task) return;
			const child = Bun.spawn(task.command, {
				stderr: 'pipe',
				stdin: 'ignore',
				stdout: 'pipe',
				windowsHide: true,
			});
			const [stdout, stderr, exitCode] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			]);
			const output = [`\n[lint:${task.name}]`, stdout.trim(), stderr.trim()]
				.filter(Boolean)
				.join('\n');
			process.stdout.write(`${output}\n`);
			if (exitCode !== 0) failures.push(task.name);
		}
	});
	await Promise.all(workers);
	if (failures.length === 0) return 0;
	console.error(`[lint] failed: ${failures.join(', ')}`);
	return 1;
}

if (import.meta.main) {
	const args = Bun.argv.slice(2);
	if (args.some((arg) => arg !== '--fast') || args.filter((arg) => arg === '--fast').length > 1) {
		console.error('Usage: bun scripts/run-lint.ts [--fast]');
		exit(2);
	}
	exit(await runLint(args.includes('--fast')));
}
