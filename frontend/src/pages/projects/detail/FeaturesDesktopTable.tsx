import type {
	ProjectFeature,
	ProjectFeatureStatus,
	ProjectRoadmapSummary,
} from '../../../api/types.ts';
import type { FeatureSortDir, FeatureSortKey } from './features-list-sort.ts';

import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { RelativeAge } from '../../../components/shared/RelativeAge.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { useViewportFill, viewportFillScrollerClass } from '../../../hooks/useViewportFill.ts';
import { humanizeEnum } from '../../../lib/formatters.ts';
import { featurePassesDisagrees } from './featureLaunchEligibility.ts';
import {
	FeatureActions,
	FeatureMilestoneControl,
	FeaturePriorityControl,
	FeatureSourceControl,
} from './FeatureRowControls.tsx';
import { featureSearchContext } from './featureSearchUtils.ts';
import { FeaturesTableHeader } from './FeaturesTableHeader.tsx';
import { featureDirectory, featureShippedVersion } from './featuresUtils.ts';
import { featureActionEdgeClass, featureActionTrack } from './featureTableWidths.ts';
import { featureAddedAt, featureCompletedAt } from './featureTimestamps.ts';
import { projectDetailViewportGutterPx } from './projectDetailViewport.ts';
import { statusTone, stringValue } from './shared.ts';

const dateCellClass = 'px-4 py-3 text-xs whitespace-nowrap text-muted-foreground';

export function FeaturesDesktopTable({
	decisions,
	deemphasizePriority,
	inventory,
	isMutating,
	launchingFeature,
	milestoneOptions,
	onApprove,
	onDecisionChange,
	onDelete,
	onLaunchRun,
	onMilestoneChange,
	onSelect,
	onSourceChange,
	onStatusChange,
	onToggleSort,
	query,
	roadmap,
	rows,
	runActive,
	sortDir,
	sortKey,
}: {
	decisions: Record<string, string>;
	deemphasizePriority: boolean;
	/** Every feature the project has, not the filtered rows, so the launch rule sees prerequisites
	 * a filter is hiding. */
	inventory: ProjectFeature[];
	isMutating: boolean;
	launchingFeature: null | string;
	milestoneOptions: string[];
	onApprove: (feature: ProjectFeature, decisionRequired: boolean) => void;
	onDecisionChange: (directory: string, value: string) => void;
	onDelete: (feature: ProjectFeature) => void;
	onLaunchRun: (feature: ProjectFeature) => void;
	onMilestoneChange: (feature: ProjectFeature, milestone: string) => void;
	onSelect: (feature: ProjectFeature) => void;
	onSourceChange: (feature: ProjectFeature, category: string) => void;
	onStatusChange: (feature: ProjectFeature, status: ProjectFeatureStatus) => void;
	onToggleSort: (key: FeatureSortKey) => void;
	query: string;
	roadmap: null | ProjectRoadmapSummary;
	rows: ProjectFeature[];
	runActive: boolean;
	sortDir: FeatureSortDir;
	sortKey: FeatureSortKey;
}) {
	const tableRef = useViewportFill<HTMLDivElement>({
		gutterPx: projectDetailViewportGutterPx,
		refreshKey: rows,
	});

	return (
		<OverflowScroller
			ariaLabel="Project features"
			className="hidden max-w-[104rem] @min-[61rem]:block"
			rootRef={tableRef}
			scrollerClassName={viewportFillScrollerClass}>
			<table
				aria-label="Project features"
				className={`w-full table-fixed text-left text-sm ${featureActionTrack(rows).table}`}>
				<FeaturesTableHeader
					onToggleSort={onToggleSort}
					rows={rows}
					sortDir={sortDir}
					sortKey={sortKey}
				/>
				<tbody>
					{rows.map((feature) => {
						const id = feature.id || stringValue(feature, 'id');
						const title = stringValue(feature, 'title') || id;
						const status = stringValue(feature, 'status') || 'unknown';
						const directory = featureDirectory(feature);
						const decision = decisions[directory] ?? '';
						const searchContext = featureSearchContext(feature, query);
						return (
							<tr
								className="group group/quiet border-b border-border transition-colors last:border-0 hover:bg-muted/40"
								key={id}>
								<td className="px-4 py-3">
									<div className="min-w-0">
										<div className="font-medium text-foreground">{title}</div>
										<div
											className="truncate font-mono text-xs text-muted-foreground"
											title={id}>
											{id}
										</div>
										{searchContext ? (
											<div
												className="truncate text-xs text-muted-foreground"
												title={searchContext.title}>
												{searchContext.before}
												<mark className="bg-accent/20 text-foreground">
													{searchContext.match}
												</mark>
												{searchContext.after}
											</div>
										) : null}
									</div>
								</td>
								<td className="px-4 py-3">
									<div className="flex flex-wrap items-center gap-1">
										<Badge tone={statusTone(status)}>
											{humanizeEnum(status)}
										</Badge>
										{featurePassesDisagrees(feature, status) ? (
											<Badge
												title="Status and passes disagree; completion requires completed plus passes=true"
												tone="amber">
												metadata conflict
											</Badge>
										) : null}
									</div>
								</td>
								<td className="px-4 py-3 font-mono text-xs text-muted-foreground">
									{featureShippedVersion(feature) ?? '—'}
								</td>
								<td className="px-4 py-3">
									<FeatureMilestoneControl
										disabled={isMutating}
										feature={feature}
										milestoneOptions={milestoneOptions}
										onChange={(milestone) =>
											onMilestoneChange(feature, milestone)
										}
										quiet
										roadmap={roadmap}
									/>
								</td>
								<td className="px-4 py-3">
									<FeaturePriorityControl
										deemphasized={deemphasizePriority}
										disabled={isMutating}
										feature={feature}
										onChange={(milestone) =>
											onMilestoneChange(feature, milestone)
										}
										priority={feature.priority}
										roadmap={roadmap}
									/>
								</td>
								<td className="hidden px-4 py-3 text-xs text-muted-foreground @min-[88rem]:table-cell">
									<FeatureSourceControl
										disabled={isMutating}
										feature={feature}
										inventory={inventory}
										onChange={(category) => onSourceChange(feature, category)}
										quiet
									/>
								</td>
								<td className={`hidden @min-[88rem]:table-cell ${dateCellClass}`}>
									<RelativeAge value={featureAddedAt(feature)?.iso ?? null} />
								</td>
								<td className={`hidden @min-[88rem]:table-cell ${dateCellClass}`}>
									<RelativeAge value={featureCompletedAt(feature)?.iso ?? null} />
								</td>
								<td
									className={`sticky right-0 z-[5] bg-card px-4 py-3 transition-colors group-hover:bg-[color-mix(in_srgb,var(--muted)_40%,var(--card))] ${featureActionEdgeClass}`}>
									<FeatureActions
										decision={decision}
										disabled={isMutating}
										feature={feature}
										inventory={inventory}
										launching={launchingFeature === directory}
										onApprove={onApprove}
										onDecisionChange={(value) =>
											onDecisionChange(directory, value)
										}
										onDelete={onDelete}
										onLaunchRun={onLaunchRun}
										onSelect={onSelect}
										onStatusChange={onStatusChange}
										runActive={runActive}
										status={status}
									/>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</OverflowScroller>
	);
}
