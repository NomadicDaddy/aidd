import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { touchTargetRowClass } from '../../lib/touchTarget.ts';
import { DocsSidebar } from './DocsSidebar.tsx';

/** Documentation wayfinding shared by valid articles and an unknown documentation slug. */
export function DocsNavigationRail({ sectionTitle }: { sectionTitle?: string }) {
	return (
		<aside
			aria-label="Documentation navigation"
			className="@min-[45rem]:sticky @min-[45rem]:top-4 @min-[45rem]:self-start">
			<details className="group rounded-xl border border-border bg-card px-3 py-2 @min-[45rem]:hidden">
				<summary
					className={`flex cursor-pointer list-none items-center gap-1 py-1 text-sm font-medium text-foreground marker:content-none ${touchTargetRowClass}`}>
					<DisclosureMarker />
					<span className="text-muted-foreground">Docs · </span>
					{sectionTitle ?? 'All sections'}
				</summary>
				<div className="mt-3 border-t border-border pt-3">
					<DocsSidebar instance="compact" />
				</div>
			</details>
			<div className="hidden @min-[45rem]:block">
				<DocsSidebar framed />
			</div>
		</aside>
	);
}
