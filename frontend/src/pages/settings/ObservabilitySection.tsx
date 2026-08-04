import type { WebConfigSettings } from '../../api/types.ts';

import { Card } from '../../components/ui/card.tsx';

export function ObservabilitySection({
	form,
	setField,
}: {
	form: WebConfigSettings;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	return (
		<Card className="p-3">
			<label className="flex items-start gap-2 rounded-md border border-border px-3 py-2">
				<input
					checked={form.traceDataMovement}
					className="mt-0.5"
					onChange={(event) => setField('traceDataMovement', event.target.checked)}
					type="checkbox"
				/>
				<span className="text-sm text-foreground">
					<span className="font-medium text-foreground">Browser console trace</span>
					<span className="mt-1 block text-xs text-muted-foreground">
						Emit local API, backend, socket, and UI trace groups in the browser console.
					</span>
				</span>
			</label>
		</Card>
	);
}
