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
`docs/plans/` until the user types `/naqsha:approve`. If you need to try code to answer a
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
5. **Slop.** Generic sentences that fit any project: "follow best practices", "ensure
   scalability", "implement proper error handling". Every line on the page must be specific
   to this project, or it is cut. A section that doesn't apply gets one line saying why.

Never cut, whatever the size: validation at trust boundaries, authentication and
authorization, secrets handling, error handling that prevents data loss, migration and
rollback, accessibility for UI work, and tests for non-trivial logic.

## 1. Set up

- Choose a short kebab-case slug. The plan lives in `docs/plans/<slug>/`. If that folder
  already has a `plan.js` with status `draft`, resume it: read it, tell the user where it
  stands, and continue from the first unfinished section.
- Create it:
  `mkdir -p docs/plans/<slug> && cp "${CLAUDE_PLUGIN_ROOT}/assets/plan.html" docs/plans/<slug>/index.html`
- Write `docs/plans/<slug>/plan.js` with `meta` and a first `summary` taken from the request.
  The format is in `${CLAUDE_SKILL_DIR}/references/plan-format.md`; read it now.
- Open `index.html` in the user's browser: `xdg-open` on Linux, `open` on macOS, `start ""`
  on Windows. It reloads `plan.js` every 3 seconds, so the user watches it fill in.

Keep terminal messages short. The page is the deliverable. In chat, say what changed and
what you need from the user.

## 2. Learn the ground before asking anything

Existing codebase: read the README and CLAUDE.md, the package manifests and lockfiles, the
directory layout, the code paths the feature touches, how the closest existing feature was
built, the test setup, CI, and lint config. Record conventions and reusable pieces with
`file:line` in `context`. Note what is already installed. Don't ask the user anything the
repository answers.

New app: check what's in the directory. `context` is `na`.

## 3. Interview the user

Use AskUserQuestion, up to 4 questions per call, as many rounds as it takes. Ask only what
the user knows and the repo can't tell you:

- Who uses it, how many, how often. What success looks like, measurably.
- Must-haves and nice-to-haves. What is explicitly out (record it in `nonGoals`).
- Deadline, budget, hosting, compliance, and how sensitive the data is.
- Freedom of stack: locked, preferred, or open.
- Who builds and maintains it, and their experience. Estimates depend on this.
- How it ships: environments, release process, users that must not be disrupted.

Write answers into the plan as they come (`source: "user"`). When an answer opens a new
question, ask it. Don't fill a gap with a guess.

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

Use WebSearch and WebFetch. Run independent topics in parallel with subagents when there are
several, and tell each one to return sources. If web access is unavailable, set
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

Fill the remaining sections of `plan.js`:

- **decisions**: each real choice, with 2 to 4 options, honest pros and cons, your
  recommendation and why, including which prior art it follows. Each starts `open`.
- **architecture**: components, data flow (a Mermaid diagram when there is more than one
  moving part), data model, and interfaces with their contracts.
- **security**: read `${CLAUDE_SKILL_DIR}/references/security.md` and follow it.
- **quality**: error handling, observability, performance, accessibility, migration and
  rollback. Use concrete lines.
- **testing**: the strategy by level, and acceptance criteria the user can check.
- **steps**: in build order. For a new app, the first steps set up what the stack's
  professional standard expects before any feature: formatter, linter, type checking,
  test runner, CI and secrets handling. Each step leaves the project building with its tests passing, so the build can stop
  after any step. Keep refactoring and behavior changes in separate steps. Each step is
  small enough to review, with the files it touches, a
  `doneWhen` check you can actually run, and an estimate. Read
  `${CLAUDE_SKILL_DIR}/references/estimating.md` first.
- **risks** and **rejected**.

Match the plan's depth to the work. A focused feature has a short plan with every section
answered. A new system has a long one. Neither has filler.

## 8. Let the user decide

Go through the open decisions with AskUserQuestion. Put your recommendation first, marked
"(Recommended)", and keep the trade-off in each option's description. Record `choice`,
`decidedBy` (`user`, or `user accepted recommendation`) and the user's reasoning in `note`.
When a choice differs from your recommendation, update every section it affects. When the
user asks for something you think is a mistake, say why once, plainly, with evidence. Then
plan what they chose.

## 9. Review before handing over

Reread the whole plan as a skeptical staff engineer who has to sign off on it:

- Generic lines: make them specific or delete them.
- Claims without a source, versions not checked this session.
- Design choices that ignore or contradict the prior art without saying why.
- Steps without a runnable `doneWhen`, or estimates that ignore `meta.developer`.
- Data flows that cross a trust boundary with no threat listed.
- Anything the ladder in section 6 rejects, and anything you decided on the user's behalf.

Fix what you find. Add a changelog entry. Then tell the user, in a few lines, what to review
on the page and that `/naqsha:approve` locks the plan and starts the build. Approval is
that command, not a chat reply. The hook refuses it while any decision is open or any step
lacks an estimate or `doneWhen`.

The user may ask for changes at any point. Make them, keep the changelog, and leave
approval to them.
