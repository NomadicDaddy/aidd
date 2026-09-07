import type { ScheduledTask } from 'aidd-shared/contracts/scheduled-tasks';

import { Link } from 'react-router';

import { useScheduledTasks } from '../../hooks/useScheduledTasks.ts';
import { nextRunLabel } from '../scheduled/scheduledLabels.ts';
import { directorCycleCadence } from './directorCycleCadence.ts';

/**
 * When the Director next starts a cycle on its own.
 *
 * The cadence belongs to a built-in scheduled task, so this reads that task rather than any
 * Director-local setting, and links to where it is edited instead of editing it here. Renders
 * nothing until the task is known: an operator who has never scheduled anything should not be shown
 * an empty row on a page about running a cycle right now.
 */
export function NextAutomaticCycle() {
	const scheduled = useScheduledTasks();
	const task = (scheduled.tasks.data ?? []).find((entry) => entry.systemKey === 'director');
	if (!task) return null;
	return <NextAutomaticCycleStatus task={task} />;
}

export function NextAutomaticCycleStatus({ task }: { task: ScheduledTask }) {
	const cadence = directorCycleCadence(task.schedule);

	return (
		<p aria-atomic="true" aria-live="polite" className="mt-3 text-xs text-muted-foreground">
			{task.state === 'active' ? (
				<>
					Next automatic cycle {nextRunLabel(task.nextRunAt, task.schedule.timezone)}.{' '}
					<span className={cadence.machineValue ? 'font-mono' : undefined}>
						{cadence.label}
					</span>
					{cadence.label.endsWith('.') ? ' ' : '. '}
				</>
			) : (
				`Automatic cycles are ${task.state}. `
			)}
			<Link className="text-accent underline underline-offset-4" to="/scheduled">
				Manage on Scheduled
			</Link>
		</p>
	);
}
