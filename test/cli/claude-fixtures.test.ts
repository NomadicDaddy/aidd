import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentEvent } from 'aidd-shared/backends/types';
import { parsePlainBackendOutput } from 'aidd-shared/backends/parsers/plain';
import { extractIterationDetails } from '../../cli/src/orchestrator/details.ts';
import { extractStructuredResult, metricsFromEvents } from 'aidd-shared/orchestrator/result';

const claudeFixtures = join(import.meta.dir, '..', 'fixtures', 'backends', 'claude-code');

async function readFixture(name: string): Promise<{ events: AgentEvent[]; exitCode: number }> {
	const dir = join(claudeFixtures, name);
	const stdout = await readFile(join(dir, 'stdout.txt'), 'utf8').catch(() => '');
	const stderr = await readFile(join(dir, 'stderr.txt'), 'utf8').catch(() => '');
	const exitCode = Number(await readFile(join(dir, 'exit-code.txt'), 'utf8'));
	return { events: parsePlainBackendOutput(stdout, stderr, exitCode), exitCode };
}

describe('claude-code stream regression fixtures', () => {
	test('clean command output records a passing check with no errors', async () => {
		const { events, exitCode } = await readFixture('clean-command');
		const details = extractIterationDetails(events, exitCode);

		expect(details.errors).toEqual([]);
		expect(details.summary.finalChecks.typecheck).toBe('passed');
		expect(details.commands).toContain('bun run typecheck');
	});

	test('non-zero command failure is classified as a typescript error', async () => {
		const { events, exitCode } = await readFixture('command-failure');
		const details = extractIterationDetails(events, exitCode);

		expect(details.summary.finalChecks.typecheck).toBe('failed');
		expect(details.summary.hasTypeErrors).toBe(true);
		expect(details.errors.map((entry) => entry.type)).toContain('typescript');
	});

	test('tool-use records populate file-change tracking and canonical breakdown', async () => {
		const { events, exitCode } = await readFixture('tool-use-records');
		const details = extractIterationDetails(events, exitCode);
		const metrics = metricsFromEvents(events);

		expect(details.filesRead).toEqual(['src/a.ts']);
		expect(details.filesEdited).toEqual(['src/a.ts']);
		expect(details.filesCreated).toEqual(['src/b.ts']);
		expect(details.errors).toEqual([]);
		expect(metrics.toolBreakdown).toEqual({
			read: 1,
			grep: 1,
			edit: 1,
			write: 1,
			bash: 1,
		});
		expect(metrics.filesEditedCount).toBe(1);
		expect(metrics.filesCreatedCount).toBe(1);
	});

	test('commit creation surfaces the structured result marker', async () => {
		const { events } = await readFixture('commit-creation');

		expect(extractStructuredResult(events)).toEqual({
			featureId: 'feature-core',
			status: 'completed',
			passes: true,
		});
		const details = extractIterationDetails(events, 0);
		expect(details.errors).toEqual([]);
	});

	test('no-work iteration emits no structured result and no errors', async () => {
		const { events, exitCode } = await readFixture('no-work');
		const details = extractIterationDetails(events, exitCode);

		expect(extractStructuredResult(events)).toBeUndefined();
		expect(details.errors).toEqual([]);
		expect(details.commands).toContain('git log --oneline -5');
	});

	test('roadmap gate block is not misclassified as an error', async () => {
		const { events, exitCode } = await readFixture('roadmap-gate-block');
		const details = extractIterationDetails(events, exitCode);
		const metrics = metricsFromEvents(events);

		expect(extractStructuredResult(events)).toBeUndefined();
		expect(details.errors).toEqual([]);
		expect(metrics.toolCallCount).toBe(0);
	});

	test('orphan recovery reports both commits and completes the feature', async () => {
		const { events, exitCode } = await readFixture('orphan-recovery');
		const details = extractIterationDetails(events, exitCode);
		const metrics = metricsFromEvents(events);

		expect(metrics.toolBreakdown.bash).toBe(3);
		expect(
			details.commands.some((command) => command.includes('recover prior orphaned work'))
		).toBe(true);
		expect(details.commands.some((command) => command.includes('implement feature-core'))).toBe(
			true
		);
		expect(extractStructuredResult(events)).toEqual({
			featureId: 'feature-core',
			status: 'completed',
			passes: true,
		});
		expect(details.errors).toEqual([]);
	});
});
