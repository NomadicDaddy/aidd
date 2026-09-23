---
name: humanize-docs
description: 'Review and edit documentation, release prose, and personal posts while preserving the author’s voice, factual scope, and required coverage. Use to remove AI-like structure or wording, improve readability, or adapt tone; this is the prose style contract for other documentation skills.'
metadata:
    aidd-category: metadata
---

# Humanize Docs

Preserve the author's voice and the document's purpose while making the changes the text needs.
Factual scope and required coverage take precedence over stylistic heuristics.

## Establish the source and voice

Read the requested text fully before editing. Identify what is worth preserving: distinctive
phrasing, useful detail, the author's position, and uncertainty that belongs to the account.

For voice matching, prefer user-approved examples or original passages whose history you can check.
An old publication date does not prove the current text is original. Check relevant revisions when
the corpus has already been rewritten. Do not treat this task's agent-written revisions as approved
voice samples unless the author accepts them.

When updating a corpus or voice reference, record authorship confirmations with their date and scope.
Use them instead of continuing to treat the same unsigned material as unverified. Keep authorship,
permission to include, editorial usefulness, and approval of a modern rewrite separate; confirmation
does not require including duplicates or attributing embedded third-party material to the author.

For first-person work or an explicit request to match the named author's explanatory voice, read
`personal-voice.md` beside this skill when present, or its staged copy at
`.aidd/skills/humanize-docs/personal-voice.md`. Use it only for the author it describes. Apply the
author's current preferences before inferring habits from historical samples. Read two or three
relevant source excerpts from the companion references; consult their originals when more context
or provenance is needed. A discovery catalog's editorial judgments are not the author's prose.
Do not load a whole archive for routine matching. If no reliable samples are available, preserve
the voice in the supplied text and state the limitation when voice matching matters. Do not
substitute a generic casual persona.

Choose the document's purpose before applying the editing guidance:

- **Personal narrative or retrospective:** select the details that carry the story, where the
  user permits cuts. Preserve viewpoint and the sequence of events.
- **Guide or reference:** preserve actionable coverage, exact constraints, and navigable structure.
  Headings, procedures, tables, and repeated field layouts may be necessary.
- **Release or operational prose:** preserve the required change coverage, versions, status,
  limitations, and instructions. Concision must not hide a breaking change or an unfinished task.

## Choose the amount of editing

- **Already effective:** leave it unchanged. A review does not require a diff.
- **Localized problems:** edit those passages. Keep good sentences and structure around them.
- **Heavily generated structure:** extract plain notes of the facts, scope, chronology, and a few
  details worth telling. Separately retain any original phrases worth keeping. Set the prose aside
  and redraft from those notes, then compare the result with the source.

Structural revision often does more than substituting words. A paragraph can lose all its filler
and still sound like a generated essay if it keeps the same analogy, contrast, and lesson ending.
Remove that unnecessary persuasion and symmetry. Do not deliberately make the writing rougher,
less grammatical, or harder to follow. Smooth writing is not itself a defect.

Read `examples.md` beside this skill when present, or its staged copy at
`.aidd/skills/humanize-docs/examples.md`, when deciding between a useful edit and overcorrection.
The examples distinguish historical source excerpts from proposed edits and invented
counterexamples. Use the relevant cases to judge decisions, not as phrases or paragraph shapes
to reuse. Disclose any authorized normalization of a source excerpt.

## Check facts and claim strength

Compare the revision with the evidence, not just with the wording it replaces.

- Preserve qualifications and distinguish observed results from general claims. A small successful
  test does not establish reliability everywhere. An option is not necessarily the default.
- Distinguish planned work, implemented behavior, and verified outcomes. Keep historical claims
  anchored to their period; do not silently rewrite an old account as a description of today.
- Watch certainty and causal language: "sealed", "safe", "impossible", "always", "because", and
  "this fixed it" can change a claim even when the sentence sounds natural. When a source
  overstates its evidence, narrow it to what is supported.
- First-person additions are claims too. Do not invent feelings, motivations, memories, or habits
  to make prose sound personal. Do not invent a workflow requirement or causal link to connect
  two facts. Attribution and viewpoint matter more than how often a paragraph says "I".
- Use available source evidence to resolve a material ambiguity. If that is insufficient, flag it
  or leave it explicitly uncertain. Do not turn a style edit into an unrelated technical audit.

Keep names, dates, links, code, commands, paths, and technical constraints intact unless the request
includes changing them or an evidence-backed correction is needed. Do not rewrite code blocks or
exact quotations for style. Check captions, alt text, and summaries too when they repeat a claim
being corrected.

## Remove imposed structure

These are diagnostic patterns, not proof of authorship or automatic deletion rules. Repetition and
density matter. Preserve an established author phrase or a necessary distinction even when its
shape appears here.

- **Lesson endings and identity slogans:** paragraphs repeatedly ending in quotable conclusions,
  such as "Silence is not proof" or "The metadata is the product". Usually report what happened
  and move on. An existing unfinished thought can be a sufficient ending.
- **Decorative contrasts:** repeated "X isn't Y, it's Z" constructions. Keep contrasts that explain
  a real difference, such as working-file isolation versus host access.
- **Analogies and punch fragments:** a fitted analogy in every section, or repeated clipped
  sentences for emphasis. Keep only those that genuinely help this author make this point.
- **Parallel packaging:** manufactured triads, numbered lessons, and self-pull-quotes. Remove the
  packaging when it repeats the prose. Do not distort a real three-item list or a required
  procedure to avoid its shape.
- **Uniform sections:** equal-length paragraphs, clever mini-headings, and every section resolving
  into an insight. Let the material determine the structure. Do not create deliberate rambling
  or insert uncertainty just to vary the rhythm.

In narrative prose, also check coverage and density:

- Choose the few events that carry the account instead of reproducing the whole run log. Drop
  secondary detail when allowed, but retain what the reader needs to understand the result.
- Keep the important measurements exact. Drop or plainly approximate supporting counts when
  precision adds nothing; do not round versions, thresholds, or numbers needed for a comparison.
- Short posts often need no subheadings. Longer pieces need headings where they help navigation,
  not at fixed word intervals.
- Use a table when its comparisons matter, and citations when the claims need support. Do not add
  them merely to make a personal post look comprehensive.

These narrative cuts do not apply where reference or release coverage must be complete. When the
user asks to retain detail, improve its presentation rather than silently removing it.

## Language and presentation

- Replace vague praise and filler with concrete actions: what changed, what failed, what remains.
  Avoid stock terms such as "leverage", "streamline", "seamless", and "a testament to" when they
  contribute no meaning.
- Prefer direct sentences and specific verbs. Keep technical terms that help the intended reader.
- Follow the established no-em-dash and no-en-dash style preference in editable prose. Use commas,
  parentheses, separate sentences, or a plain hyphen as appropriate. This preference is not an
  authorship test and does not authorize changing code or exact quotations.
- Remove decorative emoji; retain symbols that carry functional meaning.
- Do not manufacture slang, typos, ellipses, or parenthetical asides. Preserve them when they
  belong to the author and still work in context.
- Remove predictable wrap-ups and repeated takeaways when the text has already finished its job.

## Review the collection

For multiple files, inventory and review the full requested set. Sampling for a voice reference
does not replace reviewing the target files.

After individual edits, read the titles, openings, and endings across the batch. Look for repeated
confession-to-lesson arcs, recurring "X versus Y" titles, the same caveat, and variations of the same
closing moral. Do not replace all of them with a new stock ending such as "I still have work to do".

Check whether a guide is repeating a post's story at unnecessary length, or several posts are
retelling the same event. Preserve context needed for each to stand alone. Do not merge, delete,
or reschedule whole documents without authorization.

Consistent voice allows different lengths, levels of detail, and structures. A release note,
personal aside, and debugging story should not all read like the same essay.

## Acceptance and stopping

Before finishing, check:

- **Meaning:** facts, chronology, uncertainty, and claim strength match the evidence.
- **Voice:** retained passages and revisions fit the reference without manufactured personality.
- **Usefulness:** the reader still has the necessary detail, instructions, and limitations.
- **Structure:** unnecessary rhetoric is gone without removing useful navigation or precision.
- **File integrity:** for in-place edits, inspect the diff and preserve unrelated work, metadata,
  publication status, routes, links, and code. If an authorized change affects coupled fields
  such as a title and H1, keep them consistent. Run relevant existing format/content checks.

Judge these outcomes, not detector scores, rhetorical-device counts, or a target reduction in words.
Reading aloud is useful for catching an imposed cadence; it is not an instruction to make every
document sound conversational.

Stop when the requested problems are resolved. Do not keep rewriting acceptable prose merely
because another variation is possible. Report reviewed and changed files distinctly for a batch,
and disclose any unreviewed files or unresolved factual questions.

## Output

For supplied text and a rewrite request, return the revision only unless notes were requested.
For review plus rewrite, lead with the revision and keep notes brief. For named files and an
in-place editing request, save the changes and report their scope and validation. Do not add an
editorial report to the documents themselves or publish, commit, or update a voice reference unless
asked.
