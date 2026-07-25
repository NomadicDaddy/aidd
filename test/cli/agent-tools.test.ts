import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { executeTool, toolDefinitions } from 'aidd-shared/agent/tools/index';

import { testTempDir } from '../_helpers/temp.ts';
const ripgrepAvailable = await (async (): Promise<boolean> => {
	try {
		const proc = Bun.spawn(['rg', '--version'], { stdout: 'ignore', stderr: 'ignore' });
		return (await proc.exited) === 0;
	} catch {
		return false;
	}
})();

async function removeTempWorkspace(cwd: string): Promise<void> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		try {
			await rm(cwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
			return;
		} catch (error) {
			const code =
				typeof error === 'object' && error !== null && 'code' in error
					? String(error.code)
					: undefined;
			if (code !== 'EBUSY' && code !== 'ENOTEMPTY' && code !== 'EPERM') throw error;
			await Bun.sleep(50);
		}
	}
	await rm(cwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

async function withTempWorkspace<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
	const cwd = await testTempDir('aidd-native-tool-');
	try {
		return await fn(cwd);
	} finally {
		await removeTempWorkspace(cwd);
	}
}

describe('native tools', () => {
	test('exposes the core tool names', () => {
		expect(toolDefinitions.map((tool) => tool.function.name)).toEqual([
			'read_file',
			'write_file',
			'edit_file',
			'bash',
			'glob',
			'grep',
			'list_directory',
		]);
	});

	test('runs bash and supports simulation', async () => {
		const cwd = process.cwd();
		await expect(
			executeTool('bash', JSON.stringify({ command: 'printf hello' }), cwd),
		).resolves.toContain('hello');
		await expect(
			executeTool('bash', JSON.stringify({ command: 'touch should-not-exist' }), cwd, true),
		).resolves.toContain('[SIMULATED] Command not executed');
	});

	test('runs bash with a minimal environment', async () => {
		const previous = process.env.AIDD_SECRET_SENTINEL;
		process.env.AIDD_SECRET_SENTINEL = 'do-not-inherit';
		try {
			const result = await executeTool(
				'bash',
				JSON.stringify({
					command:
						'printf "secret=${AIDD_SECRET_SENTINEL-unset};path=${PATH:+set}${Path:+set}"',
				}),
				process.cwd(),
			);
			expect(result).toContain('secret=unset');
			expect(result).toContain('path=set');
		} finally {
			if (previous === undefined) delete process.env.AIDD_SECRET_SENTINEL;
			else process.env.AIDD_SECRET_SENTINEL = previous;
		}
	});

	test('returns a bash timeout result instead of waiting for outer idle handling', async () => {
		const startedAt = Date.now();
		const result = await executeTool(
			'bash',
			JSON.stringify({ command: 'sleep 5', timeout_ms: 50 }),
			process.cwd(),
		);

		expect(Date.now() - startedAt).toBeLessThan(3000);
		expect(result).toContain('ERROR: Command timed out after 50ms');
		expect(result).toContain('[exit code: timeout]');
	});

	test.if(ripgrepAvailable)('finds files with glob and grep', async () => {
		await withTempWorkspace(async (cwd) => {
			await writeFile(join(cwd, 'alpha.ts'), 'const target = 1;\n', 'utf8');
			await writeFile(join(cwd, 'beta.md'), 'target\n', 'utf8');

			await expect(
				executeTool('glob', JSON.stringify({ pattern: '*.ts' }), cwd),
			).resolves.toBe('alpha.ts');
			await expect(
				executeTool('grep', JSON.stringify({ pattern: 'target', include: '*.ts' }), cwd),
			).resolves.toContain('alpha.ts:1:const target = 1;');
		});
	});

	test('blocks search paths that escape the workspace', async () => {
		await withTempWorkspace(async (cwd) => {
			await expect(
				executeTool('grep', JSON.stringify({ pattern: 'anything', path: '../' }), cwd),
			).resolves.toContain('Path escapes working directory');
		});
	});

	test('rejects bash commands that reference out-of-root absolute paths', async () => {
		await withTempWorkspace(async (cwd) => {
			const result = await executeTool(
				'bash',
				JSON.stringify({ command: 'cat /etc/passwd' }),
				cwd,
			);
			expect(result).toContain('ERROR: bash command references path outside workspace');
			expect(result).not.toContain('[exit code:');
		});
	});

	test('rejects bash commands that cd outside the workspace', async () => {
		await withTempWorkspace(async (cwd) => {
			const result = await executeTool(
				'bash',
				JSON.stringify({ command: 'cd .. && ls' }),
				cwd,
			);
			expect(result).toContain("ERROR: bash command 'cd' would escape workspace");
		});
	});

	test('rejects bash commands that write outside the workspace', async () => {
		await withTempWorkspace(async (cwd) => {
			const result = await executeTool(
				'bash',
				JSON.stringify({ command: 'echo escaped > ../escape.txt' }),
				cwd,
			);
			expect(result).toContain('ERROR: bash command writes outside workspace');
		});
	});

	test('rejects bash commands that reference the home directory', async () => {
		await withTempWorkspace(async (cwd) => {
			for (const command of [
				'cat $HOME/.aidd/config.json',
				'cat ${HOME}/.aidd/config.json',
				'cat ${HOME:-/root}/.aidd/config.json',
				'cat ${HOME:?}/.aidd/config.json',
				'cat ~/.aidd/config.json',
				'cat ~root/.aidd/config.json',
				'cd ~ && cat .aidd/config.json',
				'cat "$HOME/.aidd/config.json"',
			]) {
				const result = await executeTool('bash', JSON.stringify({ command }), cwd);
				expect(result).toContain('ERROR: bash command references a home directory');
			}
		});
	});

	test('rejects bash commands that reference the home directory via Windows env vars', async () => {
		await withTempWorkspace(async (cwd) => {
			for (const command of [
				// $HOMEDRIVE$HOMEPATH concatenates to the user profile on Windows
				'cat $HOMEDRIVE$HOMEPATH/.aidd/config.json',
				'cat ${HOMEDRIVE}${HOMEPATH}/.aidd/config.json',
				'cat $HOMEDRIVE/.aidd/config.json',
				'cat $HOMEPATH/.aidd/config.json',
				'cat %HOMEDRIVE%%HOMEPATH%/.aidd/config.json',
				'cat $env:HOMEDRIVE/.aidd/config.json',
			]) {
				const result = await executeTool('bash', JSON.stringify({ command }), cwd);
				expect(result).toContain('ERROR: bash command references a home directory');
			}
		});
	});

	test('rejects printenv commands that leak the home directory or dump the environment', async () => {
		await withTempWorkspace(async (cwd) => {
			for (const command of [
				'printenv HOME',
				'printenv USERPROFILE',
				'printenv HOMEDRIVE',
				'printenv HOMEPATH',
				// bare printenv dumps the entire environment (including HOME)
				'printenv',
				'printenv | grep -i home',
			]) {
				const result = await executeTool('bash', JSON.stringify({ command }), cwd);
				expect(result).toContain('ERROR: bash command uses printenv');
			}
		});
	});

	test('allows printenv for non-home variables', async () => {
		await withTempWorkspace(async (cwd) => {
			const result = await executeTool(
				'bash',
				JSON.stringify({ command: 'printenv PATH' }),
				cwd,
			);
			expect(result).not.toContain('ERROR: bash command uses printenv');
		});
	});

	test('allows in-workspace bash commands including relative cd and redirects', async () => {
		await withTempWorkspace(async (cwd) => {
			const insideResult = await executeTool(
				'bash',
				JSON.stringify({ command: 'cd . && printf hello > inside.txt && cat inside.txt' }),
				cwd,
			);
			expect(insideResult).toContain('hello');
			expect(insideResult).toContain('[exit code: 0]');
			await expect(readFile(join(cwd, 'inside.txt'), 'utf8')).resolves.toBe('hello');
		});
	});

	test('allows relative redirects and git-style ~ references that stay in-workspace', async () => {
		await withTempWorkspace(async (cwd) => {
			// `$i`-bearing relative redirect resolves inside the workspace (no false positive);
			// `HEAD~1` must not trip the home-directory guard.
			const result = await executeTool(
				'bash',
				JSON.stringify({
					command: 'i=1; printf hi > out_$i.txt && echo HEAD~1 && cat out_$i.txt',
				}),
				cwd,
			);
			expect(result).toContain('hi');
			expect(result).toContain('HEAD~1');
			expect(result).toContain('[exit code: 0]');
		});
	});

	test('edits files with workspace-relative paths', async () => {
		await withTempWorkspace(async (cwd) => {
			await writeFile(join(cwd, 'file.txt'), 'before', 'utf8');
			await executeTool(
				'edit_file',
				JSON.stringify({ path: 'file.txt', old_string: 'before', new_string: 'after' }),
				cwd,
			);
			await expect(readFile(join(cwd, 'file.txt'), 'utf8')).resolves.toBe('after');
		});
	});

	// --- Critical: eval/subshell/base64 bypass prevention ---
	test('rejects eval-based home exfiltration attempts', async () => {
		await withTempWorkspace(async (cwd) => {
			for (const command of [
				// eval + printf bypass
				'eval "$(printf \'cat $HOME/.aidd/config.json\')"',
				// base64 + eval bypass
				'eval "$(echo Y2F0ICRIT01FLy5haWRkL2NvbmZpZy5qc29u | base64 -d)"',
				// bash -c with single-quoted $HOME (subshell bypass)
				"bash -c 'cat $HOME/.aidd/config.json'",
				// sh -c variant
				"sh -c 'cat $HOME/.aidd/config.json'",
				// exec bypass
				'exec bash -c "cat $HOME/.aidd/config.json"',
			]) {
				const result = await executeTool('bash', JSON.stringify({ command }), cwd);
				expect(result).toMatch(
					/disallowed shell construct|home directory|encoding utility with an eval/,
				);
			}
		});
	});

	test('rejects base64 piped into bash/eval chains', async () => {
		await withTempWorkspace(async (cwd) => {
			for (const command of [
				'echo Y2F0IC9ldGMvcGFzc3dk | base64 -d | bash',
				'echo something | base64 | eval "$(cat)"',
				'echo test | xxd -r | bash -c "$(cat)"',
			]) {
				const result = await executeTool('bash', JSON.stringify({ command }), cwd);
				expect(result).toMatch(/disallowed shell construct|encoding utility with an eval/);
			}
		});
	});

	test('allows legitimate commands that do not use dangerous constructs', async () => {
		await withTempWorkspace(async (cwd) => {
			// These should all pass — no eval/bash -c/base64+eval
			const result = await executeTool(
				'bash',
				JSON.stringify({ command: 'printf "hello world"' }),
				cwd,
			);
			expect(result).toContain('hello world');
			expect(result).toContain('[exit code: 0]');
		});
	});

	// --- Medium: cp/mv/tee/install relative-path escape prevention ---
	test('rejects file-destination commands that escape the workspace', async () => {
		await withTempWorkspace(async (cwd) => {
			await writeFile(join(cwd, 'file.txt'), 'test', 'utf8');
			for (const command of [
				'cp file.txt ../outside.txt',
				'mv file.txt ../outside.txt',
				'install -m 644 file.txt ../outside.txt',
				'ln -s file.txt ../outside_link',
			]) {
				const result = await executeTool('bash', JSON.stringify({ command }), cwd);
				expect(result).toContain('ERROR: bash command writes outside workspace');
			}
		});
	});

	test('rejects tee that writes outside the workspace', async () => {
		await withTempWorkspace(async (cwd) => {
			const result = await executeTool(
				'bash',
				JSON.stringify({ command: 'echo data | tee ../outside.txt' }),
				cwd,
			);
			expect(result).toContain('ERROR: bash command writes outside workspace');
		});
	});

	test('allows in-workspace file-destination commands', async () => {
		await withTempWorkspace(async (cwd) => {
			await writeFile(join(cwd, 'src.txt'), 'content', 'utf8');
			const result = await executeTool(
				'bash',
				JSON.stringify({ command: 'cp src.txt dst.txt && cat dst.txt' }),
				cwd,
			);
			expect(result).toContain('content');
			expect(result).toContain('[exit code: 0]');
		});
	});

	// --- High: symlink escape prevention ---
	test('rejects read_file through a symlink that escapes the workspace', async () => {
		await withTempWorkspace(async (cwd) => {
			// Create a symlink inside the workspace pointing outside
			const outsideDir = join(cwd, '..', 'aidd-symlink-test-outside');
			await Bun.write(join(outsideDir, 'secret.txt'), 'secret-data');
			try {
				await symlink(outsideDir, join(cwd, 'escape_link'), 'junction');
				const result = await executeTool(
					'read_file',
					JSON.stringify({ path: 'escape_link/secret.txt' }),
					cwd,
				);
				expect(result).toContain('Path escapes working directory');
				expect(result).not.toContain('secret-data');
			} finally {
				await rm(outsideDir, { recursive: true, force: true }).catch(() => {});
			}
		});
	});

	test('rejects write_file through a symlink that escapes the workspace', async () => {
		await withTempWorkspace(async (cwd) => {
			const outsideDir = join(cwd, '..', 'aidd-symlink-write-test-outside');
			await mkdir(join(outsideDir), { recursive: true });
			try {
				await symlink(outsideDir, join(cwd, 'write_escape'), 'junction');
				const result = await executeTool(
					'write_file',
					JSON.stringify({ path: 'write_escape/pwned.txt', content: 'escaped' }),
					cwd,
				);
				expect(result).toContain('Path escapes working directory');
			} finally {
				await rm(outsideDir, { recursive: true, force: true }).catch(() => {});
			}
		});
	});

	test('allows read_file on regular (non-symlink) files within workspace', async () => {
		await withTempWorkspace(async (cwd) => {
			await writeFile(join(cwd, 'normal.txt'), 'hello', 'utf8');
			const result = await executeTool(
				'read_file',
				JSON.stringify({ path: 'normal.txt' }),
				cwd,
			);
			expect(result).toContain('hello');
		});
	});
});
