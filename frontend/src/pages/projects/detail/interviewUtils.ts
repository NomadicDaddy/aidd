import type { ProjectInterviewQuestion } from '../../../api/types.ts';
import type { Tone } from '../../../lib/tones.ts';

const interviewPriorityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'NICE'] as const;

export function normalizedInterviewPriority(question: ProjectInterviewQuestion): string {
	return question.priority.trim().toUpperCase() || 'NICE';
}

export function interviewPriorityRank(priority: string): number {
	const rank = interviewPriorityOrder.indexOf(
		priority as (typeof interviewPriorityOrder)[number],
	);
	return rank === -1 ? interviewPriorityOrder.length : rank;
}

export function interviewPriorityComposition(questions: ProjectInterviewQuestion[]): string {
	const counts = new Map<string, number>();
	for (const question of questions) {
		const priority = normalizedInterviewPriority(question);
		counts.set(priority, (counts.get(priority) ?? 0) + 1);
	}
	const known = interviewPriorityOrder.filter((priority) => counts.has(priority));
	const custom = Array.from(counts.keys())
		.filter(
			(priority) =>
				!interviewPriorityOrder.includes(
					priority as (typeof interviewPriorityOrder)[number],
				),
		)
		.sort();
	return [...known, ...custom]
		.map((priority) => `${counts.get(priority) ?? 0} ${priority.toLowerCase()}`)
		.join(' · ');
}

/**
 * Priority on the closed tone scale. With every chip `neutral`, the two CRITICAL questions at the
 * top of a forty-question list look exactly like the NICE one below them and the list offers no
 * scan path. Rendering the answered list's chip `emerald` instead would make one chip shape carry
 * two different axes depending on which section it is in; both lists tone it by priority and let
 * the section heading say answered-ness.
 */
export function interviewPriorityTone(priority: string): Tone {
	const normalized = priority.trim().toUpperCase();
	if (normalized === 'CRITICAL') return 'red';
	if (normalized === 'HIGH') return 'amber';
	if (normalized === 'MEDIUM') return 'teal';
	return 'neutral';
}

/** The lowest priority stays quieter than the neutral count badges used beside section titles. */
export function interviewPriorityClass(priority: string): string | undefined {
	return priority.trim().toUpperCase() === 'NICE' ? 'text-muted-foreground' : undefined;
}
