import { isLoopbackHostname } from 'aidd-shared';
import { Elysia } from 'elysia';

export function shouldEmitCrossOriginOpenerPolicy(url: URL): boolean {
	return url.protocol === 'https:' || isLoopbackHostname(url.hostname);
}

function applySecurityHeaders(headers: Headers, requestUrl: URL): void {
	headers.set('X-Content-Type-Options', 'nosniff');
	headers.set('X-Frame-Options', 'DENY');
	headers.set('X-XSS-Protection', '0');
	headers.set('Referrer-Policy', 'no-referrer');
	headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	if (shouldEmitCrossOriginOpenerPolicy(requestUrl)) {
		headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	} else {
		headers.delete('Cross-Origin-Opener-Policy');
	}
	headers.set('Cross-Origin-Resource-Policy', 'same-origin');
	headers.set(
		'Content-Security-Policy',
		[
			"default-src 'self'",
			"script-src 'self'",
			"worker-src 'self' blob:",
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data:",
			"connect-src 'self' ws: wss:",
			"font-src 'self' data:",
			"object-src 'none'",
			"base-uri 'self'",
			"frame-src 'none'",
			"frame-ancestors 'none'",
			"form-action 'self'",
		].join('; '),
	);

	if (!headers.has('Cache-Control')) {
		headers.set('Cache-Control', 'no-store');
	}
}

function numericStatus(status: number | string | undefined): number {
	if (typeof status === 'number') return status;
	if (typeof status === 'string') {
		const parsed = Number(status);
		if (Number.isInteger(parsed)) return parsed;
	}
	return 200;
}

function withSecurityHeaders(
	responseValue: unknown,
	request: Request,
	status: number | string | undefined,
): Response {
	const requestUrl = new URL(request.url);
	if (responseValue instanceof Response) {
		const headers = new Headers(responseValue.headers);
		applySecurityHeaders(headers, requestUrl);
		return new Response(responseValue.body, {
			headers,
			status: responseValue.status,
			statusText: responseValue.statusText,
		});
	}

	const headers = new Headers({
		'content-type': 'application/json; charset=utf-8',
	});
	applySecurityHeaders(headers, requestUrl);
	return new Response(JSON.stringify(responseValue ?? null), {
		headers,
		status: numericStatus(status),
	});
}

export const securityHeadersPlugin = new Elysia({ name: 'security-headers' }).mapResponse(
	{ as: 'global' },
	({ request, responseValue, set }) => withSecurityHeaders(responseValue, request, set.status),
);
