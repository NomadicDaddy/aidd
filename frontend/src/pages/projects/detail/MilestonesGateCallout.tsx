import { default as ShieldAlert } from 'lucide-react/dist/esm/icons/shield-alert';

import type { ProjectMilestonesView } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { Tooltip } from '../../../components/ui/tooltip.tsx';
import { toneText } from '../../../lib/tones.ts';
import { proseMeasureClass } from '../../../lib/typography.ts';

/**
 * The two ways a roadmap can be wrong, rendered with the same red treatment the features tab uses
 * for unmapped directories:
 *
 * - unmapped features set `blockReason: 'unmapped_features'` and stop every coding run project-wide;
 * - cross-milestone dependency violations do not block the gate at all. It reports `blocked: false`,
 *   the run ends "all candidates dependency-blocked", and nothing names the cause. This callout is
 *   the only place that names it.
 *
 * So the badge counts each kind separately rather than summing them. Summing produced "2 blocking"
 * on a project whose gate was open, which is the one thing this callout exists to get right. A
 * violation is only red when the depending feature is unfinished -- then it is genuinely
 * unreachable. On a completed feature the ordering is wrong on paper with no work left to strand,
 * which is amber.
 */
export function MilestonesGateCallout({ view }: { view: ProjectMilestonesView }) {
	const unmapped = view.unmappedFeatureDirectories;
	if (unmapped.length === 0 && view.violations.length === 0) return null;
	const unreachable = view.violations.filter((violation) => !violation.featurePasses).length;
	const outOfOrder = view.violations.length - unreachable;
	const stopsWork = unmapped.length > 0 || unreachable > 0;
	return (
		// A default-bordered Card with a red Badge, not a red-outlined one. The outline was a
		// fourth way of spelling the red tone and the only outlined surface across the five tabs;
		// `lib/tones.ts` owns the vocabulary, and it does not include a border variant.
		<Card className="flex flex-col gap-2">
			<CardHeader
				badge={
					<>
						{unmapped.length > 0 ? (
							<Badge tone="red">{unmapped.length} blocking</Badge>
						) : null}
						{unreachable > 0 ? (
							<Badge tone="red">{unreachable} unreachable</Badge>
						) : null}
						{outOfOrder > 0 ? (
							<Badge tone="amber">{outOfOrder} out of order</Badge>
						) : null}
					</>
				}
				className="mb-0"
				headingLevel={3}
				icon={
					<ShieldAlert
						className={`h-4 w-4 ${stopsWork ? toneText.red : toneText.amber}`}
					/>
				}
				title="Roadmap problems"
			/>
			{unmapped.length > 0 ? (
				<p className={`${proseMeasureClass} text-sm text-muted-foreground`}>
					{unmapped.length} feature director{unmapped.length === 1 ? 'y has' : 'ies have'}{' '}
					no milestone and block{unmapped.length === 1 ? 's' : ''} coding selection:{' '}
					<Tooltip content={unmapped.join(', ')} maxWidth="sm">
						<span className="font-mono text-xs">
							{unmapped.slice(0, 5).join(', ')}
							{unmapped.length > 5 ? ', …' : ''}
						</span>
					</Tooltip>
					. Auto-place features resolves them.
				</p>
			) : null}
			{view.violations.length > 0 ? (
				<div className="space-y-1">
					<p className={`${proseMeasureClass} text-sm text-muted-foreground`}>
						{view.violations.length} feature
						{view.violations.length === 1 ? '' : 's'} depend on work scheduled in a
						later milestone, and the gate reports none of it.{' '}
						{unreachable > 0
							? `${unreachable} of them cannot be selected at all while their own milestone is active.`
							: 'Every one of them is already completed, so this is roadmap accounting rather than stranded work.'}
					</p>
					<ul
						className={`space-y-0.5 text-xs ${stopsWork ? toneText.red : toneText.amber}`}>
						{view.violations.slice(0, 8).map((violation) => (
							<li key={`${violation.featureDirectory}:${violation.dependency}`}>
								<span className="font-mono">{violation.featureDirectory}</span> (
								{violation.milestone}) →{' '}
								<span className="font-mono">{violation.dependency}</span> (
								{violation.dependencyMilestone})
							</li>
						))}
					</ul>
					{view.violations.length > 8 ? (
						<p className="text-xs text-muted-foreground">
							…and {view.violations.length - 8} more.
						</p>
					) : null}
				</div>
			) : null}
		</Card>
	);
}
