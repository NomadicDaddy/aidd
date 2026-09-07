import type { TelemetryResourceType } from '../../api/types.ts';

export type TypeFilter = 'all' | TelemetryResourceType;
export type WindowKey = '24h' | '30d' | '7d' | 'all';

export const telemetryTypeOptions = [
	{ label: 'All', value: 'all' },
	{ label: 'Skills', value: 'skill' },
	{ label: 'Recipes', value: 'recipe' },
	{ label: 'Runs', value: 'run' },
] as const;

export const telemetryWindowOptions = [
	{ label: '24h', ms: 24 * 60 * 60 * 1000, value: '24h' },
	{ label: '7d', ms: 7 * 24 * 60 * 60 * 1000, value: '7d' },
	{ label: '30d', ms: 30 * 24 * 60 * 60 * 1000, value: '30d' },
	{ label: 'All', ms: undefined, value: 'all' },
] as const;

export function telemetryWindowMs(value: WindowKey): number | undefined {
	return telemetryWindowOptions.find((option) => option.value === value)?.ms;
}

export function telemetryWindowLabel(value: WindowKey): string {
	return telemetryWindowOptions.find((option) => option.value === value)?.label ?? 'All';
}

export function telemetryTypeParam(value: TypeFilter): TelemetryResourceType | undefined {
	return value === 'all' ? undefined : value;
}
