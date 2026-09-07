import { default as Check } from 'lucide-react/dist/esm/icons/check';
import { default as Pencil } from 'lucide-react/dist/esm/icons/pencil';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { useState } from 'react';
import { toast } from 'sonner';

import type { ProjectFeature } from '../../../api/types.ts';

import { DERIVED_FEATURE_KEYS, onDiskFeature } from '../../../api/types.ts';
import { DisclosureMarker } from '../../../components/shared/DisclosureMarker.tsx';
import { Button, IconButton } from '../../../components/ui/button.tsx';
import { Dialog, DialogBody, DialogPanel } from '../../../components/ui/dialog.tsx';
import { useProjectFeature, useUpdateProjectFeatureMetadata } from '../../../hooks/useProjects.ts';
import { textareaClass } from '../../../lib/formStyles.ts';
import { sectionCaptionClass } from '../../../lib/typography.ts';
import {
	FeatureApprovalSection,
	FeatureBlockingContextSection,
	FeatureListSection,
	FeatureTextSection,
} from './FeatureDetailSections.tsx';
import { featureEditorGate, featureNotesForEdit } from './featureProseEditor.ts';
import {
	displayValue,
	FEATURE_METADATA_KEYS,
	featureDependents,
	featureDirectory,
	listValue,
	textBlockValue,
} from './featuresUtils.ts';
import { stringValue } from './shared.ts';

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
	// The row this dialog opened from is a summary: the project-detail response drops `spec`,
	// `notes`, `affectedFiles` and `aiddReport` so that listing 300+ features does not ship a
	// megabyte of prose. Merge the fetched record over the row rather than swapping to it, so the
	// header, metadata and dependencies stay on screen while the prose is in flight.
	const detail = useProjectFeature(projectId, featureDirectory(feature));
	const full = detail.data ? { ...feature, ...detail.data } : feature;
	const editorGate = featureEditorGate(detail);

	const id = full.id || stringValue(full, 'id');
	const title = stringValue(full, 'title') || id;
	const description = textBlockValue(full.description);
	const spec = textBlockValue(full.spec);
	const steps = textBlockValue(full.steps);
	const dependencies = listValue(full.dependencies);
	const requiredBy = featureDependents(full, features);
	const affectedFiles = listValue(full.affectedFiles);
	const notes = listValue(full.notes);
	const metadataRows = FEATURE_METADATA_KEYS.map((key) => ({
		derived: DERIVED_FEATURE_KEYS.includes(key),
		key,
		value: displayValue(full[key]),
	})).filter((row) => row.value !== '—');
	// Two corrections to what this block used to serialize. The list row is a summary — the
	// project-detail response drops spec, notes, affectedFiles and aiddReport — so rendering it
	// showed a feature.json missing four keys the file has; waiting for the detail fetch fixes
	// that half. The other half is two keys the file does not have: `directory` is injected on
	// read and `milestone` is stamped from roadmap.json, and neither is ever written back.
	const rawJson = detail.data ? JSON.stringify(onDiskFeature(full), null, 2) : null;

	function startEditing(): void {
		setEditSpec(spec);
		setEditNotes(featureNotesForEdit(full));
		setEditing(true);
	}

	function cancelEditing(): void {
		setEditing(false);
	}

	function saveMetadata(): void {
		const featureId = featureDirectory(full);
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
			onClose={onClose}
			open
			overlayClassName="focus:outline-none"
			role="dialog">
			<DialogPanel className="flex w-full max-w-4xl flex-col overflow-hidden xl:max-w-6xl">
				<div className="flex flex-none items-start justify-between gap-3 px-5 pt-5">
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
								disabled={editorGate.disabled}
								onClick={startEditing}
								title={editorGate.reason}
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
				<DialogBody className="px-5 pb-5">
					{editorGate.disabled ? (
						<p className="mt-3 text-xs text-muted-foreground" role="status">
							{detail.isError
								? 'The spec, notes and affected files could not be loaded.'
								: 'Loading spec, notes and affected files…'}
						</p>
					) : null}
					<div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
						<div className="space-y-5">
							<FeatureTextSection title="Description">
								{description}
							</FeatureTextSection>
							{editing ? (
								<section>
									<h3 className={sectionCaptionClass}>Spec</h3>
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
									<h3 className={sectionCaptionClass}>
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
								<FeatureListSection items={notes} mono={false} title="Notes" />
							)}
							{editing ? (
								<div className="flex gap-2">
									<Button
										disabled={updateMetadata.isPending}
										onClick={saveMetadata}>
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
							<details className="group rounded-md border border-border bg-muted p-3">
								<summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-foreground marker:content-none">
									<DisclosureMarker />
									Raw feature.json
								</summary>
								<pre className="mt-3 max-h-96 overflow-auto text-xs break-words whitespace-pre-wrap text-foreground">
									{rawJson ??
										(detail.isError
											? 'The full record could not be loaded.'
											: 'Loading the full record…')}
								</pre>
							</details>
						</div>
						<div className="space-y-5">
							<section>
								<h3 className={sectionCaptionClass}>Metadata</h3>
								<dl className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border text-sm">
									{metadataRows.map((row) => (
										<div
											className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 px-3 py-2"
											key={row.key}>
											<dt className="text-muted-foreground">
												{row.key}
												{/* Named here because the block below no longer shows
												    them: without this the two keys would look absent from
												    the record rather than derived from elsewhere. */}
												{row.derived ? (
													<span className="block text-xs text-muted-foreground/70">
														derived
													</span>
												) : null}
											</dt>
											<dd className="break-words text-foreground">
												{row.value}
											</dd>
										</div>
									))}
								</dl>
							</section>
							<FeatureBlockingContextSection blockingContext={full.blockingContext} />
							<FeatureApprovalSection approval={full.approval} />
							<FeatureListSection items={dependencies} title="Dependencies" />
							<FeatureListSection
								hint="Features declaring a dependency on this one — changing its surface affects them."
								items={requiredBy}
								title="Required by"
							/>
							<FeatureListSection items={affectedFiles} title="Affected files" />
						</div>
					</div>
				</DialogBody>
			</DialogPanel>
		</Dialog>
	);
}
