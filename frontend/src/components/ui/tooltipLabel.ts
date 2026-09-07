import type { ReactNode } from 'react';

import { isValidElement } from 'react';

interface TooltipLabelTrigger {
	'aria-label'?: string | undefined;
	children?: ReactNode;
}

function textFromNode(node: ReactNode): string {
	if (typeof node === 'string' || typeof node === 'number') return String(node);
	if (Array.isArray(node)) return node.map(textFromNode).join(' ');
	if (isValidElement<{ children?: ReactNode }>(node)) return textFromNode(node.props.children);
	return '';
}

export function disabledTooltipLabel(
	triggerProps: TooltipLabelTrigger,
	content: ReactNode,
): null | string {
	if (typeof content !== 'string') return null;
	const reason = content.trim();
	if (!reason) return null;
	const triggerName =
		triggerProps['aria-label']?.trim() || textFromNode(triggerProps.children).trim();
	if (triggerName.toLocaleLowerCase() === reason.toLocaleLowerCase()) return null;
	return triggerName ? `${triggerName}. Unavailable: ${reason}` : `Unavailable: ${reason}`;
}
