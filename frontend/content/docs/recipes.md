# Recipes

A stored **recipe** is a file-backed workflow template with one or more ordered steps. Each stored recipe is one JSON file in aidd's local `recipes/` directory, and the filename is its id.

A one-shot skill launch is different: aidd wraps it in a synthetic, in-memory, single-step `skill:{id}` recipe so it can use the same pipeline runtime. Synthetic recipes do not appear in the Recipes catalog. See [Skills](/docs/skills) for one-shot skill launches. <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->

## Step types

A recipe step is one of:

`aidd-cli`
: launch a managed aidd run.
`skill`
: run a catalog skill as a managed run.
`shell`
: run a shell command, using the target project as its default working directory.
`recipe-ref`
: execute another stored recipe inside the same pipeline session.

## Browsing and launching

Search the catalog by recipe id, name, or description. Choose a target project, then start a recipe from its card or table row; opening **Details** does not require a project. Switch between **Card view** and **Table view** without changing the selected project. The launch form accepts recipe parameters and optional backend, model, and reasoning overrides, and can also take you to a scheduled-task form pre-filled with the recipe.

Starting a stored recipe creates exactly one **pipeline session**, whether the recipe has one step or many. Follow it in [Runs](/runs), or read more about [pipeline sessions](/docs/pipelines). <!-- check-docs-allow: app routes rendered by the panel, not files on disk; check-docs resolves link targets against the filesystem -->

## Creating and editing

New recipe
: define an id, name, description, parameters, and one or more ordered steps.
Edit
: adjust its name, description, parameters, step order, failure behavior, retries, and configuration or hook JSON. System recipe names are fixed and system recipes cannot be deleted; custom recipes can be deleted unless a non-archived scheduled task references them. **Reload** rereads the recipe's JSON file.

## Tips

- Parameters let one recipe serve many projects: supply values at launch rather than hard-coding them into steps.
- Use `recipe-ref` steps to keep large workflows composed from smaller, reusable recipes.
- A single-step stored recipe is valid when you need a named, schedulable workflow with recipe-level parameters. For a direct one-shot skill, launch it from **Skills** instead.
