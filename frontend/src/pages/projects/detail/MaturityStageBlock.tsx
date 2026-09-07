import type { MaturityAuditEntry, MaturityStage } from '../../../api/types.ts';

import { DisclosureMarker } from '../../../components/shared/DisclosureMarker.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { MaturityArtifactRow } from './MaturityArtifactRow.tsx';
import { MaturityAuditRow } from './MaturityAuditRow.tsx';
import { STAGE_ICON_BY_STATUS, STAGE_ICON_TONE } from './maturityOverviewUtils.ts';

interface MaturityStageBlockProps {
	auditProfileLabel: null | string;
	disabled: boolean;
	expanded: boolean;
	hasOverallAction: boolean;
	isAuditStage: boolean;
	onRunAudit: (auditName: string) => void;
	onToggle: () => void;
	onToggleSkip: (slug: string, skip: boolean) => void;
	stage: MaturityStage;
}

export function MaturityStageBlock({
	auditProfileLabel,
	disabled,
	expanded,
	hasOverallAction,
	isAuditStage,
	onRunAudit,
	onToggle,
	onToggleSkip,
	stage,
}: MaturityStageBlockProps) {
	const Icon = STAGE_ICON_BY_STATUS[stage.status];
	const auditEntries = isAuditStage
		? stage.artifacts
				.map((artifact) => artifact.audit)
				.filter((entry): entry is MaturityAuditEntry => entry !== undefined)
		: [];
	const applicableCount = auditEntries.filter((entry) => !entry.skipped).length;
	const panelId = `maturity-stage-panel-${stage.id}`;
	const headerId = `maturity-stage-header-${stage.id}`;
	return (
		<div className="rounded-md border border-border">
			<button
				aria-controls={panelId}
				aria-expanded={expanded}
				className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors duration-150 hover:bg-muted/40 max-sm:min-h-11"
				id={headerId}
				onClick={onToggle}
				type="button">
				{/* The identity half does not shrink and the description does. With both `min-w-0`
				    and competing for the same row, at 768 it is the stage number and name that get
				    cut — every row reading "oduct inte…", "roject stru…" with the status icon
				    sitting over the first characters. */}
				<div className="flex min-w-0 flex-1 flex-col gap-0.5 lg:flex-row lg:items-center lg:gap-2">
					<div className="flex shrink-0 items-center gap-2">
						<span className="text-muted-foreground">
							<DisclosureMarker open={expanded} />
						</span>
						<Icon className={`h-4 w-4 shrink-0 ${STAGE_ICON_TONE[stage.status]}`} />
						<span className="text-sm font-medium text-foreground">
							{stage.order}. {stage.label}
						</span>
					</div>
					<span className="min-w-0 text-xs text-muted-foreground lg:truncate">
						{stage.description}
					</span>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<span className="font-mono text-xs text-muted-foreground">
						{stage.complete}/{stage.required}
					</span>
					<Badge
						tone={
							stage.status === 'complete'
								? 'emerald'
								: stage.status === 'partial'
									? 'amber'
									: 'neutral'
						}>
						{stage.status}
					</Badge>
				</div>
			</button>
			{expanded ? (
				<div
					aria-labelledby={headerId}
					className="space-y-1.5 border-t border-border px-3 py-2"
					id={panelId}
					role="region">
					{isAuditStage && auditProfileLabel ? (
						<div className="text-xs text-muted-foreground">
							Profile: {auditProfileLabel} — {applicableCount} audit
							{applicableCount === 1 ? '' : 's'} applicable
						</div>
					) : null}
					{isAuditStage
						? auditEntries.map((entry) => (
								<MaturityAuditRow
									disabled={disabled}
									entry={entry}
									key={entry.auditName}
									onRun={onRunAudit}
									onToggleSkip={onToggleSkip}
								/>
							))
						: stage.artifacts.map((artifact) => (
								<MaturityArtifactRow
									artifact={artifact}
									disabled={disabled}
									key={artifact.slug}
									onToggleSkip={onToggleSkip}
								/>
							))}
					{stage.artifacts.length === 0 ? (
						<p className="text-xs text-muted-foreground">No artifacts in this stage.</p>
					) : null}
					{stage.status === 'complete' || hasOverallAction ? null : (
						<p className="pt-1 text-xs text-muted-foreground">
							Nothing to run — all required artifacts are complete or marked N/A.
						</p>
					)}
				</div>
			) : null}
		</div>
	);
}
