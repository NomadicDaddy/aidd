import { Link, useParams } from 'react-router';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { MarkdownContent } from '../../components/shared/MarkdownContent.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { getDocBody } from './docs-content.ts';
import { DEFAULT_DOC_SLUG, docSectionBySlug } from './docs-manifest.ts';
import { DocsSidebar } from './DocsSidebar.tsx';

export function DocsPage() {
	const params = useParams<{ slug?: string }>();
	const slug = params.slug ?? DEFAULT_DOC_SLUG;
	const section = docSectionBySlug(slug);
	const body = getDocBody(slug);

	useDocumentTitle(section ? `Docs · ${section.title}` : 'Docs');

	return (
		<div className="page-reveal space-y-5">
			<PageHeader
				description="Guides, how-tos, and reference for operating the aidd control panel."
				title="Docs"
			/>
			<div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
				<aside className="lg:sticky lg:top-4 lg:self-start">
					<DocsSidebar />
				</aside>
				<article className="min-w-0 rounded-lg border border-border bg-card p-5 sm:p-7">
					{body ? (
						<MarkdownContent markdown={body} />
					) : (
						<EmptyState
							action={
								<Link
									className="font-medium text-teal-700 underline underline-offset-2 dark:text-teal-300"
									to={`/docs/${DEFAULT_DOC_SLUG}`}>
									Back to Getting started
								</Link>
							}>
							No documentation found for “{slug}”.
						</EmptyState>
					)}
				</article>
			</div>
		</div>
	);
}
