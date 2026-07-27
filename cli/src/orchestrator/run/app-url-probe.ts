import type { AppUrlStatus } from '../../prompts/compile/launch-context.ts';

const PROBE_TIMEOUT_MS = 3000;

/**
 * Ask the launcher-managed app address whether it is still answering, immediately before an
 * iteration's prompt is compiled. Runs that inherited a dead address used to spend most of an
 * iteration rediscovering that fact; aidd can establish it in one request instead.
 *
 * Any HTTP response counts as live — a 404 or 500 still proves a server is listening, and the
 * probe is about reachability, not health. Only a transport failure or the timeout means
 * unreachable. Without an address there is nothing to assert, so the status stays `unknown` and
 * the prompt says nothing about liveness.
 */
export async function probeAppUrl(appUrl: string | undefined): Promise<AppUrlStatus> {
	if (!appUrl) return 'unknown';
	try {
		const response = await fetch(appUrl, {
			redirect: 'manual',
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});
		await response.body?.cancel();
		return 'live';
	} catch {
		return 'unreachable';
	}
}
