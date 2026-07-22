export function BlueprintOnlyToggle({
	checked,
	onChange,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
			<input
				checked={checked}
				className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-cyan-600 focus:ring-cyan-500"
				onChange={(event) => onChange(event.target.checked)}
				type="checkbox"
			/>
			<span>
				<span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
					Stop before implementation (blueprint only)
				</span>
				<span className="mt-0.5 block text-xs text-neutral-500">
					Create and commit the scaffold, reviewed feature backlog, and roadmap. Start
					building later after review.
				</span>
			</span>
		</label>
	);
}
