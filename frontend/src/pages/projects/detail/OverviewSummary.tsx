import type { ReactNode } from 'react';

import { Link } from 'react-router';

import type { ProjectDetail } from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { percent } from '../../../lib/formatters.ts';
import { fieldLabelClass } from '../../../lib/formStyles.ts';
import { toneSolid } from '../../../lib/tones.ts';
import { projectDetailTabSearch } from './overviewLinks.ts';
import { artifactTone } from './shared.ts';

/**
 * One tile of the overview metric row, on the same shape the Dashboard uses: an uppercase muted
 * label, a single accent value at one size, then a muted caption. The three tiles previously gave
 * their values three different treatments — `text-2xl` numeral, `text-lg` capitalized word, and a
 * bare Badge — so a row meant to read as one measurement read as three unrelated cards.
 */
function SummaryTile({
	caption,
	children,
	label,
	value,
}: {
	caption: ReactNode;
	children?: ReactNode;
	label: string;
	value: ReactNode;
}) {
	return (
		<>
			<div className={fieldLabelClass}>{label}</div>
			<div className="mt-2 text-2xl font-semibold text-accent">{value}</div>
			<div className="mt-1 text-xs text-muted-foreground">{caption}</div>
			{children}
		</>
	);
}

export function OverviewSummary({ project }: { project: ProjectDetail }) {
	const total = project.featureStats.total;
	const passing = project.featureStats.passing;
	const pct = percent(passing, total);
	const currentMilestone = project.metadata.roadmap?.currentMilestone;
	const check = project.metadata.artifactCheck;
	return (
		<div className="grid gap-4 md:grid-cols-3">
			<Card>
				<SummaryTile
					caption={
						<>
							{passing}/{total} passing · {project.featureStats.failing} failing ·{' '}
							{project.featureStats.waitingApproval} waiting
						</>
					}
					label="Feature Progress"
					value={`${pct}%`}>
					<div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
						{total > 0 ? (
							<div
								className={`h-full ${toneSolid.emerald}`}
								style={{ width: `${pct}%` }}
							/>
						) : null}
					</div>
				</SummaryTile>
			</Card>
			<Card>
				<SummaryTile
					caption={
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
			</Card>
			<Card className="group transition-colors hover:border-border">
				<Link
					aria-label={`Artifact health: ${project.artifactHealth}. View artifact details.`}
					className="block rounded-lg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
					to={projectDetailTabSearch('artifacts')}>
					<SummaryTile
						// The health word stays the tile's value so all three lead at the same size;
						// the Badge that used to be the value is demoted to the caption line, where it
						// still carries the tone.
						caption={
							<span className="flex flex-wrap items-center gap-1.5">
								<Badge tone={artifactTone[project.artifactHealth]}>
									{project.artifactHealth}
								</Badge>
								{check
									? `artifacts — ${check.summary.fresh} fresh · ${check.summary.stale} stale · ${check.summary.missing} missing`
									: 'No artifact check available.'}
							</span>
						}
						label="Artifact Health"
						value={
							check
								? check.summary.fresh + check.summary.stale + check.summary.missing
								: '—'
						}
					/>
					<div className="mt-2 text-xs text-accent group-hover:underline">
						View artifacts →
					</div>
				</Link>
			</Card>
		</div>
	);
}
