import { MarkdownContent } from '../../components/shared/MarkdownContent.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';

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
		// The parent detail grid bounds the launch controls and gives this document the elastic track
		// when two panes fit. Prose blocks retain their reading measure inside the full-width card.
		<Card className="flex w-full min-w-0 flex-col gap-2">
			<CardHeader className="mb-0" headingLevel={3} title="Definition" />
			{/* SKILL.md is a markdown document and is read as one. Shown as raw source it would be
			    monospaced, reflowed mid-word to keep it on screen, with its `##` and `-` markers
			    left as literal characters — the operator reading the file rather than the document,
			    with its headings nowhere in the accessibility tree. Its own `#` title is dropped
			    because the catalog names the skill above this card.

			    No inner `max-h`: the detail column is the scrollport, and a 28rem window inside it
			    would mean scrolling a short box inside a tall one to read a document that already
			    has somewhere to go. */}
			<MarkdownContent baseLevel={4} markdown={body} measure="prose" variant="embedded" />
		</Card>
	);
}
