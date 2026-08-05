import { MarkdownContent } from '../../components/shared/MarkdownContent.tsx';
import { proseMeasureClass } from '../../lib/typography.ts';
import { getDocBody } from './docs-content.ts';

/**
 * Renders one doc section inside the contextual help drawer. Kept in the docs
 * folder (not components/shared) so it bundles with the docs chunk and the
 * markdown payload only loads when the drawer is first opened.
 */
export function HelpDrawerBody({ slug }: { slug: string }) {
	const body = getDocBody(slug);
	if (!body) {
		return (
			<p className="text-sm text-muted-foreground">No help is available for this page yet.</p>
		);
	}
	// The drawer is usually narrower than the measure, but it carries the cap anyway: the renderer
	// no longer sets one, and a surface that forgets to is a surface whose lines run as wide as the
	// window happens to be.
	return <MarkdownContent className={proseMeasureClass} markdown={body} />;
}
