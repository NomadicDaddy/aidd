import { default as GitBranch } from 'lucide-react/dist/esm/icons/git-branch';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';

import type { SettingsSourceControlStatus } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useSourceControlStatus } from '../../hooks/useSettings.ts';
import { toneText } from '../../lib/tones.ts';
import {
	isAuthenticated,
	sourceControlInstalledLabel,
	sourceControlRowTone,
} from './sourceControlTone.ts';

function StatusRow({ item }: { item: SettingsSourceControlStatus }) {
	const tone = sourceControlRowTone(item);
	const authenticated = isAuthenticated(item.authStatus);
	const statusLine = item.authStatus ? (authenticated ? 'Signed in' : 'Signed out') : null;
	// `detail` repeats the badge on healthy rows ('Available' under an `available` badge); it only
	// earns a line when it says something neither the install badge nor the auth label says.
	const normalizedDetail = item.detail.trim().toLowerCase();
	const detailLine =
		normalizedDetail.length > 0 &&
		normalizedDetail !== item.status &&
		normalizedDetail !== item.authStatus?.trim().toLowerCase()
			? item.detail
			: null;
	return (
		// The fixed status and command tracks make the scan path stable across all four rows. The
		// status is the primary comparison, while the incidental command keeps its own right edge.
		//
		// Below the step the three tracks collapse, and `text-right` outlived the track it was
		// aligning against: an ~85px mono string sat at the far right of a 324px row over 230px of
		// nothing, on a tab where every other line starts at the left rail. So the alignment is
		// part of the same container query the tracks are. Below it the badge and the command share
		// one line rather than taking two — both are single short strings, and pairing them names
		// the command as that row's probe instead of stranding it as an unlabelled fragment.
		<div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 @min-[45rem]:grid-cols-[minmax(0,1fr)_max-content_max-content] @min-[45rem]:gap-3">
			<div className="col-span-2 min-w-0 @min-[45rem]:col-span-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm font-semibold text-foreground">{item.label}</span>
					{item.version ? (
						<span className="font-mono text-xs text-muted-foreground">
							{item.version}
						</span>
					) : null}
				</div>
				{statusLine ? (
					<p
						className={`mt-1 text-sm ${tone === 'emerald' ? 'text-muted-foreground' : toneText[tone]}`}>
						{statusLine}
					</p>
				) : null}
				{detailLine ? (
					<p className="mt-1 text-xs text-muted-foreground">{detailLine}</p>
				) : null}
			</div>
			<div className="@min-[45rem]:justify-self-start">
				<Badge showDot tone={tone}>
					{item.status === 'available' && item.authStatus
						? 'Installed'
						: sourceControlInstalledLabel(item.status)}
				</Badge>
			</div>
			<span className="truncate font-mono text-xs text-muted-foreground @min-[45rem]:text-right">
				{item.command ?? 'environment'}
			</span>
		</div>
	);
}

export function SourceControlStatusPanel() {
	const query = useSourceControlStatus();
	const items = query.data ?? [];
	const refreshAction = (
		<Button
			className="shrink-0"
			disabled={query.isFetching}
			onClick={() => void query.refetch()}
			size="compact"
			variant="secondary">
			<RefreshCw aria-hidden="true" className="h-4 w-4" />
			{query.isFetching ? 'Refreshing…' : 'Refresh'}
		</Button>
	);
	return (
		// The description and Refresh live inside the Card. Rendered above it they pushed this
		// column's top edge 46px below the Telegram card it shares a row with.
		<Card className="overflow-hidden p-0" variant="sunken">
			{/* Which kind of integration card this is, in the slot that classifies identity.
			    The two cards on this tab do different things — one reports, one edits — and
			    nothing but a sentence of description said so. */}
			<CardHeader
				action={refreshAction}
				actionLayout="stacked"
				badge={<Badge tone="neutral">Read-only</Badge>}
				className="mb-0 border-b border-border px-4 py-4"
				description="Read-only source-control tool status. These rows do not change Git or provider behavior."
				icon={<GitBranch className="h-4 w-4" />}
				title="Source Control"
			/>
			{query.isLoading ? (
				<p className="px-4 py-8 text-center text-sm text-muted-foreground">
					Checking source-control status…
				</p>
			) : query.isError ? (
				<p className={`px-4 py-8 text-center text-sm ${toneText.red}`}>
					Could not load source-control status.
				</p>
			) : (
				<div className="divide-y divide-border">
					{items.map((item) => (
						<StatusRow item={item} key={item.id} />
					))}
				</div>
			)}
		</Card>
	);
}
