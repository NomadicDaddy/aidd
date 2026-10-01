import { describe, expect, test } from 'bun:test';

import { checkBashWorkspacePolicy } from '../../shared/src/agent/tools/shell-policy';

// `cd` with no target changes to the home directory. The policy only inspected `cd` when it had a
// target, and went on judging later relative paths against the workspace, so
// `cd; cat .aidd/config.json` was allowed and read the user-level config file.
describe('shell workspace policy - cd that leaves for the home directory', () => {
	const cwd = '/workspace/project';
	const verdict = (command: string) => checkBashWorkspacePolicy(command, cwd);

	test.each([
		'cd',
		'cd; cat .aidd/config.json',
		'cd && cat .aidd/config.json',
		'cd ; ls',
		'cd --; ls',
		'cd -- && ls',
		'pushd; ls',
		'pushd && ls',
		'ls && cd',
		'(cd; ls)',
		'{ cd; ls; }',
		'if true; then cd; fi; cat .aidd/config.json',
		'builtin cd; ls',
		'command cd && ls',
		'cd\ncat .aidd/config.json',
	])('denies %s', (command) => {
		expect(verdict(command)).toContain("'cd' with no target");
	});

	test.each([
		'cd src',
		'cd src && ls',
		'cd ./src/components',
		'cd -- src',
		'pushd src && ls && popd',
		'echo cd',
		'cd -',
		'cd src && cd -',
		'ls cd-notes.txt',
		'git checkout -',
	])('allows %s', (command) => {
		expect(verdict(command)).toBeNull();
	});
});
