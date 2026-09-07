export const SECRET_REDACTED = '[REDACTED]';

interface SecretRule {
	readonly pattern: RegExp;
	readonly replacement: string;
}

const SECRET_KEY = String.raw`(?:[a-z][a-z0-9]*[_-])*(?:api[_-]?key|auth[_-]?token|bot[_-]?token|access[_-]?token|refresh[_-]?token|authorization|secret|token|password|passwd|pwd)`;
const SECRET_FIELD = new RegExp(`^${SECRET_KEY}$`, 'i');
const ASSIGNMENT = String.raw`\b(${SECRET_KEY})(\\*["']?\s*[:=]\s*\\*["']?)([^\s"'\\,;&]+)`;

// Every prefix rule is left-anchored on a word boundary. Without it a prefix matches mid-word and
// eats real content: `sk-` alone redacted the tail of feature directories named
// `...-mask-sensitive-paths-...` (`ma|sk-sensitive-paths...`) in 100+ archived iteration logs.
// A genuine credential is always preceded by a non-word character — `=`, `:`, a quote, or space —
// so the boundary costs no coverage.
const SECRET_RULES: readonly SecretRule[] = [
	{ pattern: /\bsk-[A-Za-z0-9_-]{16,}/g, replacement: SECRET_REDACTED },
	{ pattern: /Bearer\s+[A-Za-z0-9._-]+/g, replacement: SECRET_REDACTED },
	{ pattern: /Authorization:\s*\S+/g, replacement: SECRET_REDACTED },
	{ pattern: /\bAKIA[0-9A-Z]{16}/g, replacement: SECRET_REDACTED },
	{ pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}/g, replacement: SECRET_REDACTED },
	{ pattern: /\bghp_[A-Za-z0-9]{20,}/g, replacement: SECRET_REDACTED },
	{ pattern: /\bAIza[A-Za-z0-9_-]{20,}/g, replacement: SECRET_REDACTED },
	{
		pattern: new RegExp(ASSIGNMENT, 'gi'),
		replacement: `$1$2${SECRET_REDACTED}`,
	},
];

export function scrubSecrets(value: string): string {
	// Decode complete JSON envelopes before inspecting their values. This also unwraps JSON
	// serialized inside tool output without damaging quotes or escaped credential characters.
	if (/^\s*[{[]/.test(value)) {
		try {
			const parsed: unknown = JSON.parse(value);
			const cleaned = scrubSecretFields(parsed);
			return JSON.stringify(cleaned) === JSON.stringify(parsed)
				? value
				: JSON.stringify(cleaned);
		} catch {
			// Narration and partial JSON still need the text rules below.
		}
	}
	let scrubbed = value;
	for (const rule of SECRET_RULES) {
		scrubbed = scrubbed.replace(rule.pattern, rule.replacement);
	}
	return scrubbed;
}

/** Redact credential fields at every depth without mutating the source payload. */
export function scrubSecretFields(value: unknown): unknown {
	if (typeof value === 'string') return scrubSecrets(value);
	if (Array.isArray(value)) return value.map(scrubSecretFields);
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]: [string, unknown]) => [
				key,
				SECRET_FIELD.test(key) ? SECRET_REDACTED : scrubSecretFields(entry),
			]),
		);
	}
	return value;
}

// Longest tail the streaming scrubber withholds while a match may still be forming across
// chunk boundaries. A dangerous suffix longer than this is emitted anyway to bound memory and
// console latency. A recognized secret crossing this limit is redacted and its remaining
// token characters are discarded until the delimiter arrives.
const STREAM_HOLD_MAX = 256;

// A suffix that could still grow into (part of) a SECRET_RULES match once more text arrives:
// a trailing non-whitespace run (a possibly partial token), or a Bearer / Authorization / key-
// value trigger whose value has not fully streamed yet. Everything before such a suffix is safe
// to emit: every rule ends in a contiguous non-whitespace token, and the only whitespace a
// match can contain sits between one of these triggers and its value. Keep in lockstep with
// SECRET_RULES — a new rule shape needs a corresponding alternative here.
const DANGEROUS_SUFFIX = new RegExp(
	String.raw`(?:Bearer\s*\S*|Authorization:?\s*\S*|\b(?:${SECRET_KEY})(?:\\*["']?\s*[:=]?\s*\\*["']?\S*)?|\S+)$`,
	'i',
);

/**
 * Stateful scrubber for incrementally streamed text (live run-console chunks). Scrubbing each
 * chunk independently misses a secret split across a chunk boundary — neither half matches any
 * rule — so this buffers the smallest suffix that could still become a match and only emits
 * text once no rule can span the cut. `flush()` releases (and scrubs) whatever is still held.
 */
export class StreamingSecretScrubber {
	private pending = '';
	private discardingSecret = false;

	/** Append streamed text; returns the scrubbed portion that is safe to emit now. */
	write(chunk: string): string {
		if (this.discardingSecret) {
			chunk = chunk.replace(/^[^\s"'\\,;&]+/, '');
			if (chunk.length === 0) return '';
			this.discardingSecret = false;
		}
		this.pending += chunk;
		const tail = this.pending.slice(-STREAM_HOLD_MAX);
		const match = DANGEROUS_SUFFIX.exec(tail);
		const cut = this.pending.length - (match ? tail.length - match.index : 0);
		if (cut <= 0) return '';
		if (
			SECRET_RULES.some((rule) =>
				[...this.pending.matchAll(rule.pattern)].some(
					(candidate) =>
						candidate.index < cut &&
						candidate.index + candidate[0].length === this.pending.length,
				),
			)
		) {
			const out = scrubSecrets(this.pending);
			this.pending = '';
			this.discardingSecret = true;
			return out;
		}
		const out = scrubSecrets(this.pending.slice(0, cut));
		this.pending = this.pending.slice(cut);
		return out;
	}

	/** Stream ended (or a complete line follows): scrub and release everything still held. */
	flush(): string {
		this.discardingSecret = false;
		if (this.pending.length === 0) return '';
		const out = scrubSecrets(this.pending);
		this.pending = '';
		return out;
	}
}
