interface SettingsRecordActions {
	profileAction: () => void;
	profileDirty: boolean;
	settingsAction: () => void;
	settingsDirty: boolean;
}

interface SettingsRecordActionOptions {
	onSaveBlocked: (reason: string) => void;
	profileDirty: boolean;
	profileDiscard: () => void;
	profileSave: () => void;
	saveBlockReason: null | string;
	settingsDirty: boolean;
	settingsDiscard: () => void;
	settingsSave: () => void;
}

/** Apply one commit-strip action to each independently persisted Settings record that is dirty. */
export function applySettingsRecordAction({
	profileAction,
	profileDirty,
	settingsAction,
	settingsDirty,
}: SettingsRecordActions): void {
	if (settingsDirty) settingsAction();
	if (profileDirty) profileAction();
}

/** Bind the phone commit strip to both Settings persistence boundaries. */
export function createSettingsRecordActions({
	onSaveBlocked,
	profileDirty,
	profileDiscard,
	profileSave,
	saveBlockReason,
	settingsDirty,
	settingsDiscard,
	settingsSave,
}: SettingsRecordActionOptions): { discard: () => void; save: () => void } {
	return {
		discard: () =>
			applySettingsRecordAction({
				profileAction: profileDiscard,
				profileDirty,
				settingsAction: settingsDiscard,
				settingsDirty,
			}),
		save: () => {
			if (settingsDirty && saveBlockReason !== null) {
				onSaveBlocked(saveBlockReason);
				return;
			}
			applySettingsRecordAction({
				profileAction: profileSave,
				profileDirty,
				settingsAction: settingsSave,
				settingsDirty,
			});
		},
	};
}
