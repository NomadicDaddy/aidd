import { readFileSync } from 'node:fs';

import type { ParsedMetrics } from './types.ts';

import { isRecord, numberValue, readJsonUnknown, stringValue } from './validation.ts';

function readStructuredRecords(paths: string[]): Record<string, unknown>[] {
	return paths
		.map((filePath): Record<string, unknown> | undefined => {
			try {
				const parsed = readJsonUnknown(filePath);
				return isRecord(parsed) ? parsed : undefined;
			} catch {
				return undefined;
			}
		})
		.filter((entry): entry is Record<string, unknown> => entry !== undefined);
}

function metricNumber(record: Record<string, unknown>, key: string): number {
	return numberValue(record[key]) ?? 0;
}

function iterationExitStatus(record: Record<string, unknown>): 'failure' | 'success' | 'unknown' {
	const outcome = isRecord(record.outcome) ? record.outcome : undefined;
	const status = stringValue(outcome?.status);
	const exitCode = numberValue(outcome?.exitCode) ?? numberValue(record.exitCode);
	if (status === 'success') return 'success';
	if (status !== undefined && status !== 'success') return 'failure';
	if (exitCode === 0) return 'success';
	if (exitCode !== undefined && exitCode !== 0) return 'failure';
	return 'unknown';
}

function parseRawMetricFallback(stdout: string, stderr: string, rawLogs: string[]): ParsedMetrics {
	const corpus = [
		stdout,
		stderr,
		...rawLogs.map((filePath) => {
			try {
				return readFileSync(filePath, 'utf8');
			} catch {
				return '';
			}
		}),
	].join('\n');
	const inputTokens = Number(corpus.match(/inputTokens["':\s]+(\d+)/i)?.[1] ?? 0);
	const outputTokens = Number(corpus.match(/outputTokens["':\s]+(\d+)/i)?.[1] ?? 0);
	const costMatch = corpus.match(/costUsd["':\s]+([0-9.]+)/i);
	const errorCount = (corpus.match(/\berror\b/gi) ?? []).length;
	const rateLimitCount = (corpus.match(/rate.?limit/gi) ?? []).length;
	return {
		costUsd: costMatch?.[1] ? Number(costMatch[1]) : null,
		durationSeconds: 0,
		errorCount,
		exitStatus: 'unknown',
		iterations: 0,
		rateLimitCount,
		tokenUsage: {
			cachedTokens: 0,
			inputTokens,
			known: inputTokens > 0 || outputTokens > 0,
			outputTokens,
			reasoningTokens: 0,
		},
	};
}

export function parseBenchmarkMetrics(input: {
	rawLogs?: string[];
	stderr?: string;
	stdout?: string;
	structuredLogs: string[];
}): ParsedMetrics {
	const structured = readStructuredRecords(input.structuredLogs);
	if (structured.length === 0) {
		return parseRawMetricFallback(input.stdout ?? '', input.stderr ?? '', input.rawLogs ?? []);
	}

	let cachedTokens = 0;
	let costUsd = 0;
	let costKnown = false;
	let durationMs = 0;
	let errorCount = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let rateLimitCount = 0;
	let reasoningTokens = 0;
	let sawFailure = false;
	let sawSuccess = false;

	for (const record of structured) {
		durationMs += numberValue(record.durationMs) ?? 0;
		const metrics = isRecord(record.metrics) ? record.metrics : {};
		const totals = isRecord(record.totals) ? record.totals : {};
		inputTokens += metricNumber(metrics, 'inputTokens') || metricNumber(totals, 'inputTokens');
		outputTokens +=
			metricNumber(metrics, 'outputTokens') || metricNumber(totals, 'outputTokens');
		reasoningTokens += metricNumber(metrics, 'reasoningTokens');
		cachedTokens += metricNumber(metrics, 'cachedTokens');
		const iterationCost = numberValue(metrics.costUsd) ?? numberValue(totals.costUsd);
		if (iterationCost !== undefined) {
			costUsd += iterationCost;
			costKnown = true;
		}
		errorCount += metricNumber(metrics, 'errorCount') || metricNumber(totals, 'errors');
		rateLimitCount +=
			metricNumber(metrics, 'rateLimitCount') || metricNumber(totals, 'rateLimits');
		const status = iterationExitStatus(record);
		if (status === 'failure') sawFailure = true;
		if (status === 'success') sawSuccess = true;
	}

	return {
		costUsd: costKnown ? costUsd : null,
		durationSeconds: durationMs / 1000,
		errorCount,
		exitStatus: sawFailure ? 'failure' : sawSuccess ? 'success' : 'unknown',
		iterations: structured.length,
		rateLimitCount,
		tokenUsage: {
			cachedTokens,
			inputTokens,
			known: inputTokens > 0 || outputTokens > 0 || cachedTokens > 0 || reasoningTokens > 0,
			outputTokens,
			reasoningTokens,
		},
	};
}
