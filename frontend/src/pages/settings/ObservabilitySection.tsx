import type { WebConfigSettings } from '../../api/types.ts';

import { Card } from '../../components/ui/card.tsx';
import { FieldCheckbox } from '../../components/ui/field.tsx';

export function ObservabilitySection({
	form,
	setField,
}: {
	form: WebConfigSettings;
	setField: <K extends keyof WebConfigSettings>(key: K, value: WebConfigSettings[K]) => void;
}) {
	return (
		<Card>
			<FieldCheckbox
				checked={form.traceDataMovement}
				description="Emit local API, backend, socket, and UI trace groups in the browser console."
				label="Browser console trace"
				onChange={(event) => setField('traceDataMovement', event.target.checked)}
			/>
		</Card>
	);
}
