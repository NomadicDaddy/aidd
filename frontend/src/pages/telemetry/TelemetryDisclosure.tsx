import { Link } from 'react-router-dom';

import { Card } from '../../components/ui/card.tsx';

function DisclosureItem({ children, title }: { children: string; title: string }) {
	return (
		<div>
			<h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
				{title}
			</h3>
			<p className="mt-1 text-xs leading-5 text-neutral-600 dark:text-neutral-400">
				{children}
			</p>
		</div>
	);
}

export function TelemetryDisclosure() {
	return (
		<Card className="space-y-4 border-teal-200 bg-teal-50/40 dark:border-teal-900 dark:bg-teal-950/10">
			<div>
				<h2 className="text-foreground text-sm font-semibold">What aidd records</h2>
				<p className="mt-1 text-xs leading-5 text-neutral-600 dark:text-neutral-400">
					All telemetry stays in this local aidd installation. aidd does not send usage
					data to its maintainers or third-party tracking services.
				</p>
			</div>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<DisclosureItem title="Invocations">
					Resource and project identity, source, backend and model, timestamps, duration,
					outcome, exit and error information, hierarchy, and run/session links. aidd
					records only whether arguments were supplied to a skill or recipe step, never
					their values.
				</DisclosureItem>
				<DisclosureItem title="Run output">
					Files and lines changed plus input, cached, output, and reasoning token counts
					when the execution backend reports them. Coverage counts identify runs without
					captured metrics.
				</DisclosureItem>
				<DisclosureItem title="System and browser health">
					CPU, memory, heap, RSS, disk, event-loop latency, connections, requests, and
					Core Web Vitals with a sanitized route path. Samples are retained locally for up
					to 30 days.
				</DisclosureItem>
				<DisclosureItem title="AI call diagnostics">
					A rotating local log records call timing, provider/model, endpoint host, request
					size, success or error details, source, optional project/run identity, and
					reported tokens. Prompt and response contents are not recorded in this
					diagnostic log.
				</DisclosureItem>
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
				<Link
					className="font-medium text-teal-700 hover:underline dark:text-teal-300"
					to="/settings?tab=control-panel">
					View system and browser metrics
				</Link>
				<span className="text-neutral-500">
					AI call logs rotate at 10 MB with up to five archived files.
				</span>
			</div>
		</Card>
	);
}
