import type {
	ScheduledSchedulePreview,
	ScheduledTaskSchedule,
} from 'aidd-shared/contracts/scheduled-tasks';

import { useRef, useState } from 'react';
import { toast } from 'sonner';

import type { ScheduleBuilder } from './scheduleBuilder.ts';

/**
 * The "next occurrences" panel and the cron field's message, which are one piece of state: every
 * edit to the schedule invalidates both, and a reply that lands after the next edit must repaint
 * neither. The version counter is what makes a stale reply cheap to drop.
 */
export function useScheduleFeedback(options: {
	builder: ScheduleBuilder;
	preview: (schedule: ScheduledTaskSchedule) => Promise<ScheduledSchedulePreview>;
	schedule: () => ScheduledTaskSchedule;
}) {
	const [cronError, setCronError] = useState<null | string>(null);
	const [times, setTimes] = useState<null | number[]>(null);
	const [pending, setPending] = useState(false);
	const version = useRef(0);

	function clear(): void {
		version.current += 1;
		setCronError(null);
		setPending(false);
		setTimes(null);
	}

	// Blur-time check for the advanced builder, which is the only one whose expression the operator
	// types: the structured builders assemble theirs and are checked before the request goes out.
	function validateCron(): void {
		if (options.builder !== 'advanced') return;
		const current = ++version.current;
		void options.preview(options.schedule()).then(
			() => {
				if (current === version.current) setCronError(null);
			},
			(error: Error) => {
				if (current !== version.current) return;
				setCronError(error.message || 'Invalid cron expression.');
				setTimes(null);
			},
		);
	}

	function request(): void {
		const current = ++version.current;
		try {
			setPending(true);
			void options.preview(options.schedule()).then(
				(result) => {
					if (current !== version.current) return;
					setCronError(null);
					setPending(false);
					setTimes(result.next);
				},
				(error: Error) => {
					if (current !== version.current) return;
					setPending(false);
					setTimes(null);
					if (options.builder === 'advanced')
						setCronError(error.message || 'Invalid cron expression.');
					else toast.error(error.message || 'Preview failed');
				},
			);
		} catch (error) {
			setPending(false);
			toast.error(error instanceof Error ? error.message : 'Enter a valid date and time.');
		}
	}

	return { clear, cronError, pending, request, times, validateCron };
}
