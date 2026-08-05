import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useMemo } from 'react';

import { IconButton } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { useSettingsConfig } from '../../hooks/useSettings.ts';
import { ProjectCreateLane } from './ProjectCreateLane.tsx';
import { ProjectIngestLane } from './ProjectIngestLane.tsx';

export type IntakeLane = 'fresh' | 'github' | 'ingest' | 'template';

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

// Unified Project Intake surface. Lanes: Create Fresh / From Template / Ingest Existing, sharing one
// panel. The template lane is data-driven from web.templates (the synthesized spernakit entry plus any
// third-party scaffolds) and only appears when at least one template is registered. Controlled by the
// page so the header buttons and the lane tabs stay in sync.
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
	const templates = useMemo(() => settings.data?.templates ?? [], [settings.data?.templates]);

	const options = useMemo(
		() => [
			{ label: 'Create Fresh', value: 'fresh' as const },
			...(templates.length > 0
				? [{ label: 'From Template', value: 'template' as const }]
				: []),
			// GitHub-URL creation needs no registered templates, so it is always offered.
			{ label: 'From GitHub', value: 'github' as const },
			{ label: 'Ingest Existing', value: 'ingest' as const },
		],
		[templates.length],
	);

	return (
		<Card className="space-y-4 border-teal-200 bg-teal-50/70 dark:border-teal-900/60 dark:bg-teal-950/20">
			<CardHeader
				action={
					<IconButton ariaLabel="Close project intake" onClick={onClose} variant="ghost">
						<X className="h-4 w-4" />
					</IconButton>
				}
				className="mb-0"
				description={LANE_COPY[lane].description}
				title="Project Intake"
			/>

			<SegmentedControl<IntakeLane>
				ariaLabel="Project intake lane"
				onChange={onLaneChange}
				options={options}
				size="default"
				value={lane}
			/>

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
		</Card>
	);
}
