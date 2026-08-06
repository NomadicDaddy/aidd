import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';

import type { ProjectImportCandidate } from '../../api/types/projects/operations.ts';

import { FilePath } from '../../components/shared/FilePath.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Checkbox } from '../../components/ui/checkbox.tsx';
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
	return (
		<Card className="p-0" variant="sunken">
			<label className="flex gap-3 p-3 text-sm">
				<Checkbox
					checked={selected}
					className="mt-1"
					disabled={disabled}
					onChange={(event) => onToggle(event.target.checked)}
				/>
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-foreground">{candidate.name}</span>
						<Badge tone="neutral">
							{labels.length > 0 ? labels.join(', ') : 'directory'}
						</Badge>
					</div>
					<FilePath
						className="block text-xs break-all text-muted-foreground"
						path={candidate.path}
					/>
					<p className="text-xs break-all text-muted-foreground">
						Root: {candidate.root}
					</p>
					{candidate.reason ? (
						<p className={`text-xs ${toneText.amber}`}>{candidate.reason}</p>
					) : null}
					<Button
						aria-controls={previewId}
						aria-expanded={previewOpen}
						onClick={(event) => {
							event.preventDefault();
							onPreviewToggle();
						}}
						size="compact"
						variant="ghost">
						<ChevronRight
							aria-hidden="true"
							className={`h-3 w-3 transition-transform ${previewOpen ? 'rotate-90' : ''}`}
						/>
						Preview
					</Button>
					<div hidden={!previewOpen} id={previewId}>
						{previewOpen ? <CandidateIntakePreview path={candidate.path} /> : null}
					</div>
				</div>
			</label>
		</Card>
	);
}
