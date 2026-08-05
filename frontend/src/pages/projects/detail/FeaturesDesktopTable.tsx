import type {
	ProjectFeature,
	ProjectFeatureStatus,
	ProjectRoadmapSummary,
} from '../../../api/types.ts';

import { Badge } from '../../../components/ui/badge.tsx';
import { FeatureActions, FeatureMilestoneControl } from './FeatureRowControls.tsx';
import {
	featureDirectory,
	featurePassesDisagrees,
	featurePriorityTone,
	featureShippedVersion,
	featureSourceLabel,
} from './featuresUtils.ts';
import { statusTone, stringValue } from './shared.ts';

export function FeaturesDesktopTable({
	decisions,
	isMutating,
	launchingFeature,
	milestoneOptions,
	onApprove,
	onDecisionChange,
	onDelete,
	onLaunchRun,
	onMilestoneChange,
	onSelect,
	onStatusChange,
	roadmap,
	rows,
	runActive,
}: {
	decisions: Record<string, string>;
	isMutating: boolean;
	launchingFeature: null | string;
	milestoneOptions: string[];
	onApprove: (feature: ProjectFeature, decisionRequired: boolean) => void;
	onDecisionChange: (directory: string, value: string) => void;
	onDelete: (feature: ProjectFeature) => void;
	onLaunchRun: (feature: ProjectFeature) => void;
	onMilestoneChange: (feature: ProjectFeature, milestone: string) => void;
	onSelect: (feature: ProjectFeature) => void;
	onStatusChange: (feature: ProjectFeature, status: ProjectFeatureStatus) => void;
	roadmap: null | ProjectRoadmapSummary;
	rows: ProjectFeature[];
	runActive: boolean;
}) {
	return (
		<div className="hidden overflow-x-auto xl:block">
			<table aria-label="Project features" className="w-full table-fixed text-left text-sm">
				<colgroup>
					<col className="w-[32%]" />
					<col className="w-[11%]" />
					<col className="w-[8%]" />
					<col className="w-[14%]" />
					<col className="w-[8%]" />
					<col className="w-[13%]" />
					<col className="w-[14%]" />
				</colgroup>
				<thead className="border-b border-border bg-muted text-xs text-muted-foreground uppercase">
					<tr>
						<th className="px-4 py-3" scope="col">
							Feature
						</th>
						<th className="px-4 py-3" scope="col">
							Status
						</th>
						<th className="px-4 py-3" scope="col">
							Shipped
						</th>
						<th className="px-4 py-3" scope="col">
							Milestone
						</th>
						<th className="px-4 py-3" scope="col">
							Priority
						</th>
						<th className="px-4 py-3" scope="col">
							Source
						</th>
						<th className="px-4 py-3 whitespace-nowrap" scope="col">
							Actions
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((feature) => {
						const id = feature.id || stringValue(feature, 'id');
						const title = stringValue(feature, 'title') || id;
						const status = stringValue(feature, 'status') || 'unknown';
						const source = featureSourceLabel(feature);
						const directory = featureDirectory(feature);
						const decision = decisions[directory] ?? '';
						return (
							<tr
								className="group border-b border-border transition-colors last:border-0 hover:bg-muted/40"
								key={id}>
								<td className="px-4 py-3">
									<div className="min-w-0">
										<div className="font-medium text-foreground">{title}</div>
										<div
											className="truncate text-xs text-muted-foreground"
											title={id}>
											{id}
										</div>
									</div>
								</td>
								<td className="px-4 py-3">
									<div className="flex flex-wrap items-center gap-1">
										<Badge tone={statusTone(status)}>{status}</Badge>
										{featurePassesDisagrees(feature, status) ? (
											<Badge
												title="Feature status and passes flag disagree"
												tone="amber">
												not passing
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
									{typeof feature.priority === 'number' ? (
										<Badge tone={featurePriorityTone(feature.priority)}>
											P{feature.priority}
										</Badge>
									) : (
										<span className="text-xs text-muted-foreground">—</span>
									)}
								</td>
								<td className="px-4 py-3 text-xs break-words text-muted-foreground">
									{source}
								</td>
								<td className="px-4 py-3">
									<FeatureActions
										decision={decision}
										disabled={isMutating}
										feature={feature}
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
		</div>
	);
}
