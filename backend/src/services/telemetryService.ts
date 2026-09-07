import type { WebDatabase } from '../db/client.ts';
import type { DbCommands } from '../db/commands.ts';
import type {
	BackendUsageRow,
	InvocationRecord,
	OutputTimeseriesPoint,
	ProjectCostRow,
	RecordCompletionInput,
	RecordStartInput,
	ResourceDetail,
	ResourceUsageRow,
	TelemetryResourceType,
	TimeseriesPoint,
} from './telemetry/types.ts';

import { getResourceUsage, getTimeseries, getTopUsed } from './telemetry/aggregation.ts';
import { getOutputTimeseries } from './telemetry/outputTimeseries.ts';
import {
	reconcileInvocationFromRun,
	reconcileStaleInvocations,
	recordCompletionByInvocationId,
	recordCompletionBySessionId,
	recordStart,
} from './telemetry/persistence.ts';
import { getProjectCosts } from './telemetry/projectCost.ts';
import { findSessionRootInvocationId, listInvocations } from './telemetry/queries.ts';
import { getBackendUsage, getResourceDetail } from './telemetry/resourceDetail.ts';

export type {
	BackendUsageRow,
	InvocationRecord,
	OutputTimeseriesPoint,
	ProjectCostRow,
	RecordCompletionInput,
	RecordStartInput,
	ResourceDetail,
	ResourceUsageRow,
	TelemetryResourceType,
	TimeseriesPoint,
} from './telemetry/types.ts';

export class TelemetryService {
	private readonly db: WebDatabase;
	private readonly commands: DbCommands;

	constructor(input: { commands: DbCommands; db: WebDatabase }) {
		this.db = input.db;
		this.commands = input.commands;
	}

	async recordStart(input: RecordStartInput): Promise<string | undefined> {
		const id = await recordStart(this.db, input);
		// Close the fast-run race for every run-backed launch (direct /runs, skill, recipe
		// step): a run can terminalize before its invocation row is inserted, leaving the terminal-
		// transition sync nothing to update and the row stuck 'running' until startup. Re-sync from
		// the runs row now — a guarded no-op while the run is still running.
		if (id !== undefined && input.runId !== undefined) {
			await reconcileInvocationFromRun(this.commands, input.runId);
		}
		return id;
	}

	async reconcileInvocationFromRun(runId: string): Promise<void> {
		await reconcileInvocationFromRun(this.commands, runId);
	}

	async recordCompletionByInvocationId(
		invocationId: string,
		input: RecordCompletionInput,
	): Promise<void> {
		await recordCompletionByInvocationId(this.db, invocationId, input);
	}

	async recordCompletionBySessionId(
		sessionId: string,
		input: RecordCompletionInput,
	): Promise<void> {
		await recordCompletionBySessionId(this.db, sessionId, input);
	}

	async getResourceUsage(input?: {
		resourceType?: TelemetryResourceType | undefined;
		windowMs?: number | undefined;
	}): Promise<ResourceUsageRow[]> {
		return getResourceUsage(this.db, input);
	}

	async getTopUsed(input: {
		limit: number;
		resourceType?: TelemetryResourceType | undefined;
		windowMs?: number | undefined;
	}): Promise<ResourceUsageRow[]> {
		return getTopUsed(this.db, input);
	}

	async getTimeseries(input: {
		bucket: 'day' | 'hour';
		resourceType?: TelemetryResourceType | undefined;
		windowMs?: number | undefined;
	}): Promise<TimeseriesPoint[]> {
		return getTimeseries(this.db, input);
	}

	async getProjectCosts(input?: {
		resourceType?: TelemetryResourceType | undefined;
		windowMs?: number | undefined;
	}): Promise<ProjectCostRow[]> {
		return getProjectCosts(this.db, input);
	}

	async getOutputTimeseries(input: {
		bucket: 'day' | 'hour';
		windowMs?: number | undefined;
	}): Promise<OutputTimeseriesPoint[]> {
		return getOutputTimeseries(this.db, input);
	}

	async listInvocations(input: {
		limit: number;
		resourceId?: string | undefined;
		resourceType?: TelemetryResourceType | undefined;
		windowMs?: number | undefined;
	}): Promise<InvocationRecord[]> {
		return listInvocations(this.db, input);
	}

	async findSessionRootInvocationId(sessionId: string): Promise<string | undefined> {
		return findSessionRootInvocationId(this.db, sessionId);
	}

	async getBackendUsage(input?: {
		resourceId?: string | undefined;
		resourceType?: TelemetryResourceType | undefined;
		windowMs?: number | undefined;
	}): Promise<BackendUsageRow[]> {
		return getBackendUsage(this.db, input);
	}

	async getResourceDetail(
		resourceType: TelemetryResourceType,
		resourceId: string,
	): Promise<null | ResourceDetail> {
		return getResourceDetail(this.db, resourceType, resourceId);
	}

	async reconcileStaleInvocations(): Promise<number> {
		return reconcileStaleInvocations(this.commands);
	}
}
