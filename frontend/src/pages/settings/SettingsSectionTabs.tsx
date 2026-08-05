import { normalizeBackendName } from 'aidd-shared/plan/types';

import type {
	BackendDefaultSettings,
	BackendName,
	TriumvirateSettings,
	WebConfigSettings,
} from '../../api/types.ts';
import type { SettingsTab } from './settingsNavigation.ts';
import type { RuntimeAction } from './settingsRuntime.ts';

import { Card } from '../../components/ui/card.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { TabPanel } from '../../components/ui/tabs.tsx';
import { BackendDefaultsTable } from './BackendDefaultsTable.tsx';
import { DirectAiSection } from './DirectAiSection.tsx';
import { DirectorAutoCycleSection } from './DirectorAutoCycleSection.tsx';
import { DirectorProfileSettingsSection } from './DirectorProfileSettingsSection.tsx';
import { GeneralDefaultsSection } from './GeneralDefaultsSection.tsx';
import { ListEditor } from './ListEditor.tsx';
import { NetworkAccessSection } from './NetworkAccessSection.tsx';
import { ObservabilitySection } from './ObservabilitySection.tsx';
import { ProviderConfigSection } from './ProviderConfigSection.tsx';
import { RunLimitsSection } from './RunLimitsSection.tsx';
import { SettingsRuntimeControls } from './SettingsRuntimeControls.tsx';
import { SourceControlStatusPanel } from './SettingsStatusPanels.tsx';
import { nullableText, textValue } from './settingsUtils.ts';
import { SharedMetadataSection } from './SharedMetadataSection.tsx';
import { SystemMetricsSection } from './SystemMetricsSection.tsx';
import { TelegramChannelSection } from './TelegramChannelSection.tsx';
import { TriumvirateSection } from './TriumvirateSection.tsx';

export function SettingsSectionTabs({
	activeTab,
	dirty,
	form,
	runtimePending,
	setBackendDefault,
	setField,
	setRuntimePending,
	setTriumvirateField,
}: {
	activeTab: SettingsTab;
	dirty: boolean;
	form: WebConfigSettings;
	runtimePending: null | RuntimeAction;
	setBackendDefault: (
		backend: BackendName,
		key: keyof BackendDefaultSettings,
		value: null | number | string,
	) => void;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
	setRuntimePending: (action: null | RuntimeAction) => void;
	setTriumvirateField: <K extends keyof TriumvirateSettings>(
		key: K,
		value: TriumvirateSettings[K],
	) => void;
}) {
	return (
		<>
			<TabPanel activeTab={activeTab} id="workspace" idPrefix="settings">
				<div className="space-y-4">
					<Card className="p-3">
						<FieldRow label="Applications Root">
							<span className="text-xs text-muted-foreground">
								Resolves bare project names and provides the fallback discovery
								root.
							</span>
							<Input
								onChange={(event) =>
									setField('applicationsRoot', nullableText(event.target.value))
								}
								placeholder="/path/to/applications"
								value={textValue(form.applicationsRoot)}
							/>
						</FieldRow>
					</Card>
					<Card className="grid gap-4 p-3 xl:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1.3fr)]">
						<ListEditor
							items={form.applicationRoots}
							label="Application Roots"
							onChange={(items) => setField('applicationRoots', items)}
							placeholder="Enter root path"
						/>
						<ListEditor
							compactGrid
							items={form.ignoredFolders}
							label="Ignored Folders"
							onChange={(items) => setField('ignoredFolders', items)}
							placeholder="Folder name or pattern"
							validateBlank
						/>
					</Card>
					<SharedMetadataSection form={form} setField={setField} />
				</div>
			</TabPanel>

			<TabPanel activeTab={activeTab} id="run-engine" idPrefix="settings">
				<div className="space-y-4">
					<RunLimitsSection form={form} setField={setField} />
					<BackendDefaultsTable
						backends={form.backends}
						defaultCli={normalizeBackendName(form.cli)}
						setBackendDefault={setBackendDefault}
						sharedModel={form.model}
					/>
				</div>
			</TabPanel>

			<TabPanel activeTab={activeTab} id="ai-director" idPrefix="settings">
				<div className="space-y-4">
					<GeneralDefaultsSection form={form} setField={setField} />
					<ProviderConfigSection form={form} setField={setField} />
					<DirectAiSection
						directAi={form.directAi}
						directorChatAllowFileEdits={form.directorChatAllowFileEdits}
						setField={setField}
					/>
					<DirectorProfileSettingsSection />
					<DirectorAutoCycleSection form={form} setField={setField} />
					<TriumvirateSection
						setTriumvirateField={setTriumvirateField}
						triumvirate={form.triumvirate}
					/>
				</div>
			</TabPanel>

			<TabPanel activeTab={activeTab} id="integrations" idPrefix="settings">
				<div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
					<TelegramChannelSection form={form} setField={setField} />
					<SourceControlStatusPanel />
				</div>
			</TabPanel>

			<TabPanel activeTab={activeTab} id="control-panel" idPrefix="settings">
				<div className="space-y-4">
					<SettingsRuntimeControls
						dirty={dirty}
						runtimePending={runtimePending}
						setRuntimePending={setRuntimePending}
					/>
					<NetworkAccessSection form={form} setField={setField} />
					<ObservabilitySection form={form} setField={setField} />
					<SystemMetricsSection />
				</div>
			</TabPanel>
		</>
	);
}
