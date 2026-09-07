import { lazy, Suspense, useState } from 'react';
import { toast } from 'sonner';

import type { MaturityDetail, ProjectArtifactCheckSummary } from '../../../api/types.ts';
import type { Tone } from '../../../lib/tones.ts';
import type { ArtifactFilter } from './artifactGroupFilters.ts';
import type { ArtifactViewerTarget } from './artifactsUtils.ts';

import { Metric } from '../../../components/shared/Metric.tsx';
import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { TabIntro } from '../../../components/shared/TabIntro.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useUpdateMaturitySkip } from '../../../hooks/useProjects.ts';
import { microLabelClass, proseMeasureClass } from '../../../lib/typography.ts';
import {
	artifactEntryState,
	artifactRecordState,
	artifactRecordSummary,
} from './artifactGroupFilters.ts';
import { ArtifactGroups } from './ArtifactGroups.tsx';
import { artifactInventoryCount, buildArtifactInventory } from './artifactsUtils.ts';
import { type ArtifactHealth, artifactTone } from './shared.ts';

// Keep file-viewing code outside the tab's initial chunk; the literal import path remains statically
// analyzable while the dialog is needed only after a user opens an artifact.
const ArtifactViewerDialog = lazy(() =>
	import('./ArtifactViewerDialog.tsx').then((m) => ({ default: m.ArtifactViewerDialog })),
);

export function ArtifactsTab({
	artifactCheck,
	artifactHealth,
	maturity,
	projectId,
}: {
	artifactCheck: null | ProjectArtifactCheckSummary;
	artifactHealth: ArtifactHealth;
	maturity: MaturityDetail | null;
	projectId: string;
}) {
	const skipMutation = useUpdateMaturitySkip(projectId);
	const skipSet = new Set(maturity?.skip ?? []);
	const [openedArtifact, setOpenedArtifact] = useState<ArtifactViewerTarget | null>(null);
	const [inventoryFilter, setInventoryFilter] = useState<ArtifactFilter>('all');
	const intro = (
		<TabIntro
			description={
				<>
					The health summary covers the assertion catalog checked by{' '}
					<code>--check-artifacts</code>. The inventory also includes broader maturity
					evidence such as feature metadata, audit reports, and deployment artifacts.
				</>
			}
			title="Artifacts"
		/>
	);
	function toggleSkip(slug: string, skip: boolean): void {
		const current = maturity?.skip ?? [];
		const next = skip
			? Array.from(new Set([...current, slug]))
			: current.filter((entry) => entry !== slug);
		skipMutation.mutate(next, {
			onError(error) {
				toast.error(error instanceof Error ? error.message : 'Skip update failed');
			},
			onSuccess() {
				toast.success(skip ? `Marked ${slug} as N/A` : `Restored ${slug}`);
			},
		});
	}
	if (!artifactCheck) {
		return (
			<div className="space-y-4">
				{intro}
				<Card className="max-w-[61rem]">
					<CardHeader
						action={<Badge tone={artifactTone[artifactHealth]}>{artifactHealth}</Badge>}
						className="mb-3"
						headingLevel={3}
						title="Artifact health"
					/>
					<p className={`text-sm text-muted-foreground ${proseMeasureClass}`}>
						No artifact check data available. Run an artifact check from the CLI to
						populate <code>.aidd/.artifacts-check.json</code>.
					</p>
				</Card>
			</div>
		);
	}
	const { artifacts } = artifactCheck;
	// The artifact check records what exists on disk. The tab also knows which records the project
	// has declared not applicable, so its counts must apply the same skip set as the rows and filters.
	const summary = artifactRecordSummary(artifacts, skipSet);
	const inventoryCount = artifactInventoryCount(artifacts, maturity);
	const visibleInventoryCount =
		inventoryFilter === 'all'
			? inventoryCount
			: maturity
				? (() => {
						const inventory = buildArtifactInventory(artifacts, maturity);
						const grouped = inventory.groups.reduce(
							(total, group) =>
								total +
								group.entries.filter(
									(entry) =>
										artifactEntryState(entry, skipSet) === inventoryFilter,
								).length,
							0,
						);
						return (
							grouped +
							inventory.ungrouped.filter(
								(record) =>
									artifactRecordState(record, skipSet) === inventoryFilter,
							).length
						);
					})()
				: artifacts.filter(
						(record) => artifactRecordState(record, skipSet) === inventoryFilter,
					).length;
	const assertionNoun = summary.total === 1 ? 'checked assertion' : 'checked assertions';
	const applicableTotal = summary.total - summary.skipped;
	const applicableNoun = applicableTotal === 1 ? 'applicable assertion' : 'applicable assertions';
	const assertionDetail = (value: number) =>
		summary.skipped > 0
			? `${value} of ${applicableTotal} ${applicableNoun}`
			: `${value} of ${summary.total} ${assertionNoun}`;
	const displayedArtifactHealth: ArtifactHealth =
		summary.requiredMissing > 0 ? 'missing' : summary.stale > 0 ? 'stale' : 'fresh';
	const tiles: { detail: string; label: string; tone: Tone; value: number }[] = [
		{
			detail: assertionDetail(summary.fresh),
			label: 'Fresh',
			tone: 'emerald',
			value: summary.fresh,
		},
		{
			detail: assertionDetail(summary.stale),
			label: 'Stale',
			tone: 'amber',
			value: summary.stale,
		},
		{
			detail: assertionDetail(summary.missing),
			label: 'Missing',
			tone: 'red',
			value: summary.missing,
		},
		{
			detail: assertionDetail(summary.requiredMissing),
			label: 'Required missing',
			tone: 'red',
			value: summary.requiredMissing,
		},
	];
	return (
		<div className="space-y-4">
			{intro}
			{/* The inventory uses the full rail deliberately: paths and slugs gain useful width. */}
			<div className="@container space-y-4">
				<section aria-labelledby="artifact-health-heading" className="space-y-3">
					<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
						<h3
							className="text-base font-semibold text-foreground"
							id="artifact-health-heading">
							Artifact health
						</h3>
						<span className={`text-muted-foreground ${microLabelClass}`}>
							{summary.total} {assertionNoun}
							{summary.skipped > 0 ? ` · ${summary.skipped} not applicable` : ''}
						</span>
						<Badge tone={artifactTone[displayedArtifactHealth]}>
							{displayedArtifactHealth}
						</Badge>
					</div>
					{/* Present and Total are derived from Fresh, Stale and Missing. Giving all six equal
			    weight made the same inventory look like six independent health signals, so the
			    summary keeps only the four numbers that guide an operator's next action. */}
					<div className="grid grid-cols-2 gap-3 @min-[32rem]:grid-cols-4">
						{tiles.map((tile) => (
							<Metric
								detail={tile.detail}
								key={tile.label}
								label={tile.label}
								tone={tile.tone}
								value={tile.value}
							/>
						))}
					</div>
					{/* An inline pair. As sm:grid-cols-2 the second fact landed on the midpoint of a
			    1928px card at 2250 — roughly 800px clear on either side of it — so a two-item row
			    read as one fact and one orphan. There is no column here to align; there are two
			    short strings that belong beside each other. */}
					<div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
						<div>
							<span className="font-medium text-muted-foreground">Checked:</span>{' '}
							<RelativeAge value={artifactCheck.checkedAt} />
						</div>
						<div>
							<span className="font-medium text-muted-foreground">
								Stale threshold:
							</span>{' '}
							{artifactCheck.staleThresholdDays} day
							{artifactCheck.staleThresholdDays === 1 ? '' : 's'}
						</div>
					</div>
				</section>
				<Card>
					<CardHeader
						className="mb-3"
						description="Maturity artifacts are required unless a row says otherwise. Filter the inventory to isolate missing or stale evidence."
						headingLevel={3}
						title={`Artifact inventory (${visibleInventoryCount}${inventoryFilter === 'all' ? '' : ` of ${inventoryCount}`})`}
					/>
					{inventoryCount === 0 ? (
						<p className="text-sm text-muted-foreground">
							No individual artifact records or maturity evidence were reported.
						</p>
					) : (
						<ArtifactGroups
							disabled={skipMutation.isPending}
							filter={inventoryFilter}
							maturity={maturity}
							onFilterChange={setInventoryFilter}
							onOpen={setOpenedArtifact}
							onToggleSkip={maturity ? toggleSkip : undefined}
							records={artifacts}
							skipSet={skipSet}
						/>
					)}
					{openedArtifact ? (
						<Suspense fallback={null}>
							<ArtifactViewerDialog
								onClose={() => setOpenedArtifact(null)}
								projectId={projectId}
								target={openedArtifact}
							/>
						</Suspense>
					) : null}
				</Card>
			</div>
		</div>
	);
}
