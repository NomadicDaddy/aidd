import type { SpecKind } from './projectNewPanelUtils.ts';

import { Input } from '../../components/ui/input.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { fieldLabelClass, textareaClass } from '../../lib/formStyles.ts';

// The optional project spec source (none / pasted text / file path), shared by the create lane.
export function ProjectSpecField({
	setSpecKind,
	setSpecPath,
	setSpecText,
	specKind,
	specPath,
	specText,
}: {
	setSpecKind: (kind: SpecKind) => void;
	setSpecPath: (value: string) => void;
	setSpecText: (value: string) => void;
	specKind: SpecKind;
	specPath: string;
	specText: string;
}) {
	return (
		<div className="space-y-2">
			<span className={fieldLabelClass}>Spec</span>
			<SegmentedControl<SpecKind>
				ariaLabel="Project spec source"
				onChange={setSpecKind}
				options={[
					{ label: 'None', value: 'none' },
					{ label: 'Paste text', value: 'text' },
					{ label: 'File path', value: 'path' },
				]}
				size="default"
				value={specKind}
			/>
			{specKind === 'text' ? (
				<textarea
					className={`${textareaClass} min-h-36`}
					onChange={(event) => setSpecText(event.target.value)}
					placeholder="Describe what this project should be…"
					value={specText}
				/>
			) : null}
			{specKind === 'path' ? (
				<Input
					onChange={(event) => setSpecPath(event.target.value)}
					placeholder="/path/to/spec.md"
					value={specPath}
				/>
			) : null}
			<p className="text-xs text-muted-foreground">
				Add a spec, then use the advisor to confirm fresh, Spernakit, or ingest.
			</p>
		</div>
	);
}
