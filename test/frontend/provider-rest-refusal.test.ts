import { describe, expect, test } from 'bun:test';

import { ApiError } from '../../frontend/src/api/client.ts';
import { launchHonoringRest, readRestRefusal } from '../../frontend/src/lib/providerRestRefusal.ts';

const refusalBody = {
	alternative: 'codex',
	backend: 'claude-code',
	code: 'provider_resting',
	error: 'claude-code is resting until 17:40 (quota)',
	reason: 'quota',
	until: '2026-10-09T22:40:00.000Z',
};

describe('readRestRefusal', () => {
	test('reads the refusal a launch route sends for a resting backend', () => {
		const error = new ApiError(refusalBody.error, 409, refusalBody);
		expect(readRestRefusal(error)).toEqual({
			alternative: 'codex',
			backend: 'claude-code',
			message: refusalBody.error,
		});
	});

	test('an alternative that is not a backend name is dropped, not trusted', () => {
		const error = new ApiError(refusalBody.error, 409, { ...refusalBody, alternative: 'gpt' });
		expect(readRestRefusal(error)?.alternative).toBeNull();
	});

	test('any other conflict is not a refusal', () => {
		expect(
			readRestRefusal(new ApiError('Project busy', 409, { error: 'busy' })),
		).toBeUndefined();
		expect(readRestRefusal(new ApiError('Nope', 400, refusalBody))).toBeUndefined();
		expect(readRestRefusal(new Error('plain'))).toBeUndefined();
	});
});

describe('launchHonoringRest', () => {
	test('passes a successful launch and any other failure straight through', async () => {
		expect(await launchHonoringRest({ backend: 'codex' }, () => Promise.resolve('run_1'))).toBe(
			'run_1',
		);
		const failure = new ApiError('Project busy', 409, { error: 'busy' });
		let thrown: unknown;
		try {
			await launchHonoringRest({}, () => Promise.reject(failure));
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBe(failure);
	});
});
