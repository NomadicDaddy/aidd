import type {
	InvocationRecord,
	ResourceUsageRow,
	TelemetryBackendUsageRow,
	TelemetryOutputTimeseriesPoint,
	TelemetryResourceType,
	TelemetryTimeseriesPoint,
} from './types.ts';

import { apiGet } from './client.ts';

function buildQuery(params: Record<string, number | string | undefined>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) continue;
		search.set(key, String(value));
	}
	const query = search.toString();
	return query.length > 0 ? `?${query}` : '';
}

export interface ResourceUsageQuery {
	type?: TelemetryResourceType;
	windowMs?: number;
}

export interface TopUsedQuery extends ResourceUsageQuery {
	limit?: number;
}

export interface TimeseriesQuery {
	bucket: 'day' | 'hour';
	type?: TelemetryResourceType;
	windowMs?: number;
}

export interface InvocationsQuery {
	id?: string;
	limit?: number;
	type?: TelemetryResourceType;
	windowMs?: number;
}

export interface OutputTimeseriesQuery {
	bucket: 'day' | 'hour';
	windowMs?: number;
}

export type BackendUsageQuery = ResourceUsageQuery;

export async function listResourceUsage(
	query: ResourceUsageQuery = {},
	signal?: AbortSignal,
): Promise<ResourceUsageRow[]> {
	const response = await apiGet<{ resources: ResourceUsageRow[] }>(
		`/api/v1/telemetry/resources${buildQuery({ ...query })}`,
		{ signal },
	);
	return response.resources;
}

export async function listTopUsed(
	query: TopUsedQuery = {},
	signal?: AbortSignal,
): Promise<ResourceUsageRow[]> {
	const response = await apiGet<{ resources: ResourceUsageRow[] }>(
		`/api/v1/telemetry/top${buildQuery({ ...query })}`,
		{ signal },
	);
	return response.resources;
}

export async function listTimeseries(
	query: TimeseriesQuery,
	signal?: AbortSignal,
): Promise<TelemetryTimeseriesPoint[]> {
	const response = await apiGet<{ points: TelemetryTimeseriesPoint[] }>(
		`/api/v1/telemetry/timeseries${buildQuery({ ...query })}`,
		{ signal },
	);
	return response.points;
}

export async function listOutputTimeseries(
	query: OutputTimeseriesQuery,
	signal?: AbortSignal,
): Promise<TelemetryOutputTimeseriesPoint[]> {
	const response = await apiGet<{ points: TelemetryOutputTimeseriesPoint[] }>(
		`/api/v1/telemetry/output-timeseries${buildQuery({ ...query })}`,
		{ signal },
	);
	return response.points;
}

export async function listBackendUsage(
	query: BackendUsageQuery = {},
	signal?: AbortSignal,
): Promise<TelemetryBackendUsageRow[]> {
	const response = await apiGet<{ backends: TelemetryBackendUsageRow[] }>(
		`/api/v1/telemetry/backends${buildQuery({ ...query })}`,
		{ signal },
	);
	return response.backends;
}

export async function listInvocations(
	query: InvocationsQuery = {},
	signal?: AbortSignal,
): Promise<InvocationRecord[]> {
	const response = await apiGet<{ invocations: InvocationRecord[] }>(
		`/api/v1/telemetry/invocations${buildQuery({ ...query })}`,
		{ signal },
	);
	return response.invocations;
}
