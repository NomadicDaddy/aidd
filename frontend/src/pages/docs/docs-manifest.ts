/**
 * Registry of in-app documentation sections. Pure data with no Vite or React
 * dependencies so it can be imported by both the frontend and bun tests.
 *
 * The `slug` matches a markdown file at `frontend/content/docs/<slug>.md`, and
 * the optional `route` links a section to the app page it documents — driving
 * the docs corpus order and the per-page contextual help trigger.
 *
 * Coverage is intentionally partial: only the routes listed here carry a
 * `helpSlug` and a `?` button. The Docs page itself, the Diary, and About have
 * no entry on purpose — Docs is this documentation, and Diary/About are simple
 * reference views. `getting-started.md` calls out these exceptions so the help
 * copy never claims every page has a `?` button.
 */

import {
	NAV_DESTINATION_GROUPS,
	type NavDestinationPath,
} from '../../components/layout/nav-destinations.ts';

type ShellNavGroup = (typeof NAV_DESTINATION_GROUPS)[number]['label'];

export type DocGroup = 'Getting started' | 'Reference' | ShellNavGroup;

export interface DocSection {
	group: DocGroup;
	route?: string;
	slug: string;
	title: string;
}

const PAGE_DOC_SLUG_BY_ROUTE: Partial<Record<NavDestinationPath, string>> = {
	'/': 'dashboard',
	'/audits': 'audits',
	'/director': 'director',
	'/projects': 'projects',
	'/recipes': 'recipes',
	'/runs': 'runs',
	'/scheduled': 'scheduled-tasks',
	'/settings': 'settings',
	'/skills': 'skills',
	'/telemetry': 'telemetry',
};

const PAGE_DOC_SECTIONS = NAV_DESTINATION_GROUPS.flatMap<DocSection>((group) =>
	group.items.flatMap<DocSection>((destination) => {
		const slug = PAGE_DOC_SLUG_BY_ROUTE[destination.to];
		if (!slug) return [];

		const sections: DocSection[] = [
			{ group: group.label, route: destination.to, slug, title: destination.label },
		];
		if (destination.to === '/runs') {
			// The list page merged into Runs. This docs-only entry remains beside that destination and
			// backs the contextual help on individual pipeline-session reports.
			sections.push({ group: group.label, slug: 'pipelines', title: 'Pipeline sessions' });
		}
		return sections;
	}),
);

export const DOC_SECTIONS: DocSection[] = [
	{ group: 'Getting started', slug: 'getting-started', title: 'Getting started' },
	...PAGE_DOC_SECTIONS,
	{ group: 'Overview', slug: 'profile-matrix', title: 'Profile Matrix' },
	{ group: 'Reference', slug: 'faq', title: 'FAQ' },
	{ group: 'Reference', slug: 'glossary', title: 'Glossary' },
];

export const DOC_GROUP_ORDER: DocGroup[] = [
	'Getting started',
	...NAV_DESTINATION_GROUPS.map((group) => group.label),
	'Reference',
];

/**
 * Documentation-owned destinations that earn space beside an article.
 *
 * Page documentation remains in {@link DOC_SECTIONS} for contextual help and pagination, but the
 * application shell already exposes those destinations. Repeating them in this rail creates a
 * second application map whose identical labels lead somewhere else.
 */
export const DOCS_SIDEBAR_GROUPS = [
	{ label: 'Guides', slugs: ['getting-started', 'pipelines'] },
	{ label: 'Reference', slugs: ['faq', 'glossary'] },
] as const;

export const DEFAULT_DOC_SLUG = 'getting-started';

/** Find a section by its slug. */
export function docSectionBySlug(slug: string): DocSection | undefined {
	return DOC_SECTIONS.find((section) => section.slug === slug);
}
