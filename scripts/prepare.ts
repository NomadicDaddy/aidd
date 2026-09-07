#!/usr/bin/env bun
import { resolve } from 'node:path';
import { cwd, exit } from 'node:process';

const setupCommand = ['bun', './scripts/run-bash.ts', '.githooks/leak-guard-setup.sh'];
const setupDisplay = setupCommand.join(' ');

interface CommandResult {
	exitCode: number;
	stderr: string;
}

type RunCommand = (command: string[], workingDirectory: string) => CommandResult;

const runCommand: RunCommand = (command, workingDirectory) => {
	const result = Bun.spawnSync(command, {
		cwd: workingDirectory,
		stderr: 'pipe',
		stdout: 'inherit',
		windowsHide: true,
	});
	return {
		exitCode: result.exitCode,
		stderr: new TextDecoder().decode(result.stderr).trim(),
	};
};

export function prepareRepository(projectRoot: string, run: RunCommand = runCommand): number {
	const root = resolve(projectRoot);
	const repository = run(['git', 'rev-parse', '--is-inside-work-tree'], root);
	if (repository.exitCode !== 0) {
		if (/not a git repository/i.test(repository.stderr)) {
			console.log('[SKIP] prepare hooks -- package is outside a Git checkout.');
			return 0;
		}
		console.error(`[FAIL] prepare hooks -- ${repository.stderr || 'git is unavailable'}`);
		return 1;
	}
	const configure = run(['git', 'config', 'core.hooksPath', '.githooks'], root);
	if (configure.exitCode !== 0) {
		console.error(`[FAIL] prepare hooks -- ${configure.stderr || 'git config failed'}`);
		return 1;
	}
	const setup = run(setupCommand, root);
	if (setup.exitCode !== 0) {
		console.error(`[FAIL] prepare hooks -- ${setup.stderr || 'leak-guard setup failed'}`);
		return 1;
	}
	console.log('[OK] prepare hooks');
	return 0;
}

if (import.meta.main) {
	const expected = ['--setup', setupDisplay];
	const actual = Bun.argv.slice(2);
	if (actual.length !== 2 || actual.some((value, index) => value !== expected[index])) {
		console.error(`Usage: bun scripts/prepare.ts --setup "${setupDisplay}"`);
		exit(2);
	}
	exit(prepareRepository(cwd()));
}
