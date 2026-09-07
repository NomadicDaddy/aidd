import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';

import type {
	BackendDefaultSettings,
	BackendName,
	SettingsCliStatus,
	WebConfigSettings,
} from '../../api/types.ts';

import { OverflowScroller } from '../../components/shared/OverflowScroller.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useCliStatus } from '../../hooks/useSettings.ts';
import { backendLabel, backendOptions } from '../../lib/backends.ts';
import { tableHeadClass } from '../../lib/tableStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { BackendDefaultFields } from './BackendDefaultFields.tsx';
import { BackendDefaultsDisclosureRow } from './BackendDefaultsDisclosureRow.tsx';
import { backendProbeLine } from './backendProbeLine.ts';
import { SettingsToolStatusBadge } from './SettingsToolStatusBadge.tsx';
import { emptyBackendDefault } from './settingsUtils.ts';

function BackendIdentity({
	backend,
	loading,
	status,
}: {
	backend: BackendName;
	loading: boolean;
	status: SettingsCliStatus | undefined;
}) {
	const probe = backendProbeLine(status);

	return (
		<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1">
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<span className="font-medium text-foreground">{backendLabel(backend)}</span>
				<code className="text-xs text-muted-foreground">{backend}</code>
			</div>
			{status ? <SettingsToolStatusBadge status={status.status} /> : null}
			<p
				className={`col-span-2 font-mono text-xs break-words @min-[61rem]:truncate ${probe.toneClass}`}
				title={probe.text}>
				{loading ? 'Checking status…' : probe.text}
			</p>
		</div>
	);
}

interface BackendDefaultsTableProps {
	backends: WebConfigSettings['backends'];
	defaultCli?: BackendName | null | undefined;
	savedBackends: undefined | WebConfigSettings['backends'];
	setBackendDefault: (
		backend: BackendName,
		key: keyof BackendDefaultSettings,
		value: null | number | string,
	) => void;
	sharedIdleNudgeTimeoutSeconds: null | number;
	sharedIdleTimeoutSeconds: null | number;
	sharedModel?: null | string;
}

export function BackendDefaultsTable({
	backends,
	defaultCli,
	savedBackends,
	setBackendDefault,
	sharedIdleNudgeTimeoutSeconds,
	sharedIdleTimeoutSeconds,
	sharedModel,
}: BackendDefaultsTableProps) {
	const statusQuery = useCliStatus();
	const statuses = new Map(statusQuery.data?.map((status) => [status.backend, status]) ?? []);
	const shadowNote = (backend: BackendName, model: null | string): null | string =>
		backend === defaultCli && model && sharedModel && model !== sharedModel
			? sharedModel
			: null;

	const fields = (
		backend: BackendName,
		layout: 'cells' | 'stacked' = 'stacked',
		showLabels = false,
	) => {
		const defaults = backends[backend] ?? emptyBackendDefault();
		return (
			<BackendDefaultFields
				backend={backend}
				defaults={defaults}
				layout={layout}
				setBackendDefault={setBackendDefault}
				shadowedSharedModel={shadowNote(backend, defaults.model)}
				sharedIdleNudgeTimeoutSeconds={sharedIdleNudgeTimeoutSeconds}
				sharedIdleTimeoutSeconds={sharedIdleTimeoutSeconds}
				showLabels={showLabels}
			/>
		);
	};

	return (
		<Card aria-labelledby="cli-matrix-heading" className="overflow-hidden p-0" role="region">
			<div className="border-b border-border p-4">
				<CardHeader
					action={
						<Button
							disabled={statusQuery.isFetching}
							onClick={() => void statusQuery.refetch()}
							size="compact"
							variant="secondary">
							<RefreshCw aria-hidden="true" className="h-4 w-4" />
							{statusQuery.isFetching ? 'Refreshing…' : 'Refresh Status'}
						</Button>
					}
					className="mb-0"
					description="Installation status is read-only; defaults apply to new runs."
					id="cli-matrix-heading"
					title="CLI Matrix"
				/>
				{statusQuery.isError ? (
					<p className={`mt-2 text-xs ${toneText.red}`}>Could not refresh CLI status.</p>
				) : null}
			</div>

			<div className="hidden @min-[61rem]:block">
				<OverflowScroller ariaLabel="CLI status and defaults">
					<table
						aria-label="CLI status and defaults"
						className="w-full min-w-[860px] table-fixed text-left text-sm">
						<colgroup>
							<col className="w-64" />
							<col />
							<col className="w-44" />
							<col className="w-48" />
							<col className="w-48" />
						</colgroup>
						<thead className={tableHeadClass}>
							<tr>
								<th className="px-3 py-3" scope="col">
									CLI &amp; Status
								</th>
								<th className="px-3 py-3" scope="col">
									Model
								</th>
								<th className="px-3 py-3" scope="col">
									Reasoning
								</th>
								<th className="px-3 py-3" scope="col">
									Idle Timeout (seconds)
								</th>
								<th className="px-3 py-3" scope="col">
									Idle Nudge Timeout (seconds)
								</th>
							</tr>
						</thead>
						<tbody>
							{backendOptions.map(({ value: backend }) => (
								<tr className="border-b border-border last:border-0" key={backend}>
									<td className="px-3 py-2 align-top">
										<BackendIdentity
											backend={backend}
											loading={statusQuery.isLoading}
											status={statuses.get(backend)}
										/>
									</td>
									{fields(backend, 'cells')}
								</tr>
							))}
						</tbody>
					</table>
				</OverflowScroller>
			</div>

			<div className="hidden gap-2 p-4 @min-[32rem]:grid @min-[32rem]:grid-cols-2 @min-[61rem]:hidden">
				{backendOptions.map(({ value: backend }) => (
					<Card className="flex flex-col gap-3" key={backend}>
						<BackendIdentity
							backend={backend}
							loading={statusQuery.isLoading}
							status={statuses.get(backend)}
						/>
						<div className="grid gap-2 @min-[32rem]:grid-cols-2">
							{fields(backend, 'stacked', true)}
						</div>
					</Card>
				))}
			</div>

			<div className="space-y-2 p-3 @min-[32rem]:hidden">
				{backendOptions.map(({ value: backend }) => {
					const defaults = backends[backend] ?? emptyBackendDefault();
					return (
						<BackendDefaultsDisclosureRow
							backend={backend}
							defaults={defaults}
							identity={
								<BackendIdentity
									backend={backend}
									loading={statusQuery.isLoading}
									status={statuses.get(backend)}
								/>
							}
							key={backend}
							savedDefaults={savedBackends?.[backend] ?? emptyBackendDefault()}
							setBackendDefault={setBackendDefault}
							shadowedSharedModel={shadowNote(backend, defaults.model)}
							sharedIdleNudgeTimeoutSeconds={sharedIdleNudgeTimeoutSeconds}
							sharedIdleTimeoutSeconds={sharedIdleTimeoutSeconds}
							sharedModel={sharedModel}
						/>
					);
				})}
			</div>
		</Card>
	);
}
