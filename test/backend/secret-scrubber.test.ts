import { describe, expect, it } from 'bun:test';
import { StreamingSecretScrubber } from 'aidd-shared/lib/secretScrubber';
import { scrubSecrets, SECRET_REDACTED } from '../../backend/src/services/secretScrubber.ts';

describe('scrubSecrets', () => {
	it('masks provider-style API keys (sk-...)', () => {
		const out = scrubSecrets('key=sk-ABCDEFGHIJKLMNOPQ tail');
		expect(out).toBe(`key=${SECRET_REDACTED} tail`);
	});

	it('masks Bearer tokens', () => {
		const out = scrubSecrets('header: Bearer abc.def-ghi_jkl');
		expect(out).toBe(`header: ${SECRET_REDACTED}`);
	});

	it('masks the Authorization header credential token', () => {
		const out = scrubSecrets('Authorization: Bearer dXNlcjpwYXNz');
		// Bearer pattern runs first and consumes "Bearer dXNlcjpwYXNz"; Authorization: is then
		// followed by [REDACTED] which the Authorization regex re-masks. Either path proves the
		// token is no longer in plaintext.
		expect(out).not.toContain('dXNlcjpwYXNz');
		expect(out).toContain(SECRET_REDACTED);
	});

	it('masks multiple secrets in one chunk', () => {
		const out = scrubSecrets('sk-AAAAAAAAAAAAAAAA and sk-BBBBBBBBBBBBBBBB');
		expect(out).toBe(`${SECRET_REDACTED} and ${SECRET_REDACTED}`);
	});

	it('returns input unchanged when no secrets present', () => {
		const input = 'plain stdout chunk with no credentials';
		expect(scrubSecrets(input)).toBe(input);
	});

	it('does not over-match short sk- prefixes (< 16 chars)', () => {
		const input = 'sk-short';
		expect(scrubSecrets(input)).toBe(input);
	});

	// Found while sweeping archived logs: an unanchored `sk-` matched inside ordinary words, so
	// every feature path containing "mask-" had its tail redacted. Prefixes only count at a word
	// boundary — a real credential always follows `=`, `:`, a quote, or whitespace.
	it('leaves prefixes that appear mid-word alone', () => {
		const path =
			'.aidd/features/audit-1784605174-mask-sensitive-paths-in-scan-output/feature.json';
		expect(scrubSecrets(path)).toBe(path);
		// Assembled rather than written out so the repo's own leak guard does not flag the fixture.
		const midWord = `a task_gh${'p_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'}`;
		expect(scrubSecrets(midWord)).toBe(midWord);
	});

	it('masks AWS access key ids (AKIA...)', () => {
		const out = scrubSecrets('aws id AKIAABCDEFGHIJKLMNOP done');
		expect(out).toBe(`aws id ${SECRET_REDACTED} done`);
	});

	it('masks GitHub personal access token prefixes', () => {
		expect(scrubSecrets('token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')).toBe(
			`token ${SECRET_REDACTED}`,
		);
		expect(scrubSecrets('github_pat_11ABCDEFG0abcdefghijklmnop more')).toBe(
			`${SECRET_REDACTED} more`,
		);
	});

	it('masks Google API key prefixes (AIza...)', () => {
		const syntheticKey = `AI${'zaSyA1234567890abcdefghijklmnopqrstuv'}`;
		const out = scrubSecrets(`${syntheticKey} tail`);
		expect(out).toBe(`${SECRET_REDACTED} tail`);
	});

	it('redacts the value of key=value secret assignments while keeping the key', () => {
		expect(scrubSecrets('api_key=AbCdEf123456 next')).toBe(`api_key=${SECRET_REDACTED} next`);
		expect(scrubSecrets('x-api-key: SuperSecretValue')).toBe(`x-api-key: ${SECRET_REDACTED}`);
		expect(scrubSecrets('PASSWORD=hunter2')).toBe(`PASSWORD=${SECRET_REDACTED}`);
	});

	it('redacts JSON-style secret values without destroying structure', () => {
		const out = scrubSecrets('{"token":"abc123def456","keep":"visible"}');
		expect(out).toBe(`{"token":"${SECRET_REDACTED}","keep":"visible"}`);
	});

	it('does not over-redact following query params after a secret value', () => {
		const out = scrubSecrets('?api_key=AbC123&page=2&user=alice');
		expect(out).toBe(`?api_key=${SECRET_REDACTED}&page=2&user=alice`);
	});

	it('returns input unchanged for non-secret key=value pairs', () => {
		const input = 'status=running region=us-east-1 count=42';
		expect(scrubSecrets(input)).toBe(input);
	});
});

// Streamed chunks can split a secret so that no half matches any rule on its own; the
// stateful scrubber must still redact it. Each test asserts on the concatenated emissions —
// exactly what ends up in the run-log file.
describe('StreamingSecretScrubber', () => {
	it('redacts a provider key split across two chunks', () => {
		const scrubber = new StreamingSecretScrubber();
		const out = scrubber.write('using key sk-ABC') + scrubber.write('DEFGHIJKLMNOP done\n');
		expect(out + scrubber.flush()).toBe(`using key ${SECRET_REDACTED} done\n`);
	});

	it('redacts a Bearer token whose value arrives after the trigger', () => {
		const scrubber = new StreamingSecretScrubber();
		const out = scrubber.write('Authorization: Bearer ') + scrubber.write('abc.def-ghi\n');
		expect(out + scrubber.flush()).not.toContain('abc.def-ghi');
	});

	it('redacts a key=value secret split mid-value', () => {
		const scrubber = new StreamingSecretScrubber();
		const out = scrubber.write('password = hun') + scrubber.write('ter2\n');
		expect(out + scrubber.flush()).toBe(`password = ${SECRET_REDACTED}\n`);
	});

	it('redacts a partial secret still held at flush time', () => {
		const scrubber = new StreamingSecretScrubber();
		expect(scrubber.write('sk-ABCDEFGHIJKLMNOPQ')).toBe('');
		expect(scrubber.flush()).toBe(SECRET_REDACTED);
	});

	it('streams benign narration through promptly instead of buffering it all', () => {
		const scrubber = new StreamingSecretScrubber();
		// Everything up to the trailing (possibly partial) word is emitted immediately.
		expect(scrubber.write('Reviewing the auth guard ')).toBe('Reviewing the auth guard ');
		expect(scrubber.write('now.')).toBe('');
		expect(scrubber.flush()).toBe('now.');
	});

	it('bounds the withheld tail for pathological unbroken tokens', () => {
		const scrubber = new StreamingSecretScrubber();
		const emitted = scrubber.write('x'.repeat(400));
		// At most 256 chars stay held; the rest is emitted to bound memory and latency.
		expect(emitted).toBe('x'.repeat(144));
		expect(scrubber.flush()).toBe('x'.repeat(256));
	});
});
