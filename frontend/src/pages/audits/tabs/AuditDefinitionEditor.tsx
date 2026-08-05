import { default as Save } from 'lucide-react/dist/esm/icons/save';

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
		<section className="scroll-mt-4" id={auditDefinitionEditorId}>
			<Card className="space-y-3">
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
							<span className="break-all">{auditPath}</span>
						) : (
							'Select a row in the catalog above to edit its definition.'
						)
					}
					title={selectedAudit ?? 'Audit definition'}
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
