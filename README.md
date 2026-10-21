# naqsha

*Naqsha* (نقشہ) is Urdu for map, plan or blueprint.

Plan before code. `/naqsha:plan <what to build>` makes Claude interview you, study your
codebase, research the industry-standard approach, and write a plan you steer decision by
decision. The plan is rendered as a local webpage. Project files stay locked until you
approve the plan; then Claude builds it step by step and asks you before changing it.

It works for a new app or for a feature in an existing codebase.

## What a plan contains

Summary and non-goals · requirements · what the existing codebase already has (with
`file:line`) · prior art: existing implementations of the same feature (open source,
shipped products, engineering write-ups), how each works, whether it holds up at industry
level, and a verdict (adopt / learn from / avoid) · research with sources · decisions with options, trade-offs, a recommendation,
and your choice · architecture, data model and interfaces · a threat model with
mitigations tied to steps · error handling, observability, performance, accessibility,
migration · new dependencies with license and health · testing and acceptance criteria ·
ordered steps with a runnable "done when" and low/likely/high estimates in human developer
hours · risks · what was deliberately left out · change log.

## Commands

| Command | Who | What |
|---------|-----|------|
| `/naqsha:plan <request>` | you | Start or resume a plan. Locks project files. |
| `/naqsha:approve [folder]` | you only | Checks the plan is complete (prior art recorded; no open decisions; every step has an estimate and a done-when check), marks it approved, and unlocks the project. |
| `/naqsha:build` | you | Build, or resume building, the approved plan. |

Claude can't run any of these itself. A typed command is the only way in.

## How the lock works

A plugin hook (`scripts/hook.js`) keeps state in `<project>/.naqsha/` (git-ignored). While
a plan is being drafted:

- Write/Edit/MultiEdit/NotebookEdit calls to anything in the project outside `docs/plans/`
  are denied, from the main session and from subagents. Symlinks are resolved first.
- After each Bash command, the project is compared to its state at the start of the turn
  (`git status` plus content hashes, or a file walk without git, and the commit HEAD).
  Any change outside `docs/plans/` is reported back to Claude, which must restore it. Your
  own edits between prompts are never reported.
- Claude's tools can't touch `.naqsha/` or invoke approval.

Limits, honestly: the hook stops an assistant from drifting into code. It is not a sandbox
against a process trying to evade it. Bash changes are caught and reverted after the fact,
not prevented. If `node` is missing or the hook crashes, it fails open and says so, so
a session is never stuck.

To leave planning without approving, delete `.naqsha/`.

## Install

Requires Claude Code and `node` on PATH.

```sh
claude plugin marketplace add ~/Projects/naqsha
claude plugin install naqsha@naqsha
```

To try it without installing: `claude --plugin-dir ~/Projects/naqsha`.

## Develop

```sh
npm test                         # hook tests (node:test, no dependencies)
claude plugin validate .
```

Files: `skills/plan` (planning workflow, plus `references/` for the plan format,
security method and estimating), `skills/build`, `skills/approve`, `scripts/hook.js`
(the lock), `assets/plan.html` (the page; it renders `plan.js` and reloads it every 3 s).

## Credits

Ideas adapted from two open-source Claude Code plugins:

- [ponytail](https://github.com/DietrichGebert/ponytail):
  - the "smallest solution first" checklist used in planning (does it need to exist → reuse
    → standard library → installed dependency → minimum code)
  - the "never cut" list
  - the build's ordered self-review (correct, safe, holds under load, tested, fast, lean),
    with callers checked and a concrete failing case for every finding
  - ending each report with what wasn't checked
- [caveman](https://github.com/JuliusBrussee/caveman):
  - a "why" behind every rule
  - non-goals, acceptance criteria and a stopping point for each step (`lean-build`)
  - each check reported as pass, fail, unavailable or blocked, and no polish once checks
    pass (`verify-and-stop`)
  - reproduce a bug first and fix it in the code responsible (`surgical-patch`)
  - every step leaves the project building, and refactors are kept apart from behavior
    changes (`safe-refactor`)
