// The fast static subset (`bun run smoke:qc:fast`, also what `.githooks/pre-commit` runs):
// formatting, line-limit, types, and lint — no test suite, no builds, no slow project checks.
// This is the inner-loop gate: run it repeatedly while fixing errors, then run the full
// `bun run smoke:qc` once before commit.
//
// The order is measured, not intuited: it minimises the time a doomed tree takes to fail. Rank by
// cost ÷ P(fail) — cheap-and-flaky first, expensive-and-reliable last — since that is the ordering
// that minimises expected wasted time, not raw cost and not raw failure rate.
//
// Re-mine before changing. Failure counts are distinct runs (logs containing `[FAIL] <step>`) over
// `.aidd/iterations/*.log`; warm costs are the `durationMs` fields in `scripts/smoke-cache.json`.
//
//   step             warm cost   fails / 666 runs   cost ÷ P(fail)   (measured 2026-07-21)
//   check:max-lines     0.14s     28                    3
//   typecheck           2.67s     28                   64
//   format:check        2.88s     21                   91
//   lint                9.91s     23                  287
//
// History worth keeping: format:check used to run LAST here, on the rationale that it was the most
// expensive step at ~15.6s. That is no longer true — with prettier's `--cache` warm it is ~2.9s,
// cheaper than lint by 7s — so the old ordering spent lint's full cost before reporting a
// formatting error that was already known. spernakit's numbers differ in magnitude (its lint is
// ~27s) but rank identically, so both repos run this same order.
//
// leak-guard is not part of this subset: it scans the staged index diff (runtime state), so it is
// uncacheable-by-design and the hook keeps it as a direct call ahead of `smoke:qc:fast`.
export const FAST_QC_STEP_NAMES = ['check:max-lines', 'typecheck', 'format:check', 'lint'] as const;
