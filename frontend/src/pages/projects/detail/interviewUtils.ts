import type { Tone } from '../../../lib/tones.ts';

/**
 * Priority on the closed tone scale. Every chip in the tab used to be `neutral`, so the two
 * CRITICAL questions at the top of a forty-question list looked exactly like the NICE one below
 * them and the list offered no scan path. The answered list additionally rendered the same chip
 * `emerald`, which made one chip shape carry two different axes depending on which section it was
 * in; both lists now tone it by priority and let the section heading say answered-ness.
 */
export function interviewPriorityTone(priority: string): Tone {
	const normalized = priority.trim().toUpperCase();
	if (normalized === 'CRITICAL') return 'red';
	if (normalized === 'HIGH') return 'amber';
	if (normalized === 'MEDIUM') return 'teal';
	return 'neutral';
}
