import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
	listBackendUsage,
	listInvocations,
	listOutputTimeseries,
	listResourceUsage,
	listTimeseries,
	listTopUsed,
	type InvocationsQuery,
	type BackendUsageQuery,
	type OutputTimeseriesQuery,
	type ResourceUsageQuery,
	type TimeseriesQuery,
	type TopUsedQuery,
} from '../api/telemetry.ts';

export function useTelemetryBackends(query: BackendUsageQuery = {}) {
	return useQuery({
		placeholderData: keepPreviousData,
		queryFn: ({ signal }) => listBackendUsage(query, signal),
		queryKey: ['telemetry', 'backends', query.type ?? null, query.windowMs ?? null],
	});
}

export function useTelemetryResources(query: ResourceUsageQuery = {}) {
	return useQuery({
		placeholderData: keepPreviousData,
		queryFn: ({ signal }) => listResourceUsage(query, signal),
		queryKey: ['telemetry', 'resources', query.type ?? null, query.windowMs ?? null],
	});
}

export function useTelemetryTop(query: TopUsedQuery = {}) {
	return useQuery({
		placeholderData: keepPreviousData,
		queryFn: ({ signal }) => listTopUsed(query, signal),
		queryKey: [
			'telemetry',
			'top',
			query.type ?? null,
			query.windowMs ?? null,
			query.limit ?? null,
		],
	});
}

export function useTelemetryTimeseries(query: TimeseriesQuery) {
	return useQuery({
		placeholderData: keepPreviousData,
		queryFn: ({ signal }) => listTimeseries(query, signal),
		queryKey: [
			'telemetry',
			'timeseries',
			query.bucket,
			query.type ?? null,
			query.windowMs ?? null,
		],
	});
}

export function useTelemetryOutputTimeseries(query: OutputTimeseriesQuery, enabled = true) {
	return useQuery({
		enabled,
		placeholderData: keepPreviousData,
		queryFn: ({ signal }) => listOutputTimeseries(query, signal),
		queryKey: ['telemetry', 'output-timeseries', query.bucket, query.windowMs ?? null],
	});
}

export function useTelemetryInvocations(query: InvocationsQuery = {}) {
	return useQuery({
		placeholderData: keepPreviousData,
		queryFn: ({ signal }) => listInvocations(query, signal),
		queryKey: [
			'telemetry',
			'invocations',
			query.type ?? null,
			query.id ?? null,
			query.limit ?? null,
			query.windowMs ?? null,
		],
	});
}
