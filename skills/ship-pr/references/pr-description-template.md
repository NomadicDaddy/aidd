# Pull Request Description Template

Write a pull-request description that a reviewer can understand quickly. Brief the reviewer on the
behavior, motivation, risk, and verification rather than restating the diff.

## Template

```markdown
## What changed

<Describe the user-visible behavior or system capability in one to three sentences.>

## Why

<State the motivation in one or two sentences. If context does not reveal the motivation, describe
the work neutrally without inventing one.>

## Things to look out for

- <Call out a material risk from the risk scan.>
- <Identify subtle behavior that deserves reviewer attention.>
- <Identify behavior that lacks verification.>

<Omit this section when no material review risks exist.>

## Related

- Might address #<n>: _<issue title>_

<Omit this section when no strong matches exist.>

## Test plan

- [ ] <Name a concrete check tied to a changed behavior.>
- [ ] <Name another concrete check when needed.>
```

Do not add an attribution footer unless the user or repository explicitly requires one. Do not add a
commit list because the pull-request interface already provides it.

## Tone

- Describe behavior at a high level. Avoid file-by-file narration.
- Include one code example only when the change establishes a new project-wide pattern. Caption it
  `new pattern to follow`.
- Mention a path in prose only when it is itself a contract surface, such as `schema.sql`,
  `.env.example`, or a public API entry.
- Explain motivation when the diff does not reveal it.
- Name the actual area instead of saying `various improvements`, `miscellaneous`, or `cleanup`.
- Use direct, professional language without emoji or provider-specific attribution.

## Title

- Keep the title at most 70 characters.
- Use imperative mood.
- Omit a trailing period.
- Include an issue number only when the user supplied it.
- Use the single commit's subject when it already describes the pull request accurately.
- Synthesize a multi-commit title from the cumulative diff.
- Match the repository's established title casing.

## Draft criteria

Open a draft when:

- the user requests one;
- a commit subject marks the work as incomplete; or
- required test-plan items cannot yet be completed.

When the evidence does not establish readiness, publish the pull request as draft and state the
missing readiness evidence.
