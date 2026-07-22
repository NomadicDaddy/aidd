# Recipes

A **recipe** is a file-backed, multi-step template. Each recipe is a single
file whose name is its id, and its steps run in order when you launch it.

## Step types

A recipe step is one of:

- **aidd-cli**: launch an aidd run.
- **skill**: run a catalog skill.
- **shell**: run a shell command.
- **recipe-ref**: call another recipe.

## Browsing and launching

The list lets you filter by recipe metadata, choose a target project, and start
the recipe. Starting a recipe creates one **pipeline session** that you can
follow on the **Pipeline sessions** page.

## Creating and editing

- **New recipe**: define an id, metadata, parameters, and an ordered list of
  steps.
- **Edit**: open a recipe to adjust its metadata, parameters, steps, hooks,
  and retry policy, or to delete or reload it.

## Tips

- Parameters let one recipe serve many projects: supply values at launch
  rather than hard-coding them into steps.
- Use `recipe-ref` steps to keep large workflows composed from smaller,
  reusable recipes.
