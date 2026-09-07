// Shared rate-limit phrase detection for all backend parsers. Matches provider throttle
// wording plus Claude Code account-limit phrasings ("session limit", "usage limit") that
// arrive as ordinary error text rather than a structured rate_limit_event.
const rateLimitPattern =
	/hit your (?:rate|session|usage|weekly) limit|session limit|usage limit (?:reached|exceeded)|rate limit exceeded|rate.?limited|too many requests|quota exceeded|HTTP 429|status code 429/i;

export function isRateLimitText(value: string | undefined): boolean {
	return typeof value === 'string' && rateLimitPattern.test(value);
}
