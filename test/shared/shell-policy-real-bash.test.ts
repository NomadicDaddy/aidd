import { beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
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
];

describe('shell workspace policy against real bash', () => {
	const bash = resolvedBash();
	const available = 'path' in bash;
	let cwd = '';
	let script = '';
	let env: Record<string, string> = {};

	function readsSentinel(command: string): boolean {
		writeFileSync(script, command);
		const run = Bun.spawnSync([(bash as { path: string }).path, '../case.sh'], {
			cwd,
			env,
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
		mkdirSync(join(base, 'outside'));
		writeFileSync(join(base, 'outside', 'sentinel.txt'), `${SENTINEL}\n`);
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

	test.skipIf(!available)('a real comment stays allowed', () => {
		const command = "echo a\\\\ # it's only a note";
		expect(checkBashWorkspacePolicy(command, cwd)).toBeNull();
		expect(readsSentinel(command)).toBe(false);
	});
});
