import {
	BACKEND_LOG_ARCHIVE_MAX_AGE_MS,
	BACKEND_LOG_MAX_ARCHIVES,
	BACKEND_LOG_MAX_BYTES,
	EXECUTION_HISTORY_MAX_AGE_MS,
	TRANSCRIPT_MAX_AGE_MS,
	TRANSCRIPT_MAX_BYTES,
} from 'aidd-shared/retention';
import { Link } from 'react-router';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';

const DAY_MS = 24 * 60 * 60 * 1_000;
const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

/**
 * One category of what gets recorded.
 *
 * `text-xs font-semibold` was a third heading step: `ui/card` defines exactly two — `section` at
 * 16px and `subsection` at 14px — and these four rendered at 12px, below both. They are `h3` under
 * the card's own `h2` now, at the `subsection` size, so the page's heading outline is contiguous and
 * the card stops carrying type the rest of the app does not have.
 */
function DisclosureItem({ children, title }: { children: string; title: string }) {
	return (
		<div>
			<h3 className="text-sm font-semibold text-foreground">{title}</h3>
			<p className="mt-1 text-xs leading-5 text-muted-foreground">{children}</p>
		</div>
	);
}

/**
 * The privacy statement, folded.
 *
 * Expanded it filled the whole region between the filter bar and the first metric — four columns of
 * dense prose — so on a page whose job is dense analysis the headline number started at the fold.
 * The promise itself stays visible on every load because that is what the card is for; only the
 * per-category detail folds away. The link out to the metrics view sits outside the disclosure
 * because it is a destination, not part of the statement.
 */
export function TelemetryDisclosure() {
	return (
		<Card className="@container space-y-3">
			<details className="group">
				{/* The title goes through `CardHeader` like every other card title on the page. It
				    was a bare `span` at 14px, so the one card whose content is four headings opened
				    with no heading at all and those four hung straight off the page `h1` with the
				    level between them missing. `mb-0` is safe here despite the Card's `space-y-3`:
				    the header is inside the `summary`, not a direct child of the Card, so the
				    card's own rhythm is not what this is cancelling.

				    The chevron rides in the header's `icon` slot and is the app's lucide one, not a
				    literal '›' — the other `<details>` on this page kept the browser's native
				    triangle, so one page offered two unrelated disclosure affordances and neither
				    was the app's. */}
				<summary className="cursor-pointer list-none marker:content-none">
					<CardHeader
						className="mb-0"
						description="All telemetry stays in this local aidd installation. aidd does not send usage data to its maintainers or third-party tracking services."
						icon={<DisclosureMarker />}
						title="What aidd records"
					/>
				</summary>
				<div className="mt-3 grid gap-4 @min-[45rem]:grid-cols-2 @min-[75rem]:grid-cols-4">
					<DisclosureItem title="Invocations">
						Resource and project identity, source, CLI and model, timestamps, duration,
						outcome, exit and error information, hierarchy, and run/session links. aidd
						records only whether arguments were supplied to a skill or recipe step,
						never their values.
					</DisclosureItem>
					<DisclosureItem title="Run output">
						Files and lines changed plus input, cached, output, and reasoning token
						counts when the execution CLI reports them. Coverage counts identify runs
						without captured metrics.
					</DisclosureItem>
					<DisclosureItem title="System and browser health">
						CPU, memory, heap, RSS, disk, event-loop latency, connections, requests, and
						Core Web Vitals with a sanitized route path. Samples are retained locally
						for up to 30 days.
					</DisclosureItem>
					<DisclosureItem title="AI call diagnostics">
						A rotating local log records call timing, provider/model, endpoint host,
						request size, success or error details, source, optional project/run
						identity, and reported tokens. Prompt and response contents are not recorded
						in this diagnostic log.
					</DisclosureItem>
				</div>
			</details>
			<div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
				<Link
					className={`font-medium text-accent hover:underline ${touchTargetTextClass}`}
					to="/settings?tab=control-panel">
					View system and browser metrics
				</Link>
				<span className="text-muted-foreground">
					Run transcripts are retained for up to {TRANSCRIPT_MAX_AGE_MS / DAY_MS} days
					within a {TRANSCRIPT_MAX_BYTES / GIB} GiB cap; terminal execution history is
					retained for {EXECUTION_HISTORY_MAX_AGE_MS / DAY_MS} days. Backend logs rotate
					at {BACKEND_LOG_MAX_BYTES / MIB} MiB with up to {BACKEND_LOG_MAX_ARCHIVES}{' '}
					archives for {BACKEND_LOG_ARCHIVE_MAX_AGE_MS / DAY_MS} days. AI call logs use
					the same size and archive-count bounds.
				</span>
			</div>
		</Card>
	);
}
