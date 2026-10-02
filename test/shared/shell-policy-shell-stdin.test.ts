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

	// The 2026-10-01 audit: the check named a bare shell directly after the pipe, so a wrapper, a
	// quoted or `.exe` name, a group, a descriptor on the redirect or another shell went through.
	// Each ran in a throwaway repository and reset two edited files.
	test.each([
		"echo 'printenv' | command sh",
		"echo 'printenv' | nice sh",
		"echo 'printenv' | nohup bash",
		"echo 'printenv' | sh.exe",
		"echo 'printenv' | bash.exe",
		`echo 'printenv' | "sh"`,
		"echo 'printenv' | 'bash'",
		`echo 'printenv' | "bash" -s`,
		"echo 'printenv' | (sh)",
		"echo 'printenv' | { sh; }",
		"echo 'printenv' | env X=1 sh",
		"echo 'printenv' | timeout 5 sh",
		"echo 'printenv' | builtin command sh",
		'sh 0< cmds.txt',
		'< cmds.txt sh',
		"echo 'printenv' | pwsh -Command -",
		"echo 'printenv' | cmd",
		'find . -maxdepth 0 -exec sh -c "ls" \\;',
		'bash -o pipefail -c "ls"',
		'cmd //c dir',
	])('denies %s', (command) => {
		expect(verdict(command)).toContain('disallowed shell construct');
	});

	test.each([
		'ls | grep sh',
		'git log --oneline | grep bash',
		'ps | grep -c sh',
		'which bash',
		'bash scripts/build.sh -c release',
		'pwsh scripts/x.ps1 -Config foo',
		'pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/x.ps1',
		'timeout 60 bun test',
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
