/**
 * Shared SSRF (Server-Side Request Forgery) guard for outbound provider requests.
 *
 * This module is the **single implementation** of the base-URL validation used on both
 * the settings-write path (backend) and the outbound call path (shared agent client
 * and Direct AI). By keeping one canonical copy in the shared workspace, every code
 * path that issues an outbound `fetch()` to a provider baseUrl validates against the
 * same blocklist — a baseUrl set directly in `~/.aidd/config.json` (or via an env
 * override, a synced config, or a project-level override) cannot reach the network
 * unvalidated.
 *
 * Design note: Private/loopback ranges are intentionally NOT blocked — local and LAN
 * self-hosted inference servers (Ollama, vLLM, etc.) are a supported provider
 * configuration. Only cloud-metadata endpoints (the canonical SSRF target for
 * credential theft) are blocked outright.
 */

/**
 * Cloud-instance metadata endpoints. These are never legitimate LLM hosts and are the
 * canonical SSRF target (credential theft via the instance metadata service), so they
 * are blocked outright. Private/loopback ranges are intentionally NOT blocked — local
 * and LAN self-hosted inference servers (Ollama, vLLM, etc.) are a supported provider
 * configuration.
 */
export const BLOCKED_METADATA_HOSTS = new Set([
	'100.100.100.200', // Alibaba Cloud metadata
	'169.254.169.254', // AWS / Azure / GCP IMDS
	'fd00:ec2::254', // AWS IMDSv6
	'metadata.goog',
	'metadata.google.internal',
]);

/**
 * Normalizes a URL hostname so common SSRF-blocklist evasions resolve to their canonical
 * dotted-quad form: surrounding brackets, IPv4-mapped IPv6 (`::ffff:a.b.c.d`), and bare
 * integer IPs (decimal `2852039166` or hex `0xA9FEA9FE`). DNS names that resolve to a
 * blocked IP are intentionally not handled here (would require runtime resolution); the
 * authenticated config API is the primary control, this is defense-in-depth.
 * @param hostname - The URL hostname (may include surrounding brackets for IPv6).
 * @returns The canonicalized host string for blocklist comparison.
 */
export function normalizeHostForBlocklist(hostname: string): string {
	let host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
	host = host.replace(/^::ffff:/, '');
	// IPv4-mapped IPv6 rendered as two hex groups (e.g. `a9fe:a9fe` → `169.254.169.254`).
	const hexPair = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
	if (hexPair) {
		const highHex = hexPair[1];
		const lowHex = hexPair[2];
		if (highHex === undefined || lowHex === undefined) return host;
		const hi = Number.parseInt(highHex, 16);
		const lo = Number.parseInt(lowHex, 16);
		return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
	}
	// Bare integer IPs (decimal `2852039166` / hex `0xA9FEA9FE`). URL parsing usually
	// canonicalizes these already; handled here too for non-URL callers / robustness.
	const asInt = /^\d+$/.test(host)
		? Number(host)
		: /^0x[0-9a-f]+$/.test(host)
			? Number.parseInt(host, 16)
			: NaN;
	if (Number.isInteger(asInt) && asInt >= 0 && asInt <= 0xff_ff_ff_ff) {
		const n = asInt >>> 0;
		return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
	}
	return host;
}

/**
 * Guards a provider/Direct-AI base URL against SSRF-to-other-protocols and the cloud
 * metadata endpoint. This runs on every settings write AND at outbound call time so a
 * base URL set through any path cannot redirect server-side agent requests at internal
 * infrastructure.
 * @param rawUrl - The base URL string to validate.
 * @param label - Human-readable subject for the error message (e.g. `Provider "zhipu"`).
 */
export function assertSafeAgentBaseUrl(rawUrl: string, label: string): void {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new Error(`${label} base URL is not a valid URL: ${rawUrl}`);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(
			`${label} base URL must use http or https (got "${url.protocol.replace(/:$/, '')}").`,
		);
	}
	const host = normalizeHostForBlocklist(url.hostname);
	if (BLOCKED_METADATA_HOSTS.has(host) || host.endsWith('.metadata.google.internal')) {
		throw new Error(
			`${label} base URL points at a cloud metadata endpoint (${url.hostname}), which is not permitted.`,
		);
	}
}
