import { Link } from 'react-router';

import { Card } from '../../components/ui/card.tsx';

function DisclosureItem({ children, title }: { children: string; title: string }) {
	return (
		<div>
			<h3 className="text-xs font-semibold text-foreground">{title}</h3>
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
		<Card className="space-y-3 border-border bg-accent-muted">
			<details className="group">
				<summary className="cursor-pointer list-none marker:content-none">
					<span className="flex items-start gap-1.5">
						<span
							aria-hidden="true"
							className="mt-0.5 inline-block transition-transform group-open:rotate-90">
							›
						</span>
						<span className="min-w-0">
							<span className="text-sm font-semibold text-foreground">
								What aidd records
							</span>
							<span className="mt-1 block text-xs leading-5 text-muted-foreground">
								All telemetry stays in this local aidd installation. aidd does not
								send usage data to its maintainers or third-party tracking services.
							</span>
						</span>
					</span>
				</summary>
				<div className="mt-3 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
					<DisclosureItem title="Invocations">
						Resource and project identity, source, backend and model, timestamps,
						duration, outcome, exit and error information, hierarchy, and run/session
						links. aidd records only whether arguments were supplied to a skill or
						recipe step, never their values.
					</DisclosureItem>
					<DisclosureItem title="Run output">
						Files and lines changed plus input, cached, output, and reasoning token
						counts when the execution backend reports them. Coverage counts identify
						runs without captured metrics.
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
					className="font-medium text-accent hover:underline"
					to="/settings?tab=control-panel">
					View system and browser metrics
				</Link>
				<span className="text-muted-foreground">
					AI call logs rotate at 10 MB with up to five archived files.
				</span>
			</div>
		</Card>
	);
}
