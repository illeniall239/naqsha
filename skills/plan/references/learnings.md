# Project learnings

`<plans>/LEARNINGS.md` is what this project taught you that the code doesn't show: facts that
cost real time to discover. It's committed, so the next session, the next plan and the rest
of the team start from it instead of rediscovering it. Claude Code's own memory stays on one
machine; this file travels with the repository.

## What goes in

A fact belongs here when all of these are true:

- **It cost time to find.** You hit it, debugged it, or had to read a lot to learn it.
- **The repository doesn't make it obvious.** If the README, a config file or a type would
  tell the next person, fix that instead; that's the better home.
- **It's verified.** You saw it happen. A guess isn't a learning.
- **It will matter again.**

For example:
- "Integration tests need `DATABASE_URL` pointing at a database with the `pgcrypto`
  extension."
- "Drizzle's `onConflictDoUpdate` doesn't fire the `updated_at` trigger."
- "The staging Postmark token rejects any address outside `@example.com`."

Not here: the plan's decisions (they're in the plan), a diary of what you did (git and the
step notes), secrets or credentials (never), or general knowledge about a library that
applies to every project.

## Format

Grouped by topic, one line per fact, with how you know and when:

```markdown
# Learnings

## Testing
- Integration tests need `DATABASE_URL` with the `pgcrypto` extension. Evidence: suite
  fails with `function gen_random_uuid() does not exist` without it. (2026-10-24, reset S2)

## Email
- The staging Postmark token only delivers to `@example.com`. Evidence: 422 for other
  domains. (2026-10-24, reset S4)
```

## Keeping it true

- Read it before planning (section 2) and before the first build step, once per
  conversation.
- Add a fact the moment you've verified it, not at the end, when it's forgotten.
- When a fact turns out wrong or stops applying, change or delete it in the same step.
  A stale learning is worse than none.
- Keep it short, about a hundred lines at most. At the finish, prune what no longer
  holds, and move anything that belongs in the README or a config comment there.
