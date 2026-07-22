import { Elysia } from 'elysia';

export function createHealthRoutes() {
	return new Elysia({ prefix: '/api/v1' }).get('/health', () => ({
		status: 'ok',
	}));
}
