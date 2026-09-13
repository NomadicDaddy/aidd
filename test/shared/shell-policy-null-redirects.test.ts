import { describe, expect, test } from 'bun:test';
import { readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';

import { runBash } from '../../shared/src/agent/tools/shell.ts';
import { isPathWithinWorkspaceRoot } from '../../shared/src/agent/tools/shell-policy-paths.ts';
import { checkBashWorkspacePolicy } from '../../shared/src/agent/tools/shell-policy.ts';
import { removeTempTree } from '../../shared/src/lib/remove-temp-tree.ts';
import { testTempDir } from '../_helpers/temp.ts';

const cwd = process.platform === 'win32' ? 'D:\\projects\\app' : '/projects/app';

describe('bash policy allows literal null output redirects', () => {
	const commands = [
		'printf ok >/dev/null',
		'printf ok 2>/dev/null',
		'printf ok 2> /dev/null',
		'printf ok 2>"/dev/null"',
		"printf ok 2> '/dev/null'",
		'printf ok >>/dev/null',
		'printf ok 2>> /dev/null',
		'printf ok &>/dev/null',
		'printf ok &>>"/dev/null"',
		'printf ok >/dev/null 2>&1',
		'printf ok 2>/dev/null; printf done 1>/dev/null',
		'printf ok 2>/dev/null|head',
		'printf ok 2>/dev/null&&printf done',
		'printf ok 2>/dev/null\nprintf done',
		'cp source.txt target.txt 2>/dev/null',
		'mv source.txt target.txt 2>/dev/null',
		'tee output.txt >/dev/null',
		'tee 2>/dev/null',
		'printf ok 2>&1',
		'ls packages/website/src/routes/ && ls packages/website/src/routes/api 2>/dev/null; ls packages/website/src/routes/api/game 2>/dev/null',
		'grep -rn "authTimeout\\|AUTH" packages/game-server/src/config/env.ts 2>/dev/null | head -10; echo ---; ls packages/game-server/src/config packages/game-server/src/core 2>&1',
		'grep -c "test\\|describe" packages/game-server/src/veiled-road/*.test.ts 2>/dev/null | head; ls packages/website/src/__tests__ | head -30',
		'grep -c "" packages/game-server/src/veiled-road/world-loop.ts packages/game-client/src/client-event-listener.ts packages/game-server/src/veiled-road/vr-event-handlers.ts 2>/dev/null',
		'node .aidd/tmp-check.mjs 2>/dev/null || true',
	];

	for (const command of commands) {
		test(command, () => {
			expect(checkBashWorkspacePolicy(command, cwd)).toBeNull();
		});
	}

	test('NUL is a relative workspace filename, not a null-device alias', () => {
		// Git Bash's sink is /dev/null. 2>NUL is allowed because NUL resolves inside the
		// workspace, the same as 2>scratch.log — not because the output-sink exception matched.
		expect(checkBashWorkspacePolicy('printf ok 2>NUL', cwd)).toBeNull();
	});
});

describe('null redirects do not exempt other paths or shell constructs', () => {
	const commands = [
		'printf ok >/dev/null/../outside',
		'printf ok >/dev/null.txt',
		'printf ok >"/dev/null"/../outside',
		'printf ok >"/dev/null"suffix',
		'printf ok >/dev/null"/../outside"',
		'printf ok >/dev/null\\suffix',
		'printf ok >/dev/null\routside',
		'printf ok >/dev/null\r',
		'printf ok >/dev/null\u2028',
		'printf ok >/dev/null\u00a0outside',
		'printf ok >/dev/null\u000boutside',
		'printf ok >"/dev/null$SUFFIX"',
		'printf ok >$TARGET',
		'cat </dev/null',
		'cat <>/dev/null',
		'cat /dev/null 2>/dev/null',
		'cat /dev/null>/dev/null',
		'rm /dev/null',
		'cp source.txt /dev/null 2>/dev/null',
		'tee /dev/null 2>/dev/null',
		'cat ../outside.txt 2>/dev/null',
		'cp source.txt ../outside.txt 2>/dev/null',
		'mv source.txt ../outside.txt 2>/dev/null',
		'tee ../outside.txt >/dev/null',
		'printf ok 2>/dev/null >../outside.txt',
		'printf ok >../outside.txt 2>/dev/null',
		'printf ok 2>/dev/null; cat ../outside.txt',
		'printf ok 2>/dev/null&&cat ../outside.txt',
		'cd .. 2>/dev/null',
		'cat $HOME/secret 2>/dev/null',
		'cat "$TARGET" 2>/dev/null',
		'cat $(pwd) 2>/dev/null',
		'cat `pwd` 2>/dev/null',
		'eval payload 2>/dev/null',
		'git reset --hard 2>/dev/null',
		'printf "%s" ">/dev/null"',
		"printf '%s' '>/dev/null'",
		String.raw`printf '%s' \>/dev/null`,
		String.raw`printf '%s' "escaped\" >/dev/null"`,
		'printf "%s" "2>/dev/null"; cat ../outside.txt',
		String.raw`printf '%s' \">/dev/null; cat ../outside.txt`,
	];

	for (const command of commands) {
		test(command, () => {
			expect(checkBashWorkspacePolicy(command, cwd)).toStartWith('ERROR:');
		});
	}

	test('the null device remains outside workspace path containment on both platforms', () => {
		expect(isPathWithinWorkspaceRoot('/dev/null', 'D:\\projects\\app', 'win32')).toBe(false);
		expect(isPathWithinWorkspaceRoot('/dev/null', '/projects/app', 'linux')).toBe(false);
	});
});

describe('native bash executes null redirects without weakening the workspace boundary', () => {
	test('discards stderr, preserves stdout and creates no workspace files', async () => {
		const workspace = await testTempDir('aidd-null-redirect-');
		try {
			const result = await runBash(
				{
					command: 'printf visible; printf hidden 2>/dev/null >&2',
					timeout_ms: 5000,
				},
				workspace,
			);
			expect(result).toBe('visible\n[exit code: 0]');
			for (const command of [
				'printf hidden >/dev/null',
				'printf hidden >>"/dev/null"',
				"printf hidden &> '/dev/null'",
				'printf hidden &>>/dev/null',
			]) {
				expect(await runBash({ command, timeout_ms: 5000 }, workspace)).toBe(
					'\n[exit code: 0]',
				);
			}
			expect(await readdir(workspace)).toEqual([]);
		} finally {
			await removeTempTree(workspace);
		}
	});

	test('a null redirect cannot hide an escaping symlink', async () => {
		const workspace = await testTempDir('aidd-null-redirect-link-');
		const outside = await testTempDir('aidd-null-redirect-outside-');
		try {
			await Bun.write(join(outside, 'secret.txt'), 'outside secret');
			await symlink(outside, join(workspace, 'escape'), 'junction');
			for (const command of [
				'cat escape/secret.txt 2>/dev/null',
				'printf changed >escape/secret.txt 2>/dev/null',
			]) {
				const result = await runBash({ command, timeout_ms: 5000 }, workspace);
				expect(result).toContain('outside workspace via a symlink');
			}
			expect(await Bun.file(join(outside, 'secret.txt')).text()).toBe('outside secret');
		} finally {
			await removeTempTree(workspace);
			await removeTempTree(outside);
		}
	});
});
