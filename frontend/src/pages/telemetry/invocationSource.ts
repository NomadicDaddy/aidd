import type { TelemetryInvocationSource } from '../../api/types/telemetry.ts';

const invocationSourceLabels = {
	cli: 'CLI',
	'recipe-step': 'Recipe step',
	scheduled: 'Scheduled',
	web: 'Web',
} satisfies Record<TelemetryInvocationSource, string>;

export function invocationSourceLabel(source: TelemetryInvocationSource): string {
	return invocationSourceLabels[source];
}
