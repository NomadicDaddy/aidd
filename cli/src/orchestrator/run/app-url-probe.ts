import { assertSafeAgentBaseUrl } from 'aidd-shared';

import type { AppUrlStatus } from '../../prompts/compile/launch-context.ts';

const PROBE_TIMEOUT_MS = 3000;

type AppUrlFetcher = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Ask the launcher-managed app address whether it is still answering, immediately before an
 * iteration's prompt is compiled. A run that inherits a dead address would otherwise spend most
 * of an iteration rediscovering that fact; aidd establishes it in one request instead.
 *
 * Any HTTP response counts as live — a 404 or 500 still proves a server is listening, and the
 * probe is about reachability, not health. Only a transport failure or the timeout means
 * unreachable. Without an address there is nothing to assert, so the status stays `unknown` and
 * the prompt says nothing about liveness.
 */
export async function probeAppUrl(
	appUrl: string | undefined,
	fetchImpl: AppUrlFetcher = fetch,
): Promise<AppUrlStatus> {
	if (!appUrl) return 'unknown';
	try {
		assertSafeAgentBaseUrl(appUrl, 'Launch-context application');
		const response = await fetchImpl(appUrl, {
			redirect: 'manual',
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		await response.body?.cancel();
		return 'live';
	} catch {
		return 'unreachable';
	}
}
