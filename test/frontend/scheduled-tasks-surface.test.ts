import type { ScheduledTask } from 'aidd-shared/contracts/scheduled-tasks';

import { expect, test } from 'bun:test';

import { NAV_DESTINATIONS } from '../../frontend/src/components/layout/nav-destinations.ts';
import { sessionStatusTone } from '../../frontend/src/pages/runs/pipelineSessionStatus.ts';
import {
	draftPresetFromParams,
	initialDraft,
	isDraftDirty,
	isScheduleDirty,
} from '../../frontend/src/pages/scheduled/scheduledDraft.ts';
import { countScheduledTasks } from '../../frontend/src/pages/scheduled/scheduledTaskCounts.ts';
import { buildScheduledTarget } from '../../frontend/src/pages/scheduled/targetBuilder.ts';

async function source(path: string): Promise<string> {
	return await Bun.file(path).text();
}

test('Scheduled is lazy-loaded, navigable, and covered by the crawl route contract', async () => {
	const [app, routes] = await Promise.all([
		source('frontend/src/App.tsx'),
		source('scripts/crawltest-data.ts'),
	]);
	expect(app).toContain("import('./pages/scheduled/ScheduledPage.tsx')");
	expect(app).toContain('scheduled: <ScheduledPage />');
	// The destination registry is the shell's single source of navigation, so assert the entry
	// itself rather than the icon-bearing view that reads it.
	expect(NAV_DESTINATIONS).toContainEqual({ label: 'Scheduled', to: '/scheduled' });
	expect(routes).toContain(
		"scheduled: { kind: 'static', route: FRONTEND_ROUTE_PATHS.scheduled }",
	);
});

test('Scheduled creation exposes timezone, mutation, project-scope, and preset controls', async () => {
	const [form, picker, safety, diary, recipes, skills, audits] = await Promise.all([
		source('frontend/src/pages/scheduled/ScheduledTaskForm.tsx'),
		source('frontend/src/pages/scheduled/ScheduledProjectPicker.tsx'),
		source('frontend/src/pages/scheduled/ScheduledSafetyFields.tsx'),
		source('frontend/src/pages/diary/DiaryPage.tsx'),
		source('frontend/src/pages/recipes/RecipeLaunchForm.tsx'),
		source('frontend/src/pages/skills/SkillDetailsCard.tsx'),
		source('frontend/src/pages/audits/AuditsPage.tsx'),
	]);
	expect(safety).toContain('defaultScope="per-project"');
	expect(safety).toContain('I understand this target may change project files unattended.');
	expect(form).toContain('<ScheduleFields');
	expect(form).toContain('<ScheduledTargetFields');
	// The scope drives the payload; an empty selection must never be re-derived as an intent.
	expect(form).toContain("projects: projectScope === 'explicit' ? projects : []");
	expect(picker).toContain('Runs once for every project discovered when each occurrence starts.');
	expect(picker).toContain('Runs exactly once with no project, from the applications root.');
	// The project list is hidden outside the explicit scope rather than shown greyed out.
	expect(picker).toContain("scope === 'explicit' && (");
	expect(diary).toContain('preset=diary');
	expect(recipes).toContain('/scheduled?type=recipe');
	expect(skills).toContain('/scheduled?type=skill');
	expect(audits).toContain('/scheduled?type=audit');
});

test('Scheduled forms expose guarded exits and explain forced recipe consent', async () => {
	const [actions, form, page, safety] = await Promise.all([
		source('frontend/src/pages/scheduled/ScheduledFormActions.tsx'),
		source('frontend/src/pages/scheduled/ScheduledTaskForm.tsx'),
		source('frontend/src/pages/scheduled/ScheduledPage.tsx'),
		source('frontend/src/pages/scheduled/ScheduledSafetyFields.tsx'),
	]);
	// The shell reads the draft it shares with the form. It must not hold a copy of `dirty`, and
	// the form must not push one up: a mirror updated from an effect is a render behind the value
	// it mirrors, so the first exit after the last keystroke is guarded by a stale answer.
	expect(form).toContain('useScheduledDraft()');
	expect(form).not.toContain('onDirtyChange');
	expect(form).not.toContain('useEffect');
	expect(page).toContain('const form = useScheduledDraft();');
	expect(page).not.toContain('formDirty');
	expect(page).not.toContain('onDirtyChange');
	expect(actions).toContain('onCancel');
	expect(actions).toContain('Cancel');
	expect(page).toContain('onCancel={requestClose}');
	expect(safety).toContain('Recipes can contain mutating steps');
	expect(safety).toContain('tone="amber"');
	expect(page).toContain("variant={form.open ? 'secondary' : 'primary'}");
	expect(page).toContain('<X aria-hidden="true"');
	// A clean form closes; a dirty one asks first; leaving the route asks the same question of the
	// same value; cancelling and confirming are both answered here.
	expect(page).toContain('if (form.dirty) setDiscardOpen(true);');
	expect(page).toContain('else discardForm();');
	expect(page).toContain('useUnsavedGuard(form.open && form.dirty)');
	expect(page).toContain('blocker.reset?.();');
	expect(page).toContain('if (discardOpen) discardForm();');
	expect(page).toContain('else blocker.proceed?.();');
	expect(page).toContain('title="Discard unsaved changes?"');
});

test('Cron validation and previews stay beside the schedule field', async () => {
	const [form, fields, feedback] = await Promise.all([
		source('frontend/src/pages/scheduled/ScheduledTaskForm.tsx'),
		source('frontend/src/pages/scheduled/ScheduleFields.tsx'),
		source('frontend/src/pages/scheduled/useScheduleFeedback.ts'),
	]);
	expect(form).toContain('onCronBlur={feedback.validateCron}');
	expect(form).toContain('feedback.pending');
	expect(feedback).toContain('setTimes(result.next)');
	expect(form).not.toContain('scheduled.preview.isPending');
	expect(form).not.toContain('toast.info(');
	expect(fields).toContain("error={errorFor('cron')}");
	expect(fields).toContain('props.onCronBlur();');
	expect(fields).toContain('onClick={props.onPreview}');
	expect(fields).toContain('scheduled-content-reveal');
	expect(fields).toContain('aria-live="polite"');
	expect(fields).toContain('space-y-1 font-mono text-sm');
	// The shared FieldRow owns row alignment now; this field no longer carries a local patch.
	expect(fields).not.toContain('className="content-start"');
	expect(fields).toContain('hint={');
	expect(fields).toContain(
		'className={`${compactFieldMeasureClass} rounded-md border border-border bg-muted p-3`}',
	);
});

// The daily and weekly builders assemble a cron expression the operator never sees, so an unfilled
// time or weekday set must be named on its own field — not sent and returned as "Cron expressions
// must contain exactly five fields.", which describes a field the form does not show.
test('An unfilled schedule field is named on the field, not sent to the backend', async () => {
	const [form, fields] = await Promise.all([
		source('frontend/src/pages/scheduled/ScheduledTaskForm.tsx'),
		source('frontend/src/pages/scheduled/ScheduleFields.tsx'),
	]);
	expect(form).toContain('const issue = scheduleIssue({ builder, cron, runAt, time, weekdays })');
	// Neither button may send a schedule the builder refuses to assemble, and an untouched
	// structured field stays visually neutral until the operator asks for validation.
	expect(form).toContain('issue: scheduleError');
	expect(form).toContain('if (scheduleError === null) feedback.request()');
	expect(form).toContain('scheduleTouched || feedback.cronError ? scheduleError : null');
	expect(form).toContain('(scheduleTouched && scheduleError !== null)');
	for (const field of ['runAt', 'time', 'weekdays']) {
		expect(fields).toContain(`errorFor('${field}')`);
	}
});

test('The built-in Director task is shown as built in on every surface that mentions it', async () => {
	const [card, form, targetFields, settings, director] = await Promise.all([
		source('frontend/src/pages/scheduled/ScheduledTaskCard.tsx'),
		source('frontend/src/pages/scheduled/ScheduledTaskForm.tsx'),
		source('frontend/src/pages/scheduled/ScheduledTargetFields.tsx'),
		source('frontend/src/pages/settings/DirectorAutoCycleSection.tsx'),
		source('frontend/src/pages/director/NextAutomaticCycle.tsx'),
	]);
	expect(card).toContain('<Badge tone="violet">System</Badge>');
	// The Archive button is not merely absent; the page says why, so the gap is explained rather
	// than left for the operator to work out.
	expect(card).toContain('Built in. Pause it instead of archiving.');
	expect(card).toContain('...(task.systemKey === null');
	expect(form).toContain('<ScheduledFixedTarget />');
	expect(targetFields).toContain('Director fleet cycle');
	// Both surfaces that show the cadence read the task and send the operator to it.
	for (const surface of [settings, director]) {
		expect(surface).toContain("systemKey === 'director'");
		expect(surface).toContain('to="/scheduled"');
	}
	expect(settings).not.toContain('directorAutoCycle');
});

test('The built-in target reads as a fixed field rather than a missing control', async () => {
	const [form, targetFields] = await Promise.all([
		source('frontend/src/pages/scheduled/ScheduledTaskForm.tsx'),
		source('frontend/src/pages/scheduled/ScheduledTargetFields.tsx'),
	]);
	const fixedTarget = targetFields.slice(
		targetFields.indexOf('export function ScheduledFixedTarget'),
		targetFields.indexOf('export function ScheduledTargetFields'),
	);
	expect(form).toContain('badge={system ? <Badge tone="violet">System</Badge> : undefined}');
	expect(form).toContain('identifier={system ? task?.id : undefined}');
	expect(form).toContain('<ScheduledFixedTarget />');
	expect(fixedTarget).toContain('aria-labelledby={labelId}');
	expect(fixedTarget).toContain('role="group"');
	expect(fixedTarget).toContain('grid gap-1 ${compactFieldMeasureClass}');
	expect(fixedTarget).toContain('border border-border bg-muted');
	expect(fixedTarget).toContain('<Lock aria-hidden="true"');
	expect(fixedTarget).toContain('<Badge className="bg-card" tone="neutral">');
	expect(fixedTarget).not.toContain('<label');
});

test('Occurrence history reads the scope the occurrence was claimed under', async () => {
	const [labels, occurrence] = await Promise.all([
		source('frontend/src/pages/scheduled/scheduledLabels.ts'),
		source('frontend/src/pages/scheduled/ScheduledOccurrence.tsx'),
	]);
	expect(occurrence).toContain('occurrenceProjectsLabel(execution)');
	expect(labels).toContain('execution.projectPaths.join');
});

test('Occurrence history stays compact, timed, labelled, and independently expandable', async () => {
	const [card, occurrence, page] = await Promise.all([
		source('frontend/src/pages/scheduled/ScheduledTaskCard.tsx'),
		source('frontend/src/pages/scheduled/ScheduledOccurrence.tsx'),
		source('frontend/src/pages/scheduled/ScheduledPage.tsx'),
	]);
	expect(card).toContain('aria-expanded={expanded}');
	expect(card).toContain('<DisclosureMarker open={expanded} />');
	expect(card).toContain('Occurrence history');
	expect(card).toContain("occurrences.length === 1 ? 'occurrence' : 'occurrences'");
	expect(occurrence).toContain('Duration {formatDuration(elapsed)}');
	expect(occurrence).toContain('occurrenceWindow(execution)');
	expect(occurrence).toContain('{humanizeEnum(execution.trigger)}');
	expect(occurrence).toContain("execution.projectPaths.length === 1 ? 'project' : 'projects'");
	expect(occurrence).not.toContain('projectBasename');
	expect(occurrence.match(/<FilePath/g)).toHaveLength(1);
	expect(occurrence).toContain('focus-visible:outline-2');
	expect(occurrence).toContain('focus-visible:outline-offset-2');
	expect(occurrence).toContain('focus-visible:outline-ring');
	expect(occurrence).toContain('{humanizeEnum(execution.status)}');
	expect(card).toContain('<span className="text-xs text-muted-foreground tabular-nums">');
	expect(page).toContain('const [expandedIds, setExpandedIds]');
	expect(page).toContain('expanded={expandedIds.has(task.id)}');
	expect(page).toContain('onToggleOccurrences={toggleOccurrences}');
	expect(page).not.toContain('selectedId === task.id');
});

test('Occurrence headers keep operational fields together without repeating same-day dates', async () => {
	const occurrence = await source('frontend/src/pages/scheduled/ScheduledOccurrence.tsx');
	expect(occurrence).toContain('@min-[58rem]:grid-cols-[7rem_17rem_9rem_minmax(8rem,1fr)_7rem]');
	expect(occurrence).toContain('@min-[58rem]:col-start-5');
	expect(occurrence).toContain('@min-[58rem]:col-span-full');
	expect(occurrence).toContain('sameLocalDay(execution.startedAt, execution.completedAt)');
	expect(occurrence).toContain('formatTimeOfDay(execution.startedAt)');
	expect(occurrence).toContain('<Badge className="justify-self-start" tone="neutral">');
});

test('Scheduled badges distinguish system identity, task state, and occurrence outcome', async () => {
	const [card, occurrence] = await Promise.all([
		source('frontend/src/pages/scheduled/ScheduledTaskCard.tsx'),
		source('frontend/src/pages/scheduled/ScheduledOccurrence.tsx'),
	]);
	expect(card).toContain('<Badge tone="violet">System</Badge>');
	expect(occurrence).toContain('tone={sessionStatusTone(execution.status)}');
	expect(card).toContain('tone={sessionStatusTone(lastOccurrence.status)}');
	expect(card).toContain('tone={TASK_STATE_TONES[task.state]}');
	expect(card).toContain('{humanizeEnum(task.state)}');
	expect(card).toContain('value={lastOccurrence.startedAt}');
	expect(card).toContain('value={task.nextRunAt}');
	expect(sessionStatusTone('completed')).toBe('emerald');
	expect(sessionStatusTone('completed_with_failures')).toBe('amber');
	expect(sessionStatusTone('failed')).toBe('red');
	expect(sessionStatusTone('queued')).toBe('teal');
	expect(sessionStatusTone('running')).toBe('teal');
	expect(sessionStatusTone('skipped')).toBe('amber');
});

test('Scheduled cards follow the catalog card layout and action contract', async () => {
	const [page, card] = await Promise.all([
		source('frontend/src/pages/scheduled/ScheduledPage.tsx'),
		source('frontend/src/pages/scheduled/ScheduledTaskCard.tsx'),
	]);
	expect(page).toContain('grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]');
	expect(page).not.toContain('items-start');
	expect(card).toContain('identifier={<span title={task.id}>');
	expect(card).toContain('{humanizeEnum(task.target.type)}');
	expect(card).toContain('{scheduleSummary(task.schedule)}');
	expect(card).toContain('advancedScheduleDescription(task.schedule.expression)');
	expect(card).toContain('const lastOccurrenceLabel = lastOccurrence');
	expect(card).toContain('mt-auto flex max-w-[58rem] flex-col gap-2 border-t');
	expect(card).not.toContain('@min-[20rem]:justify-between');
	expect(card).toContain('className="ml-auto"');
	expect(card).toContain('action(task.id, \'run\')} variant="secondary"');
	expect(card).toContain("'data-tone': 'danger' as const");
	for (const icon of ['ArchiveIcon', 'History', 'Pause', 'Pencil', 'Play', 'RotateCw']) {
		expect(card).toMatch(new RegExp(`<${icon}\\s+aria-hidden="true"`, 'u'));
	}
});

test('Scheduled results join the route reveal without replaying filter changes', async () => {
	const [card, control, page, reports, styles] = await Promise.all([
		source('frontend/src/pages/scheduled/ScheduledTaskCard.tsx'),
		source('frontend/src/components/ui/segmented-control.tsx'),
		source('frontend/src/pages/scheduled/ScheduledPage.tsx'),
		source('frontend/src/pages/projects/detail/ReportsTab.tsx'),
		source('frontend/src/index.css'),
	]);
	expect(page).toContain('data-scheduled-results=""');
	expect(page).toContain("resultsRevealed && '!animate-none'");
	expect(page).toContain("event.animationName === 'page-reveal-in'");
	expect(page).toContain('data-scheduled-form-motion=""');
	expect(card).toContain('data-scheduled-occurrences-motion=""');
	expect(page.match(/scheduled-content-reveal/g)).toHaveLength(2);
	expect(card).toContain('scheduled-occurrence-disclosure');
	expect(card).toContain('data-expanded={expanded}');
	expect(card).toContain('inert={!expanded}');
	expect(styles).not.toContain('.page-reveal > [data-scheduled-results]');
	expect(page).toContain('count,');
	expect(page).toContain('label: option.label');
	expect(control).toContain('count?: number | undefined;');
	expect(control).toContain('option.count === undefined');
	expect(control).toMatch(
		/isActive\s*\?\s*'text-raised-foreground'\s*:\s*'text-muted-foreground'/u,
	);
	expect(reports).toContain('filtered={visible.length}');
	expect(reports).toContain('total={ordered.length}');
	expect(reports).not.toContain("{ count: ordered.length, label: 'All', value: 'all' }");
	expect(styles).toContain(
		'animation: scheduled-content-reveal-in 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;',
	);
	expect(styles).toContain('grid-template-rows: 0fr;');
	expect(styles).toContain('grid-template-rows: 1fr;');
	expect(styles).toContain('--scheduled-reveal-margin-end: 1.25rem;');
	expect(styles).toContain('--scheduled-reveal-margin-start: -0.75rem;');
	expect(styles).toContain('animation-duration: 0.01ms !important;');
});

test('Scheduled reports filtered and per-state task counts from the loaded payload', async () => {
	const page = await source('frontend/src/pages/scheduled/ScheduledPage.tsx');
	const task = (state: 'active' | 'archived' | 'completed' | 'paused') => ({ state });
	const counts = countScheduledTasks([
		task('active'),
		task('active'),
		task('completed'),
		task('archived'),
	]);

	expect(counts).toEqual({ active: 2, archived: 1, completed: 1, paused: 0 });
	expect(page).toContain('const taskCounts = countScheduledTasks(allTasks)');
	expect(page).toContain('taskCounts[option.value]');
	expect(page).toContain('ariaLabel: option.label');
	expect(page).toContain('countAriaHidden: true');
	expect(page).toContain('aria-live="polite"');
	expect(page).toContain('className="sr-only"');
	expect(page).toContain('role="status"');
	expect(page).toContain('No ${filter} scheduled tasks to show');
	expect(page).toContain(
		"${tasks.length} ${filter} scheduled ${tasks.length === 1 ? 'task' : 'tasks'}",
	);
	expect(page).not.toContain('Showing ${tasks.length}');
	expect(page).not.toContain('ariaLabel: `${option.label}, ${count}');
	expect(page).toContain('Scheduled tasks appear here when they are {filter}.');
});

test('Scheduled machine strings use the mono face and shared timestamp formatter', async () => {
	const [children, fields, labels, occurrence] = await Promise.all([
		source('frontend/src/pages/scheduled/ScheduledOccurrenceChildren.tsx'),
		source('frontend/src/pages/scheduled/ScheduleFields.tsx'),
		source('frontend/src/pages/scheduled/scheduledLabels.ts'),
		source('frontend/src/pages/scheduled/ScheduledOccurrence.tsx'),
	]);
	expect(occurrence).toContain('`Started ${formatDate(execution.startedAt)}`');
	expect(occurrence).not.toContain('formatDate(execution.dueAt)');
	expect(occurrence).toContain('<FilePath className="break-all text-foreground" path={path} />');
	expect(children).toContain('font-mono text-xs text-muted-foreground');
	expect(occurrence).toContain('text-xs text-muted-foreground tabular-nums marker:content-none');
	expect(children).toContain("import { microLabelClass } from '../../lib/typography.ts';");
	expect(children).toContain('${microLabelClass} text-muted-foreground tabular-nums');
	expect(children).toContain('<span className="sr-only">{humanizeEnum(child.status)}: </span>');
	expect(children).not.toContain('underline underline-offset-2');
	// The three controls plus the persisted next-occurrence value use the machine-string face.
	expect(fields.match(/className="font-mono"/g)).toHaveLength(4);
	expect(fields).toContain('{formatZonedDate(value, draft.timezone)}');
	expect(labels).not.toContain('toLocaleString');
});

test('Scheduled bordered surfaces own their content measures', async () => {
	const [page, form, picker, scopeSafety] = await Promise.all([
		source('frontend/src/pages/scheduled/ScheduledPage.tsx'),
		source('frontend/src/pages/scheduled/ScheduledTaskForm.tsx'),
		source('frontend/src/pages/scheduled/ScheduledProjectPicker.tsx'),
		source('frontend/src/pages/scheduled/ScheduledScopeSafetySections.tsx'),
	]);
	expect(page).toContain('<EmptyState className={proseMeasureCardClass}>');
	expect(form).toContain('<Card className="space-y-3" variant="panel">');
	expect(form).not.toContain('scheduledFormCardMeasureClass');
	expect(scopeSafety).toContain('text-xs text-muted-foreground ${proseMeasureClass}');
	expect(picker).toContain('text-xs text-muted-foreground ${proseMeasureClass}');
});

test('Scheduled forms group fields and make every save gate visible', async () => {
	const [actions, control, fields, form, picker, safety, scopeSafety, section, target] =
		await Promise.all([
			source('frontend/src/pages/scheduled/ScheduledFormActions.tsx'),
			source('frontend/src/components/shared/LaunchTargetControl.tsx'),
			source('frontend/src/pages/scheduled/ScheduleFields.tsx'),
			source('frontend/src/pages/scheduled/ScheduledTaskForm.tsx'),
			source('frontend/src/pages/scheduled/ScheduledProjectPicker.tsx'),
			source('frontend/src/pages/scheduled/ScheduledSafetyFields.tsx'),
			source('frontend/src/pages/scheduled/ScheduledScopeSafetySections.tsx'),
			source('frontend/src/pages/scheduled/ScheduledFormSection.tsx'),
			source('frontend/src/pages/scheduled/ScheduledTargetFields.tsx'),
		]);
	for (const title of ['Task', 'Schedule']) {
		expect(form).toContain(`title="${title}"`);
	}
	expect(form).not.toContain('title="Actions"');
	for (const title of ['Projects', 'Safety']) {
		expect(scopeSafety).toContain(`title="${title}"`);
	}
	expect(section).toContain('border-t border-border');
	expect(section).toContain('<CardHeader');
	expect(section).toContain('level="subsection"');
	expect(scopeSafety).toContain('<div className="space-y-4">');
	expect(scopeSafety).not.toContain('sm:grid-cols-2');
	expect(safety).toContain('grid items-start gap-3 sm:grid-cols-2');
	expect(form).not.toContain('last-child:nth-child(odd)');
	expect(fields).not.toContain('last-child:nth-child(odd)');
	expect(picker).toContain('className="rounded-md border border-border bg-muted p-3"');
	expect(picker).toContain(
		'max-h-64 grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2 overflow-y-auto',
	);
	expect(picker).toContain('{projects.length} of {availableProjects.length} selected');
	expect(picker).toContain('onClick={() => onChange([])}');
	expect(form).toContain('placeholder="Nightly hygiene sweep"');
	expect(target).toContain('placeholder="--filter remediation-*"');
	expect(target).toContain('name: item.id');
	expect(target).toContain("targetType === 'skill' ? undefined : 'font-mono'");
	expect(fields).toContain('placeholder="0 2 * * 1-5"');
	expect(fields).toContain('advancedScheduleDescription(draft.cron)');
	expect(fields).toContain('Next occurrence');
	expect(target).toContain('<FieldRow label="Target" required>');
	expect(fields).toMatch(/label="Five-field cron"\s+required/u);
	expect(fields.indexOf('label="Cadence"')).toBeLessThan(fields.indexOf('label="Timezone"'));
	expect(fields.indexOf("error={errorFor('time')}")).toBeLessThan(
		fields.indexOf('label="Timezone"'),
	);
	expect(fields.indexOf("props.builder === 'weekly'")).toBeLessThan(
		fields.indexOf('Preview next five'),
	);
	expect(target.indexOf('label="Target type"')).toBeLessThan(
		target.indexOf('<FieldRow label="Target" required>'),
	);
	expect(target.indexOf('<FieldRow label="Target" required>')).toBeLessThan(
		target.indexOf('{nameField}'),
	);
	expect(safety).toContain('customBadge');
	expect(safety).toContain('label="Launch target"');
	expect(safety).toContain('size="default"');
	expect(safety.match(/<FieldCheckbox/g)).toHaveLength(2);
	expect(control).toContain('<Badge className="px-1.5 py-0.5" tone="teal">');
	expect(control).toContain('aria-controls={open ? panelId : undefined}');
	expect(control).toContain("!label.toLowerCase().endsWith('launch target')");
	expect(control).toContain("(label ?? 'Launch target')");
	expect(form).toContain('Boolean(task) && !dirty && !saveReadiness.blocked');
	expect(form).toContain(
		'className={`grid gap-3 sm:grid-cols-2 ${scheduledFormTwoColumnMeasureClass}`}',
	);
	expect(form).toContain('system && !scheduleDirty');
	expect(form).toContain('projectSelectionMissing');
	expect(actions).toContain('disabled={saveDisabled}');
	expect(actions).toContain('aria-describedby={saveDisabledReason ? saveReasonId : undefined}');
	expect(actions).toContain('{saveDisabledReason}');
	expect(actions).toContain(
		'flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-4',
	);
});

const NO_PRESET = draftPresetFromParams(new URLSearchParams());

function skillTask(): ScheduledTask {
	return {
		archivedAt: null,
		createdAt: 1,
		id: 'task-1',
		name: 'Nightly hygiene sweep',
		nextRunAt: 2,
		projects: [],
		projectScope: 'all',
		schedule: { expression: '0 2 * * *', kind: 'cron', timezone: 'UTC' },
		state: 'active',
		systemKey: null,
		target: {
			args: '--filter hygiene',
			executionIntent: 'apply-changes',
			skillId: 'hygiene',
			type: 'skill',
		},
		updatedAt: 1,
	};
}

// The dirty answer the shell guards exits with is derived from the one draft, so it is exact at the
// moment it is read rather than as of the last committed effect.
test('A scheduled draft is dirty exactly when a field differs from what it opened with', () => {
	const initial = initialDraft(skillTask(), NO_PRESET);

	// Clean close: an untouched edit form has nothing to lose and shows no dialog.
	expect(isDraftDirty(initial, initial)).toBe(false);
	// Dirty close: one keystroke is enough, with no render in between to catch up.
	expect(isDraftDirty({ ...initial, name: 'Nightly hygiene swee' }, initial)).toBe(true);
	// The consent checkbox is a change even though the task never carried it.
	expect(isDraftDirty({ ...initial, confirmed: true }, initial)).toBe(true);
	// Structural values compare by content, not by identity.
	expect(isDraftDirty({ ...initial, projects: [...initial.projects] }, initial)).toBe(false);
	expect(isDraftDirty({ ...initial, projects: ['D:/applications/aidd'] }, initial)).toBe(true);
	expect(isDraftDirty({ ...initial, parameters: { scope: 'all' } }, initial)).toBe(true);
	expect(isDraftDirty({ ...initial, launchTarget: { backend: 'codex' } }, initial)).toBe(true);
});

test('Cadence dirtiness is answered separately, since a built-in task may change only that', () => {
	const initial = initialDraft(skillTask(), NO_PRESET);

	expect(isScheduleDirty(initial, initial)).toBe(false);
	expect(isScheduleDirty({ ...initial, cron: '0 3 * * *' }, initial)).toBe(true);
	expect(isScheduleDirty({ ...initial, timezone: 'Europe/London' }, initial)).toBe(true);
	// A target edit is dirty, but it is not a cadence edit.
	const retargeted = { ...initial, targetId: 'diary-entry' };
	expect(isScheduleDirty(retargeted, initial)).toBe(false);
	expect(isDraftDirty(retargeted, initial)).toBe(true);
});

test('Opening the form seeds the draft from the task, or from the launch query string', () => {
	const editing = initialDraft(skillTask(), NO_PRESET);
	expect(editing.name).toBe('Nightly hygiene sweep');
	expect(editing.targetType).toBe('skill');
	expect(editing.targetId).toBe('hygiene');
	expect(editing.applyChanges).toBe(true);
	expect(editing.cron).toBe('0 2 * * *');
	// Consent is never inherited: an edit re-asks for it.
	expect(editing.confirmed).toBe(false);

	const diary = initialDraft(
		undefined,
		draftPresetFromParams(new URLSearchParams('preset=diary')),
	);
	expect(diary.name).toBe('Development diary');
	expect(diary.targetId).toBe('diary-entry');
	expect(diary.applyChanges).toBe(true);

	const recipe = initialDraft(
		undefined,
		draftPresetFromParams(new URLSearchParams('type=recipe&id=hygiene')),
	);
	expect(recipe.targetType).toBe('recipe');
	expect(recipe.targetId).toBe('hygiene');
	expect(recipe.name).toBe('');
});

// A directive is the one target with nothing to select, so the prompt is what the draft carries,
// what the form sends, and what an edit has to open with.
test('A directive draft round-trips its prompt through the form target it builds', () => {
	const directiveTask: ScheduledTask = {
		...skillTask(),
		target: {
			executionIntent: 'review-only',
			launchTarget: { backend: 'codex' },
			prompt: 'Summarize the open findings.',
			type: 'directive',
		},
	};
	const draft = initialDraft(directiveTask, NO_PRESET);

	expect(draft.targetType).toBe('directive');
	expect(draft.targetId).toBe('');
	expect(draft.prompt).toBe('Summarize the open findings.');
	expect(draft.applyChanges).toBe(false);
	// Editing only the prompt is a real edit, which a draft keyed on targetId alone would miss.
	expect(isDraftDirty({ ...draft, prompt: 'Summarize the closed findings.' }, draft)).toBe(true);

	expect(
		buildScheduledTarget({
			applyChanges: true,
			args: 'ignored',
			launchTarget: { backend: 'codex' },
			parameters: { ignored: 'yes' },
			prompt: '  Fix the failing lint rules.  ',
			targetId: '',
			targetType: 'directive',
		}),
	).toEqual({
		executionIntent: 'apply-changes',
		launchTarget: { backend: 'codex' },
		prompt: 'Fix the failing lint rules.',
		type: 'directive',
	});
});

test('The scheduled draft provider resets on close and on switching tasks, without an effect', async () => {
	const provider = await source('frontend/src/pages/scheduled/ScheduledDraftProvider.tsx');
	const context = await source('frontend/src/pages/scheduled/scheduledDraftContext.ts');

	// Every reset is a transition in the action that caused it. An effect here would be the same
	// mirror in a different place: state reacting to state instead of being derived from it.
	expect(provider).not.toContain('useEffect');
	expect(provider).toContain('openEdit: (task) => setState(openedOn(task, preset))');
	expect(provider).toContain('openNew: () => setState(openedOn(undefined, preset))');
	expect(provider).toContain(
		'close: () => setState({ ...openedOn(undefined, preset), open: false })',
	);
	expect(provider).toContain('dirty: isDraftDirty(state.draft, state.initial)');
	expect(provider).toContain('scheduleDirty: isScheduleDirty(state.draft, state.initial)');
	expect(context).toContain('use(ScheduledDraftContext)');
});
