# NomBot: instructions for Claude

## Keep the README in sync with every commit
Before each commit, check the staged change against `README.md` (and `web/README.md` for code-map changes). In the same commit, update whatever the change affects:
- **Architecture** bullets: new components, data flow or external services. If the diagram (`docs/architecture-*.svg`, made with the `archify` skill) no longer matches, add or keep a `> Diagram out of date:` note naming the gap, and tell the user.
- **Changes from the plan** table: add a row when the commit adds, drops or reschedules something the plan didn't have, with the reason.
- **Progress** checkboxes, **Data** counts, **Stack**, **Success metrics** and eval results.
Change only what the commit affects, keep the style (short, tables, bold key terms) and never invent numbers. If nothing needs changing, say so in one line.
