import type { AuditApplicabilityCell, AuditAssuranceBucket } from '../../../api/types.ts';
import type { AuditApplicabilityRow } from '../../../api/types/audits.ts';

export interface MatrixBucketGroup {
	buckets: AuditAssuranceBucket[];
}

function cellsMatch(left: AuditApplicabilityCell, right: AuditApplicabilityCell): boolean {
	return (
		left.applies === right.applies &&
		left.conditional === right.conditional &&
		left.effect === right.effect &&
		left.ruleId === right.ruleId &&
		left.source === right.source
	);
}

function columnsMatch(
	rows: AuditApplicabilityRow[],
	left: AuditAssuranceBucket,
	right: AuditAssuranceBucket,
): boolean {
	return rows.every((row) => cellsMatch(row.byBucket[left], row.byBucket[right]));
}

/**
 * Groups adjacent assurance buckets only when every audit resolves to the same complete cell.
 * Comparing provenance as well as effect keeps a compact column from hiding a different rule.
 */
export function groupEquivalentBuckets(
	rows: AuditApplicabilityRow[],
	buckets: AuditAssuranceBucket[],
): MatrixBucketGroup[] {
	const groups: MatrixBucketGroup[] = [];
	for (const bucket of buckets) {
		const previous = groups.at(-1);
		const previousBucket = previous?.buckets.at(-1);
		if (previous && previousBucket && columnsMatch(rows, previousBucket, bucket)) {
			previous.buckets.push(bucket);
		} else {
			groups.push({ buckets: [bucket] });
		}
	}
	return groups;
}
