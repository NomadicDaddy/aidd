/* eslint-disable @typescript-eslint/no-misused-promises */
import { useQueryClient } from '@tanstack/react-query';
import { default as FolderKanban } from 'lucide-react/dist/esm/icons/folder-kanban';
import { default as Moon } from 'lucide-react/dist/esm/icons/moon';
import { default as Play } from 'lucide-react/dist/esm/icons/play';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { default as Sun } from 'lucide-react/dist/esm/icons/sun';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { useProjects } from '../../hooks/useProjects.ts';
import { commandPaletteShortcut } from '../../lib/keyboardShortcuts.ts';
import { useThemeStore } from '../../stores/themeStore.ts';
import { navGroups } from '../layout/nav-items.ts';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '../ui/command.tsx';
import { Dialog, DialogPanel } from '../ui/dialog.tsx';
import { Keycap, ShortcutChord } from './KeyboardShortcut.tsx';

interface CommandPaletteProps {
	onOpenChange: (open: boolean) => void;
	onOpenDirective: () => void;
	open: boolean;
}

export function CommandPalette({ onOpenChange, onOpenDirective, open }: CommandPaletteProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const themeMode = useThemeStore((state) => state.mode);
	const setThemeMode = useThemeStore((state) => state.setMode);
	const projectsQuery = useProjects();
	const projects = (projectsQuery.data?.projects ?? []).filter(
		(project) => !project.name.endsWith('.old'),
	);

	// Global Ctrl/Cmd+K toggle, available from anywhere in the app.
	useEffect(() => {
		function onKeyDown(event: globalThis.KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
				event.preventDefault();
				onOpenChange(!open);
			}
		}
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [onOpenChange, open]);

	const runAction = (action: () => void) => {
		onOpenChange(false);
		action();
	};

	const ThemeIcon = themeMode === 'dark' ? Sun : Moon;

	const iconFrameClass =
		'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-accent shadow-sm shadow-foreground/5';

	return (
		<Dialog
			aria-labelledby="command-palette-title"
			onClose={() => onOpenChange(false)}
			open={open}
			overlayClassName="items-start px-3 pt-[8vh] sm:pt-[10vh]"
			role="dialog">
			<DialogPanel className="w-full max-w-2xl overflow-hidden border-border bg-card/95 p-0 shadow-2xl shadow-accent/25 ring-ring/15 backdrop-blur-xl">
				<Command className="rounded-lg bg-transparent" loop>
					<div className="border-b border-border bg-gradient-to-b from-accent-muted/80 to-card px-4 pt-4 pb-3">
						<div className="mb-3 flex items-start justify-between gap-4">
							<div className="min-w-0">
								<div
									className="text-base font-semibold text-foreground"
									id="command-palette-title">
									Command palette
								</div>
								<div className="mt-0.5 text-xs text-muted-foreground">
									Jump to pages, projects, and high-frequency actions.
								</div>
							</div>
							<ShortcutChord
								className="pt-0.5"
								keyClassName="h-6 min-w-6"
								keys={commandPaletteShortcut.keys}
							/>
						</div>
						<CommandInput
							className="h-11 text-[0.95rem]"
							placeholder="Search navigation, projects, actions…"
							wrapperClassName="rounded-md border border-border bg-card/90 px-3 shadow-sm shadow-foreground/5 focus-within:border-accent focus-within:ring-2 focus-within:ring-ring/25"
						/>
					</div>
					<CommandList className="max-h-[min(27rem,58vh)] p-2">
						<CommandEmpty className="py-10 text-center text-sm text-muted-foreground">
							No matching commands.
						</CommandEmpty>
						<CommandGroup
							className="[&_[cmdk-group-heading]]:px-2.5"
							heading="Navigation">
							{navGroups.flatMap((group) =>
								group.items.map((item) => (
									<CommandItem
										className="min-h-11 gap-3 px-2.5"
										key={item.to}
										onSelect={() => runAction(() => navigate(item.to))}
										value={`${item.label} ${group.label}`}>
										<span className={iconFrameClass}>
											<item.icon aria-hidden="true" />
										</span>
										<span className="min-w-0">
											<span className="block truncate font-medium">
												{item.label}
											</span>
											<span className="block truncate text-xs text-muted-foreground">
												{group.label}
											</span>
										</span>
									</CommandItem>
								)),
							)}
						</CommandGroup>
						{projects.length > 0 ? (
							<CommandGroup
								className="[&_[cmdk-group-heading]]:px-2.5"
								heading="Projects">
								{projects.map((project) => (
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
										<span className={iconFrameClass}>
											<FolderKanban aria-hidden="true" />
										</span>
										<span className="min-w-0">
											<span className="block truncate font-medium">
												{project.name}
											</span>
											<span className="block truncate text-xs text-muted-foreground">
												Project control
											</span>
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						) : null}
						<CommandGroup className="[&_[cmdk-group-heading]]:px-2.5" heading="Actions">
							<CommandItem
								className="min-h-11 gap-3 px-2.5"
								onSelect={() => runAction(onOpenDirective)}
								value="launch directive prompt project">
								<span className={iconFrameClass}>
									<Play aria-hidden="true" />
								</span>
								<span className="min-w-0">
									<span className="block truncate font-medium">
										Launch directive
									</span>
									<span className="block truncate text-xs text-muted-foreground">
										Send a free-text instruction to one project
									</span>
								</span>
							</CommandItem>
							<CommandItem
								className="min-h-11 gap-3 px-2.5"
								onSelect={() =>
									runAction(() => {
										void queryClient.invalidateQueries();
										toast.success('Refreshing data…');
									})
								}
								value="refresh current data reload">
								<span className={iconFrameClass}>
									<RefreshCw aria-hidden="true" />
								</span>
								<span className="min-w-0">
									<span className="block truncate font-medium">
										Refresh current data
									</span>
									<span className="block truncate text-xs text-muted-foreground">
										Invalidate cached API results
									</span>
								</span>
							</CommandItem>
							<CommandItem
								className="min-h-11 gap-3 px-2.5"
								onSelect={() =>
									runAction(() =>
										setThemeMode(themeMode === 'dark' ? 'light' : 'dark'),
									)
								}
								value="toggle theme dark light mode">
								<span className={iconFrameClass}>
									<ThemeIcon aria-hidden="true" />
								</span>
								<span className="min-w-0">
									<span className="block truncate font-medium">
										{themeMode === 'dark'
											? 'Switch to light mode'
											: 'Switch to dark mode'}
									</span>
									<span className="block truncate text-xs text-muted-foreground">
										Update the control-panel theme
									</span>
								</span>
							</CommandItem>
							<CommandItem
								className="min-h-11 gap-3 px-2.5"
								onSelect={() => runAction(() => navigate('/runs'))}
								value="launch run start aidd">
								<span className={iconFrameClass}>
									<Play aria-hidden="true" />
								</span>
								<span className="min-w-0">
									<span className="block truncate font-medium">Launch run</span>
									<span className="block truncate text-xs text-muted-foreground">
										Open the run control surface
									</span>
								</span>
							</CommandItem>
						</CommandGroup>
					</CommandList>
					<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/80 px-4 py-2.5 text-xs text-muted-foreground">
						<span className="font-medium text-foreground">Keyboard ready</span>
						<div className="flex flex-wrap items-center gap-3">
							<span className="inline-flex items-center gap-1">
								<Keycap>↑</Keycap>
								<Keycap>↓</Keycap>
								Navigate
							</span>
							<span className="inline-flex items-center gap-1">
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
