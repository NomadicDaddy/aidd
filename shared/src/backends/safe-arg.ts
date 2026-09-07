/**
 * The one definition of what may appear in a user-supplied backend argument.
 *
 * Model names and reasoning-effort tokens reach a CLI as argv elements, so this is defence in depth
 * rather than the only thing standing between an operator and a shell. It still has to be one
 * definition: the HTTP routes validate against it before accepting a launch target, and
 * buildBackendCommand re-checks it at spawn time. When those two drifted apart the failure was
 * silent in the worst direction — a value the route accepted could still throw at spawn, minutes
 * later, inside a scheduled occurrence nobody was watching.
 *
 * Underscores are in the set because quantized model tags carry them: Ollama publishes
 * `llama3.1:8b-instruct-q4_K_M`, and a set without `_` rejected every one of them with a 400 that
 * blamed the operator's typing.
 */
export const SAFE_BACKEND_ARG_PATTERN = '^[A-Za-z0-9_.:/@-]+$';

const SAFE_BACKEND_ARG = new RegExp(SAFE_BACKEND_ARG_PATTERN);

export function isSafeBackendArg(value: string): boolean {
	return SAFE_BACKEND_ARG.test(value);
}
