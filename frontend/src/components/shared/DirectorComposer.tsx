import { default as Send } from 'lucide-react/dist/esm/icons/send';
import { type RefObject, useEffect, useRef } from 'react';

import { cn } from '../../lib/cn.ts';
import { fieldLabelClass, textareaClass } from '../../lib/formStyles.ts';
import { Button } from '../ui/button.tsx';
import { ShortcutChord } from './KeyboardShortcut.tsx';

const DIRECTOR_COMPOSER_PLACEHOLDER = 'Tell the Director what to focus on…';
const MAX_COMPOSER_HEIGHT_PX = 112;

export function DirectorComposer({
	ariaLabel,
	canSubmit,
	className,
	composerRef,
	disabled,
	id,
	label,
	onChange,
	onSubmit,
	placement,
	submitLabel,
	value,
}: {
	ariaLabel: string;
	canSubmit: boolean;
	className?: string;
	composerRef?: RefObject<HTMLTextAreaElement | null>;
	disabled: boolean;
	id: string;
	label?: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	placement: 'chat' | 'inline';
	submitLabel: string;
	value: string;
}) {
	const internalComposerRef = useRef<HTMLTextAreaElement>(null);
	const resolvedComposerRef = composerRef ?? internalComposerRef;
	const hintId = `${id}-hint`;
	const submitEnabled = canSubmit && !disabled;

	useEffect(() => {
		const composer = resolvedComposerRef.current;
		if (!composer) return;
		composer.style.height = 'auto';
		const borderHeight = composer.offsetHeight - composer.clientHeight;
		composer.style.height = `${Math.min(
			composer.scrollHeight + borderHeight,
			MAX_COMPOSER_HEIGHT_PX,
		)}px`;
	}, [resolvedComposerRef, value]);

	return (
		<div
			className={cn(
				placement === 'chat' ? 'border-t border-border p-3' : 'space-y-1',
				className,
			)}>
			{label ? (
				<label className={fieldLabelClass} htmlFor={id}>
					{label}
				</label>
			) : null}
			<div className="flex min-w-0 items-end gap-2">
				<textarea
					aria-describedby={hintId}
					aria-label={ariaLabel}
					className={cn(
						textareaClass,
						'max-h-28 min-h-11 flex-1 resize-none sm:min-h-9 sm:py-1',
					)}
					disabled={disabled}
					id={id}
					onChange={(event) => onChange(event.target.value)}
					onKeyDown={(event) => {
						if (
							event.nativeEvent.isComposing ||
							event.key !== 'Enter' ||
							event.shiftKey ||
							!submitEnabled
						)
							return;
						event.preventDefault();
						onSubmit();
					}}
					placeholder={DIRECTOR_COMPOSER_PLACEHOLDER}
					ref={resolvedComposerRef}
					rows={1}
					value={value}
				/>
				<Button disabled={!submitEnabled} onClick={onSubmit} variant="primary">
					<Send className="h-4 w-4" />
					{submitLabel}
				</Button>
			</div>
			<p
				className="mt-1.5 flex flex-wrap items-center gap-1 text-2xs text-muted-foreground"
				id={hintId}>
				<ShortcutChord keyClassName="h-5 min-w-5 px-1" keys={['Enter']} />
				<span>to submit ·</span>
				<ShortcutChord keyClassName="h-5 min-w-5 px-1" keys={['Shift', 'Enter']} />
				<span>for a new line</span>
			</p>
		</div>
	);
}
