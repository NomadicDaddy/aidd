import type { AuditDefinition } from '../../../api/types.ts';

import { toneText } from '../../../lib/tones.ts';

/**
 * The fresh/stale/missing triple, as three numbers rather than three number-plus-noun phrases.
 *
 * Every row used to restate the units the column header already carried — "fresh", "stale" and
 * "missing" once per row, 42 times each, in a table whose data is five numbers per row. The words
 * moved into the header, so what is left is a column of digits that lines up.
 */
export function ReportCounts({ definition }: { definition: AuditDefinition }) {
	return (
		<span className="tabular-nums">
			<span className={toneText.emerald}>{definition.freshReportCount}</span>
			<span className="mx-1.5 text-muted-foreground">/</span>
			<span className={toneText.amber}>{definition.staleReportCount}</span>
			<span className="mx-1.5 text-muted-foreground">/</span>
			<span className={toneText.red}>{definition.missingReportCount}</span>
		</span>
	);
}
