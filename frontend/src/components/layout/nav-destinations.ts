/**
 * Icon-free primary navigation registry.
 *
 * Keep route identity and order here so non-React consumers, including the documentation manifest,
 * can follow the shell without importing icon components.
 */
export const NAV_DESTINATION_GROUPS = [
	{
		items: [
			{ label: 'Dashboard', to: '/' },
			{ label: 'Projects', to: '/projects' },
		],
		label: 'Overview',
	},
	{
		items: [
			{ label: 'Director', to: '/director' },
			{ label: 'Runs', to: '/runs' },
			{ label: 'Scheduled', to: '/scheduled' },
			{ label: 'Diary', to: '/diary' },
		],
		label: 'Activity',
	},
	{
		items: [
			{ label: 'Recipes', to: '/recipes' },
			{ label: 'Skills', to: '/skills' },
			{ label: 'Audits', to: '/audits' },
		],
		label: 'Catalog',
	},
	{
		items: [
			{ label: 'Telemetry', to: '/telemetry' },
			{ label: 'Settings', to: '/settings' },
			{ label: 'Docs', to: '/docs' },
			{ label: 'About', to: '/about' },
		],
		label: 'System',
	},
] as const;

export type NavDestination = (typeof NAV_DESTINATION_GROUPS)[number]['items'][number];
export type NavDestinationPath = NavDestination['to'];

export const NAV_DESTINATIONS: readonly NavDestination[] = NAV_DESTINATION_GROUPS.flatMap(
	(group): NavDestination[] => [...group.items],
);
