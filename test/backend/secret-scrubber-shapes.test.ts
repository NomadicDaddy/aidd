import { describe, expect, test } from 'bun:test';
import {
	scrubSecretFields,
	scrubSecrets,
	SECRET_REDACTED,
	StreamingSecretScrubber,
} from 'aidd-shared/lib/secretScrubber';

// The 2026-10-01 secret-handling audit found two database passwords in retained run transcripts.
// Both sat in the userinfo part of a `postgresql://` URL, a shape no rule covered, and the same
// sentinel run showed five more shapes surviving every scrub path. Every value here is assembled
// at runtime so no credential-shaped literal sits in the file.
const hex = 'ab12'.repeat(12);
const token = 'Zq9'.repeat(10);

interface Shape {
	name: string;
	/** Text carrying the secret. */
	text: string;
	/** The secret that must not survive. */
	secret: string;
	/** Text around the secret that must survive, so the rule is not over-broad. */
	kept: string[];
}

const SHAPES: Shape[] = [
	{
		kept: ['postgresql://app:', '@127.0.0.1:5432/farwake'],
		name: 'a password in URL userinfo',
		secret: hex,
		text: `DATABASE_URL is postgresql://app:${hex}@127.0.0.1:5432/farwake now`,
	},
	{
		kept: ['https://deploy:', '@example.test/repo.git'],
		name: 'a password in an https URL',
		secret: token,
		text: `cloning https://deploy:${token}@example.test/repo.git`,
	},
	{
		kept: ['key is '],
		name: 'an xai- key',
		secret: `xai-${token}`,
		text: `key is xai-${token} ok`,
	},
	{
		kept: ['oauth '],
		name: 'a gho_ token',
		secret: `gho_${token}`,
		text: `oauth gho_${token} ok`,
	},
	{
		kept: ['server '],
		name: 'a ghs_ token',
		secret: `ghs_${token}`,
		text: `server ghs_${token} ok`,
	},
	{
		kept: ['https://maps.example.test/api?key=', '&zoom=3'],
		name: 'a bare key query parameter',
		secret: token,
		text: `GET https://maps.example.test/api?key=${token}&zoom=3`,
	},
	{
		kept: ['tool --api-key ', ' --verbose'],
		name: 'a flag with a space-delimited value',
		secret: token,
		text: `tool --api-key ${token} --verbose`,
	},
	{
		kept: ['Cookie: '],
		name: 'a cookie header',
		secret: `session=${token}; theme=dark`,
		text: `Cookie: session=${token}; theme=dark`,
	},
];

describe('secret scrubber: shapes found surviving on 2026-10-01', () => {
	for (const shape of SHAPES) {
		test(`${shape.name} is redacted in plain text`, () => {
			const out = scrubSecrets(shape.text);
			expect(out).not.toContain(shape.secret);
			expect(out).toContain(SECRET_REDACTED);
			for (const kept of shape.kept) expect(out).toContain(kept);
		});

		test(`${shape.name} is redacted under an innocent field name`, () => {
			const out = JSON.stringify(scrubSecretFields({ note: shape.text }));
			expect(out).not.toContain(shape.secret);
		});

		test(`${shape.name} is redacted inside JSON inside a string`, () => {
			const out = scrubSecrets(
				JSON.stringify({ output: JSON.stringify({ line: shape.text }) }),
			);
			expect(out).not.toContain(shape.secret);
			expect(() => JSON.parse(out) as unknown).not.toThrow();
		});

		test(`${shape.name} is redacted when the stream splits it at any position`, () => {
			for (let cut = 1; cut < shape.text.length; cut += 1) {
				const scrubber = new StreamingSecretScrubber();
				const out =
					scrubber.write(shape.text.slice(0, cut)) +
					scrubber.write(shape.text.slice(cut)) +
					scrubber.flush();
				expect(out).not.toContain(shape.secret);
			}
		});

		test(`${shape.name} is redacted when streamed one character at a time`, () => {
			const scrubber = new StreamingSecretScrubber();
			let out = '';
			for (const character of shape.text) out += scrubber.write(character);
			out += scrubber.flush();
			expect(out).not.toContain(shape.secret);
		});
	}

	// The new rules must not eat ordinary text. Each of these was a way a looser rule would.
	test.each([
		'http://localhost:3210/path',
		'http://127.0.0.1:8080/a@b',
		'git@github.com:owner/repo.git',
		'mailto:someone@example.test',
		'see https://example.test/docs?page=2&sort=key',
		'run with --max-tokens 100 and --token-budget 5000',
		'the monkey=banana pair and a turnkey=solution',
		'task-1790852982 finished; ghost_writer_function_name_is_long_enough ran',
		'xai-short and gho_short are not credentials',
		'A cookie is a small file. Cookies: none.',
	])('ordinary text is unchanged: %s', (text) => {
		expect(scrubSecrets(text)).toBe(text);
	});
});
