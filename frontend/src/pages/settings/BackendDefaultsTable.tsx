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
import { tableHeadClass } from '../../lib/tableStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { BackendDefaultFields } from './BackendDefaultFields.tsx';
import { BackendDefaultsDisclosureRow } from './BackendDefaultsDisclosureRow.tsx';
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

const clean = (value: string): string =>
	value.replace(ansiSgrPattern, '').replace(/\s+/gu, ' ').trim();

/**
 * The line under a backend's name, and the tone that says what kind of line it is.
 *
 * All three kinds used to render in the same muted 12px: `1.3.14`, `Warning: could not connect to a
 * running Ollama instance` and `error: could not create process` were typographically identical, so
 * the one row that needed acting on looked exactly like the nine that did not. The status the probe
 * already reports is what decides the tone — there is no second classification of the text here.
 *
 * A version is only a version if it contains a digit. lmstudio answers `--version` with a
 * box-drawing banner, and stripped of its ANSI that is a row of underscores — printed raw it read
 * as a rendering fault rather than as a probe that returned nothing useful. Falling through to the
 * detail line says something true instead.
 */
function probeLine(status: SettingsCliStatus | undefined): { text: string; toneClass: string } {
	const muted = 'text-muted-foreground';
	if (!status) return { text: 'Not detected', toneClass: muted };
	const version = clean(status.version ?? '');
	if (/\d/u.test(version)) return { text: version, toneClass: muted };
	const detail = clean(status.detail);
	if (!detail) return { text: 'Not detected', toneClass: muted };
	if (status.status === 'unavailable') return { text: detail, toneClass: toneText.red };
	if (status.status === 'missing') return { text: detail, toneClass: toneText.amber };
	return { text: detail, toneClass: muted };
}

function BackendIdentity({
	backend,
	loading,
	status,
}: {
	backend: BackendName;
	loading: boolean;
	status: SettingsCliStatus | undefined;
}) {
	const probe = probeLine(status);

	return (
		<div className="min-w-0 space-y-1">
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-medium text-foreground">{backend}</span>
				{status ? <SettingsToolStatusBadge status={status.status} /> : null}
			</div>
			{/* A failure message is the one line here long enough to be truncated, so it carries the
			    whole of itself on the title. */}
			<p className={`truncate text-xs ${probe.toneClass}`} title={probe.text}>
				{loading ? 'Checking status…' : probe.text}
			</p>
		</div>
	);
}

export function BackendDefaultsTable({
	backends,
	defaultCli,
	savedBackends,
	setBackendDefault,
	sharedModel,
}: {
	backends: WebConfigSettings['backends'];
	/** The normalized default CLI, used to flag the row whose model shadows the shared default. */
	defaultCli?: BackendName | null | undefined;
	savedBackends: undefined | WebConfigSettings['backends'];
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
			<div className="flex flex-col gap-2 @min-[32rem]:flex-row @min-[32rem]:items-end @min-[32rem]:justify-between">
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

			<Card className="hidden p-0 @min-[61rem]:block">
				<OverflowScroller ariaLabel="Backend status and defaults">
					<table
						aria-label="Backend status and defaults"
						className="w-full min-w-[860px] text-left text-sm">
						<thead className={tableHeadClass}>
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

			<div className="hidden gap-2 @min-[32rem]:grid @min-[32rem]:grid-cols-2 @min-[61rem]:hidden">
				{backendDefaultOptions.map((backend) => {
					const defaults = backends[backend] ?? emptyBackendDefault();
					return (
						<Card className="space-y-3" key={backend}>
							<BackendIdentity
								backend={backend}
								loading={statusQuery.isLoading}
								status={statuses.get(backend)}
							/>
							{/* Two-up. Stacked one control per row, the run-engine tab grew to 4,573px
							    of scroll height at 1024x768 against 1,625px at 2250x1309 — roughly six
							    screens to reach the Observability card at the bottom. The column at
							    1024 is 736px, which fits two of these comfortably. */}
							<div className="grid gap-2 @min-[32rem]:grid-cols-2">
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

			<div className="space-y-2 @min-[32rem]:hidden">
				{backendDefaultOptions.map((backend) => {
					const defaults = backends[backend] ?? emptyBackendDefault();
					const savedDefaults = savedBackends?.[backend] ?? emptyBackendDefault();
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
							savedDefaults={savedDefaults}
							setBackendDefault={setBackendDefault}
							shadowedSharedModel={shadowNote(backend, defaults.model)}
							sharedModel={sharedModel}
						/>
					);
				})}
			</div>
		</section>
	);
}
