import { lazy, Suspense, useState } from 'react';
import { toast } from 'sonner';

import type {
	MaturityDetail,
	ProjectArtifactCheckSummary,
	ProjectArtifactRecord,
} from '../../../api/types.ts';
import type { Tone } from './artifactsUtils.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { useUpdateMaturitySkip } from '../../../hooks/useProjects.ts';
import { formatDate, formatRelativeAge } from '../../../lib/formatters.ts';
import { ArtifactGroups } from './ArtifactGroups.tsx';
import { artifactTone, type ArtifactHealth } from './shared.ts';

// Pulls in react-markdown + remark-gfm (~250KB); lazy so the tab does not pay for it
// until a user actually opens an artifact.
const ArtifactViewerDialog = lazy(() =>
	import('./ArtifactViewerDialog.tsx').then((m) => ({ default: m.ArtifactViewerDialog }))
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
	const [openedRecord, setOpenedRecord] = useState<null | ProjectArtifactRecord>(null);
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
				<div className="mb-3 flex items-center justify-between">
					<h2 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
						Artifact health
					</h2>
					<Badge tone={artifactTone[artifactHealth]}>{artifactHealth}</Badge>
				</div>
				<p className="text-sm text-neutral-500">
					No artifact check data available. Run an artifact check from the CLI to populate{' '}
					<code>.aidd/.artifacts-check.json</code>.
				</p>
			</Card>
		);
	}
	const { artifacts, summary } = artifactCheck;
	const tiles: { label: string; tone: Tone; value: number }[] = [
		{ label: 'Fresh', tone: 'emerald', value: summary.fresh },
		{ label: 'Stale', tone: 'amber', value: summary.stale },
		{ label: 'Missing', tone: 'red', value: summary.missing },
		{ label: 'Present', tone: 'cyan', value: summary.present },
		{ label: 'Required missing', tone: 'red', value: summary.requiredMissing },
		{ label: 'Total', tone: 'neutral', value: summary.total },
	];
	return (
		<Card>
			<div className="mb-3 flex items-center justify-between">
				<h2 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
					Artifact health
				</h2>
				<Badge tone={artifactTone[artifactHealth]}>{artifactHealth}</Badge>
			</div>
			<div className="grid gap-3 sm:grid-cols-3 md:grid-cols-6">
				{tiles.map((tile) => (
					<div
						className="rounded-md border border-neutral-200 p-3 text-center dark:border-neutral-800"
						key={tile.label}>
						<div className="text-xs text-neutral-500 uppercase">{tile.label}</div>
						<div className="mt-1 text-lg font-semibold text-neutral-950 dark:text-neutral-50">
							{tile.value}
						</div>
						<div className="mt-1">
							<Badge tone={tile.tone}>{tile.tone}</Badge>
						</div>
					</div>
				))}
			</div>
			<div className="mt-3 grid gap-2 text-xs text-neutral-600 sm:grid-cols-2 dark:text-neutral-400">
				<div>
					<span className="font-medium text-neutral-500">Checked:</span>{' '}
					{formatDate(artifactCheck.checkedAt)} (
					{formatRelativeAge(artifactCheck.checkedAt)})
				</div>
				<div>
					<span className="font-medium text-neutral-500">Stale threshold:</span>{' '}
					{artifactCheck.staleThresholdDays} day
					{artifactCheck.staleThresholdDays === 1 ? '' : 's'}
				</div>
			</div>
			<div className="mt-4">
				<h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
					Artifacts ({artifacts.length})
				</h3>
				{artifacts.length === 0 ? (
					<p className="text-sm text-neutral-500">
						No individual artifact records were reported in this check.
					</p>
				) : (
					<ArtifactGroups
						disabled={skipMutation.isPending}
						maturity={maturity}
						onOpen={setOpenedRecord}
						onToggleSkip={maturity ? toggleSkip : undefined}
						records={artifacts}
						skipSet={skipSet}
					/>
				)}
			</div>
			{openedRecord ? (
				<Suspense fallback={null}>
					<ArtifactViewerDialog
						onClose={() => setOpenedRecord(null)}
						projectId={projectId}
						record={openedRecord}
					/>
				</Suspense>
			) : null}
		</Card>
	);
}
