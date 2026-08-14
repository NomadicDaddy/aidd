import type { ReactNode } from 'react';

import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';

import type { ProjectAuditEntry, ProjectFeature } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Tooltip } from '../../../components/ui/tooltip.tsx';
import { bandTone, describeChangePotential } from '../../audits/auditsUtils.ts';
import { auditPathTail, describeFreshAge, describeReportFreshness } from './auditsTabUtils.ts';

const tooltipTriggerClass =
	'inline-flex max-w-full min-w-0 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none max-sm:min-h-11 max-sm:min-w-11';

function ExplainedBadge({ children, content }: { children: ReactNode; content: string }) {
	return (
		<Tooltip content={content}>
			<button className={tooltipTriggerClass} type="button">
				{children}
			</button>
		</Tooltip>
	);
}

export function AuditStateBadge({ entry }: { entry: ProjectAuditEntry }) {
	if (entry.overrideEffect === 'required') {
		return (
			<ExplainedBadge content="Enabled by a project override">
				<Badge tone="neutral">Overridden on</Badge>
			</ExplainedBadge>
		);
	}
	if (entry.overrideEffect === 'disabled' || entry.overrideEffect === 'excluded') {
		return (
			<ExplainedBadge content="Disabled by a project override">
				<Badge tone="neutral">Overridden off</Badge>
			</ExplainedBadge>
		);
	}
	if (entry.enabled) return <span className="text-xs text-muted-foreground">Enabled</span>;
	if (!entry.appliesToBucket) {
		return (
			<ExplainedBadge content="Disabled by the project's assurance profile">
				<Badge tone="neutral">Profile-disabled</Badge>
			</ExplainedBadge>
		);
	}
	return <Badge tone="neutral">Disabled</Badge>;
}

export function AuditPath({ entry }: { entry: ProjectAuditEntry }) {
	return (
		<Tooltip content={entry.path}>
			<button
				aria-label={`Full path for ${entry.name}`}
				className={`${tooltipTriggerClass} max-w-full truncate font-mono text-xs text-muted-foreground`}
				type="button">
				{auditPathTail(entry.path)}
			</button>
		</Tooltip>
	);
}

export function AuditChangePotential({ entry }: { entry: ProjectAuditEntry }) {
	if (!entry.changePotential) return <span className="text-xs text-muted-foreground">—</span>;
	return (
		<Tooltip content={describeChangePotential(entry.changePotential)}>
			<button className={`${tooltipTriggerClass} items-center gap-2`} type="button">
				<Badge tone={bandTone[entry.changePotential.band]}>
					{entry.changePotential.band}
				</Badge>
				<span className="w-7 text-right text-xs text-muted-foreground tabular-nums">
					{entry.changePotential.score}
				</span>
			</button>
		</Tooltip>
	);
}

export function AuditReportState({ entry }: { entry: ProjectAuditEntry }) {
	if (entry.freshReport) {
		const age = describeFreshAge(entry);
		return (
			<Tooltip content={age}>
				<button className={`${tooltipTriggerClass} items-center gap-1.5`} type="button">
					<Badge tone="emerald">Fresh</Badge>
					{age ? <span className="text-muted-foreground">{age}</span> : null}
				</button>
			</Tooltip>
		);
	}
	if (entry.staleReport) {
		return (
			<Tooltip content={describeReportFreshness(entry)}>
				<button className={tooltipTriggerClass} type="button">
					<Badge tone="amber">Stale</Badge>
				</button>
			</Tooltip>
		);
	}
	if (entry.missingReport) return <Badge tone="red">Missing</Badge>;
	return <span className="text-xs text-muted-foreground">No report</span>;
}

export function AuditActionButton({
	disabledReason,
	label,
	onClick,
	pending,
}: {
	disabledReason: string | undefined;
	label: 'Review' | 'Run';
	onClick: () => void;
	pending: boolean;
}) {
	const explanation = disabledReason ?? (pending ? 'An audit run is starting.' : undefined);
	const blocked = explanation !== undefined;
	return (
		<Tooltip content={explanation}>
			<Button
				aria-disabled={blocked}
				onClick={() => {
					if (!blocked) onClick();
				}}
				size="compact"
				variant="secondary">
				{label}
			</Button>
		</Tooltip>
	);
}

export function AuditDetailsToggle({
	auditName,
	detailsId,
	expanded,
	findingCount,
	onToggle,
}: {
	auditName: string;
	detailsId: string;
	expanded: boolean;
	findingCount: number;
	onToggle: () => void;
}) {
	return (
		<Button
			aria-controls={detailsId}
			aria-expanded={expanded}
			aria-label={`${expanded ? 'Hide' : 'Show'} details for ${auditName}`}
			onClick={onToggle}
			size="compact"
			variant="ghost">
			Details{findingCount > 0 ? ` (${findingCount})` : ''}
			<ChevronDown
				className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
			/>
		</Button>
	);
}

export function AuditFindingList({
	auditName,
	findings,
}: {
	auditName: string;
	findings: ProjectFeature[];
}) {
	return (
		<section aria-label={`Active findings for ${auditName}`} className="space-y-2">
			<div className="flex items-center gap-2">
				<h4 className="text-xs font-medium text-muted-foreground uppercase">
					Active findings
				</h4>
				<Badge tone={findings.length > 0 ? 'amber' : 'neutral'}>{findings.length}</Badge>
			</div>
			{findings.length === 0 ? (
				<p className="text-xs text-muted-foreground">No active findings for this audit.</p>
			) : (
				<ul className="space-y-2">
					{findings.map((finding) => {
						const description =
							typeof finding.description === 'string'
								? finding.description
								: undefined;
						return (
							<li
								className="rounded-md border border-border bg-muted p-2"
								key={finding.id}>
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-medium text-foreground">
										{finding.title ?? finding.id}
									</span>
									<Badge tone="neutral">{finding.status ?? 'backlog'}</Badge>
								</div>
								{description ? (
									<p className="mt-1 max-w-[80ch] text-xs text-muted-foreground">
										{description}
									</p>
								) : null}
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
