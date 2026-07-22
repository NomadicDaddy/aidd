export type RuntimeAction = 'restart' | 'shutdown';

const RESTART_TARGET_TIMEOUT_MS = 25_000;
const RESTART_TARGET_POLL_MS = 500;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function waitForRestartTarget(redirectUrl: string): Promise<void> {
	const healthUrl = new URL('/api/v1/health', redirectUrl).toString();
	const deadline = Date.now() + RESTART_TARGET_TIMEOUT_MS;
	while (Date.now() < deadline) {
		try {
			await fetch(healthUrl, { cache: 'no-store', mode: 'no-cors' });
			return;
		} catch {
			await sleep(RESTART_TARGET_POLL_MS);
		}
	}
}
