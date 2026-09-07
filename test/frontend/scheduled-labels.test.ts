import type {
	ScheduledTaskExecution,
	ScheduledTaskSchedule,
} from 'aidd-shared/contracts/scheduled-tasks';

import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import { formatDate } from '../../frontend/src/lib/formatters.ts';
import { directorCycleCadence } from '../../frontend/src/pages/director/directorCycleCadence.ts';
import {
	advancedScheduleDescription,
	nextRunLabel,
	occurrenceProjectsLabel,
	projectScopeLabel,
	scheduleSummary,
} from '../../frontend/src/pages/scheduled/scheduledLabels.ts';
import {
	buildSchedule,
	scheduleFormState,
	type ScheduleFormState,
	scheduleIssue,
} from '../../frontend/src/pages/scheduled/scheduleBuilder.ts';

function occurrence(
	projectScope: ScheduledTaskExecution['projectScope'],
	projectPaths: string[],
): Pick<ScheduledTaskExecution, 'projectPaths' | 'projectScope'> {
	return { projectPaths, projectScope };
}

function renderSchedulePreview(timestamp: number): string {
	const props = JSON.stringify({
		builder: 'once',
		cron: '0 9 * * *',
		issue: null,
		preview: [timestamp],
		previewDisabled: false,
		runAt: '2026-08-15T09:30',
		time: '09:30',
		timezone: 'Asia/Tokyo',
		weekdays: ['1'],
	});
	const script = [
		"import { createElement } from 'react';",
		"import { renderToStaticMarkup } from 'react-dom/server';",
		"import { ScheduleFields } from './src/pages/scheduled/ScheduleFields.tsx';",
		"import { ScheduledDraftContext } from './src/pages/scheduled/scheduledDraftContext.ts';",
		'const noop = () => undefined;',
		`const input = ${props};`,
		"const draft = { ...input, applyChanges: false, args: '', confirmed: false, launchTarget: {}, name: 'Preview', parameters: {}, projects: [], projectScope: 'all', targetId: 'preview', targetType: 'skill' };",
		'const fields = createElement(ScheduleFields, { issue: input.issue, preview: input.preview, previewDisabled: input.previewDisabled, onCronBlur: noop, onPreview: noop, onScheduleChange: noop, onValidate: noop });',
		'console.log(renderToStaticMarkup(createElement(ScheduledDraftContext, { value: { draft, patch: noop } }, fields)));',
	].join('\n');
	const result = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: resolve(import.meta.dir, '../../frontend'),
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
	return new TextDecoder().decode(result.stdout);
}

function expectCronRoundTrip(expression: string, builder: 'advanced' | 'daily' | 'weekly'): void {
	const schedule: ScheduledTaskSchedule = { expression, kind: 'cron', timezone: 'UTC' };
	const state = scheduleFormState(schedule);
	expect(state.builder).toBe(builder);
	expect(buildSchedule(state)).toEqual(schedule);
}

describe('scheduled task cadence decoding', () => {
	test('describes the built-in stepped-hour cadence without changing its builder', () => {
		expect(advancedScheduleDescription('0 */12 * * *')).toBe('Every 12 hours, on the hour.');
		expect(advancedScheduleDescription('30 */6 * * *')).toBe(
			'Every 6 hours, at 30 minutes past the hour.',
		);
		expect(advancedScheduleDescription('1 */1 * * *')).toBe(
			'Every 1 hour, at 1 minute past the hour.',
		);
		expect(advancedScheduleDescription('0,30 9 * * *')).toBeNull();
		expect(advancedScheduleDescription('60 */12 * * *')).toBeNull();
		expect(advancedScheduleDescription('0 */0 * * *')).toBeNull();
	});

	test('Director uses prose when it can decode cadence and marks raw fallback as machine text', () => {
		expect(
			directorCycleCadence({
				expression: '0 */12 * * *',
				kind: 'cron',
				timezone: 'America/Chicago',
			}),
		).toEqual({ label: 'Every 12 hours, on the hour.', machineValue: false });
		expect(
			directorCycleCadence({
				expression: '0,30 9 * * *',
				kind: 'cron',
				timezone: 'America/Chicago',
			}),
		).toEqual({
			label: '0,30 9 * * * · America/Chicago',
			machineValue: true,
		});
	});

	test('keeps stepped, listed, and ranged fields in the advanced cron builder', () => {
		expectCronRoundTrip('0 */12 * * *', 'advanced');
		expectCronRoundTrip('*/15 * * * *', 'advanced');
		expectCronRoundTrip('0,30 9 * * *', 'advanced');
		expectCronRoundTrip('0 9-17 * * *', 'advanced');
	});

	test('round-trips plain daily and weekly expressions without rewriting them', () => {
		expectCronRoundTrip('0 0 * * *', 'daily');
		expectCronRoundTrip('30 14 * * 1,3,5', 'weekly');
	});
});

describe('scheduled task schedule validation', () => {
	function state(overrides: Partial<ScheduleFormState>): ScheduleFormState {
		return {
			builder: 'daily',
			cron: '0 9 * * *',
			runAt: '',
			time: '09:00',
			timezone: 'UTC',
			weekdays: ['1'],
			...overrides,
		};
	}

	// Each of these assembled a malformed expression — "00  * * *", "30 09 * * " — and the operator
	// got "Cron expressions must contain exactly five fields." back from the backend, naming a field
	// the structured builders never show.
	test('names the unfilled field instead of assembling a malformed cron', () => {
		expect(scheduleIssue(state({ time: '' }))).toEqual({
			field: 'time',
			message: 'Choose a time.',
		});
		expect(scheduleIssue(state({ builder: 'weekly', time: '' }))).toEqual({
			field: 'time',
			message: 'Choose a time.',
		});
		expect(scheduleIssue(state({ builder: 'weekly', weekdays: [] }))).toEqual({
			field: 'weekdays',
			message: 'Select at least one weekday.',
		});
		expect(scheduleIssue(state({ builder: 'advanced', cron: '   ' }))).toEqual({
			field: 'cron',
			message: 'Enter a cron expression.',
		});
		expect(scheduleIssue(state({ builder: 'once', runAt: '' }))).toEqual({
			field: 'runAt',
			message: 'Choose a date and time.',
		});
	});

	test('passes a fully filled schedule of every cadence', () => {
		expect(scheduleIssue(state({}))).toBeNull();
		expect(scheduleIssue(state({ builder: 'weekly', weekdays: ['0', '6'] }))).toBeNull();
		expect(scheduleIssue(state({ builder: 'advanced', cron: '*/15 * * * *' }))).toBeNull();
		expect(scheduleIssue(state({ builder: 'once', runAt: '2026-09-01T09:00' }))).toBeNull();
	});

	test('refuses to build a schedule the backend would reject', () => {
		expect(() => buildSchedule(state({ time: '' }))).toThrow('Choose a time.');
		expect(() => buildSchedule(state({ builder: 'weekly', weekdays: [] }))).toThrow(
			'Select at least one weekday.',
		);
	});
});

describe('scheduled task labels', () => {
	test('renders schedule timestamps in and names the task timezone', () => {
		const instant = new Date('2026-08-15T00:30:32.000Z');
		const timestamp = instant.getTime();
		expect(nextRunLabel(timestamp, 'Asia/Tokyo')).toBe(
			`${formatDate(timestamp, 'Asia/Tokyo')} · Asia/Tokyo`,
		);
		expect(
			scheduleSummary({
				kind: 'once',
				runAt: instant.toISOString(),
				timezone: 'Asia/Tokyo',
			}),
		).toBe(`Once at ${formatDate(timestamp, 'Asia/Tokyo')} · Asia/Tokyo`);
		expect(formatDate(timestamp, 'Asia/Tokyo')).not.toBe(
			formatDate(timestamp, 'America/Chicago'),
		);
		expect(nextRunLabel(timestamp, 'Asia/Tokyo')).not.toContain(':32');
	});

	test('renders preview occurrences in the selected timezone across a viewer-day boundary', () => {
		const timestamp = Date.parse('2026-08-15T00:30:32.000Z');
		const markup = renderSchedulePreview(timestamp);

		expect(markup).toContain(formatDate(timestamp, 'Asia/Tokyo'));
		expect(markup).toContain('· Asia/Tokyo</li>');
		expect(markup).not.toContain(formatDate(timestamp, 'America/Chicago'));
	});

	test('names each project scope on the task card', () => {
		expect(projectScopeLabel('all', 0)).toBe('all projects');
		expect(projectScopeLabel('none', 0)).toBe('no project');
		expect(projectScopeLabel('explicit', 1)).toBe('1 project');
		expect(projectScopeLabel('explicit', 3)).toBe('3 projects');
	});

	test('tells a no-project occurrence apart from a discovery failure', () => {
		// Both snapshots are empty. Only the scope says which one ran as designed.
		expect(occurrenceProjectsLabel(occurrence('none', []))).toBe('No project. Ran once.');
		expect(occurrenceProjectsLabel(occurrence('all', []))).toBe('No projects were available.');
	});

	test('lists the paths an occurrence actually attempted', () => {
		expect(occurrenceProjectsLabel(occurrence('all', ['D:/one', 'D:/two']))).toBe(
			'D:/one, D:/two',
		);
		expect(occurrenceProjectsLabel(occurrence('explicit', ['D:/one']))).toBe('D:/one');
	});
});
