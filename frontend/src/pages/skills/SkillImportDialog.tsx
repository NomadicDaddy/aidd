import { useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import type { SkillCategory, SkillImportPreview } from '../../api/types/skills.ts';

import { Button } from '../../components/ui/button.tsx';
import { Dialog, DialogBody, DialogFooter, DialogPanel } from '../../components/ui/dialog.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useSkillImports } from '../../hooks/useSkills.ts';
import { SKILL_CATEGORY_FILTERS } from '../../lib/catalogCuration.ts';
import { fieldErrorClass, selectClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';

const TITLE_ID = 'skill-import-dialog-title';
const DESCRIPTION_ID = 'skill-import-dialog-description';

const CATEGORIES = SKILL_CATEGORY_FILTERS.flatMap(({ label, value }) =>
	value === 'all' ? [] : [{ label, value } satisfies { label: string; value: SkillCategory }],
);

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function getImportDisabledReason(
	hasSourcePath: boolean,
	preview: null | SkillImportPreview,
): null | string {
	if (!hasSourcePath) return 'Enter a local folder path.';
	if (!preview) return 'Preview the folder before importing.';
	if (preview.conflict === 'bundled') {
		return 'A bundled skill uses this ID and cannot be replaced.';
	}
	return null;
}

/**
 * Skill import, in a dialog.
 *
 * Import is an occasional admin action; as a full-width Card on the page it would push the catalog
 * and the skill detail below y=250 on every visit. It opens from the page header instead, matching
 * the `New Recipe` action on the sibling catalog.
 */
export function SkillImportDialog({ onClose, open }: { onClose: () => void; open: boolean }) {
	const { importSkill, previewImport } = useSkillImports();
	const [category, setCategory] = useState<SkillCategory>('general');
	const [preview, setPreview] = useState<null | SkillImportPreview>(null);
	const [previewError, setPreviewError] = useState<null | string>(null);
	const [sourcePath, setSourcePath] = useState('');
	const importReasonId = useId();
	const previewReasonId = useId();
	const previewRequestId = useRef(0);
	const hasSourcePath = sourcePath.trim().length > 0;
	const previewDisabledReason = hasSourcePath ? null : 'Enter a local folder path.';
	const importDisabledReason = getImportDisabledReason(hasSourcePath, preview);

	function closeDialog(): void {
		previewRequestId.current++;
		setCategory('general');
		setPreview(null);
		setPreviewError(null);
		setSourcePath('');
		onClose();
	}

	function previewSource(): void {
		const requestId = ++previewRequestId.current;
		setPreviewError(null);
		previewImport.mutate(
			{ category, sourcePath },
			{
				onError: (error) => {
					if (requestId !== previewRequestId.current) return;
					setPreview(null);
					setPreviewError(
						error instanceof Error ? error.message : 'Import preview failed',
					);
				},
				onSuccess: (nextPreview) => {
					if (requestId !== previewRequestId.current) return;
					setPreview(nextPreview);
				},
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
			onClose={closeDialog}
			open={open}>
			<DialogPanel className="flex w-full max-w-xl flex-col overflow-hidden">
				<div className="flex-none px-5 pt-5">
					<h2 className="text-base font-semibold text-foreground" id={TITLE_ID}>
						Import a local skill
					</h2>
					<p className="text-sm text-muted-foreground" id={DESCRIPTION_ID}>
						Copy a skill folder from an allowed root into persistent aidd data.
					</p>
				</div>
				<DialogBody className="grid gap-4 px-5 py-4">
					<FieldRow
						error={previewError}
						hint={
							<span>
								The folder must be inside an{' '}
								<Link
									className={`text-accent underline underline-offset-2 hover:text-accent/80 ${touchTargetTextClass}`}
									to="/settings">
									Application Root in Settings
								</Link>
								.
							</span>
						}
						label="Local folder"
						required>
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
								previewRequestId.current++;
								setPreview(null);
								setPreviewError(null);
								setSourcePath(event.target.value);
							}}
							placeholder="D:\skills\my-skill"
							value={sourcePath}
						/>
					</FieldRow>
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
						<Button
							aria-describedby={previewDisabledReason ? previewReasonId : undefined}
							disabled={!hasSourcePath || previewImport.isPending}
							onClick={previewSource}
							variant="secondary">
							{previewImport.isPending ? 'Checking…' : 'Preview'}
						</Button>
						{previewDisabledReason ? (
							<p
								className="min-w-0 text-xs text-muted-foreground"
								id={previewReasonId}>
								{previewDisabledReason}
							</p>
						) : null}
					</div>
					<FieldRow className="sm:max-w-52" label="Category">
						<select
							className={selectClass}
							onChange={(event) => {
								previewRequestId.current++;
								setPreview(null);
								setPreviewError(null);
								setCategory(event.target.value as SkillCategory);
							}}
							value={category}>
							{CATEGORIES.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</FieldRow>
					<div aria-live="polite" role="status">
						{preview ? (
							<div className="rounded-md border border-border p-3">
								<div className="min-w-0 text-sm">
									<div className="font-semibold">{preview.title}</div>
									<div className="font-mono text-muted-foreground">
										{preview.id} · {preview.fileCount}{' '}
										{preview.fileCount === 1 ? 'file' : 'files'} ·{' '}
										{formatBytes(preview.totalBytes)}
									</div>
									{preview.conflict === 'bundled' ? (
										<div className={fieldErrorClass} role="alert">
											A bundled skill uses this ID and cannot be replaced.
										</div>
									) : preview.conflict === 'imported' ? (
										<div className={toneText.amber}>
											An imported skill uses this ID. Import will replace it.
										</div>
									) : null}
								</div>
							</div>
						) : null}
					</div>
				</DialogBody>
				<DialogFooter className="flex-col gap-2 border-t border-border p-5 sm:flex-row sm:items-center">
					{importDisabledReason ? (
						<p
							className="min-w-0 text-xs text-muted-foreground sm:mr-auto"
							id={importReasonId}>
							{importDisabledReason}
						</p>
					) : null}
					<Button onClick={closeDialog} variant="secondary">
						Cancel
					</Button>
					<Button
						aria-describedby={importDisabledReason ? importReasonId : undefined}
						disabled={
							!preview || preview.conflict === 'bundled' || importSkill.isPending
						}
						onClick={applyImport}
						variant="primary">
						{importSkill.isPending
							? 'Importing…'
							: preview?.conflict === 'imported'
								? 'Replace'
								: 'Import'}
					</Button>
				</DialogFooter>
			</DialogPanel>
		</Dialog>
	);
}
