import { classifyWebRun } from 'aidd-shared/runs/outcome';
import { Link } from 'react-router';

import type {
	InvocationRecord,
	TelemetryInvocationStatus,
	TelemetryResourceType,
} from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { ExecutionIdentityBadges } from '../../components/shared/ExecutionIdentityBadges.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { formatDate, formatDuration } from '../../lib/formatters.ts';
import { InvocationDetails } from './InvocationDetails.tsx';

function resourceLink(type: TelemetryResourceType, id: string): string {
	if (type === 'recipe') return `/recipes/${id}`;
	if (type === 'run') return '/runs';
	return '/skills';
}

export function InvocationsTable({ invocations }: { invocations: InvocationRecord[] }) {
	if (invocations.length === 0) return <EmptyState>No invocations recorded yet.</EmptyState>;
	return (
		<div className="overflow-x-auto">
			<table aria-label="Recent invocations" className="w-full text-left text-sm">
				<thead className="border-b bg-neutral-50 text-xs text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-900">
					<tr>
						{[
							'Resource',
							'Source',
							'Project',
							'Started',
							'Duration',
							'Status',
							'Details',
						].map((label) => (
							<th className="px-3 py-2" key={label} scope="col">
								{label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{invocations.map((invocation) => (
						<InvocationRow invocation={invocation} key={invocation.id} />
					))}
				</tbody>
			</table>
		</div>
	);
}

function InvocationRow({ invocation }: { invocation: InvocationRecord }) {
	return (
		<tr className="border-b last:border-0 dark:border-neutral-800">
			<td className="px-3 py-2">
				{invocation.parentResourceName && invocation.parentResourceType ? (
					<div className="text-xs text-neutral-500">
						<Link
							className="hover:underline"
							to={resourceLink(
								invocation.parentResourceType,
								invocation.parentResourceId ?? '',
							)}>
							{invocation.parentResourceName}
						</Link>{' '}
						→
					</div>
				) : null}
				<Link
					className="font-medium text-neutral-950 hover:underline dark:text-neutral-50"
					to={resourceLink(invocation.resourceType, invocation.resourceId)}>
					{invocation.resourceName}
				</Link>
				<div className="mt-1 flex flex-wrap items-center gap-1.5">
					<span className="text-[0.7rem] text-neutral-500">
						{invocation.resourceType}
					</span>
					<ExecutionIdentityBadges
						backend={invocation.backend}
						model={invocation.model}
					/>
				</div>
			</td>
			<td className="px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400">
				{invocation.source}
			</td>
			<td className="px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400">
				{invocation.projectName}
			</td>
			<td className="px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400">
				{formatDate(invocation.startedAt)}
			</td>
			<td className="px-3 py-2 text-xs text-neutral-600 tabular-nums dark:text-neutral-400">
				{invocation.durationMs === null ? '—' : formatDuration(invocation.durationMs)}
			</td>
			<td className="px-3 py-2">
				<InvocationStatusCell invocation={invocation} />
			</td>
			<td className="px-3 py-2 align-top">
				<InvocationDetails invocation={invocation} />
			</td>
		</tr>
	);
}

const statusTones: Record<
	TelemetryInvocationStatus,
	'amber' | 'emerald' | 'neutral' | 'red' | 'teal'
> = {
	completed: 'emerald',
	failed: 'red',
	killed: 'red',
	running: 'teal',
	stopped: 'amber',
};

function InvocationStatusCell({ invocation }: { invocation: InvocationRecord }) {
	if (invocation.runStatus) {
		const outcome = classifyWebRun({
			exitCode: invocation.runExitCode,
			status: invocation.runStatus,
			stopReason: invocation.runStopReason,
			summary: invocation.runSummary,
		});
		return (
			<span title={outcome.title}>
				<Badge tone={outcome.tone}>{outcome.label}</Badge>
				{outcome.label.toLowerCase() !== invocation.status && (
					<span className="mt-0.5 block text-[0.7rem] text-neutral-500">
						{invocation.status}
					</span>
				)}
			</span>
		);
	}
	return <Badge tone={statusTones[invocation.status]}>{invocation.status}</Badge>;
}
