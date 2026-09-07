import { describe, expect, test } from 'bun:test';
import {
	scrubSecretFields,
	scrubSecrets,
	StreamingSecretScrubber,
} from 'aidd-shared/lib/secretScrubber';

const KEYS = [
	'apiKey',
	'authToken',
	'botToken',
	'accessToken',
	'refreshToken',
	'XAI_API_KEY',
	'ZHIPU_API_KEY',
	'OPENAI_API_KEY',
	'NATIVE_API_KEY',
];
const VALUE = 'AUDIT_FAKE_VALUE_123456789';

describe('configured secret fields', () => {
	test.each(KEYS)('redacts %s in text, JSON and nested serialized envelopes', (key) => {
		const payload = JSON.stringify({ [key]: VALUE, keep: 'visible' });
		const envelopes = [
			`${key}=${VALUE}`,
			payload,
			JSON.stringify({ output: payload }),
			`tool output: ${JSON.stringify({ output: payload })}`,
		];
		for (const envelope of envelopes) {
			expect(scrubSecrets(envelope)).not.toContain(VALUE);
			for (let split = 0; split <= envelope.length; split++) {
				const stream = new StreamingSecretScrubber();
				const output =
					stream.write(envelope.slice(0, split)) +
					stream.write(envelope.slice(split)) +
					stream.flush();
				expect(output).not.toContain(VALUE);
			}
			const stream = new StreamingSecretScrubber();
			expect(
				[...envelope].map((char) => stream.write(char)).join('') + stream.flush(),
			).not.toContain(VALUE);
		}
	});

	test('preserves nested JSON structure and masks whole quoted values', () => {
		const source = { rows: [{ authToken: 'fake value with "quotes"', keep: 7 }], empty: null };
		const cleaned = scrubSecretFields(source);
		expect(cleaned).toEqual({ rows: [{ authToken: '[REDACTED]', keep: 7 }], empty: null });
		expect(source.rows[0]?.authToken).toBe('fake value with "quotes"');
		const output = scrubSecrets(JSON.stringify({ output: JSON.stringify(source) }));
		const parsed = JSON.parse(output) as { output: string };
		expect(JSON.parse(parsed.output)).toEqual(cleaned);
	});

	test('does not leak a long credential when the streaming window fills', () => {
		const stream = new StreamingSecretScrubber();
		const output =
			stream.write(`authToken=${'A'.repeat(400)}`) +
			stream.write('B'.repeat(400)) +
			stream.write('&keep=visible\n') +
			stream.flush();
		expect(output).toBe('authToken=[REDACTED]&keep=visible\n');
	});

	test('scrubs pino output after Error serialization and message interpolation', () => {
		const script = `import { webLogger } from './backend/src/logger.ts';
			webLogger.info({ authToken: '${VALUE}', nested: { env: { XAI_API_KEY: '${VALUE}' } },
				error: new Error('authToken=${VALUE}') }, 'botToken=%s', '${VALUE}');`;
		const result = Bun.spawnSync([process.execPath, '-e', script], { cwd: process.cwd() });
		expect(result.exitCode).toBe(0);
		const output = result.stdout.toString();
		expect(output).not.toContain(VALUE);
		const parsed = JSON.parse(output) as {
			error: { message: string; stack: string };
			msg: string;
		};
		expect(parsed.error.message).toContain('[REDACTED]');
		expect(parsed.error.stack).toContain('Error:');
		expect(parsed.msg).toBe('botToken=[REDACTED]');
	});
});
