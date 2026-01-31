## Prompt Selection Logic (lib/iteration.sh:590-777)

The CLI selects prompts using a priority cascade in determine_prompt():

1. Custom directive (--prompt flag) → user-supplied prompt
2. Audit mode (--audit flag) → dynamically built audit prompt
3. Completion pending state file → todo.md
4. TODO mode (--todo flag) → todo.md
5. VALIDATE mode (--validate flag) → validate.md
6. IN_PROGRESS mode (--in-progress) → in-progress.md
7. Onboarding complete? → coding.md
8. Existing codebase detected? → onboarding.md
9. Default (new project) → initializer.md

Steps 7-9 are the automatic routing — the rest are explicit user flags.
