import { describe, expect, test } from 'bun:test';

import { checkBashWorkspacePolicy } from '../../shared/src/agent/tools/shell-policy';

// The environment-dump check matched `printenv` only when a home variable or the end of the
// command followed it. A redirect, a flag, a second name, or any other command that prints the
// environment went through, although the policy's own comment says a whole-environment dump is
// denied. The tool environment is stripped of provider keys, so what leaked was the home paths.
describe('shell workspace policy - environment dumps', () => {
	const cwd = '/workspace/project';
	const verdict = (command: string) => checkBashWorkspacePolicy(command, cwd);

	test.each([
		'printenv',
		'printenv > out.txt',
		'printenv>out.txt',
		'printenv 2>&1',
		'printenv -0',
		'printenv HOME',
		'printenv PATH HOME',
		'printenv PATH USERPROFILE',
		'printenv | sort',
		'env',
		'env > out.txt',
		'env | sort',
		'env -0',
		'/usr/bin/env',
		'set',
		'set > out.txt',
		'set | grep HOME',
		'export -p',
		'export',
		'declare -p',
		'declare -x',
		'typeset -p',
		'ls && env',
		'FOO=1 env',
	])('denies %s', (command) => {
		expect(verdict(command)).not.toBeNull();
	});

	test.each([
		'printenv PATH',
		'printenv NODE_ENV',
		'env FOO=1 ls',
		'env -u FOO ls',
		'env NODE_ENV=test bun test',
		'set -e',
		'set -euo pipefail',
		'set +x',
		'export FOO=1',
		'export FOO',
		'echo environment',
		'ls envs',
		'cat settings.txt',
	])('allows %s', (command) => {
		expect(verdict(command)).toBeNull();
	});
});
