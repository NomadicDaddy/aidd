import type { ScheduledExecutionChild } from 'aidd-shared/contracts/scheduled-tasks';

import { Link } from 'react-router';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { StatusDot } from '../../components/ui/badge.tsx';
import { humanizeEnum } from '../../lib/formatters.ts';
import { type Tone } from '../../lib/tones.ts';
import { microLabelClass } from '../../lib/typography.ts';

const CHILD_PREVIEW_LIMIT = 2;
const CHILD_TYPES = ['run', 'session', 'cycle'] as const;

const childTypeLabels: Record<ScheduledExecutionChild['type'], string> = {
	cycle: 'cycle',
	run: 'run',
	session: 'session',
};

function childTarget(child: ScheduledExecutionChild): string {
	if (child.type === 'cycle') return `/director?cycle=${encodeURIComponent(child.id)}`;
	if (child.type === 'run') return `/runs?run=${encodeURIComponent(child.id)}`;
	return `/pipeline-sessions/${encodeURIComponent(child.id)}`;
}

function groupLabel(type: ScheduledExecutionChild['type'], count: number): string {
	const noun = childTypeLabels[type];
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function childStatusTone(status: ScheduledExecutionChild['status']): Tone {
	if (status === 'completed') return 'emerald';
	if (status === 'failed' || status === 'killed') return 'red';
	if (status === 'queued' || status === 'running') return 'teal';
	if (
		status === 'completed_with_failures' ||
		status === 'stopped' ||
		status === 'waiting_approval'
	) {
		return 'amber';
	}
	return 'neutral';
}

function ChildLink({ child }: { child: ScheduledExecutionChild }) {
	return (
		<li>
			<Link
				className="inline-flex min-h-11 items-center gap-1.5 font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-0"
				to={childTarget(child)}>
				<StatusDot tone={childStatusTone(child.status)} />
				<span className="sr-only">{humanizeEnum(child.status)}: </span>
				{child.id}
			</Link>
		</li>
	);
}

export function ScheduledOccurrenceChildren({
	children,
}: {
	children: readonly ScheduledExecutionChild[];
}) {
	const groups = CHILD_TYPES.map((type) => ({
		children: children.filter((child) => child.type === type),
		type,
	})).filter((group) => group.children.length > 0);

	return (
		<div className="mt-2 space-y-2">
			{groups.map((group) => {
				const label = groupLabel(group.type, group.children.length);
				const preview = group.children.slice(0, CHILD_PREVIEW_LIMIT);
				const remainder = group.children.slice(CHILD_PREVIEW_LIMIT);
				return (
					<section
						className="border-l border-border pl-3"
						data-occurrence-child-type={group.type}
						key={group.type}>
						<p className={`${microLabelClass} text-muted-foreground tabular-nums`}>
							{label}
						</p>
						<ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
							{preview.map((child) => (
								<ChildLink child={child} key={child.id} />
							))}
						</ul>
						{remainder.length > 0 && (
							<details className="group mt-1">
								<summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm text-xs text-muted-foreground tabular-nums marker:content-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0">
									<DisclosureMarker />
									<span className="group-open:hidden">Show all</span>
									<span className="hidden group-open:inline">Show fewer</span>
								</summary>
								<ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
									{remainder.map((child) => (
										<ChildLink child={child} key={child.id} />
									))}
								</ul>
							</details>
						)}
					</section>
				);
			})}
		</div>
	);
}
