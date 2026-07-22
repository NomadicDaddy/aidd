import { Elysia } from 'elysia';

import { webLogger } from '../logger.ts';
import { HttpError } from '../services/errors.ts';

export const errorHandlerPlugin = new Elysia({ name: 'error-handler' }).onError(
	{ as: 'global' },
	({ code, error, set }) => {
		if (error instanceof HttpError) {
			set.status = error.status;
			return { error: error.message };
		}
		if (code === 'VALIDATION') {
			set.status = 400;
			return { error: 'Request validation failed' };
		}
		if (code === 'PARSE') {
			set.status = 400;
			return { error: 'Request body must be valid JSON' };
		}
		if (code === 'NOT_FOUND') {
			set.status = 404;
			return { error: 'Not found' };
		}
		webLogger.error({ err: error }, 'unhandled web error');
		set.status = 500;
		const message = error instanceof Error ? error.message : String(error);
		return { error: message };
	}
);
