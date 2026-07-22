## Codebase comprehension quiz — four parts in one response?

Read the three source files bundled under `src/` and answer ALL of the
following in a single response. Do NOT answer them one at a time across
multiple turns — produce one combined answer.

Write your combined answer to `.aidd/responses/response1.md` with
exactly four sections, each headed `## Q1`, `## Q2`, `## Q3`, `## Q4` in that
order. Each section should contain ONLY the answer content — no restating of
the question, no preamble, no closing paragraph. For list-style answers, put
one identifier per line with no bullets, numbering, or decoration.

### Q1

Open `src/tools-index.ts`. List the exact value of every tool's `name` field.

### Q2

Open `src/config.ts` and locate the `resolveActiveProvider` function. The
JSDoc for that function documents the resolution priority for picking an
active provider, numbered highest-first. List those steps in order — one per
line — reproducing the key identifier for each step (the CLI flag name, env
var name, or config field name). Include all five steps.

### Q3

Open `src/manifest.json`. List the `label` value of every entry in the
top-level `stacks` array.

### Q4

Open `src/manifest.json`. List the `id` value of every entry in the
top-level `tasks` array.
