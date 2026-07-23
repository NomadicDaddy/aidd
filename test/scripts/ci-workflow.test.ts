import { describe, expect, test } from 'bun:test';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CI_WORKFLOW_TEST_INPUT } from '../../scripts/lib/smoke-cache/dependencies.ts';
import { SMOKE_QC_STEPS } from '../../scripts/smoke-qc.ts';

function workflowJob(workflow: string, jobName: string): string {
	const jobStart = workflow.indexOf(`    ${jobName}:`);
	if (jobStart < 0) throw new Error(`Workflow job not found: ${jobName}`);

	const remainingWorkflow = workflow.slice(jobStart + 1);
	const nextJobMatch = /\n {4}[\w-]+:\n/.exec(remainingWorkflow);
	const jobEnd = nextJobMatch?.index;
	return workflow.slice(jobStart, jobEnd === undefined ? undefined : jobStart + 1 + jobEnd);
}

describe('CI workflow', () => {
	test('derives the quality job from the canonical runner and retains the Windows browser crawl', async () => {
		const workflow = (
			await readFile(join(process.cwd(), CI_WORKFLOW_TEST_INPUT), 'utf8')
		).replaceAll('\r\n', '\n');
		const quality = workflowJob(workflow, 'quality');
		const browserSmoke = workflowJob(workflow, 'browser-smoke');
		const releaseImage = workflowJob(workflow, 'release-image');

		expect(workflow).toContain('pull_request:\n        branches: [main]');
		expect([...quality.matchAll(/^\s+run: (.+)$/gm)].map((match) => match[1])).toEqual([
			'bun install --frozen-lockfile',
			'bun run smoke:qc',
		]);
		expect(SMOKE_QC_STEPS.map((step) => step.name)).toContain('check:dead-code');
		expect(releaseImage).toContain('runs-on: ubuntu-latest');
		expect(releaseImage).toContain('needs: quality');
		expect(releaseImage).toContain('bun run docker:build');
		expect(releaseImage).toContain('bun run check:image-licenses');
		expect(releaseImage.indexOf('bun run check:image-licenses')).toBeGreaterThan(
			releaseImage.indexOf('bun run docker:build')
		);
		expect(browserSmoke).toContain('runs-on: windows-latest');
		expect(browserSmoke).toContain('needs: quality');
		expect(browserSmoke).toContain('bun install --frozen-lockfile');
		expect(browserSmoke).toContain('bunx puppeteer browsers install');

		const buildIndex = browserSmoke.indexOf('bun run build:frontend');
		const startIndex = browserSmoke.indexOf('bun run start:web');
		const crawlIndex = browserSmoke.indexOf('bun run smoke:web');
		const stopIndex = browserSmoke.indexOf('bun run stop:web');

		expect(buildIndex).toBeGreaterThan(-1);
		expect(startIndex).toBeGreaterThan(buildIndex);
		expect(crawlIndex).toBeGreaterThan(startIndex);
		expect(stopIndex).toBeGreaterThan(crawlIndex);

		const cleanupStep = browserSmoke.slice(
			browserSmoke.indexOf('- name: Stop web control panel')
		);
		expect(cleanupStep.indexOf('if: always()')).toBeGreaterThan(-1);
		expect(cleanupStep.indexOf('bun run stop:web')).toBeGreaterThan(
			cleanupStep.indexOf('if: always()')
		);
	});
});
