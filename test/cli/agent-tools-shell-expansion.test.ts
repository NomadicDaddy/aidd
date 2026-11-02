import { describe, expect, test } from 'bun:test';
import { join, win32 } from 'node:path';
import { executeTool } from 'aidd-shared/agent/tools/index';
import { checkBashWorkspacePolicy } from 'aidd-shared/agent/tools/shell-policy';

import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

// Containment used to be judged on the spelling of each argument, and bash rewrites the spelling
// before it runs: `$PWD/../x`, `$TEMP/x`, `$a$a`, `..{,}` and `$'\x2e\x2e'` all reached the
// program as a path the lexical sweep never saw. These tests pin the static expansion that closes
// that: a reference the command binds is judged as its value, one it does not bind is denied, and
// the rewrites that only bash can perform are refused outright.

const cwd = process.platform === 'win32' ? win32.resolve('D:/projects/app') : '/projects/app';
const BACKSLASH = String.fromCharCode(92);

function denial(command: string): string {
	const result = checkBashWorkspacePolicy(command, cwd);
	expect(result).toBeString();
	return result ?? '';
}

describe('bash policy judges runtime-expanded paths by their value', () => {
	test('$PWD expands to the workspace, so $PWD/.. is the parent', () => {
		expect(denial('cat "$PWD/../outside.txt"')).toContain('outside workspace');
	});

	test('a variable the command builds from dots is judged as ..', () => {
		expect(denial('a=.; cat $a$a/outside.txt')).toContain('outside workspace');
		expect(denial('a=.; b=$a; cat $b$b/x')).toContain('outside workspace');
		expect(denial('for f in . .; do ls $f$f; done')).toContain('outside workspace');
	});

	// A name an argument, a prefix, a skipped branch or a subshell "set" still holds whatever it held
	// before, here the environment's value, which the policy can't see.
	for (const command of [
		'echo a=x; cat .$a./outside.txt',
		'a=x true; cat .$a./outside.txt',
		'false && a=x; cat .$a./outside.txt',
		'(a=x); cat .$a./outside.txt',
		'# a=x\ncat .$a./outside.txt',
		'TMP=src true; ls "$TMP"',
		'false && for TMP in src; do :; done; ls "$TMP"',
		'for TMP in; do :; done; ls "$TMP"',
	]) {
		test(`denies a name the command may not have set: ${command}`, () => {
			expect(denial(command)).toMatch(
				/expands \$(a|TMP), which the command does not set for certain/,
			);
		});
	}

	test('a name set for certain and then perhaps reassigned may hold either value', () => {
		expect(denial('a=src; false && a=..; cat $a/x')).toContain('outside workspace');
		expect(denial('a=src; false && for a in ..; do :; done; cat $a/x')).toContain(
			'outside workspace',
		);
	});

	test('a for list is itself a set of arguments', () => {
		expect(denial('for f in ../*.ts; do echo $f; done')).toContain('outside workspace');
	});

	for (const command of [
		'cat "$TEMP/outside.txt"',
		'cat "$SystemRoot/System32/drivers/etc/hosts"',
		'cat ${TEMP}/x',
		'cat <<EOF\n$TEMP\nEOF',
	]) {
		test(`denies an environment reference the command does not bind: ${command}`, () => {
			expect(denial(command)).toMatch(
				/expands \$(TEMP|SystemRoot), which the command does not set/,
			);
		});
	}

	for (const [command, construct] of [
		[`cat $'${BACKSLASH}x2e${BACKSLASH}x2e/outside.txt'`, "$'...'"],
		['ls ..{,}', 'brace expansion'],
		['cat "${TEMP:-/tmp}/x"', 'parameter operation'],
		['printf .. | while read d; do ls $d; done', "binds a variable with 'read'"],
		['echo $1', 'positional or special parameter'],
		['a=x; "read" a <<< .; cat $a', "binds a variable with 'read'"],
		['a=x; unset a; cat $a/x', "unsets a variable with 'unset'"],
		['cat $0', 'positional or special parameter'],
	]) {
		test(`denies the runtime rewrite in ${command}`, () => {
			expect(denial(command ?? '')).toContain(construct ?? '');
		});
	}

	test('denies dot-globs, which can match the parent directory', () => {
		expect(denial('ls .*')).toContain('dot-glob');
		expect(denial('cat src/.?/x')).toContain('dot-glob');
	});
});

describe('bash policy still allows references it can bound', () => {
	for (const command of [
		'f=src; ls $f',
		'a=.; b=$a; cat $b/x',
		'd=src; cat $d/x.ts',
		'x=s y=rc; ls $x$y',
		'cd src; f=main.ts; cat $f',
		'd="src"; cat $d/x.ts',
		'd=\'src dir\'; ls "$d"',
		'rg "a=b" src',
		'for f in *.ts; do wc -l $f; done',
		'for f in src test; do rg pattern $f; done',
		'bun test; echo $?',
		'ls $PWD/src',
		'n=3; echo "count=$n"',
		"echo '$FOO literal'",
		'touch out_$RANDOM.txt',
		'echo $((1 + 2))',
		"awk '{print $1}' f.txt",
		'git log --format="%h %s" -5',
		'export NODE_ENV=test; bun test',
	]) {
		test(`allows ${command}`, () => {
			expect(checkBashWorkspacePolicy(command, cwd)).toBeNull();
		});
	}
});

describe('bash tool denies an expanded escape before spawning', () => {
	test('cat "$PWD/../outside.txt" returns the denial and never runs', async () => {
		const workspace = await testTempDir('aidd-policy-expansion-');
		const outsideFile = join(workspace, '..', 'aidd-policy-expansion-outside.txt');
		await Bun.write(outsideFile, 'secret-data');
		try {
			const result = await executeTool(
				'bash',
				JSON.stringify({ command: 'cat "$PWD/../aidd-policy-expansion-outside.txt"' }),
				workspace,
			);
			expect(result).toContain('outside workspace');
			expect(result).not.toContain('secret-data');
			expect(result).not.toContain('[exit code:');
		} finally {
			await removeTempTree(outsideFile).catch(() => {});
			await removeTempTree(workspace).catch(() => {});
		}
	});
});
