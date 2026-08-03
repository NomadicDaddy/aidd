export const SECRET_REDACTED = '[REDACTED]';

interface SecretRule {
	readonly pattern: RegExp;
	readonly replacement: string;
}

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
		pattern:
			/\b(api[_-]?key|secret|token|password|passwd|pwd)(["']?\s*[:=]\s*["']?)([^\s"',;&]+)/gi,
		replacement: `$1$2${SECRET_REDACTED}`,
	},
];

export function scrubSecrets(value: string): string {
	let scrubbed = value;
	for (const rule of SECRET_RULES) {
		scrubbed = scrubbed.replace(rule.pattern, rule.replacement);
	}
	return scrubbed;
}

// Longest tail the streaming scrubber withholds while a match may still be forming across
// chunk boundaries. A dangerous suffix longer than this is emitted anyway to bound memory and
// console latency; every SECRET_RULES match in practice is far shorter than this window.
const STREAM_HOLD_MAX = 256;

// A suffix that could still grow into (part of) a SECRET_RULES match once more text arrives:
// a trailing non-whitespace run (a possibly partial token), or a Bearer / Authorization / key-
// value trigger whose value has not fully streamed yet. Everything before such a suffix is safe
// to emit: every rule ends in a contiguous non-whitespace token, and the only whitespace a
// match can contain sits between one of these triggers and its value. Keep in lockstep with
// SECRET_RULES — a new rule shape needs a corresponding alternative here.
const DANGEROUS_SUFFIX =
	/(?:Bearer\s*\S*|Authorization:?\s*\S*|\b(?:api[_-]?key|secret|token|password|passwd|pwd)(?:["']?\s*[:=]?\s*["']?\S*)?|\S+)$/i;

/**
 * Stateful scrubber for incrementally streamed text (live run-console chunks). Scrubbing each
 * chunk independently misses a secret split across a chunk boundary — neither half matches any
 * rule — so this buffers the smallest suffix that could still become a match and only emits
 * text once no rule can span the cut. `flush()` releases (and scrubs) whatever is still held.
 */
export class StreamingSecretScrubber {
	private pending = '';

	/** Append streamed text; returns the scrubbed portion that is safe to emit now. */
	write(chunk: string): string {
		this.pending += chunk;
		const tail = this.pending.slice(-STREAM_HOLD_MAX);
		const match = DANGEROUS_SUFFIX.exec(tail);
		const cut = this.pending.length - (match ? tail.length - match.index : 0);
		if (cut <= 0) return '';
		const out = scrubSecrets(this.pending.slice(0, cut));
		this.pending = this.pending.slice(cut);
		return out;
	}

	/** Stream ended (or a complete line follows): scrub and release everything still held. */
	flush(): string {
		if (this.pending.length === 0) return '';
		const out = scrubSecrets(this.pending);
		this.pending = '';
		return out;
	}
}
