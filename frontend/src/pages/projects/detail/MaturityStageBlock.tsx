import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { default as Copy } from 'lucide-react/dist/esm/icons/copy';
import { default as Play } from 'lucide-react/dist/esm/icons/play';

import type { MaturityAuditEntry, MaturityNextAction, MaturityStage } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { MaturityArtifactRow } from './MaturityArtifactRow.tsx';
import { MaturityAuditRow } from './MaturityAuditRow.tsx';
import { nextActionLabel, STAGE_ICON_BY_STATUS, STAGE_ICON_TONE } from './maturityOverviewUtils.ts';

interface MaturityStageBlockProps {
	auditProfileLabel: null | string;
	disabled: boolean;
	expanded: boolean;
	isAuditStage: boolean;
	onRunAudit: (auditName: string) => void;
	onRunStageAction: (action: MaturityNextAction) => void;
	onToggle: () => void;
	onToggleSkip: (slug: string, skip: boolean) => void;
	stage: MaturityStage;
	stageNextAction: MaturityNextAction | null;
}

export function MaturityStageBlock({
	auditProfileLabel,
	disabled,
	expanded,
	isAuditStage,
	onRunAudit,
	onRunStageAction,
	onToggle,
	onToggleSkip,
	stage,
	stageNextAction,
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
	const ChevronIcon = expanded ? ChevronDown : ChevronRight;
	return (
		<div className="rounded-md border border-border">
			<button
				aria-controls={panelId}
				aria-expanded={expanded}
				className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
				id={headerId}
				onClick={onToggle}
				type="button">
				<div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
					<div className="flex min-w-0 items-center gap-2">
						<ChevronIcon
							aria-hidden="true"
							className="h-4 w-4 shrink-0 text-muted-foreground"
						/>
						<Icon className={`h-4 w-4 shrink-0 ${STAGE_ICON_TONE[stage.status]}`} />
						<span className="truncate text-sm font-medium text-foreground">
							{stage.order}. {stage.label}
						</span>
					</div>
					<span className="min-w-0 text-xs text-muted-foreground sm:truncate">
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
					{stageNextAction ? (
						<div className="flex flex-wrap items-center gap-2 pt-1">
							<Button
								disabled={disabled}
								onClick={() => onRunStageAction(stageNextAction)}
								variant="secondary">
								{stageNextAction.invocation === 'manual' ? (
									<Copy className="h-3.5 w-3.5" />
								) : (
									<Play className="h-3.5 w-3.5" />
								)}
								Run next for this stage: {nextActionLabel(stageNextAction)}
							</Button>
						</div>
					) : stage.status === 'complete' ? null : (
						<p className="pt-1 text-xs text-muted-foreground">
							Nothing to run — all required artifacts are complete or marked N/A.
						</p>
					)}
				</div>
			) : null}
		</div>
	);
}
