import { HttpError } from '../errors.ts';

// Flags that define a run's scope, mode, or entrypoint and therefore must NOT be settable via the
// free-form extraArgs string. extraArgs is appended after the launch defaults and the CLI parser is
// last-wins, so without this guard a UI launch could (a) redirect the child to a project the web
// service never authorized against allowedRoots — the DB would record one project while the CLI
// operates on another — (b) read an arbitrary host file into the prompt, or (c) reach a run mode the
// launch route intentionally does not expose (director/role/directive) or an alternate entrypoint
// (web/mcp). Mode is chosen via the request `mode` field, never here.
const PROTECTED_EXTRA_ARG_FLAGS: ReadonlySet<string> = new Set([
	// Mode-defining flags (the request `mode` field is authoritative).
	'--audit',
	'--audit-all',
	'--config-matrix',
	'--directive',
	'--directive-readonly',
	'--director',
	'--director-context',
	'--director-output',
	'--fleet-summary',
	'--in-progress',
	'--interview',
	'--mcp',
	'--port',
	// Scope / arbitrary-file-read flags.
	'--project-dir',
	// Directive injection handled by the skill pipeline path, not raw run args.
	'--skill',
	'--skill-args',
	// The execution intent of a skill run is a permission, not a preference: letting extra args
	// restate it would let a review-only launch talk itself into write access.
	'--skill-intent',
	'--spec',
	'--stop-before-implementation',
	'--suggestion-schema',
	'--todo',
	'--triumvirate',
	'--validate',
	// Alternate entrypoints / server modes.
	'--web',
	// Worktree isolation is gated by web.useWorktrees and the launcher records the run's
	// worktree path/branch on the row up front; letting extra args flip it on would create a
	// worktree the row knows nothing about, breaking orphan cleanup and parked-run tracking.
	'--worktree',
	// Write-boundary enforcement is owned by the launch request, never extra args.
	'--write-allowlist',
]);

// Split a free-form additional-args string into argv tokens, honoring single/double quotes
// so a value containing spaces (e.g. `--prompt "do the thing"`) survives as a single token,
// then reject any token that targets a protected flag. The result is appended to the launch argv
// and handed to Bun.spawn as an array — there is no shell, so quoting only delimits tokens and
// carries no injection risk. Malformed input throws HttpError(400) so the route returns a client
// error rather than surfacing as an unhandled 500.
export function tokenizeExtraArgs(input: string): string[] {
	const tokens: string[] = [];
	let current = '';
	let quote: '"' | "'" | null = null;
	let hasToken = false;
	for (const ch of input) {
		if (quote) {
			if (ch === quote) quote = null;
			else current += ch;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			hasToken = true;
			continue;
		}
		if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
			if (hasToken) {
				tokens.push(current);
				current = '';
				hasToken = false;
			}
			continue;
		}
		current += ch;
		hasToken = true;
	}
	if (quote) throw new HttpError('Additional args contain an unterminated quote', 400);
	if (hasToken) tokens.push(current);
	assertNoProtectedFlags(tokens);
	return tokens;
}

// Reject extraArgs tokens that resolve to a protected flag, in either `--flag value` or
// `--flag=value` form. A protected name is rejected wherever it appears (even nominally as a value)
// because last-wins parsing makes position unreliable as a guard and such values are never
// legitimate.
function assertNoProtectedFlags(tokens: string[]): void {
	for (const token of tokens) {
		if (!token.startsWith('--')) continue;
		const equals = token.indexOf('=');
		const flag = equals === -1 ? token : token.slice(0, equals);
		if (PROTECTED_EXTRA_ARG_FLAGS.has(flag)) {
			throw new HttpError(`Additional args may not include the protected flag ${flag}`, 400);
		}
	}
}
