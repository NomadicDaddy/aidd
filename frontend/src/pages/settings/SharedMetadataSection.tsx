import { default as FileSymlink } from 'lucide-react/dist/esm/icons/file-symlink';
import { default as FolderSymlink } from 'lucide-react/dist/esm/icons/folder-symlink';
import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';

import type { SharedFileEntry, WebConfigSettings } from '../../api/types.ts';

import { Button, IconButton } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { fieldLabelClass } from '../../lib/formStyles.ts';
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
		<div className="grid gap-4 xl:grid-cols-2">
			<Card className="space-y-2 p-3">
				<div className={fieldLabelClass}>
					<FolderSymlink className="mr-1 inline h-4 w-4" />
					Shared Directories
				</div>
				<p className="text-xs text-muted-foreground">
					Directories copied into each project during metadata scaffolding.
				</p>
				<ListEditor
					items={form.sharedDirs}
					label="Shared Dirs"
					onChange={(items) => setField('sharedDirs', items)}
					placeholder="/path/to/shared/dir"
				/>
			</Card>

			<Card className="space-y-2 p-3">
				<div className={fieldLabelClass}>
					<FileSymlink className="mr-1 inline h-4 w-4" />
					Shared Files
				</div>
				<p className="text-xs text-muted-foreground">
					Files copied into each project during metadata scaffolding. Each entry is a
					source path with an optional target path (relative to the project directory).
				</p>
				<div className="space-y-3">
					{form.sharedFiles.map((entry, index) => (
						<div className="flex items-start gap-2" key={index}>
							<div className="grid flex-1 gap-2 lg:grid-cols-2">
								<label className="block space-y-1">
									<span className="text-xs text-muted-foreground">Source</span>
									<Input
										aria-label={`Shared file ${index + 1} source`}
										onChange={(event) =>
											setSharedFile(index, { source: event.target.value })
										}
										placeholder="/path/to/source/file"
										value={entry.source}
									/>
								</label>
								<label className="block space-y-1">
									<span className="text-xs text-muted-foreground">
										Target (optional)
									</span>
									<Input
										aria-label={`Shared file ${index + 1} target`}
										onChange={(event) =>
											setSharedFile(index, {
												target: event.target.value.trim() || null,
											})
										}
										placeholder="relative/target/path"
										value={entry.target ?? ''}
									/>
								</label>
							</div>
							<IconButton
								ariaLabel={`Remove shared file ${index + 1}`}
								className="mt-5"
								onClick={() => removeSharedFile(index)}
								variant="ghost">
								<Trash2 className="h-4 w-4" />
							</IconButton>
						</div>
					))}
					<Button onClick={addSharedFile} variant="secondary">
						<Plus className="h-4 w-4" />
						Add File
					</Button>
				</div>
			</Card>
		</div>
	);
}
