import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import type { CycleExecutorDeps } from '../../backend/src/services/director/cycleExecutor.ts';

import { runTextOnlyChatTurn } from '../../backend/src/services/director/chatTextTurn.ts';
import { runDirectCycle } from '../../backend/src/services/director/cycleExecutor.ts';
import { directAiServesProfile } from '../../backend/src/services/director/helpers.ts';
import { testTempDir } from '../_helpers/temp.ts';
import { removeTempTree } from './_helpers/remove-temp-tree.ts';

// Phillip #30547: he set the Director's CLI to Codex and the cycle still went to Direct AI.
const fleetSummary = { fleetAggregations: { fleetHealthScore: 90 }, projects: [] } as never;

function cycleDeps(backend: string, calls: string[]): CycleExecutorDeps {
	return {
		chatService: { recentChatMessages: async () => [] },
		db: {
			select() {
				throw new Error('no database in this test');
			},
		},
		deleteActiveStage() {},
		directAiService: {
			async completeJson() {
				calls.push('direct');
				throw new Error('test request failed: HTTP 503 upstream unavailable');
			},
			isSurfaceEnabled: () => true,
			resolveSurfaceMeta: () => ({ model: 'm', provider: 'test', reasoningEffort: 'low' }),
		},
		disposed: () => false,
		getConfig: () => ({ web: { dataDir: join(import.meta.dir) } }),
		persistCycleResult: async () => {},
		profileService: { getProfile: async () => ({ backend, reasoningEffort: 'low' }) },
		setCycleStage() {},
	} as unknown as CycleExecutorDeps;
}

describe("the Director Profile's CLI", () => {
	test('Direct AI serves only a Native profile, and only with its surface on', () => {
		const on = { isSurfaceEnabled: () => true };
		const off = { isSurfaceEnabled: () => false };
		expect(directAiServesProfile(on, 'directorCycle', { backend: 'native' })).toBe(true);
		expect(directAiServesProfile(off, 'directorCycle', { backend: 'native' })).toBe(false);
		expect(directAiServesProfile(on, 'directorChat', { backend: 'codex' })).toBe(false);
		expect(directAiServesProfile(on, 'directorChat', { backend: 'claude-code' })).toBe(false);
	});

	test('a cycle on a named CLI never asks Direct AI, even with its surface on', async () => {
		const calls: string[] = [];
		const result = await runDirectCycle(
			cycleDeps('codex', calls),
			'cycle',
			'out.json',
			fleetSummary,
			undefined,
		);
		expect(calls).toEqual([]);
		expect(result).toEqual({ directAiError: null, output: null });
	});

	test('a cycle on a Native profile still asks Direct AI', async () => {
		const calls: string[] = [];
		await runDirectCycle(
			cycleDeps('native', calls),
			'cycle',
			'out.json',
			fleetSummary,
			undefined,
		);
		expect(calls).toEqual(['direct']);
	});

	test('a chat turn on a named CLI goes to that CLI, not Direct AI', async () => {
		const asked: string[] = [];
		const stop = new Error('reached the CLI');
		const dataDir = await testTempDir('aidd-director-chat-');
		try {
			await expect(
				runTextOnlyChatTurn(
					{
						backendFactory: (name: string) => {
							asked.push(name);
							throw stop;
						},
						directAiService: {
							completeText: async () => {
								asked.push('direct');
								return 'reply';
							},
							isSurfaceEnabled: () => true,
						},
						getConfig: () => ({ web: { dataDir } }),
					} as never,
					{
						backend: 'codex',
						instructions: '',
						model: null,
						reasoningEffort: 'low',
						role: 'r',
					} as never,
					fleetSummary,
					[],
				),
			).rejects.toBe(stop);
			expect(asked).toEqual(['codex']);
		} finally {
			await removeTempTree(dataDir);
		}
	});
});
