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
			<label className="flex items-start gap-2 rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800">
				<input
					checked={form.traceDataMovement}
					className="mt-0.5"
					onChange={(event) => setField('traceDataMovement', event.target.checked)}
					type="checkbox"
				/>
				<span className="text-sm text-neutral-700 dark:text-neutral-300">
					<span className="font-medium text-neutral-800 dark:text-neutral-100">
						Browser console trace
					</span>
					<span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
						Emit local API, backend, socket, and UI trace groups in the browser console.
					</span>
				</span>
			</label>
		</Card>
	);
}
