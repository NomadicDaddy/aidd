import { useState } from 'react';
import { toast } from 'sonner';

import type { SkillCategory, SkillImportPreview } from '../../api/types/skills.ts';

import { Button } from '../../components/ui/button.tsx';
import { Dialog, DialogPanel } from '../../components/ui/dialog.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useSkillImports } from '../../hooks/useSkills.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';

const TITLE_ID = 'skill-import-dialog-title';
const DESCRIPTION_ID = 'skill-import-dialog-description';

const CATEGORIES: readonly SkillCategory[] = [
	'general',
	'audit-remediation',
	'metadata',
	'recipe-maturity',
	'runtime',
	'spernakit-fleet',
];

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

/**
 * Skill import, in a dialog.
 *
 * Import is an occasional admin action that was the first and only full-width Card on the page,
 * pushing the catalog and the skill detail below y=250 on every visit. It now opens from the page
 * header, matching the `New Recipe` action on the sibling catalog.
 */
export function SkillImportDialog({ onClose, open }: { onClose: () => void; open: boolean }) {
	const { importSkill, previewImport } = useSkillImports();
	const [category, setCategory] = useState<SkillCategory>('general');
	const [preview, setPreview] = useState<null | SkillImportPreview>(null);
	const [sourcePath, setSourcePath] = useState('');

	function previewSource(): void {
		previewImport.mutate(
			{ category, sourcePath },
			{
				onError: (error) => {
					setPreview(null);
					toast.error(error instanceof Error ? error.message : 'Import preview failed');
				},
				onSuccess: setPreview,
			},
		);
	}

	function applyImport(): void {
		if (!preview) return;
		importSkill.mutate(
			{
				category,
				replace: preview.conflict === 'imported',
				sourcePath,
			},
			{
				onError: (error) =>
					toast.error(error instanceof Error ? error.message : 'Skill import failed'),
				onSuccess: (skill) => {
					toast.success(
						`${skill.id} ${preview.conflict === 'imported' ? 'replaced' : 'imported'}`,
					);
					setPreview(null);
					setSourcePath('');
				},
			},
		);
	}

	return (
		<Dialog
			aria-describedby={DESCRIPTION_ID}
			aria-labelledby={TITLE_ID}
			initialFocus="first"
			onClose={onClose}
			open={open}>
			<DialogPanel className="w-full max-w-2xl space-y-3 p-5">
				<div>
					<h2 className="text-base font-semibold text-foreground" id={TITLE_ID}>
						Import a local skill
					</h2>
					<p className="text-sm text-muted-foreground" id={DESCRIPTION_ID}>
						Copy a skill folder from an allowed root into persistent aidd data.
					</p>
				</div>
				<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem_auto] sm:items-end">
					<FieldRow label="Local folder">
						{/* A JSX string attribute is not a JS string literal, so `\\` is not an escape
						    here — it reached the screen as the two characters it looks like, and the
						    placeholder read `D:\\skills\\my-skill`.

						    `font-mono` because what is typed here is a filesystem path, and it was
						    the only path on this surface set in Geist Sans — the skill id, the
						    support-file paths and the model chip beside it are all mono. */}
						<Input
							className="font-mono"
							name="skillImportPath"
							onChange={(event) => {
								setPreview(null);
								setSourcePath(event.target.value);
							}}
							placeholder="D:\skills\my-skill"
							value={sourcePath}
						/>
					</FieldRow>
					<FieldRow label="Category">
						<select
							className={selectClass}
							onChange={(event) => {
								setPreview(null);
								setCategory(event.target.value as SkillCategory);
							}}
							value={category}>
							{CATEGORIES.map((value) => (
								<option key={value} value={value}>
									{value}
								</option>
							))}
						</select>
					</FieldRow>
					<Button
						disabled={!sourcePath.trim() || previewImport.isPending}
						onClick={previewSource}
						variant="secondary">
						{previewImport.isPending ? 'Checking…' : 'Preview'}
					</Button>
				</div>
				{preview ? (
					<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
						<div className="min-w-0 text-sm">
							<div className="font-semibold">{preview.title}</div>
							<div className="text-muted-foreground">
								{preview.id} · {preview.fileCount} files ·{' '}
								{formatBytes(preview.totalBytes)}
							</div>
							{preview.conflict === 'bundled' ? (
								<div className={toneText.red}>
									A bundled skill uses this ID and cannot be replaced.
								</div>
							) : preview.conflict === 'imported' ? (
								<div className={toneText.amber}>
									An imported skill uses this ID. Import will replace it.
								</div>
							) : null}
						</div>
						<Button
							disabled={preview.conflict === 'bundled' || importSkill.isPending}
							onClick={applyImport}>
							{importSkill.isPending
								? 'Importing…'
								: preview.conflict === 'imported'
									? 'Replace'
									: 'Import'}
						</Button>
					</div>
				) : null}
				<div className="flex justify-end">
					<Button onClick={onClose} variant="secondary">
						Close
					</Button>
				</div>
			</DialogPanel>
		</Dialog>
	);
}
