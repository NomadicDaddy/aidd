import { normalizeBackendName } from 'aidd-shared/plan/types';

import type {
	BackendDefaultSettings,
	BackendName,
	TriumvirateSettings,
	WebConfigSettings,
} from '../../api/types.ts';
import type { SettingsTab } from './settingsNavigation.ts';
import type { RuntimeAction } from './settingsRuntime.ts';
import type { DirectorProfileForm } from './useDirectorProfileForm.ts';

import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldRow, FormGrid } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { TabPanel } from '../../components/ui/tabs.tsx';
import { compactFieldMeasureClass } from '../../lib/typography.ts';
import { DirectorProfileSection } from '../director/DirectorProfileSection.tsx';
import { BackendDefaultsTable } from './BackendDefaultsTable.tsx';
import { DirectAiSection } from './DirectAiSection.tsx';
import { DirectorAutoCycleSection } from './DirectorAutoCycleSection.tsx';
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
import { SpernakitScaffoldingSection } from './SpernakitScaffoldingSection.tsx';
import { SystemMetricsSection } from './SystemMetricsSection.tsx';
import { TelegramChannelSection } from './TelegramChannelSection.tsx';
import { TriumvirateSection } from './TriumvirateSection.tsx';

export function SettingsSectionTabs({
	activeTab,
	dirty,
	form,
	maxConcurrentRunsError,
	profile,
	runtimePending,
	savedBackends,
	setBackendDefault,
	setField,
	setRuntimePending,
	setTriumvirateField,
}: {
	activeTab: SettingsTab;
	dirty: boolean;
	form: WebConfigSettings;
	maxConcurrentRunsError: null | string;
	profile: DirectorProfileForm;
	runtimePending: null | RuntimeAction;
	savedBackends: undefined | WebConfigSettings['backends'];
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
					<Card className="grid gap-4 @min-[61rem]:grid-cols-2">
						<CardHeader
							className="mb-0 @min-[61rem]:col-span-2"
							description="Configure where project discovery starts and which folders it skips."
							level="section"
							title="Workspace Roots"
						/>
						<FieldRow
							className={`${compactFieldMeasureClass} @min-[61rem]:col-span-2`}
							hint="Resolves bare project names and provides the fallback discovery root."
							label="Fallback discovery root">
							<Input
								className="font-mono"
								onChange={(event) =>
									setField('applicationsRoot', nullableText(event.target.value))
								}
								placeholder="/path/to/applications"
								value={textValue(form.applicationsRoot)}
							/>
						</FieldRow>
						{/* Three sibling groups in this card, one label register. The two list groups used
						    to be titled by a subsection CardHeader while their own ListEditor label was
						    `labelHidden`, so a 14px semibold heading sat beside the 12px uppercase
						    fieldLabelClass of the field above them and the card read as two kinds of
						    thing. The editor already renders that shared register itself. */}
						<div className="@min-[61rem]:col-span-2">
							<ListEditor
								hint="Every root listed here is scanned for projects."
								inputClassName={`${compactFieldMeasureClass} font-mono`}
								items={form.applicationRoots}
								label="Application Roots"
								minimumItems={1}
								onChange={(items) => setField('applicationRoots', items)}
								placeholder="Enter root path"
							/>
						</div>
						<div className="@min-[61rem]:col-span-2">
							<ListEditor
								compactGrid
								hint="Matched against folder names or glob patterns during project discovery."
								inputClassName={`${compactFieldMeasureClass} font-mono`}
								items={form.ignoredFolders}
								label="Ignored Folders"
								onChange={(items) => setField('ignoredFolders', items)}
								placeholder="Folder name or pattern"
								validateBlank
							/>
						</div>
					</Card>
					<div className="space-y-4">
						<SpernakitScaffoldingSection form={form} setField={setField} />
						<SharedMetadataSection form={form} setField={setField} />
					</div>
				</div>
			</TabPanel>

			<TabPanel activeTab={activeTab} id="run-engine" idPrefix="settings">
				<div className="space-y-4">
					<RunLimitsSection
						form={form}
						maxConcurrentRunsError={maxConcurrentRunsError}
						setField={setField}
					/>
					<BackendDefaultsTable
						backends={form.backends}
						defaultCli={normalizeBackendName(form.cli)}
						savedBackends={savedBackends}
						setBackendDefault={setBackendDefault}
						sharedIdleNudgeTimeoutSeconds={form.idleNudgeTimeoutSeconds}
						sharedIdleTimeoutSeconds={form.idleTimeoutSeconds}
						sharedModel={form.model}
					/>
				</div>
			</TabPanel>

			<TabPanel activeTab={activeTab} id="ai-director" idPrefix="settings">
				<div className="space-y-4">
					<DirectorProfileSection
						dirty={profile.dirty}
						form={profile.form}
						onChange={profile.setForm}
						onSave={profile.save}
						pending={profile.pending}
					/>
					<GeneralDefaultsSection form={form} setField={setField} />
					<ProviderConfigSection form={form} setField={setField} />
					<DirectAiSection
						defaultProvider={form.defaultProvider}
						directAi={form.directAi}
						directorChatAllowFileEdits={form.directorChatAllowFileEdits}
						providerNames={Object.keys(form.providers)}
						providers={form.providers}
						setField={setField}
					/>
					<DirectorAutoCycleSection form={form} setField={setField} />
					<TriumvirateSection
						setTriumvirateField={setTriumvirateField}
						triumvirate={form.triumvirate}
					/>
				</div>
			</TabPanel>

			<TabPanel activeTab={activeTab} id="integrations" idPrefix="settings">
				<FormGrid className="gap-4 @min-[61rem]:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)]">
					<TelegramChannelSection form={form} setField={setField} />
					<SourceControlStatusPanel />
				</FormGrid>
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
