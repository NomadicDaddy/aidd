type ActionPanelProps = {
	compact?: boolean;
	danger?: boolean;
	hideIcon?: boolean;
	primary?: boolean;
	showActions?: boolean;
	title: string;
};

export function ActionPanel(props: ActionPanelProps) {
	const className = [
		'panel',
		props.compact ? 'panel-compact' : 'panel-roomy',
		props.danger ? 'panel-danger' : 'panel-neutral',
		props.primary ? 'panel-primary' : 'panel-secondary',
		props.showActions === false ? 'panel-passive' : 'panel-active',
	].join(' ');

	return (
		<section className={className}>
			<h2>{props.title}</h2>
			{props.hideIcon ? null : <span>!</span>}
			<button type="button">Run</button>
		</section>
	);
}
