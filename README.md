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
  validation at every boundary, no injection sinks, object-level access checks, tenant
  isolation enforced in one place with cross-tenant tests, an append-only audit trail for
  actions someone may need to prove, secrets out of code, standard crypto, safe files and
  outbound requests, resource limits, and a vetted supply chain. Claude never weakens a control on its own. Only you can accept a
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
  tests, and invariants get property tests. Tests are deterministic and hermetic, run
  against the same database engine as production (never SQLite standing in for Postgres),
  mocks only stand in for systems you don't own, and a test is never loosened or skipped to get
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

## Existing codebases

Changing code that other code relies on is where an existing project breaks. On top of
reading the code, its conventions and how it runs, naqsha does four more things:

- **Who relies on what changes.** For every existing function, endpoint, table, event,
  config key or file format the plan changes, the plan lists how its users were searched
  for, each user with `file:line`, and the step that updates it or why it still works.
  It also names what outside the repo could rely on it: other services, older mobile
  clients, webhooks, jobs. Approval is refused without this map, and each step's working
  set lists the callers it has to update.
- **The versions you have.** Research uses the versions the lockfile pins, not the latest.
  An upgrade happens only when the goals need it, as its own step. Each new dependency
  says what the project already has for the job (`overlap`); approval is refused without
  that, so you don't end up with a second HTTP client or date library.
- **A baseline for the checks.** Before the first step, the build runs the test suite,
  linters, type checks and security checks and records what already fails
  (`plan-tool.js baseline`). Steps are then held to adding nothing to that list, compared
  by name, instead of stalling on old red tests or "fixing" unrelated code. The baseline
  can't be retaken after a step is done, so a new failure can't be folded into it. The page
  shows it under Build.
- **History before removal.** Before changing or deleting code whose reason isn't visible,
  Claude reads its history (`git log -L`, `git blame`, linked issues). Problems that were
  already there in touched code are reported as `found:` with `file:line`, not fixed on the
  side; if the step can't be built safely without fixing one, it comes to you as a
  deviation.

## Contracts, operations and docs

Four shorter references cover what a strong team expects beyond the code itself:

- **Data and APIs** (`data-and-apis.md`): integrity enforced by database constraints; money
  as integers or decimals, instants in UTC, unguessable exposed ids; migrations done as
  expand and contract so they never break the running version; the API contract in the
  repo (OpenAPI 3.2, protobuf, GraphQL schema) and tested; RFC 9457 errors; every list
  paginated; idempotency keys for retried operations; additive-only changes within a
  version; signed, deduplicated webhooks; `202 Accepted` with a status resource for long
  operations.
- **Reliability** (`reliability.md`): correct when things fail, race and pile up. Writes to
  two systems go through a transactional outbox, consumers are idempotent because delivery
  is at least once, and workflows across services are sagas with compensations. No
  check-then-act: conditional updates, unique constraints or row locks, and a parallel test
  for each invariant. Locks have leases and fencing tokens; scheduled jobs run once, not
  once per server. Deadlines travel downstream; retries happen at one layer, only for safe
  operations, within a budget; circuit breakers, bulkheads and load shedding keep one slow
  dependency from taking everything down. Cache keys include the user or tenant, every
  entry expires, stampedes are coalesced, and the service still works with the cache down.
  Steps that touch queues, jobs, caches, locks or events load it, and at standard effort
  they get an independent review.
- **Operability** (`operability.md`): config validated at startup so a bad setting fails at
  boot; structured logs with a request id on every line, errors logged once; W3C trace
  context; metrics behind the plan's objectives; liveness and readiness checks; graceful
  shutdown; idempotent jobs with dead-lettering; jobs in users' local time that survive
  daylight saving; feature flags with a removal step; alerts on how fast the error budget
  burns, with a runbook entry each.
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

## Crew mode

At build start you choose how steps get built:

- **Solo:** Claude builds every step in the session.
- **Crew, one step at a time:** each step is built by a fresh worker agent in its own git
  worktree, and the session coordinates: it reviews, lands and talks to you. Its context
  stays small however long the plan is.
- **Crew in parallel:** up to four steps at once, when they share no files and the tests
  share no database or ports.

The discipline comes from [firstmate](https://github.com/kunchenguid/firstmate). Only the
coordinator talks to you and only it writes `plan.js`. Workers commit to their own branch
as they go, so their commits are their checkpoints. Each step lands only after the
independent review passes and the suite, security checks and a run of the app pass on the
build branch. Unlanded work is never thrown away without your word.
`scripts/crew.js` does the git mechanics: worktrees beside the repository, merge commits
onto a build branch (never `main`), conflicts aborted cleanly with instructions, and
`drop` refusing unlanded commits without `--force`. `plan-tool.js ready` picks the steps
that can start, keeping steps that share a file apart.

Every agent naqsha starts has a name from Greek myth, so you can follow who's doing what:
"Orion is building S5, Iris is reviewing S4, Hermes is researching on-device runtimes". A
step's worker and reviewer names come from its position in the plan, so they stay the same
after a handoff or a restart, and steps running side by side never share one. The names
appear in the agents' descriptions, in what Claude tells you, and in the step notes.

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
  patterns as the fallback). The independent reviewer reads the same ones for the step,
  and the finish review reads all of them. In crew mode the coordinator reads only the
  crew, review and run-the-app references, since it doesn't write code.
- **Output discipline.** Command output is saved to a file and only summaries and failures
  are read. Screenshots are viewport-sized and only where the look matters. Step notes
  hold excerpts, not logs.
- **Research in subagents.** Planning sends web research, prior art and large-codebase
  exploration to subagents that return condensed findings with sources, at most 2, 3 or 5
  of them by effort, each with a budget of about 15 searches and fetches.
- **The right model for the work.** Lookups (a version, a license, a spec sheet, where
  something lives in a large codebase) go to Haiku. Research that compares sources goes to
  Sonnet. Everything that decides or writes code stays on your session's model: the plan's
  design and recommendations, the build workers, and the independent reviewers. Run naqsha
  on Opus and the coding is Opus, while the legwork draws less of your limit.
- **Workers hand off before they grow.** A crew worker that passes about 60 tool calls
  commits at its next green and hands off; a fresh worker continues from its commits. Each
  call re-reads the whole context, so two short contexts cost much less than one long one.
- **No turn ends blind.** While a step is in progress, a Stop hook blocks a turn that did
  work from ending without a fresh checkpoint. It blocks once and lets a turn with no work
  (a question mid-build) end freely.
- **Checkpoints across compactions and sessions.** Inside a step, Claude writes a checkpoint
  at natural points (after each red and green, before long commands, before review, when
  waiting for you): what it did, which test is red, the next action, files in progress,
  open questions. After a compaction, resume or clear, the hook hands the step in progress
  back with its checkpoint, so work picks up where it stopped instead of starting over.
- **Project learnings.** `<plans>/LEARNINGS.md` is committed memory: verified facts the
  project taught that the code doesn't show (a test that needs a setting, a library that
  behaves unlike its docs), each with its evidence and date. It's read before planning and
  building, added to the moment a fact is verified, and pruned at the finish. Unlike Claude
  Code's own memory, it travels with the repository to your team and future plans.

## Answering on the page

The plan page is split into tabs (Overview, Questions, Requirements, Research, Design,
Security, Build, Change log) instead of one long scroll; it remembers your tab, and any
link on the page opens the tab it points into. It doubles as the questionnaire: Claude
puts each round of questions and decisions in the Questions tab, grouped into phases
("Who it's for", "Data and privacy", "Decisions"…) that you work through one at a time
with a progress stepper. Each item has options with pros and cons, Claude's
recommendation and why, a box for your own answer and one for notes. You answer at your own pace and press **Send to Claude**.
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

## When to use it, and what it costs

naqsha earns its cost on a feature or a new system. For a one-file fix, a copy change or a
dependency bump, just ask Claude directly; the plan itself will say so if you start one
for a small change.

Its cost is in work repeated per step, not in its instructions: planning reads about 25k
tokens of instructions once, and the build about 12k up front plus up to 6k as steps need
them. To keep a build inside a usage window, you choose an **effort** at plan start:

| | light | standard (default) | thorough |
|---|---|---|---|
| Research | only what the repo and you can't answer | each significant choice | wide |
| Independent review | steps that build a threat mitigation | those, plus data or API changes, concurrency or caching, and hot paths | every step |
| Running the app | baseline and finish | after each user-facing step | after each user-facing step |
| Crew mode | not offered | offered | offered |

The approval gate, the security rules, test-first and the finish review are the same at
every level. A reviewer reads only the step's working set and the references it lists,
not the whole plan. Nothing loops unattended: an unanswered questionnaire waits for you
instead of waking Claude every two hours.

## What a plan contains

Summary and non-goals · requirements · what the existing codebase already has (with
`file:line`) · prior art: existing implementations of the same feature (open source,
shipped products, engineering write-ups), how each works, whether it holds up at industry
level, and a verdict (adopt / learn from / avoid) · research with sources · decisions with options, trade-offs, a recommendation,
and your choice · architecture, data model and interfaces · a threat model with
mitigations tied to steps · error handling, observability, performance, accessibility,
migration · in an existing codebase, what relies on what changes · new dependencies with
license, health and what they overlap with · testing and acceptance criteria ·
ordered steps, each sized to review in one sitting, with the failing tests it starts from
and a runnable "done when" · what needs you (accounts, devices, reviews only you can do) ·
risks · what was deliberately left out · later milestones · change log.

## One piece at a time

AI agents tend to take on everything at once: one giant plan, a whole layer of code before
anything runs, five fixes stacked on a failing test. naqsha breaks the work down at every
level:

- **The request.** After the first questions, Claude splits the request into its parts,
  each with its riskiest unknown, and settles those first. A request bigger than about 12
  steps becomes milestones: this plan covers the thinnest version a user can actually use
  from start to end, and each later milestone is its own plan, made after this one is
  built, with real code in hand. The page lists them under "Later milestones".
- **The steps.** After setup comes a walking skeleton: the main flow working end to end,
  however thin. Then each step adds one behavior through every layer it needs, never one
  whole layer at a time, so every step can be run like a user would and a wrong assumption
  shows up early.
- **Inside a step.** One test, the code for it, run, then the next. Crew workers hand off
  before their context grows long.
- **When something fails.** Reproduce it with the smallest case, narrow it down (halve
  the input, the code path, or the history with `git bisect`), and test one guess at a
  time, undoing a wrong one before the next. After three wrong guesses, stop, re-read, and
  bring what was ruled out to you.

There are no hour estimates. Claude builds the code, so hours for a human developer would
be invented precision. The page shows the build's size instead, counted in Claude's work
(steps, independent reviews, app runs), and lists what needs you, which is where the
calendar time goes.

## Commands

| Command | Who | What |
|---------|-----|------|
| `/naqsha:plan <request>` | you | Start or resume a plan. Locks project files. |
| `/naqsha:design <what to design>` | you | Design the interface: direction, tokens, and live previews of every screen in every state, on its own page. Locks project files, like planning. |
| `/naqsha:approve [folder]` | you only | Checks the plan is complete (prior art recorded; no open decisions; every step has its failing tests and a done-when check), marks it approved, and unlocks the project. |
| `/naqsha:build [folder]` | you | Build, or resume building, the plan approved last. Name a folder to resume an earlier approved plan, such as one paused when you started a new plan. |
| `/naqsha:learn [folder or topic]` | you | Learn what was built and why: a guide on its own page, then taught in chat. Changes no code. |
| `/naqsha:review [area or path]` | you | Review an existing codebase against naqsha's standards: a map every later plan starts from, and ranked findings on their own page, each able to become a plan. Changes no code. |

Claude can't run any of these itself. A typed command is the only way in. Send each one as a
message of its own. If you mention `/naqsha:plan` or `/naqsha:build` mid-sentence, Claude
Code hands the skill to Claude instead, and the hook applies the same gate there;
`/naqsha:approve` only ever works typed.

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

## Learning what was built

You own the code naqsha builds, so `/naqsha:learn` teaches it to you. It writes a guide
next to the plan (`<plans>/<slug>/learn/`) and opens it on its own page: the big picture,
one key flow traced through the code, the modules, each technology and why it was chosen
over the alternatives, the data, the security defenses and where they live, the tests, how
to run and ship it, how to make the changes you're likely to make, and what was left out.
There's also a searchable file map and glossary, and each chapter has questions to check
yourself. Then Claude teaches it in chat, a chapter at a time, at your level, and answers
questions you send from the page.

Every "why" cites where it came from (your answer, a decision, a research source) or says
"not recorded"; it is never made up. Every "where" is checked against the current code.
It reads the plan through `plan-tool.js digest` (about a third the size of the plan) and
changes no project code. Without a naqsha plan it still works, from the code, its history
and its docs. Run it again after the code changes to bring the guide up to date.

## Designing the interface

`/naqsha:design` is the frontend's own command, separate from `/naqsha:plan`, with its own
page. It works with or without a backend plan, for web and native apps. Interfaces are where
AI slop shows first: the same card kit, Inter for everything, a gradient hero, only the happy
path, nothing that works from the keyboard.

**As creative as possible is the default.** The bar is the level of an Awwwards Site of the
Day: a distinct, unexpected look on every screen, motion that feels designed, and still
clean, precise and fast. A typical, interchangeable interface counts as a failure even when
it works; plain is something you ask for, never the fallback. The design gets there the way
the plan avoids assumed architecture:

- **From your users and their scene,** not the category: who uses it, on what device, in
  what light and what hurry; your brand; products you like and dislike, and why.
- **Screens with modes,** which decide how the creativity serves, never whether there is
  any: *persuade* and *experience* (landing pages, showcases) go all the way; *operate*
  (apps, dashboards, settings) is just as designed, in its composition, type, color and
  motion, while the task stays obvious and the controls recognizable; *read* sets type for
  the pleasure of reading. Every screen that shows data has its empty, loading and error
  states.
- **Inspiration from the best of the best:** Claude studies recent Awwwards winners (Sites
  of the Day, Month and Year, by category and by the animation, transitions and
  microinteractions tags) that fit the product's mood, plus the best products in its
  category, and takes ideas, never copies.
- **Two or three ambitious directions,** each with its composition, type, palette, motion
  language and signature moment, and a rendered preview of the key screen, animations
  running. You pick.
- **A motion language,** required for approval: view transitions that carry your place,
  controls that respond to every press, choreographed entrances, one signature moment,
  timed by motion tokens, with a calm reduced-motion version.
- **Tokens:** named colors with roles (contrast checked against the background on the
  page), type families and a scale, spacing, radii, shadows, motion, and a dark theme when
  the scene needs one.
- **Live previews of every screen in every state,** in the real fonts and colors, at phone,
  tablet and desktop width, in dark mode too, rendered in sandboxed frames from the design
  file. Comment on any screen and send it to Claude, like plan sections.
- **Defaults named and replaced.** Claude reviews its own previews against the list of AI
  defaults (identical cards, one radius and one shadow everywhere, gradient text, tracked
  uppercase eyebrows, emoji icons, the big-number hero, the same entrance on every section)
  and records each one it caught and what replaced it. The brief wins: if you ask for one of
  those looks, you get it.

**In an existing product,** creative doesn't mean ignoring the design system its users
know. Claude first records the system as the code has it: where the tokens or theme live
and the values used, the components with their paths and states, the fonts, icons and
motion, a screenshot of each screen the design touches, and the design debt (colors and
sizes outside the tokens, duplicate components, missing states). Then you choose the
approach:

- **Extend:** new screens inside the existing system, matching it exactly; the creativity
  goes into composition and motion, never new colors or fonts unless you ask.
- **Refine:** the same identity, visibly better: the debt fixed, the missing states and a
  motion language added, type and spacing tightened.
- **Redesign:** a new direction with the creative default in full, shipped in pieces: new
  tokens mapped from the old, components switched one at a time, screens behind a flag or
  theme switch so users never see half of each, and the old styles removed at the end.

Existing components are reused before new ones are designed, and every changed shared
component or token gets an impact map of the screens that use it. Each existing screen
shows **Now** beside its proposed states on the page. The build takes a visual baseline of
the screens the design touches and the ones it must not, so every difference after a step
is either intended or a regression.

`/naqsha:approve` refuses a design until it has a direction with its principles, its motion
language and the defaults it avoided, a token system with motion tokens, in an existing product the approach,
the current system and the impact map, every screen previewed in every state and built by a
step, a way to run the interface, and interface checks (accessibility, performance budgets).
`/naqsha:build` then builds it with the same gate, crew mode and checkpoints as a plan:
tokens into the project's styling system first, then components with all their states,
then a walking skeleton, then a screen at a time.

Every UI step, from a design or a plan, is held to `interface.md`, which builds on
Anthropic's frontend-design skill, Vercel's Web Interface Guidelines, Paul Bakaus's
Impeccable and Taste Skill:

- **Motion, clean and optimized:** view transitions (the View Transitions API on the web,
  shared elements on native), a response on every control, choreographed entrances
  instead of the same fade-up everywhere, one signature moment; durations and easings
  from tokens, springs or ease-out, interruptible, no layout shift; only compositor-friendly
  properties at 60 fps on a mid-range phone; WebGL only with a reason and a fallback.
- **The motion tools, chosen per stack:** CSS, `@starting-style` and the View Transitions
  API first (scroll-driven CSS only as an enhancement, since browser support is uneven);
  **Motion** (formerly Framer Motion, `motion/react`) for component animation in React and
  Vue; **GSAP** (free with every plugin) with ScrollTrigger, SplitText and Flip for
  timelines and scroll storytelling, cleaned up with `useGSAP`; Svelte, Angular and Vue's
  own transitions before a library; Lenis-style smooth scrolling only on persuade pages,
  off with reduced motion; Rive or Lottie for moving illustration; SwiftUI, Compose and
  Reanimated on native.
- **3D with Three.js where it applies:** proposed whenever 3D shows what a flat image can't
  (a product to turn or configure, a space, data with depth, an interactive story, a
  shader-driven signature), and skipped where it would slow a task. React Three Fiber and
  drei in React; `WebGPURenderer` with its WebGL 2 fallback and TSL shaders, both backends
  tested; glTF with Draco or meshopt and KTX2 textures inside a per-scene budget; 60 fps on
  a mid-range phone (capped pixel ratio, instancing, render on demand, paused off screen,
  everything disposed); a still poster or 2D version without WebGL, on weak devices and
  with reduced motion, with the same content as text and keyboard alternatives for every
  interaction; and a spike early in the build that proves the budget with the real
  assets. One
  tool per job, and every animation cleaned up when its view goes.
- **The floor:** WCAG 2.2 AA (contrast, keyboard, focus that's never covered, 24 px targets,
  text at 200%, reduced motion); every state; forms that keep input and focus the first
  error; navigation as links and state in the URL; tokens only, never raw values; copy in
  the product's words; locale formats and right-to-left layouts; Core Web Vitals budgets
  (LCP 2.5 s, INP 200 ms, CLS 0.1).
- **Verified by looking:** behavior and accessibility test-first, then screenshots at three
  widths and in dark mode for each state, compared with the approved previews. Claude fixes
  the three biggest problems and looks again, up to three rounds, then stress-tests (long
  names, emoji, right-to-left, 1,000 items, offline, a forced error, ten fast clicks,
  keyboard only).

## Reviewing an existing codebase

`/naqsha:review` is for code you already have. It works like a senior engineer's first week
on the team, and changes no project code.

- **A map, made once.** It writes `<plans>/CODEBASE.md`: how to set up, run, test and
  deploy (commands seen to work, or marked not verified), the layout, the architecture as it
  is, the conventions with `file:line` examples, what to reuse before writing anything new,
  the dependencies that matter, the tests, and the hotspots (files that change most, and
  which of them have no tests). It's stamped with its commit. `/naqsha:plan`,
  `/naqsha:learn` and the next review start from it, and the hook tells them how many
  commits it's behind, so only what changed gets read again.
- **Checks that actually ran.** The test suite, linters, type checks and the project's
  security checks, plus a dependency audit and a secret scan where the tools exist.
  Installing a missing tool needs your yes.
- **Findings against the same standards builds are held to:** security, tests,
  dependencies, correctness, reliability, modularity, data and APIs, operability, performance, docs,
  interface. You
  choose the depth (quick, standard, thorough) and what it's for, which sets the ranking.
  Security is reviewed at every depth. Subagents on Sonnet look, one per area; Claude reads
  the code behind every critical and high finding itself before it's reported.
- **Findings you can trust.** Each one has `file:line`, a concrete failure case, how it was
  verified (`confirmed` if reproduced, `likely` if traced), the rule it breaks, and the
  direction of a fix. Odd code's history is checked before it's called a bug. At most about
  30, with repeats grouped as patterns. The report also says what the code does well and
  what wasn't checked.
- **Its own page** (`<plans>/reviews/<date>/`): the verdict, top risks, what to plan first,
  then findings you can filter by severity, area and status, and search. Pick findings and
  send "Plan a fix", tell Claude one isn't a problem (with your reason), or ask about it.
  Claude can't start a plan itself, so it gives you the `/naqsha:plan fix F2 and F5 from
  …` command to type. The plan starts from those findings, re-checked against the code, and
  marks them planned.

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
- Claude can't change `.naqsha/` or invoke approval. Writes and edits there are denied, and
  so is running `claude` with the approve command from Bash; merely mentioning either (in
  docs, a commit message, a script) is fine. The hook keeps a copy of its state under
  `~/.claude/naqsha/`, and if a Claude command changes or deletes the state anyway, by any
  route, it's put back and Claude is told. To leave planning, delete `.naqsha/` yourself
  from a terminal.

Limits, honestly: the hook stops an assistant from drifting into code. It is not a sandbox
against a process trying to evade it. Bash changes are caught and reverted after the fact,
not prevented. Git-ignored folders (`node_modules/`, build output, test caches) aren't
checked, so a read-only test run doesn't trip the lock. Without git, only the first 20,000
files are checked, and the planning phase says so when a project is bigger. If `node` is
missing or the hook crashes, it fails open and says so, so a session is never stuck.

To leave planning without approving, delete `.naqsha/` from a terminal. A build that a new plan paused
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
security method, system design and learnings), `skills/build`, `skills/approve`, `scripts/hook.js`
(the lock), `scripts/plan-tool.js` (one step's working set and safe plan updates), `scripts/crew.js` (crew mode's worktrees and landing), `scripts/serve.js` (the page server), `assets/plan.html` (the page; it
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
