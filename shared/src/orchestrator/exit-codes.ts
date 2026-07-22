export const orchestratorExitCodes = {
	aborted: 124,
	flailing: 75,
	generalError: 1,
	idleTimeout: 71,
	mergeConflictParked: 77,
	missingResult: 73,
	noAssistant: 70,
	providerError: 72,
	rateLimited: 74,
	success: 0,
	validationError: 7,
	writeAllowlistViolation: 76,
} as const;

const exitCodeLabels: Record<number, string> = {
	[orchestratorExitCodes.aborted]: 'aborted (stop, kill, or wall-clock timeout)',
	[orchestratorExitCodes.flailing]: 'flailing (repeated non-productive iterations)',
	[orchestratorExitCodes.generalError]: 'general error',
	[orchestratorExitCodes.idleTimeout]: 'idle timeout',
	[orchestratorExitCodes.mergeConflictParked]: 'merge conflict parked',
	[orchestratorExitCodes.missingResult]: 'no AIDD_RESULT emitted',
	[orchestratorExitCodes.noAssistant]: 'no assistant output',
	[orchestratorExitCodes.providerError]: 'provider error',
	[orchestratorExitCodes.rateLimited]: 'rate limited',
	[orchestratorExitCodes.validationError]: 'validation gate failed',
	[orchestratorExitCodes.writeAllowlistViolation]: 'write allowlist violated',
};

/** Human label for an orchestrator exit code, so summaries can lead with the classified
 * reason instead of a bare number. Undefined for success and unknown codes. */
export function describeOrchestratorExitCode(code: number): string | undefined {
	return exitCodeLabels[code];
}
