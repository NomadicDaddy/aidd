import type { ReactNode } from 'react';

import { default as Eye } from 'lucide-react/dist/esm/icons/eye';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as X } from 'lucide-react/dist/esm/icons/x';

import type { ProjectFeature } from '../../../api/types.ts';
import type { FeatureDependencyNode } from './dependencyGraphUtils.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { Button, IconButton } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { cn } from '../../../lib/cn.ts';
import { humanizeEnum } from '../../../lib/formatters.ts';
import { toneBorder, toneSurface, toneText } from '../../../lib/tones.ts';
import { microLabelClass, sectionCaptionClass } from '../../../lib/typography.ts';
import { DependencyList, sourceBadgeTone, sourceLabels } from './dependencyGraphComponents.tsx';
import {
	featureLaunchBlockedTitle,
	featureLaunchGate,
	featurePassesDisagrees,
} from './featureLaunchEligibility.ts';
import { statusTone } from './shared.ts';

// Rendered as a side rail beside the graph canvas only while a node is selected; with no permanent
// rail there is no empty-state placeholder to show.
export function SelectedFeaturePanel({
	hasActiveRun,
	inventory,
	isLaunching,
	launchTarget,
	node,
	nodeByDirectory,
	onClose,
	onLaunchRun,
	onOpenDetails,
	onSelect,
}: {
	hasActiveRun: boolean;
	/** Every feature the project has. A prerequisite absent from this list reads as unsatisfied. */
	inventory: ProjectFeature[];
	isLaunching: boolean;
	launchTarget: ReactNode;
	node: FeatureDependencyNode | null;
	nodeByDirectory: Map<string, FeatureDependencyNode>;
	onClose: () => void;
	onLaunchRun: () => void;
	onOpenDetails: () => void;
	onSelect: (directory: string) => void;
}) {
	if (!node) return null;
	const gate = featureLaunchGate(node, inventory);
	const metadataConflict = featurePassesDisagrees(node, node.status);
	return (
		<Card className="min-w-0 space-y-5" variant="panel">
			<div className="space-y-2">
				<div className="flex items-start justify-between gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<Badge tone={statusTone(node.status)}>{humanizeEnum(node.status)}</Badge>
						<Badge tone={sourceBadgeTone(node.source)}>
							{sourceLabels[node.source]}
						</Badge>
						{node.milestone ? <Badge tone="neutral">{node.milestone}</Badge> : null}
					</div>
					<IconButton ariaLabel="Clear selection" onClick={onClose} variant="ghost">
						<X className="h-4 w-4" />
					</IconButton>
				</div>
				<h2 className="text-base font-semibold text-foreground">{node.title}</h2>
				<p className="font-mono text-xs break-all text-muted-foreground">
					{node.directory}
				</p>
			</div>
			<div className="grid grid-cols-2 gap-2 text-sm">
				<div className="rounded-md border border-border p-3">
					<p className={`${microLabelClass} text-muted-foreground`}>Depends on</p>
					<p className="mt-1 text-lg font-semibold text-foreground">
						{node.resolvedDependencies.length}
					</p>
				</div>
				<div className="rounded-md border border-border p-3">
					<p className={`${microLabelClass} text-muted-foreground`}>Dependents</p>
					<p className="mt-1 text-lg font-semibold text-foreground">
						{node.dependents.length}
					</p>
				</div>
			</div>
			{launchTarget}
			<div className="flex flex-wrap gap-2">
				<Button onClick={onOpenDetails} variant="secondary">
					<Eye className="h-4 w-4" />
					Details
				</Button>
				<Button
					aria-label={`Launch coding run for ${node.directory}`}
					disabled={hasActiveRun || isLaunching || !gate.canLaunch}
					onClick={onLaunchRun}
					title={
						metadataConflict
							? 'Cannot launch: passes and status metadata disagree'
							: gate.blockedBy.length > 0
								? featureLaunchBlockedTitle(gate.blockedBy)
								: !gate.canLaunch
									? 'Only backlog and in-progress features can launch runs'
									: hasActiveRun
										? 'A run for this project is already in progress'
										: 'Launch a feature-specific coding run'
					}
					variant="primary">
					<Play className="h-4 w-4" />
					{isLaunching ? 'Launching' : hasActiveRun ? 'Run active' : 'Launch run'}
				</Button>
			</div>
			<DependencyList
				directories={node.resolvedDependencies}
				nodeByDirectory={nodeByDirectory}
				onSelect={onSelect}
				title="Dependencies"
			/>
			<DependencyList
				directories={node.dependents}
				nodeByDirectory={nodeByDirectory}
				onSelect={onSelect}
				title="Dependents"
			/>
			{gate.blockedBy.length > 0 ? (
				<section>
					<h3 className={cn(sectionCaptionClass, toneText.amber)}>Blocked by</h3>
					<p className="mt-1.5 text-xs text-muted-foreground">
						Selection skips this feature until every prerequisite below is completed and
						passing, so a run launched here would decline to pick it up.
					</p>
					<ul className="mt-2 space-y-1.5">
						{gate.blockedBy.map((dependency) => (
							<li
								className={cn(
									'min-w-0 truncate rounded-md border px-3 py-2 font-mono text-xs',
									toneBorder.amber,
									toneSurface.amber,
									toneText.amber,
								)}
								key={dependency}
								title={dependency}>
								{dependency}
							</li>
						))}
					</ul>
				</section>
			) : null}
			{node.missingDependencies.length > 0 ? (
				<section>
					<h3 className={cn(sectionCaptionClass, toneText.red)}>Unresolved</h3>
					<ul className="mt-2 space-y-1.5">
						{node.missingDependencies.map((dependency) => (
							<li
								className={cn(
									'min-w-0 truncate rounded-md border px-3 py-2 font-mono text-xs',
									toneBorder.red,
									toneSurface.red,
									toneText.red,
								)}
								key={dependency}
								title={dependency}>
								{dependency}
							</li>
						))}
					</ul>
				</section>
			) : null}
		</Card>
	);
}
