import { useQueryClient } from '@tanstack/react-query';
import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as KeyRound } from 'lucide-react/dist/esm/icons/key-round';
import { default as Moon } from 'lucide-react/dist/esm/icons/moon';
import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { default as Sun } from 'lucide-react/dist/esm/icons/sun';
import { type ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { useActiveExecutionCount } from '../../hooks/useActiveRunCount.ts';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.ts';
import { cn } from '../../lib/cn.ts';
import { commandPaletteShortcut, shortcutText } from '../../lib/keyboardShortcuts.ts';
import { useAuthTokenStore } from '../../stores/authTokenStore.ts';
import { useSidebarStore } from '../../stores/sidebarStore.ts';
import { useTerminalStore } from '../../stores/terminalStore.ts';
import { useThemeStore } from '../../stores/themeStore.ts';
import { AuthTokenDialog } from '../shared/AuthTokenDialog.tsx';
import { CommandPalette } from '../shared/CommandPalette.tsx';
import { DirectiveLaunchModal } from '../shared/DirectiveLaunchModal.tsx';
import { DirectorChatModal } from '../shared/DirectorChatModal.tsx';
import { ShortcutChord } from '../shared/KeyboardShortcut.tsx';
import { ShortcutsOverlay } from '../shared/ShortcutsOverlay.tsx';
import { TerminalPane } from '../terminal/TerminalPane.tsx';
import { Button, IconButton } from '../ui/button.tsx';
import {
	activeExecutionCountAccessibleName,
	searchControlAccessibleName,
} from './appLayoutAccessibility.ts';
import { DirectiveLaunchButton } from './DirectiveLaunchButton.tsx';
import { navGroups } from './nav-items.ts';
import { ProjectReportButton } from './ProjectReportButton.tsx';
import { ProjectsNavDropdown } from './ProjectsNavDropdown.tsx';

export function AppLayout({ children }: { children: ReactNode }) {
	const collapsed = useSidebarStore((state) => state.collapsed);
	const toggle = useSidebarStore((state) => state.toggle);
	const themeMode = useThemeStore((state) => state.mode);
	const setThemeMode = useThemeStore((state) => state.setMode);
	const toggleThemeMode = () => setThemeMode(themeMode === 'dark' ? 'light' : 'dark');
	const ThemeIcon = themeMode === 'dark' ? Sun : Moon;
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const [directorChatOpen, setDirectorChatOpen] = useState(false);
	const [directiveLaunchOpen, setDirectiveLaunchOpen] = useState(false);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const openAuthPrompt = useAuthTokenStore((state) => state.openPrompt);
	// Standalone running runs + active pipeline sessions, each execution counted once.
	const activeExecutionCount = useActiveExecutionCount();

	useKeyboardShortcuts({
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		onNavigate: (to) => navigate(to),
		onOpenDirective: () => setDirectiveLaunchOpen(true),
		onOpenDirectorChat: () => setDirectorChatOpen(true),
		onRefresh: () => {
			void queryClient.invalidateQueries();
			toast.success('Refreshing data…');
		},
		onShowShortcuts: () => setShortcutsOpen(true),
		onToggleTerminal: () => useTerminalStore.getState().toggleOpen(),
	});

	return (
		<>
			<div className="app-shell min-h-screen" id="app-shell">
				<a
					className="sr-only z-50 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
					href="#main-content">
					Skip to Content
				</a>
				<aside
					className={cn(
						'border-border/60 bg-card/70 p-3 backdrop-blur-xl',
						'sticky top-0 z-20 border-b sm:fixed sm:inset-y-0 sm:left-0 sm:flex sm:flex-col sm:border-r sm:border-b-0',
						'transition-[width] duration-200',
						collapsed ? 'sm:w-16' : 'sm:w-60',
					)}>
					<div className="flex items-center justify-between gap-2 sm:contents">
						<div
							className={cn(
								'flex min-w-0 flex-1 items-center gap-2 sm:mb-5 sm:flex-none',
								collapsed ? 'sm:flex-col sm:gap-2' : 'sm:justify-between sm:gap-3',
							)}>
							<div className="flex min-w-0 items-center gap-2">
								<img
									alt=""
									className="h-10 w-10 shrink-0 rounded-lg ring-1 ring-border/40"
									src="/favicon-96x96.png"
								/>
								<div
									className={cn(
										'min-w-0 truncate font-display text-base font-semibold tracking-[0.18em] text-foreground',
										collapsed && 'sm:hidden',
									)}
									translate="no">
									aidd
								</div>
							</div>
							<div className="hidden sm:block">
								<IconButton ariaLabel="Toggle navigation" onClick={toggle}>
									<Activity className="h-4 w-4" />
								</IconButton>
							</div>
						</div>
						<div className="flex shrink-0 gap-0.5 sm:order-last sm:mt-3 sm:flex-col sm:gap-1.5 sm:border-t sm:border-border/60 sm:pt-3 max-sm:[&_button]:h-8 max-sm:[&_button]:w-8">
							<div className="sm:hidden">
								<IconButton
									aria-keyshortcuts={commandPaletteShortcut.ariaKeyShortcuts}
									ariaLabel="Open command palette"
									onClick={() => setPaletteOpen(true)}
									variant="ghost">
									<Search className="h-4 w-4" />
								</IconButton>
							</div>
							<DirectiveLaunchButton
								collapsed={collapsed}
								onClick={() => setDirectiveLaunchOpen(true)}
							/>
							<ProjectReportButton collapsed={collapsed} />
							<Button
								aria-label="Set access token"
								className={cn(
									'px-0',
									collapsed ? 'w-10' : 'w-10 sm:w-full sm:justify-start sm:px-3',
								)}
								onClick={openAuthPrompt}
								variant="ghost">
								<KeyRound className="h-4 w-4" />
								{!collapsed && (
									<span className="hidden text-sm font-medium sm:inline">
										Access token
									</span>
								)}
							</Button>
							<Button
								aria-label={
									themeMode === 'dark'
										? 'Switch to light mode'
										: 'Switch to dark mode'
								}
								className={cn(
									'px-0',
									collapsed ? 'w-10' : 'w-10 sm:w-full sm:justify-start sm:px-3',
								)}
								onClick={toggleThemeMode}
								variant="ghost">
								<ThemeIcon className="h-4 w-4" />
								{!collapsed && (
									<span className="hidden text-sm font-medium sm:inline">
										{themeMode === 'dark' ? 'Light mode' : 'Dark mode'}
									</span>
								)}
							</Button>
						</div>
					</div>
					<div className="hidden sm:block">
						<Button
							aria-keyshortcuts={commandPaletteShortcut.ariaKeyShortcuts}
							aria-label={searchControlAccessibleName(collapsed)}
							className={cn(
								collapsed
									? 'sm:w-10 sm:justify-center sm:px-0'
									: 'sm:mb-3 sm:w-full sm:justify-start sm:px-3',
							)}
							onClick={() => setPaletteOpen(true)}
							title={`Search (command palette, ${shortcutText(
								commandPaletteShortcut.keys,
							)})`}
							variant="secondary">
							<Search className="h-4 w-4 shrink-0" />
							{!collapsed && (
								<>
									<span className="hidden text-muted-foreground sm:inline">
										Search…
									</span>
									<ShortcutChord
										className="ml-auto hidden sm:inline-flex"
										keyClassName="h-5 min-w-5 rounded px-1 text-[0.62rem]"
										keys={commandPaletteShortcut.keys}
									/>
								</>
							)}
						</Button>
					</div>
					<nav
						aria-label="Primary"
						className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:mt-0 sm:block sm:min-h-0 sm:flex-1 sm:space-y-0.5 sm:overflow-x-visible sm:overflow-y-auto sm:px-0 sm:pr-1 sm:pb-0">
						{navGroups.map((group, groupIndex) => (
							<div className="contents sm:block" key={group.label}>
								{!collapsed && (
									<div
										className={cn(
											'hidden px-3 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase sm:block',
											groupIndex === 0 ? 'mt-0' : 'mt-5',
											'mb-1.5',
										)}>
										{group.label}
									</div>
								)}
								{collapsed && groupIndex > 0 && (
									<div className="mx-auto my-2 hidden h-px w-6 rounded-full bg-border/60 sm:block" />
								)}
								{group.items.map((item) =>
									item.to === '/projects' ? (
										<ProjectsNavDropdown collapsed={collapsed} key={item.to} />
									) : (
										<NavLink
											className={({ isActive }) =>
												cn(
													'group relative flex h-11 w-11 shrink-0 items-center justify-center gap-2.5 rounded-lg px-0 text-sm font-medium sm:h-9 sm:w-auto sm:justify-start sm:px-3',
													'transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
													isActive
														? 'bg-accent-muted text-accent-muted-foreground shadow-sm dark:bg-accent-muted dark:text-accent-muted-foreground'
														: 'text-muted-foreground hover:bg-muted hover:text-foreground',
												)
											}
											key={item.to}
											title={item.label}
											to={item.to}>
											{({ isActive }) => (
												<>
													<span
														aria-hidden="true"
														className={cn(
															'absolute top-1.5 left-0 hidden h-6 w-[3px] rounded-full bg-accent transition-opacity sm:block',
															isActive ? 'opacity-100' : 'opacity-0',
														)}
													/>
													<item.icon className="h-4 w-4 shrink-0" />
													<span
														className={
															collapsed
																? 'sr-only'
																: 'sr-only sm:not-sr-only sm:inline'
														}>
														{item.label}
													</span>
													{item.to === '/runs' &&
														activeExecutionCount > 0 && (
															<span
																aria-label={activeExecutionCountAccessibleName(
																	activeExecutionCount,
																)}
																className={cn(
																	'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-100 px-1 text-[0.62rem] font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
																	collapsed
																		? 'hidden'
																		: 'ml-auto hidden sm:inline-flex',
																)}>
																{activeExecutionCount}
															</span>
														)}
												</>
											)}
										</NavLink>
									),
								)}
							</div>
						))}
					</nav>
				</aside>
				{/* tabIndex={-1} makes the landmark a programmatic focus target for the
				    route-change focus reset in App.tsx's RootLayout (and the Skip to Content link).
				    focus:outline-none suppresses the ring on that scripted focus — the heuristic
				    :focus-visible ring still appears for genuine keyboard focus. */}
				<main
					className={cn(
						'command-surface min-w-0 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-[padding] duration-200 focus:outline-none sm:min-h-screen sm:p-6 sm:pb-6',
						collapsed ? 'sm:pl-[5.5rem]' : 'sm:pl-[16.5rem]',
					)}
					id="main-content"
					tabIndex={-1}>
					{children}
				</main>
			</div>
			<AuthTokenDialog />
			<CommandPalette
				onOpenChange={setPaletteOpen}
				onOpenDirective={() => setDirectiveLaunchOpen(true)}
				open={paletteOpen}
			/>
			<DirectiveLaunchModal
				onClose={() => setDirectiveLaunchOpen(false)}
				open={directiveLaunchOpen}
			/>
			<DirectorChatModal onClose={() => setDirectorChatOpen(false)} open={directorChatOpen} />
			<ShortcutsOverlay onClose={() => setShortcutsOpen(false)} open={shortcutsOpen} />
			<TerminalPane />
		</>
	);
}
