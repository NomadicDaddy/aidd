import { describe, expect, test } from 'bun:test';

import { summarizeActiveRunsForProjects } from '../../backend/src/services/run/projectActiveRunSummaries.ts';

describe('project active-run summaries', () => {
	test('batches zero, one, and multiple active runs by project and keeps the newest run link', () => {
		const summaries = summarizeActiveRunsForProjects(
			['C:/projects/alpha', 'C:/projects/bravo', 'C:/projects/charlie'],
			[
				{ id: 'alpha-older', projectPath: 'C:\\projects\\alpha', startedAt: 10 },
				{ id: 'alpha-newest', projectPath: 'C:/projects/alpha', startedAt: 20 },
				{ id: 'bravo-run', projectPath: 'C:/projects/bravo', startedAt: 30 },
				{ id: 'alpha-newest', projectPath: 'C:/projects/alpha', startedAt: 20 },
			]
		);

		expect(summaries.get('C:/projects/alpha')).toEqual({
			count: 2,
			latestRunId: 'alpha-newest',
		});
		expect(summaries.get('C:/projects/bravo')).toEqual({ count: 1, latestRunId: 'bravo-run' });
		expect(summaries.get('C:/projects/charlie')).toEqual({ count: 0, latestRunId: null });
	});
});
