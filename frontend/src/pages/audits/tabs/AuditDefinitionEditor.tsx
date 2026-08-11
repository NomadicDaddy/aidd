import { default as Save } from 'lucide-react/dist/esm/icons/save';

import { FilePath } from '../../../components/shared/FilePath.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { textareaClass } from '../../../lib/formStyles.ts';
import { auditDefinitionEditorId } from '../auditsUtils.ts';

interface AuditDefinitionEditorProps {
	auditPath: string | undefined;
	content: string;
	dirty: boolean;
	onContentChange: (value: string) => void;
	onSave: () => void;
	savePending: boolean;
	selectedAudit: null | string;
}

/**
 * The catalog's definition editor. It used to share a narrow right-hand column with the launch-target
 * picker, which cost the table ~470px of width it needed more; it now runs full width under the row
 * it edits, and selecting a row scrolls it into view.
 */
export function AuditDefinitionEditor({
	auditPath,
	content,
	dirty,
	onContentChange,
	onSave,
	savePending,
	selectedAudit,
}: AuditDefinitionEditorProps) {
	return (
		// No `scroll-mt-4`: the 1rem gap it bought is now the tail of the root's
		// `scroll-padding-top`, which every anchor gets for free. Left here it would stack on top of
		// that padding, so the two jump targets on this tab would land 16px lower than every other
		// anchor in the app.
		<section id={auditDefinitionEditorId}>
			<Card className="flex flex-col gap-3">
				<CardHeader
					action={
						<Button
							disabled={!dirty || savePending || !selectedAudit}
							onClick={onSave}
							variant="primary">
							<Save className="h-4 w-4" />
							{savePending ? 'Saving…' : 'Save'}
						</Button>
					}
					className="mb-0"
					description={
						auditPath ? (
							<FilePath className="break-all" path={auditPath} />
						) : (
							'Select a row in the catalog above to edit its definition.'
						)
					}
					// The audit id was the card's `title`, which put it in Geist Sans at
					// `text-base font-semibold` — the same string the catalog above renders in
					// mono, restyled as prose because it happened to be what this card is
					// about. `identifier` is the slot for exactly that: it keeps the heading
					// stable at "Audit definition" so the card is still findable when nothing
					// is selected, and prints the id beneath it in the face the rest of the
					// tab uses.
					identifier={selectedAudit ?? undefined}
					title="Audit definition"
				/>
				<textarea
					aria-label="Audit definition markdown"
					className={`${textareaClass} min-h-[320px] font-mono text-xs`}
					onChange={(event) => onContentChange(event.target.value)}
					value={content}
				/>
			</Card>
		</section>
	);
}
