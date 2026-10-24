---
name: review
description: Review an existing codebase against naqsha's standards (security, correctness, tests, modularity, data and APIs, operability, performance, dependencies, docs) and map it once for every later plan. Read-only on the code. Writes a codebase map that /naqsha:plan and /naqsha:learn start from, and a ranked findings report on its own local webpage, where each finding can become a plan. Run as /naqsha:review [area | path].
argument-hint: "[area | path]"
disable-model-invocation: true
---

# Naqsha: review

You're reviewing a codebase the user already has, the way a senior engineer joining the
team would in their first week: how it runs, how it's built, what's solid, and what's going
to hurt. The output is a map that every later plan starts from, and a short list of findings
the user can trust, each one able to become a plan.

The request: $ARGUMENTS

The hook's message above ("Naqsha review: …") names the folder for this review, where the
codebase map goes, the earlier reviews with their open findings, and whether the map is
current. If it's missing, ask the user to send `/naqsha:review` as a message of its own.

## Rules

- **Read-only on the code.** You write only the map, `<plans>/LEARNINGS.md` and this
  review's folder. Never edit project files, commit, run migrations, deploy, write to a
  database, or call anything outside the machine except to look things up. Tests, linters
  and scanners may run when they write only build output and caches the project ignores.
  Installing a tool the project doesn't have (a scanner, an audit tool) needs the user's
  yes first; without it, that check is `unavailable`.
- **Every finding is verified.** You read the code at its `file:line` yourself. It has a
  concrete failure case (this input or situation leads to this wrong result), and says how
  it was verified. One you couldn't make concrete is a question, not a finding. One you
  reproduced (a failing test you wrote in the scratchpad, a command's output) is
  `confirmed`; one traced through the code but not run is `likely`.
- **Code that looks wrong may be there on purpose.** Before calling something a bug, read
  its history (`git log -L`, `git blame`, the commit and any issue it links).
- **Few and ranked beats many.** No generic findings ("add more tests", "improve error
  handling"): each names the code, the failure and the fix's direction. No style comments
  beyond what the standards say. At most about 30 findings. Below that, list the patterns
  ("12 more handlers with the same missing check") instead of each instance.
- **Say what's good too.** What the codebase does well is what plans should keep doing.
- **Say what you didn't check.** Areas left out, checks that couldn't run, code too large to
  read: name them. A clean report on half the code isn't a clean codebase.

## 1. Scope

- An area or path in the request narrows the review to it.
- Ask the user, in one AskUserQuestion call:
  - **Depth**, with your recommendation for this codebase's size:

    | | quick | standard (default) | thorough |
    |---|---|---|---|
    | Areas | security, tests, dependencies | those, plus correctness, modularity, data and APIs, operability | every area |
    | Subagents | 1 to 2 | up to 4 | up to 6 |
    | Running the app | no | no | start it and walk one main flow |

    Security is reviewed at every depth.
  - **What it's for**, which sets the ranking: shipping soon, handing over to a team, a
    security check, getting ready for a big change, or just a health check.

## 2. The map

The map is `<plans>/CODEBASE.md`, in the format in
`${CLAUDE_SKILL_DIR}/references/codebase-map.md`; read it now.

- **No map yet:** write it. Read the README, CLAUDE.md, AGENTS.md, CONTRIBUTING, the
  manifests and lockfiles, CI config, the directory layout and the entry points. In a large
  codebase, have Explore subagents (`model: "haiku"`, named from the list below) return
  `file:line` conclusions, one per part of the tree.
- **A map that's behind:** refresh only what the commits since it touched
  (`git diff --stat <its commit>..HEAD`), then update its commit line.
- **A current map:** read it and go on.

Every command in it is one you've seen work or the project's docs state. Mark the others
"not verified".

## 3. Baseline checks

Run what the project already has, with output to files in the scratchpad, reading the
summary and the failures: the test suite, the formatter check, linters, type checking, and
any security checks in CI. Then, where available: a dependency audit (`npm audit`,
`pip-audit`, `osv-scanner`, `cargo audit`, …), a secret scan over the history (`gitleaks
git`), and an outdated-dependency list. Record each in `checks` as pass, fail, unavailable
(the tool isn't there) or blocked (it needs something only the user has), with its result
line. A failing check is a finding only when it means something (a real vulnerable
version, a secret in history), not just because it's red.

## 4. Look, area by area

Send the areas in scope to parallel subagents, grouping small ones so you stay within the
depth's count. Name each with the next unused name from this list, in order: Atlas, Iris, Hermes, Athena, Orion, Nyx, Helios, Selene, Theia, Eos, Rhea, Leto, Apollo, Artemis, Hestia, Demeter, Castor, Pollux, Phoebe, Themis, Hyperion, Calypso, Ariadne, Perseus.
The name starts its description ("Athena · review security") and its brief, and you tell
the user who is reviewing what. Give each `model: "sonnet"`, the map's path, the scope, the baseline
results for its area, its standards (paths below, in
`${CLAUDE_PLUGIN_ROOT}/skills/build/references/` unless noted), and this brief:

```
You are [name]. Review [area] in [repo] against [standards files]; read them first. The codebase map is
[path]; start from it. Read-only: change nothing. Budget: about 40 tool calls.
Return at most 10 findings, the most serious first, each with: title; file:line for every
place it occurs (or the pattern and a count when it repeats); what's wrong; a concrete
failure case; how you verified it (code read, command run); severity (critical, high,
medium, low) with one line why; which rule it breaks (the standard's rule, OWASP or CWE
id); and the direction of a fix in a sentence, not code. Then what this area does well,
and what you didn't check. Under 800 words. Before calling odd code a bug, check its
history with git log -L or git blame.
```

| Area | Standards |
|---|---|
| security | `secure-coding.md`, and `${CLAUDE_PLUGIN_ROOT}/skills/plan/references/security.md` |
| tests | `tdd.md`: untested critical paths, tests that can't fail, skipped tests, tests that hit the real network |
| dependencies | the audit results; `secure-coding.md` on supply chain; unmaintained, abandoned, or a second library for a job one already does |
| correctness | `code-quality.md`: error handling, edge cases, races, resource leaks |
| modularity | `modularity.md` |
| data and APIs | `data-and-apis.md` |
| operability | `operability.md` |
| performance | `performance.md`: only on paths that are hot or loop over large data |
| docs and setup | `docs-and-setup.md`: does a fresh clone get running from the README |

## 5. Verify and rank

This is yours, not a subagent's.

- Read the code behind every critical and high finding yourself. Drop what doesn't hold,
  merge duplicates across areas, and downgrade what's real but unlikely.
- Severity: **critical** is exploitable or loses data now; **high** will cause an outage,
  breach or data loss under conditions that will happen; **medium** costs time or quality
  regularly; **low** is worth fixing when the code is touched anyway.
- Rank by severity, then by what the review is for, then by how much code depends on it.
- Pick the top risks (up to 5) for the summary, and say what to plan first and why.

## 6. Write the review and open it

Write `<review folder>/review.js` in the format in
`${CLAUDE_SKILL_DIR}/references/review-format.md`; read it now. Add any verified gotcha you
found (a setup step nobody wrote down, a test that needs a setting) to
`<plans>/LEARNINGS.md` as `${CLAUDE_PLUGIN_ROOT}/skills/plan/references/learnings.md`
describes. Then:

```
mkdir -p <review folder> && cp "${CLAUDE_PLUGIN_ROOT}/assets/review.html" <review folder>/index.html
node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.js" start <review folder> --open
```

Give the user the URL in one line. In chat, keep it short: the verdict in a sentence, the
top risks by id and title, what you'd plan first, and what you didn't check.

## 7. After the report

What the user sends from the page arrives like page answers do: run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.js" wait <review folder>` in the background, one
at a time; if it times out, tell them and stop, without restarting it on your own.

- **Plan a fix** for one or more findings: you can't start a plan yourself, so give them the
  command to type, for example
  `/naqsha:plan fix F2 and F5 from <review folder>`. Findings that touch the same code go in
  one plan.
- **Not a problem:** set the finding's `status` to `dismissed` with their reason in
  `statusNote`. If the reason shows you were wrong, say so.
- **A question:** answer from the code, with `file:line`.

Running `/naqsha:review` again later writes a new review, refreshes the map, and says which
earlier findings are now fixed (the code changed and the problem is gone) or still open.
