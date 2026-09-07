import { default as ArrowRight } from 'lucide-react/dist/esm/icons/arrow-right';
import { default as ListFilter } from 'lucide-react/dist/esm/icons/list-filter';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { useState } from 'react';
import { Link } from 'react-router';

import type { DashboardFeatureStatusBucket, FeatureStatusType } from '../../api/types.ts';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { FilterToolbarReadout } from '../../components/shared/FilterToolbarReadout.tsx';
import { SkeletonLines } from '../../components/shared/LoadingState.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card, CardHeader, cardHeaderLinkClass } from '../../components/ui/card.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { toneText } from '../../lib/tones.ts';
import { DASHBOARD_CARD_MAX_ROWS } from './dashboard-shared.ts';
import { type FeatureStatusRow, FeatureStatusRows } from './FeatureStatusRows.tsx';

type FeatureStatusState = 'completed' | 'pending';

const stateOptions: { label: string; value: FeatureStatusState }[] = [
	{ label: 'Pending', value: 'pending' },
	{ label: 'Completed', value: 'completed' },
];

const typeOptions: { label: string; value: FeatureStatusType }[] = [
	{ label: 'Features', value: 'feature' },
	{ label: 'Remediation', value: 'remediation' },
	{ label: 'Audit', value: 'audit' },
];

const EMPTY_BUCKET: Pick<DashboardFeatureStatusBucket, 'rows' | 'total'> = { rows: [], total: 0 };

/**
 * The six (state, type) cells partition every feature record in the fleet, so their summed totals
 * are the row count this card used to get by flattening every project's `featureStatus` in the
 * browser — 2,698 records to paint six rows. The server sends the counts and the previews; nothing
 * here reconstructs the full list.
 */
function selectBucket(
	buckets: DashboardFeatureStatusBucket[],
	stateFilter: FeatureStatusState,
	typeFilter: FeatureStatusType,
): Pick<DashboardFeatureStatusBucket, 'rows' | 'total'> {
	return (
		buckets.find((bucket) => bucket.state === stateFilter && bucket.type === typeFilter) ??
		EMPTY_BUCKET
	);
}

export function FeatureStatusCard({
	buckets,
	isError,
	isLoading,
	onRetry,
}: {
	buckets: DashboardFeatureStatusBucket[];
	isError: boolean;
	isLoading: boolean;
	onRetry: () => void;
}) {
	const [stateFilter, setStateFilter] = useState<FeatureStatusState>('pending');
	const [typeFilter, setTypeFilter] = useState<FeatureStatusType>('feature');
	const totalRows = buckets.reduce((sum, bucket) => sum + bucket.total, 0);
	const bucket = selectBucket(buckets, stateFilter, typeFilter);
	// The server already returns each bucket in (application, feature) order, capped at the
	// preview count — the same rows this card sliced to after sorting the whole fleet.
	const displayedRows: FeatureStatusRow[] = bucket.rows.slice(0, DASHBOARD_CARD_MAX_ROWS);

	return (
		<Card className="overflow-hidden" variant="panel">
			<CardHeader
				action={
					<Link className={cardHeaderLinkClass} to="/projects">
						Projects
						<ArrowRight className="h-3.5 w-3.5" />
					</Link>
				}
				badge={
					<Badge showDot tone={bucket.total > 0 ? 'amber' : 'emerald'}>
						{bucket.total} {stateFilter}
					</Badge>
				}
				description="Fleet feature rows by aidd-tools status filter."
				icon={<ListFilter className={`h-4 w-4 ${toneText.teal}`} />}
				title="Feature Status"
			/>

			{/* `@container` for the readout's sake: it gates its own alignment on the container it
			    sits in, and without one the gate never fires — at 390 the caption wrapped below these
			    two fields and stayed pushed 107px right of a 324px card. This row is the measure it
			    wraps within, so it is the container. */}
			<div className="@container mb-4 flex flex-wrap items-end gap-3">
				<FieldRow group label="State">
					<SegmentedControl
						ariaLabel="Feature state"
						onChange={setStateFilter}
						options={stateOptions}
						value={stateFilter}
					/>
				</FieldRow>
				<FieldRow group label="Category">
					<SegmentedControl
						ariaLabel="Feature type"
						onChange={setTypeFilter}
						options={typeOptions}
						value={typeFilter}
					/>
				</FieldRow>
				<FilterToolbarReadout
					filtered={displayedRows.length}
					noun="matching"
					readoutSuffix={<> · {totalRows} total</>}
					responsiveScope="viewport"
					total={bucket.total}
				/>
			</div>

			{isLoading && totalRows === 0 ? (
				<SkeletonLines count={6} label="Loading feature status…" />
			) : isError ? (
				<EmptyState
					action={
						<Button className="text-xs" onClick={onRetry} variant="secondary">
							<RefreshCw className="h-3.5 w-3.5" />
							Retry
						</Button>
					}>
					Failed to load feature status.
				</EmptyState>
			) : totalRows === 0 ? (
				<EmptyState
					action={
						<Link className={buttonClassName('secondary')} to="/settings">
							Configure project roots
							<ArrowRight className="h-3.5 w-3.5" />
						</Link>
					}>
					No projects with feature metadata were discovered.
				</EmptyState>
			) : bucket.total === 0 ? (
				<EmptyState>
					No {stateFilter} {typeFilter} rows match the selected filters.
				</EmptyState>
			) : (
				<FeatureStatusRows rows={displayedRows} />
			)}
		</Card>
	);
}
