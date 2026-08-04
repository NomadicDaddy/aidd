import type { ProjectFeatureApproval, ProjectFeatureBlockingContext } from '../../../api/types.ts';

import { formatDate } from '../../../lib/formatters.ts';

// Presentational sections for the feature details dialog, split out to keep the dialog module under
// the file-size budget. Each renders nothing when it has no data so callers can drop them in
// unconditionally.

export function FeatureTextSection({ children, title }: { children: string; title: string }) {
	if (!children) return null;
	return (
		<section>
			<h3 className="text-xs font-semibold text-muted-foreground uppercase">{title}</h3>
			<p className="mt-2 rounded-md border border-border bg-muted p-3 text-sm leading-6 whitespace-pre-wrap text-foreground">
				{children}
			</p>
		</section>
	);
}

export function FeatureListSection({
	hint,
	items,
	title,
}: {
	hint?: string;
	items: string[];
	title: string;
}) {
	if (items.length === 0) return null;
	return (
		<section>
			<h3 className="text-xs font-semibold text-muted-foreground uppercase">{title}</h3>
			{hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
			<ul className="mt-2 space-y-1.5">
				{items.map((item) => (
					<li
						className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
						key={item}>
						{item}
					</li>
				))}
			</ul>
		</section>
	);
}

export function FeatureApprovalSection({
	approval,
}: {
	approval: ProjectFeatureApproval | undefined;
}) {
	if (!approval) return null;
	const rows: { key: string; value: string }[] = [
		{ key: 'approved', value: formatDate(approval.approvedAt) },
		{ key: 'source', value: approval.source || '—' },
		{ key: 'decision required', value: approval.decisionRequired ? 'yes' : 'no' },
		{ key: 'decision', value: approval.decision ?? '—' },
	];
	return (
		<section>
			<h3 className="text-xs font-semibold text-muted-foreground uppercase">Approval</h3>
			<dl className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border text-sm">
				{rows.map((row) => (
					<div
						className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 px-3 py-2"
						key={row.key}>
						<dt className="text-muted-foreground">{row.key}</dt>
						<dd className="break-words text-foreground">{row.value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

export function FeatureBlockingContextSection({
	blockingContext,
}: {
	blockingContext: ProjectFeatureBlockingContext | undefined;
}) {
	if (!blockingContext) return null;
	const rows: { key: string; value: string }[] = [
		{ key: 'reason', value: blockingContext.reason || '—' },
		{ key: 'outcome', value: blockingContext.outcomeStatus || '—' },
		{
			key: 'parked',
			value: blockingContext.parkedAt ? formatDate(blockingContext.parkedAt) : '—',
		},
	];
	return (
		<section>
			<h3 className="text-xs font-semibold text-amber-700 uppercase dark:text-amber-300">
				Blocking context
			</h3>
			<p className="mt-2 text-xs text-muted-foreground">
				Why this feature was parked — approve past it only once the gate below is
				understood.
			</p>
			<dl className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-amber-200 text-sm dark:border-amber-900/60">
				{rows.map((row) => (
					<div
						className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 px-3 py-2"
						key={row.key}>
						<dt className="text-muted-foreground">{row.key}</dt>
						<dd className="break-words text-foreground">{row.value}</dd>
					</div>
				))}
			</dl>
			{blockingContext.commands.length > 0 ? (
				<ul className="mt-2 space-y-1.5">
					{blockingContext.commands.map((command) => (
						<li
							className="rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs break-all text-foreground"
							key={command}>
							{command}
						</li>
					))}
				</ul>
			) : null}
			{blockingContext.outputExcerpt ? (
				<pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-muted p-3 text-xs break-words whitespace-pre-wrap text-foreground">
					{blockingContext.outputExcerpt}
				</pre>
			) : null}
		</section>
	);
}
