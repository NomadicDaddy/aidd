/* eslint-disable react-refresh/only-export-components */
import { default as CircleDashed } from 'lucide-react/dist/esm/icons/circle-dashed';
import { default as ExternalLink } from 'lucide-react/dist/esm/icons/external-link';
import { Link } from 'react-router-dom';

import type {
	PipelineSessionReport,
	PipelineStepResultRecord,
	RecipeStepDefinition,
} from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { buttonClassName } from '../../components/ui/button.tsx';
import { formatDate, formatDuration } from '../../lib/formatters.ts';
import { pipelineStepLiveConsoleHref } from './pipelineSessionLinks.ts';
import { StepOutput, stepTone } from './StepOutput.tsx';
import { StepRunConsole } from './StepRunConsole.tsx';

/**
 * Build a unified ordered list of every step in the session — both executed
 * (persisted as PipelineStepResultRecord) and pending (only known from the
 * recipe definition). Top-level recipe steps (depth 0, phase 'step') are the
 * anchors: each one is shown with its sequence number. Non-anchor rows
 * (hooks, nested recipe-ref children, auto-fix retries) render inline beneath
 * their parent anchor so the vertical list reads as the full plan.
 *
 * If the recipe definition is unavailable (e.g. deleted), the list falls back
 * to showing only the executed rows, preserving the original behavior.
 */
export type StepRow =
	| { kind: 'executed'; result: PipelineStepResultRecord }
	| { kind: 'pending'; sequenceNumber: number; step: RecipeStepDefinition };

export function buildStepRows(report: PipelineSessionReport): StepRow[] {
	const recipeStepCount = report.recipeSteps.length;
	// When the recipe plan is unavailable, fall back to the original executed-only view.
	if (recipeStepCount === 0) {
		return report.stepResults.map((result) => ({ kind: 'executed' as const, result }));
	}

	const anchors = report.stepResults.filter((s) => s.depth === 0 && s.phase === 'step');
	const nonAnchors = report.stepResults.filter((s) => !(s.depth === 0 && s.phase === 'step'));

	const rows: StepRow[] = [];
	let nonAnchorIdx = 0;
	for (let seq = 1; seq <= recipeStepCount; seq += 1) {
		const anchor = anchors.find((a) => a.sequenceNumber === seq);
		if (anchor) {
			// Flush non-anchor executed rows (hooks/children) that precede this anchor.
			while (
				nonAnchorIdx < nonAnchors.length &&
				nonAnchors[nonAnchorIdx]!.displayOrder < anchor.displayOrder
			) {
				rows.push({ kind: 'executed', result: nonAnchors[nonAnchorIdx]! });
				nonAnchorIdx += 1;
			}
			rows.push({ kind: 'executed', result: anchor });
		} else {
			rows.push({
				kind: 'pending',
				sequenceNumber: seq,
				step: report.recipeSteps[seq - 1]!,
			});
		}
	}
	// Flush any remaining non-anchor rows (e.g. a hook after the final step).
	while (nonAnchorIdx < nonAnchors.length) {
		rows.push({ kind: 'executed', result: nonAnchors[nonAnchorIdx]! });
		nonAnchorIdx += 1;
	}
	return rows;
}

export function ExecutedStepRow({ step }: { step: PipelineStepResultRecord }) {
	return (
		<div
			className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
			style={{ marginLeft: `${Math.min(step.depth, 4) * 16}px` }}>
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<Badge>{step.phase}</Badge>
						<Badge tone={stepTone(step.status)}>{step.status}</Badge>
						<Badge tone="teal">{step.stepType}</Badge>
					</div>
					<h3 className="mt-2 text-base font-semibold text-foreground">
						{step.stepName}
					</h3>
					<p className="text-xs text-neutral-500">
						{formatDate(step.startedAt)} · {formatDuration(step.durationMs)}
					</p>
				</div>
				{step.runId && (
					<Link
						className={buttonClassName()}
						to={pipelineStepLiveConsoleHref(step.runId)}>
						<ExternalLink className="h-4 w-4" />
						Open in Live Console
					</Link>
				)}
			</div>
			{step.outputSummary && <StepOutput output={step.outputSummary} />}
			{step.errorMessage && (
				<p className="mt-3 text-sm text-red-700 dark:text-red-300">{step.errorMessage}</p>
			)}
			{step.runId && <StepRunConsole runId={step.runId} stepStatus={step.status} />}
		</div>
	);
}

export function PendingStepRow({
	sequenceNumber,
	step,
	totalSteps,
}: {
	sequenceNumber: number;
	step: RecipeStepDefinition;
	totalSteps: number;
}) {
	return (
		<div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50/50 p-4 dark:border-neutral-700 dark:bg-neutral-900/30">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<Badge tone="neutral">
							<CircleDashed className="h-3 w-3" />
							pending
						</Badge>
						<Badge tone="teal">{step.stepType}</Badge>
						<span className="text-xs font-medium text-neutral-500">
							Step {sequenceNumber} of {totalSteps}
						</span>
					</div>
					<h3 className="mt-2 text-base font-semibold text-neutral-500 dark:text-neutral-400">
						{step.name}
					</h3>
					<p className="text-xs text-neutral-400 dark:text-neutral-500">
						Not started yet
					</p>
				</div>
			</div>
		</div>
	);
}
