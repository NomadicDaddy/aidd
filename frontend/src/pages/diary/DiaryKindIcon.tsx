import { default as Bot } from 'lucide-react/dist/esm/icons/bot';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as ScrollText } from 'lucide-react/dist/esm/icons/scroll-text';
import { default as Tag } from 'lucide-react/dist/esm/icons/tag';
import { default as Wrench } from 'lucide-react/dist/esm/icons/wrench';

import type { DiaryTimelineKind } from '../../api/types.ts';

export function DiaryKindIcon({ kind }: { kind: DiaryTimelineKind }) {
	const className = 'h-3 w-3';
	switch (kind) {
		case 'director-cycle':
			return <Bot aria-hidden="true" className={className} />;
		case 'recipe-session':
			return <ScrollText aria-hidden="true" className={className} />;
		case 'release':
			return <Tag aria-hidden="true" className={className} />;
		case 'run':
			return <Play aria-hidden="true" className={className} />;
		case 'skill':
			return <Wrench aria-hidden="true" className={className} />;
	}
}
