import { MarkdownContent } from '../../components/shared/MarkdownContent.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { cn } from '../../lib/cn.ts';
import { proseMeasureCardClass } from '../../lib/typography.ts';

/**
 * The selected skill's SKILL.md, rendered as the document it is.
 *
 * Extracted from `SkillsPage` because that file crossed the 300-line ceiling, and this card is the
 * piece of it that stands alone: it takes one string and owns every decision about how a skill
 * definition is presented.
 */
export function SkillDefinitionCard({ body }: { body: string }) {
	return (
		// `gap`, not `space-y-2`: the header's own `mb-0` cancels a space-y margin outright, which
		// put the h3 and the first paragraph of the definition at the same y.
		//
		// The measure is the card's, the way the docs article's is. Capped on the prose child alone,
		// the card border kept the whole detail column: 1099px of a 1558px card was empty face to the
		// right of a 459px paragraph, so tightening the reading measure had only moved the void
		// inside the border instead of removing it.
		<Card className={cn('flex flex-col gap-2', proseMeasureCardClass)}>
			<CardHeader className="mb-0" headingLevel={3} title="Definition" />
			{/* SKILL.md is a markdown document and is now read as one. It was the last surface
			    showing raw source: monospaced, reflowed mid-word to keep it on screen, with its `##`
			    and `-` markers left as literal characters — the operator was reading the file rather
			    than the document, and its headings were nowhere in the accessibility tree. Its own
			    `#` title is dropped because the catalog names the skill above this card.

			    No inner `max-h`: the detail column is the scrollport now, and a 28rem window inside
			    it meant scrolling a short box inside a tall one to read a document that already had
			    somewhere to go. */}
			<MarkdownContent baseLevel={4} markdown={body} skipLeadingTitle />
		</Card>
	);
}
