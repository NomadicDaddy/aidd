import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { readFileSync } from 'node:fs';

import type { CommandResult, ParsedMetrics } from './types.ts';

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
	metrics: ParsedMetrics
): boolean {
	if (commandSucceeded(commandResult, metrics)) return true;
	return (
		!commandResult.timedOut && commandResult.status === orchestratorExitCodes.validationError
	);
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
