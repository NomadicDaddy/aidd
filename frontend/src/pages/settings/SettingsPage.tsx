import { FRONTEND_ROUTE_PATHS } from 'aidd-shared/contracts/frontend-routes';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import type {
	BackendDefaultSettings,
	BackendName,
	TriumvirateSettings,
	WebConfigSettings,
} from '../../api/types.ts';
import type { SettingsTab } from './settingsNavigation.ts';

import { requestWebRestart } from '../../api/admin.ts';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Button, buttonClassName } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import {
	usePrefetchStatusPanels,
	useSettingsConfig,
	useUpdateSettingsConfig,
} from '../../hooks/useSettings.ts';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';
import { buildSettingsRestartUrl, settingsRestartTargetChanged } from './runtimeRedirect.ts';
import { dirtySettingsTabs } from './settingsDirtyTabs.ts';
import { readSettingsTab, settingsTabSearchParams } from './settingsNavigation.ts';
import { type RuntimeAction, waitForRestartTarget } from './settingsRuntime.ts';
import { SettingsSectionTabs } from './SettingsSectionTabs.tsx';
import { SettingsToolbar } from './SettingsToolbar.tsx';
import {
	createBlankSettings,
	emptyBackendDefault,
	emptyTriumvirate,
	normalizeIgnoredFolders,
} from './settingsUtils.ts';
import { useDirectorProfileForm } from './useDirectorProfileForm.ts';

export function SettingsPage() {
	useDocumentTitle('Settings');
	usePrefetchStatusPanels();
	const [searchParams, setSearchParams] = useSearchParams();
	const settings = useSettingsConfig();
	const update = useUpdateSettingsConfig();
	const [form, setForm] = useState<WebConfigSettings>(() => createBlankSettings());
	const [formSeeded, setFormSeeded] = useState(false);
	const [runtimePending, setRuntimePending] = useState<null | RuntimeAction>(null);
	const profile = useDirectorProfileForm();
	const formSeededRef = useRef(false);
	const activeTab = readSettingsTab(searchParams.get('tab'));

	useEffect(() => {
		if (!settings.data) return;
		if (formSeededRef.current) return;
		formSeededRef.current = true;
		setForm(normalizeIgnoredFolders(settings.data));
		setFormSeeded(true);
	}, [settings.data]);

	function discardChanges() {
		if (!settings.data) return;
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'settings.discard',
			source: 'SettingsPage',
		});
		setForm(normalizeIgnoredFolders(settings.data));
	}

	function setField<K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) {
		setForm((current) => ({ ...current, [key]: value }));
	}

	function setBackendDefault(
		backend: BackendName,
		key: keyof BackendDefaultSettings,
		value: null | number | string,
	) {
		setForm((current) => ({
			...current,
			backends: {
				...current.backends,
				[backend]: {
					...(current.backends[backend] ?? emptyBackendDefault()),
					[key]: value,
				},
			},
		}));
	}

	function setTriumvirateField<K extends keyof TriumvirateSettings>(
		key: K,
		value: TriumvirateSettings[K],
	) {
		setForm((current) => ({
			...current,
			triumvirate: {
				...(current.triumvirate ?? emptyTriumvirate()),
				[key]: value,
			},
		}));
	}

	function changeTab(tab: SettingsTab): void {
		setSearchParams(settingsTabSearchParams(searchParams, tab), { replace: true });
	}

	const hasBlankIgnoredFolder = form.ignoredFolders.some((value) => value.trim() === '');
	const invalidPort = !Number.isInteger(form.port) || form.port < 1 || form.port > 65535;
	const invalidMaxConcurrentRuns =
		!Number.isInteger(form.maxConcurrentRuns) || form.maxConcurrentRuns < 1;
	const invalidAutoCycleInterval =
		!Number.isFinite(form.directorAutoCycleIntervalHours) ||
		form.directorAutoCycleIntervalHours < 1;
	const dirty = settings.data
		? JSON.stringify(normalizeIgnoredFolders(form)) !==
			JSON.stringify(normalizeIgnoredFolders(settings.data))
		: false;
	// The Director Profile is its own record with its own Save, but it is rendered inside the
	// AI & Director panel and that panel unmounts the moment you leave it. Its edit gets the same
	// locator dot and the same leaving-the-page confirmation as everything the toolbar saves;
	// nothing else on this surface tells you where an unsaved change is hiding.
	const savedDirtyTabs = dirtySettingsTabs(form, settings.data);
	const dirtyTabs: ReadonlySet<SettingsTab> = profile.dirty
		? new Set<SettingsTab>([...savedDirtyTabs, 'ai-director'])
		: savedDirtyTabs;
	const blocker = useUnsavedGuard(
		(dirty || profile.dirty) && !update.isPending && !profile.pending,
	);

	let saveBlockReason: null | string = null;
	if (hasBlankIgnoredFolder) {
		saveBlockReason = 'Remove the blank ignored-folder row before saving.';
	} else if (invalidPort) {
		saveBlockReason = 'Enter a port between 1 and 65535 before saving.';
	} else if (invalidMaxConcurrentRuns) {
		saveBlockReason = 'Enter at least one max concurrent run before saving.';
	} else if (invalidAutoCycleInterval) {
		saveBlockReason = 'Enter a positive director auto-cycle interval before saving.';
	}

	function submit() {
		if (saveBlockReason) {
			toast.warning(saveBlockReason);
			return;
		}
		const payload = normalizeIgnoredFolders(form);
		const redirectUrl =
			settings.data && settingsRestartTargetChanged(settings.data, payload)
				? buildSettingsRestartUrl(window.location.href, payload)
				: null;
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'settings.save',
			source: 'SettingsPage',
			summary: {
				allowRemote: payload.allowRemote,
				applicationRoots: payload.applicationRoots.length,
				ignoredFolders: payload.ignoredFolders.length,
			},
			target: '/api/v1/settings/config',
		});
		update.mutate(payload, {
			onError(error) {
				toast.error(error instanceof Error ? error.message : 'Could not save settings');
			},
			onSuccess(config) {
				setForm(normalizeIgnoredFolders(config));
				if (redirectUrl) {
					void requestRestartRedirect(redirectUrl);
				} else {
					toast.success('Settings saved');
				}
			},
		});
	}

	async function requestRestartRedirect(redirectUrl: string) {
		setRuntimePending('restart');
		traceDataMovement({
			category: 'event',
			layer: 'ui',
			operation: 'settings.port-change-restart',
			source: 'SettingsPage',
			target: redirectUrl,
		});
		try {
			await requestWebRestart();
			toast.success('Settings saved; restarting on the new port');
			await waitForRestartTarget(redirectUrl);
			window.location.assign(redirectUrl);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Settings saved, but the restart request failed',
			);
			setRuntimePending(null);
		}
	}

	if (settings.isLoading || (!settings.isError && !formSeeded)) {
		return (
			<Card className="py-10 text-center text-sm text-muted-foreground">
				Loading settings…
			</Card>
		);
	}

	if (settings.isError) {
		return (
			<Card className={`text-sm ${toneBorder.red} ${toneSurface.red} ${toneText.red}`}>
				<div className="flex items-center justify-between gap-3">
					<span>
						{settings.error instanceof Error
							? settings.error.message
							: 'Could not load settings.'}
					</span>
					<Button onClick={() => void settings.refetch()} variant="secondary">
						<RefreshCw className="h-4 w-4" />
						Retry
					</Button>
				</div>
			</Card>
		);
	}

	return (
		// `@container` on the page root: every field grid below gates on the width of this column
		// rather than the window. The two differ by the sidebar rail — 224px expanded, 64px
		// collapsed, persisted per user — so a viewport tier gave two users at the same window
		// size two different layouts and could not be told which one it was deciding.
		//
		// The tiers below map to the app's declared container steps: what was `sm:` is 32rem, what
		// was `lg:` is 45rem, what was `xl:` is 61rem. Each is the column width at which that
		// viewport tier used to fire with the rail expanded, so the layout a user sees at a given
		// window size is unchanged in the common case and correct in the two cases it was not.
		<div className="page-reveal @container space-y-5">
			<PageHeader
				actions={
					<Link
						className={buttonClassName('secondary')}
						to={FRONTEND_ROUTE_PATHS.settingsExecutionIdentityBadges}>
						Badge lab
					</Link>
				}
				description={form.configPath}
				// The config path is what this whole page edits; --font-mono is the token for
				// paths and ids everywhere else in the app. `max-w-none` opts out of the header's
				// reading measure: a path is one machine string, and capping it would truncate the
				// thing the page is about rather than shorten a line.
				descriptionClassName="max-w-none truncate font-mono text-xs"
				helpSlug="settings"
				title="Settings"
			/>

			<SettingsToolbar
				activeTab={activeTab}
				dirty={dirty}
				dirtyTabs={dirtyTabs}
				onChange={changeTab}
				onDiscard={discardChanges}
				onSave={submit}
				saveBlockReason={saveBlockReason}
				savePending={update.isPending}
			/>

			<SettingsSectionTabs
				activeTab={activeTab}
				dirty={dirty}
				form={form}
				profile={profile}
				runtimePending={runtimePending}
				savedBackends={settings.data?.backends}
				setBackendDefault={setBackendDefault}
				setField={setField}
				setRuntimePending={setRuntimePending}
				setTriumvirateField={setTriumvirateField}
			/>

			<ConfirmDialog
				confirmLabel="Discard changes"
				description="You have unsaved settings changes. Leaving this page will discard them."
				destructive
				onClose={() => blocker.reset?.()}
				onConfirm={() => blocker.proceed?.()}
				open={blocker.state === 'blocked'}
				title="Discard unsaved changes?"
			/>
		</div>
	);
}
