import { lazy, Suspense, useState } from 'react';
import { toast } from 'sonner';

import type { MaturityDetail, ProjectArtifactCheckSummary } from '../../../api/types.ts';
import type { Tone } from '../../../lib/tones.ts';
import type { ArtifactViewerTarget } from './artifactsUtils.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useUpdateMaturitySkip } from '../../../hooks/useProjects.ts';
import { formatDate, formatRelativeAge } from '../../../lib/formatters.ts';
import { ArtifactGroups } from './ArtifactGroups.tsx';
import { artifactInventoryCount } from './artifactsUtils.ts';
import { type ArtifactHealth, artifactTone } from './shared.ts';

// Pulls in react-markdown + remark-gfm (~250KB); lazy so the tab does not pay for it
// until a user actually opens an artifact.
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
			<Card>
				<CardHeader
					action={<Badge tone={artifactTone[artifactHealth]}>{artifactHealth}</Badge>}
					className="mb-3"
					title="Artifact health"
				/>
				<p className="text-sm text-muted-foreground">
					No artifact check data available. Run an artifact check from the CLI to populate{' '}
					<code>.aidd/.artifacts-check.json</code>.
				</p>
			</Card>
		);
	}
	const { artifacts, summary } = artifactCheck;
	const inventoryCount = artifactInventoryCount(artifacts, maturity);
	// `health` is the user-facing reading of the count; `tone` stays an internal styling token and is
	// never rendered as text.
	const tiles: { health: string; label: string; tone: Tone; value: number }[] = [
		{ health: 'Healthy', label: 'Fresh', tone: 'emerald', value: summary.fresh },
		{ health: 'Needs refresh', label: 'Stale', tone: 'amber', value: summary.stale },
		{ health: 'Not found', label: 'Missing', tone: 'red', value: summary.missing },
		{ health: 'On disk', label: 'Present', tone: 'teal', value: summary.present },
		{
			health: 'Blocking',
			label: 'Required missing',
			tone: 'red',
			value: summary.requiredMissing,
		},
		{ health: 'Inventory', label: 'Total', tone: 'neutral', value: summary.total },
	];
	return (
		<Card>
			<CardHeader
				action={<Badge tone={artifactTone[artifactHealth]}>{artifactHealth}</Badge>}
				className="mb-3"
				title="Artifact health"
			/>
			<div className="grid gap-3 sm:grid-cols-3 md:grid-cols-6">
				{tiles.map((tile) => (
					<div
						className="rounded-md border border-border p-3 text-center"
						key={tile.label}>
						<div className="text-xs text-muted-foreground uppercase">{tile.label}</div>
						<div className="mt-1 text-lg font-semibold text-foreground">
							{tile.value}
						</div>
						<div className="mt-1">
							<Badge tone={tile.tone}>{tile.health}</Badge>
						</div>
					</div>
				))}
			</div>
			<div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
				<div>
					<span className="font-medium text-muted-foreground">Checked:</span>{' '}
					{formatDate(artifactCheck.checkedAt)} (
					{formatRelativeAge(artifactCheck.checkedAt)})
				</div>
				<div>
					<span className="font-medium text-muted-foreground">Stale threshold:</span>{' '}
					{artifactCheck.staleThresholdDays} day
					{artifactCheck.staleThresholdDays === 1 ? '' : 's'}
				</div>
			</div>
			<div className="mt-4">
				<p className="mb-2 text-xs text-muted-foreground">
					The health summary covers the assertion catalog checked by{' '}
					<code>--check-artifacts</code>. The inventory also includes broader maturity
					evidence such as feature metadata, audit reports, and deployment artifacts.
				</p>
				<h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Artifact inventory ({inventoryCount})
				</h3>
				{inventoryCount === 0 ? (
					<p className="text-sm text-muted-foreground">
						No individual artifact records or maturity evidence were reported.
					</p>
				) : (
					<ArtifactGroups
						disabled={skipMutation.isPending}
						maturity={maturity}
						onOpen={setOpenedArtifact}
						onToggleSkip={maturity ? toggleSkip : undefined}
						records={artifacts}
						skipSet={skipSet}
					/>
				)}
			</div>
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
	);
}
