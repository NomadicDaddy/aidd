import type {
	ProviderRestSetResponse,
	ProviderRestState,
} from 'aidd-shared/contracts/provider-rest';

import {
	AUTO_REST_BACKENDS,
	DEFAULT_PROVIDER_REST_SUBSTITUTES,
} from 'aidd-shared/provider-rest/decide';
import {
	clearProviderRest,
	readProviderRests,
	writeProviderRest,
} from 'aidd-shared/provider-rest/store';
import { Elysia, t } from 'elysia';

import type { WebContext } from '../context.ts';

import { HttpError } from '../services/errors.ts';
import { backendNameBody } from './schemas/backend.ts';

/**
 * The panel's provider rest control: list the rests in force, rest a backend by hand until a time,
 * or end a rest early. The same files the CLI reads, so a rest set here holds for direct CLI runs
 * too. A rest set here is 'manual'; rate limits write their own.
 */
export function createProviderRestRoutes(context: WebContext) {
	const params = t.Object({ backend: backendNameBody });
	return new Elysia({ prefix: '/api/v1/provider-rest' })
		.get('/', async () => {
			const substitutes =
				context.config.providerRestSubstitutes ?? DEFAULT_PROVIDER_REST_SUBSTITUTES;
			const state: ProviderRestState = {
				autoRestBackends: [...AUTO_REST_BACKENDS],
				rests: await readProviderRests(context.config.web.dataDir),
				substitutes: [...substitutes],
			};
			return state;
		})
		.put(
			'/:backend',
			async ({ body, params: { backend } }) => {
				const until = Date.parse(body.until);
				const now = Date.now();
				if (Number.isNaN(until)) throw new HttpError('until must be a date and time', 400);
				if (until <= now) throw new HttpError('until must be in the future', 400);
				const rest = {
					backend,
					reason: body.reason?.trim() ?? '',
					setAt: new Date(now).toISOString(),
					source: 'manual' as const,
					until: new Date(until).toISOString(),
				};
				await writeProviderRest(context.config.web.dataDir, rest);
				const response: ProviderRestSetResponse = { rest };
				return response;
			},
			{
				body: t.Object({
					reason: t.Optional(t.String({ maxLength: 200 })),
					until: t.String({ minLength: 1 }),
				}),
				params,
			},
		)
		.delete(
			'/:backend',
			async ({ params: { backend } }) => {
				await clearProviderRest(context.config.web.dataDir, backend);
				return { cleared: true };
			},
			{ params },
		);
}
