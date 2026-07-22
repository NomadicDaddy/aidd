import { useQueryClient } from '@tanstack/react-query';
import { default as Activity } from 'lucide-react/dist/esm/icons/activity';
import { default as KeyRound } from 'lucide-react/dist/esm/icons/key-round';
import { default as Moon } from 'lucide-react/dist/esm/icons/moon';
import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { default as Sun } from 'lucide-react/dist/esm/icons/sun';
import { type ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { useActiveRunCount } from '../../hooks/useActiveRunCount.ts';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.ts';
import { useActivePipelineSessionCount } from '../../hooks/usePipelineSessions.ts';
import { cn } from '../../lib/cn.ts';
import { commandPaletteShortcut, shortcutText } from '../../lib/keyboardShortcuts.ts';
import { useAuthTokenStore } from '../../stores/authTokenStore.ts';
import { useSidebarStore } from '../../stores/sidebarStore.ts';
import { useTerminalStore } from '../../stores/terminalStore.ts';
import { useThemeStore } from '../../stores/themeStore.ts';
import { AuthTokenDialog } from '../shared/AuthTokenDialog.tsx';
import { CommandPalette } from '../shared/CommandPalette.tsx';
import { DirectorChatModal } from '../shared/DirectorChatModal.tsx';
import { ShortcutChord } from '../shared/KeyboardShortcut.tsx';
import { ShortcutsOverlay } from '../shared/ShortcutsOverlay.tsx';
import { TerminalPane } from '../terminal/TerminalPane.tsx';
import { Button, IconButton } from '../ui/button.tsx';
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
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const openAuthPrompt = useAuthTokenStore((state) => state.openPrompt);
	const activePipelineCount = useActivePipelineSessionCount();
	const activeRunCount = useActiveRunCount();

	useKeyboardShortcuts({
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		onNavigate: (to) => navigate(to),
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
					className="sr-only z-50 rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
					href="#main-content">
					Skip to Content
				</a>
				<aside
					className={cn(
						'border-neutral-200 bg-white/88 p-3 shadow-sm backdrop-blur-xl dark:border-cyan-950/50 dark:bg-slate-950/88',
						'sticky top-0 z-20 border-b sm:fixed sm:inset-y-0 sm:left-0 sm:flex sm:flex-col sm:border-r sm:border-b-0',
						'transition-[width] duration-200',
						collapsed ? 'sm:w-16' : 'sm:w-60'
					)}>
					<div className="flex min-h-10 items-center justify-between gap-3 sm:mb-5">
						<div className="flex min-w-0 shrink-0 items-center gap-2">
							<img
								alt=""
								className="h-10 w-10 shrink-0 rounded"
								src="/favicon-96x96.png"
							/>
							{!collapsed && (
								<div
									className="text-base font-semibold tracking-[0.18em] text-neutral-950 dark:text-neutral-50"
									translate="no">
									aidd
								</div>
							)}
						</div>
						<div className="hidden sm:block">
							<IconButton ariaLabel="Toggle navigation" onClick={toggle}>
								<Activity className="h-4 w-4" />
							</IconButton>
						</div>
					</div>
					<div className="hidden sm:block">
						<Button
							aria-keyshortcuts={commandPaletteShortcut.ariaKeyShortcuts}
							aria-label="Open command palette"
							className={cn(
								'bg-white/60 text-neutral-600 hover:text-cyan-900 dark:border-cyan-950/50 dark:bg-slate-950/40 dark:text-neutral-400 dark:hover:text-cyan-100',
								collapsed
									? 'sm:w-10 sm:justify-center sm:px-0'
									: 'sm:mb-3 sm:w-full sm:justify-start sm:px-3'
							)}
							onClick={() => setPaletteOpen(true)}
							title={`Search (command palette, ${shortcutText(
								commandPaletteShortcut.keys
							)})`}
							variant="secondary">
							<Search className="h-4 w-4 shrink-0" />
							{!collapsed && (
								<>
									<span className="hidden sm:inline">Search…</span>
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
						className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:mt-0 sm:block sm:min-h-0 sm:flex-1 sm:space-y-1 sm:overflow-x-visible sm:overflow-y-auto sm:px-0 sm:pr-1 sm:pb-0">
						{navGroups.map((group, groupIndex) => (
							<div className="contents sm:block" key={group.label}>
								{!collapsed && (
									<div
										className={cn(
											'hidden px-3 text-[0.65rem] font-semibold tracking-wider text-neutral-500 uppercase sm:block dark:text-neutral-500',
											groupIndex === 0 ? 'mt-0' : 'mt-4',
											'mb-1'
										)}>
										{group.label}
									</div>
								)}
								{group.items.map((item) =>
									item.to === '/projects' ? (
										<ProjectsNavDropdown collapsed={collapsed} key={item.to} />
									) : (
										<NavLink
											aria-label={item.label}
											className={({ isActive }) =>
												cn(
													'group relative flex h-10 w-10 shrink-0 items-center justify-center gap-3 rounded-md px-0 text-sm font-medium sm:w-auto sm:justify-start sm:px-3',
													'transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-cyan-300 dark:focus-visible:ring-offset-slate-950',
													isActive
														? 'bg-slate-950 text-white shadow-sm shadow-cyan-950/10 dark:bg-cyan-400 dark:text-slate-950'
														: 'text-neutral-700 hover:bg-cyan-50 hover:text-cyan-950 dark:text-neutral-300 dark:hover:bg-cyan-950/30 dark:hover:text-cyan-100'
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
															'absolute top-2 left-0 hidden h-6 w-0.5 rounded-full bg-cyan-400 transition-opacity sm:block',
															isActive ? 'opacity-100' : 'opacity-0'
														)}
													/>
													<item.icon className="h-4 w-4 shrink-0" />
													<span
														className={
															collapsed
																? 'hidden'
																: 'hidden sm:inline'
														}>
														{item.label}
													</span>
													{item.to === '/pipeline-sessions' &&
														activePipelineCount > 0 && (
															<span
																aria-label={`${activePipelineCount} active pipeline ${activePipelineCount === 1 ? 'session' : 'sessions'}`}
																className={cn(
																	'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-cyan-100 px-1 text-[0.62rem] font-bold text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200',
																	collapsed
																		? 'hidden'
																		: 'ml-auto hidden sm:inline-flex'
																)}>
																{activePipelineCount}
															</span>
														)}
													{item.to === '/runs' && activeRunCount > 0 && (
														<span
															aria-label={`${activeRunCount} active ${activeRunCount === 1 ? 'run' : 'runs'}`}
															className={cn(
																'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-cyan-100 px-1 text-[0.62rem] font-bold text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200',
																collapsed
																	? 'hidden'
																	: 'ml-auto hidden sm:inline-flex'
															)}>
															{activeRunCount}
														</span>
													)}
												</>
											)}
										</NavLink>
									)
								)}
							</div>
						))}
					</nav>
					<div className="absolute top-3 right-3 flex gap-2 sm:static sm:mt-3 sm:shrink-0 sm:flex-col sm:gap-2 sm:border-t sm:border-neutral-200 sm:pt-3 sm:dark:border-cyan-950/50">
						<div className="sm:hidden">
							<IconButton
								aria-keyshortcuts={commandPaletteShortcut.ariaKeyShortcuts}
								ariaLabel="Open command palette"
								onClick={() => setPaletteOpen(true)}
								variant="ghost">
								<Search className="h-4 w-4" />
							</IconButton>
						</div>
						<ProjectReportButton collapsed={collapsed} />
						<Button
							aria-label="Set access token"
							className={cn(
								'px-0',
								collapsed ? 'w-10' : 'w-10 sm:w-full sm:justify-start sm:px-3'
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
								collapsed ? 'w-10' : 'w-10 sm:w-full sm:justify-start sm:px-3'
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
				</aside>
				{/* tabIndex={-1} makes the landmark a programmatic focus target for the
				    route-change focus reset in App.tsx's RootLayout (and the Skip to Content link).
				    focus:outline-none suppresses the ring on that scripted focus — the heuristic
				    :focus-visible ring still appears for genuine keyboard focus. */}
				<main
					className={cn(
						'command-surface min-w-0 px-4 py-5 transition-[padding] duration-200 focus:outline-none sm:min-h-screen sm:p-6',
						collapsed ? 'sm:pl-[5.5rem]' : 'sm:pl-[16.5rem]'
					)}
					id="main-content"
					tabIndex={-1}>
					{children}
				</main>
			</div>
			<AuthTokenDialog />
			<CommandPalette onOpenChange={setPaletteOpen} open={paletteOpen} />
			<DirectorChatModal onClose={() => setDirectorChatOpen(false)} open={directorChatOpen} />
			<ShortcutsOverlay onClose={() => setShortcutsOpen(false)} open={shortcutsOpen} />
			<TerminalPane />
		</>
	);
}
