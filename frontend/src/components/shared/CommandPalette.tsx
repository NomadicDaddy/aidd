/* eslint-disable @typescript-eslint/no-misused-promises */
import { useQueryClient } from '@tanstack/react-query';
import { default as FolderKanban } from 'lucide-react/dist/esm/icons/folder-kanban';
import { default as Moon } from 'lucide-react/dist/esm/icons/moon';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { default as Sun } from 'lucide-react/dist/esm/icons/sun';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { useProjectNames } from '../../hooks/useProjects.ts';
import { cn } from '../../lib/cn.ts';
import { directiveShortcut, refreshShortcut } from '../../lib/keyboardShortcuts.ts';
import { useThemeStore } from '../../stores/themeStore.ts';
import { navGroups } from '../layout/nav-items.ts';
import { Button } from '../ui/button.tsx';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '../ui/command.tsx';
import { Dialog, DialogPanel } from '../ui/dialog.tsx';
import { highlightedMatch } from './command-palette-match.tsx';
import { NavigationPaletteShortcut, PaletteShortcut } from './CommandPaletteShortcut.tsx';
import { EmptyState } from './EmptyState.tsx';
import { Keycap } from './KeyboardShortcut.tsx';

interface CommandPaletteProps {
	onOpenChange: (open: boolean) => void;
	onOpenDirective: () => void;
	open: boolean;
}

const RESTING_PROJECT_LIMIT = 4;

export function CommandPalette({ onOpenChange, onOpenDirective, open }: CommandPaletteProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const themeMode = useThemeStore((state) => state.mode);
	const setThemeMode = useThemeStore((state) => state.setMode);
	const [listEdge, setListEdge] = useState<'end' | 'middle' | 'start'>('start');
	const [query, setQuery] = useState('');
	const projectsQuery = useProjectNames();
	const projects = (projectsQuery.data?.projects ?? []).filter(
		(project) => !project.name.endsWith('.old'),
	);
	const visibleProjects = query.trim() ? projects : projects.slice(0, RESTING_PROJECT_LIMIT);
	const projectsAreLimited = visibleProjects.length < projects.length;

	// The palette is code-split and mounted on first open, so the Ctrl/Cmd+K that opens it cannot
	// live here — it belongs to the shell (see useKeyboardShortcuts). What is left is the reset,
	// which now runs for every close path including that toggle: adjusting state during render
	// rather than in an effect, so a reopen never flashes the previous query.
	const [wasOpen, setWasOpen] = useState(open);
	if (wasOpen !== open) {
		setWasOpen(open);
		if (!open) {
			setListEdge('start');
			setQuery('');
		}
	}

	const closePalette = () => onOpenChange(false);

	const runAction = (action: () => void) => {
		closePalette();
		action();
	};

	const ThemeIcon = themeMode === 'dark' ? Sun : Moon;

	// Same glyph, same size, same color source as the sidebar: a bordered tile here made the
	// palette read as a different app, and it hard-coded its own light/dark accent pair.
	const commandIconClass =
		'h-4 w-4 shrink-0 text-muted-foreground group-data-[selected=true]:text-accent-muted-foreground';

	return (
		<Dialog
			aria-labelledby="command-palette-title"
			onClose={closePalette}
			open={open}
			overlayClassName="items-start px-3 pt-[8vh] sm:pt-[10vh]"
			role="dialog">
			<DialogPanel className="w-full max-w-2xl overflow-hidden p-0">
				<Command
					className="rounded-xl bg-transparent [&:has([cmdk-empty])_.result-dependent-hint]:opacity-50"
					loop
					onKeyDown={(event) => {
						if (event.key !== 'Escape') return;
						event.preventDefault();
						event.stopPropagation();
						closePalette();
					}}>
					<div className="border-b border-border bg-muted/80 px-4 py-3">
						<div
							className="mb-2 text-base font-semibold text-foreground"
							id="command-palette-title">
							Command palette
						</div>
						<CommandInput
							aria-label="Search commands"
							onValueChange={(value) => {
								setListEdge('start');
								setQuery(value);
							}}
							placeholder="Search navigation, projects, actions…"
							value={query}
						/>
					</div>
					<CommandList
						className={cn(
							'max-h-[min(60vh,44rem)] p-2',
							listEdge === 'start' &&
								'[mask-image:linear-gradient(to_bottom,black_calc(100%_-_1rem),transparent)]',
							listEdge === 'middle' &&
								'[mask-image:linear-gradient(to_bottom,transparent,black_1rem,black_calc(100%_-_1rem),transparent)]',
							listEdge === 'end' &&
								'[mask-image:linear-gradient(to_bottom,transparent,black_1rem)]',
						)}
						onScroll={(event) => {
							const list = event.currentTarget;
							const atStart = list.scrollTop <= 1;
							const atEnd =
								list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
							setListEdge(atStart ? 'start' : atEnd ? 'end' : 'middle');
						}}>
						<CommandEmpty className="p-0">
							<EmptyState
								action={
									<Button onClick={() => setQuery('')} variant="ghost">
										Clear search
									</Button>
								}
								className="m-2">
								No matching commands.
							</EmptyState>
						</CommandEmpty>
						<CommandGroup className="[&_[cmdk-group-heading]]:px-2.5" heading="Actions">
							<CommandItem
								aria-keyshortcuts={directiveShortcut.ariaKeyShortcuts}
								className="min-h-11 gap-3 px-2.5"
								onSelect={() => runAction(onOpenDirective)}
								value="launch directive prompt project">
								<Play aria-hidden="true" className={commandIconClass} />
								<span className="min-w-0">
									<span className="block truncate font-medium">
										{highlightedMatch('Launch directive', query)}
									</span>
									<span className="block truncate text-xs text-muted-foreground group-data-[selected=true]:text-accent-muted-foreground">
										Send a free-text instruction to one project
									</span>
								</span>
								<PaletteShortcut shortcut={directiveShortcut} />
							</CommandItem>
							<CommandItem
								aria-keyshortcuts={refreshShortcut.ariaKeyShortcuts}
								className="min-h-11 gap-3 px-2.5"
								onSelect={() =>
									runAction(() => {
										void queryClient.invalidateQueries();
										toast.success('Refreshing data…');
									})
								}
								value="refresh current data reload">
								<RefreshCw aria-hidden="true" className={commandIconClass} />
								<span className="min-w-0">
									<span className="block truncate font-medium">
										{highlightedMatch('Refresh current data', query)}
									</span>
									<span className="block truncate text-xs text-muted-foreground group-data-[selected=true]:text-accent-muted-foreground">
										Invalidate cached API results
									</span>
								</span>
								<PaletteShortcut shortcut={refreshShortcut} />
							</CommandItem>
							<CommandItem
								className="min-h-11 gap-3 px-2.5"
								onSelect={() =>
									runAction(() =>
										setThemeMode(themeMode === 'dark' ? 'light' : 'dark'),
									)
								}
								value="toggle theme dark light mode">
								<ThemeIcon aria-hidden="true" className={commandIconClass} />
								<span className="min-w-0">
									<span className="block truncate font-medium">
										{highlightedMatch(
											themeMode === 'dark'
												? 'Switch to light mode'
												: 'Switch to dark mode',
											query,
										)}
									</span>
									<span className="block truncate text-xs text-muted-foreground group-data-[selected=true]:text-accent-muted-foreground">
										Update the control-panel theme
									</span>
								</span>
							</CommandItem>
						</CommandGroup>
						{projects.length > 0 ? (
							<CommandGroup
								className="[&_[cmdk-group-heading]]:px-2.5"
								heading="Projects">
								{visibleProjects.map((project) => (
									<CommandItem
										className="min-h-11 gap-3 px-2.5"
										key={project.id}
										onSelect={() =>
											runAction(() =>
												navigate(
													`/projects/${encodeURIComponent(project.routeId)}`,
												),
											)
										}
										value={`project ${project.name}`}>
										<FolderKanban
											aria-hidden="true"
											className={commandIconClass}
										/>
										<span className="min-w-0">
											<span className="block truncate font-medium">
												{highlightedMatch(project.name, query)}
											</span>
										</span>
									</CommandItem>
								))}
								{projectsAreLimited ? (
									<p className="px-2.5 py-2 text-xs text-muted-foreground">
										Showing {visibleProjects.length} of {projects.length}. Type
										to search all projects.
									</p>
								) : null}
							</CommandGroup>
						) : null}
						{navGroups.map((group) => (
							<CommandGroup
								className="[&_[cmdk-group-heading]]:px-2.5"
								heading={group.label}
								key={group.label}>
								{group.items.map((item) => (
									<CommandItem
										className="min-h-11 gap-3 px-2.5"
										key={item.to}
										onSelect={() => runAction(() => navigate(item.to))}
										value={`${item.label} ${group.label}`}>
										<item.icon
											aria-hidden="true"
											className={commandIconClass}
										/>
										<span className="min-w-0">
											<span className="block truncate font-medium">
												{highlightedMatch(item.label, query)}
											</span>
										</span>
										<NavigationPaletteShortcut route={item.to} />
									</CommandItem>
								))}
							</CommandGroup>
						))}
					</CommandList>
					<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/80 px-4 py-2.5 text-xs text-muted-foreground">
						<span className="font-medium text-foreground">Keyboard ready</span>
						<div className="flex flex-wrap items-center gap-3">
							<span className="result-dependent-hint inline-flex items-center gap-1 transition-opacity">
								<Keycap>↑</Keycap>
								<Keycap>↓</Keycap>
								Navigate
							</span>
							<span className="result-dependent-hint inline-flex items-center gap-1 transition-opacity">
								<Keycap>Enter</Keycap>
								Open
							</span>
							<span className="inline-flex items-center gap-1">
								<Keycap>Esc</Keycap>
								Close
							</span>
						</div>
					</div>
				</Command>
			</DialogPanel>
		</Dialog>
	);
}
