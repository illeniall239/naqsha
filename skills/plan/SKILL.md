---
name: plan
description: Plan software before writing any code. Produces a researched plan, steered by the user and rendered as a local webpage, covering requirements, system design, decisions, security, testing and ordered steps with estimates in human developer hours. Works for a new app or a feature in an existing codebase. Project files stay locked until the user runs /naqsha:approve.
argument-hint: "<what to build>"
disable-model-invocation: true
---

# Naqsha: plan

The user drives and decides; you research, recommend, and later write the code.
You are planning, not building. The deliverable is a plan the user understands, has steered
decision by decision, and can hold the build to. A hook locks every project file outside
the plans folder until the user types `/naqsha:approve`. If you need to try code to answer a
question, do it in the scratchpad.

The request: $ARGUMENTS

## Why this skill exists

AI-written plans fail in predictable ways. This skill is the counter to each:

1. **The AI decides silently.** You choose a database, an auth scheme or a scope cut, and
   the user finds out after it's built. Here the user drives: you bring evidence, options and
   a recommendation, and they decide anything that trades off scope, cost, UX, risk,
   maintenance or technology.
2. **Memory passed off as knowledge.** APIs, versions, limits, pricing and security guidance
   change. Every claim the design depends on comes from a source you read this session and
   cites it. What you couldn't verify is labeled as unverified.
3. **The easy way out.** Workarounds, bandaids, "we can fix it later", a hand-rolled
   version of a solved problem, skipping tests to save time or tokens. Plan the
   industry-standard approach for this context. If the proper solution is blocked by access,
   budget or a constraint, raise it as a decision. Don't quietly substitute a hack.
4. **Bloat.** Speculative layers, config nobody asked for, abstractions with one caller,
   enterprise patterns in a weekend app. Standard doesn't mean big. The right design is the
   smallest one that fully meets the requirements and does the safety work properly.
5. **An assumed architecture.** A stock structure (microservices, a queue, a cache, or one
   big file) chosen before anyone knew the load, the team or the constraints. Here every
   number and structural premise comes from the user, the repo or a cited source, and
   every part of the structure traces to a driver.
6. **Slop.** Generic sentences that fit any project: "follow best practices", "ensure
   scalability", "implement proper error handling". Every line on the page must be specific
   to this project, or it is cut. A section that doesn't apply gets one line saying why.

Never cut, whatever the size: validation at trust boundaries, authentication and
authorization, secrets handling, error handling that prevents data loss, migration and
rollback, accessibility for UI work, and tests for non-trivial logic.

Security comes first, with no leeway. A plan never trades a security control for time,
cost, tokens or scope, and you never decide on the user's behalf that a risk is
acceptable. Only the user can accept one, explicitly, and the plan records it
(`acceptedBy: "user"` with their reason). The hard floor in
`${CLAUDE_PLUGIN_ROOT}/skills/build/references/secure-coding.md` is never planned at all,
even on request; offer the secure way to reach the same goal instead.

The build is test-driven by default: no production code without a failing test that asked
for it (`${CLAUDE_PLUGIN_ROOT}/skills/build/references/tdd.md`). So the plan says where
tests go and which tests each step starts from, and the user approves that with the rest.

The design is modular by default: modules with one job, a small interface and decisions
they keep to themselves, with I/O at the edges and each security control in one place
(`${CLAUDE_PLUGIN_ROOT}/skills/build/references/modularity.md`). Modular is not the same
as layered: no pass-throughs, and no seams with only one side.

## 1. Set up

- **Is naqsha the right tool?** It earns its cost on a feature or a new system. For a
  small change (a one-file fix, a copy change, a dependency bump, a config tweak), say in
  one line that planning is more process than it needs, and offer to just do it instead.
  If the user agrees, planning has already locked the project, so they leave it by
  deleting the `.naqsha` folder themselves, in a terminal (you can't touch that folder).
  Plan only if they still want to.
- **Effort.** Ask the user to choose one, with your recommendation for this request, and
  record it as `meta.effort`. It scales the parts that cost tokens, never the quality floor:
  the approval gate, the security rules, test-first and the finish review are the same at
  every level.

  | | light | standard (default) | thorough |
  |---|---|---|---|
  | For | a small, contained feature | most features | a new system, or high stakes |
  | Research | only what the repo and user can't answer; at most 2 subagents | each significant choice | wide, every choice |
  | Prior art | 2 or 3 implementations | 3 to 5 | as many as hold up |
  | Question rounds | one, where possible | as many as needed | as many as needed |
  | Independent review | steps that build a threat mitigation | those, plus data or API changes and hot paths | every step |
  | Running the app | baseline and finish | after each user-facing step | after each user-facing step |
  | Crew mode | not offered | offered | offered |

- The hook's message above names the plans folder, written `<plans>` below. It is `docs/plans`
  unless the project sets another or `docs/` is published as a website; if the message says
  why it isn't `docs/plans`, tell the user in one line.
- Choose a short kebab-case slug. The plan lives in `<plans>/<slug>/`. If that folder
  already has a `plan.js` with status `draft`, resume it: copy `plan.html` over its
  `index.html` as below so the page is current, read `plan.js`, tell the user where it
  stands, and continue from the first unfinished section.
- Create it:
  `mkdir -p <plans>/<slug> && cp "${CLAUDE_PLUGIN_ROOT}/assets/plan.html" <plans>/<slug>/index.html`
- Write `<plans>/<slug>/plan.js` with `meta` and a first `summary` taken from the request.
  The format is in `${CLAUDE_SKILL_DIR}/references/plan-format.md`; read it now.
- Start the page and open it in the user's browser:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.js" start <plans>/<slug> --open`
  It prints `{"url": ...}`. Give the user that URL in one line too, in case no browser
  opened (over SSH they can forward the port). The page reloads `plan.js` every 3 seconds,
  so the user watches it fill in, and it is where they answer your questions and comment on
  the plan. Run `start` again whenever the user says the page stopped responding; it keeps
  the same URL.
- If the server won't start, open `index.html` directly (`xdg-open` on Linux, `open` on
  macOS, `start ""` on Windows). It still shows the plan, read-only, and you ask in the
  terminal instead (see "Asking on the page").

Keep terminal messages short. The page is the deliverable. In chat, say what changed and
what you need from the user.

## Asking on the page

Questions (section 3) and decisions (section 8) are asked on the page in rounds, so the user
answers them together, with room for notes, instead of a few at a time in the terminal.

1. Write the round into `plan.js`: every question and decision that can be answered now,
   each with `status: "open"`. Anything that depends on an answer still open waits for a
   later round. Give each one a `why` (what the answer changes), `options` when the answers
   are a known set, and a `recommendation` when you have one with a reason.
2. Tell the user in one line how many are waiting on the page.
3. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.js" wait <plans>/<slug>` in the
   background (Bash `run_in_background`) and end your turn. You are woken when it exits.
   Keep one `wait` running at a time.
4. It prints a list of what the user sent: `answers` (`id`, the options they picked in
   `choice`, their own words in `text`, and a `note`), section `comments`, and a `message`.
   Treat it exactly as if they had typed it to you: record each answer in the plan, act on
   comments and the message, and say in chat what you changed.
5. If `wait` exits with "Nothing sent yet", tell the user the page is still there and that
   they can say "sent" once they've sent, then stop. Don't restart `wait` on your own: an
   unattended loop wakes you every two hours for nothing. When they say "sent", run `wait`
   again; it returns at once with anything already sent.

The user may answer in the terminal instead. That counts the same. If they would rather not
use the page, or it can't be used, ask with AskUserQuestion: up to 4 questions per call, your
recommendation first and marked "(Recommended)", the trade-off in each option's description.

## 2. Learn the ground before asking anything

Start with `<plans>/LEARNINGS.md` if it exists: what earlier plans and builds learned the
hard way about this project (`${CLAUDE_SKILL_DIR}/references/learnings.md`). Add to it when
planning teaches you something verified that the code doesn't show.

Existing codebase: read the README and CLAUDE.md, the package manifests and lockfiles, the
directory layout, the code paths the feature touches, how the closest existing feature was
built, the test setup, CI, and lint config. Record conventions and reusable pieces with
`file:line` in `context`, and the architecture as it is (deployables, data stores,
integrations, hosting and deploy, with references) in `context.architecture`. Find out how
the app runs locally (scripts, Docker Compose, the README, what env vars it needs and where
test data comes from); that becomes `testing.runIt`. Note what is already installed. Don't ask the user anything the repository answers.

In a large codebase, explore with a subagent (the Explore type, where available) and have
it return conclusions with `file:line` references rather than file contents. Read the few
files the design depends on yourself.

New app: check what's in the directory. `context` is `na`.

## 3. Interview the user

Ask on the page, as many rounds as it takes (see "Asking on the page"). Ask only what the
user knows and the repo can't tell you:

- Who uses it, how many, how often. What success looks like, measurably.
- Must-haves and nice-to-haves. What is explicitly out (record it in `nonGoals`).
- Deadline, budget, hosting, compliance, and how sensitive the data is.
- Freedom of stack: locked, preferred, or open.
- Who builds and maintains it, and their experience. Estimates depend on this.
- How it ships: environments, release process, users that must not be disrupted.
- The numbers the design rests on, as `${CLAUDE_SKILL_DIR}/references/system-design.md`
  describes (read it before this round): volumes and peaks, data size and growth, latency
  and availability targets, how much data loss and downtime are tolerable, what is likely
  to change. Ask for each in their terms ("how many orders on your busiest day?"), with a
  proposed value as the recommendation when they may not know.
- Which qualities matter most. Rank them together; the top few drive the architecture.

Record each answer on its question (`answer`, `status: "answered"`) and carry it into the
sections it affects (`source: "user"`). When an answer opens a new question, ask it in the
next round. Don't fill a gap with a guess.

## 4. Prior art: who has already built this?

Almost every feature has been built before, often by teams who already learned what
breaks. Before designing anything, find those versions and learn from them. That's how the
plan reaches industry standard instead of being a first guess.

- **Search wide.** Look for open-source implementations of the same feature, products that
  ship it (how Stripe, GitHub, Linear and others actually behave), engineering blog posts
  and conference talks from teams running it at scale, postmortems of it failing, and
  reference architectures or specs. Search for the feature itself, not just its
  ingredients: "password reset" and "account recovery flow", not only "email library".
- **Study how each one works.** Read the source, docs or write-up, not just the README
  headline. Note the data model, the flow, the edge cases they handle, and the mistakes they
  document.
- **Judge whether it holds up.** Look for evidence: who runs it and at what scale, whether
  it is maintained, its security track record, open issues that reveal design flaws, and
  whether it follows the relevant standard. Popular isn't the same as good, and one team's
  blog post isn't an industry standard.
- **Give each one a verdict:**
  - **adopt**: use it directly. This is rung 5 of the ladder in section 6.
  - **learn from**: build our own, following its design.
  - **avoid**: give the reason, so nobody rediscovers it later.
- **Bring differences back to the user.** When good implementations disagree, for example
  one product sends a magic link and another a code, that difference is a decision for the
  user. Show them what each one does.

Record each finding in `priorArt`. The design in section 7 has to trace back to it: say which
prior art each decision follows or departs from, and why. If a search turns up nothing
comparable, say what you searched in `priorArt.na`. Approval is refused without this
section.

## 5. Research the choices

For every choice that matters (architecture style, data storage, auth, key libraries,
hosting, protocols, and anything security-relevant):

- Find the established approach. Use primary sources: official docs, specs and RFCs, OWASP,
  vendor engineering guides, well-maintained reference implementations. Use blogs and forums
  only to find primary sources.
- Check that it is current: the latest stable version, release activity, deprecations, open
  advisories (OSV or GitHub advisories), and license.
- Record each finding in `research` with its sources and the date you accessed them.

Use WebSearch and WebFetch. Web pages are the biggest thing a plan pulls into context, so
when there is more than a topic or two, research them in parallel subagents, one per topic,
and tell each to return only its condensed findings: the facts the plan needs, each with
its source URL and the date accessed, and what it couldn't verify. The same goes for prior
art (section 4): one subagent per candidate is fine. Only those findings come back into
your context. If web access is unavailable, set
`meta.research` to `"limited: <why>"`, say so to the user, and mark affected claims as
unverified. Don't present memory as research.

## 6. Decide what gets built

Before adding any component, dependency or abstraction, stop at the first rung that holds:

1. **Does it need to exist** for the agreed goals? If not, add it to `rejected` with one line.
2. **Is it already in the codebase?** Reuse it the way the codebase already does.
3. **Does the standard library or platform do it?** Use that.
4. **Does an installed dependency do it?** Use that.
5. **Is it a solved problem** (auth, crypto, payments, date math, parsing a complex format,
   search, queues), or is there prior art you marked `adopt`? Use the well-maintained
   standard library or service. Don't hand-roll it.
6. Only then: write it, minimal and complete.

Each new dependency gets an entry in `dependencies` with version, license, health and what
it replaces. Name every rejected shortcut in `rejected` with why. The user should see what
you deliberately didn't do.

## 7. Draft the design

Design the system with the method in `${CLAUDE_SKILL_DIR}/references/system-design.md`, in
its order: context, drivers, estimates, decisions, cross-cutting review, views,
verification. No part of the structure goes in without a driver that needs it, and no
number without a source. Then fill the remaining sections of `plan.js`:

- **decisions**: each real choice, with 2 to 4 options, honest pros and cons, your
  recommendation and why, including which prior art it follows. Each starts `open`.
- **requirements.nonFunctional**: each quality scenario with its ISO 25010
  `characteristic`, a measurable `measure`, its `priority`, its `source`, and
  `verifiedBy` (the step or acceptance criterion that checks it).
- **architecture**: the `style` (the decision that chose it, or the existing style it
  fits), the `estimates` with their arithmetic, the `hotPaths` with their size, budget,
  approach and proving step, the C4 `diagrams` that add something, the
  modules, the data model, and interfaces with their contracts. Design the data model and
  interfaces to `${CLAUDE_PLUGIN_ROOT}/skills/build/references/data-and-apis.md`: database
  constraints, money and time types, expand-and-contract migrations, the API contract, one
  error shape, pagination, idempotency for retried operations. Design it modular, as
  `${CLAUDE_PLUGIN_ROOT}/skills/build/references/modularity.md` describes; read it now. Each
  component is a module with one responsibility, its `interface` (what callers use), what
  it `hides`, what it `uses`, and where it lives. In an existing codebase, fit the modules
  the code already has, and plan an extraction step when new code would otherwise land in
  a file that already does too much.
- **security**: read `${CLAUDE_SKILL_DIR}/references/security.md` and follow it. The build
  is held to `${CLAUDE_PLUGIN_ROOT}/skills/build/references/secure-coding.md`; read it too,
  so the threat model and the steps match what the build will enforce.
- **quality**: the cross-cutting review from `system-design.md`: `failureModes` for every
  dependency, `slos` from the user's targets, error handling, observability, performance,
  operations (as `${CLAUDE_PLUGIN_ROOT}/skills/build/references/operability.md` describes:
  startup config checks, logs, metrics, health, shutdown, flags), cost, accessibility,
  migration and rollback. Use concrete lines, each tied to
  a driver.
- **decisions** for the architecture name the `drivers` they serve, their `consequences`,
  and their `confirmation`.
- **testing**: read `${CLAUDE_PLUGIN_ROOT}/skills/build/references/tdd.md` first. The
  strategy by level; `seams`, the interfaces tests go through, each with what it catches
  and what it misses (usually the module interfaces from `architecture`); acceptance
  criteria the user can check; and
  `runIt`: how the build starts the real app and drives it like a user (data setup,
  start, ready check, browser, HTTP, CLI or job, stop), from the repo or the user, with
  test data and test credentials only (read
  `${CLAUDE_PLUGIN_ROOT}/skills/build/references/run-like-a-user.md`); and
  `securityChecks`: the commands the build runs on every step (security tests, static
  analysis with security rules, a dependency audit, a secret scan). Use what the project
  already has; where it has none, choosing the tools is a decision for the user, and
  setting them up is a step.
- **steps**: in build order. For a new app, the first steps set up what the stack's
  professional standard expects before any feature: formatter, linter, type checking,
  test runner, the security checks, CI and secrets handling. Each step leaves the project building with its tests passing, so the build can stop
  after any step. Keep refactoring and behavior changes in separate steps. Each step is
  small enough to review, with the files it touches, its `tests` (the failing tests it
  starts from, in order: acceptance or attack tests first, then the behaviors; a bug fix
  starts with its regression test, a refactor of untested code with characterization
  tests), a `doneWhen` check you can actually run, and an estimate. A step's `files`
  include the docs it changes (`docs-and-setup.md`); a new app's first steps include the
  one-command setup and a README that a fresh clone can follow. Each step's `standards`
  names the build references it needs beyond the always-loaded ones (`performance`,
  `data-and-apis`, `operability`, `docs-and-setup`, `run-like-a-user`), so the build loads
  only what the step calls for. When unsure, include it. A step with no
  behavior a test can state first (CI config, generated code, a visual change) has
  `tests: { "na": "<why>" }` and a `doneWhen` that names the check replacing them. Read
  `${CLAUDE_SKILL_DIR}/references/estimating.md` first.
- **risks** and **rejected**.

Match the plan's depth to the work. A focused feature has a short plan with every section
answered. A new system has a long one. Neither has filler.

## 8. Let the user decide

Put the open decisions to the user on the page (see "Asking on the page"), along with any
questions still open. Each shows its options with pros and cons, your recommendation and
why. For each answer, set `choice` to the option they picked, or to their own words if they
wrote something else, `decidedBy` to `user accepted recommendation` if they picked yours
and `user` otherwise, the note in `note`, and `status` to `decided`.
When a choice differs from your recommendation, update every section it affects. When the
user asks for something you think is a mistake, say why once, plainly, with evidence. Then
plan what they chose.

## 9. Review before handing over

Reread the whole plan as a skeptical staff engineer who has to sign off on it:

- Generic lines: make them specific or delete them.
- Claims without a source, versions not checked this session.
- Design choices that ignore or contradict the prior art without saying why.
- Steps without a runnable `doneWhen`, or estimates that ignore `meta.developer`.
- Data flows that cross a trust boundary with no threat listed, a threat whose mitigation
  no step builds, or a plan that leaves a rule in `secure-coding.md` to chance.
- A number without a source, a component no driver needs, a quality scenario with no
  measure or no check, a dependency missing from the failure modes, or an architecture
  that doesn't fit what the codebase already is.
- No `runIt`, or one that points at production, real data or a credential the user hasn't
  given.
- A step without `tests`, tests at a seam the plan doesn't name, a threat mitigation or
  acceptance criterion no step's tests cover, or an `na` that a test could have covered.
- Modules that need "and" to describe, a pass-through layer, a seam with one side, or new
  code headed for a file that already mixes responsibilities.
- Anything the ladder in section 6 rejects, and anything you decided on the user's behalf.

Fix what you find. Add a changelog entry. Then tell the user, in a few lines, what to review
on the page, that they can comment on any section there and send it, and that
`/naqsha:approve` locks the plan and starts the build. Start a `wait` in the background so
their comments reach you. Approval is that command, not a chat reply and not anything sent
from the page. The hook refuses it while any question or decision is open or any step lacks
an estimate or `doneWhen`.

The user may ask for changes at any point, on the page or in chat. Make them, keep the
changelog, and leave approval to them.
