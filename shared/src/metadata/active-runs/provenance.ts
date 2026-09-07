// The two provenance dimensions a run carries, kept together because they are constantly
// confused for each other and only make sense side by side.

/** Which surface a run arrived through. A door, not an intent. */
export type CliActiveRunSource = 'cli' | 'director' | 'scheduled' | 'web';

const SOURCE_VALUES: ReadonlySet<string> = new Set<CliActiveRunSource>([
	'cli',
	'director',
	'scheduled',
	'web',
]);

/**
 * Whether a person asked for this run, or aidd started it on its own.
 *
 * `source` cannot answer that. A suggestion someone clicks Launch on and a suggestion aidd
 * launches by itself are both `source: 'director'`; an auto-chained follow-up is
 * `source: 'web'`, indistinguishable from the run a person started. The alternative to this
 * field is joining `chained_from_run_id`, `scheduled_task_execution_id` and `director_cycle_id`
 * and inferring — which is the run-history archaeology this exists to remove.
 *
 * An agent launching work on a request somebody made a moment ago — Director chat, an MCP call,
 * a Telegram message — is `'operator'`. The agent is a proxy for a person, not a background
 * trigger. See item 4 of `.aidd/features/run-trigger-provenance/feature.json` before reclassifying
 * it.
 */
export type RunInitiator = 'automatic' | 'operator';

const INITIATOR_VALUES: ReadonlySet<string> = new Set<RunInitiator>(['automatic', 'operator']);

export function isCliActiveRunSource(value: unknown): value is CliActiveRunSource {
	return typeof value === 'string' && SOURCE_VALUES.has(value);
}

/**
 * Narrow a stored or transported value to an initiator, or `null` for anything else.
 *
 * Unrecognized is `null` rather than a rejection on purpose. `null` already means "not recorded"
 * for every row and every active-run record with no recorded initiator, and a run whose
 * provenance label this build cannot interpret is still a real run that has to be listed,
 * reaped, and stopped. Losing it over a label would cost more than the label is worth.
 */
export function asRunInitiator(value: unknown): null | RunInitiator {
	return typeof value === 'string' && INITIATOR_VALUES.has(value)
		? (value as RunInitiator)
		: null;
}
