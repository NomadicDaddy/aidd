import { useId } from 'react';

import type { ProjectImportCandidate } from '../../api/types/projects/operations.ts';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { FilePath } from '../../components/shared/FilePath.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Checkbox } from '../../components/ui/checkbox.tsx';
import { cn } from '../../lib/cn.ts';
import { toneText } from '../../lib/tones.ts';
import { CandidateIntakePreview } from './CandidateIntakePreview.tsx';

function signalLabels(signals: { aidd: boolean; git: boolean; packageJson: boolean }): string[] {
	const labels: string[] = [];
	if (signals.packageJson) labels.push('package.json');
	if (signals.git) labels.push('.git');
	if (signals.aidd) labels.push('.aidd');
	return labels;
}

/**
 * One scanned import candidate. It is a real `Card variant="sunken"` rather than the hand-rolled
 * `rounded border bg-card` row it replaced: inside the intake panel's own Card, a surface at the
 * same elevation read as a hole punched through it rather than as a nested item.
 */
export function IngestCandidateRow({
	candidate,
	disabled,
	onPreviewToggle,
	onToggle,
	previewOpen,
	selected,
}: {
	candidate: ProjectImportCandidate;
	disabled: boolean;
	onPreviewToggle: () => void;
	onToggle: (checked: boolean) => void;
	previewOpen: boolean;
	selected: boolean;
}) {
	const labels = signalLabels(candidate.signals);
	const previewId = `candidate-preview-${candidate.id}`;
	const checkboxId = useId();
	const pathId = `${checkboxId}-path`;
	return (
		<Card
			className={cn('p-0 transition-colors', selected && 'border-accent/50 bg-accent-muted')}
			variant="sunken">
			<div className="flex gap-2 p-2 text-sm">
				<Checkbox
					aria-describedby={pathId}
					aria-label={`Select ${candidate.name}`}
					checked={selected}
					className="mt-0.5"
					disabled={disabled}
					id={checkboxId}
					onChange={(event) => onToggle(event.target.checked)}
				/>
				<div className="min-w-0 flex-1 space-y-0.5">
					<div className="flex min-w-0 flex-wrap items-center gap-1.5">
						<label className="font-medium text-foreground" htmlFor={checkboxId}>
							{candidate.name}
						</label>
						{labels.length > 0 ? (
							labels.map((label) => (
								<Badge key={label} tone="neutral">
									{label}
								</Badge>
							))
						) : (
							<Badge casing="title" tone="neutral">
								directory
							</Badge>
						)}
						<span className="min-w-0 flex-1" />
						<Button
							aria-controls={previewId}
							aria-expanded={previewOpen}
							aria-label={`${previewOpen ? 'Hide' : 'Preview'} ${candidate.name} at ${candidate.path}`}
							onClick={onPreviewToggle}
							size="compact"
							variant="ghost">
							<DisclosureMarker open={previewOpen} />
							Preview
						</Button>
					</div>
					<span id={pathId}>
						<FilePath
							className="block text-xs break-all text-muted-foreground"
							path={candidate.path}
						/>
					</span>
					{candidate.reason ? (
						<p className={`text-xs ${toneText.amber}`}>{candidate.reason}</p>
					) : null}
					<div hidden={!previewOpen} id={previewId}>
						{previewOpen ? <CandidateIntakePreview path={candidate.path} /> : null}
					</div>
				</div>
			</div>
		</Card>
	);
}
