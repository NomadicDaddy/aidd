import { default as Check } from 'lucide-react/dist/esm/icons/check';
import { default as Pencil } from 'lucide-react/dist/esm/icons/pencil';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useState } from 'react';
import { toast } from 'sonner';

import type { ProjectFeature } from '../../../api/types.ts';

import { Button, IconButton } from '../../../components/ui/button.tsx';
import { Dialog, DialogPanel } from '../../../components/ui/dialog.tsx';
import { useUpdateProjectFeatureMetadata } from '../../../hooks/useProjects.ts';
import { textareaClass } from '../../../lib/formStyles.ts';
import {
	FeatureApprovalSection,
	FeatureBlockingContextSection,
	FeatureListSection,
	FeatureTextSection,
} from './FeatureDetailSections.tsx';
import {
	displayValue,
	FEATURE_METADATA_KEYS,
	featureDependents,
	featureDirectory,
	listValue,
	textBlockValue,
} from './featuresUtils.ts';
import { stringValue } from './shared.ts';

function featureNotesForEdit(feature: ProjectFeature): string {
	const notes = feature.notes;
	if (Array.isArray(notes)) return (notes as unknown[]).map((n) => String(n)).join('\n');
	if (typeof notes === 'string') return notes;
	return '';
}

export function FeatureDetailsDialog({
	feature,
	features,
	onClose,
	projectId,
}: {
	feature: ProjectFeature;
	features: ProjectFeature[];
	onClose: () => void;
	projectId: string;
}) {
	const [editing, setEditing] = useState(false);
	const [editSpec, setEditSpec] = useState('');
	const [editNotes, setEditNotes] = useState('');
	const updateMetadata = useUpdateProjectFeatureMetadata(projectId);

	const id = feature.id || stringValue(feature, 'id');
	const title = stringValue(feature, 'title') || id;
	const description = textBlockValue(feature.description);
	const spec = textBlockValue(feature.spec);
	const steps = textBlockValue(feature.steps);
	const dependencies = listValue(feature.dependencies);
	const requiredBy = featureDependents(feature, features);
	const affectedFiles = listValue(feature.affectedFiles);
	const notes = listValue(feature.notes);
	const metadataRows = FEATURE_METADATA_KEYS.map((key) => ({
		key,
		value: displayValue(feature[key]),
	})).filter((row) => row.value !== '—');
	const rawJson = JSON.stringify(feature, null, 2);

	function startEditing(): void {
		setEditSpec(spec);
		setEditNotes(featureNotesForEdit(feature));
		setEditing(true);
	}

	function cancelEditing(): void {
		setEditing(false);
	}

	function saveMetadata(): void {
		const featureId = featureDirectory(feature);
		const notesLines = editNotes
			.split('\n')
			.map((line) => line.trimEnd())
			.filter((line) => line.length > 0);
		updateMetadata.mutate(
			{
				featureId,
				notes: notesLines,
				spec: editSpec,
			},
			{
				onError: (error) =>
					toast.error(
						error instanceof Error
							? error.message
							: 'Failed to update feature metadata',
					),
				onSuccess: () => {
					toast.success('Feature metadata saved');
					onClose();
				},
			},
		);
	}

	return (
		<Dialog
			aria-labelledby="feature-details-title"
			initialFocus="container"
			lockScroll
			onClose={onClose}
			open
			overlayClassName="focus:outline-none"
			role="dialog">
			<DialogPanel className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto p-5">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h2
							className="text-lg font-semibold text-foreground"
							id="feature-details-title">
							{title}
						</h2>
						<p className="mt-1 font-mono text-xs break-all text-muted-foreground">
							{id}
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{!editing ? (
							<Button
								aria-label="Edit feature metadata"
								onClick={startEditing}
								title="Edit spec and notes"
								variant="secondary">
								<Pencil className="h-4 w-4" />
								Edit
							</Button>
						) : null}
						<IconButton
							ariaLabel="Close feature details"
							onClick={onClose}
							variant="ghost">
							<X className="h-4 w-4" />
						</IconButton>
					</div>
				</div>
				<div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
					<div className="space-y-5">
						<FeatureTextSection title="Description">{description}</FeatureTextSection>
						{editing ? (
							<section>
								<h3 className="text-xs font-semibold text-muted-foreground uppercase">
									Spec
								</h3>
								<textarea
									aria-label="Edit spec"
									className={`mt-2 ${textareaClass}`}
									disabled={updateMetadata.isPending}
									onChange={(e) => setEditSpec(e.target.value)}
									rows={10}
									value={editSpec}
								/>
							</section>
						) : (
							<FeatureTextSection title="Spec">{spec}</FeatureTextSection>
						)}
						<FeatureTextSection title="Steps">{steps}</FeatureTextSection>
						{editing ? (
							<section>
								<h3 className="text-xs font-semibold text-muted-foreground uppercase">
									Notes
									<span className="ml-2 font-normal text-muted-foreground normal-case">
										(one note per line)
									</span>
								</h3>
								<textarea
									aria-label="Edit notes"
									className={`mt-2 ${textareaClass}`}
									disabled={updateMetadata.isPending}
									onChange={(e) => setEditNotes(e.target.value)}
									rows={6}
									value={editNotes}
								/>
							</section>
						) : (
							<FeatureListSection items={notes} title="Notes" />
						)}
						{editing ? (
							<div className="flex gap-2">
								<Button disabled={updateMetadata.isPending} onClick={saveMetadata}>
									<Check className="h-4 w-4" />
									{updateMetadata.isPending ? 'Saving…' : 'Save'}
								</Button>
								<Button
									disabled={updateMetadata.isPending}
									onClick={cancelEditing}
									variant="secondary">
									Cancel
								</Button>
							</div>
						) : null}
						<details className="rounded-md border border-border bg-muted p-3">
							<summary className="cursor-pointer text-sm font-medium text-foreground">
								Raw feature.json
							</summary>
							<pre className="mt-3 max-h-96 overflow-auto text-xs break-words whitespace-pre-wrap text-foreground">
								{rawJson}
							</pre>
						</details>
					</div>
					<div className="space-y-5">
						<section>
							<h3 className="text-xs font-semibold text-muted-foreground uppercase">
								Metadata
							</h3>
							<dl className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border text-sm">
								{metadataRows.map((row) => (
									<div
										className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 px-3 py-2"
										key={row.key}>
										<dt className="text-muted-foreground">{row.key}</dt>
										<dd className="break-words text-foreground">{row.value}</dd>
									</div>
								))}
							</dl>
						</section>
						<FeatureBlockingContextSection blockingContext={feature.blockingContext} />
						<FeatureApprovalSection approval={feature.approval} />
						<FeatureListSection items={dependencies} title="Dependencies" />
						<FeatureListSection
							hint="Features declaring a dependency on this one — changing its surface affects them."
							items={requiredBy}
							title="Required by"
						/>
						<FeatureListSection items={affectedFiles} title="Affected files" />
					</div>
				</div>
			</DialogPanel>
		</Dialog>
	);
}
