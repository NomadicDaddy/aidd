import { MarkdownContent } from '../../components/shared/MarkdownContent.tsx';
import { Card, CardHeader } from '../../components/ui/card.tsx';
import { useSkill } from '../../hooks/useSkills.ts';
import { toneText } from '../../lib/tones.ts';

/**
 * The selected skill's SKILL.md, rendered as the document it is.
 *
 * Extracted from `SkillsPage` because that file crossed the 300-line ceiling, and this card is the
 * piece of it that stands alone: it owns every decision about how a skill definition is presented.
 *
 * It fetches its own body by id. The catalog list no longer carries SKILL.md bodies, so this card is
 * the one place that asks for one, and only for the skill on screen.
 */
export function SkillDefinitionCard({ skillId }: { skillId: string }) {
	const detail = useSkill(skillId);
	const body = detail.data?.body ?? '';
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
			{detail.isPending ? (
				<p className="text-sm text-muted-foreground" role="status">
					Loading definition…
				</p>
			) : detail.isError ? (
				<p className={`text-sm ${toneText.red}`} role="alert">
					The definition could not be loaded: {detail.error.message}
				</p>
			) : (
				<MarkdownContent baseLevel={4} markdown={body} measure="prose" variant="embedded" />
			)}
		</Card>
	);
}
