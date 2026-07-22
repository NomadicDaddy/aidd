---
name: prompt-guidelines
description: 'Apply coding-prompt engineering practices for task scoping, boundaries, phased workflows, stop conditions, output contracts, and context hygiene. Use when writing or reviewing prompts, specs, directives, recipe steps, or other agent instructions.'
metadata:
    aidd-category: general
---

# Prompt Guidelines

Apply prompt-engineering practices when authoring or reviewing any instruction artifact a coding
agent will consume: task prompts, feature specs, directives, recipe steps, skill bodies, and
review instructions.

## Workflow

1. Identify the prompt artifact and who consumes its output (a human or a script).
2. Triage rigor to blast radius: one sentence for trivial edits, a full task card for multi-file,
   behavioral, or risky work.
3. Read [the complete guidelines](references/GUIDELINES.md), selecting the sections relevant to
   the artifact.
4. Anchor to exact files, symbols, tests, and commands from the target project; frame bugs as
   current vs. expected behavior.
5. Define boundaries (allowed, forbidden, ask-before), validation commands, stop conditions, and
   the output contract.
6. Do not mutate the project during a review-only request.
7. Check the finished prompt against the pre-send checklist in the guidelines.

## Output

Summarize the rules applied, the prompt produced or the findings, exceptions, and validation
evidence.
