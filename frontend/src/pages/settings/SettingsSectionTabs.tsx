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
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { TabPanel } from '../../components/ui/tabs.tsx';
import { proseMeasureClass } from '../../lib/typography.ts';
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
import { SystemMetricsSection } from './SystemMetricsSection.tsx';

const APPLICATIONS_ROOT_HINT_ID = 'settings-applications-root-hint';
import { TelegramChannelSection } from './TelegramChannelSection.tsx';
import { TriumvirateSection } from './TriumvirateSection.tsx';

export function SettingsSectionTabs({
	activeTab,
	dirty,
	form,
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
					{/* Titled. Untitled, the strongest label on this card was the same 12px uppercase
					    field label its own control carries, so a tab that opens with two h2-titled
					    cards continued into two that read as one undifferentiated form. The field
					    label goes visually hidden rather than repeating the title one line under
					    it — the input keeps its name.

					    The hint stays a sibling paragraph rather than moving into the header's
					    description slot: `CardHeader` renders the description without an id, so a
					    hint that moved there would lose the `aria-describedby` association and go
					    back to being a sentence that only sighted readers get. */}
					<Card className="space-y-1">
						<CardHeader level="section" title="Applications Root" />
						<FieldRow className="max-w-xl" label="Applications Root" labelHidden>
							<Input
								aria-describedby={APPLICATIONS_ROOT_HINT_ID}
								onChange={(event) =>
									setField('applicationsRoot', nullableText(event.target.value))
								}
								placeholder="/path/to/applications"
								value={textValue(form.applicationsRoot)}
							/>
						</FieldRow>
						<p
							className={`text-xs text-muted-foreground ${proseMeasureClass}`}
							id={APPLICATIONS_ROOT_HINT_ID}>
							Resolves bare project names and provides the fallback discovery root.
						</p>
					</Card>
					<Card className="grid gap-4 @min-[61rem]:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1.3fr)]">
						<CardHeader
							className="@min-[61rem]:col-span-2"
							level="section"
							title="Workspace Roots"
						/>
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
						savedBackends={savedBackends}
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
					<DirectorProfileSection
						dirty={profile.dirty}
						form={profile.form}
						onChange={profile.setForm}
						onSave={profile.save}
						pending={profile.pending}
					/>
					<DirectorAutoCycleSection form={form} setField={setField} />
					<TriumvirateSection
						setTriumvirateField={setTriumvirateField}
						triumvirate={form.triumvirate}
					/>
				</div>
			</TabPanel>

			<TabPanel activeTab={activeTab} id="integrations" idPrefix="settings">
				<div className="grid gap-4 @min-[61rem]:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
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
