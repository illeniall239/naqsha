# naqsha

*Naqsha* (نقشہ) is Urdu for map, plan or blueprint.

Plan before code. `/naqsha:plan <what to build>` makes Claude interview you, study your
codebase, research the industry-standard approach, and write a plan you steer decision by
decision. The plan is rendered as a local webpage. Project files stay locked until you
approve the plan; then Claude builds it step by step and asks you before changing it.

It works for a new app or for a feature in an existing codebase.

## System design from your application, not assumed

AI plans tend to reach for a stock architecture before anyone knows the load, the team or
the constraints. `skills/plan/references/system-design.md` makes Claude derive the
structure instead, in this order:

1. **Context**: in an existing codebase, the architecture as it is, read from the code.
2. **Drivers**: quality scenarios using the nine ISO/IEC 25010:2023 characteristics, each
   written SEI-style with a measurable response, ranked with you, plus your constraints.
3. **Estimates**: peak load, storage and growth, with the arithmetic shown.
4. **Decisions**: options weighed against those drivers, recorded MADR 4.0-style with
   consequences and how each will be confirmed. You choose.
5. **Cross-cutting review** against the Well-Architected pillars (AWS, Azure, Google):
   failure modes for every dependency, SLOs from your targets, deploy and rollback,
   observability, cost.
6. **C4 views** that add something, usually context and container diagrams.
7. **Verification**: every quality scenario is checked by a step or acceptance test.

No assumptions: every number and structural premise comes from you, the repository, or a
cited source. Anything else is asked on the page, with Claude's proposed value as the
recommendation. A cache, queue, extra service, orchestrator or second region goes in only
when a named driver needs it. Approval is refused while a quality scenario has no measure,
no source or no check, or while the architecture style is neither decided by you nor the
one the code already has.

Performance follows the same numbers. `skills/build/references/performance.md` judges cost
against the plan's estimates, not in the abstract: the plan names its hot paths (each with
an input size, a budget, the approach in queries, round trips, memory and complexity, and
the step whose benchmark proves it), and everything else is built for clarity without the
traps that grow quietly (a query per row, a list lookup in a loop, unbounded caches). On
untrusted input it designs for the worst case (ReDoS, hash flooding, parser depth), not the
average.

## Security first, test-driven, modular

The code Claude writes is held to three standards, in this order:

- **Security, with no leeway.** `skills/build/references/secure-coding.md` sets the rules for
  every line, following OWASP ASVS 5.0, the OWASP Top 10:2025 and the 2025 CWE Top 25:
  validation at every boundary, no injection sinks, object-level access checks, secrets
  out of code, standard crypto, safe files and outbound requests, resource limits, and a
  vetted supply chain. Claude never weakens a control on its own. Only you can accept a
  risk, and the plan page shows every accepted risk at the top before you approve. A short
  hard floor (secrets in code, disabled TLS verification, string-built SQL or shell
  commands, weak password storage, unsafe deserialization, unauthenticated data access)
  holds even if you ask. Every build step runs the plan's security checks (security
  tests, static analysis, dependency audit, secret scan), and a step with an open
  finding isn't done.
- **Test-driven by default.** `skills/build/references/tdd.md`: no production code without
  a failing test that asked for it. Each step runs outside-in: its acceptance or attack
  test first, then red, least code to green, refactor on green. Every red run is pasted
  in the step's notes, and code written before its test is deleted and rewritten. Bug
  fixes start with a regression test, refactors of untested code with characterization
  tests, and invariants get property tests. Tests are deterministic and hermetic, mocks
  only stand in for systems you don't own, and a test is never loosened or skipped to get
  to green. The plan names the seams tests go through and the failing tests each step
  starts from, so you approve them before any code is written.
- **Modular by default.** `skills/build/references/modularity.md`: every piece of code goes
  into a module with one responsibility, a small interface and decisions it keeps to
  itself. I/O stays at the edges, each outside system has one owner, and each security
  control lives in one place. Modular is not layered: no pass-throughs, and no seams with
  only one side. The plan names the modules, and the build puts code in them.

The approval gate enforces what a script can check. `/naqsha:approve` is refused while the
plan has no security section, a threat with no mitigation built by an existing step (and
not accepted by you), no security checks for the build to run, no test seams, a step that
doesn't list the failing tests it starts from (or say why none can come first), or a new
module without a responsibility and an interface.

## Contracts, operations and docs

Three shorter references cover what a strong team expects beyond the code itself:

- **Data and APIs** (`data-and-apis.md`): integrity enforced by database constraints; money
  as integers or decimals, instants in UTC, unguessable exposed ids; migrations done as
  expand and contract so they never break the running version; the API contract in the
  repo (OpenAPI 3.2, protobuf, GraphQL schema) and tested; RFC 9457 errors; every list
  paginated; idempotency keys for retried operations; additive-only changes within a
  version; signed, deduplicated webhooks.
- **Operability** (`operability.md`): config validated at startup so a bad setting fails at
  boot; structured logs with a request id on every line, errors logged once; W3C trace
  context; metrics behind the plan's objectives; liveness and readiness checks; graceful
  shutdown; idempotent jobs with dead-lettering; feature flags with a removal step; alerts
  on symptoms with a runbook entry each.
- **Docs and setup, verified** (`docs-and-setup.md`): a few commands from clean checkout to
  running app, a README with only what won't rot, docs changed in the same step as the
  behavior, and at the finish Claude clones the repo fresh and follows the README literally,
  fixing whatever doesn't work.

## Proven beyond tests

Passing tests don't prove the app works, and the author of a change is the worst person to
review it. So every build step is proven two more ways:

- **Run like a user** (`skills/build/references/run-like-a-user.md`). The plan records how
  the app runs (`testing.runIt`: test data, start, ready check, how it's driven, stop).
  Before the first step Claude starts it once as a baseline, so anything already broken is
  reported as inherited. After every step with user-facing changes it starts the real app
  and drives it: a browser for a UI, real HTTP requests for an API, the real command for a
  CLI, including the unhappy paths. It reads the screenshot, the console and the server log,
  not just the status code. A bug found this way gets a failing test before the fix. It
  never points at production or real data. At the finish it walks every acceptance
  criterion end to end.
- **Independent review** (`skills/build/references/independent-review.md`). Before a step
  is marked done, a fresh subagent with no stake in the code reviews it against the plan
  and the standards. It makes no edits, reruns the checks the notes claim pass, breaks key
  tests on purpose to prove they can fail, and reports only findings with a concrete
  failure case. Claude fixes blocking findings test-first or rebuts them with evidence;
  whatever is still disputed after three rounds comes to you. A separate fresh reviewer
  checks the whole change at the finish.

## Keeping the context lean

A long build degrades as its context fills, so naqsha spends context where it pays:

- **One step at a time.** The build never reads the whole `plan.js` per step.
  `scripts/plan-tool.js step` prints that step's working set: its tests and checks, the
  threats, quality scenarios and hot paths it owns, the modules it touches, one line per
  decision, and which references to read. That's about 500 tokens instead of a 9,000-token
  plan. `update-step` and `set-meta` change status and notes without rewriting the file,
  and can never mark a plan approved.
- **References by need.** Security, test-first, modularity, code quality and the review
  brief are always loaded. Performance, data and APIs, operability, docs and running the
  app load only for the steps that need them (`steps[].standards` in the plan, with file
  patterns as the fallback). The independent reviewer reads all of them in its own
  context, so nothing skipped goes unchecked.
- **Output discipline.** Command output is saved to a file and only summaries and failures
  are read. Screenshots are viewport-sized and only where the look matters. Step notes
  hold excerpts, not logs.
- **Research in subagents.** Planning sends web research, prior art and large-codebase
  exploration to subagents that return condensed findings with sources.
- **After a compaction**, the hook tells Claude exactly what to re-read and how to find its
  place.

## Answering on the page

The plan page doubles as the questionnaire. Claude puts each round of questions and
decisions on it: options with pros and cons, its recommendation and why, a box for your
own answer and one for notes. You answer at your own pace and press **Send to Claude**.
Claude records your answers, writes the plan from them, and asks a follow-up round only if
your answers opened new questions. Once the plan is written you can comment on any section
and send that too. Nothing you write is lost on a reload; it stays in your browser until
it is sent.

The page is served by `scripts/serve.js` on `127.0.0.1` only, behind a random key in the
URL, with a strict content security policy. Claude starts it with `serve.js start`, and
`serve.js wait` (run in the background) wakes Claude when you send. If the page can't be
used, for example over SSH without port forwarding, Claude asks in the terminal instead.

Approval is not on the page. Claude could send anything the page can send, so approving
stays a command only you can type.

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
| `/naqsha:build [folder]` | you | Build, or resume building, the plan approved last. Name a folder to resume an earlier approved plan, such as one paused when you started a new plan. |

Claude can't run any of these itself. A typed command is the only way in.

## Where plans go

Plans go in `docs/plans/<slug>/` and are meant to be committed. If `docs/` looks like a
published website (`docs/_config.yml`, `docs/CNAME`, `docs/index.html`, `mkdocs.yml`,
`docusaurus.config.*` and similar), they go in `plans/` instead, so a plan and its threat
model don't go public. GitHub Pages settings can't be seen from the repository, so if you
publish `docs/` without any of those files, set the folder yourself in
`.claude/naqsha.json`:

```json
{ "plansDir": "design/plans" }
```

The plans folder is the one place Claude may write while planning, so naqsha refuses a
folder that already holds anything other than plans and Markdown notes.

## How the lock works

A plugin hook (`scripts/hook.js`) keeps state in `<project>/.naqsha/` (git-ignored). While
a plan is being drafted:

- Write/Edit/MultiEdit/NotebookEdit calls to anything in the project outside the plans folder
  are denied, from the main session and from subagents. Symlinks are resolved first.
- After each Bash command, the project is compared to its state at the start of the turn
  (`git status` plus content hashes, git-ignored files by size and modification time, or a
  file walk without git, and the commit HEAD). Only what changed while the command ran is put down to it; Claude must undo that and
  is told how to do it safely (`git restore` only for files that had no uncommitted
  changes). A change made between commands, by you, your editor or a dev server, is
  reported once as not Claude's, and Claude is told not to undo it. Your edits between
  prompts are never reported. The hook's git calls take no optional locks, so they never
  rewrite `.git/index` under your own git commands.
- Claude's tools can't touch `.naqsha/` or invoke approval.

Limits, honestly: the hook stops an assistant from drifting into code. It is not a sandbox
against a process trying to evade it. Bash changes are caught and reverted after the fact,
not prevented. Git-ignored folders (`node_modules/`, build output, test caches) aren't
checked, so a read-only test run doesn't trip the lock. Without git, only the first 20,000
files are checked, and the planning phase says so when a project is bigger. If `node` is
missing or the hook crashes, it fails open and says so, so a session is never stuck.

To leave planning without approving, delete `.naqsha/`. A build that a new plan paused
resumes with `/naqsha:build <folder>`.

## Install

Requires Claude Code and `node` on PATH.

```sh
claude plugin marketplace add illeniall239/naqsha
claude plugin install naqsha@naqsha
```

Inside Claude Code, the same thing is `/plugin marketplace add illeniall239/naqsha`, then
`/plugin install naqsha@naqsha`. Start a new session to load it.

To update:

```sh
claude plugin marketplace update naqsha
claude plugin update naqsha@naqsha
```

## Develop

```sh
npm test                         # hook and page server tests (node:test, no dependencies)
claude plugin validate .
claude --plugin-dir .            # try local changes without installing
```

Installs stay on the `version` in `.claude-plugin/plugin.json`. Bump it with each release so
`claude plugin update` picks the change up.

Files: `skills/plan` (planning workflow, plus `references/` for the plan format,
security method and estimating), `skills/build`, `skills/approve`, `scripts/hook.js`
(the lock), `scripts/plan-tool.js` (one step's working set and safe plan updates), `scripts/serve.js` (the page server), `assets/plan.html` (the page; it
renders `plan.js`, reloads it every 3 s, and sends answers and comments when served).

## Credits

The test-driven and modular standards build on Matt Pocock's
[skills](https://github.com/mattpocock/skills) (`tdd`, `codebase-design`: seams, vertical
slices, deep modules, the deletion test) and Jesse Vincent's
[superpowers](https://github.com/obra/superpowers) (`test-driven-development`: watch it
fail, delete code written first), and add outside-in acceptance tests, attack-first
security tests, characterization, property, contract and mutation checks, and a record of
every red run.

Other ideas adapted from two open-source Claude Code plugins:

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
