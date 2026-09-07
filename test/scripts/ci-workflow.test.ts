import { describe, expect, test } from 'bun:test';

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CI_WORKFLOW_TEST_INPUT } from '../../scripts/lib/smoke-cache/dependencies.ts';
import { SMOKE_QC_STEPS } from '../../scripts/smoke-qc.ts';

interface PackageManifest {
	scripts?: Record<string, string>;
}

function workflowJob(workflow: string, jobName: string): string {
	const jobStart = workflow.indexOf(`    ${jobName}:`);
	if (jobStart < 0) throw new Error(`Workflow job not found: ${jobName}`);

	const remainingWorkflow = workflow.slice(jobStart + 1);
	const nextJobMatch = /\n {4}[\w-]+:\n/.exec(remainingWorkflow);
	const jobEnd = nextJobMatch?.index;
	return workflow.slice(jobStart, jobEnd === undefined ? undefined : jobStart + 1 + jobEnd);
}

const WORKFLOW_DIR = join('.github', 'workflows');

/**
 * Every job block in a workflow, keyed by `<file>:<job>`.
 *
 * Only the region after the top-level `jobs:` key is read, because the `on:` block uses the same
 * four-space indent for its trigger keys and would otherwise be collected as jobs.
 */
function workflowJobs(file: string, workflow: string): Map<string, string> {
	const jobsStart = workflow.indexOf('\njobs:\n');
	if (jobsStart < 0) throw new Error(`Workflow has no jobs section: ${file}`);
	const jobsSection = workflow.slice(jobsStart);

	const blocks = new Map<string, string>();
	const names = [...jobsSection.matchAll(/^ {4}([\w-]+):$/gm)];
	names.forEach((match, index) => {
		const start = match.index;
		const end = names[index + 1]?.index;
		blocks.set(`${file}:${match[1]}`, jobsSection.slice(start, end));
	});
	return blocks;
}

describe('CI workflow', () => {
	test('derives the quality job from the canonical runner and retains the Windows browser crawl', async () => {
		const workflow = (
			await readFile(join(process.cwd(), CI_WORKFLOW_TEST_INPUT), 'utf8')
		).replaceAll('\r\n', '\n');
		const quality = workflowJob(workflow, 'quality');
		const browserSmoke = workflowJob(workflow, 'browser-smoke');
		const manifest = JSON.parse(
			await readFile(join(process.cwd(), 'package.json'), 'utf8'),
		) as PackageManifest;

		expect(workflow).toContain('pull_request:\n        branches: [main]');
		expect(manifest.scripts?.['audit:dependencies']).toBe('bun audit');
		expect([...quality.matchAll(/^\s+run: (.+)$/gm)].map((match) => match[1])).toEqual([
			'bun install --frozen-lockfile',
			'bun run audit:dependencies',
			'bun run smoke:qc',
		]);
		expect(SMOKE_QC_STEPS.map((step) => step.name)).toContain('check:dead-code');
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
			browserSmoke.indexOf('- name: Stop web control panel'),
		);
		expect(cleanupStep.indexOf('if: always()')).toBeGreaterThan(-1);
		expect(cleanupStep.indexOf('bun run stop:web')).toBeGreaterThan(
			cleanupStep.indexOf('if: always()'),
		);
	});

	// A deploy job that only calls a marketplace action still occupies a runner until GitHub's
	// six-hour ceiling when the action hangs, which is how the Pages job sat unbounded: it has no
	// `run:` step, so a check that looked at commands would never have covered it. Every job in
	// every workflow is required to carry its own bound, deployment-only jobs included.
	test('bounds every job in every workflow with timeout-minutes', async () => {
		const dir = join(process.cwd(), WORKFLOW_DIR);
		const files = (await readdir(dir)).filter((name) => name.endsWith('.yml')).sort();
		expect(files).toContain('pages.yml');

		const unbounded: string[] = [];
		let jobCount = 0;
		for (const file of files) {
			const workflow = (await readFile(join(dir, file), 'utf8')).replaceAll('\r\n', '\n');
			for (const [name, block] of workflowJobs(file, workflow)) {
				jobCount += 1;
				if (!/^ {8}timeout-minutes: \d+$/m.test(block)) unbounded.push(name);
			}
		}

		expect(unbounded).toEqual([]);
		expect(jobCount).toBeGreaterThanOrEqual(4);
	});
});
