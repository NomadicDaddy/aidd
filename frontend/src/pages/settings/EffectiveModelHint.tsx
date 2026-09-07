export function EffectiveModelHint({ model, text }: { model: string; text: string }) {
	const offset = text.indexOf(model);
	if (offset < 0) return text;
	return (
		<>
			{text.slice(0, offset)}
			<span className="font-mono">{model}</span>
			{text.slice(offset + model.length)}
		</>
	);
}
