import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';

import type { SettingsSourceControlStatus } from '../../api/types.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useSourceControlStatus } from '../../hooks/useSettings.ts';
import { toneText } from '../../lib/tones.ts';
import { isAuthenticated, sourceControlRowTone } from './sourceControlTone.ts';

function StatusRow({ item }: { item: SettingsSourceControlStatus }) {
	const tone = sourceControlRowTone(item);
	const authenticated = isAuthenticated(item.authStatus);
	const statusLine = item.authStatus ?? item.detail;
	// `detail` repeats the badge on healthy rows ('Available' under an `available` badge); it only
	// earns a line when it says something the badge does not.
	const detailLine =
		item.authStatus && item.detail.trim().toLowerCase() !== item.status ? item.detail : null;
	return (
		<div className="grid gap-3 px-4 py-3 @min-[45rem]:grid-cols-[minmax(0,1fr)_auto] @min-[45rem]:items-center">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium text-foreground">{item.label}</span>
					{item.version ? (
						<span className="font-mono text-xs text-muted-foreground">
							{item.version}
						</span>
					) : null}
				</div>
				<p
					className={`mt-1 text-sm ${tone === 'emerald' ? 'text-muted-foreground' : toneText[tone]}`}>
					{statusLine}
				</p>
				{detailLine ? (
					<p className="mt-1 text-xs text-muted-foreground">{detailLine}</p>
				) : null}
			</div>
			<div className="flex items-center gap-2 @min-[45rem]:justify-end">
				<Badge showDot tone={tone}>
					{authenticated ? item.status : 'not authenticated'}
				</Badge>
				<span className="max-w-[14rem] truncate font-mono text-xs text-muted-foreground">
					{item.command ?? 'environment'}
				</span>
			</div>
		</div>
	);
}

export function SourceControlStatusPanel() {
	const query = useSourceControlStatus();
	const items = query.data ?? [];
	return (
		// The description and Refresh live inside the Card. Rendered above it they pushed this
		// column's top edge 46px below the Telegram card it shares a row with.
		<Card className="overflow-hidden p-0">
			<div className="flex flex-col gap-2 border-b border-border px-4 py-3 @min-[32rem]:flex-row @min-[32rem]:items-start @min-[32rem]:justify-between">
				<CardHeader
					className="mb-0"
					description="Read-only source-control tool status. These rows do not change Git or provider behavior."
					title="Source Control"
				/>
				<Button
					className="shrink-0"
					disabled={query.isFetching}
					onClick={() => void query.refetch()}
					size="compact"
					variant="secondary">
					<RefreshCw aria-hidden="true" className="h-4 w-4" />
					{query.isFetching ? 'Refreshing…' : 'Refresh'}
				</Button>
			</div>
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
