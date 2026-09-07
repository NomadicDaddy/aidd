import type { AuditDefinition, OutcomeRate } from '../../../api/types.ts';
import type { CatalogSort, CatalogSortKey } from '../catalogSort.ts';

import { SortableColumnHeader } from '../../../components/shared/SortableColumnHeader.tsx';
import { toneText } from '../../../lib/tones.ts';

/**
 * The fresh/stale/missing triple, as three numbers rather than three number-plus-noun phrases.
 *
 * The units live in the column header, not the rows: restating "fresh", "stale" and "missing"
 * once per row is 42 copies of each in a table whose data is five numbers per row. With the words
 * in the header, what is left is a column of digits that lines up. A zero applicability
 * denominator is the exception: it names why no report count can exist instead of presenting
 * three zeroes as though they were health evidence.
 */
export function ReportCounts({ definition }: { definition: AuditDefinition }) {
	const staleClass = definition.staleReportCount > 0 ? toneText.amber : 'text-muted-foreground';
	const missingClass =
		definition.missingReportCount > definition.freshReportCount
			? toneText.red
			: 'text-muted-foreground';
	return (
		<>
			{definition.applicableProjectCount === 0 ? (
				<span className="whitespace-nowrap text-muted-foreground">
					No applicable projects
				</span>
			) : (
				<span className="tabular-nums">
					<span className="text-muted-foreground">{definition.freshReportCount}</span>
					<span className="mx-1.5 text-muted-foreground">/</span>
					<span className={staleClass}>{definition.staleReportCount}</span>
					<span className="mx-1.5 text-muted-foreground">/</span>
					<span className={missingClass}>{definition.missingReportCount}</span>
				</span>
			)}
		</>
	);
}

function percent(value: number): string {
	// Every rate is a share of its own denominator; clamp so a bad payload can never read as 150%.
	const bounded = Math.min(Math.max(value, 0), 1);
	return new Intl.NumberFormat(undefined, {
		maximumFractionDigits: bounded > 0 && bounded < 0.01 ? 1 : 0,
		style: 'percent',
	}).format(bounded);
}

export function OutcomeRateCell({
	degradedProjects = 0,
	denominatorLabel,
	rate,
}: {
	/** Projects whose ledger could not be read; the rate is shown with a coverage warning. */
	degradedProjects?: number | undefined;
	denominatorLabel: string;
	rate: OutcomeRate | undefined;
}) {
	return (
		<span className="block tabular-nums">
			<span
				className={`block ${rate?.value === null || rate === undefined ? 'text-muted-foreground' : 'text-foreground'}`}>
				{rate?.value === null || rate === undefined ? '—' : percent(rate.value)}
			</span>
			<span className="block text-2xs whitespace-nowrap text-muted-foreground">
				{rate?.numerator ?? 0}/{rate?.denominator ?? 0} {denominatorLabel}
			</span>
			{degradedProjects > 0 ? (
				<span className={`block text-2xs whitespace-nowrap ${toneText.amber}`}>
					{degradedProjects} project{degradedProjects === 1 ? '' : 's'} unreadable
				</span>
			) : null}
		</span>
	);
}

export function OutcomeCostCell({ definition }: { definition: AuditDefinition }) {
	const measure = definition.outcome?.costPerAcceptedFinding;
	return (
		<span className="block tabular-nums">
			<span
				className={`block ${measure?.value === null || measure === undefined ? 'text-muted-foreground' : 'text-foreground'}`}>
				{measure?.value === null || measure === undefined
					? '—'
					: new Intl.NumberFormat(undefined, {
							currency: 'USD',
							maximumFractionDigits: 2,
							style: 'currency',
						}).format(measure.value)}
			</span>
			<span className="block text-2xs whitespace-nowrap text-muted-foreground">
				{measure?.costedAcceptedFindings ?? 0}/{measure?.acceptedFindings ?? 0} accepted ·{' '}
				{measure?.capturedRuns ?? 0}/{measure?.totalRuns ?? 0} costed
			</span>
		</span>
	);
}

export function CatalogOutcomeHeaders({
	numericHead,
	onSort,
	sort,
}: {
	numericHead: string;
	onSort: (key: CatalogSortKey) => void;
	sort: CatalogSort;
}) {
	return (
		<>
			<SortableColumnHeader
				activeDir={sort.dir}
				activeKey={sort.key}
				className={numericHead}
				label="Acceptance"
				onSort={onSort}
				sortKey="acceptance"
			/>
			<SortableColumnHeader
				activeDir={sort.dir}
				activeKey={sort.key}
				className={numericHead}
				label="Recurrence"
				onSort={onSort}
				sortKey="recurrence"
			/>
			<SortableColumnHeader
				activeDir={sort.dir}
				activeKey={sort.key}
				className={numericHead}
				label="Cost / Accepted"
				onSort={onSort}
				sortKey="cost"
			/>
		</>
	);
}

export function CatalogOutcomeCells({
	definition,
	numericCell,
}: {
	definition: AuditDefinition;
	numericCell: string;
}) {
	return (
		<>
			<td className={numericCell}>
				<OutcomeRateCell
					degradedProjects={definition.outcome?.degradedProjects}
					denominatorLabel="decided"
					rate={definition.outcome?.acceptanceRate}
				/>
			</td>
			<td className={numericCell}>
				<OutcomeRateCell
					denominatorLabel="remediated"
					rate={definition.outcome?.recurrenceRate}
				/>
			</td>
			<td className={numericCell}>
				<OutcomeCostCell definition={definition} />
			</td>
		</>
	);
}
