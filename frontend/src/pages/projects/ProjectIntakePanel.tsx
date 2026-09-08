import { default as X } from 'lucide-react/dist/esm/icons/x';

import type { IntakeLane } from './projectIntakeTypes.ts';

import { IconButton } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { TabList, TabPanel } from '../../components/ui/tabs.tsx';
import { useSettingsConfig } from '../../hooks/useSettings.ts';
import { toneBorder, toneSurface } from '../../lib/tones.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import { ProjectCreateLane } from './ProjectCreateLane.tsx';
import { ProjectIngestLane } from './ProjectIngestLane.tsx';

export type { IntakeLane } from './projectIntakeTypes.ts';

const LANE_COPY: Record<IntakeLane, { description: string }> = {
	fresh: {
		description:
			'Scaffold a minimal project under a configured root and launch the initial aidd run.',
	},
	github: {
		description:
			'Clone a GitHub template repository with fresh history, then run metadata-only intake.',
	},
	ingest: {
		description:
			'Bring an existing directory under aidd management without scaffolding over it.',
	},
	template: {
		description:
			'Scaffold from a registered template — Spernakit or a third-party scaffold — then run the golden path or metadata-only intake.',
	},
};

// Unified Project Intake surface. Lanes: Create Fresh / From Template / From GitHub / Ingest
// Existing, sharing one panel. The template lane is data-driven from web.templates, which
// resolveProjectTemplates always fills with at least the synthesized spernakit entry, so the
// length guard below is a safety net rather than a lane that disappears in practice. Controlled
// by the page so the header buttons and the lane tabs stay in sync.
export function ProjectIntakePanel({
	lane,
	onClose,
	onLaneChange,
}: {
	lane: IntakeLane;
	onClose: () => void;
	onLaneChange: (lane: IntakeLane) => void;
}) {
	const settings = useSettingsConfig();
	const templates = settings.data?.templates ?? [];

	const tabs = [
		{ id: 'fresh' as const, label: 'Create Fresh' },
		...(templates.length > 0 ? [{ id: 'template' as const, label: 'From Template' }] : []),
		// GitHub-URL creation needs no registered templates, so it is always offered.
		{ id: 'github' as const, label: 'From GitHub' },
		{ id: 'ingest' as const, label: 'Ingest Existing' },
	];

	return (
		<Card className={`flex flex-col gap-4 ${toneBorder.teal} ${toneSurface.teal}`}>
			<CardHeader
				action={
					<IconButton ariaLabel="Close project intake" onClick={onClose} variant="ghost">
						<X className="h-4 w-4" />
					</IconButton>
				}
				className="mb-0"
				description="Choose how this project enters the fleet and provide its initial metadata."
				title="Project Intake"
			/>

			{/* Four lanes wrapped to two rows measuring 96px at 390x844, above a panel whose own
			    description already says what the selected lane does. `compact` collapses them to
			    the labelled select the rest of the app's tab strips collapse to, and the lane copy
			    below carries the explanation the wrapped triggers never did. */}
			<TabList<IntakeLane>
				activeTab={lane}
				ariaLabel="Project intake lane"
				density="compact"
				idPrefix="project-intake"
				onChange={onLaneChange}
				selectionStyle="subtle"
				tabs={tabs}
			/>

			<TabPanel activeTab={lane} id={lane} idPrefix="project-intake">
				<p className={`mb-4 text-sm text-muted-foreground ${proseMeasureClass}`}>
					{LANE_COPY[lane].description}
				</p>
				{lane === 'ingest' ? (
					<ProjectIngestLane />
				) : (
					<ProjectCreateLane
						lane={lane}
						onClose={onClose}
						onSwitchToIngest={() => onLaneChange('ingest')}
						templates={templates}
					/>
				)}
			</TabPanel>
		</Card>
	);
}
