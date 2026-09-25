import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { readFileSync } from 'node:fs';

import type { CommandResult, ParsedMetrics, RunStatus } from './types.ts';

export function commandSucceeded(commandResult: CommandResult, metrics: ParsedMetrics): boolean {
	return (
		!commandResult.timedOut && commandResult.status === 0 && metrics.exitStatus !== 'failure'
	);
}

/**
 * Control "check" commands (`--check-artifacts` / `--check-features`) legitimately exit with
 * validationError when the project under test is incomplete: the check RAN correctly and
 * reported a negative result. For benchmarking a backend stack, that is a successful execution
 * of the control task — the CLI did its job — so a deliberately-incomplete fixture must not be
 * scored as a backend failure. Treat validationError as success for control tasks.
 */
export function controlCommandSucceeded(
	commandResult: CommandResult,
	metrics: ParsedMetrics,
): boolean {
	if (commandSucceeded(commandResult, metrics)) return true;
	return (
		!commandResult.timedOut && commandResult.status === orchestratorExitCodes.validationError
	);
}

/**
 * A run that produced no answer because the provider would not serve one — not because the model
 * reasoned badly. `rateLimited` is the quota wall (the orchestrator refuses a backoff that would
 * cross the run's budget) and `providerError` is a transport or upstream failure. Neither is
 * evidence about capability, so scoring them 0 alongside real attempts understates a stack and
 * counting them as completed runs overstates how much was measured.
 *
 * Deliberately narrow. `providerFlagged` (a content-policy refusal) IS a result about the model
 * and stays in the quality population, as do timeouts, flailing and validation failures.
 */
export function isProviderUnavailableExit(exitCode: number): boolean {
	return (
		exitCode === orchestratorExitCodes.rateLimited ||
		exitCode === orchestratorExitCodes.providerError
	);
}

export function isProviderUnavailable(commandResult: CommandResult): boolean {
	return isProviderUnavailableExit(commandResult.status);
}

/**
 * How one run is recorded. `provider_unavailable` is tested before `failure` so a quota wall is
 * never filed as a wrong answer: aggregation drops such runs from the correctness and reliability
 * populations, where scoring them zero would understate the stack and counting them would
 * overstate how much was actually measured.
 */
export function resolveRunStatus(
	commandResult: CommandResult,
	metrics: ParsedMetrics,
	category: 'agentic' | 'control',
): RunStatus {
	const succeeded =
		category === 'control'
			? controlCommandSucceeded(commandResult, metrics)
			: commandSucceeded(commandResult, metrics);
	if (commandResult.timedOut) return 'timeout';
	if (succeeded) return 'success';
	return isProviderUnavailable(commandResult) ? 'provider_unavailable' : 'failure';
}

export function clampScore(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(1, value));
}

export function readTextIfExists(filePath: string): string {
	try {
		return readFileSync(filePath, 'utf8');
	} catch {
		return '';
	}
}
