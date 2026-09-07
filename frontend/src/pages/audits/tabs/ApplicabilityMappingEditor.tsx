import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { useState } from 'react';
import { toast } from 'sonner';

import type { AuditProfileMapping } from '../../../api/types.ts';

import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { useUpdateAuditProfileMapping } from '../../../hooks/useAudits.ts';
import { monoTextareaClass } from '../../../lib/formStyles.ts';
import { toneText } from '../../../lib/tones.ts';

/**
 * The raw-mapping escape hatch, kept out of the tab that reads the matrix.
 *
 * It seeds from props in a `useState` initializer rather than an effect, which it can because the
 * tab mounts it only while the editor is open — so opening it is a fresh mount with the current
 * mapping. The tab used to hold the draft across closes and re-seed it from an effect, which is
 * what put a file-level `react-hooks/set-state-in-effect` disable at the top of that file.
 */
export function ApplicabilityMappingEditor({
	mapping,
	onSaved,
}: {
	mapping: AuditProfileMapping;
	onSaved: () => void;
}) {
	const update = useUpdateAuditProfileMapping();
	const [text, setText] = useState(() => JSON.stringify(mapping, null, 2));
	const [error, setError] = useState<null | string>(null);

	function save() {
		let parsed: AuditProfileMapping;
		try {
			parsed = JSON.parse(text) as AuditProfileMapping;
		} catch (parseError) {
			setError(parseError instanceof Error ? parseError.message : 'Invalid JSON');
			return;
		}
		update.mutate(parsed, {
			onError: (mutationError) =>
				setError(
					mutationError instanceof Error
						? mutationError.message
						: 'Failed to save mapping',
				),
			onSuccess: () => {
				toast.success('Audit profile mapping saved');
				onSaved();
			},
		});
	}

	return (
		<Card className="flex flex-col gap-3">
			<CardHeader
				action={
					<Button disabled={update.isPending} onClick={save} variant="primary">
						<Save className="h-4 w-4" />
						{update.isPending ? 'Saving…' : 'Save Mapping'}
					</Button>
				}
				className="mb-0"
				title="Global Mapping JSON"
			/>
			<textarea
				aria-describedby={error ? 'audit-mapping-error' : undefined}
				aria-invalid={Boolean(error)}
				aria-label="Audit profile mapping JSON"
				className={`${monoTextareaClass} min-h-[clamp(22.5rem,calc(100dvh-24rem),42rem)] font-mono text-xs`}
				onChange={(event) => setText(event.target.value)}
				value={text}
			/>
			{error && (
				<div className={`text-xs ${toneText.red}`} id="audit-mapping-error" role="alert">
					{error}
				</div>
			)}
		</Card>
	);
}
