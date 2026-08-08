# Gate Conventions

A **gate** is a script a `check*` task runs to assert something about the repository and fail the
build when the assertion does not hold. aidd and spernakit have roughly sixty of them between them,
written over two years by whoever needed one, and they disagree on nearly every surface a caller
touches: how they are invoked, what their exit codes mean, where their findings go, and how a known
exception is recorded.

This document is the contract. Every gate in either repository conforms to it or is named in that
repository's `scripts/gate-conventions-allowlist.json` with a reason. `check:gate-conventions`
enforces the statically decidable half; the rest is enforced at review time, using the six-part
shape at the end of this document as the checklist.

The canonical copy of this file is `spernakit/docs/reference/gate-conventions.md`, which is where
the gate it describes is owned. The shared-core sync carries the document and the gate together
under its `gate-conventions` group, so an edit made to any other copy is silently overwritten the
next time that group is written.

## Why the conventions are worth the migration

Three costs motivated this, all of them measured rather than assumed.

**Gates nobody can test.** Fifteen gates run their work at module scope, most by calling `main()` on
the last line. Importing one runs it, so there is nothing a regression test can call, which is
exactly why so few of them have one. aidd's `check-artifact-parity.ts` already makes the argument in
its own header: _"a checker whose own failure paths are never executed is a checker nobody knows
still works."_

**Exit codes that mean different things in different scripts.** spernakit's gates are uniformly
binary, so a gate that crashed on a malformed input is indistinguishable from a gate that found a
real violation. The aidd release family already carries a third code. Rule 2 promotes it fleet-wide.

**Fifteen ad-hoc waiver designs.** Ten in aidd, five in spernakit, no two alike, several with no
place to record why the exception exists. Rule 7 replaces all of them with two forms, both of which
require a reason.

## The eight rules

### 1. Entry shape

A gate exports its runner and guards its invocation:

```ts
export async function runThing(root = repoRoot()): Promise<number> { … }

if (import.meta.main) {
	exit(await runThing());
}
```

Nothing imperative runs at module scope. A gate that calls `main()` on its last line cannot be
imported by a test, cannot be composed by another gate, and cannot be run twice against two
different roots, which is what a fixture-driven regression needs.

The `root` parameter is what makes the fixture possible: the test points the gate at a scratch
directory holding a deliberately non-conforming input and asserts on the real output. A gate with no
`root` seam can only be tested against the repository it lives in, where the answer is always "pass".

### 2. Exit codes

| Code | Meaning                            |
| ---- | ---------------------------------- |
| `0`  | Pass                               |
| `1`  | Findings                           |
| `2`  | Unexpected error, or bad arguments |

Code `2` is the one that is easy to get wrong. `parseArgs` throws on an unknown flag, and an
uncaught throw exits `1`, so a mistyped flag reports as a finding unless the gate catches it. A gate
that says "one violation" when it was actually invoked wrong is the confusion this rule exists to
end. Catch the parse error, print the usage line, and exit `2`.

Anything that is not a verdict about the repository is a `2`: a missing input file, an unreadable
config, a subprocess that did not run. Reserve `1` for "the repository is in a state this gate
rejects".

### 3. Output

Every human-facing line opens with a status tag: `[OK]`, `[FAIL]`, `[WARN]`, or `[SKIP]`. This is
already the plurality style; the rule makes it universal.

Findings go to **stderr**, one per line, in the form:

```text
- <path>:<line> <message>
```

The one-line summary goes to **stdout**, so a caller can capture the verdict without capturing the
detail. A gate whose findings and summary are interleaved on the same stream forces every consumer
to parse.

Emoji and other pictographs are banned. `check:gate-conventions` enforces the stricter, decidable
form of this: no pictograph anywhere in the gate's source. Whether a given string literal is
reachable by a `console` call is not answerable statically, and a gate whose source contains none at
all satisfies the rule trivially.

ANSI colour is allowed only when `stdout.isTTY && !process.env.NO_COLOR`. CI logs and captured
output are not terminals.

### 4. Arguments

`parseArgs({ strict: true })` from `node:util` is the only sanctioned parser. Reading `process.argv`
or `Bun.argv` by hand is a finding, and so is calling `parseArgs` without an explicit `strict: true`,
because a non-strict parse silently accepts a typo'd flag and runs with the default.

This also ends the `--` separator confusion. `bun run check:override-deltas -- --target-version X`
needs a separator that `bun scripts/check-override-deltas.ts --target-version X` does not, and the
two invocations currently disagree about which flags exist.

### 5. Anti-vacuity

A gate that examined zero items **fails**. A gate that passed **states how many items it examined**.

This is the rule with the most history behind it. A gate whose glob stopped matching, whose
directory got renamed, or whose discovery predicate quietly narrowed reports a pass, and a gate that
found nothing looks exactly like a gate that looked at nothing. The count in the success line is
what makes the regression visible:
`32 gates examined` dropping to `4 gates examined` is a defect a reader can see, where `[OK]` is not.

Zero examined items is always a defect in the gate, never a clean repository. If a gate can
legitimately have nothing to look at, it prints `[SKIP]` with the reason and exits `0`.

The count half of this rule is checked statically; the zero-items half is not. Whether a given run
reached nothing is a property of a code path, but whether the success line states a number is a
property of its text. `GC5` therefore reports any gate that **discovers** its population -- reads a
directory, runs a glob, or calls a `find*`/`collect*`-shaped helper -- and whose `[OK]` line
interpolates no quantity. A gate comparing a fixed pair named in its own source has no count to
state and is out of scope; requiring one there would produce more waivers than findings.

Name the quantity as a quantity. The check reads the interpolated expression, not the sentence
around it, and recognizes `.length`, `.size`, `.filter(...)`, and identifiers built from a count
vocabulary (`count`, `examined`, `scanned`, `files`, `rows`, `entries`, `packages`, and a handful
more, bare or camelCase). It does this rather than accept any interpolation because
`check-max-lines.ts` passes with `no file exceeds ${MAX_LINES} lines`, and that number is a
threshold, not a count of anything the gate looked at. A gate whose count lives in a domain noun --
`${workflows}`, say -- renames it (`${scanned}`) rather than taking a waiver; the count reads more
plainly for a human that way too.

### 6. Rule linkage

Every gate names the rule it enforces, in a header line:

```ts
/**
 * Enforces: ASSERT-050 (spernakit) / QUAL-006 (aidd) -- every gate follows the conventions in
 * docs/reference/gate-conventions.md.
 */
```

Cite the assertion ID where one exists. Both repositories keep an assertion catalog at
`.aidd/assertions.md`, and the ID is what connects a gate to the invariant it defends and to the
audit that will ask whether the invariant is still enforced.

The ID shapes differ by repository and that is fine. spernakit uses `ASSERT-###`; aidd uses five
prefixes (`BEH`, `DATA`, `QUAL`, `SEC`, `WEB`) across twenty-nine stable IDs that existing audit
reports already cite. Renumbering them would break every citation, so the convention accepts any
`[A-Z]{3,6}-###` shape rather than forcing one scheme onto the other repository.

A gate synced between both repositories names the ID each repository files it under, and the check
requires that **at least one** cited ID resolves in the repository it is running in. Requiring all of
them would make a shared gate unable to cite anything.

`.aidd/` is gitignored fleet-wide, so the catalog is absent in a fresh clone and in CI. There, the
`Enforces:` line is still required and only the ID resolution is skipped.

### 7. Waivers

Exactly two sanctioned forms:

**In-source line marker.** A comment on or above the offending line naming the rule and carrying a
reason. Use this when the exception belongs to one line and the reader of that line needs to know.

**Declared waiver file entry.** An entry in the gate's own waiver file, keyed by whatever the gate
examines, carrying a **mandatory** reason. The gate refuses to run when an entry has no reason; a
reasonless waiver is indistinguishable from an oversight, and it never gets removed because nobody
remembers what it was for.

Nothing else waives. In particular, a waiver file entry that has started passing is itself a
finding, so the list can only shrink. So is an entry naming something the gate no longer examines.

Budget files, `.templateoverrides`, and `templateOnly` in `scripts/smoke.json` are **not** waivers
and are unaffected by this rule. They are configuration: they say what the correct value is or where
a step applies, not that a known violation is tolerated.

### 8. `--json`

A gate does not have to offer `--json`. A gate that does emits this envelope and no other:

```json
{
	"examined": 32,
	"findings": [{ "line": 14, "message": "…", "path": "scripts/check-thing.ts", "rule": "GC1" }],
	"gate": "check:gate-conventions",
	"status": "pass"
}
```

`status` is `"pass"` or `"fail"`. `examined` is the same count rule 5 requires in the human summary.
The point is that one consumer can read every gate's JSON without a per-gate adapter.

## Enforcement

`scripts/check-gate-conventions.ts` (owner: spernakit, run in both repositories) enforces the
statically decidable rules. It reads `package.json`, follows every `check*` task to the `.ts` file it
runs, follows `bun run <task>` references transitively, and applies the rules to each file's source.

| ID    | Rule           | Statically enforced                                                        |
| ----- | -------------- | -------------------------------------------------------------------------- |
| `GC1` | Entry shape    | Yes: exported `run*`, `import.meta.main` guard, no module-scope statements |
| `GC2` | Exit codes     | Yes: every `exit(<literal>)` is `0`, `1`, or `2`                           |
| `GC3` | Output         | Partly: a status tag is present, and no pictographs anywhere               |
| `GC4` | Arguments      | Yes: no hand-read `argv`, and `parseArgs` carries `strict: true`           |
| `GC5` | Anti-vacuity   | Partly: a discovering gate's `[OK]` line states a count                    |
| `GC6` | Rule linkage   | Yes: an `Enforces:` line, and a cited ID resolves where the catalog exists |
| `GC7` | Waiver forms   | No: reviewed when the gate is migrated                                     |
| `GC8` | `--json` shape | Yes: if `--json` appears, all four envelope keys appear                    |

Rule 7 has no static form, and rule 5 has one for half of itself. A waiver design is recognizable
only by reading it, and whether a gate fails on zero items is a property of a code path rather than
of its text; both are checked by hand during the phase-2 migration of each gate, which is the point
at which someone is reading it anyway. Whether a success line states a count is text, so that half
is checked here. It was worth splitting: eighteen gates across the two repositories were passing
without saying what they had looked at, and every one of the six found earlier by hand would have
been caught by it.

The findings-to-stderr half of rule 3 is likewise deferred: a gate that calls `console.log` for
findings today is doing so from a code path the migration will replace wholesale, and flagging it
before the reporter exists would produce sixty findings with no available fix.

### The shrinking allowlist

Every gate that does not conform yet is named in `scripts/gate-conventions-allowlist.json`, keyed by
rule:

```json
{
	"excluded": {
		"scripts/run-bash.ts": "The bash shim, not a gate. Discovery reaches it because …"
	},
	"waivers": {
		"GC1": {
			"paths": ["scripts/check-thing.ts", "…"],
			"reason": "These gates run their work at module scope, most by calling `main()` …"
		}
	}
}
```

Keyed by rule, not by path, deliberately. Thirty gates do not each have their own story about why
they call `main()` at module scope; they have one story, and repeating it thirty times would make the
file unreadable and the reasons unmaintained.

Three things make the list shrink rather than sit:

- A waived rule that has **started passing** for a path is reported as a finding against the
  allowlist. Fixing a gate forces the waiver out.
- A waived path that is **no longer a gate** is reported.
- An excluded path that **no `check*` task reaches** is reported.

A waiver with no `reason`, or naming an unknown rule, or with an empty `paths` list, is a parse
error and exits `2`. The gate refuses to run rather than silently honouring it.

`excluded` is a different thing from a waiver: it removes a path from the population entirely,
because it is not a gate. Use it sparingly and say why in the reason.

## The six-part shape

This is the required procedure for changing any gate, in either repository. All six parts land in
the **same commit** as the change.

1. **Change the gate.**
2. **Extract its logic into `scripts/lib/<gate>/`.** The entry script parses arguments, calls the
   library, and prints. Everything decidable lives in pure functions the test can call directly.
3. **Add a `scripts/test-<gate>.ts` regression** that spawns the **real** command against a fixture.
   Not the library in-process: the real `bun run check:<gate>` against a scratch directory, asserting
   on its exit code and its actual output. A test that imports the library and calls it never
   exercises the argument parsing, the exit codes, or the output, which is where gates break.
   Include at least one deliberately non-conforming input and assert that it **fails**. A gate that
   is green because it found nothing is indistinguishable from a gate that is green because it looked
   at nothing.
4. **Classify the step in `scripts/lib/smoke-cache/steps-*.ts`.** Name every input the gate reads. A
   glob that names today's files rather than the directory lets the cache skip the run that would
   have seen tomorrow's.
5. **Add the step to `scripts/smoke.json` and regenerate `scripts/smoke.md`** with
   `bun run smoke:docs`. In aidd the equivalent is `scripts/lib/smoke-qc/steps.ts`, plus
   `FAST_QC_STEP_NAMES` in `fast-subset.ts` if the step belongs to the fast subset.
6. **Update `scripts/lib/template/classify.ts`** when file ownership changes, so derived apps
   classify the new files correctly.

Part 3 is the one that gets skipped, and parts 1 and 2 exist mostly to make it possible. A gate with
no `root` seam and no exported runner cannot have a fixture-driven regression, which is why fifteen
of them do not.

## Adding a new gate

A new gate conforms from the start; there is no grace period and no allowlist entry for it. That is
the entire point of enforcing the convention before migrating the existing gates. The allowlist
records what was already there on the day the meta-gate shipped, and it can only get smaller.

`scripts/check-gate-conventions.ts` is the reference implementation. It satisfies all eight rules,
including the two nobody checks, and is the shape every other gate is migrating toward.
