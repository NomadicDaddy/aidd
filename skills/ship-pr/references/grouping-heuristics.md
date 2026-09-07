# Grouping Heuristics

Draw commit boundaries on a sprawling working tree. The goal is a log that tells a true story, not the cleanest-looking one.

Pre-existing staged work is a fixed boundary, not another grouping signal. Preserve it as its own
bundle: do not unstage it, repartition it, or combine unstaged work with it even when the heuristics
below would normally pair those paths.

---

## Relatedness signals (group these together)

1. **Shared module / feature slice.** Files in the same feature directory (`src/features/billing/...`) usually move as a unit unless one is a cross-cutting refactor.
2. **Test + impl pairs.** `foo.ts` and `foo.test.ts` belong in the same commit. A reviewer running `git show <sha>` should see both.
3. **Rename + edit pairs.** Keep a rename with edits required by that rename. Split a mechanical
   rename from a substantial rewrite only when both commits remain buildable and the separation
   makes the history clearer.
4. **Config + consumer.** A new env var added to `.env.example` belongs with the code that reads it. A new dependency in `package.json` belongs with the file that imports it.
5. **Schema → derived types → data layer.** A migration, the regenerated types, and the
   repository/data-access edits are one chain. Split only at independently buildable, meaningful
   dependency boundaries; otherwise keep the chain together.
6. **Cross-layer feature slice.** A new feature touching schema + server function + UI is one
   _story_. Split it into ordered dependency steps only when every commit is independently buildable
   and reviewable; file count or commit size alone is not a reason to split it.

---

## Anti-signals (don't group these)

- **Same file, different concerns.** If one file mixes a bugfix and an unrelated feature, use
  `git add -p <file>` when the hunk boundaries are unambiguous; otherwise keep the file in one
  broader buildable bundle.
- **Same directory, different features.** Two unrelated features that happened to land in `src/components/` are two commits, not one.
- **"Drive-by" formatting.** A requested whitespace/lint sweep belongs in its own chore commit at
  the end. If it is outside the requested scope, leave it unstaged and report it; never discard
  user-owned edits.

---

## Anti-patterns (don't ever do these)

- **Alphabetical splits:** "commits A-M" / "commits N-Z." This tells no story.
- **N-files-per-commit:** "5 files per commit." This produces non-buildable intermediates.
- **One-commit-per-file:** fragments a coherent change into noise.
- **By directory depth:** `src/` vs `tests/` vs `docs/` regardless of feature. Separating tests from
  implementation leaves commits without the evidence needed to validate their behavior.

---

## Low-confidence fallback

If you cannot articulate a one-line rationale for a proposed group → the boundary is wrong.

**When grouping signal is weak, the rule is: merge, don't split.**

Concrete fallbacks:

- 2 candidate groups with overlapping rationale → 1 commit titled by the broader theme.
- A file you cannot place in any group → leave it unstaged and report it. Mystery files are usually
  accidental debug output, stray edits, or work from a different task.
- Whole working tree feels like "one feature with scaffolding" → 1 commit is the right answer. Don't manufacture a chain.

A commit log of 3 honest commits is better than 8 commits where 5 are guesses.

---

## Commit subject style

Match the repo's existing convention (read `git log -n 10 --oneline` first). Common conventions:

- **Conventional Commits:** `feat(scope): subject` / `fix: subject`
- **Plain imperative:** `Add billing webhook handler`
- **Prefix tags:** `[billing] Add webhook handler`

Don't switch styles mid-branch. If the repo uses Conventional Commits, all commits in this run use Conventional Commits.

Subject ≤72 chars. Imperative mood. No trailing period. Body only when the _why_ is non-obvious from the diff.
