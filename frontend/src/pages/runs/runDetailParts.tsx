import { cn } from '../../lib/cn.ts';
import { fieldLabelClass } from '../../lib/formStyles.ts';

export function MetadataItem({
	className,
	label,
	value,
}: {
	className?: string;
	label: string;
	value: string;
}) {
	return (
		<div className={cn('flex min-w-0 flex-col', className)}>
			<dt className={fieldLabelClass}>{label}</dt>
			<dd className="min-w-0 text-xs break-words text-foreground">{value}</dd>
		</div>
	);
}

export function ReadOnlyContractViolation() {
	return (
		<div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
			<strong>Read-only contract violation.</strong> This skill directive was instructed not
			to modify the project, but its run evidence includes file changes or commits. aidd
			preserved the evidence and did not automatically revert any work.
		</div>
	);
}
