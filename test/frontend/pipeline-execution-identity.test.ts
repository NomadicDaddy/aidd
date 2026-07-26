import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const frontendRoot = resolve(import.meta.dir, '../../frontend/src');

describe('pipeline execution identity presentation', () => {
	test('shows the exact child-run identity in compact and report step rows', async () => {
		const [compactRows, reportRows] = await Promise.all([
			readFile(resolve(frontendRoot, 'pages/runs/PipelineStepSubRows.tsx'), 'utf8'),
			readFile(resolve(frontendRoot, 'pages/pipelineSessions/StepRows.tsx'), 'utf8'),
		]);

		for (const source of [compactRows, reportRows]) {
			expect(source).toContain('ExecutionIdentityBadges');
			expect(source).toContain('step.executionIdentity');
		}
	});
});
