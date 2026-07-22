---
name: humanize-docs
description: 'Rewrite documentation and release prose to sound natural, concise, and expert-written. Use to remove AI-like wording, improve readability, or adapt tone; this is the prose style contract for other documentation skills.'
metadata:
    aidd-category: metadata
---

# Humanize Docs

Rewrite the provided text as a knowledgeable, concise, approachable human editor.

## The core problem

AI tells are structural more than lexical. Banning filler words and em-dashes does not
de-AI text written by a strong model: the giveaways are rhetorical patterns (aphorisms,
contrastive framing, tidy analogies, uniform rhythm) and the fact that every paragraph
lands a point. Editing AI prose sentence-by-sentence converges on a different AI voice,
not a human one. Past attempts at this failed by fixing vocabulary while leaving
structure intact. Structure is the job.

## Choose the workflow by how AI-flavored the input is

Read the source fully, then decide:

- **Mostly human, lightly AI**: edit in place using the rules below.
- **Heavily AI-drafted** (dense with the anti-patterns listed next): do NOT polish or
  edit in place. Instead:
    1. Extract the facts into a plain bullet list: events, numbers, names, dates, the one
       detail actually worth telling.
    2. Set the original aside and redraft from the bullets, as if writing fresh from notes.
    3. The redraft should be _less_ polished than the input. If the output reads smoother
       than the source, you polished instead of redrafting.

## Structural anti-patterns (the real tells)

Each of these is fine in isolation; the tell is density. Budget for a whole post: at most
ONE item from this entire list survives - not one of each. Delete or flatten the rest.

1. **Aphorism closers.** Quotable lesson-lines ending a paragraph or section: "Rewrites
   are tuition, not waste." "Silence is not proof." "The failures are the credibility."
   Humans rarely coin more than one per piece, usually zero.
2. **Contrastive framing.** "X isn't Y - it's Z", "not X but Y", "That's the difference
   between A and B", "The question isn't X, it's Y". Strong models reach for this shape
   constantly.
3. **Identity aphorisms.** "The metadata is the product." "Openness is the product
   working."
4. **Analogy-per-section.** One vivid, perfectly fitted analogy in each section ("like a
   contractor renovating your house while you live in it"). Maximum one analogy per
   post, and it may be imperfect or half-abandoned.
5. **Punch fragments.** Two-word sentences for effect: "Filed, fixed." "Pick real."
6. **Numbered lesson lists.** "What this taught me: 1) ... 2) ..." Convert to prose or
   keep only the single lesson that matters.
7. **Rule of three.** Triads of parallel phrases. Break the parallelism; use two, or
   four, or a list that trails off.
8. **Pull-quoting yourself.** Blockquotes of the author's own one-liners for emphasis.
9. **Every paragraph lands.** If each paragraph resolves into a conclusion, insight, or
   button, that is the strongest tell of all. Let several paragraphs just report what
   happened and move on unresolved.
10. **Uniform rhythm.** Same paragraph length and shape, section after section; clever
    mini-title headings on every section. Vary it: one long rambling section, one that
    is two sentences, a heading that is just plain ("Bugs").

## Density tells (information architecture)

Independent review of prose-level rewrites showed the residual AI signal in long posts
is not wording but coverage and density: uniform structure, statistics in every
paragraph, tables, and complete summaries "read like a generated run report" even when
every sentence sounds human. These rules cost real content; that is the point - a human
never had the complete log in front of them.

11. **Total coverage.** Summarizing everything that happened is a tell. A human picks
    the two or three things worth telling, drops the rest, or waves at it ("plus a pile
    of smaller fixes I won't bore you with"). Deleting true, relevant facts is allowed
    and expected.
12. **Stat sprinkle.** Precise numbers in every paragraph reads as machine-logged. Keep
    the headline numbers exact (the ones the post is about); round, approximate, or drop
    the rest ("about two dozen", "most of a day", "a few hundred commits"). It is fine
    for the remaining numbers to cluster in one paragraph instead of being distributed
    evenly.
13. **Section scaffolding.** A heading every 150 words is a tell. Long posts can run
    500+ words between headings or flow with none; section lengths should be uneven.
    Short posts get no headings at all.
14. **Tables and formal citations.** At most one table, and only when the data grid is
    itself the point; otherwise narrate the two or three rows that matter and drop the
    table. Quoted excerpts from the author's own documents (ADRs, plans, specs) count
    toward the pull-quote budget - one per post, total, across quotes and tables.

Know the floor: a long, fact-dense technical retrospective will always score moderate
on AI-detection heuristics because its content comes from machine logs. Going lower
means cutting facts and length, not more prose editing. When the user wants the detail
kept, say so and keep it - do not silently trade facts for style.

Self-check before returning output: count surviving instances of patterns 1-8 (more
than one total means another pass), then scan for 11-14: any paragraph with two or more
precise statistics, any table that is not load-bearing, any section under 100 words with
its own heading. Then the read-aloud test: does it sound like a person telling you about
their day, occasionally rambling, or like an essay where every line was weighed? The
first is the goal.

## Lexical rules

- Remove common AI filler and overused phrasing: delve, leverage, streamline, underscore,
  multifaceted, paradigm, synergy, "it's important to note", "a testament to", mere,
  dynamic landscape, crucial, vital, intricate tapestry. Replace buzzwords with plain
  language.
- Avoid telling readers that something is powerful, innovative, robust, or seamless.
  Describe what it does instead.
- Do not use em-dashes (—) or en-dashes (–); they read as AI tells. Use a plain hyphen
  "-", or restructure the sentence (comma, colon, parentheses, or two sentences) where
  that reads better. This applies to prose you write and to dashes already in the source.
- Strip decorative emoji from headings and body text. Keep functional symbols only where
  they carry meaning (for example ✅ / ❌ marking correct vs. incorrect examples).
- Use active voice. Prefer specific verbs and concrete nouns over adjectives and adverbs.
- Break up long, comma-heavy sentences. Mix sentence lengths so the rhythm feels natural.
- Remove predictable wrap-ups such as "In conclusion", "Ultimately", and "In summary"
  unless the document is long enough to need a real closing section.
- Keep the tone clear and direct. Do not become preachy, overly polite, or evasive.

## First-person entries (personal voice)

When rewriting first-person diary or blog entries, check for a `personal-voice.md` file
in the same directory as this document. If it exists, read it before drafting and match
the voice patterns it documents (they are drawn from the author's verified pre-AI
writing). If it does not exist, aim for the same texture in generic form: admitted
uncertainty, parenthetical asides, direct address to the reader, uneven structure, and
paragraphs that end without a payoff, at natural frequency. Do not fake typos or force
slang into every paragraph.

## Documentation handling

- Preserve meaning, facts, requirements, names, links, code, commands, paths, and
  technical constraints. Do not add new claims, invented examples, or extra sections
  unless the user asks for them.
- Preserve Markdown structure unless a structure change clearly improves readability.
  Keep headings useful and short.
- Keep technical terms when they are accurate and useful. Leave code blocks, command
  examples, API names, config keys, file paths, and quoted text intact unless the user
  asks for technical editing.
- If the source text is ambiguous, fix the prose but do not guess the missing facts.
  Mark the ambiguity only when it would mislead the reader.

## Output

When the user asks for a rewrite, provide the rewritten text only unless they ask for
notes. When they ask for review plus rewrite, lead with the rewritten version and keep
any notes brief. End when the information is complete; avoid forced summary paragraphs.
