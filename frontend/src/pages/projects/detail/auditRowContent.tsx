import type { ReactNode } from 'react';

import {
	isDismissableFinding,
	isRemovableFeatureStatus,
} from 'aidd-shared/contracts/finding-dispositions';
import { default as Info } from 'lucide-react/dist/esm/icons/info';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';

import type { ProjectAuditEntry, ProjectFeature } from '../../../api/types.ts';

import { DisclosureMarker } from '../../../components/shared/DisclosureMarker.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Tooltip } from '../../../components/ui/tooltip.tsx';
import { controlFocusClass } from '../../../lib/formStyles.ts';
import { dangerRowActionClass, toneText } from '../../../lib/tones.ts';
import { microLabelClass, proseMeasureClass } from '../../../lib/typography.ts';
import { bandTone, describeChangePotential } from '../../audits/auditsUtils.ts';
import { describeFreshAge, describeReportFreshness } from './auditsTabUtils.ts';

const tooltipTriggerClass = `inline-flex max-w-full min-w-0 rounded-md border border-transparent text-left ${controlFocusClass} focus-visible:outline-none max-sm:min-h-11 max-sm:min-w-11`;

function ExplainedBadge({ children, content }: { children: ReactNode; content: string }) {
	return (
		<span className="inline-flex items-center">
			{children}
			<span className="sr-only">: {content}</span>
		</span>
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
				className={`${tooltipTriggerClass} items-center justify-center text-muted-foreground`}
				type="button">
				<Info aria-hidden="true" className="h-3.5 w-3.5" />
			</button>
		</Tooltip>
	);
}

export function AuditChangePotential({ entry }: { entry: ProjectAuditEntry }) {
	if (!entry.changePotential) return <span className="text-xs text-muted-foreground">—</span>;
	return (
		<span className="inline-flex items-center gap-2">
			<Badge className="w-14 justify-center" tone={bandTone[entry.changePotential.band]}>
				{entry.changePotential.band}
			</Badge>
			<span className="w-7 text-right text-xs text-muted-foreground tabular-nums">
				{entry.changePotential.score}
			</span>
			<span className="sr-only">{describeChangePotential(entry.changePotential)}</span>
		</span>
	);
}

export function AuditReportState({ entry }: { entry: ProjectAuditEntry }) {
	if (entry.freshReport) {
		const age = describeFreshAge(entry);
		return (
			<span className="inline-flex items-center gap-1.5">
				<span className={`text-xs font-medium ${toneText.emerald}`}>Fresh</span>
				{age ? <span className="text-xs text-muted-foreground">{age}</span> : null}
			</span>
		);
	}
	if (entry.staleReport) {
		const age = describeFreshAge(entry);
		return (
			<span className="inline-flex items-center gap-1.5 text-muted-foreground">
				<span className="text-xs font-medium">Stale</span>
				{age ? <span className="text-xs">{age}</span> : null}
				<span className="sr-only">{describeReportFreshness(entry)}</span>
			</span>
		);
	}
	if (entry.missingReport) return <Badge tone="red">Missing</Badge>;
	return <span className="text-xs text-muted-foreground">No report</span>;
}

export function AuditActionButton({
	auditName,
	disabledReason,
	label,
	onClick,
	pending,
}: {
	auditName: string;
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
				aria-label={`${label} ${auditName}`}
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
			<DisclosureMarker open={expanded} />
		</Button>
	);
}

export function AuditFindingList({
	auditName,
	dismissPending,
	findings,
	onDismiss,
}: {
	auditName: string;
	dismissPending: boolean;
	findings: ProjectFeature[];
	onDismiss: (finding: ProjectFeature) => void;
}) {
	return (
		<section aria-label={`Active findings for ${auditName}`} className="space-y-2">
			<div className="flex items-center gap-2">
				<h4 className={`${microLabelClass} text-muted-foreground`}>Active findings</h4>
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
						const canDismiss =
							isDismissableFinding(finding) &&
							isRemovableFeatureStatus(finding.status);
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
									<p
										className={`mt-1 text-xs text-muted-foreground ${proseMeasureClass}`}>
										{description}
									</p>
								) : null}
								{canDismiss ? (
									<div className="mt-2 flex justify-end">
										<Button
											aria-label={`Dismiss ${finding.id}`}
											className={dangerRowActionClass}
											disabled={dismissPending}
											onClick={() => onDismiss(finding)}
											size="compact"
											variant="ghost">
											<Trash2 className="h-4 w-4" />
											Dismiss
										</Button>
									</div>
								) : null}
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
