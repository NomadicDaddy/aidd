import type { ComponentType, SVGProps } from 'react';

import { default as BarChart3 } from 'lucide-react/dist/esm/icons/bar-chart-3';
import { default as BookOpen } from 'lucide-react/dist/esm/icons/book-open';
import { default as Bot } from 'lucide-react/dist/esm/icons/bot';
import { default as CalendarClock } from 'lucide-react/dist/esm/icons/calendar-clock';
import { default as FolderKanban } from 'lucide-react/dist/esm/icons/folder-kanban';
import { default as Info } from 'lucide-react/dist/esm/icons/info';
import { default as LayoutDashboard } from 'lucide-react/dist/esm/icons/layout-dashboard';
import { default as NotebookPen } from 'lucide-react/dist/esm/icons/notebook-pen';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as ScrollText } from 'lucide-react/dist/esm/icons/scroll-text';
import { default as Settings } from 'lucide-react/dist/esm/icons/settings';
import { default as ShieldCheck } from 'lucide-react/dist/esm/icons/shield-check';
import { default as Wrench } from 'lucide-react/dist/esm/icons/wrench';

import { NAV_DESTINATION_GROUPS, type NavDestinationPath } from './nav-destinations.ts';

export type NavItem = {
	icon: ComponentType<SVGProps<SVGSVGElement>>;
	label: string;
	to: NavDestinationPath;
};

export type NavGroup = {
	items: NavItem[];
	label: string;
};

const iconByPath = {
	'/': LayoutDashboard,
	'/about': Info,
	'/audits': ShieldCheck,
	'/diary': NotebookPen,
	'/director': Bot,
	'/docs': BookOpen,
	'/projects': FolderKanban,
	'/recipes': ScrollText,
	'/runs': Play,
	'/scheduled': CalendarClock,
	'/settings': Settings,
	'/skills': Wrench,
	'/telemetry': BarChart3,
} satisfies Record<NavDestinationPath, ComponentType<SVGProps<SVGSVGElement>>>;

// Icon-bearing view of the shared primary-navigation registry. Consumed by the sidebar
// (AppLayout) and the global command palette so both expose the same destinations without
// drifting, while icon-free consumers can use the registry directly.
//
// Every glyph here is unique: in the collapsed rail the icon is the only label, so two
// destinations sharing one (Diary and Docs both on BookOpen) are two unlabelled buttons that
// look the same. `nav-glyph-uniqueness.test.ts` keeps it that way.
export const navGroups: NavGroup[] = NAV_DESTINATION_GROUPS.map((group) => ({
	items: group.items.map((item) => ({ ...item, icon: iconByPath[item.to] })),
	label: group.label,
}));
