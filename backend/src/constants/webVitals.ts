// Core Web Vitals "good" thresholds (Google's recommended upper bounds). The frontend already
// attaches a rating to each measurement; these are used server-side only to annotate the summary
// so an operator sees each metric's average against its target. Mirrors spernakit's
// constants/webVitals.ts so the two stay homogeneous.

/** Cumulative Layout Shift — unitless; visual stability, lower is better. */
export const CLS_THRESHOLD = 0.1;
/** First Contentful Paint — ms; lower is better. */
export const FCP_THRESHOLD = 1800;
/** Interaction to Next Paint — ms; input responsiveness, lower is better. */
export const INP_THRESHOLD = 200;
/** Largest Contentful Paint — ms; lower is better. */
export const LCP_THRESHOLD = 2500;
/** Time to First Byte — ms; lower is better. */
export const TTFB_THRESHOLD = 600;

/** Threshold lookup keyed by web-vital name (uppercase, as web-vitals reports it). */
export const WEB_VITAL_THRESHOLDS: Record<string, number> = {
	CLS: CLS_THRESHOLD,
	FCP: FCP_THRESHOLD,
	INP: INP_THRESHOLD,
	LCP: LCP_THRESHOLD,
	TTFB: TTFB_THRESHOLD,
};

/** The web vitals reported and summarized, in display order. */
export const WEB_VITAL_NAMES = ['CLS', 'FCP', 'INP', 'LCP', 'TTFB'] as const;
