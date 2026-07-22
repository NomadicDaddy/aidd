import type { ResolvedWebConfig } from 'aidd-shared/config';

/**
 * Thin authenticated HTTP client for the local aidd web API.
 *
 * Shared by the MCP server and the chat bridge: both run on the same host as the
 * web backend, so the client always targets `127.0.0.1` — reachable regardless of
 * the configured bind and loopback-exempt from the bearer guard. The configured
 * token is still attached when present so the client keeps working if the guard
 * ever requires a token on loopback too.
 */
export interface AiddApiClient {
	readonly baseUrl: string;
	get<T = unknown>(path: string): Promise<T>;
	post<T = unknown>(path: string, body?: unknown): Promise<T>;
}

export class ApiClientError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'ApiClientError';
		this.status = status;
	}
}

function parseErrorDetail(text: string, statusText: string): string {
	if (text.length === 0) return statusText;
	try {
		const parsed: unknown = JSON.parse(text);
		if (parsed && typeof parsed === 'object' && 'error' in parsed) {
			return String((parsed as { error: unknown }).error);
		}
	} catch {
		// Non-JSON error body; fall through to the raw text.
	}
	return text.slice(0, 200);
}

export function createApiClient(web: Pick<ResolvedWebConfig, 'authToken' | 'port'>): AiddApiClient {
	const baseUrl = `http://127.0.0.1:${web.port}`;
	const authHeader: Record<string, string> = web.authToken
		? { authorization: `Bearer ${web.authToken}` }
		: {};

	async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const headers: Record<string, string> = { ...authHeader };
		const init: RequestInit = { headers, method };
		if (body !== undefined) {
			headers['content-type'] = 'application/json';
			init.body = JSON.stringify(body);
		}
		const response = await fetch(`${baseUrl}${path}`, init);
		const text = await response.text();
		if (!response.ok) {
			throw new ApiClientError(
				`${method} ${path} failed (${response.status}): ${parseErrorDetail(text, response.statusText)}`,
				response.status
			);
		}
		return (text.length > 0 ? JSON.parse(text) : null) as T;
	}

	return {
		baseUrl,
		get<T = unknown>(path: string): Promise<T> {
			return request<T>('GET', path);
		},
		post<T = unknown>(path: string, body?: unknown): Promise<T> {
			return request<T>('POST', path, body);
		},
	};
}

/**
 * Best-effort, bounded probe of the web backend that the channel processes proxy.
 * Shared by the MCP server and the chat bridge so both can report a clear
 * degraded state when the backend is not running.
 */
export async function isBackendReachable(baseUrl: string): Promise<boolean> {
	try {
		const response = await fetch(`${baseUrl}/api/v1/health`, {
			signal: AbortSignal.timeout(2000),
		});
		return response.ok;
	} catch {
		return false;
	}
}
