import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';

import type {
	BackendDefaultSettings,
	BackendName,
	SettingsCliStatus,
	WebConfigSettings,
} from '../../api/types.ts';

import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useCliStatus } from '../../hooks/useSettings.ts';
import { SettingsToolStatusBadge } from './SettingsToolStatusBadge.tsx';
import {
	emptyBackendDefault,
	nullableNumber,
	nullableText,
	numberValue,
	textValue,
} from './settingsUtils.ts';

const backendDefaultOptions: BackendName[] = [
	'native',
	'ollama',
	'lmstudio',
	'openai',
	'claude-code',
	'opencode',
	'kilocode',
	'codex',
	'grok',
];

const modelPlaceholders: Record<BackendName, string> = {
	'claude-code': 'e.g., claude-opus-4-8',
	codex: 'e.g., gpt-5.6',
	grok: 'e.g., grok-4.5',
	kilocode: 'e.g., claude-opus-4-8',
	lmstudio: 'e.g., openai/gpt-oss-20b',
	native: 'e.g., claude-opus-4-8',
	ollama: 'e.g., llama3.1',
	openai: 'e.g., gpt-5.6',
	opencode: 'e.g., gpt-5.6',
};

const idleTimeoutPlaceholder = 'e.g., 300';
const idleNudgeTimeoutPlaceholder = 'e.g., 120';
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
				<span className="font-medium text-neutral-950 dark:text-neutral-50">{backend}</span>
				{status ? <SettingsToolStatusBadge status={status.status} /> : null}
			</div>
			<p className="truncate text-xs text-neutral-500">
				{loading ? 'Checking status…' : statusText || 'Not detected'}
			</p>
		</div>
	);
}

function BackendFields({
	backend,
	defaults,
	setBackendDefault,
	shadowedSharedModel,
	showLabels = false,
}: {
	backend: BackendName;
	defaults: BackendDefaultSettings;
	setBackendDefault: (
		backend: BackendName,
		key: keyof BackendDefaultSettings,
		value: null | number | string
	) => void;
	/** The shared Default Model this row's model shadows for default-CLI launches, when set. */
	shadowedSharedModel?: null | string;
	showLabels?: boolean;
}) {
	return (
		<>
			<label className="min-w-0">
				<span className={showLabels ? 'mb-1 block text-xs text-neutral-500' : 'sr-only'}>
					Model
				</span>
				<Input
					aria-label={`${backend} model`}
					onChange={(event) =>
						setBackendDefault(backend, 'model', nullableText(event.target.value))
					}
					placeholder={modelPlaceholders[backend]}
					value={textValue(defaults.model)}
				/>
				{shadowedSharedModel ? (
					<p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
						Outranks the shared Default Model (“{shadowedSharedModel}”) for {backend}{' '}
						launches — clear this to use the shared default.
					</p>
				) : null}
			</label>
			<label className="min-w-0">
				<span className={showLabels ? 'mb-1 block text-xs text-neutral-500' : 'sr-only'}>
					Idle timeout
				</span>
				<Input
					aria-label={`${backend} idle timeout`}
					inputMode="numeric"
					onChange={(event) =>
						setBackendDefault(
							backend,
							'idleTimeoutSeconds',
							nullableNumber(event.target.value)
						)
					}
					placeholder={idleTimeoutPlaceholder}
					value={numberValue(defaults.idleTimeoutSeconds)}
				/>
			</label>
			<label className="min-w-0">
				<span className={showLabels ? 'mb-1 block text-xs text-neutral-500' : 'sr-only'}>
					Idle nudge timeout
				</span>
				<Input
					aria-label={`${backend} idle nudge timeout`}
					inputMode="numeric"
					onChange={(event) =>
						setBackendDefault(
							backend,
							'idleNudgeTimeoutSeconds',
							nullableNumber(event.target.value)
						)
					}
					placeholder={idleNudgeTimeoutPlaceholder}
					value={numberValue(defaults.idleNudgeTimeoutSeconds)}
				/>
			</label>
		</>
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
		value: null | number | string
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
					<h2
						className="text-sm font-semibold text-neutral-950 dark:text-neutral-50"
						id="backend-matrix-heading">
						Backend Matrix
					</h2>
					<p className="mt-0.5 text-xs text-neutral-500">
						Installation status is read-only; model and timeout defaults apply to new
						runs.
					</p>
					{statusQuery.isError ? (
						<p className="mt-1 text-xs text-red-600 dark:text-red-400">
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

			<Card className="hidden overflow-x-auto p-0 md:block">
				<table
					aria-label="Backend status and defaults"
					className="w-full min-w-[860px] text-left text-sm">
					<thead className="border-b bg-neutral-50 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
						<tr>
							<th className="px-3 py-2 font-medium" scope="col">
								Backend & Status
							</th>
							<th className="px-3 py-2 font-medium" scope="col">
								Model
							</th>
							<th className="px-3 py-2 font-medium" scope="col">
								Idle Timeout
							</th>
							<th className="px-3 py-2 font-medium" scope="col">
								Idle Nudge Timeout
							</th>
						</tr>
					</thead>
					<tbody>
						{backendDefaultOptions.map((backend) => {
							const defaults = backends[backend] ?? emptyBackendDefault();
							return (
								<tr
									className="border-b last:border-0 dark:border-neutral-800"
									key={backend}>
									<td className="w-56 px-3 py-2">
										<BackendIdentity
											backend={backend}
											loading={statusQuery.isLoading}
											status={statuses.get(backend)}
										/>
									</td>
									<td className="px-3 py-2" colSpan={3}>
										<div className="grid grid-cols-3 gap-3">
											<BackendFields
												backend={backend}
												defaults={defaults}
												setBackendDefault={setBackendDefault}
												shadowedSharedModel={shadowNote(
													backend,
													defaults.model
												)}
											/>
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</Card>

			<div className="space-y-2 md:hidden">
				{backendDefaultOptions.map((backend) => {
					const defaults = backends[backend] ?? emptyBackendDefault();
					return (
						<Card className="space-y-3 p-3" key={backend}>
							<BackendIdentity
								backend={backend}
								loading={statusQuery.isLoading}
								status={statuses.get(backend)}
							/>
							<div className="grid gap-2">
								<BackendFields
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
