import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { aiddMetadataTracked } from '../../cli/src/orchestrator/run/metadata-tracking.ts';
import { renderLaunchContext } from '../../cli/src/prompts/compile/launch-context.ts';
import { testTempDir } from '../_helpers/temp.ts';

async function git(dir: string, args: string[]): Promise<void> {
	const proc = Bun.spawn(['git', '-C', dir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await proc.exited) !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${await new Response(proc.stderr).text()}`);
	}
}

async function makeRepo(name: string, gitignore: string): Promise<string> {
	const root = await testTempDir(`aidd-metadata-tracking-${name}`);
	const projectDir = join(root, 'project');
	await mkdir(join(projectDir, '.aidd', 'features', 'feature-one'), { recursive: true });
	await git(projectDir, ['init', '-q']);
	await git(projectDir, ['config', 'user.email', 'test@aidd.local']);
	await git(projectDir, ['config', 'user.name', 'aidd test']);
	await writeFile(join(projectDir, '.gitignore'), gitignore);
	await writeFile(
		join(projectDir, '.aidd', 'features', 'feature-one', 'feature.json'),
		'{"id":"feature-one","status":"backlog","passes":false}\n',
	);
	await git(projectDir, ['add', '-A']);
	await git(projectDir, ['commit', '-q', '-m', 'baseline']);
	return projectDir;
}

describe('aiddMetadataTracked', () => {
	test('reports untracked when the repo gitignores .aidd', async () => {
		expect(await aiddMetadataTracked(await makeRepo('ignored', '.aidd/\n'))).toBe(false);
	});

	test('reports tracked when feature metadata is committed', async () => {
		expect(await aiddMetadataTracked(await makeRepo('tracked', 'node_modules/\n'))).toBe(true);
	});

	// No git means no answer: the prompt must stay silent rather than assert either way.
	test('reports unknown outside a git repository', async () => {
		const root = await testTempDir('aidd-metadata-tracking-no-repo');
		expect(await aiddMetadataTracked(root)).toBeUndefined();
	});
});

describe('renderLaunchContext', () => {
	test('states the metadata is untracked and names the commands not to run', () => {
		const rendered = renderLaunchContext({ aiddMetadataUntracked: true }) ?? '';
		expect(rendered).toContain('not tracked by git');
		expect(rendered).toContain('git log');
		expect(rendered).toContain('git check-ignore');
	});

	test('says nothing when the metadata is tracked', () => {
		expect(renderLaunchContext({})).toBeUndefined();
		expect(renderLaunchContext({ aiddMetadataUntracked: false })).toBeUndefined();
	});
});
