/* eslint-disable react-hooks/set-state-in-effect */
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { AuditApplicabilityCell, AuditProfileMapping } from '../../../api/types.ts';

import { ErrorState } from '../../../components/shared/ErrorState.tsx';
import { LoadingState } from '../../../components/shared/LoadingState.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useAuditProfileMapping, useUpdateAuditProfileMapping } from '../../../hooks/useAudits.ts';
import { textareaClass } from '../../../lib/formStyles.ts';
import { tableHeadClass } from '../../../lib/tableStyles.ts';
import { toneSolid, toneText } from '../../../lib/tones.ts';
import { bucketColumns, bucketShortLabels, describeCell, effectTone } from '../auditsUtils.ts';

export function ApplicabilityTab() {
	const mapping = useAuditProfileMapping();
	const update = useUpdateAuditProfileMapping();
	const [editorOpen, setEditorOpen] = useState(false);
	const [editorText, setEditorText] = useState('');
	const [editorError, setEditorError] = useState<null | string>(null);

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

	return (
		<div className="space-y-4">
			<Card>
				{/* The prose used to run the full ~1120px card width, which pushed the action onto a
				    second row at every width tested; capping the measure lets it right-align. */}
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
							Cells show the strictest effect any rule could produce for that bucket;
							an asterisk means the rule has additional facet constraints, so the
							effect only applies for matching profiles. Hover for source and rule id.
						</span>
					}
					title="Audit ✕ Bucket Applicability"
				/>
			</Card>

			{editorOpen && (
				<Card className="space-y-3">
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

			{/* Bounding the card's height is what makes `sticky` work: the Card is the scroll
			    container, so without a max height the header has nothing to stick inside and the
			    bucket labels are gone two scroll steps into a ~1800px matrix. */}
			<Card className="hidden max-h-[calc(100dvh-16rem)] overflow-auto p-0 xl:block">
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
						{mapping.data.matrix.map((row) => (
							<tr
								className="border-b border-border last:border-0"
								key={row.auditName}>
								<td className="px-3 py-2 font-medium text-foreground">
									{row.auditName}
								</td>
								{bucketColumns.map((bucket) => (
									<td className="px-3 py-2 text-center" key={bucket}>
										<EffectCell cell={row.byBucket[bucket]} />
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</Card>

			<div className="space-y-2 xl:hidden">
				<Card className="py-2">
					<MatrixLegend />
				</Card>
				{mapping.data.matrix.map((row) => (
					<div className="rounded-md border border-border p-3" key={row.auditName}>
						<div className="font-medium text-foreground">{row.auditName}</div>
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
				<span
					aria-hidden="true"
					className={`inline-block h-1.5 w-1.5 rounded-full ${toneSolid.neutral}`}
				/>
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
				<span
					aria-hidden="true"
					className={`inline-block h-1.5 w-1.5 rounded-full ${toneSolid.neutral}`}
				/>
				default
			</span>
			<Badge tone={effectTone.required}>required</Badge>
			<Badge tone={effectTone.disabled}>disabled</Badge>
			<Badge tone={effectTone.excluded}>excluded</Badge>
			<span>* also constrained by non-bucket facets</span>
		</span>
	);
}
