import type { WebConfigSettings } from '../../api/types.ts';

import { settingsBaseUrlSaveBlockReason } from './settingsBaseUrlValidation.ts';

export function getMaxConcurrentRunsError(maxConcurrentRuns: number): null | string {
	return Number.isInteger(maxConcurrentRuns) && maxConcurrentRuns >= 1
		? null
		: 'Enter at least one max concurrent run before saving.';
}

export function settingsSaveBlockReason(
	form: WebConfigSettings,
	applicationRootsError: null | string,
	maxConcurrentRunsError: null | string,
	invalidTelegramChatId: boolean,
): null | string {
	if (applicationRootsError) return `Workspace: ${applicationRootsError}`;
	const baseUrlError = settingsBaseUrlSaveBlockReason(form);
	if (baseUrlError) return `Workspace: ${baseUrlError}`;
	if (form.ignoredFolders.some((value) => value.trim() === '')) {
		return 'Workspace: Remove the blank ignored-folder row before saving.';
	}
	if (!Number.isInteger(form.port) || form.port < 1 || form.port > 65535) {
		return 'Control Panel: Enter a port between 1 and 65535 before saving.';
	}
	if (maxConcurrentRunsError) return `Run Engine: ${maxConcurrentRunsError}`;
	if (invalidTelegramChatId) {
		return 'Integrations: Enter a whole-number Telegram chat ID or remove the invalid entry.';
	}
	return null;
}
