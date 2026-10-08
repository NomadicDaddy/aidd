// The Direct AI half of a Director cycle's failure story: which faults the CLI fallback can and
// cannot cure, and how the Direct AI cause is joined to the CLI run's own reason afterwards.
import { HttpError } from '../errors.ts';

// HttpError 400 is resolveDirectAiCall refusing the configuration; a provider's 401 or 403 arrives
// as the client's generic request failure naming the status. Neither is cured by a CLI run.
export function isUnrecoverableDirectAiError(err: unknown): boolean {
	if (err instanceof HttpError) return err.status === 400;
	const message = err instanceof Error ? err.message : String(err);
	return /\bHTTP 40[13]\b/.test(message);
}

// Join the direct-AI fallback cause (if any) with the CLI run's reason. Either may be absent:
// direct AI may have been disabled (no error) or the run reason may be unreadable. Returns null
// only when both are empty, letting persistCycleResult apply its own default.
export function combineFailureReasons(
	directAiError: null | string | undefined,
	runReason: null | string,
): null | string {
	const parts: string[] = [];
	if (directAiError) parts.push(`Direct AI fell back to CLI: ${directAiError}`);
	if (runReason) parts.push(runReason);
	return parts.length > 0 ? parts.join(' — ') : null;
}
