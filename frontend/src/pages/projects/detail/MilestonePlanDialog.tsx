import { default as AlertTriangle } from 'lucide-react/dist/esm/icons/alert-triangle';
import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';

import type { ProjectMilestonePlan } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Dialog, DialogPanel } from '../../../components/ui/dialog.tsx';
import { cn } from '../../../lib/cn.ts';
import { toneText } from '../../../lib/tones.ts';
import { sectionCaptionClass } from '../../../lib/typography.ts';
import {
	groupMovesByTarget,
	type MilestoneRequest,
	milestoneRequestTitle,
	moveReasonLabel,
	warningLabel,
} from './milestonesUtils.ts';

function SectionTitle({ children }: { children: string }) {
	return <h3 className={sectionCaptionClass}>{children}</h3>;
}

/**
 * The preview step. Everything shown here came back from a dry run of the exact request the confirm
 * button re-issues, so this is not a rendering of what should happen — it is the result of the plan
 * itself, computed against the roadmap on disk.
 */
export function MilestonePlanDialog({
	busy,
	onClose,
	onConfirm,
	plan,
	request,
}: {
	busy: boolean;
	onClose: () => void;
	onConfirm: () => void;
	plan: null | ProjectMilestonePlan;
	request: MilestoneRequest | null;
}) {
	if (!plan || !request) return null;
	const groups = groupMovesByTarget(plan.moves);
	const destructive = request.kind === 'delete';
	return (
		<Dialog
			aria-labelledby="milestone-plan-title"
			initialFocus="container"
			onClose={onClose}
			open>
			<DialogPanel className="w-full max-w-2xl space-y-4">
				<h2 className="text-base font-semibold text-foreground" id="milestone-plan-title">
					{milestoneRequestTitle(request)}
				</h2>
				{groups.length === 0 ? (
					<p className="text-sm text-muted-foreground">No features change milestone.</p>
				) : (
					<div className="space-y-3">
						<SectionTitle>
							{`${plan.moves.length} feature${plan.moves.length === 1 ? '' : 's'} move`}
						</SectionTitle>
						{groups.map((group) => (
							<div
								className="rounded-md border border-border bg-muted/60 p-3"
								key={group.milestone}>
								<div className="text-sm font-medium text-foreground">
									→ {group.milestone}
								</div>
								<ul className="mt-1.5 space-y-1">
									{group.moves.map((move) => (
										<li
											className="flex flex-wrap items-center gap-1.5 text-xs"
											key={move.featureDirectory}>
											<span className="font-mono text-foreground">
												{move.featureDirectory}
											</span>
											<span className="text-muted-foreground">
												{move.from ?? 'unassigned'}
											</span>
											<ArrowRight className="h-3 w-3 text-muted-foreground" />
											<span className="text-muted-foreground">{move.to}</span>
											<span className="text-muted-foreground">
												({moveReasonLabel(move.reason)})
											</span>
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				)}
				{plan.backfills.length > 0 ? (
					<p className="text-xs text-muted-foreground">
						{plan.backfills.length} completed feature
						{plan.backfills.length === 1 ? '' : 's'} will have{' '}
						<span className="font-mono">shippedVersion</span> backfilled to{' '}
						<span className="font-mono">{plan.backfills[0]?.shippedVersion}</span> (the
						app&rsquo;s current version).
					</p>
				) : null}
				{plan.priorityUpdates.length > 0 ? (
					<p className="text-xs text-muted-foreground">
						{plan.priorityUpdates.length} feature
						{plan.priorityUpdates.length === 1 ? '' : 's'} will have their{' '}
						<span className="font-mono">priority</span> re-synced to the new milestone
						numbering.
					</p>
				) : null}
				{plan.warnings.length > 0 ? (
					<div className="space-y-1.5">
						<SectionTitle>Warnings</SectionTitle>
						<ul className="space-y-1">
							{plan.warnings.map((warning) => (
								<li
									className={cn(
										'flex items-start gap-1.5 text-xs',
										toneText.amber,
									)}
									key={`${warning.code}:${warning.featureDirectory}`}>
									<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
									<span>
										<span className="font-medium">
											{warningLabel(warning.code)}
										</span>{' '}
										— {warning.detail}
									</span>
								</li>
							))}
						</ul>
					</div>
				) : null}
				{plan.violations.length > 0 ? (
					<div className="space-y-1.5">
						<SectionTitle>Unresolved dependency violations</SectionTitle>
						<ul className={cn('space-y-1 text-xs', toneText.red)}>
							{plan.violations.map((violation) => (
								<li key={`${violation.featureDirectory}:${violation.dependency}`}>
									<span className="font-mono">{violation.featureDirectory}</span>{' '}
									({violation.milestone}) depends on{' '}
									<span className="font-mono">{violation.dependency}</span> (
									{violation.dependencyMilestone}), which is scheduled later.
								</li>
							))}
						</ul>
						<p className="text-xs text-muted-foreground">
							These are bound up in a dependency cycle, so no milestone ordering can
							satisfy them. Break the cycle in the feature dependencies first.
						</p>
					</div>
				) : null}
				<div className="flex justify-end gap-2">
					<Button disabled={busy} onClick={onClose}>
						Cancel
					</Button>
					<Button
						disabled={busy}
						onClick={onConfirm}
						variant={destructive ? 'danger' : 'primary'}>
						{busy ? 'Applying…' : 'Apply'}
					</Button>
				</div>
			</DialogPanel>
		</Dialog>
	);
}
