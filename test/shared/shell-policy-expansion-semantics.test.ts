import { describe, expect, test } from 'bun:test';

import { checkBashWorkspacePolicy } from '../../shared/src/agent/tools/shell-policy';

// The static expansion is one linear pass with no model of `+=`, IFS, loop re-entry, function call
// time or branches, so each of these judged a harmless value while bash used one outside the
// workspace.
describe('shell workspace policy - expansion that differs from bash', () => {
	const cwd = '/workspace/project';
	const verdict = (command: string) => checkBashWorkspacePolicy(command, cwd);

	test.each([
		'a=.; a+=.; cat $a/outside/sentinel.txt',
		'a=.; a+=.; cat $a/fakehome/.aidd/config.json',
		'a=.; a+=.; b=$a/$a; cat $b/fx/fakehome/.aidd/config.json',
		'SHLVL=.; cat $SHLVL$SHLVL/outside/sentinel.txt',
		'IFS=_; a=ab_../outside/sentinel.txt; cat $a',
		'IFS=_; a=ab_/c/fakehome/.aidd/config.json; cat $a',
		'IFS=:; a=ab:~/.aidd/config.json; cat $a',
		'a=.; b=z; for i in 1 2; do cat $a$b/outside/sentinel.txt 2>/dev/null; b=.; done',
		'a=.; b=z; while cat $a$b/outside/sentinel.txt; do b=.; done',
		'a=.; b=z; until cat $a$b/outside/sentinel.txt; do b=.; done',
		'a=.; b=z; f() { cat $a$b/outside/sentinel.txt; }; b=.; f',
		'a=.; b=z; f() ( cat $a$b/outside/sentinel.txt ); b=.; f',
		'a=.; b=z; function f { cat $a$b/outside/sentinel.txt; }; b=.; f',
		'a=.; b=z; for i in 1 2; do cat $a$b/x; for b in .; do :; done; done',
		'a=.; b=.; false || b=z; cat $a$b/outside/sentinel.txt',
		'shopt -u globskipdots; a=.*; cat $a/outside/sentinel.txt',
		'"shopt" -s dotglob; cat .*/x',
		'set -f; cat a',
		'set +f; cat a',
		'set -o noglob; cat a',
		'a=.*; cat $a/outside/sentinel.txt',
		'a=..*; cat $a/outside/sentinel.txt',
		'cat ..*/outside/sentinel.txt',
	])('denies %s', (command) => {
		expect(verdict(command)).toContain('ERROR');
	});

	test.each([
		'f=src; rg x $f',
		'for f in src test; do rg x $f; done',
		'a=1; a=2; echo $a',
		'echo $RANDOM',
		'set -e; rg x src',
		'set -o pipefail; rg x src',
		"rg '.*' src",
		'rg "f()" src',
		'for f in src; do rg x $f; done; for g in test; do rg x $g; done',
	])('allows %s', (command) => {
		expect(verdict(command)).toBeNull();
	});

	// The text cannot show the first loop has ended, since `echo done` reads the same, so this is
	// taken as the rebinding it may be. A second name is all it costs.
	test('denies reusing a loop name once a body has read it', () => {
		expect(
			verdict('for f in src; do rg x $f; done; for f in test; do rg x $f; done'),
		).toContain('after a loop or function body reads it');
	});
});
