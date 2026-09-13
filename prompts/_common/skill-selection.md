## Skill selection and workflow coverage

Use the actual workflow contract. Never infer a skill's procedure from its name, description,
memory, or an earlier report. This applies to named skills and ordinary directives that refer to
skills or recipes.

- Read the inlined definition or the exact staged `.aidd/skills/<id>/SKILL.md` and its required
  references. For agent-installed skills, use the backend's permitted skill-loading mechanism.
  Record the source path or qualified skill identity and version/revision when provided; a shared
  name does not prove that a local adaptation matches upstream.
- Distinguish `absent` (checked permitted locations), `unreadable` (read failed),
  `invocation-restricted` (installed but policy prevents invocation), and `out-of-scope` (the
  workflow requires actions this run cannot perform). An omitted tool or catalog entry alone
  does not prove a skill is uninstalled. State what was checked and the actual result.
- Respect `disable-model-invocation: true` and other invocation restrictions. Do not bypass them
  by reading and executing the restricted workflow another way. Do not install or fetch an
  executable replacement unless the active instructions authorize that acquisition.
- Use a fallback only when the enclosing contract explicitly defines it for this task and its
  preconditions hold. Read that procedure and follow its checks and outputs. Record the exact
  fallback source, why it was selected, its covered scope, and any omitted work. A maintenance or
  review procedure does not count as executing a full interview or implementation skill.
- If the required contract is missing, incompatible, or has no applicable documented fallback,
  stop the affected work and report the blocker. Do not invent an equivalent procedure. Independent
  authorized work may continue, but unresolved required work makes the overall directive partial.
- When launching an existing recipe, use its actual recipe launch route after reading its
  definition. Do not replace it with a prose prompt claiming to replicate it. If the launch route
  is unavailable, report that limitation and the exact recipe to launch.
- Completion requires every requested deliverable and applicable check. A report, file timestamp,
  or commit alone does not establish complete workflow coverage. Never claim an upstream skill ran
  when only a scoped fallback ran, or claim full completion with unresolved required work.
