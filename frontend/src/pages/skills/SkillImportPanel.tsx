import { useState } from 'react';
import { toast } from 'sonner';

import type { SkillCategory, SkillImportPreview } from '../../api/types/skills.ts';

import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Input } from '../../components/ui/input.tsx';
import { useSkillImports } from '../../hooks/useSkills.ts';

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

export function SkillImportPanel() {
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
		<Card className="space-y-3">
			<div>
				<h2 className="text-base font-semibold text-foreground">Import a local skill</h2>
				<p className="text-sm text-neutral-600 dark:text-neutral-400">
					Copy a skill folder from an allowed root into persistent aidd data.
				</p>
			</div>
			<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem_auto] sm:items-end">
				<label className="space-y-1 text-sm">
					<span>Local folder</span>
					<Input
						name="skillImportPath"
						onChange={(event) => {
							setPreview(null);
							setSourcePath(event.target.value);
						}}
						placeholder="D:\\skills\\my-skill"
						value={sourcePath}
					/>
				</label>
				<label className="space-y-1 text-sm">
					<span>Category</span>
					<select
						className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-700 dark:bg-neutral-950"
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
				</label>
				<Button
					disabled={!sourcePath.trim() || previewImport.isPending}
					onClick={previewSource}
					variant="secondary">
					{previewImport.isPending ? 'Checking…' : 'Preview'}
				</Button>
			</div>
			{preview ? (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
					<div className="min-w-0 text-sm">
						<div className="font-semibold">{preview.title}</div>
						<div className="text-neutral-500">
							{preview.id} · {preview.fileCount} files ·{' '}
							{formatBytes(preview.totalBytes)}
						</div>
						{preview.conflict === 'bundled' ? (
							<div className="text-red-700 dark:text-red-300">
								A bundled skill uses this ID and cannot be replaced.
							</div>
						) : preview.conflict === 'imported' ? (
							<div className="text-amber-700 dark:text-amber-300">
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
		</Card>
	);
}
