import type { AuditApplicabilityCell } from '../../../api/types.ts';

import { Badge, StatusDot } from '../../../components/ui/badge.tsx';
import { describeCell, effectTone } from '../auditsUtils.ts';

/**
 * `default` is roughly 85% of the cells. Rendered as a filled badge it produced six near-identical
 * columns of pills and buried the handful of cells that carry a decision, so the baseline is a muted
 * dot and the badge is reserved for the effects that deviate from it.
 */
export function EffectCell({ cell }: { cell: AuditApplicabilityCell }) {
	if (cell.effect === 'default') {
		return (
			<span
				className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
				title={describeCell(cell)}>
				<StatusDot />
				<span className="sr-only">default</span>
				{cell.conditional ? '*' : ''}
			</span>
		);
	}
	return (
		<Badge tone={effectTone[cell.effect]}>
			<span title={describeCell(cell)}>
				{cell.effect}
				{cell.conditional ? '*' : ''}
			</span>
		</Badge>
	);
}

/**
 * The key to the cell vocabulary above. It renders once per tab, in the toolbar's card header, and
 * serves the desktop table and the narrow card stack both — it used to be a second `<thead>` row for
 * one and a card of its own for the other.
 */
export function MatrixLegend() {
	return (
		<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
			<span className="inline-flex items-center gap-1">
				<StatusDot />
				default
			</span>
			<Badge tone={effectTone.required}>required</Badge>
			<Badge tone={effectTone.disabled}>disabled</Badge>
			<Badge tone={effectTone.excluded}>excluded</Badge>
			<span>* also constrained by non-bucket facets</span>
		</span>
	);
}
