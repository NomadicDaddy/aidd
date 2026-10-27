import { useAuditManager } from '../../hooks/useAudits.ts';
import { selectClass } from '../../lib/formStyles.ts';

export function AuditRunSelection({
	onChange,
	value,
}: {
	onChange: (value: string) => void;
	value: string;
}) {
	const catalog = useAuditManager();
	if (catalog.isError) {
		return <p role="alert">Could not load audits. Reopen Audit mode to retry.</p>;
	}
	if (!catalog.data) {
		return (
			<p className="text-xs text-muted-foreground" role="status">
				Loading audits…
			</p>
		);
	}
	const definitions = catalog.data.definitions.filter((audit) => audit.enabled);
	return (
		<label className="flex min-w-56 flex-col gap-1 text-xs text-muted-foreground">
			Audit to run
			<select
				className={selectClass}
				disabled={!catalog.data.auditsEnabled}
				onChange={(event) => onChange(event.target.value)}
				value={value}>
				<option value="">Select an audit</option>
				{definitions.map((audit) => (
					<option key={audit.name} value={audit.name}>
						{audit.name}
					</option>
				))}
			</select>
			{!catalog.data.auditsEnabled && <span>Audits are disabled in settings.</span>}
		</label>
	);
}
