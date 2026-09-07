import type {
	ReactElement,
	FocusEvent as ReactFocusEvent,
	KeyboardEvent as ReactKeyboardEvent,
	MouseEvent as ReactMouseEvent,
	ReactNode,
} from 'react';

import type { TooltipSide } from './tooltipPlacement.ts';

export interface TooltipTriggerInjectedProps {
	'aria-describedby'?: string | undefined;
	'aria-label'?: string | undefined;
	'aria-labelledby'?: string | undefined;
	children?: ReactNode;
	className?: string | undefined;
	disabled?: boolean | undefined;
	onBlur: (event: ReactFocusEvent<HTMLElement>) => void;
	onClick: (event: ReactMouseEvent<HTMLElement>) => void;
	onFocus: (event: ReactFocusEvent<HTMLElement>) => void;
	onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
	onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => void;
	onMouseLeave: (event: ReactMouseEvent<HTMLElement>) => void;
}

export type TooltipProps = {
	children: ReactElement<Partial<TooltipTriggerInjectedProps>>;
	className?: string;
	content: ReactNode;
	maxWidth?: 'sm' | 'wide' | 'xs';
	side?: TooltipSide;
	touchAlignment?: 'center' | 'start';
	touchTargetMode?: 'flow' | 'overlay';
} & (
	{ disclosure: true; disclosureLabel: string } | { disclosure?: false; disclosureLabel?: never }
);
