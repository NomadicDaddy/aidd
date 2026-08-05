import type { ComponentType, SVGProps } from 'react';

import { default as BarChart3 } from 'lucide-react/dist/esm/icons/bar-chart-3';
import { default as BookOpen } from 'lucide-react/dist/esm/icons/book-open';
import { default as Bot } from 'lucide-react/dist/esm/icons/bot';
import { default as FolderKanban } from 'lucide-react/dist/esm/icons/folder-kanban';
import { default as Info } from 'lucide-react/dist/esm/icons/info';
import { default as LayoutDashboard } from 'lucide-react/dist/esm/icons/layout-dashboard';
import { default as NotebookPen } from 'lucide-react/dist/esm/icons/notebook-pen';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as ScrollText } from 'lucide-react/dist/esm/icons/scroll-text';
import { default as Settings } from 'lucide-react/dist/esm/icons/settings';
import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';
import { default as Wrench } from 'lucide-react/dist/esm/icons/wrench';

export type NavItem = {
	icon: ComponentType<SVGProps<SVGSVGElement>>;
	label: string;
	to: string;
};

export type NavGroup = {
	items: NavItem[];
	label: string;
};

// Single source of truth for the control-panel's primary navigation. Consumed by
// the sidebar (AppLayout) and the global command palette so both expose the same
// destinations without drifting.
//
// Every glyph here is unique: in the collapsed rail the icon is the only label, so two
// destinations sharing one (Diary and Docs both on BookOpen) are two unlabelled buttons that
// look the same. `nav-glyph-uniqueness.test.ts` keeps it that way.
export const navGroups: NavGroup[] = [
	{
		items: [
			{ icon: LayoutDashboard, label: 'Dashboard', to: '/' },
			{ icon: FolderKanban, label: 'Projects', to: '/projects' },
		],
		label: 'Overview',
	},
	{
		items: [
			{ icon: Bot, label: 'Director', to: '/director' },
			{ icon: Play, label: 'Runs', to: '/runs' },
			{ icon: NotebookPen, label: 'Diary', to: '/diary' },
		],
		label: 'Activity',
	},
	{
		items: [
			{ icon: ScrollText, label: 'Recipes', to: '/recipes' },
			{ icon: Wrench, label: 'Skills', to: '/skills' },
			{ icon: ShieldCheck, label: 'Audits', to: '/audits' },
		],
		label: 'Catalog',
	},
	{
		items: [
			{ icon: BarChart3, label: 'Telemetry', to: '/telemetry' },
			{ icon: Settings, label: 'Settings', to: '/settings' },
			{ icon: BookOpen, label: 'Docs', to: '/docs' },
			{ icon: Info, label: 'About', to: '/about' },
		],
		label: 'System',
	},
];
