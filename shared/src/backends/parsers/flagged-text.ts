import type { AgentErrorReason } from '../types.ts';

import { isRateLimitText } from './rate-limit-text.ts';

// Provider content-policy refusals ("This content was flagged for possible cybersecurity
// risk…"). Distinct from infrastructure provider errors so flagged runs classify and account
// separately (providerFlagged exit code instead of providerError). Applied only to provider
// error MESSAGE text, never to whole transcripts — "flagged" is far too common a word in
// ordinary agent output (audit findings, lint reports) to scan streams with.
const flaggedPattern = /\bflagged\b/i;

export function isProviderFlaggedText(value: string | undefined): boolean {
	return typeof value === 'string' && flaggedPattern.test(value);
}

/** Reason for a provider-originated error message: rate limits first (a throttle message that
 * mentions "flagged" is still a throttle), then content flags, then the generic provider bucket. */
export function providerErrorReason(message: string | undefined): AgentErrorReason {
	if (isRateLimitText(message)) return 'rate_limit';
	if (isProviderFlaggedText(message)) return 'provider_flagged';
	return 'provider';
}
