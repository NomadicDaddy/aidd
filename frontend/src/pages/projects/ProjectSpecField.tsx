import type { IntakeLane } from './projectIntakeTypes.ts';
import type { SpecKind } from './projectNewPanelUtils.ts';

import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { textareaClass } from '../../lib/formStyles.ts';

// The optional project spec source (none / pasted text / file path), shared by the create lane.
export function ProjectSpecField({
	lane,
	setSpecKind,
	setSpecPath,
	setSpecText,
	specKind,
	specPath,
	specText,
}: {
	lane: Exclude<IntakeLane, 'ingest'>;
	setSpecKind: (kind: SpecKind) => void;
	setSpecPath: (value: string) => void;
	setSpecText: (value: string) => void;
	specKind: SpecKind;
	specPath: string;
	specText: string;
}) {
	const hint =
		lane === 'fresh'
			? 'Add a spec, then Choose for me recommends Create Fresh, From Template, or Ingest Existing.'
			: lane === 'github'
				? 'Add a spec to guide metadata-only intake after the GitHub template is cloned.'
				: 'Add a spec to guide the initial run after the registered template is scaffolded.';
	return (
		<FieldRow group hint={hint} label="Spec">
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
		</FieldRow>
	);
}
