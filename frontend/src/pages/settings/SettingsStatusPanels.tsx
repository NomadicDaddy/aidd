import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';

import type { SettingsSourceControlStatus } from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useSourceControlStatus } from '../../hooks/useSettings.ts';
import { SettingsToolStatusBadge } from './SettingsToolStatusBadge.tsx';

function StatusRows({ items, title }: { items: SettingsSourceControlStatus[]; title: string }) {
	return (
		<Card className="overflow-hidden p-0">
			<div className="border-b px-4 py-3 dark:border-neutral-800">
				<h2 className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
					{title}
				</h2>
			</div>
			<div className="divide-y dark:divide-neutral-800">
				{items.map((item) => (
					<div
						className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
						key={item.id}>
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium text-neutral-950 dark:text-neutral-50">
									{item.label}
								</span>
								{item.version ? (
									<span className="text-xs text-neutral-500">{item.version}</span>
								) : null}
							</div>
							<p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
								{item.authStatus ?? item.detail}
							</p>
							{item.authStatus ? (
								<p className="mt-1 text-xs text-neutral-500">{item.detail}</p>
							) : null}
						</div>
						<div className="flex items-center gap-2 md:justify-end">
							<SettingsToolStatusBadge status={item.status} />
							<span className="max-w-[14rem] truncate text-xs text-neutral-500">
								{item.command ?? 'environment'}
							</span>
						</div>
					</div>
				))}
			</div>
		</Card>
	);
}

export function SourceControlStatusPanel() {
	const query = useSourceControlStatus();
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				<p className="text-sm text-neutral-600 dark:text-neutral-400">
					Read-only source-control tool status. These rows do not change Git or provider
					behavior.
				</p>
				<Button
					disabled={query.isFetching}
					onClick={() => void query.refetch()}
					size="compact"
					variant="secondary">
					<RefreshCw aria-hidden="true" className="h-4 w-4" />
					{query.isFetching ? 'Refreshing…' : 'Refresh'}
				</Button>
			</div>
			{query.isLoading ? (
				<Card className="py-8 text-center text-sm text-neutral-500">
					Checking source-control status…
				</Card>
			) : query.isError ? (
				<Card className="border-red-200 bg-red-50 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
					Could not load source-control status.
				</Card>
			) : (
				<StatusRows items={query.data ?? []} title="Source Control" />
			)}
		</div>
	);
}
