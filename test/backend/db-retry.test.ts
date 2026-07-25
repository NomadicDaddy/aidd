import { describe, expect, test } from 'bun:test';
import { withSqliteRetry } from '../../backend/src/db/retry.ts';

function busyError(code = 'SQLITE_BUSY', message = 'database is locked'): Error {
	const err = new Error(message) as { code?: string } & Error;
	err.code = code;
	return err;
}

describe('withSqliteRetry', () => {
	test('returns the operation result without retrying on first success', async () => {
		let calls = 0;
		const result = await withSqliteRetry(() => {
			calls++;
			return 42;
		});
		expect(result).toBe(42);
		expect(calls).toBe(1);
	});

	test('retries transient lock errors and then succeeds', async () => {
		let calls = 0;
		const result = await withSqliteRetry(
			() => {
				calls++;
				if (calls < 3) throw busyError();
				return 'ok';
			},
			{ attempts: 5, baseDelayMs: 1, maxDelayMs: 2 },
		);
		expect(result).toBe('ok');
		expect(calls).toBe(3);
	});

	test('rethrows a non-retryable error immediately', async () => {
		let calls = 0;
		await expect(
			withSqliteRetry(() => {
				calls++;
				throw new Error('UNIQUE constraint failed');
			}),
		).rejects.toThrow(/UNIQUE constraint failed/);
		expect(calls).toBe(1);
	});

	test('gives up after exhausting attempts on a persistent lock error', async () => {
		let calls = 0;
		await expect(
			withSqliteRetry(
				() => {
					calls++;
					throw busyError();
				},
				{ attempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
			),
		).rejects.toThrow(/database is locked/);
		expect(calls).toBe(3);
	});

	test('recognizes SQLITE_BUSY_SNAPSHOT carried only in the message', async () => {
		let calls = 0;
		const result = await withSqliteRetry(
			() => {
				calls++;
				if (calls < 2) throw new Error('SQLITE_BUSY_SNAPSHOT: database is locked');
				return 1;
			},
			{ attempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
		);
		expect(result).toBe(1);
		expect(calls).toBe(2);
	});

	test('awaits async operations and surfaces their resolved value', async () => {
		const result = await withSqliteRetry(async () => {
			await Promise.resolve();
			return 'async-ok';
		});
		expect(result).toBe('async-ok');
	});
});
