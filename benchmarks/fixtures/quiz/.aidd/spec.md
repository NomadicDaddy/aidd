This fixture is a frozen snapshot of three aidd internal files. Your job is to
read them and answer four short questions about their contents. You have the
full read_file tool set; you should NOT invoke bash, write_file, or edit_file.

Files in scope (all under src/):

- src/tools-index.ts — a TypeScript module that registers tools by name
- src/config.ts — the zrun configuration loader, including a
  resolveActiveProvider function with a documented
  resolution-priority order
- src/manifest.json — the aidd benchmark manifest with "stacks" and
  "tasks" top-level arrays

Read the files, answer every question, and write your combined response to
.aidd/responses/quiz.md. Use `## Q1`, `## Q2`, `## Q3`, `## Q4` as
section headings so each answer is attributable.

Do not paraphrase. Where the question asks for identifiers (tool names,
labels, ids, priority rules), list them verbatim, one per line, with no prose
inside the answer section. Prose elsewhere is fine.
