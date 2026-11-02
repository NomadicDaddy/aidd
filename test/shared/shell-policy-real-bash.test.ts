import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	augmentEnvPathForGitBash,
	resolvedBash,
} from '../../shared/src/agent/tools/bash-runtime.ts';
import { checkBashWorkspacePolicy } from '../../shared/src/agent/tools/shell-policy.ts';
import { testTempDir } from '../_helpers/temp.ts';

// Tests that read only the policy's verdict passed on every broken version of the quote scanner,
// because they encode what its author expected bash to do. This asks bash: each command runs for
// real in a throwaway workspace, and the failure is the policy allowing one that read the sentinel
// outside it. Commands go through a file, because argv collapses doubled backslashes on Windows.

const SENTINEL = 'SENTINEL-OUTSIDE-READ';
const X = '../outside/sentinel.txt';
const NBSP = String.fromCodePoint(0xa0);
const FF = String.fromCodePoint(0x0c);
const VT = String.fromCodePoint(0x0b);
const CR = String.fromCodePoint(0x0d);
/** `..` once bash expands an `$a` it left unset. */
const UNSET = '.$a./outside/sentinel.txt';

/** Each one read the sentinel on some version of the policy. */
const ATTACKS: [string, string][] = [
	['an escaped quote inside double quotes', `echo "a\\"" ; cat ${X} ; echo "x"`],
	['a pair of backslashes before a quote', `echo a \\\\" "; cat ${X}; echo " "`],
	['an apostrophe in a comment', `echo a # it's\ncat ${X} # it's`],
	['an apostrophe in a heredoc body', `cat <<EOF\nit's\nEOF\ncat ${X} # it's`],
	['an apostrophe in a quoted heredoc', `cat <<'EOF'\nit's\nEOF\ncat ${X}`],
	['a tab-stripping heredoc', `cat <<-EOF\n\tit's\n\tEOF\ncat ${X}`],
	['two heredocs on a line', `cat <<A <<B\nit's\nA\nit's\nB\ncat ${X}`],
	['xargs over a heredoc body', `xargs cat <<EOF\n${X}\nEOF`],
	['a non-breaking space before #', `echo a${NBSP}# ; cat ${X}`],
	['a form feed before #', `echo a${FF}# ; cat ${X}`],
	['a vertical tab before #', `echo a${VT}# ; cat ${X}`],
	['a carriage return before #', `echo a${CR}# ; cat ${X}`],
	['a form feed before a delimiter', `cat <<${FF}EOF\nit's\n${FF}EOF\ncat ${X} # it's`],
	[
		'a non-breaking space before a delimiter',
		`cat <<${NBSP}EOF\nit's\n${NBSP}EOF\ncat ${X} # it's`,
	],
	['an unclosed ((', `((echo a) ; cat <<EOF\nit's\nEOF\n) ; cat ${X} # it's`],
	['a # inside (( ))', `(( a = 1 #b )) ; cat ${X}`],
	['a # inside @( )', `[[ x == @(a #b) ]] ; cat ${X}`],
	['a # inside !( )', `[[ x == !(a #b) ]] ; cat ${X}`],
	['<< inside $[ ]', `echo $[1<<E]\ncat ${X}\nE]`],
	['<< inside a subscript', `a[1<<E]=1\ncat ${X}\nE]=1`],
	['<< inside @( )', `[[ x == @(a<<E) ]]\ncat ${X}\nE`],
	['<< inside a parameter default', `echo \${a:-<<E}\ncat ${X}\nE}`],
	['a carriage return on a terminator', `cat <<E\nE${CR}\ncat ${X}\nE`],
	['an escaped space before #', `echo a\\ # ; cat ${X}`],
	['an escaped tab before #', `echo a\\\t# ; cat ${X}`],
	['three backslashes before #', `echo a\\\\\\ # ; cat ${X}`],
	['an escaped ; before #', `echo a\\;# ; cat ${X}`],
	['an escaped | before #', `echo a\\|# ; cat ${X}`],
	['an escaped & before #', `echo a\\&# ; cat ${X}`],
	['an escaped ( before #', `echo a\\(# ; cat ${X}`],
	['an escaped ) before #', `echo a\\)# ; cat ${X}`],
	['an escaped < before #', `echo a\\<# ; cat ${X}`],
	['an escaped > before #', `echo a\\># ; cat ${X}`],
	['an escaped space, # and a quote', `echo a\\ #' ; cat ${X} ; echo '`],
	['an escaped <<, cat in the false body', `echo \\<<EOF\ncat ${X}\nEOF`],
	['an escaped <<, grep in the false body', `echo a\\<<EOF\ngrep S ${X}\nEOF`],
	['an escaped <<, a redirect in the false body', `echo \\<<EOF\nhead -1 < ${X}\nEOF`],
	['appending dots', 'a=.; a+=.; cat $a/outside/sentinel.txt'],
	['a numeric name assigned', 'SHLVL=.; cat $SHLVL$SHLVL/outside/sentinel.txt'],
	['IFS splitting a value', `IFS=_; a=ab_${X}; cat $a`],
	[
		'a value changed in a loop',
		'a=.; b=z; for i in 1 2; do cat $a$b/outside/sentinel.txt 2>/dev/null; b=.; done',
	],
	[
		'a value changed before a function runs',
		'a=.; b=z; f() { cat $a$b/outside/sentinel.txt; }; b=.; f',
	],
	['a branch not taken', 'a=.; b=.; false || b=z; cat $a$b/outside/sentinel.txt'],
	['a dot-glob after shopt', 'shopt -u globskipdots; a=.*; cat $a/outside/sentinel.txt'],
	['CDPATH with a parent', 'CDPATH=ab:..; cd outside; cat sentinel.txt'],
	// A name the policy thought was set, which bash had left empty.
	['a variable unset again', `a=x; unset a; cat ${UNSET}`],
	['unset through builtin', `a=x; builtin unset a; cat ${UNSET}`],
	['an argument shaped like an assignment', `echo a=x; cat ${UNSET}`],
	['an environment prefix', `a=x true; cat ${UNSET}`],
	['an assignment behind &&', `false && a=x; cat ${UNSET}`],
	['an assignment in a branch not taken', `if false; then a=x; fi; cat ${UNSET}`],
	['an assignment in a subshell', `(a=x); cat ${UNSET}`],
	['an assignment in a pipeline', `a=x | true; cat ${UNSET}`],
	['an assignment in the background', `a=x & wait; cat ${UNSET}`],
	['an assignment in a comment', `# a=x\ncat ${UNSET}`],
	['an assignment in a heredoc body', `cat <<EOF\na=x\nEOF\ncat ${UNSET}`],
	['a quoted read', 'a=x; "read" a <<< .; cat $a$a/outside/sentinel.txt'],
	['an escaped read', 'a=x; r\\ead a <<< .; cat $a$a/outside/sentinel.txt'],
	['a sibling config through an unset name', `echo a=x; cat .$a./profile/.aidd/config.json`],
	// Bash assigns only when the name and = are unquoted; each of these is a command named a=x.
	['a double-quoted name', `"a"=x; cat ${UNSET}`],
	['a single-quoted name', `'a'=x; cat ${UNSET}`],
	['a wholly quoted assignment', `"a=x"; cat ${UNSET}`],
	['an empty quote after the name', `a""=x; cat ${UNSET}`],
	['an empty quote before the name', `""a=x; cat ${UNSET}`],
	['a half-quoted name', `"a"b=x; cat .$ab./outside/sentinel.txt`],
	['a quoted equals sign', `a"="x; cat ${UNSET}`],
	['an escaped equals sign', `a\\=x; cat ${UNSET}`],
];

describe('shell workspace policy against real bash', () => {
	const bash = resolvedBash();
	const available = 'path' in bash;
	let cwd = '';
	let script = '';
	let env: Record<string, string> = {};
	let outside = '';

	function readsSentinel(command: string, extraEnv: Record<string, string> = {}): boolean {
		writeFileSync(script, command);
		const run = Bun.spawnSync([(bash as { path: string }).path, '../case.sh'], {
			cwd,
			env: { ...env, ...extraEnv },
			stderr: 'pipe',
			stdin: 'ignore',
			stdout: 'pipe',
			timeout: 10_000,
			windowsHide: true,
		});
		return `${run.stdout.toString()}${run.stderr.toString()}`.includes(SENTINEL);
	}

	beforeAll(async () => {
		if (!available) return;
		const base = await testTempDir('shell-policy-real-bash-');
		cwd = join(base, 'project');
		mkdirSync(cwd);
		outside = join(base, 'outside');
		mkdirSync(outside);
		writeFileSync(join(outside, 'sentinel.txt'), `${SENTINEL}\n`);
		mkdirSync(join(base, 'profile', '.aidd'), { recursive: true });
		writeFileSync(join(base, 'profile', '.aidd', 'config.json'), `${SENTINEL}\n`);
		script = join(base, 'case.sh');
		env = augmentEnvPathForGitBash((bash as { path: string }).path, {
			PATH: process.env.PATH ?? '',
		});
	});

	// Without this the rest could pass because bash never ran, or never reached the sentinel.
	test.skipIf(!available)('the instrument reads the sentinel when bash is told to', () => {
		expect(readsSentinel(`cat ${X}`)).toBe(true);
	});

	for (const [name, command] of ATTACKS) {
		test.skipIf(!available)(`${name} is not an allowed read`, () => {
			const allowed = checkBashWorkspacePolicy(command, cwd) === null;
			expect(allowed && readsSentinel(command)).toBe(false);
		});
	}

	test.skipIf(!available)('an absolute path behind an unset name is not an allowed read', () => {
		const absolute = join(cwd, '..', 'outside', 'sentinel.txt').split('\\').join('/');
		const command = `echo a=x; cat "\${a}${absolute}"`;
		const allowed = checkBashWorkspacePolicy(command, cwd) === null;
		expect(allowed && readsSentinel(command)).toBe(false);
	});

	// The tool environment forwards TMP, so bash holds a value the policy never sees. An assignment
	// that may not run, or may not last, leaves that inherited value in place.
	const INHERITED: [string, string][] = [
		['the inherited value itself', 'cat "$TMP/sentinel.txt"'],
		['an environment prefix', 'TMP=src true; cat "$TMP/sentinel.txt"'],
		['an assignment behind &&', 'false && TMP=src; cat "$TMP/sentinel.txt"'],
		['an argument shaped like an assignment', 'echo TMP=src; cat "$TMP/sentinel.txt"'],
		['a loop that may not run', 'false && for TMP in src; do :; done; cat "$TMP/sentinel.txt"'],
		['a loop over nothing', 'for TMP in; do :; done; cat "$TMP/sentinel.txt"'],
		// Loop words bash reads as plain text: quoted, or not starting a command.
		['quoted loop words', 'echo "for" TMP in src "do"; cat "$TMP/sentinel.txt"'],
		['single-quoted loop words', `echo 'for' TMP in src 'do'; cat "$TMP/sentinel.txt"`],
		['loop words as arguments', 'echo for TMP in src "do"; cat "$TMP/sentinel.txt"'],
		['unquoted loop words as arguments', 'echo for TMP in src do; cat "$TMP/sentinel.txt"'],
		['a quoted select', 'echo "select" TMP in src "do"; cat "$TMP/sentinel.txt"'],
		[
			'a skipped loop whose body echoes a quoted do',
			'false && for TMP in src; do echo "do"; done; cat "$TMP/sentinel.txt"',
		],
		[
			'a loop in a branch not taken',
			'if false; then for TMP in src; do echo do; done; fi; cat "$TMP/sentinel.txt"',
		],
		[
			'a skipped loop whose body echoes do',
			'false && for TMP in src; do echo do; done; cat "$TMP/sentinel.txt"',
		],
	];
	test.skipIf(!available)('the instrument reads the sentinel through an inherited TMP', () => {
		expect(readsSentinel('cat "$TMP/sentinel.txt"', { TMP: outside })).toBe(true);
	});
	for (const [name, command] of INHERITED) {
		test.skipIf(!available)(`${name} over an inherited TMP is not an allowed read`, () => {
			const allowed = checkBashWorkspacePolicy(command, cwd) === null;
			expect(allowed && readsSentinel(command, { TMP: outside })).toBe(false);
		});
	}
	test.skipIf(!available)('a loop bash is sure to run still binds its name', () => {
		expect(checkBashWorkspacePolicy('for d in src test; do ls "$d"; done', cwd)).toBeNull();
	});

	test.skipIf(!available)('a redirect through an unset name writes nothing outside', () => {
		const command = 'echo a=x; echo hi > .$a./outside/written.txt';
		const allowed = checkBashWorkspacePolicy(command, cwd) === null;
		if (allowed) readsSentinel(command);
		expect(allowed).toBe(false);
		expect(existsSync(join(cwd, '..', 'outside', 'written.txt'))).toBe(false);
	});

	test.skipIf(!available)('a real comment stays allowed', () => {
		const command = "echo a\\\\ # it's only a note";
		expect(checkBashWorkspacePolicy(command, cwd)).toBeNull();
		expect(readsSentinel(command)).toBe(false);
	});
});
