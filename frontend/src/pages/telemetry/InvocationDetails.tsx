import type { ReactNode } from 'react';

import type { InvocationRecord } from '../../api/types.ts';

import { formatDate, formatDuration } from '../../lib/formatters.ts';

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="min-w-0">
			<dt className="text-[0.65rem] font-medium tracking-wide text-neutral-500 uppercase">
				{label}
			</dt>
			<dd className="mt-0.5 text-xs break-all text-neutral-800 dark:text-neutral-200">
				{value ?? '—'}
			</dd>
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
				className="cursor-pointer text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-300">
				Inspect
			</summary>
			<div className="mt-2 w-[min(42rem,75vw)] rounded-md border border-neutral-200 bg-neutral-50 p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
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
					<div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-700">
						<div className="text-[0.65rem] font-medium tracking-wide text-red-600 uppercase dark:text-red-300">
							Error message
						</div>
						<pre className="mt-1 max-h-48 overflow-auto text-xs whitespace-pre-wrap text-red-800 dark:text-red-200">
							{invocation.errorMessage}
						</pre>
					</div>
				)}
			</div>
		</details>
	);
}
