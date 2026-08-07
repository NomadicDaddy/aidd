import type { ProjectFeature } from '../../../api/types.ts';

/**
 * The two helpers the feature details dialog needs to edit a feature's prose safely.
 *
 * They live together, and apart from `featuresUtils.ts`, because they exist for one reason: the
 * project-detail response returns feature *summaries*. It drops `spec`, `notes`, `affectedFiles`
 * and `aiddReport` so that listing 300+ features does not ship a megabyte of prose no tab reads.
 * The row the dialog opens from therefore does not hold what the editor edits.
 */

/**
 * Whether the spec/notes editor may be opened, and why not when it may not.
 *
 * A data-loss guard, not a cosmetic disabled state. The editor seeds its textareas from `spec` and
 * `notes`; on a summary row both are empty. Opening before the full record lands, or after the
 * fetch failed, seeds empty strings, and saving then overwrites the real spec and notes with
 * nothing.
 */
export function featureEditorGate(prose: { isError: boolean; isPending: boolean }): {
	disabled: boolean;
	reason: string;
} {
	if (prose.isError) return { disabled: true, reason: 'Feature could not be loaded' };
	if (prose.isPending) return { disabled: true, reason: 'Loading feature…' };
	return { disabled: false, reason: 'Edit spec and notes' };
}

/** Notes as one line per note, which is how the textarea presents and re-parses them. */
export function featureNotesForEdit(feature: ProjectFeature): string {
	const notes = feature.notes;
	if (Array.isArray(notes)) return (notes as unknown[]).map((note) => String(note)).join('\n');
	if (typeof notes === 'string') return notes;
	return '';
}
