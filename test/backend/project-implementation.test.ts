import { describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Feature } from 'aidd-shared/metadata/features';
import type { Roadmap } from 'aidd-shared/metadata/roadmap';
import { FileAiddStore } from 'aidd-shared/metadata/store';

import type { RunLaunchRequest } from '../../backend/src/types.ts';

import {
	evaluateProjectImplementationState,
	startProjectImplementation,
} from '../../backend/src/services/project/implementation.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

async function runGit(projectDir: string, args: string[]): Promise<void> {
	const child = Bun.spawn(['git', ...args], {
		cwd: projectDir,
		env: {
			...process.env,
			GIT_AUTHOR_EMAIL: 'aidd-test@example.invalid',
			GIT_AUTHOR_NAME: 'aidd Test',
			GIT_COMMITTER_EMAIL: 'aidd-test@example.invalid',
			GIT_COMMITTER_NAME: 'aidd Test',
		},
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if ((await child.exited) !== 0) throw new Error(`git ${args.join(' ')} failed`);
}

const features: Feature[] = [
	{
		directory: 'foundation',
		id: 'foundation',
		passes: false,
		priority: 1,
		status: 'backlog',
		title: 'Foundation',
	},
	{
		directory: 'later-feature',
		id: 'later-feature',
		passes: false,
		priority: 2,
		status: 'waiting_approval',
		title: 'Later feature',
	},
];

const roadmap: Roadmap = {
	features: {
		foundation: { milestone: 'MVP' },
		'later-feature': { milestone: 'v1.0' },
	},
	milestones: { MVP: { priority: 1 }, 'v1.0': { priority: 2 } },
};

describe('project implementation readiness', () => {
	test('identifies a valid persisted blueprint and its first runnable MVP feature', () => {
		const state = evaluateProjectImplementationState('coding', features, roadmap);

		expect(state.state).toBe('blueprint_ready');
		expect(state.blueprintReady).toBe(true);
		expect(state.firstFeature?.directory).toBe('foundation');
	});

	test('blocks a blueprint whose post-MVP status is implementation-ready', () => {
		const state = evaluateProjectImplementationState(
			'coding',
			features.map((feature) =>
				feature.id === 'later-feature' ? { ...feature, status: 'backlog' } : feature,
			),
			roadmap,
		);

		expect(state.state).toBe('blocked');
		expect(state.reason).toContain('post-MVP');
	});

	test('starts only the identified first feature from a coding-ready blueprint', async () => {
		const projectDir = await testTempDir('aidd-project-implementation-');
		const store = new FileAiddStore(projectDir);
		const calls: RunLaunchRequest[] = [];
		try {
			await mkdir(join(projectDir, '.aidd'), { recursive: true });
			await writeFile(join(projectDir, '.aidd', 'spec.md'), '# Spec\n');
			await writeFile(join(projectDir, '.aidd', 'CHANGELOG.md'), '# Changelog\n');
			for (const feature of features) await store.writeFeature(feature);
			await store.writeRoadmap(roadmap);
			await runGit(projectDir, ['init']);
			await runGit(projectDir, ['add', '.']);
			await runGit(projectDir, ['commit', '-m', 'chore: commit blueprint']);

			const result = await startProjectImplementation(projectDir, {}, async (request) => {
				calls.push(request);
				return { id: 'run-first-feature' };
			});

			expect(result.runId).toBe('run-first-feature');
			expect(calls).toEqual([{ feature: 'foundation', mode: 'coding', projectDir }]);
		} finally {
			await removeTempTree(projectDir);
		}
	});
});
