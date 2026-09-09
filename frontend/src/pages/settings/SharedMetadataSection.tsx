import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';

import type { SharedFileEntry, WebConfigSettings } from '../../api/types.ts';

import { Button, IconButton } from '../../components/ui/button.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { FieldRow, FormGrid } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { ListEditor } from './ListEditor.tsx';

export function SharedMetadataSection({
	form,
	setField,
}: {
	form: WebConfigSettings;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	function setSharedFile(index: number, update: Partial<SharedFileEntry>): void {
		const next = [...form.sharedFiles];
		const existing = next[index]!;
		next[index] = {
			source: update.source ?? existing.source,
			target: update.target !== undefined ? update.target : existing.target,
		};
		setField('sharedFiles', next);
	}

	function addSharedFile(): void {
		setField('sharedFiles', [...form.sharedFiles, { source: '', target: null }]);
	}

	function removeSharedFile(index: number): void {
		setField(
			'sharedFiles',
			form.sharedFiles.filter((_, i) => i !== index),
		);
	}

	return (
		<div className="grid gap-4 @min-[61rem]:grid-cols-2">
			<Card className="flex flex-col gap-2">
				{/* Card titles take the h2 the rest of the surface uses; fieldLabelClass is for the
				    field labels inside them. */}
				<CardHeader
					className="mb-0"
					description="Copied by basename into the project root during fresh-project scaffolding. Matching files can be overwritten."
					title="Shared Directories"
				/>
				{/* The card title already names the list; the label survives only for the
				    per-entry aria-labels. */}
				<ListEditor
					inputClassName="font-mono"
					items={form.sharedDirs}
					label="Shared Dirs"
					labelHidden
					onChange={(items) => setField('sharedDirs', items)}
					placeholder="/path/to/shared/dir"
				/>
			</Card>

			<Card className="flex flex-col gap-2">
				<CardHeader
					className="mb-0"
					description="Copied during scaffolding to a project-relative target, or the source filename at the project root. Existing files can be overwritten; write allowlists limit the permitted targets."
					title="Shared Files"
				/>
				<div className="space-y-3">
					{form.sharedFiles.map((entry, index) => (
						<div className="flex items-start gap-2" key={index}>
							<FormGrid className="flex-1 gap-2 @min-[45rem]:grid-cols-2">
								<FieldRow label="Source">
									<Input
										aria-label={`Shared file ${index + 1} source`}
										className="font-mono"
										onChange={(event) =>
											setSharedFile(index, { source: event.target.value })
										}
										placeholder="/path/to/source/file"
										value={entry.source}
									/>
								</FieldRow>
								<FieldRow label="Target (optional)">
									<Input
										aria-label={`Shared file ${index + 1} target`}
										className="font-mono"
										onChange={(event) =>
											setSharedFile(index, {
												target: event.target.value.trim() || null,
											})
										}
										placeholder="relative/target/path"
										value={entry.target ?? ''}
									/>
								</FieldRow>
							</FormGrid>
							<IconButton
								ariaLabel={`Remove shared file ${index + 1}`}
								className="mt-5"
								onClick={() => removeSharedFile(index)}
								variant="ghost">
								<Trash2 className="h-4 w-4" />
							</IconButton>
						</div>
					))}
					<Button
						aria-label="Add shared file entry"
						onClick={addSharedFile}
						size="compact"
						variant="secondary">
						<Plus className="h-4 w-4" />
						Add
					</Button>
				</div>
			</Card>
		</div>
	);
}
