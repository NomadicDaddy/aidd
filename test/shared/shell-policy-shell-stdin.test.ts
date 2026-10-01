import { describe, expect, test } from 'bun:test';

import { checkBashWorkspacePolicy } from '../../shared/src/agent/tools/shell-policy';

// A shell that reads its commands from a pipe, a redirect or a heredoc runs text the policy never
// inspects as a command, so every static check is bypassed at once: `echo 'printenv' | sh` dumped
// the environment and `echo 'git reset --hard' | sh` discarded work, both allowed.
describe('shell workspace policy - a shell fed its commands as data', () => {
	const cwd = '/workspace/project';
	const verdict = (command: string) => checkBashWorkspacePolicy(command, cwd);

	test.each([
		"echo 'printenv' | sh",
		"echo 'git reset --hard' | bash",
		'cat steps.txt | sh',
		'cat steps.txt |bash',
		'cat steps.txt | sh -s',
		'cat steps.txt | bash -s -- arg',
		'sh < steps.txt',
		'bash <steps.txt',
		'sh <<EOF\nls\nEOF',
		'bash <<< "ls"',
		'ls && echo ls | zsh',
		'echo ls | /bin/sh',
		'echo ls | env sh',
	])('denies %s', (command) => {
		expect(verdict(command)).toContain('disallowed shell construct');
	});

	test.each([
		'ls | sort',
		'echo hi | shasum',
		'echo hi | sha256sum',
		'git log --oneline | head -5',
		'bash scripts/build.sh',
		'sh ./run.sh --flag',
		'echo "use sh or bash" | cat',
		'cat notes.txt | shuf',
	])('allows %s', (command) => {
		expect(verdict(command)).toBeNull();
	});
});
