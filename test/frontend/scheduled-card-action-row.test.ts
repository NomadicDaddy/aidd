import type { ScheduledTask } from 'aidd-shared/contracts/scheduled-tasks';

import { expect, test } from 'bun:test';

import { canResumeScheduledTask } from '../../frontend/src/pages/scheduled/scheduledTaskActions.ts';

async function cardSource(): Promise<string> {
	return await Bun.file('frontend/src/pages/scheduled/ScheduledTaskCard.tsx').text();
}

test('Scheduled card actions respond to card width without shrinking controls', async () => {
	const card = await cardSource();
	const footer = card.slice(
		card.indexOf('mt-auto flex max-w-[58rem] flex-col'),
		card.indexOf('scheduled-occurrence-disclosure'),
	);
	expect(card).toContain("const cardClass = cn('@container flex flex-col gap-3'");
	expect(card).toContain("expanded && 'lg:col-span-full'");
	expect(card).not.toContain('setWidened');
	expect(card).toContain('mt-auto flex max-w-[58rem] flex-col gap-2 border-t');
	expect(card).toContain('className="flex flex-wrap gap-2"');
	expect(card).toContain('className="flex w-full items-center gap-2 self-start"');
	expect(card).toContain('className="ml-auto"');
	expect(footer).not.toContain('@min-[32rem]');
	expect(footer).not.toContain('self-end');
	expect(card).toContain('ariaLabel={`Open actions for ${task.name}`}');
	expect(card).toContain("'data-tone': 'danger' as const");
	expect(footer).not.toContain('size="compact"');
});

test('Scheduled task identifiers preserve their full value while fitting narrow cards', async () => {
	const card = await cardSource();
	expect(card).toContain('const TASK_IDENTIFIER_START_LENGTH = 16;');
	expect(card).toContain('const TASK_IDENTIFIER_END_LENGTH = 8;');
	expect(card).toContain("const TASK_IDENTIFIER_PREFIX = 'scheduled_task_';");
	expect(card).toContain('id.slice(TASK_IDENTIFIER_PREFIX.length)');
	expect(card).toContain('if (expanded) return displayId;');
	expect(card).toContain(
		'`${displayId.slice(0, TASK_IDENTIFIER_START_LENGTH)}…${displayId.slice(-TASK_IDENTIFIER_END_LENGTH)}`',
	);
	expect(card).toContain(
		'identifier={<span title={task.id}>{taskIdentifierLabel(task.id, expanded)}</span>}',
	);
});

function scheduledTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
	return {
		archivedAt: null,
		createdAt: 1,
		id: 'task-1',
		name: 'Nightly sweep',
		nextRunAt: null,
		projects: [],
		projectScope: 'all',
		schedule: { expression: '0 2 * * *', kind: 'cron', timezone: 'UTC' },
		state: 'paused',
		systemKey: null,
		target: {
			args: '',
			executionIntent: 'review-only',
			skillId: 'hygiene',
			type: 'skill',
		},
		updatedAt: 1,
		...overrides,
	};
}

test('Resume appears only when a paused or completed task has a future occurrence', async () => {
	const now = Date.parse('2026-08-30T12:00:00.000Z');
	const futureOnce = {
		kind: 'once' as const,
		runAt: '2026-08-31T12:00:00.000Z',
		timezone: 'UTC',
	};
	const elapsedOnce = {
		kind: 'once' as const,
		runAt: '2026-08-29T12:00:00.000Z',
		timezone: 'UTC',
	};

	expect(canResumeScheduledTask(scheduledTask(), now)).toBe(true);
	expect(canResumeScheduledTask(scheduledTask({ state: 'completed' }), now)).toBe(true);
	expect(canResumeScheduledTask(scheduledTask({ schedule: futureOnce }), now)).toBe(true);
	expect(
		canResumeScheduledTask(scheduledTask({ schedule: futureOnce, state: 'completed' }), now),
	).toBe(true);
	expect(
		canResumeScheduledTask(scheduledTask({ schedule: elapsedOnce, state: 'completed' }), now),
	).toBe(false);
	expect(
		canResumeScheduledTask(scheduledTask({ schedule: futureOnce, state: 'active' }), now),
	).toBe(false);

	const card = await cardSource();
	expect(card).toContain('const canResume = canResumeScheduledTask(task);');
	expect(card).toContain(') : canResume ? (');
	expect(card).not.toContain("task.state === 'paused' || task.state === 'completed'");
});
