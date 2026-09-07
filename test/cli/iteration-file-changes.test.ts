import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IterationDetails } from '../../cli/src/orchestrator/details.ts';
import type { GitCommitSummary } from '../../cli/src/orchestrator/run/types.ts';

import { gitCommitsFileChanges } from '../../cli/src/orchestrator/run/git-file-changes.ts';
import { resolveIterationFileChanges } from '../../cli/src/orchestrator/run/mode-file-changes.ts';
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

async function gitOut(dir: string, args: string[]): Promise<string> {
	const proc = Bun.spawn(['git', '-C', dir, ...args], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	await proc.exited;
	return (await new Response(proc.stdout).text()).trim();
}

// A repo with two commits: the first creates `kept.ts` and `dropped.ts`, the second creates
// `added.ts`, edits `kept.ts`, and deletes `dropped.ts`. Returns the two commits newest-first the
// way listGitCommits does.
async function makeRepo(name: string): Promise<{ hashes: string[]; projectDir: string }> {
	const root = await testTempDir(`iteration-file-changes-${name}`);
	const projectDir = join(root, 'project');
	await mkdir(projectDir, { recursive: true });
	await git(projectDir, ['init', '-q']);
	await git(projectDir, ['config', 'user.email', 'test@aidd.local']);
	await git(projectDir, ['config', 'user.name', 'aidd test']);
	await writeFile(join(projectDir, 'kept.ts'), 'export const kept = 1;\n');
	await writeFile(join(projectDir, 'dropped.ts'), 'export const dropped = 1;\n');
	await git(projectDir, ['add', '-A']);
	await git(projectDir, ['commit', '-q', '-m', 'first']);
	const first = await gitOut(projectDir, ['rev-parse', 'HEAD']);
	await writeFile(join(projectDir, 'added.ts'), 'export const added = 1;\n');
	await writeFile(join(projectDir, 'kept.ts'), 'export const kept = 2;\n');
	await git(projectDir, ['rm', '-q', 'dropped.ts']);
	await git(projectDir, ['add', '-A']);
	await git(projectDir, ['commit', '-q', '-m', 'second']);
	const second = await gitOut(projectDir, ['rev-parse', 'HEAD']);
	return { hashes: [second, first], projectDir };
}

function detailsWith(filesCreated: string[], filesEdited: string[]): IterationDetails {
	return { filesCreated, filesEdited } as unknown as IterationDetails;
}

function commits(hashes: string[]): GitCommitSummary[] {
	return hashes.map((hash) => ({ hash }) as unknown as GitCommitSummary);
}

describe('gitCommitsFileChanges', () => {
	test('splits the commits into creations and edits and drops deletions', async () => {
		const { hashes, projectDir } = await makeRepo('split');

		const changes = await gitCommitsFileChanges(projectDir, hashes);
		expect(changes.filesCreated.slice().sort()).toEqual(['added.ts', 'dropped.ts', 'kept.ts']);
		// kept.ts was created by one of these commits, so the later edit does not double-count it.
		expect(changes.filesEdited).toEqual([]);
	});

	test('a file created before the run and edited during it counts as edited', async () => {
		const { hashes, projectDir } = await makeRepo('edit-only');

		const changes = await gitCommitsFileChanges(projectDir, [hashes[0] as string]);
		expect(changes.filesCreated).toEqual(['added.ts']);
		expect(changes.filesEdited).toEqual(['kept.ts']);
	});

	test('an unknown hash contributes nothing rather than throwing', async () => {
		const { projectDir } = await makeRepo('unknown');

		expect(await gitCommitsFileChanges(projectDir, ['0'.repeat(40)])).toEqual({
			filesCreated: [],
			filesEdited: [],
		});
	});
});

describe('resolveIterationFileChanges', () => {
	// codex does every edit through the shell, so it emits no Write/Edit tool events at all: an
	// iteration that landed seven files across two commits recorded "touched nothing".
	test('falls back to the commits when neither the backend nor the mode reported files', async () => {
		const { hashes, projectDir } = await makeRepo('fallback');

		const changes = await resolveIterationFileChanges({
			commits: commits(hashes),
			details: detailsWith([], []),
			modeArtifacts: undefined,
			projectDir,
		});
		expect(changes.filesCreated.slice().sort()).toEqual(['added.ts', 'dropped.ts', 'kept.ts']);
	});

	test('backend-reported files suppress the fallback', async () => {
		const { hashes, projectDir } = await makeRepo('reported');

		const changes = await resolveIterationFileChanges({
			commits: commits(hashes),
			details: detailsWith([], ['kept.ts']),
			modeArtifacts: undefined,
			projectDir,
		});
		expect(changes).toEqual({ filesCreated: [], filesEdited: [] });
	});

	test('mode artifacts are returned as-is and suppress the fallback', async () => {
		const { hashes, projectDir } = await makeRepo('mode');

		const changes = await resolveIterationFileChanges({
			commits: commits(hashes),
			details: detailsWith([], []),
			modeArtifacts: { modeFilesCreated: ['spec.md'], modeFilesEdited: [] },
			projectDir,
		});
		expect(changes).toEqual({ filesCreated: ['spec.md'], filesEdited: [] });
	});

	test('no commits means nothing to fall back to', async () => {
		const { projectDir } = await makeRepo('no-commits');

		expect(
			await resolveIterationFileChanges({
				commits: [],
				details: detailsWith([], []),
				modeArtifacts: undefined,
				projectDir,
			}),
		).toEqual({ filesCreated: [], filesEdited: [] });
	});
});
