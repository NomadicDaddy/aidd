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
		'cd -P; cat .aidd/config.json',
		'cd -L; cat .aidd/config.json',
		'cd -e; cat .aidd/config.json',
		'c\\d; cat .aidd/config.json',
		'"cd"; cat .aidd/config.json',
		"'cd'; cat .aidd/config.json",
		'c""d; cat .aidd/config.json',
		'if cd; then cat .aidd/config.json; fi',
		'while cd; do cat .aidd/config.json; break; done',
		'until cd; do cat .aidd/config.json; done',
		'if true; then :; elif cd; then ls; fi',
		'! cd; cat .aidd/config.json',
		'A=1 cd; cat .aidd/config.json',
		'command -- cd; cat .aidd/config.json',
		'case x in x) cd;; esac; cat .aidd/config.json',
		'cd >/dev/null; cat .aidd/config.json',
		'a=cd; $a; cat .aidd/config.json',
		'a=cd; ${a}; cat .aidd/config.json',
		'echo "a\\"" ; cd ; echo "x"',
		"echo a # it's\ncd\ncat .aidd/config.json # it's",
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
		'cd -P src',
		'if cd src; then ls; fi',
		'command -v cd',
		'echo "cd; ls"',
		'rg "cd; " src',
		'ls cd-notes.txt',
		'git checkout -',
	])('allows %s', (command) => {
		expect(verdict(command)).toBeNull();
	});
});
