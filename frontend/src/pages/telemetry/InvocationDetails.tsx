import type { ReactNode } from 'react';

import type { InvocationRecord } from '../../api/types.ts';

import { Card } from '../../components/ui/card.tsx';
import { formatDate, formatDuration } from '../../lib/formatters.ts';
import { microLabelClass } from '../../lib/typography.ts';

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="min-w-0">
			<dt className={`text-muted-foreground ${microLabelClass}`}>{label}</dt>
			<dd className="mt-0.5 text-xs break-all text-foreground">{value ?? '—'}</dd>
		</div>
	);
}

function identifier(value: null | string): ReactNode {
	return value ? <span className="font-mono">{value}</span> : '—';
}

export function InvocationDetails({ invocation }: { invocation: InvocationRecord }) {
	const effectiveExitCode = invocation.runExitCode ?? invocation.exitCode;
	return (
		<details className="group min-w-24">
			<summary
				aria-label={`Inspect telemetry for ${invocation.resourceName}`}
				className="cursor-pointer text-xs font-medium text-accent hover:underline">
				Inspect
			</summary>
			{/* The nested panel differentiates by fill, not by a second border at the card's own
			    weight — the same `sunken` step the dashboard uses for a panel inside a panel. */}
			<Card className="mt-2 w-[min(42rem,75vw)] p-3" variant="sunken">
				<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<DetailItem label="Invocation ID" value={identifier(invocation.id)} />
					<DetailItem label="Resource ID" value={identifier(invocation.resourceId)} />
					<DetailItem label="Resource type" value={invocation.resourceType} />
					<DetailItem label="Project path" value={identifier(invocation.projectPath)} />
					<DetailItem label="Source" value={invocation.source} />
					<DetailItem
						label="Arguments supplied"
						value={invocation.argsPresent ? 'Yes — values are not stored' : 'No'}
					/>
					<DetailItem label="Started" value={formatDate(invocation.startedAt)} />
					<DetailItem
						label="Completed"
						value={
							invocation.completedAt === null
								? '—'
								: formatDate(invocation.completedAt)
						}
					/>
					<DetailItem
						label="Duration"
						value={
							invocation.durationMs === null
								? '—'
								: formatDuration(invocation.durationMs)
						}
					/>
					<DetailItem label="Raw invocation status" value={invocation.status} />
					<DetailItem label="Authoritative run status" value={invocation.runStatus} />
					<DetailItem label="Exit code" value={effectiveExitCode} />
					<DetailItem label="Run ID" value={identifier(invocation.runId)} />
					<DetailItem
						label="Pipeline session ID"
						value={identifier(invocation.sessionId)}
					/>
					<DetailItem
						label="Parent invocation ID"
						value={identifier(invocation.parentInvocationId)}
					/>
					<DetailItem
						label="Parent resource"
						value={
							invocation.parentResourceId
								? `${invocation.parentResourceType ?? 'unknown'} · ${invocation.parentResourceId}`
								: '—'
						}
					/>
				</dl>
				{invocation.errorMessage && (
					<div className="mt-3 border-t border-border pt-3">
						<div className={`text-red-600 dark:text-red-300 ${microLabelClass}`}>
							Error message
						</div>
						<pre className="mt-1 max-h-48 overflow-auto text-xs whitespace-pre-wrap text-red-800 dark:text-red-200">
							{invocation.errorMessage}
						</pre>
					</div>
				)}
			</Card>
		</details>
	);
}
