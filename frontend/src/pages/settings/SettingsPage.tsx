import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import type {
	BackendDefaultSettings,
	BackendName,
	TriumvirateSettings,
	WebConfigSettings,
} from '../../api/types.ts';
import type { SettingsTab } from './settingsNavigation.ts';

import { requestWebRestart } from '../../api/admin.ts';
import { commitBarClearanceClass } from '../../components/shared/CommitBar.tsx';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import {
	useApplicationRootsValidation,
	usePrefetchStatusPanels,
	useSettingsConfig,
	useUpdateSettingsConfig,
} from '../../hooks/useSettings.ts';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard.ts';
import { cn } from '../../lib/cn.ts';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { buildSettingsRestartUrl, settingsRestartTargetChanged } from './runtimeRedirect.ts';
import { SettingsCommitBar } from './SettingsCommitBar.tsx';
import { dirtySettingsTabs } from './settingsDirtyTabs.ts';
import { discardSettingsChangesAndProceed } from './settingsDiscardNavigation.ts';
import { SettingsErrorCard, SettingsLoadingCard } from './SettingsLoadStates.tsx';
import {
	readSettingsTab,
	settingsTabSearchParameter,
	settingsTabSearchParams,
} from './settingsNavigation.ts';
import { createSettingsRecordActions } from './settingsRecordActions.ts';
import { type RuntimeAction, waitForRestartTarget } from './settingsRuntime.ts';
import { getMaxConcurrentRunsError, settingsSaveBlockReason } from './settingsSaveValidation.ts';
import { SettingsSectionTabs } from './SettingsSectionTabs.tsx';
import { SettingsToolbar } from './SettingsToolbar.tsx';
import {
	createBlankSettings,
	emptyBackendDefault,
	emptyTriumvirate,
	normalizeIgnoredFolders,
} from './settingsUtils.ts';
import { useDirectorProfileForm } from './useDirectorProfileForm.ts';

const PAGE_RAIL = pageRailByContentType.workflow;

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
	const activeTab = readSettingsTab(searchParams.get(settingsTabSearchParameter));
	const applicationRootsError = useApplicationRootsValidation(form.applicationRoots, formSeeded);

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

	const maxConcurrentRunsError = getMaxConcurrentRunsError(form.maxConcurrentRuns);
	const invalidTelegramChatId = form.telegram.allowedChatIds.some(
		(chatId) => !Number.isSafeInteger(chatId),
	);
	const dirty = settings.data
		? JSON.stringify(normalizeIgnoredFolders(form)) !==
			JSON.stringify(normalizeIgnoredFolders(settings.data))
		: false;
	// The Director Profile is its own record, rendered inside a panel that unmounts when you leave.
	// Its edit gets the same locator dot and route-leave confirmation as the toolbar-owned settings.
	const savedDirtyTabs = dirtySettingsTabs(form, settings.data);
	const dirtyTabs: ReadonlySet<SettingsTab> = profile.dirty
		? new Set<SettingsTab>([...savedDirtyTabs, 'ai-director'])
		: savedDirtyTabs;
	const blocker = useUnsavedGuard(
		(dirty || profile.dirty) && !update.isPending && !profile.pending,
		[settingsTabSearchParameter],
	);

	const saveBlockReason = settingsSaveBlockReason(
		form,
		applicationRootsError,
		maxConcurrentRunsError,
		invalidTelegramChatId,
	);

	const recordActions = createSettingsRecordActions({
		onSaveBlocked: (reason) => toast.warning(reason),
		profileDirty: profile.dirty,
		profileDiscard: profile.discard,
		profileSave: profile.save,
		saveBlockReason,
		settingsDirty: dirty,
		settingsDiscard: discardChanges,
		settingsSave: submit,
	});

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
			operation: 'settings.listener-change-restart',
			source: 'SettingsPage',
			target: redirectUrl,
		});
		try {
			await requestWebRestart();
			toast.success('Settings saved; restarting at the configured address');
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

	if (settings.isLoading || (!settings.isError && !formSeeded)) return <SettingsLoadingCard />;

	if (settings.isError) {
		return <SettingsErrorCard error={settings.error} onRetry={() => void settings.refetch()} />;
	}

	return (
		// Field grids query this rail rather than a viewport changed by the persisted sidebar state.
		<PageRail
			className={cn('page-reveal @container space-y-5', commitBarClearanceClass)}
			rail={PAGE_RAIL}>
			<PageHeader
				description="Configure workspace discovery, run behavior, AI providers, integrations, and the control panel."
				// The config path is what this whole page edits; --font-mono is the token for
				// paths and ids everywhere else in the app. A custom description style opts out of
				// the reading measure: a path is one machine string, and capping it would truncate the
				// thing the page is about rather than shorten a line.
				helpSlug="settings"
				identifier={form.configPath}
				title="Settings"
			/>

			<SettingsToolbar
				activeTab={activeTab}
				dirty={dirty}
				dirtyTabs={dirtyTabs}
				onChange={changeTab}
				onDiscard={discardChanges}
				onSave={submit}
				profileDirty={profile.dirty}
				saveBlockReason={saveBlockReason}
				savePending={update.isPending}
			/>

			<SettingsSectionTabs
				activeTab={activeTab}
				dirty={dirty}
				form={form}
				maxConcurrentRunsError={maxConcurrentRunsError}
				profile={profile}
				runtimePending={runtimePending}
				savedBackends={settings.data?.backends}
				setBackendDefault={setBackendDefault}
				setField={setField}
				setRuntimePending={setRuntimePending}
				setTriumvirateField={setTriumvirateField}
			/>

			<SettingsCommitBar
				dirty={dirty}
				dirtyTabs={savedDirtyTabs}
				onDiscard={recordActions.discard}
				onSave={recordActions.save}
				profileDirty={profile.dirty}
				saveBlockReason={dirty ? saveBlockReason : null}
				savePending={update.isPending || profile.pending}
			/>

			<ConfirmDialog
				confirmLabel="Discard changes"
				description="You have unsaved settings changes. Leaving this page will discard them."
				destructive
				onClose={() => blocker.reset?.()}
				onConfirm={() => discardSettingsChangesAndProceed(discardChanges, blocker.proceed)}
				open={blocker.state === 'blocked'}
				title="Discard unsaved changes?"
			/>
		</PageRail>
	);
}
