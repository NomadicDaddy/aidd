/* eslint-disable react-hooks/set-state-in-effect */
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { AuditApplicabilityCell, AuditProfileMapping } from '../../../api/types.ts';

import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { FilterSearch, FilterToolbar } from '../../../components/shared/FilterToolbar.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { OverflowScroller } from '../../../components/shared/OverflowScroller.tsx';
import { Badge, StatusDot } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useAuditProfileMapping, useUpdateAuditProfileMapping } from '../../../hooks/useAudits.ts';
import { textareaClass } from '../../../lib/formStyles.ts';
import { tableHeadClass } from '../../../lib/tableStyles.ts';
import { toneText } from '../../../lib/tones.ts';
import { bucketColumns, bucketShortLabels, describeCell, effectTone } from '../auditsUtils.ts';

export function ApplicabilityTab() {
	const mapping = useAuditProfileMapping();
	const update = useUpdateAuditProfileMapping();
	const [editorOpen, setEditorOpen] = useState(false);
	const [editorText, setEditorText] = useState('');
	const [editorError, setEditorError] = useState<null | string>(null);
	const [query, setQuery] = useState('');

	useEffect(() => {
		if (editorOpen && mapping.data?.mapping) {
			setEditorText(JSON.stringify(mapping.data.mapping, null, 2));
			setEditorError(null);
		}
	}, [editorOpen, mapping.data?.mapping]);

	if (mapping.isLoading) {
		return <LoadingState message="Loading matrix…" />;
	}

	if (mapping.isError || !mapping.data) {
		return (
			<ErrorState
				error={mapping.error}
				message="Could not load audit profile mapping."
				onRetry={() => void mapping.refetch()}
			/>
		);
	}

	function saveEditor() {
		try {
			const parsed = JSON.parse(editorText) as AuditProfileMapping;
			update.mutate(parsed, {
				onError: (error) =>
					setEditorError(
						error instanceof Error ? error.message : 'Failed to save mapping',
					),
				onSuccess: () => {
					toast.success('Audit profile mapping saved');
					setEditorOpen(false);
				},
			});
		} catch (error) {
			setEditorError(error instanceof Error ? error.message : 'Invalid JSON');
		}
	}

	// Forty-two audit names with no way to reach one but the scrollbar. The matrix is the only tab
	// of the three without a filter, and it is the longest.
	const lower = query.trim().toLowerCase();
	const visibleRows = mapping.data.matrix.filter((row) =>
		lower ? row.auditName.toLowerCase().includes(lower) : true,
	);

	return (
		<div className="space-y-4">
			{/* The intro card is the toolbar's header rather than a card of its own: as a separate
			    card it added ~120px of permanent chrome above a region that is already fighting for
			    vertical room, and the search would then have been a third stacked box.

			    Its single track is `minmax(0,28rem)`, not the `2fr` the multi-control toolbars
			    lead with. A lone `2fr` is a one-track grid: the fraction has nothing to divide
			    against, so it resolved to the whole row and the search field measured 1928px on a
			    2250px screen — a text input sixty times longer than anything typed into it. Every
			    other toolbar's search shares its row with selects that bound it; this is the only
			    one that has to state its own bound. */}
			<FilterToolbar
				columns="xl:grid-cols-[minmax(0,28rem)]"
				filtered={visibleRows.length}
				hasFilters={query.trim() !== ''}
				header={
					// The prose used to run the full ~1120px card width, which pushed the action onto
					// a second row at every width tested; capping the measure lets it right-align.
					<CardHeader
						action={
							<Button
								onClick={() => setEditorOpen((value) => !value)}
								variant="secondary">
								{editorOpen ? 'Cancel Edit' : 'Edit Global Mapping'}
							</Button>
						}
						className="mb-0"
						description={
							<span className="block max-w-2xl">
								Cells show the strictest effect any rule could produce for that
								bucket; an asterisk means the rule has additional facet constraints,
								so the effect only applies for matching profiles. Hover for source
								and rule id.
							</span>
						}
						title="Audit ✕ Bucket Applicability"
					/>
				}
				noun="audits"
				onReset={() => setQuery('')}
				total={mapping.data.matrix.length}>
				<FilterSearch onChange={setQuery} placeholder="Filter audits" value={query} />
			</FilterToolbar>

			{editorOpen && (
				<Card className="flex flex-col gap-3">
					<CardHeader
						action={
							<Button
								disabled={update.isPending}
								onClick={saveEditor}
								variant="primary">
								<Save className="h-4 w-4" />
								{update.isPending ? 'Saving…' : 'Save Mapping'}
							</Button>
						}
						className="mb-0"
						title="Global Mapping JSON"
					/>
					<textarea
						aria-label="Audit profile mapping JSON"
						className={`${textareaClass} min-h-[360px] font-mono text-xs`}
						onChange={(event) => setEditorText(event.target.value)}
						value={editorText}
					/>
					{editorError && <div className={`text-xs ${toneText.red}`}>{editorError}</div>}
				</Card>
			)}

			{/* Bounding the height is what makes `sticky` work: the scrollport is the scroll
			    container, so without a max height the header has nothing to stick inside and the
			    bucket labels are gone two scroll steps into a ~1800px matrix.
			    The cap moved off the Card and onto an `OverflowScroller`, which is what the two
			    sibling tabs do and what this one alone did not. Capping the Card cost the matrix
			    its tab stop — the Card reported `tabindex: null` while the catalog's scroller
			    reported `focusable [tabindex]` in the same snapshot — and left the fade with
			    nothing to attach to.

			    Moving the cap did not, on its own, close the 843px of empty page that scrolled
			    below the card. That was the scrollport's layout overflow reaching the document,
			    and it survived the move — measured again at 2250x1309 as `scrollHeight` 2184
			    against a card bottom of 1329. `OverflowScroller` clips its own root now, which is
			    where the fix belongs: every capped scroller leaked the same way, and this tab is
			    only where it was caught.

			    The subtrahend stays `24rem`, not the siblings' `16rem`: it is a statement about how
			    much chrome sits above the table on *this* tab, and moving the cap from the Card to
			    the scroller inside it does not change that. This tab's toolbar carries a header with
			    two lines of prose, and at `16rem` the card ran past the fold — the tab then scrolled
			    the page and the card both, which is the double scroll the cap exists to remove. */}
			<Card className="hidden p-0 xl:block">
				<OverflowScroller
					ariaLabel="Audit applicability matrix"
					scrollerClassName="max-h-[calc(100dvh-24rem)]">
					<table
						aria-label="Audit applicability matrix"
						className="w-full min-w-[820px] text-left text-sm">
						<thead className={`${tableHeadClass} sticky top-0 z-10`}>
							<tr>
								<th className="bg-muted px-3 py-3" scope="col">
									Audit
								</th>
								{bucketColumns.map((bucket) => (
									<th
										className="bg-muted px-3 py-3 text-center"
										key={bucket}
										scope="col">
										{bucketShortLabels[bucket]}
									</th>
								))}
							</tr>
							<tr>
								<th
									className="border-b border-border bg-muted px-3 py-1.5 font-normal normal-case"
									colSpan={bucketColumns.length + 1}
									scope="colgroup">
									<MatrixLegend />
								</th>
							</tr>
						</thead>
						<tbody>
							{visibleRows.map((row) => (
								<tr
									className="border-b border-border last:border-0"
									key={row.auditName}>
									{/* The same audit id the Catalog tab renders in mono. It is one string
								    identifying one file, and reading it in two faces on two tabs of the
								    same page is how a reader stops trusting that they are the same
								    thing. */}
									<td className="px-3 py-2 font-mono font-medium text-foreground">
										{row.auditName}
									</td>
									{bucketColumns.map((bucket) => (
										<td className="px-3 py-2 text-center" key={bucket}>
											<EffectCell cell={row.byBucket[bucket]} />
										</td>
									))}
								</tr>
							))}
							{visibleRows.length === 0 && (
								<tr>
									<td
										className="px-3 py-6 text-sm text-muted-foreground"
										colSpan={bucketColumns.length + 1}>
										No audits match that search.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</OverflowScroller>
			</Card>

			<div className="space-y-2 xl:hidden">
				<Card className="py-2">
					<MatrixLegend />
				</Card>
				{visibleRows.map((row) => (
					<div className="rounded-md border border-border p-3" key={row.auditName}>
						<div className="font-mono font-medium text-foreground">{row.auditName}</div>
						<dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
							{bucketColumns.map((bucket) => (
								<div className="space-y-1" key={bucket}>
									<dt className="font-medium text-muted-foreground uppercase">
										{bucketShortLabels[bucket]}
									</dt>
									<dd>
										<EffectCell cell={row.byBucket[bucket]} />
									</dd>
								</div>
							))}
						</dl>
					</div>
				))}
			</div>
		</div>
	);
}

/**
 * `default` is roughly 85% of the cells. Rendered as a filled badge it produced six near-identical
 * columns of pills and buried the handful of cells that carry a decision, so the baseline is a muted
 * dot and the badge is reserved for the effects that deviate from it.
 */
function EffectCell({ cell }: { cell: AuditApplicabilityCell }) {
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

function MatrixLegend() {
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
