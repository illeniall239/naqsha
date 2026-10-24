# Docs and setup, verified

A project that only the session that built it can run is slop, and docs nobody has followed
are fiction. The standard: a newcomer with a clean machine follows the README and has the
app running and tested, without asking anyone. You prove it by doing exactly that.

## Setup

- From a clean checkout to a running app in a few documented commands, using the project's
  own task runner (package scripts, Makefile, justfile, whatever it already uses):
  1. Install from the lockfile.
  2. Copy `.env.example` to `.env`.
  3. Start the dependencies (Docker Compose or similar).
  4. Run the migrations.
  5. Load synthetic seed data.
  6. Start the app.
- Tool versions are pinned where the stack supports it (`.nvmrc`, `.tool-versions`,
  `engines`, `rust-toolchain.toml`).
- Tests run with one command and no hidden setup.

## The README

What it is (a paragraph), prerequisites with versions, setup, run, test, the environment
variables (or a pointer to `.env.example`), a short map of where things live, and how it's
deployed (or a pointer). Nothing that will rot unread.

## Other docs, only where they earn their place

- **Keep the kinds apart** (Diátaxis): tutorials, how-to guides, reference and explanation
  don't share a page.
- **Generate reference docs from the source** where possible: API docs from the OpenAPI
  contract, CLI help from the parser.
- **Decisions:** the plan's decisions are the record, committed in the plans folder. Where
  code looks odd because of a decision, a one-line comment points to it ("see
  `docs/plans/export` D3").
- **Runbook:** one entry per alert and per failure mode in the plan: the symptom, what to
  check, the fix, and who to escalate to.
- **Changelog and versions:** a changelog for user-visible changes if the project keeps one
  (Keep a Changelog), and Semantic Versioning for libraries and public APIs.

## Same change, not later

Docs change in the step that changes the behavior they describe; the step's `files` include
them. A doc that describes something that doesn't exist yet, or a "TODO: document this", is
not allowed.

## Verify by following them

At the finish, and in any step that changes setup:

1. Clone the repository fresh into a temporary directory (or `git worktree add`), with no
   leftover files from your session.
2. Follow the README literally, with only the prerequisites it lists. Run every command as
   written.
3. Where a command fails or a step is missing, fix the docs or the scripts, then start over
   from step 1.
4. Run the examples the docs show, and doc tests where the stack has them.
5. Record in the notes: the commands followed, and that each worked or what you fixed.

## Review

- Could someone who wasn't in this session set it up, run it and test it from the README?
- Did the docs change in the same step as the behavior?
- Was the setup actually followed from a clean checkout, or only read?
