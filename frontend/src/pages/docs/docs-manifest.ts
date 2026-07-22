/**
 * Registry of in-app documentation sections. Pure data with no Vite or React
 * dependencies so it can be imported by both the frontend and bun tests.
 *
 * The `slug` matches a markdown file at `frontend/content/docs/<slug>.md`, and
 * the optional `route` links a section to the app page it documents — driving
 * both the DocsPage sidebar order and the per-page contextual help trigger.
 *
 * Coverage is intentionally partial: only the routes listed here carry a
 * `helpSlug` and a `?` button. The Docs page itself, the Diary, and About have
 * no entry on purpose — Docs is this documentation, and Diary/About are simple
 * reference views. `getting-started.md` calls out these exceptions so the help
 * copy never claims every page has a `?` button.
 */

export type DocGroup = 'Getting started' | 'Pages' | 'Reference';

export interface DocSection {
	group: DocGroup;
	route?: string;
	slug: string;
	title: string;
}

export const DOC_SECTIONS: DocSection[] = [
	{ group: 'Getting started', slug: 'getting-started', title: 'Getting started' },
	{ group: 'Pages', route: '/', slug: 'dashboard', title: 'Dashboard' },
	{ group: 'Pages', route: '/projects', slug: 'projects', title: 'Projects' },
	{ group: 'Pages', route: '/runs', slug: 'runs', title: 'Runs' },
	{ group: 'Pages', route: '/pipeline-sessions', slug: 'pipelines', title: 'Pipeline sessions' },
	{ group: 'Pages', route: '/director', slug: 'director', title: 'Director' },
	{ group: 'Pages', route: '/audits', slug: 'audits', title: 'Audits' },
	{ group: 'Pages', route: '/skills', slug: 'skills', title: 'Skills' },
	{ group: 'Pages', route: '/recipes', slug: 'recipes', title: 'Recipes' },
	{ group: 'Pages', route: '/telemetry', slug: 'telemetry', title: 'Telemetry' },
	{ group: 'Pages', route: '/settings', slug: 'settings', title: 'Settings' },
	{ group: 'Reference', slug: 'faq', title: 'FAQ' },
	{ group: 'Reference', slug: 'glossary', title: 'Glossary' },
];

export const DOC_GROUP_ORDER: DocGroup[] = ['Getting started', 'Pages', 'Reference'];

export const DEFAULT_DOC_SLUG = 'getting-started';

/** Find a section by its slug. */
export function docSectionBySlug(slug: string): DocSection | undefined {
	return DOC_SECTIONS.find((section) => section.slug === slug);
}
