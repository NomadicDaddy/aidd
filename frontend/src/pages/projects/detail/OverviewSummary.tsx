import { Link } from 'react-router';

import type { ProjectDetail } from '../../../api/types.ts';

import { Metric } from '../../../components/shared/Metric.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { percent } from '../../../lib/formatters.ts';
import { toneSolid } from '../../../lib/tones.ts';
import { projectDetailTabSearch } from './overviewLinks.ts';
import { artifactTone } from './shared.ts';

/* This file's own `SummaryTile` was deleted here. It restated the Dashboard tile shape as a bare
   fragment that only worked inside a hand-placed `<Card>`, which is why its three values drifted to
   three different treatments — a `text-2xl` numeral, a `text-lg` capitalized word, and a bare
   Badge — and a row meant to read as one measurement read as three unrelated cards. `Metric`
   renders its own card and takes the progress bar in its `footer` slot. */

export function OverviewSummary({ project }: { project: ProjectDetail }) {
	const total = project.featureStats.total;
	const passing = project.featureStats.passing;
	const pct = percent(passing, total);
	const currentMilestone = project.metadata.roadmap?.currentMilestone;
	const check = project.metadata.artifactCheck;
	return (
		<div className="grid gap-4 lg:grid-cols-3">
			<Metric
				detail={
					<>
						{passing}/{total} passing · {project.featureStats.failing} failing ·{' '}
						{project.featureStats.waitingApproval} waiting
					</>
				}
				footer={
					<div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
						{total > 0 ? (
							<div
								className={`h-full ${toneSolid.emerald}`}
								style={{ width: `${pct}%` }}
							/>
						) : null}
					</div>
				}
				label="Feature Progress"
				value={`${pct}%`}
			/>
			<Metric
				detail={
					<span className="flex flex-wrap items-center gap-1.5">
						Current milestone
						{currentMilestone ? (
							<Badge tone="neutral">{currentMilestone}</Badge>
						) : (
							<span>— none active</span>
						)}
					</span>
				}
				label="Lifecycle"
				value={<span className="capitalize">{project.phase}</span>}
			/>
			<Link
				aria-label={`Artifact health: ${project.artifactHealth}. View artifact details.`}
				className="block rounded-xl focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
				to={projectDetailTabSearch('artifacts')}>
				<Metric
					className="group h-full"
					// The health word stays the tile's caption so all three tiles lead with a
					// figure at the same step; the Badge that used to be the value carries the tone.
					detail={
						<span className="flex flex-wrap items-center gap-1.5">
							<Badge tone={artifactTone[project.artifactHealth]}>
								{project.artifactHealth}
							</Badge>
							{check
								? `artifacts — ${check.summary.fresh} fresh · ${check.summary.stale} stale · ${check.summary.missing} missing`
								: 'No artifact check available.'}
						</span>
					}
					footer={
						<div className="mt-2 text-xs text-accent group-hover:underline">
							View artifacts →
						</div>
					}
					// The hand-rolled hover here was `hover:border-border` — a transition to the
					// colour the border already had. `Card`'s own `interactive` treatment is what
					// every other clickable card on this page uses.
					interactive
					label="Artifact Health"
					value={
						check
							? check.summary.fresh + check.summary.stale + check.summary.missing
							: '—'
					}
				/>
			</Link>
		</div>
	);
}
