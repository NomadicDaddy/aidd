import { default as ShieldAlert } from 'lucide-react/dist/esm/icons/shield-alert';

import type { ProjectMilestonesView } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { toneText } from '../../../lib/tones.ts';

/**
 * The two ways a roadmap can be wrong, rendered with the same red treatment the features tab uses
 * for unmapped directories:
 *
 * - unmapped features set `blockReason: 'unmapped_features'` and stop every coding run project-wide;
 * - cross-milestone dependency violations do not block the gate at all. It reports `blocked: false`,
 *   the run ends "all candidates dependency-blocked", and nothing names the cause. This callout is
 *   the only place that names it.
 */
export function MilestonesGateCallout({ view }: { view: ProjectMilestonesView }) {
	const unmapped = view.unmappedFeatureDirectories;
	if (unmapped.length === 0 && view.violations.length === 0) return null;
	return (
		// A default-bordered Card with a red Badge, not a red-outlined one. The outline was a
		// fourth way of spelling the red tone and the only outlined surface across the five tabs;
		// `lib/tones.ts` owns the vocabulary, and it does not include a border variant.
		<Card className="space-y-2">
			<CardHeader
				badge={
					<Badge tone="red">{unmapped.length + view.violations.length} blocking</Badge>
				}
				className="mb-0"
				headingLevel={3}
				icon={<ShieldAlert className={`h-4 w-4 ${toneText.red}`} />}
				title="Roadmap problems"
			/>
			{unmapped.length > 0 ? (
				<p className="text-sm text-muted-foreground">
					{unmapped.length} feature director{unmapped.length === 1 ? 'y has' : 'ies have'}{' '}
					no milestone and block{unmapped.length === 1 ? 's' : ''} coding selection:{' '}
					<span className="font-mono text-xs" title={unmapped.join(', ')}>
						{unmapped.slice(0, 5).join(', ')}
						{unmapped.length > 5 ? ', …' : ''}
					</span>
					. Auto-place features resolves them.
				</p>
			) : null}
			{view.violations.length > 0 ? (
				<div className="space-y-1">
					<p className="text-sm text-muted-foreground">
						{view.violations.length} feature
						{view.violations.length === 1 ? '' : 's'} depend on work scheduled in a
						later milestone. The gate does not report this — those features are simply
						never selectable while their own milestone is active.
					</p>
					<ul className={`space-y-0.5 text-xs ${toneText.red}`}>
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
