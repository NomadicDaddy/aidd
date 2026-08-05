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
import { fieldLabelClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { BackendDefaultFields } from './BackendDefaultFields.tsx';
import { SettingsToolStatusBadge } from './SettingsToolStatusBadge.tsx';
import { emptyBackendDefault } from './settingsUtils.ts';

const backendDefaultOptions: BackendName[] = [
	'native',
	'ollama',
	'lmstudio',
	'openai',
	'claude-code',
	'opencode',
	'kilocode',
	'codex',
	'cline',
	'grok',
];

const ansiSgrPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function BackendIdentity({
	backend,
	loading,
	status,
}: {
	backend: BackendName;
	loading: boolean;
	status: SettingsCliStatus | undefined;
}) {
	const statusText = (status?.version ?? status?.detail ?? 'Not detected')
		.replace(ansiSgrPattern, '')
		.replace(/\s+/g, ' ')
		.trim();

	return (
		<div className="min-w-0 space-y-1">
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-medium text-foreground">{backend}</span>
				{status ? <SettingsToolStatusBadge status={status.status} /> : null}
			</div>
			<p className="truncate text-xs text-muted-foreground">
				{loading ? 'Checking status…' : statusText || 'Not detected'}
			</p>
		</div>
	);
}

export function BackendDefaultsTable({
	backends,
	defaultCli,
	setBackendDefault,
	sharedModel,
}: {
	backends: WebConfigSettings['backends'];
	/** The normalized default CLI, used to flag the row whose model shadows the shared default. */
	defaultCli?: BackendName | null | undefined;
	setBackendDefault: (
		backend: BackendName,
		key: keyof BackendDefaultSettings,
		value: null | number | string,
	) => void;
	/** The shared Default Model (AI & Director tab), for the shadowing hint. */
	sharedModel?: null | string;
}) {
	const statusQuery = useCliStatus();
	const statuses = new Map(statusQuery.data?.map((status) => [status.backend, status]) ?? []);
	// The shadowing that bites override-free launches: the default CLI's row model wins over the
	// shared Default Model. Only that row gets the amber note — other rows' models are ordinary
	// per-backend defaults.
	const shadowNote = (backend: BackendName, model: null | string): null | string =>
		backend === defaultCli && model && sharedModel && model !== sharedModel
			? sharedModel
			: null;

	return (
		<section aria-labelledby="backend-matrix-heading" className="space-y-3">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<CardHeader
						className="mb-0"
						description="Installation status is read-only; model, reasoning, and timeout defaults apply to new runs."
						id="backend-matrix-heading"
						title="Backend Matrix"
					/>
					{statusQuery.isError ? (
						<p className={`mt-1 text-xs ${toneText.red}`}>
							Could not refresh CLI status.
						</p>
					) : null}
				</div>
				<Button
					disabled={statusQuery.isFetching}
					onClick={() => void statusQuery.refetch()}
					size="compact"
					variant="secondary">
					<RefreshCw aria-hidden="true" className="h-4 w-4" />
					{statusQuery.isFetching ? 'Refreshing…' : 'Refresh Status'}
				</Button>
			</div>

			<Card className="hidden p-0 xl:block">
				<OverflowScroller ariaLabel="Backend status and defaults">
					<table
						aria-label="Backend status and defaults"
						className="w-full min-w-[860px] text-left text-sm">
						<thead className="border-b border-border bg-muted">
							{/* Explicit widths give Model the slack that a w-56 name-and-badge column
						    was wasting: 'kilo/stepfun/step-3.7-flash:f' was cut mid-string. */}
							<tr>
								<th className={`w-44 px-3 py-2 ${fieldLabelClass}`} scope="col">
									Backend & Status
								</th>
								<th className={`w-[28%] px-3 py-2 ${fieldLabelClass}`} scope="col">
									Model
								</th>
								<th className={`w-[16%] px-3 py-2 ${fieldLabelClass}`} scope="col">
									Reasoning
								</th>
								<th className={`w-[16%] px-3 py-2 ${fieldLabelClass}`} scope="col">
									Idle Timeout
								</th>
								<th className={`w-[16%] px-3 py-2 ${fieldLabelClass}`} scope="col">
									Idle Nudge Timeout
								</th>
							</tr>
						</thead>
						<tbody>
							{backendDefaultOptions.map((backend) => {
								const defaults = backends[backend] ?? emptyBackendDefault();
								return (
									<tr
										className="border-b border-border last:border-0"
										key={backend}>
										<td className="px-3 py-2 align-top">
											<BackendIdentity
												backend={backend}
												loading={statusQuery.isLoading}
												status={statuses.get(backend)}
											/>
										</td>
										<BackendDefaultFields
											backend={backend}
											defaults={defaults}
											layout="cells"
											setBackendDefault={setBackendDefault}
											shadowedSharedModel={shadowNote(
												backend,
												defaults.model,
											)}
										/>
									</tr>
								);
							})}
						</tbody>
					</table>
				</OverflowScroller>
			</Card>

			<div className="space-y-2 xl:hidden">
				{backendDefaultOptions.map((backend) => {
					const defaults = backends[backend] ?? emptyBackendDefault();
					return (
						<Card className="space-y-3" key={backend}>
							<BackendIdentity
								backend={backend}
								loading={statusQuery.isLoading}
								status={statuses.get(backend)}
							/>
							<div className="grid gap-2">
								<BackendDefaultFields
									backend={backend}
									defaults={defaults}
									setBackendDefault={setBackendDefault}
									shadowedSharedModel={shadowNote(backend, defaults.model)}
									showLabels
								/>
							</div>
						</Card>
					);
				})}
			</div>
		</section>
	);
}
