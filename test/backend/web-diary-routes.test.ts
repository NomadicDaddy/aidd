import { describe, expect, test } from 'bun:test';

import type { WebContext } from '../../backend/src/context.ts';

import { createDiaryRoutes } from '../../backend/src/routes/diary.ts';

const sampleEntry = {
	bodyMd: '# Title',
	date: '2026-06-12',
	generatedBy: null,
	id: '2026-06-12|d:\\applications\\demo',
	phase: 'Backend',
	projectId: 'ZDovYXBwbGljYXRpb25zL2RlbW8',
	projectName: 'demo',
	projectPath: 'd:/applications/demo',
	summary: null,
	title: 'Title',
};

const sampleItem = {
	completedAt: null,
	detail: null,
	durationMs: null,
	id: 'run_a',
	kind: 'run',
	mode: 'coding',
	projectName: 'demo',
	projectPath: 'd:/applications/demo',
	startedAt: 3000,
	status: 'completed',
	title: 'coding · demo',
};

function appWith(calls: { entries: unknown[]; timeline: unknown[] }) {
	return createDiaryRoutes({
		diaryService: {
			listEntriesPage: async (options: unknown) => {
				calls.entries.push(options);
				return { items: [sampleEntry], nextCursor: 'cursor-1' };
			},
			listTimelinePage: async (options: unknown) => {
				calls.timeline.push(options);
				return { items: [sampleItem], nextCursor: null };
			},
		},
	} as unknown as WebContext);
}

describe('diary routes', () => {
	test('GET /entries returns entries + nextCursor and forwards options', async () => {
		const calls = { entries: [] as unknown[], timeline: [] as unknown[] };
		const app = appWith(calls);
		const response = await app.handle(
			new Request(
				'http://localhost/api/v1/diary/entries?projectPath=d:/applications/demo&limit=10'
			)
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ entries: [sampleEntry], nextCursor: 'cursor-1' });
		expect(calls.entries).toEqual([{ limit: 10, projectPath: 'd:/applications/demo' }]);
	});

	test('GET /timeline returns items + nextCursor', async () => {
		const calls = { entries: [] as unknown[], timeline: [] as unknown[] };
		const app = appWith(calls);
		const response = await app.handle(new Request('http://localhost/api/v1/diary/timeline'));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ items: [sampleItem], nextCursor: null });
		expect(calls.timeline).toEqual([{}]);
	});

	test('rejects an out-of-range limit', async () => {
		const calls = { entries: [] as unknown[], timeline: [] as unknown[] };
		const app = appWith(calls);
		const response = await app.handle(
			new Request('http://localhost/api/v1/diary/entries?limit=9999')
		);
		expect(response.status).toBe(422);
	});
});
