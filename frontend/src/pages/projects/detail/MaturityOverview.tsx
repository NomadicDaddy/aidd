import { default as Copy } from 'lucide-react/dist/esm/icons/copy';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { useState } from 'react';
import { toast } from 'sonner';

import type { MaturityRunNextRequest } from '../../../api/maturity.ts';
import type { MaturityDetail, MaturityNextAction } from '../../../api/types.ts';
import type { LaunchTargetValue } from '../../../api/types/launchDefaults.ts';

import { LaunchTargetControl } from '../../../components/shared/LaunchTargetControl.tsx';
import { MaturityRing } from '../../../components/shared/MaturityRing.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { useRunMaturityNext, useUpdateMaturitySkip } from '../../../hooks/useProjects.ts';
import { defaultExpandedMaturityStageIds } from './maturityExpansion.ts';
import { nextActionLabel } from './maturityOverviewUtils.ts';
import { MaturityStageBlock } from './MaturityStageBlock.tsx';

export function MaturityOverview({
	maturity,
	projectId,
	projectPath,
}: {
	maturity: MaturityDetail;
	projectId: string;
	projectPath: string;
}) {
	const skipMutation = useUpdateMaturitySkip(projectId);
	const runMutation = useRunMaturityNext(projectId);
	// One launch target for every maturity action launched from this card.
	const [launchTarget, setLaunchTarget] = useState<LaunchTargetValue>({});
	const [expandedStageIds, setExpandedStageIds] = useState<ReadonlySet<string>>(() =>
		defaultExpandedMaturityStageIds(maturity.stages),
	);

	function launchOverrides(): Partial<
		Pick<MaturityRunNextRequest, 'backend' | 'model' | 'reasoningEffort'>
	> {
		return {
			...(launchTarget.backend ? { backend: launchTarget.backend } : {}),
			...(launchTarget.model ? { model: launchTarget.model } : {}),
			...(launchTarget.reasoningEffort
				? { reasoningEffort: launchTarget.reasoningEffort }
				: {}),
		};
	}
	const disabled = skipMutation.isPending || runMutation.isPending;

	function toggleStage(stageId: string): void {
		setExpandedStageIds((current) => {
			const next = new Set(current);
			if (next.has(stageId)) {
				next.delete(stageId);
			} else {
				next.add(stageId);
			}
			return next;
		});
	}

	function toggleSkip(slug: string, skip: boolean): void {
		const next = skip
			? Array.from(new Set([...maturity.skip, slug]))
			: maturity.skip.filter((entry) => entry !== slug);
		skipMutation.mutate(next, {
			onError(error) {
				toast.error(error instanceof Error ? error.message : 'Skip update failed');
			},
			onSuccess() {
				toast.success(skip ? `Marked ${slug} as N/A` : `Restored ${slug}`);
			},
		});
	}

	function runAudit(auditName: string): void {
		runMutation.mutate(
			{ auditName, slug: `audit:${auditName}`, ...launchOverrides() },
			{
				onError(error) {
					toast.error(error instanceof Error ? error.message : 'Audit launch failed');
				},
				onSuccess(result) {
					if (result.runId) {
						toast.success(`Audit ${auditName} launched (run ${result.runId})`);
					} else {
						toast.success(`Audit ${auditName} dispatched`);
					}
				},
			},
		);
	}

	function runNextAction(action: MaturityNextAction): void {
		if (action.invocation === 'manual') {
			if (action.target) {
				void navigator.clipboard
					.writeText(action.target)
					.then(() => toast.success(`Copied: ${action.target}`))
					.catch(() => toast.error('Clipboard write failed'));
			} else if (action.hint) {
				toast.message(action.hint);
			}
			return;
		}
		const body: MaturityRunNextRequest = { slug: action.slug, ...launchOverrides() };
		if (action.auditName) body.auditName = action.auditName;
		runMutation.mutate(body, {
			onError(error) {
				toast.error(error instanceof Error ? error.message : 'Run failed');
			},
			onSuccess(result) {
				if (result.runId) {
					toast.success(`Launched ${action.slug} (run ${result.runId})`);
				} else if (result.sessionId) {
					toast.success(`Launched ${action.slug} (session ${result.sessionId})`);
				} else if (result.hint) {
					toast.message(result.hint);
				} else {
					toast.success(`Dispatched ${action.slug}`);
				}
			},
		});
	}

	const isComplete = maturity.percent >= 100;
	return (
		<Card>
			<div className="flex flex-wrap items-start gap-4 xl:flex-nowrap">
				<div className="flex shrink-0 flex-col items-center gap-3 max-xl:w-full">
					<MaturityRing
						ariaLabel={`Project maturity ${maturity.percent}%`}
						centerCaption="Maturity"
						percent={maturity.percent}
						showCenterLabel
						size={144}
						stages={maturity.stageStatuses}
					/>
					<div className="text-center">
						<div className="text-sm font-semibold text-foreground">
							{maturity.currentStageLabel ?? 'All maturity stages complete'}
						</div>
						{maturity.nextArtifactLabel ? (
							<div className="text-xs text-muted-foreground">
								Next: {maturity.nextArtifactLabel}
							</div>
						) : null}
					</div>
					{!isComplete && maturity.nextAction ? (
						<div className="flex flex-col items-center gap-1">
							<div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
								Next overall step
							</div>
							<Button
								disabled={disabled}
								onClick={() =>
									maturity.nextAction && runNextAction(maturity.nextAction)
								}
								variant="primary">
								{maturity.nextAction.invocation === 'manual' ? (
									<Copy className="h-4 w-4" />
								) : (
									<Play className="h-4 w-4" />
								)}
								{nextActionLabel(maturity.nextAction)}
							</Button>
						</div>
					) : null}
					{isComplete ? <Badge tone="emerald">Fully matured</Badge> : null}
				</div>
				<div className="min-w-0 space-y-2 max-xl:w-full xl:flex-1">
					<div className="mb-1 flex flex-wrap items-center justify-between gap-2">
						<h2 className="text-sm font-semibold text-foreground">Project maturity</h2>
						<div className="flex items-center gap-3">
							<LaunchTargetControl
								onChange={setLaunchTarget}
								projectDir={projectPath}
								value={launchTarget}
							/>
							<span className="text-xs text-muted-foreground">
								{maturity.percent}% complete
							</span>
						</div>
					</div>
					{maturity.stages.map((stage) => {
						const stageNextAction =
							!isComplete &&
							maturity.nextAction &&
							maturity.nextAction.stageId === stage.id
								? maturity.nextAction
								: null;
						return (
							<MaturityStageBlock
								auditProfileLabel={maturity.auditProfileLabel}
								disabled={disabled}
								expanded={expandedStageIds.has(stage.id)}
								isAuditStage={stage.id === 'audited'}
								key={stage.id}
								onRunAudit={runAudit}
								onRunStageAction={runNextAction}
								onToggle={() => toggleStage(stage.id)}
								onToggleSkip={toggleSkip}
								stage={stage}
								stageNextAction={stageNextAction}
							/>
						);
					})}
				</div>
			</div>
		</Card>
	);
}
