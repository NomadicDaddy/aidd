import type {
	ProjectUsageDailyTokensDto,
	ProjectUsageExecutionTargetDto,
	ProjectUsageModeDto,
	ProjectUsageSummaryDto,
	ProjectUsageTotalsDto,
} from '../../types.ts';
import type { RawRunLedgerEntry } from './iterationParseHelpers.ts';

interface LedgerUsageValues {
	cachedTokens: number;
	inputTokens: number;
	outputTokens: number;
	reasoningTokens: number;
	reportedCostUsd: number;
}

const RECENT_TOKEN_DAY_COUNT = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function emptyUsageTotals(): ProjectUsageTotalsDto {
	return {
		cachedTokens: 0,
		inputTokens: 0,
		outputTokens: 0,
		reasoningTokens: 0,
		reportedCostUsd: 0,
		runCount: 0,
		runsWithReportedCost: 0,
		runsWithTokenUsage: 0,
		totalTokens: 0,
	};
}

function nonnegativeNumber(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function usageValues(raw: RawRunLedgerEntry): LedgerUsageValues {
	const totals =
		typeof raw.totals === 'object' && raw.totals !== null
			? (raw.totals as Record<string, unknown>)
			: {};
	const costUsd = nonnegativeNumber(totals.costUsd);
	return {
		cachedTokens: nonnegativeNumber(totals.cachedTokens),
		inputTokens: nonnegativeNumber(totals.inputTokens),
		outputTokens: nonnegativeNumber(totals.outputTokens),
		reasoningTokens: nonnegativeNumber(totals.reasoningTokens),
		// A zero in older ledgers is ambiguous: it can mean a genuinely free/no-op run or a backend
		// that reported tokens without dollars. Count only positive backend-emitted values as known.
		reportedCostUsd: costUsd > 0 ? costUsd : 0,
	};
}

function addUsage(totals: ProjectUsageTotalsDto, values: LedgerUsageValues): void {
	const totalTokens = values.inputTokens + values.outputTokens;
	totals.cachedTokens += values.cachedTokens;
	totals.inputTokens += values.inputTokens;
	totals.outputTokens += values.outputTokens;
	totals.reasoningTokens += values.reasoningTokens;
	totals.reportedCostUsd += values.reportedCostUsd;
	totals.runCount += 1;
	totals.totalTokens += totalTokens;
	if (values.reportedCostUsd > 0) totals.runsWithReportedCost += 1;
	if (totalTokens > 0) totals.runsWithTokenUsage += 1;
}

function cleanLedgerLabel(value: unknown): null | string {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function sortUsageRows<T extends ProjectUsageTotalsDto>(rows: T[]): T[] {
	return rows.sort(
		(left, right) =>
			right.totalTokens - left.totalTokens ||
			right.reportedCostUsd - left.reportedCostUsd ||
			right.runCount - left.runCount,
	);
}

function ledgerEntryDay(entry: RawRunLedgerEntry): null | number {
	for (const value of [entry.endedAt, entry.startedAt]) {
		if (typeof value !== 'string') continue;
		const timestamp = Date.parse(value);
		if (Number.isFinite(timestamp)) {
			const date = new Date(timestamp);
			return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
		}
	}
	return null;
}

function recentDailyTokens(
	entries: RawRunLedgerEntry[],
	referenceTime: Date,
): ProjectUsageDailyTokensDto[] {
	const referenceDay = Date.UTC(
		referenceTime.getUTCFullYear(),
		referenceTime.getUTCMonth(),
		referenceTime.getUTCDate(),
	);
	const firstDay = referenceDay - (RECENT_TOKEN_DAY_COUNT - 1) * DAY_MS;
	const tokensByDay = new Map<number, number>();
	for (const entry of entries) {
		const day = ledgerEntryDay(entry);
		if (day === null || day < firstDay || day > referenceDay) continue;
		const values = usageValues(entry);
		tokensByDay.set(
			day,
			(tokensByDay.get(day) ?? 0) + values.inputTokens + values.outputTokens,
		);
	}
	return Array.from({ length: RECENT_TOKEN_DAY_COUNT }, (_, index) => {
		const day = firstDay + index * DAY_MS;
		return {
			date: new Date(day).toISOString().slice(0, 10),
			totalTokens: tokensByDay.get(day) ?? 0,
		};
	});
}

export function projectUsageFromLedgerEntries(
	entries: RawRunLedgerEntry[],
	referenceTime = new Date(),
): ProjectUsageSummaryDto {
	// A crash-fallback line can precede a real final summary for the same modern run id. Last entry
	// wins for usage accounting; legacy entries without run ids remain individually countable.
	const byRunId = new Map<string, RawRunLedgerEntry>();
	const legacyEntries: RawRunLedgerEntry[] = [];
	for (const entry of entries) {
		const runId = cleanLedgerLabel(entry.runId);
		if (runId) byRunId.set(runId, entry);
		else legacyEntries.push(entry);
	}
	const usageEntries = [...legacyEntries, ...byRunId.values()];
	const totals = emptyUsageTotals();
	const executionGroups = new Map<string, ProjectUsageExecutionTargetDto>();
	const modeGroups = new Map<string, ProjectUsageModeDto>();
	for (const entry of usageEntries) {
		const values = usageValues(entry);
		addUsage(totals, values);

		const backend = cleanLedgerLabel(entry.backend);
		const model = cleanLedgerLabel(entry.model);
		const provider = cleanLedgerLabel(entry.provider);
		const executionKey = JSON.stringify([backend, model, provider]);
		let executionGroup = executionGroups.get(executionKey);
		if (!executionGroup) {
			executionGroup = { ...emptyUsageTotals(), backend, model, provider };
			executionGroups.set(executionKey, executionGroup);
		}
		addUsage(executionGroup, values);

		const mode = cleanLedgerLabel(entry.mode);
		const modeKey = mode ?? '';
		let modeGroup = modeGroups.get(modeKey);
		if (!modeGroup) {
			modeGroup = { ...emptyUsageTotals(), mode };
			modeGroups.set(modeKey, modeGroup);
		}
		addUsage(modeGroup, values);
	}
	return {
		byExecutionTarget: sortUsageRows([...executionGroups.values()]),
		byMode: sortUsageRows([...modeGroups.values()]),
		recentDailyTokens: recentDailyTokens(usageEntries, referenceTime),
		totals,
	};
}
