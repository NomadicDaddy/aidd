import { contentSizedColumnClass } from '../../../lib/tableStyles.ts';

/** Shared grid for both AI-usage breakdown tables. */
export function UsageTableColumns() {
	return (
		<colgroup>
			<col className={contentSizedColumnClass} />
			<col />
			<col />
			<col />
		</colgroup>
	);
}
