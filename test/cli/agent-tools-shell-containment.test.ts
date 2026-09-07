import { describe, expect, test } from 'bun:test';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { executeTool } from 'aidd-shared/agent/tools/index';
import { checkBashWorkspacePolicy } from 'aidd-shared/agent/tools/shell-policy';

import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

// The bash policy used to bound only the positions someone had enumerated — absolute tokens,
// `cd`, redirects, and cp/mv/tee destinations. Every other argument reached `Bun.spawn` unread,
// so `cat ../outside.txt` and `cat ./escape_link/config.json` were policy-clean. These tests pin
// containment as a property of the whole command, and pin the ordinary commands that must keep
// working — an over-broad filter that blocks `git status` gets removed within a day, which is
// the failure mode that lets the escape back in.

const cwd = process.platform === 'win32' ? 'D:\\projects\\app' : '/projects/app';

function denial(command: string): string {
	const result = checkBashWorkspacePolicy(command, cwd);
	expect(result).toBeString();
	return result ?? '';
}

describe('bash policy contains relative path escapes', () => {
	const escapes: [string, string][] = [
		['reads a parent-directory file', 'cat ../outside.txt'],
		['removes a parent-directory file', 'rm ../outside.txt'],
		['creates a parent-directory file', 'touch ../outside.txt'],
		['climbs more than one level', 'cat ../../etc/shadow'],
		['copies an outside file in as the source argument', 'cp ../outside.txt inside.txt'],
		['passes the parent as a search root', 'rg pattern ../'],
		['targets the parent directly', 'rm -rf ..'],
	];

	for (const [label, command] of escapes) {
		test(`${label}: ${command}`, () => {
			const result = denial(command);
			expect(result).toContain('ERROR: bash command references path outside workspace');
			expect(result).toContain('will not succeed on retry');
		});
	}

	test('a quoted absolute path is caught even though the absolute sweep blanks quoted spans', () => {
		expect(denial('cat "/etc/passwd"')).toContain('references path outside workspace');
	});

	test('quote concatenation cannot hide the traversal', () => {
		// `"../out"side.txt` is one word to bash; a regex over the raw string sees neither
		// `../outside.txt` nor a quoted token it recognizes.
		expect(denial('cat "../out"side.txt')).toContain('references path outside workspace');
	});

	test('a path hidden behind a flag value is inspected', () => {
		expect(denial('bun run build --outDir=../dist')).toContain(
			'references path outside workspace',
		);
		expect(denial('dd if=inside.txt of=../outside.txt')).toContain('outside workspace');
	});
});

describe('bash policy denies home references the tool environment actually supplies', () => {
	// buildToolSubprocessEnv passes each of these to the subprocess, so a reference expands for
	// real. $USERPROFILE and the app-data pair were reachable in the bash spelling while only
	// the %VAR% and $env: spellings were denied.
	const homeVars = [
		'cat $USERPROFILE/.aidd/config.json',
		'cat ${USERPROFILE}/.aidd/config.json',
		'cat $APPDATA/aidd/config.json',
		'cat $LOCALAPPDATA/aidd/config.json',
		'echo $USERPROFILE',
		'cat "$USERPROFILE/.aidd/config.json"',
	];

	for (const command of homeVars) {
		test(`denies ${command}`, () => {
			expect(denial(command)).toContain('ERROR: bash command references a home directory');
		});
	}

	test('printenv APPDATA is an environment dump too', () => {
		expect(denial('printenv APPDATA')).toContain('ERROR: bash command uses printenv');
	});
});

describe('bash policy denies command substitution', () => {
	const substitutions = [
		'cat $(printf %s /etc/passwd)',
		'OUT=`pwd`; cat $OUT/x',
		'grep -f <(cat other) src/x.ts',
	];

	for (const command of substitutions) {
		test(`denies ${command}`, () => {
			const result = denial(command);
			// A `$(...)`-derived path is opaque to a lexical filter, so the whole construct goes.
			expect(result).toMatch(/command substitution|references path outside workspace/);
		});
	}

	test('arithmetic expansion is not command substitution', () => {
		expect(checkBashWorkspacePolicy('echo $((1 + 2))', cwd)).toBeNull();
	});

	test('a cd target keeps its more specific denial', () => {
		// Ordering guard: the generic substitution check must stay behind the cd check, or the
		// "expanded at runtime" wording that shell-policy-cd-expansion.test.ts pins disappears.
		expect(denial('cd "$(git rev-parse --show-toplevel)"')).toContain('expanded at runtime');
	});
});

describe('bash policy still allows ordinary in-project commands', () => {
	const allowed = [
		'bun test',
		'git status',
		'git log --oneline -5',
		'rg pattern src/',
		'bunx eslint shared/src/agent/tools/shell-policy.ts',
		'bun run build --outDir=dist',
		'find . -name "*.ts" -not -path "./node_modules/*"',
		'git commit -m "fix: handle ../ paths in the policy"',
		'git diff HEAD~1..HEAD --stat',
		'printf "hello world" > out/note.txt',
		'sed -n "1,60p" shared/src/agent/tools/shell-policy.ts',
		'cd packages/core && bun test',
		'MESSAGE=hello; echo "$MESSAGE" > notes/out.txt',
		'mkdir -p out/nested && printf x > out/nested/f.txt',
	];

	for (const command of allowed) {
		test(`allows ${command}`, () => {
			expect(checkBashWorkspacePolicy(command, cwd)).toBeNull();
		});
	}
});

describe('bash policy follows symlinks before deciding containment', () => {
	test('denies a bash command reading through an escaping symlink, and does not run it', async () => {
		const workspace = await testTempDir('aidd-policy-symlink-');
		const outsideDir = join(workspace, '..', 'aidd-policy-symlink-outside');
		await Bun.write(join(outsideDir, 'secret.txt'), 'secret-data');
		try {
			await symlink(outsideDir, join(workspace, 'escape_link'), 'junction');

			for (const command of [
				'cat escape_link/secret.txt',
				'cat ./escape_link/secret.txt',
				'cat "escape_link/secret.txt"',
				'cd escape_link && cat secret.txt',
				'printf x > escape_link/planted.txt',
			]) {
				const result = await executeTool('bash', JSON.stringify({ command }), workspace);
				expect(result).toContain('outside workspace');
				expect(result).not.toContain('secret-data');
				// A denial is returned instead of spawning, so there is no exit-code footer.
				expect(result).not.toContain('[exit code:');
			}
		} finally {
			await removeTempTree(outsideDir).catch(() => {});
			await removeTempTree(workspace).catch(() => {});
		}
	});

	test('a real in-workspace relative command still executes', async () => {
		const workspace = await testTempDir('aidd-policy-inside-');
		try {
			await Bun.write(join(workspace, 'src', 'note.txt'), 'kept');
			const result = await executeTool(
				'bash',
				JSON.stringify({ command: 'cat ./src/note.txt' }),
				workspace,
			);
			expect(result).toContain('kept');
			expect(result).toContain('[exit code: 0]');
		} finally {
			await removeTempTree(workspace).catch(() => {});
		}
	});
});
